"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

async function privateContext() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw } = await supabase.from("usuarios").select("id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as { id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  if (!profile?.activo || roleName(profile.roles) !== "superadmin") throw new Error("Este espacio es privado para superadmin.");
  return { supabase, profile };
}

export async function crearDeuda(form: FormData) {
  const { supabase, profile } = await privateContext();
  const empresaId = value(form, "empresa_id"); const sucursalId = value(form, "sucursal_id"); const proveedor = value(form, "proveedor"); const concepto = value(form, "concepto");
  const monto = Number(value(form, "monto")); const fechaDeuda = value(form, "fecha_deuda"); const fechaVencimiento = value(form, "fecha_vencimiento"); const frecuencia = value(form, "frecuencia") || "unica"; const notas = value(form, "notas");
  if (!empresaId || !sucursalId || !proveedor || !concepto || !Number.isFinite(monto) || monto <= 0) throw new Error("Completa sucursal, proveedor, concepto y un monto válido.");
  if (!new Set(["unica", "mensual"]).has(frecuencia)) throw new Error("Frecuencia inválida.");
  const { data: branch } = await supabase.from("sucursales").select("id").eq("id", sucursalId).eq("empresa_id", empresaId).maybeSingle();
  if (!branch) throw new Error("La sucursal no pertenece a la empresa seleccionada.");
  const { error } = await supabase.from("deudas_negocio").insert({ empresa_id: empresaId, sucursal_id: sucursalId, proveedor, concepto, monto_original: monto, saldo: monto, fecha_deuda: fechaDeuda || new Date().toISOString().slice(0, 10), fecha_vencimiento: fechaVencimiento || null, frecuencia, notas: notas || null, created_by: profile.id });
  if (error) throw new Error(error.message.includes("deudas_negocio") ? "Falta aplicar la migración local de este módulo." : "No se pudo guardar la deuda.");
  revalidatePath("/mi-espacio");
}

export async function registrarPagoDeuda(form: FormData) {
  const { supabase } = await privateContext();
  const deudaId = value(form, "deuda_id"); const monto = Number(value(form, "monto")); const fecha = value(form, "fecha_pago"); const metodo = value(form, "metodo") || "transferencia"; const referencia = value(form, "referencia"); const notas = value(form, "notas");
  if (!deudaId || !Number.isFinite(monto) || monto <= 0) throw new Error("Indica un pago válido.");
  const { error } = await supabase.rpc("registrar_pago_deuda_negocio", { p_deuda: deudaId, p_monto: monto, p_fecha: fecha || new Date().toISOString().slice(0, 10), p_metodo: metodo, p_referencia: referencia || null, p_notas: notas || null });
  if (error) throw new Error(error.message.includes("registrar_pago_deuda_negocio") ? "Falta aplicar la migración local de este módulo." : error.message);
  revalidatePath("/mi-espacio");
}
