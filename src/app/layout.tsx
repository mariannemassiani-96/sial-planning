import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "SIAL + ISULA — Planning Industriel",
  description: "Planning industriel Groupe VISTA — Menuiserie PVC/ALU, Biguglia, Corse",
  manifest: "/manifest.json",
  themeColor: "#0D1B2A",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
