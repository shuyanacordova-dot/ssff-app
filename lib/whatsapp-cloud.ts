import { numeroWhatsapp } from "@/lib/whatsapp";
import { plantillasMeta, primerNombre } from "@/lib/mensajes-dia-textos";

// Envío por la API oficial de WhatsApp (Meta Cloud API) con plantillas aprobadas.
// El token vive solo en la variable de entorno WHATSAPP_TOKEN de Vercel (nunca en el código).
export async function enviarPlantillaWhatsapp({ phoneId, telefono, tipo, nombre }: { phoneId: string; telefono: string | null; tipo: keyof typeof plantillasMeta; nombre: string }): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: "Falta el token de WhatsApp (WHATSAPP_TOKEN)." };
  const to = numeroWhatsapp(telefono);
  if (!to || to.length < 11) return { ok: false, error: "Sin número de WhatsApp válido." };
  const plantilla = plantillasMeta[tipo];
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: plantilla.nombre,
      language: { code: plantilla.idioma },
      components: [
        { type: "header", parameters: [{ type: "image", image: { link: plantilla.imagen } }] },
        { type: "body", parameters: [{ type: "text", text: primerNombre(nombre) || nombre }] },
      ],
    },
  };
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!response.ok) return { ok: false, error: json.error?.message ?? `Error ${response.status}` };
    return { ok: true, id: json.messages?.[0]?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo conectar con WhatsApp." };
  }
}
