"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const text = (form: FormData, name: string) => typeof form.get(name) === "string" ? String(form.get(name)).trim() : "";
// Montos: acepta coma o punto como decimal ("25,50" o "25.50").
const monto = (form: FormData, name: string, vacio = "") => Number((text(form, name) || vacio).replace(",", "."));

export async function crearGasto(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const empresaId = text(form, "empresa_id"); const sucursalId = text(form, "sucursal_id") || null; const fecha = text(form, "fecha") || null;
  const clasificacion = text(form, "clasificacion"); const concepto = text(form, "concepto"); const valor = monto(form, "monto");
  const origen = text(form, "origen"); const cuentaBancariaId = text(form, "cuenta_bancaria_id") || null; const observaciones = text(form, "observaciones");
  if (!empresaId || !clasificacion || !concepto) throw new Error("Completa clasificación y concepto.");
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("Indica un monto válido.");
  const { error } = await supabase.rpc("registrar_gasto", { p_empresa: empresaId, p_sucursal: sucursalId, p_fecha: fecha, p_clasificacion: clasificacion, p_concepto: concepto, p_monto: valor, p_origen: origen, p_cuenta_bancaria_id: cuentaBancariaId, p_observaciones: observaciones || null });
  if (error) throw new Error(error.message || "No se pudo registrar el gasto.");
  revalidatePath("/caja");
}

export async function crearMovimientoBancario(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const cuentaId = text(form, "cuenta_id"); const sucursalId = text(form, "sucursal_id") || null; const fecha = text(form, "fecha") || null;
  const tipo = text(form, "tipo"); const valor = monto(form, "monto"); const observaciones = text(form, "observaciones");
  if (!cuentaId || !tipo) throw new Error("Elige la cuenta y el tipo de movimiento.");
  if (!Number.isFinite(valor) || valor === 0) throw new Error("Indica un monto válido.");
  const { error } = await supabase.rpc("registrar_movimiento_bancario", { p_cuenta_id: cuentaId, p_sucursal: sucursalId, p_fecha: fecha, p_tipo: tipo, p_monto: valor, p_observaciones: observaciones || null });
  if (error) throw new Error(error.message || "No se pudo registrar el movimiento.");
  revalidatePath("/caja");
}

export type VistaCierre = { ya_existe: boolean; origen_caja_anterior: "apertura" | "cierre" | null; fecha_caja_anterior: string | null; caja_anterior: number; ventas_brutas: number; cobro_efectivo: number; cobro_tarjeta: number; cobro_transferencia_pichincha: number; cobro_transferencia_guayaquil: number; cobro_transferencia_internacional: number; cobro_credito: number; cobro_otro: number; egresos_efectivo: number; egresos_banco: number };
export type ResultadoCierre = { id: string; cuadre_correcto: boolean; diferencia: number; diferencia_cobros_declarados: number; caja_esperada: number; caja_fisica: number; check_cobros_ventas: boolean; check_metodos_pago: boolean };

export async function previsualizarCierre(empresaId: string, sucursalId: string, fecha: string): Promise<VistaCierre | { error: string }> {
  if (!empresaId || !sucursalId) return { error: "Elige empresa y sucursal." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("previsualizar_cierre_caja", { p_empresa: empresaId, p_sucursal: sucursalId, p_fecha: fecha || null });
  if (error) return { error: error.message || "No se pudo calcular la vista previa." };
  return data as VistaCierre;
}

export async function crearCierreCaja(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const empresaId = text(form, "empresa_id"); const sucursalId = text(form, "sucursal_id"); const fecha = text(form, "fecha") || null;
  const cajaFisica = monto(form, "caja_fisica");
  const declaradoEfectivo = monto(form, "declarado_efectivo");
  const declaradoTarjeta = monto(form, "declarado_tarjeta");
  const declaradoPichincha = monto(form, "declarado_transferencia_pichincha");
  const declaradoGuayaquil = monto(form, "declarado_transferencia_guayaquil");
  const declaradoInternacional = monto(form, "declarado_transferencia_internacional");
  const depositoPichincha = monto(form, "deposito_pichincha", "0");
  const depositoGuayaquil = monto(form, "deposito_guayaquil", "0");
  const depositoInternacional = monto(form, "deposito_internacional", "0");
  const observaciones = text(form, "observaciones");
  if (!empresaId || !sucursalId) throw new Error("Elige empresa y sucursal.");
  if (!Number.isFinite(cajaFisica) || cajaFisica < 0) throw new Error("Indica el efectivo contado en caja.");
  const declarados = [declaradoEfectivo, declaradoTarjeta, declaradoPichincha, declaradoGuayaquil, declaradoInternacional];
  if (declarados.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Ingresa valores válidos para efectivo, tarjetas y transferencias.");
  const { data, error } = await supabase.rpc("registrar_cierre_caja", { p_empresa: empresaId, p_sucursal: sucursalId, p_fecha: fecha, p_declarado_efectivo: declaradoEfectivo, p_declarado_tarjeta: declaradoTarjeta, p_declarado_transferencia_pichincha: declaradoPichincha, p_declarado_transferencia_guayaquil: declaradoGuayaquil, p_declarado_transferencia_internacional: declaradoInternacional, p_caja_fisica: cajaFisica, p_deposito_pichincha: depositoPichincha, p_deposito_guayaquil: depositoGuayaquil, p_deposito_internacional: depositoInternacional, p_observaciones: observaciones || null });
  if (error) throw new Error(error.message.includes("cierres_caja_empresa_id_sucursal_id_fecha_key") ? "Ya existe un cuadre registrado para esa sucursal y fecha." : (error.message || "No se pudo registrar el cuadre."));
  revalidatePath("/caja");
  return data as ResultadoCierre;
}

export async function registrarAperturaCaja(form: FormData) {
  const empresaId = text(form, "empresa_id");
  const sucursalId = text(form, "sucursal_id");
  const fecha = text(form, "fecha");
  const montoRaw = text(form, "monto");
  const valor = Number(montoRaw.replace(",", "."));
  if (!empresaId || !sucursalId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Elige empresa, sucursal y fecha.");
  if (!montoRaw || !Number.isFinite(valor) || valor < 0) throw new Error("Indica un monto de apertura válido (puede ser cero).");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_apertura_caja", { p_empresa: empresaId, p_sucursal: sucursalId, p_fecha: fecha, p_monto: valor, p_observaciones: text(form, "observaciones") || null });
  if (error) throw new Error(error.message || "No se pudo registrar la apertura.");
  revalidatePath("/caja");
}
