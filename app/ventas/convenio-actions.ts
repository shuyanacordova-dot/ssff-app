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
  // paciente_* es quien firma (el trabajador titular); beneficiario_* es el paciente de la venta si es otra persona.
  titular_id?: string | null; beneficiario_nombre?: string | null; beneficiario_cedula?: string | null;
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

export async function crearAcuerdoPago(ventaId: string, empresaConvenioId: string, cuotas: number, titularId?: string | null) {
  const supabase = await createSupabaseServerClient();
  if (!ventaId || !empresaConvenioId || !cuotas || cuotas < 1) throw new Error("Completa la empresa y el número de cuotas.");
  const { data, error } = await supabase.rpc("crear_acuerdo_pago", { p_venta: ventaId, p_empresa_convenio: empresaConvenioId, p_cuotas: cuotas, p_titular: titularId || null });
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

export type PersonaTitular = { id: string; nombre: string; cedula: string | null };
const personaTitular = (p: { id: string; nombres: string | null; apellidos: string | null; cedula: string | null }): PersonaTitular =>
  ({ id: p.id, nombre: `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim(), cedula: p.cedula });

// Titular sugerido del descuento a rol: el del acuerdo existente; si no, el responsable de la cuenta del paciente; si no, el paciente.
export async function datosAutorizacionRol(ventaId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: venta, error: ventaError } = await supabase.from("ventas").select("empresa_id,paciente_id,estado,saldo").eq("id", ventaId).maybeSingle();
  if (ventaError || !venta || venta.estado !== "completada" || !venta.paciente_id) throw new Error("No se encontró una venta válida.");
  const [empresas, acuerdo, paciente] = await Promise.all([
    supabase.from("empresas_convenio").select("id,nombre").eq("activo", true).order("nombre"),
    supabase.from("acuerdos_pago").select("empresa_convenio_id,cuotas,titular_paciente_id").eq("venta_id", ventaId).maybeSingle(),
    supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,responsable_id").eq("id", venta.paciente_id).maybeSingle(),
  ]);
  if (empresas.error || acuerdo.error || paciente.error || !paciente.data) throw new Error("No se pudieron cargar los convenios.");
  const titularId = acuerdo.data?.titular_paciente_id ?? paciente.data.responsable_id ?? paciente.data.id;
  const { data: titular } = titularId === paciente.data.id ? { data: paciente.data } : await supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula").eq("id", titularId).maybeSingle();
  return { empresas: empresas.data ?? [], acuerdo: acuerdo.data, paciente: personaTitular(paciente.data), titular: titular ? personaTitular(titular) : personaTitular(paciente.data) };
}

// Buscar al trabajador titular entre los pacientes (nombre o cédula).
export async function buscarTitularConvenio(query: string): Promise<PersonaTitular[]> {
  const q = query.trim().replace(/[%,().]/g, " ").trim();
  if (q.length < 2) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula").or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,cedula.ilike.%${q}%`).order("nombres").limit(15);
  if (error) throw new Error("No se pudo buscar.");
  return (data ?? []).map(personaTitular);
}
