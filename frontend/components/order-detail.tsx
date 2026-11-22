"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Box, Check, CircleAlert, ClipboardList, PackageCheck, Truck } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { formatDate, itemCount, money, type Order, orderPath, ordersPath, productsPath, send, statuses, type Status } from "@/lib/orders";
import { useDispatch } from "@/components/shell";
import { EmptyState, Loading, ProductPhoto, StatusBadge, statusStyle } from "@/components/ui";

type Transition = "Packed" | "Shipped" | "Cancelled";
const nextStatus: Partial<Record<Status, Transition>> = { Placed: "Packed", Packed: "Shipped" };

function Fulfilment({ status }: { status: Status }) {
  if (status === "Cancelled") {
    return <p className="cancelled-note"><CircleAlert size={16} /> This order was cancelled and its stock was returned.</p>;
  }

  const current = statuses.indexOf(status);
  return (
    <ol className="fulfilment" aria-label="Fulfilment progress">
      {statuses.slice(0, 3).map((stage, index) => {
        const Icon = index < current ? Check : statusStyle[stage].icon;
        return (
          <li key={stage} className={index < current ? "complete" : index === current ? "current" : ""}
            aria-current={index === current ? "step" : undefined}>
            <span className="step-icon"><Icon size={15} /></span><span>{stage}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderDetail({ reference, pin }: { reference: string | null; pin: (reference: string) => void }) {
  const key = reference ? orderPath(reference) : null;
  const { data: order, error, mutate: refresh } = useSWR<Order>(key);
  const { mutate } = useSWRConfig();
  const { notify } = useDispatch();
  const [busy, setBusy] = useState<Transition | null>(null);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  async function transition(status: Transition) {
    if (!reference || !key || inFlight.current) return;
    inFlight.current = true;
    setBusy(status);
    pin(reference);
    try {
      const updated = await send<Order>(`${key}/status`, "PATCH", { status });
      await refresh(updated, { revalidate: false });
      void mutate((cached) => typeof cached === "string" && (
        cached === ordersPath || cached.startsWith(`${ordersPath}?`) || cached === productsPath
      ));
      if (status === "Cancelled") notify(`${reference} cancelled. Stock returned to the catalogue.`);
      else notify(`${reference} marked as ${status.toLowerCase()}.`);
    } catch (failure) {
      notify((failure as Error).message, "error");
      void refresh();
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  }

  if (!reference) {
    return <EmptyState icon={ClipboardList} title="Select an order" description="Choose a reference to see its items and fulfilment status." />;
  }
  if (!order && error) {
    return <EmptyState icon={CircleAlert} title="Couldn’t load order" description={error.message}>
      <button type="button" className="button secondary small" onClick={() => void refresh()}>Retry</button>
    </EmptyState>;
  }
  if (!order) return <Loading label="Loading order details" />;
  const next = nextStatus[order.status];

  return (
    <>
      <div className="detail-head">
        <div className="detail-label"><ClipboardList size={15} /> Order details</div>
        <div className="detail-ref">
          <div>
            <h2 id="detail-reference" tabIndex={-1}>{reference}</h2>
            <time dateTime={order.created_at}>{formatDate(order.created_at, true)}</time>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={order.status} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.12 }}>
              <StatusBadge status={order.status} />
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      <div className="detail-section">
        <h3>Fulfilment</h3>
        <Fulfilment status={order.status} />
      </div>
      <div className="detail-section">
        <div className="detail-section-title"><h3>Items</h3><span>{itemCount(order.units)}</span></div>
        <ul className="line-items">
          {order.items.map((item) => (
            <li className="order-line" key={item.product_id}>
              <ProductPhoto image={item.image} className="thumbnail" />
              <div className="line-name"><strong>{item.name}</strong><span>Qty {item.quantity} × {money(item.unit_cents)}</span></div>
              <strong>{money(item.subtotal_cents)}</strong>
            </li>
          ))}
        </ul>
      </div>
      <div className="detail-footer">
        <div className="total-row"><span>Order total</span><strong>{money(order.total_cents)}</strong></div>
        {next && (
          <div className="detail-actions">
            <motion.button type="button" className="button primary" whileTap={{ scale: .98 }}
              disabled={!!busy} onClick={() => void transition(next)}>
              {next === "Packed" ? <PackageCheck size={17} /> : <Truck size={17} />}
              {busy === next ? "Updating…" : `Mark as ${next.toLowerCase()}`}
            </motion.button>
            <button type="button" className="button text-danger" disabled={!!busy} onClick={() => {
              if (!dialog.current) return;
              dialog.current.returnValue = "";
              dialog.current.showModal();
            }}>{busy === "Cancelled" ? "Cancelling…" : "Cancel order"}</button>
          </div>
        )}
        <Link className="simulation-link" href={`/operations?order=${reference}`}><Box size={15} /> Simulate fulfilment</Link>
      </div>
      <dialog className="confirmation" ref={dialog} aria-labelledby="cancel-title" aria-describedby="cancel-instructions"
        onClose={(event) => {
          if (event.currentTarget.returnValue === "cancel") void transition("Cancelled");
        }}>
        <form method="dialog">
          <span className="confirmation-icon"><CircleAlert size={23} /></span>
          <h2 id="cancel-title">Cancel {reference}?</h2>
          <p id="cancel-instructions">This returns the order’s items to available stock.</p>
          <div className="confirmation-actions">
            <button type="submit" className="button secondary" value="keep" autoFocus>Keep order</button>
            <button type="submit" className="button danger" value="cancel">Cancel order</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
