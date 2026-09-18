"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function crearGarantia(form: FormData): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const ventaId = String(form.get("venta_id") || "");
  const ventaItemId = String(form.get("venta_item_id") || "") || null;
  const tipo = String(form.get("tipo") || "");
  const motivo = String(form.get("motivo") || "").trim();
  const notas = String(form.get("notas") || "");
  if (!ventaId) throw new Error("Falta identificar la venta.");
  if (!motivo) throw new Error("Describe el motivo de la garantía.");

  const { data, error } = await supabase.rpc("crear_garantia", { p_venta: ventaId, p_venta_item: ventaItemId, p_tipo: tipo, p_motivo: motivo, p_notas: notas || null });
  if (error) throw new Error(error.message || "No se pudo registrar la garantía.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
  return data as string;
}

export async function vincularOrdenGarantia(garantiaId: string, ordenLaboratorioId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vincular_orden_garantia", { p_garantia: garantiaId, p_orden_laboratorio: ordenLaboratorioId });
  if (error) throw new Error(error.message || "No se pudo vincular la orden de laboratorio.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
}

export async function actualizarEstadoGarantia(garantiaId: string, estado: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("actualizar_estado_garantia", { p_garantia: garantiaId, p_estado: estado });
  if (error) throw new Error(error.message || "No se pudo actualizar el estado de la garantía.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
}
