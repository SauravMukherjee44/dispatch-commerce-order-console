import type { Metadata } from "next";
import { Inventory } from "@/components/inventory";

export const metadata: Metadata = { title: "New order" };

export default function NewOrderPage() {
  return <Inventory building />;
}
