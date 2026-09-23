import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import AppNavigation from "./app-navigation";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600"], style: ["normal", "italic"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-body", weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "LumOS | Sistema Óptico",
  description: "LumOS, el sistema de gestión de Shuvisión y Focus",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${fraunces.variable} ${manrope.variable}`}>
      <body><AppNavigation />{children}</body>
    </html>
  );
}
