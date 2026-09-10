import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSFF | Sistema Óptico",
  description: "Sistema de gestión de ShuVision y Focus",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
