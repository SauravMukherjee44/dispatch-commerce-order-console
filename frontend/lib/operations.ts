import type { Product, Status } from "./orders";

export const stages = ["stock", "intake", "packing", "dispatch", "returns", "hold"] as const;
export type Station = (typeof stages)[number];

export const stations: Record<Station, { label: string; color: string; x: number; z: number }> = {
  stock: { label: "Stock", color: "#7c60e4", x: -5.85, z: -2.05 },
  intake: { label: "Intake", color: "#7961da", x: -5.6, z: 2.22 },
  packing: { label: "Packing", color: "#c37724", x: 0, z: 2.22 },
  dispatch: { label: "Dispatch", color: "#188169", x: 5.6, z: 2.22 },
  returns: { label: "Returns", color: "#3d76c8", x: 5.38, z: -2.3 },
  hold: { label: "Hold", color: "#bd4e70", x: 0, z: -2.15 },
};

export const stationForStatus: Record<Status, Station> = {
  Placed: "intake", Packed: "packing", Shipped: "dispatch", Cancelled: "returns",
};

export const nextStage: Partial<Record<Status, Status>> = { Placed: "Packed", Packed: "Shipped" };

export type StockRow = { product: Product; quantity: number; before: number; after: number; missing: number };
export type StockCheck = { rows: StockRow[]; accepted: boolean };
export type Quantities = Record<number, number>;

export function checkStock(products: Product[], quantities: Quantities): StockCheck {
  const rows = products.flatMap((product) => {
    const quantity = quantities[product.id] ?? 0;
    if (quantity <= 0) return [];
    return [{ product, quantity, before: product.stock, after: product.stock, missing: Math.max(0, quantity - product.stock) }];
  });
  const accepted = rows.length > 0 && rows.length === Object.keys(quantities).length && rows.every((row) => row.missing === 0);
  if (accepted) rows.forEach((row) => { row.after = row.before - row.quantity; });
  return { rows, accepted };
}
