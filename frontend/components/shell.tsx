"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  Box, Boxes, Check, CircleAlert, ClipboardList, Command,
  Layers, Package, Search, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { SWRConfig } from "swr";
import { type Product, request } from "@/lib/orders";

type Notice = { text: string; tone: "success" | "error" };
type Cart = Record<number, number>;
type DispatchState = {
  cart: Cart;
  adjustCart: (product: Product, delta: number) => void;
  clearCart: () => void;
  notify: (text: string, tone?: Notice["tone"]) => void;
};

const DispatchContext = createContext<DispatchState | null>(null);

export function useDispatch() {
  const context = useContext(DispatchContext);
  if (!context) throw new Error("The Dispatch shell is required.");
  return context;
}

const links = [
  { href: "/", label: "Orders", icon: ClipboardList },
  { href: "/catalogue", label: "Catalogue", icon: Boxes },
  { href: "/operations", label: "Operations", icon: Box },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const router = useRouter();
  const [cart, setCart] = useState<Cart>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const isNew = pathname === "/orders/new";
  const active = links.find(({ href }) => href === pathname)?.label ?? "Orders";
  const current = isNew ? "New order" : active;

  const openSearch = useCallback(() => {
    const input = document.getElementById("order-search");
    if (input) {
      input.scrollIntoView({ block: "nearest" });
      input.focus({ preventScroll: true });
    } else {
      router.push("/#order-search");
    }
  }, [router]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [openSearch]);

  useEffect(() => {
    if (!notice || notice.tone === "error") return;
    const timeout = window.setTimeout(() => setNotice(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function adjustCart(product: Product, delta: number) {
    setCart((current) => {
      const quantity = (current[product.id] ?? 0) + delta;
      if (delta > 0 && quantity > product.stock) return current;
      const next = { ...current };
      if (quantity <= 0) delete next[product.id];
      else next[product.id] = quantity;
      return next;
    });
  }

  function notify(text: string, tone: Notice["tone"] = "success") {
    setNotice({ text, tone });
  }

  return (
    <MotionConfig reducedMotion="user">
      <SWRConfig value={{ fetcher: request, errorRetryCount: 1 }}>
        <DispatchContext.Provider value={{ cart, adjustCart, clearCart: () => setCart({}), notify }}>
          <a className="skip-link" href="#content">Skip to content</a>
          <div className="app-layout">
            <aside className="sidebar">
              <Link className="brand" href="/" aria-label="Dispatch home">
                <span className="brand-mark"><Package size={22} strokeWidth={2.2} /></span>
                <span>Dispatch<span className="brand-caption">Order console</span></span>
              </Link>

              <div className="sidebar-nav-group">
                <div className="section-label">Workspace</div>
                <nav className="sidebar-nav" aria-label="Workspace">
                  {links.map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href} className={active === label ? "nav-item active" : "nav-item"}
                      aria-current={current === label ? "page" : undefined}>
                      <Icon size={18} /><span>{label}</span>
                    </Link>
                  ))}
                </nav>
              </div>

              <div className="store-card">
                <div className="store-avatar"><Layers size={18} /></div>
                <div><strong>Morrow Supply</strong><span>Store workspace</span></div>
              </div>
            </aside>

            <div className="app-body">
              <header className="topbar">
                <div className="breadcrumbs"><Layers size={15} /><span>Workspace</span><span className="crumb-divider">/</span><strong>{current}</strong></div>
                <button type="button" className="quick-search" onClick={openSearch} aria-keyshortcuts="Control+K Meta+K">
                  <Search size={16} /><span>Find an order</span><kbd><Command size={11} /> K</kbd>
                </button>
              </header>
              <main className="content" id="content" tabIndex={-1}>{children}</main>
            </div>
          </div>

          <AnimatePresence>
            {notice && (
              <motion.div className={`toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18 }}>
                <div className="toast-icon">{notice.tone === "success" ? <Check size={17} /> : <CircleAlert size={17} />}</div>
                <span>{notice.text}</span>
                <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={16} /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </DispatchContext.Provider>
      </SWRConfig>
    </MotionConfig>
  );
}
