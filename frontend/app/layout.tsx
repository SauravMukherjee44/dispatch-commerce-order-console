import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: { default: "Orders · Dispatch", template: "%s · Dispatch" },
  description: "Create orders, check stock, and manage fulfilment at Morrow Supply.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><Shell>{children}</Shell></body></html>;
}
