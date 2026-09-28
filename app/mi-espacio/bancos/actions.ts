"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MovimientoCuadre = { fecha: string; grupo: "transferencias" | "tarjetas" | "depositos_caja" | "otros_ingresos" | "egresos"; descripcion: string; monto: number };
export type VistaCuadreBanco = {
  cuenta_id: string; banco: string; empresa_nombre: string; fecha: string; primer_cuadre: boolean; desde: string; saldo_anterior: number | null;
  transferencias: number; tarjetas: number; depositos_caja: number; otros_ingresos: number; egresos: number;
  ya_existe: boolean; hay_posterior: boolean; transferencias_sin_banco: number; detalle: MovimientoCuadre[];
};
export type ResultadoCuadreBanco = { id: string; primer_cuadre: boolean; saldo_esperado: number | null; saldo_real: number; diferencia: number | null };
type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };

export async function previsualizarCuadreBanco(cuentaId: string, fecha: string): Promise<Resultado<VistaCuadreBanco>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("previsualizar_cuadre_banco", { p_cuenta: cuentaId, p_fecha: fecha || null });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as VistaCuadreBanco };
}

export async function registrarCuadreBanco(cuentaId: string, fecha: string, saldoReal: string, comisiones: string, notas: string): Promise<Resultado<ResultadoCuadreBanco>> {
  const real = Number(saldoReal.replace(",", "."));
  const cargos = comisiones.trim() ? Number(comisiones.replace(",", ".")) : 0;
  if (!saldoReal.trim() || !Number.isFinite(real)) return { ok: false, error: "Escribe el saldo real que muestra el banco." };
  if (!Number.isFinite(cargos) || cargos < 0) return { ok: false, error: "Las comisiones deben ser un número positivo." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_cuadre_banco", { p_cuenta: cuentaId, p_fecha: fecha, p_saldo_real: real, p_comisiones: cargos, p_notas: notas || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/mi-espacio/bancos"); revalidatePath("/mi-espacio"); revalidatePath("/caja");
  return { ok: true, data: data as ResultadoCuadreBanco };
}

export async function guardarCuadreGeneral(fecha: string, tarjetas: Record<string, number>, notas: string): Promise<Resultado<{ sucursales: number; diferencia_total: number }>> {
  if (Object.values(tarjetas).some((v) => !Number.isFinite(v) || v < 0)) return { ok: false, error: "Las tarjetas por acreditar deben ser montos positivos." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("guardar_cuadre_general", { p_fecha: fecha, p_tarjetas: tarjetas, p_notas: notas || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/mi-espacio/bancos");
  return { ok: true, data: data as { sucursales: number; diferencia_total: number } };
}
