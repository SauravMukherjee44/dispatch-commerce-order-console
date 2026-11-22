"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Box, CircleAlert, FlaskConical, Layers, PackageCheck, Pause, Play, RotateCcw, Truck, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import useSWR from "swr";
import { EmptyState, Loading, StatusBadge, statusStyle } from "@/components/ui";
import { checkStock, nextStage, type Quantities, type Station, stationForStatus, stations, type StockCheck } from "@/lib/operations";
import { type Order, type OrderListing, type Product, type Status, itemCount, money, orderPath, ordersPath, productsPath } from "@/lib/orders";

const Warehouse = dynamic(() => import("./warehouse-scene").then((mod) => mod.WarehouseScene), {
  ssr: false,
  loading: () => <div className="warehouse-loading" role="status">Loading 3D warehouse…</div>,
});

function Workbench({ station, caption, children }: { station: Station; caption: string; children: ReactNode }) {
  return (
    <div className="ops-workbench">
      <section className="panel warehouse" aria-labelledby="warehouse-title">
        <header className="warehouse-head">
          <div><Box size={18} /><h2 id="warehouse-title">Warehouse</h2></div>
          <span className="station-badge" style={{ "--station-color": stations[station].color } as CSSProperties}>
            <i aria-hidden="true" />{stations[station].label}
          </span>
        </header>
        <figure className="warehouse-viewport" aria-label={`Warehouse model. Current station: ${stations[station].label}.`}>
          <Warehouse station={station} />
        </figure>
        <div className="warehouse-caption" aria-live="polite"><span className="location-line" />{caption}</div>
      </section>
      <section className="panel operation-controls" aria-label="Simulation controls">{children}</section>
    </div>
  );
}

const captions: Record<Status, string> = {
  Placed: "Order accepted at intake. Stock has been reserved.",
  Packed: "Items packed and ready to leave the warehouse.",
  Shipped: "Parcel moved to dispatch. The order is complete.",
  Cancelled: "Parcel routed to returns. Its items are available again.",
};

