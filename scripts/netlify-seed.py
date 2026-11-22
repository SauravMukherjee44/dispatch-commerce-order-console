"""Regenerate the hosted demo seed from a fresh SQLite catalogue."""

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from store import database, get_order, initialize, list_orders, list_products


with TemporaryDirectory() as directory:
    path = Path(directory) / "seed.sqlite3"
    initialize(path, demo=True)
    with database(path) as connection:
        orders = [get_order(connection, row["reference"])
                  for row in reversed(list_orders(connection, "", "")["orders"])]
        state = {"products": list_products(connection), "orders": orders, "nextId": len(orders) + 1}
    seed = root / "netlify" / "lib" / "seed.json"
    seed.write_text(json.dumps(state, indent=2) + "\n")
