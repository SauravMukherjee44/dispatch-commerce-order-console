"""Run the local Commerce Order Console and its JSON API."""

import argparse
import json
import mimetypes
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from store import (
    OrderError, change_status, database, get_order, initialize, list_orders,
    list_products, place_order, validate_items,
)


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
ORDER_ROUTE = re.compile(r"/api/orders/(ORD-[0-9]+)(/status)?", re.IGNORECASE)
CATALOGUE_ASSET = re.compile(r"/catalogue/[a-z]+\.webp")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def dispatch(self):
        try:
            url = urlsplit(self.path)
            if self.command == "GET" and not url.path.startswith("/api/"):
                self.serve_asset(url.path)
            else:
                status, payload = self.api(url)
                self.send_json(status, payload)
        except OrderError as error:
            self.send_json(error.status, {"error": str(error)})

    def api(self, url):
        path = url.path
        method = self.command
        order_route = ORDER_ROUTE.fullmatch(path)
        database_path = self.server.database_path

        if method == "GET" and path == "/api/products":
            with database(database_path) as connection:
                return HTTPStatus.OK, {"products": list_products(connection)}

        if method == "GET" and path == "/api/orders":
            params = parse_qs(url.query)
            with database(database_path) as connection:
                connection.execute("BEGIN")
                return HTTPStatus.OK, list_orders(
                    connection, params.get("q", [""])[0], params.get("status", [""])[0]
                )

        if method == "POST" and path == "/api/orders":
            quantities = validate_items(self.read_json())
            with database(database_path, write=True) as connection:
                order = place_order(connection, quantities)
            return HTTPStatus.CREATED, order

        if method == "GET" and order_route and not order_route[2]:
            with database(database_path) as connection:
                connection.execute("BEGIN")
                return HTTPStatus.OK, get_order(connection, order_route[1])

        if method == "PATCH" and order_route and order_route[2]:
            payload = self.read_json()
            status = payload.get("status") if isinstance(payload, dict) else None
            with database(database_path, write=True) as connection:
                order = change_status(connection, order_route[1], status)
            return HTTPStatus.OK, order

        raise OrderError("Endpoint not found.", HTTPStatus.NOT_FOUND)

    def read_json(self):
        if self.headers.get_content_type() != "application/json":
            raise OrderError("Send an application/json request.", HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise OrderError("Invalid request length.") from None
        if not 1 <= size <= 65_536:
            raise OrderError("Provide a JSON body up to 64 KB.")
        try:
            return json.loads(self.rfile.read(size).decode("utf-8"))
        except (ValueError, RecursionError):
            raise OrderError("Invalid JSON request.") from None

    def serve_asset(self, path):
        if path == "/":
            path = "/index.html"
        if path not in {"/index.html", "/app.js", "/style.css"} and not CATALOGUE_ASSET.fullmatch(path):
            raise OrderError("Page not found.", HTTPStatus.NOT_FOUND)
        asset = PUBLIC / path.lstrip("/")
        if not asset.is_file():
            raise OrderError("Asset not found.", HTTPStatus.NOT_FOUND)
        content_type = mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
        self.send_content(HTTPStatus.OK, content_type, asset.read_bytes())

    def send_json(self, status, body):
        self.send_content(status, "application/json; charset=utf-8", json.dumps(body).encode())

    def send_content(self, status, content_type, data):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)


class OrderServer(ThreadingHTTPServer):
    def __init__(self, address, database_path):
        self.database_path = database_path
        super().__init__(address, Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "orders.sqlite3")
    parser.add_argument("--demo", action="store_true", help="Add sample orders to an empty database.")
    parser.add_argument("--seed-only", action="store_true", help="Initialize the database and exit.")
    args = parser.parse_args()

    initialize(args.db, demo=args.demo)
    if args.seed_only:
        print(f"Database ready at {args.db}")
        return
    try:
        with OrderServer((args.host, args.port), args.db) as server:
            print(f"Local console: http://{args.host}:{server.server_port}", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
