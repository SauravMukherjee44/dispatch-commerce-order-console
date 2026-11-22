"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Boxes, Check, CircleAlert, Minus, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useDispatch } from "@/components/shell";
import { EmptyState, Loading, ProductPhoto } from "@/components/ui";
import { itemCount, money, type Order, orderPath, ordersPath, type Product, productsPath, send } from "@/lib/orders";

function ProductCard({ product, quantity, add, pending }: {
  product: Product; quantity: number; add: () => void; pending: boolean;
}) {
  const unavailable = product.stock === 0;
  const max = quantity >= product.stock;
  const stockTone = unavailable ? "out" : product.stock <= 5 ? "low" : "in";
  return (
    <motion.article className="product-card" whileHover={{ y: -2 }} transition={{ duration: .16 }}>
      <div className="product-media">
        <ProductPhoto image={product.image} className="product-image" />
        <span className={`stock-badge ${stockTone}`}><i aria-hidden="true" />{unavailable ? "Out of stock" : `${product.stock} in stock`}</span>
      </div>
      <div className="product-content">
        <p>{product.sku}<i />{product.category}</p>
        <h3>{product.name}</h3>
        <div className="product-action">
          <strong>{money(product.unit_cents)}</strong>
          <motion.button type="button" className="button secondary small" whileTap={{ scale: .96 }}
            onClick={add} disabled={max || pending} aria-label={`Add ${product.name}`}>
            {!max && <Plus size={15} />}{unavailable ? "Unavailable" : max ? "Max added" : "Add"}
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}

export function Inventory({ building = false }: { building?: boolean }) {
  const { cart, adjustCart, clearCart, notify } = useDispatch();
  const { data, error, mutate: refreshProducts } = useSWR<{ products: Product[] }>(productsPath);
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const inFlight = useRef(false);
  const summary = useRef<HTMLElement>(null);

  const products = data?.products ?? [];
  const lines = products.flatMap((product) => {
    const quantity = cart[product.id] ?? 0;
    return quantity ? [{ product, quantity, subtotal: product.unit_cents * quantity }] : [];
  });
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const shortage = lines.some(({ product, quantity }) => quantity > product.stock);
  const canPlace = !!lines.length && !shortage && !pending && Object.keys(cart).length === lines.length;

  function change(product: Product, delta: number) {
    if (inFlight.current) return;
    setErrorMessage("");
    adjustCart(product, delta);
    if (!building && delta > 0) router.push("/orders/new");
  }

  async function place() {
    if (!canPlace || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setErrorMessage("");
    try {
      const order = await send<Order>(ordersPath, "POST", {
        items: lines.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
      });
      clearCart();
      void mutate(orderPath(order.reference), order, { revalidate: false });
      void refreshProducts();
      void mutate((key) => typeof key === "string" && (key === ordersPath || key.startsWith(`${ordersPath}?`)));
      notify(`${order.reference} placed. Inventory updated.`);
      router.push(`/?order=${order.reference}`);
    } catch (failure) {
      setErrorMessage((failure as Error).message);
      void refreshProducts();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <header className="inventory-header">
        <div>
          <h1>{building ? "New order" : "Catalogue"}</h1>
          <p>{building ? "Build an order from available stock and review the total." : "Browse products and check how many units are available."}</p>
        </div>
        {building ? <Link href="/" className="button secondary">Back to orders</Link> :
          <Link href="/orders/new" className="button primary"><Plus size={18} /> New order</Link>}
      </header>
      <div className={`inventory-workspace${building ? " building" : ""}`}>
        <section aria-labelledby="catalogue-heading">
          <div className="inventory-heading">
            <div className="title-with-count">
              <h2 id="catalogue-heading">Products</h2><span className="count">{data ? products.length : "—"}</span>
            </div>
            {building && count > 0 && (
              <button type="button" className="button secondary small jump-summary" onClick={() => summary.current?.focus()}>
                <ShoppingBag size={16} /> {itemCount(count)} · {money(total)}
              </button>
            )}
          </div>
          {!data && error ? (
            <div className="panel"><EmptyState icon={CircleAlert} title="Couldn’t load catalogue" description={error.message}>
              <button type="button" className="button secondary small" onClick={() => void refreshProducts()}>Retry</button>
            </EmptyState></div>
          ) : !data ? <div className="panel"><Loading label="Loading products" /></div> : (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} quantity={cart[product.id] ?? 0}
                  add={() => change(product, 1)} pending={pending} />
              ))}
            </div>
          )}
        </section>
        {building && (
          <section className="panel basket" aria-labelledby="basket-title" ref={summary} tabIndex={-1}>
            <div className="basket-head">
              <span className="basket-mark"><ShoppingBag size={20} /></span>
              <div><h2 id="basket-title">Order summary</h2><p aria-live="polite">{itemCount(count)}</p></div>
            </div>
            {!lines.length ? (
              <EmptyState icon={Boxes} title="Your order is empty" description="Add products to see them here." />
            ) : (
              <ul className="basket-lines">
                <AnimatePresence initial={false}>
                  {lines.map(({ product, quantity, subtotal }) => (
                    <motion.li key={product.id} className="basket-line" layout
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: .15 }}>
                      <ProductPhoto image={product.image} className="thumbnail" />
                      <div className="line-name">
                        <strong>{product.name}</strong><span>{money(product.unit_cents)} each</span>
                        {quantity > product.stock && <span className="line-error">Only {product.stock} available</span>}
                      </div>
                      <strong>{money(subtotal)}</strong>
                      <div className="quantity" role="group" aria-label={`Quantity for ${product.name}`}>
                        <button type="button" className="icon-button" onClick={() => change(product, -1)}
                          aria-label={`${quantity === 1 ? "Remove" : "Decrease"} ${product.name}`} disabled={pending}><Minus size={14} /></button>
                        <span>{quantity}</span>
                        <button type="button" className="icon-button" onClick={() => change(product, 1)}
                          aria-label={`Increase ${product.name}`} disabled={pending || quantity >= product.stock}><Plus size={14} /></button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
            <div className="basket-footer">
              <div className="total-row"><span>Order total</span><strong>{money(total)}</strong></div>
              {errorMessage && <p className="inline-error" role="alert"><CircleAlert size={16} />{errorMessage}</p>}
              <motion.button type="button" className="button primary place-button" disabled={!canPlace}
                whileTap={{ scale: .98 }} onClick={() => void place()}>
                <Check size={18} /> {pending ? "Placing order…" : "Place order"}
              </motion.button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
