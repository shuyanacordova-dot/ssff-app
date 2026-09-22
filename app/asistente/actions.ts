"use server";

import { generateText, gateway } from "ai";
import { getOperationalContext } from "@/lib/operational-context";

export type TareaAsistente = "pedido_listo" | "cobro_amable" | "cobro_firme" | "cierre_dia" | "informe_mensual";

const prompts: Record<TareaAsistente, string> = {
  pedido_listo: "Redacta una plantilla breve de WhatsApp para avisar que un pedido de lentes está listo para retirar. Usa marcadores [NOMBRE], [SUCURSAL] y [LINK_TICKET].",
  cobro_amable: "Redacta una plantilla amable de WhatsApp para un recordatorio mensual de pago. Usa marcadores [NOMBRE], [SALDO], [FECHA_PAGO] y [LINK_TICKET].",
  cobro_firme: "Redacta una plantilla firme pero respetuosa de WhatsApp para recordar un saldo vencido. Usa marcadores [NOMBRE], [SALDO], [FECHA_LIMITE] y [LINK_TICKET]. No amenaces ni menciones consecuencias legales.",
  cierre_dia: "Crea un checklist administrativo breve para cerrar el día en una óptica: caja, ventas, abonos, órdenes de laboratorio, agenda del día siguiente y pendientes del equipo.",
  informe_mensual: "Crea una estructura clara para un informe mensual por sucursal de una óptica: ventas, meta, cumplimiento, cobros, cartera, inventario, laboratorio, convenios y acciones del próximo mes. No inventes cifras.",
};

function asistenteConfigurado() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export async function generarAyudaAdministrativa(tarea: TareaAsistente) {
  const context = await getOperationalContext();
  if (!context) throw new Error("Tu sesión terminó o tu acceso está desactivado. Vuelve a iniciar sesión.");
  if (!asistenteConfigurado()) throw new Error("El asistente está construido, pero falta conectar la clave privada de IA en el servidor.");
  if (!Object.hasOwn(prompts, tarea)) throw new Error("La tarea elegida no está disponible.");

  try {
    const result = await generateText({
      model: gateway(process.env.SHU_AI_MODEL ?? "openai/gpt-5.6-luna"),
      instructions: `Eres el Asistente Shu, especializado en administración de ópticas en Ecuador. Responde en español claro, breve y profesional.
No tienes acceso a pacientes, historias clínicas, ventas ni bases de datos. No solicites ni inventes datos personales, clínicos o financieros. No realices diagnósticos ni prescripciones. Entrega únicamente una plantilla o guía general con marcadores visibles para que una persona la revise y complete. No afirmes haber enviado, guardado o modificado nada.`,
      prompt: prompts[tarea],
      maxOutputTokens: 600,
      reasoning: "low",
      providerOptions: { openai: { store: false, reasoningSummary: null } },
    });
    if (!result.text.trim()) throw new Error("El asistente no devolvió contenido.");
    return { text: result.text.trim() };
  } catch (error) {
    if (error instanceof Error && error.message === "El asistente no devolvió contenido.") throw error;
    throw new Error("No se pudo obtener una respuesta. Revisa la conexión privada de IA e inténtalo nuevamente.");
  }
}
