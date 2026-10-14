"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EstadoMonedero, PreviewReferido } from "@/lib/referidos-textos";

const texto = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const numero = (data: FormData, key: string) => Number(texto(data, key).replace(",", "."));
const mensajeDe = (error: { message?: string } | null, porDefecto: string) => {
  if (!error?.message || error.message.startsWith("permission denied")) return porDefecto;
  if (error.message.includes("violates check constraint")) return "Revisa los valores: alguno está fuera del rango permitido (por ejemplo, el porcentaje debe estar entre 0 y 100).";
  return error.message;
};

export async function obtenerEstadoMonedero(pacienteId: string, empresaId: string): Promise<EstadoMonedero> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("estado_monedero", { p_paciente: pacienteId, p_empresa: empresaId });
  if (error) throw new Error(mensajeDe(error, "No se pudo cargar el monedero de referidos."));
  return data as EstadoMonedero;
}

export async function buscarCodigoReferido(empresaId: string, codigo: string): Promise<{ encontrado: boolean; nombre?: string }> {
  if (!codigo.trim()) return { encontrado: false };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("buscar_codigo_referido", { p_empresa: empresaId, p_codigo: codigo });
  if (error) throw new Error(mensajeDe(error, "No se pudo buscar el código."));
  return data as { encontrado: boolean; nombre?: string };
}

export async function registrarReferidoFicha(pacienteId: string, empresaId: string, codigo: string): Promise<{ referidor_nombre: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_referido_ficha", { p_paciente: pacienteId, p_empresa: empresaId, p_codigo: codigo });
  if (error) throw new Error(mensajeDe(error, "No se pudo registrar el referido."));
  revalidatePath("/pacientes");
  return data as { referidor_nombre: string };
}

export async function previsualizarReferido(args: { empresaId: string; pacienteId: string | null; codigo: string; base: number; esConvenio: boolean; hayOtrosDescuentos: boolean }): Promise<PreviewReferido> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("previsualizar_referido", {
    p_empresa: args.empresaId, p_paciente: args.pacienteId, p_codigo: args.codigo, p_base: args.base, p_es_convenio: args.esConvenio, p_bloquea: args.hayOtrosDescuentos,
  });
  if (error) throw new Error(mensajeDe(error, "No se pudo revisar el código de referido."));
  return data as PreviewReferido;
}

export async function ajustarMonedero(data: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const monto = numero(data, "monto");
  if (!Number.isFinite(monto) || monto === 0) throw new Error("Escribe un monto distinto de cero (negativo para descontar).");
  const { error } = await supabase.rpc("ajustar_monedero", { p_programa: texto(data, "programa_id"), p_paciente: texto(data, "paciente_id"), p_monto: monto, p_motivo: texto(data, "motivo") });
  if (error) throw new Error(mensajeDe(error, "No se pudo registrar el ajuste."));
  revalidatePath("/pacientes");
}

export async function guardarProgramaReferidos(data: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const programaId = texto(data, "programa_id");
  if (!programaId) throw new Error("Falta identificar el programa.");
  const opcional = (key: string) => (texto(data, key) === "" ? null : texto(data, key));
  const cambios = {
    nombre: texto(data, "nombre"),
    activo: data.get("activo") === "si",
    recompensas_suspendidas: data.get("recompensas_suspendidas") === "si",
    compra_minima: numero(data, "compra_minima"),
    descuento_bienvenida: numero(data, "descuento_bienvenida"),
    credito_por_referido: numero(data, "credito_por_referido"),
    bono_3_referidos: numero(data, "bono_3_referidos"),
    bono_5_referidos: numero(data, "bono_5_referidos"),
    vigencia_credito_dias: Math.trunc(numero(data, "vigencia_credito_dias")),
    tope_uso_porcentaje: numero(data, "tope_uso_porcentaje"),
    presupuesto_mensual: opcional("presupuesto_mensual") === null ? null : numero(data, "presupuesto_mensual"),
    campana_desde: opcional("campana_desde"),
    campana_hasta: opcional("campana_hasta"),
    categorias_excluidas: data.getAll("categorias_excluidas").map(String),
  };
  for (const [clave, valor] of Object.entries(cambios)) {
    if (typeof valor === "number" && !Number.isFinite(valor)) throw new Error(`Revisa el valor de "${clave.replace(/_/g, " ")}".`);
  }
  const { error } = await supabase.rpc("guardar_programa_referidos", { p_programa: programaId, p_cambios: cambios });
  if (error) throw new Error(mensajeDe(error, "No se pudo guardar la configuración."));
  revalidatePath("/configuracion/referidos"); revalidatePath("/pacientes");
}
