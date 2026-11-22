"use client";

import { motion } from "framer-motion";
import { CircleAlert, ClipboardList, Package, Search, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { OrderHero } from "@/components/hero";
import { OrderDetail } from "@/components/order-detail";
import { EmptyState, Loading, StatusBadge, statusStyle } from "@/components/ui";
import { formatDate, itemCount, money, type OrderListing, ordersPath, statuses, type Status } from "@/lib/orders";

export function OrdersDashboard() {
  const reference = useSearchParams().get("order");
  const initial = reference && /^ORD-\d+$/i.test(reference) ? reference.toUpperCase() : null;
  return <Dashboard key={initial ?? "orders"} initial={initial} />;
}

function Dashboard({ initial }: { initial: string | null }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [selection, setSelection] = useState<string | null>(initial);
  const searchInput = useRef<HTMLInputElement>(null);
  const details = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.location.hash === "#order-search") searchInput.current?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 150);
    return () => window.clearTimeout(timer);
  }, [search]);

  const parameters = new URLSearchParams();
  if (query) parameters.set("q", query);
  if (status) parameters.set("status", status);
  const { data: totals } = useSWR<OrderListing>(ordersPath);
  const { data: listing, error, mutate } = useSWR<OrderListing>(
    parameters.size ? `${ordersPath}?${parameters}` : ordersPath
  );

  const rows = listing?.orders ?? [];
  const selected = selection ?? rows[0]?.reference ?? null;

  function choose(reference: string) {
    setSelection(reference);
    if (window.matchMedia("(max-width: 1140px)").matches) {
      details.current?.focus({ preventScroll: true });
      details.current?.scrollIntoView({ block: "start" });
    }
  }

  function updateStatus(value: Status | "") {
    setStatus(value);
    setSelection(null);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setSelection(null);
  }

  function clearFilters() {
    updateSearch("");
    updateStatus("");
    searchInput.current?.focus();
  }

  return (
    <>
      <OrderHero />
      <section className="metrics" aria-label="Orders by status">
        {statuses.map((name) => {
          const { tone, icon: Icon, description } = statusStyle[name];
          return (
            <motion.button key={name} type="button" className={`metric ${tone}`} aria-pressed={status === name}
              whileTap={{ scale: .98 }} onClick={() => updateStatus(status === name ? "" : name)}>
              <span className="metric-icon"><Icon size={19} /></span>
              <span className="metric-body">
                <span className="metric-name">{name}</span>
                <strong>{(totals ?? listing)?.counts[name] ?? "—"}</strong>
                <span className="metric-description">{description}</span>
              </span>
            </motion.button>
          );
        })}
      </section>
      <div className="order-workspace">
        <section className="panel orders-panel" aria-labelledby="order-list-title">
          <div className="list-head">
            <div className="title-with-count"><h2 id="order-list-title">Orders</h2><span className="count">{listing?.orders.length ?? "—"}</span></div>
            <div className="search-field">
              <Search size={17} />
              <input ref={searchInput} id="order-search" type="search" placeholder="Search by reference…"
                aria-label="Search by order reference" autoComplete="off" value={search}
                onChange={(event) => updateSearch(event.target.value)} />
              {search && <button type="button" className="icon-button" onClick={() => updateSearch("")} aria-label="Clear search"><X size={15} /></button>}
            </div>
          </div>
          <div className="status-filters" role="group" aria-label="Filter by status">
            {(["", ...statuses] as const).map((name) => (
              <button type="button" key={name} aria-pressed={name === status} onClick={() => updateStatus(name)}>
                {status === name && <motion.span className="filter-active" layoutId="selected-filter" transition={{ duration: .19 }} />}
                <span>{name || "All orders"}</span>
              </button>
            ))}
          </div>
          {!listing && !error ? <Loading label="Loading orders" rows={4} /> : error && !listing ? (
            <EmptyState icon={CircleAlert} title="Couldn’t load orders" description={error.message}>
              <button type="button" className="button secondary small" onClick={() => void mutate()}>Retry</button>
            </EmptyState>
          ) : rows.length ? (
            <>
              <table className="order-table">
                <thead>
                  <tr><th scope="col">Reference</th><th scope="col" className="date-column">Created</th><th scope="col">Status</th><th scope="col" className="amount">Total</th></tr>
                </thead>
                <tbody>
                  {rows.map((order) => (
                    <tr key={order.reference} className={selected === order.reference ? "selected" : ""} onClick={() => choose(order.reference)}>
                      <td>
                        <div className="table-reference">
                          <span className="table-icon"><Package size={17} /></span>
                          <div>
                            <button type="button" aria-controls="order-detail" aria-expanded={selected === order.reference}>{order.reference}</button>
                            <span>{itemCount(order.units)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="date-column"><time dateTime={order.created_at}>{formatDate(order.created_at)}</time></td>
                      <td><StatusBadge status={order.status} /></td>
                      <td className="amount">{money(order.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="list-foot" aria-live="polite">Showing {rows.length} {rows.length === 1 ? "order" : "orders"}</div>
            </>
          ) : query || status ? (
            <EmptyState icon={SearchX} title="No matching orders" description="Try a different reference or clear your filters.">
              <button type="button" className="button secondary small" onClick={clearFilters}>Clear filters</button>
            </EmptyState>
          ) : (
            <EmptyState icon={ClipboardList} title="No orders yet" description="Create your first order to start tracking fulfilment.">
              <Link href="/orders/new" className="button secondary small">Create an order</Link>
            </EmptyState>
          )}
        </section>
        <section className="panel detail-panel" id="order-detail" aria-label="Order details" tabIndex={-1} ref={details}>
          <motion.div key={selected ?? "empty"} initial={{ opacity: .5, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .19 }}>
            <OrderDetail reference={selected} pin={setSelection} />
          </motion.div>
        </section>
      </div>
    </>
  );
}
