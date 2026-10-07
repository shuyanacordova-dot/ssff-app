import type { Metadata } from "next";

// Ícono propio en la pantalla de inicio del iPhone: abre siempre esta pantalla (no el inicio de LumOS).
export const metadata: Metadata = { manifest: "/egreso.webmanifest", appleWebApp: { capable: true, title: "Egreso", statusBarStyle: "default" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
