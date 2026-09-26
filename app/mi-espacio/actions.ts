"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const numero = (form: FormData, name: string) => Number(value(form, name).replace(",", "."));
const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;
type Resultado = { ok: true } | { ok: false; error: string };

async function privateContext() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw } = await supabase.from("usuarios").select("id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as { id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  if (!profile?.activo || roleName(profile.roles) !== "superadmin") throw new Error("Este espacio es privado para superadmin.");
  return { supabase, profile };
}

const ultimoDia = (ym: string, dia: number) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(Math.min(dia, new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(2, "0")}`; };
const sumarMeses = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

// Las acciones devuelven { ok, error } para que el mensaje real se vea en pantalla (Next.js oculta los errores lanzados).
export async function crearDeuda(form: FormData): Promise<Resultado> {
  try {
    const { supabase, profile } = await privateContext();
    const tipo = value(form, "tipo"); const modalidad = value(form, "modalidad");
    const proveedor = value(form, "proveedor"); const concepto = value(form, "concepto") || proveedor; const notas = value(form, "notas");
    const destino = value(form, "empresa_id");
    const empresaId = destino && destino !== "personal" ? destino : null; const ambito = destino === "personal" ? "personal" : "general";
    if (!["proveedor", "prestamo_banco", "tarjeta", "prestamo_personal", "gasto_fijo"].includes(tipo)) return { ok: false, error: "Elige el tipo de deuda." };
    if (!["cuotas", "libre", "mensual"].includes(modalidad)) return { ok: false, error: "Elige cómo se paga." };
    if (!proveedor) return { ok: false, error: "Escribe a quién le debes (acreedor)." };
    const base = { tipo, modalidad, proveedor, concepto, notas: notas || null, empresa_id: empresaId, ambito, sucursal_id: null, created_by: profile.id };
    let fila: Record<string, unknown>;
    if (modalidad === "cuotas") {
      const cuota = numero(form, "monto_cuota"); const total = Math.round(numero(form, "cuotas_total")); const previas = Math.max(0, Math.round(numero(form, "cuotas_previas") || 0));
      const dia = Math.round(numero(form, "dia_pago")); const primera = value(form, "primera_cuota");
      if (!(cuota > 0) || !(total > 0) || !(dia >= 1 && dia <= 31) || !/^\d{4}-\d{2}$/.test(primera)) return { ok: false, error: "Completa valor de la cuota, número de cuotas, día de pago y mes de la primera cuota." };
      if (previas > total) return { ok: false, error: "Las cuotas ya pagadas no pueden ser más que el total." };
      const saldo = Math.round((total - previas) * cuota * 100) / 100;
      fila = { ...base, monto_cuota: cuota, cuotas_total: total, cuotas_previas: previas, dia_pago: dia, fecha_inicio: ultimoDia(primera, dia), fecha_vencimiento: ultimoDia(sumarMeses(primera, total - 1), dia), monto_original: Math.round(total * cuota * 100) / 100, saldo, estado: saldo > 0 ? "pendiente" : "pagada", frecuencia: "mensual" };
    } else if (modalidad === "mensual") {
      const monto = numero(form, "monto_cuota"); const dia = Math.round(numero(form, "dia_pago")); const desde = value(form, "desde") || new Date().toISOString().slice(0, 7);
      if (!(monto > 0) || !(dia >= 1 && dia <= 31)) return { ok: false, error: "Completa el monto mensual y el día de pago." };
      fila = { ...base, monto_cuota: monto, dia_pago: dia, fecha_inicio: ultimoDia(desde, dia), monto_original: monto, saldo: monto, frecuencia: "mensual" };
    } else {
      const total = numero(form, "monto_original"); const saldoTexto = value(form, "saldo"); const saldo = saldoTexto ? numero(form, "saldo") : total;
      if (!(total > 0)) return { ok: false, error: "Indica el monto total de la deuda." };
      if (!(saldo >= 0) || saldo > total) return { ok: false, error: "El saldo actual debe estar entre 0 y el monto total." };
      fila = { ...base, monto_original: total, saldo, fecha_vencimiento: value(form, "fecha_vencimiento") || null, estado: saldo > 0 ? "pendiente" : "pagada", frecuencia: "unica" };
    }
    const { error } = await supabase.from("deudas_negocio").insert(fila);
    if (error) return { ok: false, error: `No se pudo guardar la deuda: ${error.message}` };
    revalidatePath("/mi-espacio");
    return { ok: true };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : "No se pudo guardar la deuda." }; }
}

export async function registrarPagoDeuda(form: FormData): Promise<Resultado> {
  try {
    const { supabase } = await privateContext();
    const deudaId = value(form, "deuda_id"); const monto = numero(form, "monto"); const periodo = value(form, "periodo");
    if (!deudaId || !(monto > 0)) return { ok: false, error: "Indica un monto válido." };
    const { error } = await supabase.rpc("registrar_pago_deuda_v2", {
      p_deuda: deudaId, p_monto: monto, p_fecha: value(form, "fecha_pago") || null, p_metodo: value(form, "metodo") || "transferencia",
      p_referencia: value(form, "referencia") || null, p_notas: value(form, "notas") || null,
      p_periodo: /^\d{4}-\d{2}$/.test(periodo) ? `${periodo}-01` : null, p_egreso_sucursal: value(form, "egreso_sucursal") || null,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/mi-espacio"); revalidatePath("/caja");
    return { ok: true };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : "No se pudo registrar el pago." }; }
}

export async function archivarDeuda(deudaId: string): Promise<Resultado> {
  try {
    const { supabase } = await privateContext();
    const { error } = await supabase.from("deudas_negocio").update({ estado: "anulada", actualizado_en: new Date().toISOString() }).eq("id", deudaId);
    if (error) return { ok: false, error: "No se pudo archivar la deuda." };
    revalidatePath("/mi-espacio");
    return { ok: true };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : "No se pudo archivar la deuda." }; }
}

export async function actualizarDeuda(form: FormData): Promise<Resultado> {
  try {
    const { supabase } = await privateContext();
    const id = value(form, "deuda_id"); const modalidad = value(form, "modalidad");
    const proveedor = value(form, "proveedor"); const concepto = value(form, "concepto") || proveedor;
    const destino = value(form, "empresa_id");
    if (!id || !proveedor) return { ok: false, error: "Escribe a quién le debes." };
    const cambios: Record<string, unknown> = {
      proveedor, concepto, notas: value(form, "notas") || null,
      empresa_id: destino && destino !== "personal" ? destino : null, ambito: destino === "personal" ? "personal" : "general",
      actualizado_en: new Date().toISOString(),
    };
    const diaTexto = value(form, "dia_pago");
    if (modalidad !== "libre") {
      const dia = diaTexto ? Math.round(numero(form, "dia_pago")) : null;
      if (dia !== null && !(dia >= 1 && dia <= 31)) return { ok: false, error: "El día de pago debe estar entre 1 y 31." };
      const cuota = numero(form, "monto_cuota");
      if (!(cuota > 0)) return { ok: false, error: modalidad === "mensual" ? "Indica el monto mensual." : "Indica el valor de la cuota." };
      cambios.dia_pago = dia; cambios.monto_cuota = cuota;
    }
    if (modalidad === "cuotas") {
      const total = Math.round(numero(form, "cuotas_total")); const previas = Math.max(0, Math.round(numero(form, "cuotas_previas") || 0));
      if (!(total > 0) || previas > total) return { ok: false, error: "Revisa el número de cuotas y las cuotas ya pagadas." };
      cambios.cuotas_total = total; cambios.cuotas_previas = previas; cambios.monto_original = Math.round(total * Number(cambios.monto_cuota) * 100) / 100;
    }
    if (modalidad === "mensual") { cambios.monto_original = cambios.monto_cuota; cambios.saldo = cambios.monto_cuota; }
    else {
      const saldo = numero(form, "saldo");
      if (!(saldo >= 0)) return { ok: false, error: "Indica el saldo que falta pagar." };
      cambios.saldo = saldo; cambios.estado = saldo > 0 ? "pendiente" : "pagada";
      if (modalidad === "libre") {
        const total = numero(form, "monto_original");
        if (!(total > 0) || saldo > total) return { ok: false, error: "El saldo no puede ser mayor que el monto total." };
        cambios.monto_original = total; cambios.fecha_vencimiento = value(form, "fecha_vencimiento") || null;
      } else if (saldo > Number(cambios.monto_original) + 0.01) cambios.monto_original = saldo;
    }
    const { error } = await supabase.from("deudas_negocio").update(cambios).eq("id", id);
    if (error) return { ok: false, error: `No se pudo actualizar: ${error.message}` };
    revalidatePath("/mi-espacio");
    return { ok: true };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : "No se pudo actualizar la deuda." }; }
}
