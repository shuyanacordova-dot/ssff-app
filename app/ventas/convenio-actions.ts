"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AcuerdoPago = { id: string; texto: string; monto_cuota: number; fecha_primera_cuota: string; cuotas: number; paciente_nombre: string; empresa_convenio_nombre: string; total: number; saldo: number };

export async function crearEmpresaConvenio(nombre: string) {
  const supabase = await createSupabaseServerClient();
  const value = nombre.trim();
  if (!value) throw new Error("Ingresa el nombre de la empresa.");
  const { data, error } = await supabase.rpc("crear_empresa_convenio", { p_nombre: value });
  if (error) throw new Error(error.message || "No se pudo crear la empresa de convenio.");
  revalidatePath("/ventas");
  return data as string;
}

export async function crearAcuerdoPago(ventaId: string, empresaConvenioId: string, cuotas: number) {
  const supabase = await createSupabaseServerClient();
  if (!ventaId || !empresaConvenioId || !cuotas || cuotas < 1) throw new Error("Completa la empresa y el número de cuotas.");
  const { data, error } = await supabase.rpc("crear_acuerdo_pago", { p_venta: ventaId, p_empresa_convenio: empresaConvenioId, p_cuotas: cuotas });
  if (error) throw new Error(error.message || "No se pudo generar el acuerdo de pago.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
  return data as AcuerdoPago;
}
