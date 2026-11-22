import { Suspense } from "react";
import { OrderHero } from "@/components/hero";
import { OrdersDashboard } from "@/components/orders-dashboard";
import { Loading } from "@/components/ui";

export default function OrdersPage() {
  return <Suspense fallback={<><OrderHero /><Loading label="Loading orders" /></>}><OrdersDashboard /></Suspense>;
}
