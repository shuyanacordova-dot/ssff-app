"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Registra que el mensaje (cumpleaños o control) ya se envió por WhatsApp. Queda en el historial
// de Comunicaciones del paciente y el paciente sale de la lista.
export async function marcarMensajeDia(input: { pacienteId: string; empresaId: string; sucursalId: string; motivo: "cumpleanos" | "control"; referenciaId?: string | null }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_contacto_crm", {
    p_paciente: input.pacienteId,
    p_empresa: input.empresaId,
    p_sucursal: input.sucursalId,
    p_motivo: input.motivo,
    p_canal: "whatsapp",
    p_resultado: "enviado",
    p_nota: input.motivo === "cumpleanos" ? "Mensaje de cumpleaños (Mensajes del día)" : "Recordatorio de control anual (Mensajes del día)",
    p_proximo: null,
    p_referencia: input.referenciaId ?? null,
  });
  if (error) throw new Error(error.message || "No se pudo registrar el envío.");
  revalidatePath("/mensajes");
}

export async function configurarMensajesAutomaticos(input: { empresaId: string; activo: boolean; cumpleanos: boolean; control: boolean }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("configurar_mensajes_automaticos", { p_empresa: input.empresaId, p_activo: input.activo, p_cumpleanos: input.cumpleanos, p_control: input.control });
  if (error) throw new Error(error.message || "No se pudo guardar la configuración.");
  revalidatePath("/mensajes");
}
