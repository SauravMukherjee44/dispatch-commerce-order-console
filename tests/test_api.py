"""Run the HTTP API against an isolated SQLite database for each test."""

import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from server import Handler, OrderServer
from store import initialize


class OrderAPITests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.enterContext(patch.object(Handler, "log_message"))
        self.db_path = Path(directory) / "orders.sqlite3"
        self.start_server()
        self.addCleanup(self.stop_server)
        products = self.request("GET", "/api/products")[1]["products"]
        self.products = {product["sku"]: product for product in products}
        self.notebook = self.products["ST-101"]["id"]
        self.mat = self.products["ST-102"]["id"]
        self.mug = self.products["ST-103"]["id"]

    def start_server(self, *, demo=False):
        initialize(self.db_path, demo=demo)
        self.server = OrderServer(("127.0.0.1", 0), self.db_path)
        self.thread = threading.Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.01}
        )
        self.thread.start()

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method, path, body=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            encoded = json.dumps(body) if body is not None else None
            headers = {"Content-Type": "application/json"} if encoded is not None else {}
            connection.request(method, path, body=encoded, headers=headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def place(self, *lines):
        return self.request("POST", "/api/orders", {
            "items": [
                {"product_id": product_id, "quantity": quantity}
                for product_id, quantity in lines
            ],
            "total_cents": 1,
        })

    def transition(self, reference, status):
        return self.request("PATCH", f"/api/orders/{reference}/status", {"status": status})

    def stocks(self):
        products = self.request("GET", "/api/products")[1]["products"]
        return {product["id"]: product["stock"] for product in products}

    def simultaneously(self, operation):
        start = threading.Barrier(2, timeout=5)

        def run():
            start.wait()
            return operation()

        with ThreadPoolExecutor(max_workers=2) as workers:
            futures = [workers.submit(run) for _ in range(2)]
            return [future.result() for future in futures]

    def test_successful_multi_item_placement(self):
        code, order = self.place((self.notebook, 1), (self.mug, 1), (self.notebook, 1))
        self.assertEqual(code, 201)
        self.assertEqual(order["status"], "Placed")
        self.assertEqual(order["total_cents"], 6_000)
        self.assertEqual(order["units"], 3)
        self.assertEqual(
            [(line["product_id"], line["quantity"], line["subtotal_cents"])
             for line in order["items"]],
            [(self.notebook, 2, 3_600), (self.mug, 1, 2_400)],
        )
        self.assertEqual(self.stocks()[self.notebook], 3)
        self.assertEqual(self.stocks()[self.mug], 17)
        reference = order["reference"]
        self.assertEqual(self.request("GET", f"/api/orders/{reference}"), (200, order))

        code, listing = self.request("GET", "/api/orders?q=ord-100&status=Placed")
        self.assertEqual(code, 200)
        self.assertEqual([item["reference"] for item in listing["orders"]], [reference])
        self.assertEqual(listing["counts"]["Placed"], 1)
        self.assertEqual(self.request("GET", "/api/orders?status=Packed")[1]["orders"], [])

    def test_insufficient_stock_rejects_the_whole_order(self):
        before = self.stocks()
        self.assertEqual(before[self.notebook], 5)
        self.assertEqual(before[self.mat], 0)
        code, response = self.place((self.notebook, 2), (self.mat, 1))
        self.assertEqual(code, 409)
        self.assertIn("Cork Desk Mat has 0 available", response["error"])
        self.assertEqual(self.stocks(), before)
        self.assertEqual(self.request("GET", "/api/orders")[1]["orders"], [])

    def test_duplicate_lines_cannot_bypass_stock_validation(self):
        code, _ = self.place((self.notebook, 3), (self.notebook, 3))
        self.assertEqual(code, 409)
        self.assertEqual(self.stocks()[self.notebook], 5)
        self.assertEqual(self.request("GET", "/api/orders")[1]["orders"], [])

    def test_invalid_status_changes_leave_order_and_stock_unchanged(self):
        _, order = self.place((self.notebook, 2))
        reference = order["reference"]

        code, body = self.transition(reference, "Shipped")
        self.assertEqual(code, 409)
        self.assertIn("cannot move from Placed to Shipped", body["error"])
        self.assertEqual(self.request("GET", f"/api/orders/{reference}")[1]["status"], "Placed")
        self.assertEqual(self.stocks()[self.notebook], 3)

        self.assertEqual(self.transition(reference, "Packed")[0], 200)
        self.assertEqual(self.transition(reference, "Placed")[0], 409)
        self.assertEqual(self.transition(reference, "Shipped")[0], 200)
        self.assertEqual(self.transition(reference, "Cancelled")[0], 409)
        self.assertEqual(self.request("GET", f"/api/orders/{reference}")[1]["status"], "Shipped")
        self.assertEqual(self.stocks()[self.notebook], 3)

    def test_placed_cancellation_restores_stock_once(self):
        _, order = self.place((self.notebook, 2), (self.mug, 3))
        reference = order["reference"]
        code, cancelled = self.transition(reference, "Cancelled")
        self.assertEqual(code, 200)
        self.assertEqual(cancelled["status"], "Cancelled")
        self.assertEqual(self.stocks()[self.notebook], 5)
        self.assertEqual(self.stocks()[self.mug], 18)
        self.assertEqual(self.transition(reference, "Cancelled")[0], 409)
        self.assertEqual(self.stocks()[self.notebook], 5)
        self.assertEqual(self.stocks()[self.mug], 18)
        self.assertEqual(self.request("GET", f"/api/orders/{reference}")[1], cancelled)

    def test_competing_cancellations_of_packed_order_restore_stock_once(self):
        _, order = self.place((self.notebook, 2))
        reference = order["reference"]
        self.assertEqual(self.transition(reference, "Packed")[0], 200)
        responses = self.simultaneously(lambda: self.transition(reference, "Cancelled"))
        self.assertEqual(sorted(code for code, _ in responses), [200, 409])
        self.assertEqual(self.stocks()[self.notebook], 5)

    def test_concurrent_placements_cannot_oversell(self):
        responses = self.simultaneously(lambda: self.place((self.notebook, 4)))
        self.assertEqual(sorted(code for code, _ in responses), [201, 409])
        self.assertEqual(self.stocks()[self.notebook], 1)
        self.assertEqual(len(self.request("GET", "/api/orders")[1]["orders"]), 1)

    def test_invalid_product_ids_and_quantities_are_rejected(self):
        invalid_lines = ((self.notebook, 0), (self.notebook, -1), (self.notebook, True),
                         (self.notebook, 2.5), (9999, 1), ("1", 1))
        for line in invalid_lines:
            with self.subTest(line=line):
                self.assertEqual(self.place(line)[0], 400)
        self.assertEqual(self.place()[0], 400)
        self.assertEqual(self.stocks()[self.notebook], 5)
        self.assertEqual(self.request("GET", "/api/orders")[1]["orders"], [])

    def test_orders_and_stock_survive_restart(self):
        _, order = self.place((self.notebook, 2))
        reference = order["reference"]
        code, packed = self.transition(reference, "Packed")
        self.assertEqual(code, 200)

        self.stop_server()
        self.start_server()
        self.assertEqual(self.request("GET", f"/api/orders/{reference}"), (200, packed))
        self.assertEqual(self.stocks()[self.notebook], 3)
        self.assertEqual(self.transition(reference, "Cancelled")[0], 200)

        self.stop_server()
        self.start_server()
        self.assertEqual(self.transition(reference, "Cancelled")[0], 409)
        self.assertEqual(self.stocks()[self.notebook], 5)

    def test_demo_seeding_does_not_repeat_or_reset_stock(self):
        self.stop_server()
        self.start_server(demo=True)
        before = self.request("GET", "/api/orders")[1]
        self.assertEqual(before["counts"], {"Placed": 3, "Packed": 2, "Shipped": 2, "Cancelled": 1})
        stocks_before = self.stocks()
        self.assertLess(stocks_before[self.mug], 18)
        self.stop_server()
        self.start_server(demo=True)
        self.assertEqual(self.request("GET", "/api/orders")[1], before)
        self.assertEqual(self.stocks(), stocks_before)


if __name__ == "__main__":
    unittest.main()