function Fulfilment({ initial }: { initial: string }) {
  const [selected, setSelected] = useState(initial);
  const { data: listing } = useSWR<OrderListing>(ordersPath);
  const { data: order, error, mutate } = useSWR<Order>(selected ? orderPath(selected) : null);
  const [run, setRun] = useState<{ source: string; status: Status; playing: boolean }>();
  const baseline = order?.status ?? "Placed";
  const source = `${selected}:${baseline}`;
  const current = run?.source === source ? run.status : baseline;
  const playing = run?.source === source && run.playing;
  const ready = !selected || !!order;
  const next = nextStage[current];

  useEffect(() => {
    if (!playing || !next) return;
    const timer = window.setTimeout(() => {
      setRun({ source, status: next, playing: !!nextStage[next] });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [next, playing, source]);

  function move(status: Status, playing = false) {
    setRun({ source, status, playing });
  }

  const options = listing?.orders ?? [];
  const hasSelected = options.some((option) => option.reference === selected);
  return (
    <Workbench station={stationForStatus[current]} caption={ready ? captions[current] : "Choose an order to begin."}>
      <header className="ops-panel-heading">
        <span className="ops-panel-mark"><Truck size={19} /></span>
        <div><h2>Fulfilment run</h2><p>Follow a parcel through each station.</p></div>
      </header>
      <div className="ops-panel-content">
        <label className="ops-field">
          <span>Source order</span>
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">Sample order · Placed</option>
            {selected && !hasSelected && <option value={selected}>{selected}</option>}
            {options.map(({ reference, status }) => <option value={reference} key={reference}>{reference} · {status}</option>)}
          </select>
        </label>
        {!ready ? error ? (
          <EmptyState icon={CircleAlert} title="Couldn’t load source order" description={error.message}>
            <button type="button" className="button secondary small" onClick={() => void mutate()}>Retry</button>
          </EmptyState>
        ) : <Loading label="Loading source order" rows={2} /> : (
          <>
            {order && (
              <div className="ops-source-meta">
                <span>Live order · {itemCount(order.units)} · {money(order.total_cents)}</span>
                <StatusBadge status={order.status} />
              </div>
            )}
            <div className="ops-run-stage">
              <div><span>Simulated status</span><StatusBadge status={current} /></div>
              <ol className="ops-steps">
                {(["Placed", "Packed", "Shipped"] as const).map((status) => {
                  const Icon = statusStyle[status].icon;
                  return <li key={status} aria-current={current === status ? "step" : undefined}><Icon size={15} />{status}</li>;
                })}
              </ol>
            </div>
            <div className="ops-action-grid">
              <button className="button primary" type="button" disabled={!next} onClick={() => {
                if (next) move(current, !playing);
              }}>
                {playing ? <Pause size={17} /> : <Play size={17} />}
                {playing ? "Pause" : "Run sequence"}
              </button>
              <button className="button secondary" type="button" disabled={!next || playing} onClick={() => {
                if (next) move(next);
              }}>{current === "Placed" ? "Step to Packed" : current === "Packed" ? "Step to Shipped" : "Next step"}</button>
              <button className="button secondary" type="button" disabled={current === baseline && !playing} onClick={() => move(baseline)}><RotateCcw size={15} /> Reset</button>
              <button className="button text-danger" type="button" disabled={current !== "Placed" && current !== "Packed"} onClick={() => move("Cancelled")}>Simulate cancellation</button>
            </div>
          </>
        )}
      </div>
    </Workbench>
  );
}

type StockRun = { check: StockCheck; returned: boolean };

function StockSimulation() {
  const { data, error, mutate } = useSWR<{ products: Product[] }>(productsPath);
  const [quantities, setQuantities] = useState<Quantities>({});
  const [run, setRun] = useState<StockRun | null>(null);
  const products = data?.products ?? [];
  const lines = products.filter((product) => quantities[product.id] > 0);
  const editable = !run;
  const available = products.find((product) => product.stock > 0);
  const shortage = products.find((product) => product.stock === 0) ?? products.find((product) => product.stock < 10000);

  const station = !run ? "stock" : run.returned ? "returns" : run.check.accepted ? "intake" : "hold";
  const caption = !run ? "Select products to model an inventory reservation." :
    run.returned ? "Reservation cancelled. All simulated units returned to stock." :
    run.check.accepted ? "Stock reserved. Parcel released to intake." :
    "Order on hold. The reservation failed and all stock stayed at its starting level.";

  function updateLine(id: number, quantity: number) {
    if (!editable || !Number.isSafeInteger(quantity)) return;
    setQuantities((current) => {
      const next = { ...current };
      if (quantity < 1) delete next[id];
      else next[id] = Math.min(quantity, 10000);
      return next;
    });
  }

  function sample(kind: "available" | "shortage") {
    const quantities: Quantities = {};
    if (available) quantities[available.id] = Math.min(2, available.stock);
    if (kind === "shortage" && shortage) quantities[shortage.id] = shortage.stock + 1;
    setQuantities(quantities);
    setRun(null);
  }

  return (
    <Workbench station={station} caption={caption}>
      <header className="ops-panel-heading">
        <span className="ops-panel-mark"><Layers size={19} /></span>
        <div><h2>Stock check</h2><p>Model a reservation against current inventory.</p></div>
      </header>
      {!data ? error ? (
        <EmptyState icon={CircleAlert} title="Couldn’t load inventory" description={error.message}>
          <button type="button" className="button secondary small" onClick={() => void mutate()}>Retry</button>
        </EmptyState>
      ) : <Loading label="Loading inventory" rows={2} /> : (
        <div className="ops-panel-content">
          <div className="scenario-buttons" aria-label="Example scenarios" role="group">
            <button type="button" className="button secondary small" onClick={() => sample("available")} disabled={!available}>Available order</button>
            <button type="button" className="button secondary small" onClick={() => sample("shortage")} disabled={!shortage}>Stock shortage</button>
          </div>
          <label className="ops-field">
            <span>Add a product</span>
            <select value="" disabled={!editable || lines.length === products.length} onChange={(event) => {
              const id = Number(event.target.value);
              if (id) updateLine(id, 1);
            }}>
              <option value="">Select product</option>
              {products.filter(({ id }) => !quantities[id]).map((product) =>
                <option value={product.id} key={product.id}>{product.name} · {product.stock} in stock</option>
              )}
            </select>
          </label>
          {editable && lines.length > 0 && (
            <ul className="ops-draft">
              {lines.map((product) => (
                <li key={product.id}>
                  <div><strong>{product.name}</strong><span>{product.stock} available</span></div>
                  <input type="number" aria-label={`Quantity for ${product.name}`} min={1} max={10000}
                    value={quantities[product.id]} onChange={(event) => {
                      if (event.target.valueAsNumber > 0) updateLine(product.id, Math.trunc(event.target.valueAsNumber));
                    }} />
                  <button type="button" className="icon-button" aria-label={`Remove ${product.name}`} onClick={() => updateLine(product.id, 0)}><X size={16} /></button>
                </li>
              ))}
            </ul>
          )}
          <AnimatePresence initial={false}>
            {run && (
              <motion.div className={`stock-result ${run.check.accepted ? "ok" : "blocked"}`} role="status"
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <strong>{run.returned ? "Stock restored" : run.check.accepted ? "Stock reserved" : "Reservation rejected"}</strong>
                <table>
                  <thead><tr><th scope="col">Product</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
                  <tbody>
                    {run.check.rows.map(({ product, before, after, missing }) => (
                      <tr key={product.id}>
                        <td>{product.name}{missing > 0 && <small>Short by {missing}</small>}</td>
                        <td>{before}</td><td>{run.returned ? before : after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="ops-action-grid">
            <button className="button primary" type="button" disabled={!lines.length || !editable}
              onClick={() => setRun({ check: checkStock(products, quantities), returned: false })}><Play size={16} /> Run stock check</button>
            <button className="button secondary" type="button" disabled={!lines.length && !run}
              onClick={() => { setRun(null); setQuantities({}); }}><RotateCcw size={15} /> Reset</button>
          </div>
          {run?.check.accepted && (
            <button className="button text-danger return-button" type="button" disabled={run.returned}
              onClick={() => setRun({ ...run, returned: true })}>Cancel reservation</button>
          )}
        </div>
      )}
    </Workbench>
  );
}

export function Operations() {
  const reference = useSearchParams().get("order")?.toUpperCase() ?? "";
  const initial = /^ORD-\d+$/.test(reference) ? reference : "";
  const [mode, setMode] = useState<"fulfilment" | "stock">("fulfilment");

  return (
    <div className="ops-page">
      <header className="ops-page-heading">
        <div><h1>Operations</h1><p>Simulate fulfilment and stock changes in a 3D warehouse.</p></div>
        <span className="simulation-label"><FlaskConical size={16} /> Simulation only</span>
      </header>
      <div className="ops-modes" aria-label="Simulation type" role="group">
        <button type="button" aria-pressed={mode === "fulfilment"} onClick={() => setMode("fulfilment")}><PackageCheck size={17} /> Fulfilment</button>
        <button type="button" aria-pressed={mode === "stock"} onClick={() => setMode("stock")}><Layers size={17} /> Inventory</button>
      </div>
      {mode === "fulfilment" ? <Fulfilment key={initial} initial={initial} /> : <StockSimulation />}
    </div>
  );
}
