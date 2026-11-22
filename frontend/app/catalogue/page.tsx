import type { Metadata } from "next";
import { Inventory } from "@/components/inventory";

export const metadata: Metadata = { title: "Catalogue" };

export default function CataloguePage() {
  return <Inventory />;
}
