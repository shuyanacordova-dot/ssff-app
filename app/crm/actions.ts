"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function registrarContactoCrm(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_contacto_crm", {
    p_paciente: text(form, "paciente_id"),
    p_empresa: text(form, "empresa_id"),
    p_sucursal: text(form, "sucursal_id") || null,
    p_motivo: text(form, "motivo"),
    p_canal: text(form, "canal") || "whatsapp",
    p_resultado: text(form, "resultado") || "enviado",
    p_nota: text(form, "nota") || null,
    p_proximo: text(form, "proximo_seguimiento") || null,
    p_referencia: text(form, "referencia_id") || null,
  });
  if (error) throw new Error(error.message || "No se pudo registrar el contacto.");
  revalidatePath("/crm");
}

export type ContactoCrm = { id: string; creado_en: string; motivo: string; canal: string; resultado: string; nota: string | null; proximo_seguimiento: string | null; autor: string | null };

export async function obtenerHistorialCrm(pacienteId: string): Promise<ContactoCrm[]> {
  if (!pacienteId) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("crm_historial", { p_paciente: pacienteId });
  if (error) return [];
  return (data ?? []) as ContactoCrm[];
}
