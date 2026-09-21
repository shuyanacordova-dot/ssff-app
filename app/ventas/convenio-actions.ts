"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { branchLetterhead, loadBranchIdentities, type CompanyIdentity } from "@/lib/sucursales";

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
  const acuerdo = data as AcuerdoPago;
  const { data: venta } = await supabase.from("ventas").select("empresa_id,sucursal_id").eq("id", ventaId).maybeSingle();
  if (venta) {
    const [{ data: company }, branchResult] = await Promise.all([
      supabase.from("empresas").select("id,nombre,direccion,telefono,email,logo_url").eq("id", venta.empresa_id).maybeSingle(),
      loadBranchIdentities(supabase),
    ]);
    const identity = branchLetterhead(company as CompanyIdentity | null, branchResult.branches.find((branch) => branch.id === venta.sucursal_id));
    if (identity) {
      acuerdo.empresa_nombre = identity.nombre;
      acuerdo.empresa_direccion = identity.direccion ?? null;
      acuerdo.empresa_telefono = identity.telefono ?? null;
      acuerdo.empresa_email = identity.email ?? null;
      acuerdo.empresa_logo_url = identity.logo_url ?? null;
    }
  }
  revalidatePath("/ventas"); revalidatePath("/pacientes"); revalidatePath("/cuentas-cobrar");
  return acuerdo;
}
