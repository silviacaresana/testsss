import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VerificheLab — Matematica e Fisica",
    template: "%s · VerificheLab",
  },
  description:
    "Generatore dipartimentale di verifiche di Matematica e Fisica: programmi, wizard, LaTeX, PDF, soluzioni e griglie di valutazione.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1d4d3b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
