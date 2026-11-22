import { Ban, ClipboardList, PackageCheck, Truck, type LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { type Status } from "@/lib/orders";

export const statusStyle: Record<Status, { tone: string; icon: LucideIcon; description: string }> = {
  Placed: { tone: "violet", icon: ClipboardList, description: "Awaiting packing" },
  Packed: { tone: "amber", icon: PackageCheck, description: "Ready to ship" },
  Shipped: { tone: "green", icon: Truck, description: "Dispatched" },
  Cancelled: { tone: "slate", icon: Ban, description: "Stock returned" },
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge ${statusStyle[status].tone}`}><i aria-hidden="true" />{status}</span>;
}

export function ProductPhoto({ image, className }: { image: string; className: string }) {
  return <Image unoptimized className={className} src={`/catalogue/${image}.webp`} alt="" width={416} height={416} />;
}

export function EmptyState({ icon: Icon, title, description, children }: {
  icon: LucideIcon; title: string; description?: string; children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={22} /></span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}

export function Loading({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="loading" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} />)}
    </div>
  );
}
