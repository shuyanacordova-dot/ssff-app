import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

// Imagen de Focus Óptica para cumpleaños y controles (su propia identidad: morado, rosado y celeste).
// Shuvisión usa las imágenes que ya tenía (Cloudinary).
export const dynamic = "force-static";

const textos: Record<string, { titulo: string; sub: string }> = {
  "cumple-focus": { titulo: "¡Feliz cumpleaños!", sub: "15% de descuento + limpieza y ajuste gratis" },
  "control-focus": { titulo: "Tu control visual te espera", sub: "Examen de control gratis para nuestros pacientes" },
};

export async function GET(_request: Request, { params }: { params: Promise<{ clave: string }> }) {
  const { clave } = await params;
  const t = textos[clave] ?? textos["cumple-focus"];
  const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/logos/focus-logo.png"))).toString("base64")}`;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "linear-gradient(135deg, #3d1a78 0%, #5b2a9e 55%, #b14fa8 100%)", padding: 60, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", width: 380, height: 380, borderRadius: 190, background: "#ffffff", alignItems: "center", justifyContent: "center", border: "10px solid #9ff3f4", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={350} height={350} alt="" style={{ borderRadius: 175 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 60, flex: 1 }}>
        <div style={{ fontSize: 76, fontWeight: 800, color: "#ffffff", lineHeight: 1.05 }}>{t.titulo}</div>
        <div style={{ fontSize: 34, color: "#ffd6f2", marginTop: 26 }}>{t.sub}</div>
        <div style={{ fontSize: 30, color: "#9ff3f4", marginTop: 40, letterSpacing: 4 }}>FOCUS ÓPTICA · SHUSHUFINDI</div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
