"""SQLite catalogue and order operations."""

import sqlite3
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from pathlib import Path


STATUSES = ("Placed", "Packed", "Shipped", "Cancelled")
TRANSITIONS = {
    "Placed": {"Packed", "Cancelled"},
    "Packed": {"Shipped", "Cancelled"},
    "Shipped": set(),
    "Cancelled": set(),
}

PRODUCTS = (
    ("ST-101", "Field Notebook", "Paper goods", 1800, 5, "notebook"),
    ("ST-102", "Cork Desk Mat", "Desk essentials", 3200, 0, "mat"),
    ("ST-103", "Kiln Coffee Mug", "Drinkware", 2400, 18, "mug"),
    ("ST-104", "Graphite Pen Set", "Writing tools", 1600, 24, "pens"),
    ("ST-105", "Studio Pen Cup", "Desk essentials", 2200, 12, "cup"),
    ("ST-106", "Arc Task Lamp", "Lighting", 6800, 7, "lamp"),
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0),
    stock INTEGER NOT NULL CHECK (stock >= 0),
    image TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Placed', 'Packed', 'Shipped', 'Cancelled')),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0)
);
CREATE TABLE IF NOT EXISTS order_items (
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (order_id, product_id)
);
"""

# References derive from the persistent order ID and remain stable across runs.
ORDER_FIELDS = """
    orders.id, 'ORD-' || (1000 + orders.id) AS reference, created_at,
    status, total_cents,
    (SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id) AS units
"""


class OrderError(Exception):
    def __init__(self, message, status=HTTPStatus.BAD_REQUEST):
        super().__init__(message)
        self.status = status


@contextmanager
def database(path, *, write=False):
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        if write:
            connection.execute("BEGIN IMMEDIATE")
        with connection:
            yield connection
    finally:
        connection.close()


def initialize(path, *, demo=False):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with database(path) as connection:
        connection.executescript(SCHEMA)
    with database(path, write=True) as connection:
        connection.executemany(
            """
            INSERT INTO products (sku, name, category, unit_cents, stock, image)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (sku) DO NOTHING
            """,
            PRODUCTS,
        )
        if demo and not connection.execute("SELECT 1 FROM orders LIMIT 1").fetchone():
            seed_demo(connection)


def list_products(connection):
    return [dict(row) for row in connection.execute("SELECT * FROM products ORDER BY id")]


def validate_items(payload):
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not 1 <= len(items) <= 100:
        raise OrderError("Provide between 1 and 100 order lines.")
    quantities = Counter()
    for item in items:
        if not isinstance(item, dict):
            raise OrderError("Each order line must be an object.")
        product_id = item.get("product_id")
        quantity = item.get("quantity")
        if type(product_id) is not int or not 1 <= product_id <= 2**63 - 1:
            raise OrderError("Product IDs must be positive integers.")
        if type(quantity) is not int or not 1 <= quantity <= 10_000:
            raise OrderError("Quantities must be whole numbers from 1 to 10,000.")
        quantities[product_id] += quantity
        if quantities[product_id] > 10_000:
            raise OrderError("The combined quantity for a product cannot exceed 10,000.")
    return quantities


def place_order(connection, quantities, *, created_at=None):
    lines = []
    total = 0
    for product_id, quantity in quantities.items():
        product = connection.execute(
            "SELECT * FROM products WHERE id = ?", (product_id,)
        ).fetchone()
        if product is None:
            raise OrderError(f"Product {product_id} does not exist.")
        if product["stock"] < quantity:
            raise OrderError(
                f'{product["name"]} has {product["stock"]} available. You requested {quantity}.',
                HTTPStatus.CONFLICT,
            )
        total += product["unit_cents"] * quantity
        lines.append(
            (product_id, product["sku"], product["name"], product["image"],
             product["unit_cents"], quantity)
        )

    order_id = connection.execute(
        "INSERT INTO orders (created_at, status, total_cents) VALUES (?, 'Placed', ?)",
        (created_at or datetime.now(timezone.utc).isoformat(timespec="seconds"), total),
    ).lastrowid
    connection.executemany(
        """
        INSERT INTO order_items (order_id, product_id, sku, name, image, unit_cents, quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [(order_id, *line) for line in lines],
    )
    connection.executemany(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [(quantity, product_id) for product_id, quantity in quantities.items()],
    )
    return get_order(connection, f"ORD-{1000 + order_id}")


def list_orders(connection, search, status):
    if status and status not in STATUSES:
        raise OrderError("Choose a valid order status.")
    rows = connection.execute(
        f"""
        SELECT {ORDER_FIELDS} FROM orders
        WHERE instr('ORD-' || (1000 + orders.id), ?) > 0 AND (? = '' OR status = ?)
        ORDER BY id DESC
        """,
        (search.strip().upper(), status, status),
    )
    counts = dict.fromkeys(STATUSES, 0)
    for row in connection.execute("SELECT status, COUNT(*) AS count FROM orders GROUP BY status"):
        counts[row["status"]] = row["count"]
    return {"orders": [dict(row) for row in rows], "counts": counts}


def get_order(connection, reference):
    row = connection.execute(
        f"SELECT {ORDER_FIELDS} FROM orders WHERE 'ORD-' || (1000 + orders.id) = ?",
        (reference.upper(),),
    ).fetchone()
    if row is None:
        raise OrderError("Order not found.", HTTPStatus.NOT_FOUND)
    order = dict(row)
    lines = connection.execute(
        """
        SELECT product_id, sku, name, image, unit_cents, quantity,
               unit_cents * quantity AS subtotal_cents
        FROM order_items WHERE order_id = ? ORDER BY product_id
        """,
        (order["id"],),
    )
    order["items"] = [dict(line) for line in lines]
    return order


def change_status(connection, reference, status):
    if not isinstance(status, str) or status not in STATUSES:
        raise OrderError("Choose a valid order status.")
    order = get_order(connection, reference)
    if status not in TRANSITIONS[order["status"]]:
        raise OrderError(
            f'Order {order["reference"]} cannot move from {order["status"]} to {status}.',
            HTTPStatus.CONFLICT,
        )
    connection.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order["id"]))
    if status == "Cancelled":
        connection.executemany(
            "UPDATE products SET stock = stock + ? WHERE id = ?",
            [(line["quantity"], line["product_id"]) for line in order["items"]],
        )
    order["status"] = status
    return order


def seed_demo(connection):
    products = {product["sku"]: product["id"] for product in list_products(connection)}
    samples = (
        (126, (("ST-104", 1),), "Cancelled"),
        (104, (("ST-106", 1),), "Shipped"),
        (80, (("ST-103", 1), ("ST-105", 1)), "Shipped"),
        (52, (("ST-104", 2),), "Packed"),
        (31, (("ST-103", 1),), "Placed"),
        (19, (("ST-105", 2), ("ST-106", 1)), "Packed"),
        (4, (("ST-104", 1), ("ST-105", 1)), "Placed"),
        (1, (("ST-103", 2), ("ST-104", 1), ("ST-106", 1)), "Placed"),
    )
    now = datetime.now(timezone.utc)
    for hours, lines, status in samples:
        order = place_order(
            connection,
            {products[sku]: quantity for sku, quantity in lines},
            created_at=(now - timedelta(hours=hours)).isoformat(timespec="seconds"),
        )
        if status == "Shipped":
            change_status(connection, order["reference"], "Packed")
        if status != "Placed":
            change_status(connection, order["reference"], status)
