import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";

import { Toaster } from "@/components/ui/toast";
import { Providers } from "./providers";
import "./globals.css";

/**
 * One variable superfamily with a width axis. Weights and reps go in the
 * expanded cut at heavy weight, everything else in the regular cut: one family,
 * two clearly different voices, no font pairing to get wrong.
 *
 * The shadcn preset ships Noto Serif and Public Sans; both are dropped and the
 * `--font-sans` and `--font-heading` slots point at Archivo instead.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Setwise",
  description: "A workout log built around progressive overload.",
};

export const viewport: Viewport = {
  // The phone is the only viewport that matters. Zooming is left enabled on
  // purpose; disabling it to stop mistypes would break the app for anyone who
  // needs to magnify it.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes writes the theme class on <html>
    // before paint, so the server markup and the first client render disagree
    // on this one attribute by design.
    <html lang="en" className={`${archivo.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <div className="app-root">
          <Providers>{children}</Providers>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
