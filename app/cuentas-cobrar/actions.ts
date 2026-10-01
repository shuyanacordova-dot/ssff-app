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

export async function clasificarDeuda(pacienteId: string, categoria: string) {
  const supabase = await createSupabaseServerClient();
  if (!pacienteId) throw new Error("Falta identificar al paciente.");
  const { error } = await supabase.rpc("clasificar_deuda_paciente", { p_paciente: pacienteId, p_categoria: categoria || null });
  if (error) throw new Error(error.message || "No se pudo cambiar la clasificación.");
  revalidatePath("/cuentas-cobrar");
}

export async function registrarCanje(ventaId: string, monto: string, motivo: string) {
  const supabase = await createSupabaseServerClient();
  const valor = Number(String(monto).replace(",", "."));
  if (!ventaId) throw new Error("Elige la venta.");
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("Indica un monto válido para el canje.");
  if (!motivo.trim()) throw new Error("Escribe el motivo del canje.");
  const { error } = await supabase.rpc("registrar_canje_venta", { p_venta: ventaId, p_monto: valor, p_motivo: motivo.trim() });
  if (error) throw new Error(error.message || "No se pudo registrar el canje.");
  revalidatePath("/cuentas-cobrar"); revalidatePath("/pacientes"); revalidatePath("/ventas");
}

export async function marcarApartado(ventaId: string, activo: boolean) {
  const supabase = await createSupabaseServerClient();
  if (!ventaId) throw new Error("Elige la venta.");
  const { error } = await supabase.rpc("marcar_apartado_venta", { p_venta: ventaId, p_activo: activo });
  if (error) throw new Error(error.message || "No se pudo actualizar el apartado.");
  revalidatePath("/cuentas-cobrar"); revalidatePath("/pacientes"); revalidatePath("/ventas");
}

export async function activarCobroInsistente(pacienteId: string, activo: boolean) {
  const supabase = await createSupabaseServerClient();
  if (!pacienteId) throw new Error("Falta identificar al paciente.");
  const { error } = await supabase.rpc("activar_cobro_insistente", { p_paciente: pacienteId, p_activo: activo });
  if (error) throw new Error(error.message || "No se pudo actualizar el cobro insistente.");
  revalidatePath("/cuentas-cobrar");
}

export async function marcarMensajeCobro(pacienteId: string, sucursalId: string) {
  if (!pacienteId || !sucursalId) throw new Error("Falta identificar al paciente o la sucursal.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_mensaje_cobro", { p_paciente: pacienteId, p_sucursal: sucursalId });
  if (error) throw new Error(error.message || "No se pudo registrar el aviso.");
  revalidatePath("/cuentas-cobrar");
}

export async function fijarFechaCobro(pacienteId: string, fecha: string | null) {
  if (!pacienteId || (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha))) throw new Error("Indica una fecha válida.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fijar_fecha_cobro", { p_paciente: pacienteId, p_fecha: fecha });
  if (error) throw new Error(error.message || "No se pudo guardar la fecha de cobro.");
  revalidatePath("/cuentas-cobrar"); revalidatePath("/");
}

// Pasar una deuda a "Convenios": queda vinculada a la empresa y al trabajador titular para el informe mensual.
export async function vincularConvenio(pacienteId: string, empresaConvenioId: string, titularId: string | null) {
  if (!pacienteId || !empresaConvenioId) throw new Error("Elige la empresa del convenio.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vincular_convenio_paciente", { p_paciente: pacienteId, p_empresa_convenio: empresaConvenioId, p_titular: titularId });
  if (error) throw new Error(error.message || "No se pudo vincular al convenio.");
  revalidatePath("/cuentas-cobrar"); revalidatePath("/convenios");
}

// Titular sugerido: el responsable de la cuenta del paciente o, si no tiene, el mismo paciente.
export async function titularSugeridoConvenio(pacienteId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: p, error } = await supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,responsable_id").eq("id", pacienteId).maybeSingle();
  if (error || !p) throw new Error("Paciente no encontrado.");
  const persona = (x: { id: string; nombres: string | null; apellidos: string | null; cedula: string | null }) => ({ id: x.id, nombre: `${x.nombres ?? ""} ${x.apellidos ?? ""}`.trim(), cedula: x.cedula });
  const { data: r } = p.responsable_id ? await supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula").eq("id", p.responsable_id).maybeSingle() : { data: null };
  return { paciente: persona(p), titular: r ? persona(r) : persona(p) };
}
