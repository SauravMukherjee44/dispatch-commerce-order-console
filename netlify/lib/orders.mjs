const transitions = {
  Placed: ["Packed", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: [],
  Cancelled: [],
};

export class OrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function findOrder(state, reference) {
  const order = state.orders.find((entry) => entry.reference === reference.toUpperCase());
  if (!order) throw new OrderError("Order not found.", 404);
  return order;
}

export function listOrders(state, query, filter) {
  if (filter && !Object.hasOwn(transitions, filter)) throw new OrderError("Choose a valid order status.");
  const search = query.trim().toUpperCase();
  const counts = { Placed: 0, Packed: 0, Shipped: 0, Cancelled: 0 };
  const orders = [];
  for (const order of state.orders.toReversed()) {
    counts[order.status]++;
    if (order.reference.includes(search) && (!filter || order.status === filter)) {
      const { items, ...summary } = order;
      orders.push(summary);
    }
  }
  return { orders, counts };
}

export const getOrder = findOrder;

export function validateItems(payload) {
  const items = payload?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw new OrderError("Provide between 1 and 100 order lines.");
  }
  const quantities = new Map();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new OrderError("Each order line must be an object.");
    const { product_id, quantity } = item;
    if (!Number.isSafeInteger(product_id) || product_id < 1) throw new OrderError("Product IDs must be positive integers.");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
      throw new OrderError("Quantities must be whole numbers from 1 to 10,000.");
    }
    const total = (quantities.get(product_id) ?? 0) + quantity;
    if (total > 10000) throw new OrderError("The combined quantity for a product cannot exceed 10,000.");
    quantities.set(product_id, total);
  }
  return quantities;
}

export function placeOrder(state, quantities) {
  const products = new Map(state.products.map((product) => [product.id, product]));
  const items = [];
  for (const [id, quantity] of quantities) {
    const product = products.get(id);
    if (!product) throw new OrderError(`Product ${id} does not exist.`);
    if (product.stock < quantity) {
      throw new OrderError(`${product.name} has ${product.stock} available. You requested ${quantity}.`, 409);
    }
    const { sku, name, image, unit_cents } = product;
    items.push({ product_id: id, sku, name, image, unit_cents, quantity, subtotal_cents: unit_cents * quantity });
  }
  const id = state.nextId++;
  const order = {
    id,
    reference: `ORD-${1000 + id}`,
    created_at: new Date().toISOString(),
    status: "Placed",
    total_cents: items.reduce((total, item) => total + item.subtotal_cents, 0),
    units: items.reduce((total, item) => total + item.quantity, 0),
    items: items.sort((left, right) => left.product_id - right.product_id),
  };
  state.orders.push(order);
  for (const [id, quantity] of quantities) products.get(id).stock -= quantity;
  return order;
}

export function changeStatus(state, reference, status) {
  if (typeof status !== "string" || !Object.hasOwn(transitions, status)) throw new OrderError("Choose a valid order status.");
  const order = findOrder(state, reference);
  if (!transitions[order.status].includes(status)) {
    throw new OrderError(`Order ${order.reference} cannot move from ${order.status} to ${status}.`, 409);
  }
  order.status = status;
  if (status === "Cancelled") {
    for (const item of order.items) {
      state.products.find(({ id }) => id === item.product_id).stock += item.quantity;
    }
  }
  return order;
}

export async function readState(store, initial) {
  const key = "state";
  const existing = await store.getWithMetadata(key, { type: "json" });
  if (existing) return existing;
  await store.setJSON(key, initial, { onlyIfNew: true });
  const seeded = await store.getWithMetadata(key, { type: "json" });
  if (!seeded) throw new OrderError("Inventory is temporarily unavailable.", 503);
  return seeded;
}

export async function transact(store, initial, operation) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, etag } = await readState(store, initial);
    const next = structuredClone(data);
    const result = operation(next);
    const write = await store.setJSON("state", next, { onlyIfMatch: etag });
    if (write.modified) return result;
  }
  throw new OrderError("Inventory changed during this request. Try again.", 503);
}
