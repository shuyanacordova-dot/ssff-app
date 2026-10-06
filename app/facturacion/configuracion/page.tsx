import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import ConfigBoard, { type EmisorSri } from "./config-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ConfiguracionSriPage() {
  let emisores: EmisorSri[] = [];
  let mensaje = "";
  try {
    const supabase = await createSupabaseServerClient();
    const permiso = await supabase.rpc("es_superadmin");
    if (permiso.error || permiso.data !== true) mensaje = "Solo la Superadministradora puede configurar la facturación";
    else {
      // RLS revisada en 20260925050150_emisores_sri.sql. Lectura privilegiada
      // solo tras verificar el permiso; nunca seleccionar rutas ni secretos.
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.from("emisores_sri").select("id,razon_social,ruc,regimen,obligado_contabilidad,nombre_comercial,direccion_matriz,direccion_establecimiento,codigo_establecimiento,punto_emision,ambiente,siguiente_secuencial,firma_cargada,firma_titular,firma_vence,sucursales(nombre)").order("codigo_establecimiento");
      if (error) mensaje = "No se pudo cargar la configuración SRI.";
      else emisores = (data ?? []).map((emisor) => ({ ...emisor, sucursal: (Array.isArray(emisor.sucursales) ? emisor.sucursales[0] : emisor.sucursales)?.nombre ?? "Sin sucursal" }));
    }
  } catch { mensaje = "No se pudo cargar la configuración SRI."; }
  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/facturacion">← Facturación</Link><p className="eyebrow">ADMINISTRACIÓN</p><h1>Configuración SRI</h1></div></header>
    {mensaje ? <p className="notice" role="alert">{mensaje}</p> : <ConfigBoard emisores={emisores} hoy={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())} />}
  </div></main>;
}
