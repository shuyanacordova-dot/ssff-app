import type { SupabaseClient } from "@supabase/supabase-js";
import { aFormatoMeta, desdeFormatoMeta, ejemploValores, plantillasConocidas, type PlantillaMensaje } from "@/lib/plantillas-mensajes";

// Conexión con las plantillas de Meta (solo en el servidor; usa WHATSAPP_TOKEN).
// Cuenta de WhatsApp Business de ShuVision: ahí viven las plantillas de Shuvision, Sacha y Focus.
export const WABA_ID = "103661679039116";
const GRAPH = "https://graph.facebook.com/v21.0";

type MetaTemplate = { id: string; name: string; status: string; category: string; rejected_reason?: string; components: { type: string; text?: string; format?: string }[] };

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("Falta conectar WhatsApp (token de Meta).");
  const res = await fetch(`${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string; error_user_msg?: string } };
  if (!res.ok) throw new Error(json.error?.error_user_msg || json.error?.message || `Meta respondió ${res.status}`);
  return json;
}

const listarMeta = async () => (await graph<{ data: MetaTemplate[] }>(`/${WABA_ID}/message_templates?fields=id,name,status,category,rejected_reason,components&limit=200`)).data ?? [];

// Trae de Meta las plantillas conocidas y el estado de las creadas desde LumOS; activa las aprobadas si falta una activa.
export async function sincronizarPlantillas(supabase: SupabaseClient) {
  const meta = await listarMeta();
  const { data: filas } = await supabase.from("plantillas_mensajes").select("id,empresa_id,tipo,nombre_meta,activa,estado");
  const existentes = (filas ?? []) as Pick<PlantillaMensaje, "id" | "empresa_id" | "tipo" | "nombre_meta" | "activa" | "estado">[];
  for (const conocida of plantillasConocidas) {
    const t = meta.find((m) => m.name === conocida.nombre);
    if (!t) continue;
    const cuerpo = t.components.find((c) => c.type === "BODY")?.text ?? "";
    for (const empresa of conocida.empresas) {
      const fila = existentes.find((f) => f.empresa_id === empresa && f.nombre_meta === conocida.nombre);
      const datos = { estado: t.status, motivo_rechazo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null, meta_id: t.id, categoria: t.category === "UTILITY" ? "UTILITY" : "MARKETING", actualizado_en: new Date().toISOString() };
      if (fila) await supabase.from("plantillas_mensajes").update(datos).eq("id", fila.id);
      else await supabase.from("plantillas_mensajes").insert({ ...datos, empresa_id: empresa, tipo: conocida.tipo, nombre_meta: conocida.nombre, texto: desdeFormatoMeta(cuerpo, conocida.variables), variables: conocida.variables, imagen: conocida.imagen ?? null });
    }
  }
  for (const fila of existentes.filter((f) => !plantillasConocidas.some((c) => c.nombre === f.nombre_meta))) {
    const t = meta.find((m) => m.name === fila.nombre_meta);
    if (t) await supabase.from("plantillas_mensajes").update({ estado: t.status, meta_id: t.id, motivo_rechazo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null, actualizado_en: new Date().toISOString() }).eq("id", fila.id);
  }
  // Si un tipo no tiene plantilla activa, se activa la aprobada más reciente.
  const { data: todas } = await supabase.from("plantillas_mensajes").select("id,empresa_id,tipo,activa,estado,creado_en").order("creado_en", { ascending: false });
  const lista = (todas ?? []) as Pick<PlantillaMensaje, "id" | "empresa_id" | "tipo" | "activa" | "estado" | "creado_en">[];
  for (const fila of lista) {
    if (fila.estado !== "APPROVED") continue;
    if (lista.some((o) => o.empresa_id === fila.empresa_id && o.tipo === fila.tipo && o.activa)) continue;
    await supabase.from("plantillas_mensajes").update({ activa: true }).eq("id", fila.id);
    fila.activa = true;
  }
}

// Envía a Meta una plantilla nueva escrita en LumOS (queda "PENDING" hasta que Meta la apruebe).
export async function enviarPlantillaAMeta(plantilla: Pick<PlantillaMensaje, "nombre_meta" | "categoria" | "texto">) {
  const { text, variables } = aFormatoMeta(plantilla.texto.trim());
  const ejemplo = variables.map((v) => ejemploValores[v] ?? "ejemplo");
  const body = { name: plantilla.nombre_meta, language: "es_EC", category: plantilla.categoria, components: [{ type: "BODY", text, ...(variables.length ? { example: { body_text: [ejemplo] } } : {}) }] };
  const res = await graph<{ id: string; status: string; category?: string }>(`/${WABA_ID}/message_templates`, { method: "POST", body: JSON.stringify(body) });
  return { meta_id: res.id, estado: res.status, categoria: res.category, variables };
}
