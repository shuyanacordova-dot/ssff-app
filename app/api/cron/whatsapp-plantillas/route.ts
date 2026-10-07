import { NextResponse } from "next/server";
import { limpiarWhatsapp, mensajeControlAnual, mensajeCumpleanos } from "@/lib/mensajes-dia-textos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sincronizarPlantillas } from "@/lib/plantillas-meta";

// Crea en Meta (cuenta de WhatsApp de ShuVision) las plantillas que faltan para el envío automático y devuelve
// su estado de aprobación. Protegido con CRON_SECRET. Se puede llamar varias veces: solo crea las que no existen.
export const dynamic = "force-dynamic";
const WABA = "103661679039116";
const FOCUS = "be1dc246-219a-40a2-9e92-707e5845d295";

type Definicion = { name: string; category: "UTILITY" | "MARKETING"; text: string; ejemplo: string[] };
// Las plantillas de Meta usan {{1}}, {{2}}…: se reemplaza el nombre de ejemplo por {{1}}.
const conVariable = (texto: string) => texto.replace("María", "{{1}}");

const definiciones: Definicion[] = [
  { name: "recordatorio_control_periodico", category: "UTILITY", ejemplo: ["María", "ShuVision Óptica", "6"],
    text: "Hola {{1}} 👋, te saludamos de {{2}}.\n\nEn tu última revisión te indicamos un control visual a los {{3}} meses y ya es momento de hacerlo. 👁️\n\nRevisaremos cómo va tu visión y si tu graduación sigue siendo la adecuada.\n\n📅 Agenda tu control respondiendo a este mensaje. ¡Te esperamos! 💙" },
  { name: "feliz_cumpleanos_focus2", category: "MARKETING", ejemplo: ["María"], text: conVariable(limpiarWhatsapp(mensajeCumpleanos("María", FOCUS))) },
  { name: "recordatorio_control_anual_focus2", category: "MARKETING", ejemplo: ["María"], text: conVariable(limpiarWhatsapp(mensajeControlAnual("María", FOCUS))) },
  { name: "recordatorio_cobro_focus", category: "UTILITY", ejemplo: ["María", "45.00", "15/10/2026"],
    text: "Hola {{1}}, te recordamos que tienes un saldo pendiente de ${{2}} en Focus Óptica, con fecha de pago {{3}}.\nSi ya realizaste el pago, ignora este mensaje. Si necesitas información sobre tu saldo, responde a este mensaje." },
  { name: "cobranza_insistente_focus", category: "UTILITY", ejemplo: ["María"],
    text: "Hola {{1}} 👋\n*Te recordamos que tienes un saldo pendiente con Focus Óptica.*\nQueremos ayudarte a mantener tu cuenta al día.\n\nSi ya realizaste un abono, por favor comunícanoslo para actualizar tu saldo.\n\nSi necesitas información sobre tu deuda o deseas indicarnos cuándo podrás realizar tu próximo abono, responde a este mensaje y con gusto te ayudaremos.\n\nFocus Óptica — cuidamos tu visión. 👁️" },
  { name: "apartado_recordatorio_focus", category: "MARKETING", ejemplo: ["María"],
    text: "Hola {{1}} 👋\n\nTe recordamos que tienes un lente en *sistema de apartado en Focus Óptica*. 👓✨\n\nNuestro objetivo es que puedas completar tu apartado dentro del tiempo recomendado. Lo ideal es que no transcurran más de *3 meses*, ya que tu graduación puede variar y podría ser necesario realizar un nuevo examen visual antes de elaborar tus lentes.\n\nSi necesitas información sobre tu sistema de apartado, responde a este mensaje y con gusto te ayudaremos.\n\n*Focus Óptica — cuidamos tu visión. 👁️💙*" },
];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return NextResponse.json({ error: "Falta WHATSAPP_TOKEN" }, { status: 400 });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const existentes = await fetch(`https://graph.facebook.com/v21.0/${WABA}/message_templates?fields=name,status&limit=200`, { headers }).then((r) => r.json()) as { data?: { name: string; status: string }[] };
  const resultado: Record<string, unknown> = {};
  for (const def of definiciones) {
    const ya = existentes.data?.find((t) => t.name === def.name);
    if (ya) { resultado[def.name] = ya.status; continue; }
    const res = await fetch(`https://graph.facebook.com/v21.0/${WABA}/message_templates`, {
      method: "POST", headers,
      body: JSON.stringify({ name: def.name, language: "es_EC", category: def.category, components: [{ type: "BODY", text: def.text, example: { body_text: [def.ejemplo] } }] }),
    });
    resultado[def.name] = await res.json().catch(() => res.status);
  }
  // Importa a LumOS (Mensajes del día → Plantillas) las plantillas y su estado.
  await sincronizarPlantillas(createSupabaseAdminClient());
  return NextResponse.json(resultado);
}
