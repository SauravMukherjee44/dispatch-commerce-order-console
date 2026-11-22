import { getStore } from "@netlify/blobs";
import { changeStatus, getOrder, listOrders, OrderError, placeOrder, readState, transact, validateItems } from "../lib/orders.mjs";
import seed from "../lib/seed.json" with { type: "json" };

const orderRoute = /^\/api\/orders\/(ORD-\d+)(\/status)?$/i;
const response = (value, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

async function payload(request) {
  if (request.headers.get("Content-Type")?.split(";")[0].toLowerCase() !== "application/json") {
    throw new OrderError("Send an application/json request.", 415);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65536) throw new OrderError("Provide a JSON body up to 64 KB.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new OrderError("Invalid JSON request.");
  }
}

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const method = request.method;
  const order = orderRoute.exec(path);
  try {
    const store = getStore({ name: "dispatch", consistency: "strong" });
    if (method === "GET" && path === "/api/products") {
      const { data } = await readState(store, seed);
      return response({ products: data.products });
    }
    if (method === "GET" && path === "/api/orders") {
      const { data } = await readState(store, seed);
      return response(listOrders(data, url.searchParams.get("q") ?? "", url.searchParams.get("status") ?? ""));
    }
    if (method === "GET" && order && !order[2]) {
      const { data } = await readState(store, seed);
      return response(getOrder(data, order[1]));
    }
    if (method === "POST" && path === "/api/orders") {
      const items = validateItems(await payload(request));
      const created = await transact(store, seed, (state) => placeOrder(state, items));
      return response(created, 201);
    }
    if (method === "PATCH" && order?.[2]) {
      const body = await payload(request);
      const updated = await transact(store, seed, (state) => changeStatus(state, order[1], body?.status));
      return response(updated);
    }
    throw new OrderError("Endpoint not found.", 404);
  } catch (error) {
    if (error instanceof OrderError) return response({ error: error.message }, error.status);
    console.error(error);
    return response({ error: "The order service is temporarily unavailable." }, 503);
  }
}

export const config = { path: "/api/*" };
