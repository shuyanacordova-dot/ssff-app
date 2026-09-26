"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function iniciarConteo(sucursalId: string, categoria: string): Promise<Resultado<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("iniciar_conteo_inventario", { p_sucursal: sucursalId, p_categoria: categoria });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario/conteo");
  return { ok: true, data: data as string };
}

export async function guardarConteo(conteoId: string, clasificacion: string | null, productoId: string | null, contado: number | null): Promise<Resultado> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_conteo_inventario", { p_conteo: conteoId, p_clasificacion: clasificacion, p_producto: productoId, p_contado: contado });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function enviarConteo(conteoId: string, notas: string): Promise<Resultado> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("enviar_conteo_inventario", { p_conteo: conteoId, p_notas: notas || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario/conteo");
  return { ok: true };
}

export async function revisarConteo(conteoId: string, aprobar: boolean, motivo: string): Promise<Resultado<number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("revisar_conteo_inventario", { p_conteo: conteoId, p_aprobar: aprobar, p_motivo: motivo || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario/conteo"); revalidatePath("/inventario");
  return { ok: true, data: Number(data) };
}
