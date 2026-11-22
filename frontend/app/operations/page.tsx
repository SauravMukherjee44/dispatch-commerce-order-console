import type { Metadata } from "next";
import { Suspense } from "react";
import { Operations } from "@/components/operations/operations";
import { Loading } from "@/components/ui";
import "./operations.css";

export const metadata: Metadata = { title: "Operations" };

export default function OperationsPage() {
  return <Suspense fallback={<Loading label="Loading operations" />}><Operations /></Suspense>;
}
