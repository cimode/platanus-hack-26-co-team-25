import type { Metadata } from "next";
import { DemoDeck } from "@/components/demo/demo-deck";

/**
 * `/demo` -- the presentation surface for Platanus Hack 26.
 *
 * One route for the whole three minutes: the setup slides and the live app,
 * with no window switch between them. The app appears as a same-origin iframe
 * (see `browser-frame.tsx`), so the gate and session cookies already hold and
 * nothing is mocked -- what the judges see is the product.
 */
export const metadata: Metadata = {
  title: "dipia — demo",
  description: "Platanus Hack 26 · Bogotá",
};

export default function DemoPage() {
  return <DemoDeck />;
}
