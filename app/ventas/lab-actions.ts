"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrdenLaboratorio, OrdenLaboratorioMedidas, OrdenLaboratorioRx, RefraccionOption } from "@/lib/laboratorio";

export async function getRefraccionesPaciente(pacienteId: string): Promise<RefraccionOption[]> {
  if (!pacienteId) return [];
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión no es válida.");
  const { data, error } = await supabase.from("consultas_optometricas").select("id,fecha_consulta,refraccion").eq("paciente_id", pacienteId).order("fecha_consulta", { ascending: false }).limit(30);
  if (error) return [];
  return (data ?? []) as unknown as RefraccionOption[];
}

export async function crearOrdenLaboratorio(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const ventaId = String(form.get("venta_id") || "");
  const ventaItemId = String(form.get("venta_item_id") || "") || null;
  const consultaId = String(form.get("consulta_id") || "") || null;
  const laboratorio = String(form.get("laboratorio") || "");
  const usoCalculado = String(form.get("uso_calculado") || "");
  const tipoLente = String(form.get("tipo_lente") || "");
  const notas = String(form.get("notas") || "");
  const esGarantia = String(form.get("es_garantia") || "") === "1";
  const ordenOriginalId = String(form.get("orden_original_id") || "") || null;
  if (!ventaId) throw new Error("Falta identificar la venta.");
  let rx: OrdenLaboratorioRx; let medidas: OrdenLaboratorioMedidas;
  try { rx = JSON.parse(String(form.get("rx") || "{}")); medidas = JSON.parse(String(form.get("medidas") || "{}")); }
  catch { throw new Error("Datos de graduación inválidos."); }

  const { data, error } = await supabase.rpc("crear_orden_laboratorio", {
    p_venta: ventaId, p_venta_item: ventaItemId, p_consulta: consultaId, p_laboratorio: laboratorio,
    p_uso_calculado: usoCalculado, p_tipo_lente: tipoLente, p_rx: rx, p_medidas: medidas, p_notas: notas || null,
    p_es_garantia: esGarantia, p_orden_original_id: ordenOriginalId,
  });
  if (error) throw new Error(error.message || "No se pudo crear la orden de laboratorio.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
  return data as string;
}

export async function actualizarOrdenLaboratorio(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const ordenId = String(form.get("orden_id") || "");
  const laboratorio = String(form.get("laboratorio") || "");
  const usoCalculado = String(form.get("uso_calculado") || "");
  const tipoLente = String(form.get("tipo_lente") || "");
  const notas = String(form.get("notas") || "");
  if (!ordenId) throw new Error("Falta identificar la orden.");
  let rx: OrdenLaboratorioRx; let medidas: OrdenLaboratorioMedidas;
  try { rx = JSON.parse(String(form.get("rx") || "{}")); medidas = JSON.parse(String(form.get("medidas") || "{}")); }
  catch { throw new Error("Datos de graduación inválidos."); }

  const { error } = await supabase.rpc("actualizar_orden_laboratorio", {
    p_orden: ordenId, p_laboratorio: laboratorio, p_uso_calculado: usoCalculado, p_tipo_lente: tipoLente,
    p_rx: rx, p_medidas: medidas, p_notas: notas || null,
  });
  if (error) throw new Error(error.message || "No se pudo actualizar la orden de laboratorio.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
}

export async function getOrdenLaboratorio(ordenId: string): Promise<OrdenLaboratorio | null> {
  if (!ordenId) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("ordenes_laboratorio").select("id,venta_id,venta_item_id,consulta_id,estado,laboratorio,uso_calculado,tipo_lente,rx,medidas,notas,es_garantia,orden_original_id,creado_en").eq("id", ordenId).maybeSingle();
  if (error || !data) return null;
  return data as unknown as OrdenLaboratorio;
}

export async function cambiarEstadoOrdenLaboratorio(ordenId: string, estado: string) {
  const supabase = await createSupabaseServerClient();
  if (!ordenId) throw new Error("Falta identificar la orden.");
  const { error } = await supabase.from("ordenes_laboratorio").update({ estado, actualizado_en: new Date().toISOString() }).eq("id", ordenId);
  if (error) throw new Error(error.message || "No se pudo actualizar el estado de la orden.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
}
