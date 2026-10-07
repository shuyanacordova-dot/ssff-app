import type { Metadata } from "next";

// Tarjeta pública que acompaña los mensajes de cumpleaños y control: WhatsApp muestra su imagen como vista previa.
const SITIO = "https://ssff-app-shuyanacordova-5372.vercel.app";
const tarjetas: Record<string, { titulo: string; descripcion: string; imagen: string; optica: string }> = {
  "cumple-shuvision": { titulo: "¡Feliz cumpleaños! · ShuVisión", descripcion: "Tu regalo: ajuste gratis y 15% de descuento por un mes.", imagen: "https://res.cloudinary.com/ip1jz9eg/image/upload/v1787675996/ChatGPT_Image_23_ago_2026_23_43_46.png", optica: "ShuVisión" },
  "control-shuvision": { titulo: "Tu control visual te espera · ShuVisión", descripcion: "Examen de control gratuito para nuestros pacientes.", imagen: "https://res.cloudinary.com/ip1jz9eg/image/upload/v1787676005/ChatGPT_Image_23_ago_2026_23_53_31.png", optica: "ShuVisión" },
  "cumple-focus": { titulo: "¡Feliz cumpleaños! · Focus Óptica", descripcion: "15% de descuento y limpieza y ajuste de tus lentes sin costo.", imagen: `${SITIO}/tarjeta-imagen/cumple-focus`, optica: "Focus Óptica" },
  "control-focus": { titulo: "Tu control visual · Focus Óptica", descripcion: "Examen de control gratis para nuestros pacientes.", imagen: `${SITIO}/tarjeta-imagen/control-focus`, optica: "Focus Óptica" },
};

export async function generateMetadata({ params }: { params: Promise<{ clave: string }> }): Promise<Metadata> {
  const t = tarjetas[(await params).clave] ?? tarjetas["cumple-shuvision"];
  return { title: t.titulo, description: t.descripcion, robots: { index: false }, openGraph: { title: t.titulo, description: t.descripcion, images: [{ url: t.imagen, width: 1200, height: 630 }], type: "website" }, twitter: { card: "summary_large_image", images: [t.imagen] } };
}

export default async function Tarjeta({ params }: { params: Promise<{ clave: string }> }) {
  const t = tarjetas[(await params).clave] ?? tarjetas["cumple-shuvision"];
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "#f6f1e7" }}>
    <div style={{ maxWidth: 640, width: "100%", textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={t.imagen} alt={t.titulo} style={{ width: "100%", borderRadius: 18 }} />
      <h1 style={{ fontSize: 24, margin: "16px 0 6px" }}>{t.titulo}</h1>
      <p>{t.descripcion}</p>
    </div>
  </main>;
}
