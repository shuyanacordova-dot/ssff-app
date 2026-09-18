"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AcuerdoPago = {
  id: string; texto: string; monto_cuota: number; fecha_primera_cuota: string; cuotas: number;
  paciente_nombre: string; paciente_cedula: string | null; paciente_ocupacion: string | null; paciente_telefono: string | null;
  empresa_convenio_nombre: string; atendio_nombre: string | null;
  empresa_nombre: string | null; empresa_direccion: string | null; empresa_telefono: string | null; empresa_email: string | null; empresa_logo_url: string | null; sucursal_nombre: string | null;
  folio: number | null; items: { descripcion: string; cantidad: number; precio_unitario: number; total_linea: number }[]; abonos: { fecha: string; monto: number; metodo: string }[];
  total: number; pagado: number; saldo: number;
};

export async function crearEmpresaConvenio(nombre: string) {
  const supabase = await createSupabaseServerClient();
  const value = nombre.trim();
  if (!value) throw new Error("Ingresa el nombre de la empresa.");
  const { data, error } = await supabase.rpc("crear_empresa_convenio", { p_nombre: value });
  if (error) throw new Error(error.message || "No se pudo crear la empresa de convenio.");
  revalidatePath("/ventas"); revalidatePath("/cuentas-cobrar"); revalidatePath("/convenios");
  return data as string;
}

export async function actualizarEmpresaConvenio(empresaConvenioId: string, activo: boolean) {
  const supabase = await createSupabaseServerClient();
  if (!empresaConvenioId) throw new Error("Falta identificar la empresa.");
  const { error } = await supabase.from("empresas_convenio").update({ activo }).eq("id", empresaConvenioId);
  if (error) throw new Error(error.message || "No se pudo actualizar la empresa.");
  revalidatePath("/convenios"); revalidatePath("/ventas"); revalidatePath("/cuentas-cobrar");
}

export async function crearAcuerdoPago(ventaId: string, empresaConvenioId: string, cuotas: number) {
  const supabase = await createSupabaseServerClient();
  if (!ventaId || !empresaConvenioId || !cuotas || cuotas < 1) throw new Error("Completa la empresa y el número de cuotas.");
  const { data, error } = await supabase.rpc("crear_acuerdo_pago", { p_venta: ventaId, p_empresa_convenio: empresaConvenioId, p_cuotas: cuotas });
  if (error) throw new Error(error.message || "No se pudo generar el acuerdo de pago.");
  revalidatePath("/ventas"); revalidatePath("/pacientes"); revalidatePath("/cuentas-cobrar");
  return data as AcuerdoPago;
}
