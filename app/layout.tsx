import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600"], style: ["normal", "italic"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-body", weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "SSFF | Sistema Óptico",
  description: "Sistema de gestión de ShuVision y Focus",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${fraunces.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
