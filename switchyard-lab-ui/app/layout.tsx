import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeMo Switchyard Lab | Dell Technologies APJ AI Innovation Hub",
  description:
    "Hands-on lab console from the Dell Technologies APJ AI Innovation Hub: set up, configure and observe an NVIDIA NeMo Switchyard router deciding which model serves each turn.",
  applicationName: "NeMo Switchyard Lab Console",
  authors: [{ name: "Dell Technologies APJ AI Innovation Hub" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
