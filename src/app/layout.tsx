import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import "./globals.css";

// Display voice: logo, headings, CTAs. globals.css points BOTH --font-display
// and --font-heading at it, so shadcn's Card/Dialog/Sheet titles inherit it
// without a single override.
const baloo = Baloo_2({
  subsets: ["latin"],
  variable: "--font-baloo",
});

// Body and UI. Everything that is read rather than announced.
const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "dipia",
  description: "simula la vida que aún no ha pasado",
};

// Light-only: the dark theme was retired with the Dipia system. `colorScheme`
// makes native UI (scrollbars, date pickers, autofill) follow suit.
export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f1e3",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={cn("h-full", "antialiased", baloo.variable, nunito.variable)}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
