"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function actualizarFrecuenciaCobro(pacienteId: string, frecuencia: string) {
  const supabase = await createSupabaseServerClient();
  if (!pacienteId) throw new Error("Falta identificar al paciente.");
  const { error } = await supabase.rpc("actualizar_frecuencia_cobro", { p_paciente: pacienteId, p_frecuencia: frecuencia || null });
  if (error) throw new Error(error.message || "No se pudo actualizar la frecuencia de cobro.");
  revalidatePath("/cuentas-cobrar");
}
