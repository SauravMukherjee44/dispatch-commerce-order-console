export const statuses = ["Placed", "Packed", "Shipped", "Cancelled"] as const;
export type Status = (typeof statuses)[number];

export type Product = {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit_cents: number;
  stock: number;
  image: string;
};

export type OrderSummary = {
  id: number;
  reference: string;
  created_at: string;
  status: Status;
  total_cents: number;
  units: number;
};

export type LineItem = {
  product_id: number;
  sku: string;
  name: string;
  image: string;
  unit_cents: number;
  quantity: number;
  subtotal_cents: number;
};

export type Order = OrderSummary & { items: LineItem[] };

export type OrderListing = {
  orders: OrderSummary[];
  counts: Record<Status, number>;
};

export const ordersPath = "/api/orders";
export const productsPath = "/api/products";
export const orderPath = (reference: string) => `${ordersPath}/${encodeURIComponent(reference)}`;

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error("Couldn’t reach Dispatch. Check the connection and try again.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || body === null) {
    throw new Error(body?.error ?? "The server couldn’t complete the request. Try again.");
  }
  return body;
}

export function send<T>(path: string, method: "POST" | "PATCH", payload: unknown) {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export const money = (cents: number) => currency.format(cents / 100);
export const itemCount = (units: number) => `${units} ${units === 1 ? "item" : "items"}`;
export const formatDate = (date: string, includeTime = false) =>
  (includeTime ? longDate : shortDate).format(new Date(date));
