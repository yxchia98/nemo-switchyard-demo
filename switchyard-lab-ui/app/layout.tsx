import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeMo Switchyard Lab Console",
  description:
    "Observability console for a running NVIDIA NeMo Switchyard router: see which target served each turn, why, and how fast.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
