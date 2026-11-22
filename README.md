# Dispatch · Commerce Order Console

Dispatch is a local browser console for Morrow Supply, a fictional desk-accessories store. Create multi-item orders, check inventory, find orders by reference, and manage fulfilment.

## Quick start

Requires Node.js 22.12 or later, npm, Python 3.11 or later, and a modern browser. From the project directory, run:

```sh
npm ci
npm run dev:demo
```

Open [Dispatch on port 3000](http://127.0.0.1:3000). The command starts Next.js and the Python API and seeds six products and eight sample orders in `data/demo.sqlite3`. Use Ctrl+C to stop both services. Run `npm run dev` for a separate catalogue-only database at `data/orders.sqlite3`. Both databases keep current inventory and orders across restarts.

If the Python API is already running on port 8000, use `npm run dev:web` to start just the Next.js frontend against that API and its existing database. Set `DISPATCH_API_ORIGIN` before starting or building the frontend to use a different API origin. The combined dev commands also support `PORT`, `DISPATCH_API_PORT`, `DISPATCH_DB`, and `DISPATCH_PYTHON`.

To seed without starting servers, run `python3 server.py --seed-only`. To seed sample orders into a fresh database, run `python3 server.py --seed-only --demo --db data/demo.sqlite3`. Seeds preserve existing catalogue stock. Sample orders are added only to an empty order database.

## Walkthrough

1. Click **New order**. Add two **Field Notebooks** and one **Kiln Coffee Mug**. The summary shows three items and **$60.00**. **Cork Desk Mat** is out of stock and its Add button is disabled.
2. Click **Place order**. Dispatch opens the new **Placed** order with its reference and line items. On a fresh seed, Field Notebook drops from five to three units in **Catalogue**.
3. Use **Find an order** or **⌘/Ctrl K** to focus reference search. The status cards and filter buttons narrow the order list. Select a reference to see quantities, line totals, and the fulfilment step.
4. Click **Mark as packed**, then **Mark as shipped**. To try cancellation, create another order and click **Cancel order** while it is Placed or Packed. The order remains searchable as Cancelled, and its quantities return to the catalogue.

## Operations simulations

Open **Operations** to use the interactive 3D warehouse. In **Fulfilment**, choose a sample or live order, step through packing and dispatch, or run the sequence with play and pause. Simulated cancellations route eligible orders to Returns. Orders also link directly to their own simulation from the detail panel.

In **Inventory**, pick a preset or create a multi-product reservation. Run the check to compare stock before and after. If a product is short, the parcel moves to Hold and all quantities stay at their starting values. An accepted reservation can be cancelled once to show the stock restoration. Both simulations use a temporary copy of the selected data.

Drag with a mouse to orbit the warehouse, or use the camera buttons to switch between isometric and top views. The controls also work with a diagram when WebGL is unavailable.

## Development

- `frontend/app/` contains the Next.js App Router pages for Orders, Catalogue, New order, and Operations.
- `frontend/components/` contains the reusable dashboard, order detail, and catalogue components. Framer Motion handles UI transitions. GSAP handles the parcel illustration’s entrance and pointer tilt. Both respect the system’s reduced-motion preference.
- `frontend/components/operations/` contains the simulation controls and the Three.js warehouse. GSAP animates the parcel between stations.
- `frontend/lib/orders.ts` defines the typed API client and shared records. SWR manages fetches and refreshes the relevant views after writes.
- `server.py` serves the HTTP API. `store.py` contains the SQLite schema and transaction logic. The original Python-served UI is still available on the API port.

```sh
npm run typecheck
npm test
npm run build
```

The API suite runs against isolated databases and checks order placement, atomic stock rejection, invalid state changes, exactly-once stock restoration, concurrent writes, and restart persistence. To serve a production build locally, run `npm start` while the Python API is running.

## Hosted demo on Netlify

Import this repository in Netlify. The root `netlify.toml` builds a static export of Next.js and deploys an order API backed by Netlify Blobs. The first hosted request initializes six synthetic products and eight synthetic orders. The hosted database is independent of the local SQLite files.

The hosted API stores orders and stock in one strongly consistent state document. Each change uses an ETag compare-and-set operation and retries after a competing update, so a rejected order and a repeated cancellation leave stock consistent. This is a small public demo with shared synthetic data.

Run `npm run test:hosted` for the hosted order rules and concurrent-write checks, or run `npm run build:netlify` to generate the static site locally. The Python implementation still runs locally with `npm run dev:demo`.

## API

Prices are stored as integer cents in USD. Line items retain the SKU, name, and unit price from placement.

| Method | Endpoint | Request |
| --- | --- | --- |
| GET | `/api/products` | Returns catalogue products and current stock |
| GET | `/api/orders` | Optional `q` reference substring and `status` filters |
| GET | `/api/orders/ORD-1001` | Returns an order with its line items |
| POST | `/api/orders` | `{"items":[{"product_id":1,"quantity":2}]}` |
| PATCH | `/api/orders/ORD-1001/status` | `{"status":"Packed"}` |

The API returns HTTP 400 for invalid input and HTTP 409 for insufficient stock or invalid transitions. Placement combines duplicate product quantities and checks each line inside a SQLite write transaction. The order and inventory deductions commit together. Cancellation checks the stored status and restores stock in the same transaction. Retrying a cancellation returns HTTP 409.
