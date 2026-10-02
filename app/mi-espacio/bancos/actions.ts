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
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("guardar_cuadre_general", { p_fecha: fecha, p_tarjetas: Object.fromEntries(Object.keys(tarjetas).map((id) => [id, 0])), p_notas: notas || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/mi-espacio/bancos");
  return { ok: true, data: data as { sucursales: number; diferencia_total: number } };
}

export async function guardarCuadreSucursal(sucursalId: string, fecha: string, tarjetas: string, notas: string): Promise<Resultado<{ total_real: number; total_esperado: number; diferencia: number }>> {
  void tarjetas;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("guardar_cuadre_sucursal", { p_sucursal: sucursalId, p_fecha: fecha, p_tarjetas: 0, p_notas: notas || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/mi-espacio/bancos");
  return { ok: true, data: data as { total_real: number; total_esperado: number; diferencia: number } };
}

export async function registrarAcreditacionTarjeta(pagos: string[], cuentaId: string, fecha: string, montoNeto: number, notas: string): Promise<Resultado<string>> {
  if (!pagos.length) return { ok: false, error: "Elige al menos un cobro con tarjeta." };
  if (!cuentaId || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Elige una cuenta y una fecha válida." };
  if (!Number.isFinite(montoNeto) || montoNeto <= 0) return { ok: false, error: "El monto recibido debe ser mayor que cero." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_acreditacion_tarjeta", { p_pagos: pagos, p_cuenta: cuentaId, p_fecha: fecha, p_monto_neto: montoNeto, p_notas: notas || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/mi-espacio/bancos"); revalidatePath("/");
  return { ok: true, data: data as string };
}
