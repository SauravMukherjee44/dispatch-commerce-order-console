import assert from "node:assert/strict";
import { test } from "node:test";
import { changeStatus, listOrders, placeOrder, readState, transact, validateItems } from "../lib/orders.mjs";

const seed = {
  nextId: 1,
  orders: [],
  products: [
    { id: 1, sku: "ST-101", name: "Field Notebook", image: "notebook", unit_cents: 1800, stock: 5 },
    { id: 2, sku: "ST-102", name: "Cork Desk Mat", image: "mat", unit_cents: 3200, stock: 0 },
    { id: 3, sku: "ST-103", name: "Kiln Coffee Mug", image: "mug", unit_cents: 2400, stock: 6 },
  ],
};

function inMemoryBlob() {
  let record = null;
  let revision = 0;
  return {
    async getWithMetadata() { return structuredClone(record); },
    async setJSON(key, data, { onlyIfNew, onlyIfMatch }) {
      if (onlyIfNew && record || onlyIfMatch && record?.etag !== onlyIfMatch) return { modified: false };
      record = { data: structuredClone(data), etag: String(++revision) };
      return { modified: true };
    },
  };
}

const items = (...lines) => validateItems({ items: lines.map(([product_id, quantity]) => ({ product_id, quantity })) });
const place = (store, ...lines) => transact(store, seed, (state) => placeOrder(state, items(...lines)));
const status = (store, reference, next) => transact(store, seed, (state) => changeStatus(state, reference, next));
const current = async (store) => (await readState(store, seed)).data;

test("multi-item placement derives price, merges product lines, and deducts stock", async () => {
  const store = inMemoryBlob();
  const order = await place(store, [1, 1], [3, 1], [1, 1]);
  assert.equal(order.reference, "ORD-1001");
  assert.equal(order.total_cents, 6000);
  assert.deepEqual((await current(store)).products.map((product) => product.stock), [3, 0, 5]);
  assert.equal(listOrders(await current(store), "ord-1001", "Placed").orders.length, 1);
});

test("a mixed-stock rejection leaves the entire snapshot unchanged", async () => {
  const store = inMemoryBlob();
  await assert.rejects(place(store, [1, 2], [2, 1]), { status: 409 });
  assert.deepEqual(await current(store), seed);
});

test("the server enforces sequential fulfilment", async () => {
  const store = inMemoryBlob();
  const order = await place(store, [1, 2]);
  await assert.rejects(status(store, order.reference, "Shipped"), { status: 409 });
  assert.equal((await status(store, order.reference, "Packed")).status, "Packed");
  assert.equal((await status(store, order.reference, "Shipped")).status, "Shipped");
  await assert.rejects(status(store, order.reference, "Cancelled"), { status: 409 });
});

test("concurrent hosted cancellations return the stock exactly once", async () => {
  const store = inMemoryBlob();
  const order = await place(store, [1, 2]);
  await status(store, order.reference, "Packed");
  const results = await Promise.allSettled([
    status(store, order.reference, "Cancelled"), status(store, order.reference, "Cancelled"),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.find(({ status }) => status === "rejected").reason.status, 409);
  assert.equal((await current(store)).products[0].stock, 5);
});

test("competing placement retries cannot oversell as storage revisions change", async () => {
  const store = inMemoryBlob();
  const results = await Promise.allSettled([place(store, [1, 4]), place(store, [1, 4])]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.find(({ status }) => status === "rejected").reason.status, 409);
  assert.equal((await current(store)).products[0].stock, 1);
});
