"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";
import type { ClinicalPhoto, Consultation, PatientRecord, PatientSale } from "@/lib/clinical";
import type { Garantia, SaleLabOrder } from "@/lib/ventas";
import { getOperationalContext } from "@/lib/operational-context";

const clinicalRoles = new Set(["superadmin", "admin_sucursal", "optometra"]);
const text = (data: FormData, name: string) => typeof data.get(name) === "string" ? String(data.get(name)).trim() : "";
const normalizarWhatsapp = (raw: string) => { const digits = raw.replace(/\D/g, ""); const local = digits.startsWith("593") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits; return local ? `+593 ${local}` : ""; };
type UserProfile = { id: string; empresa_id: string; sucursal_id: string | null; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null };
const roleName = (profile: UserProfile | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;

async function currentClinicalProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión no es válida.");
  const { data: raw } = await supabase.from("usuarios").select("id,empresa_id,sucursal_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as UserProfile | null;
  const role = roleName(profile);
  if (!profile?.activo || !role || !clinicalRoles.has(role)) throw new Error("No tienes permiso clínico para esta acción.");
  const context = await getOperationalContext();
  return { supabase, profile: { ...profile, empresa_id: context?.activeCompany.id ?? profile.empresa_id, sucursal_id: context?.activeBranch.id ?? profile.sucursal_id }, role };
}

export async function crearPacienteClinico(data: FormData) {
  const { supabase } = await currentClinicalProfile();
  const nombres = text(data, "nombres"); const apellidos = text(data, "apellidos");
  if (!nombres || !apellidos) throw new Error("Ingresa nombres y apellidos.");
  const { data: result, error } = await supabase.rpc("registrar_paciente_clinico", {
    p_nombres: nombres, p_apellidos: apellidos, p_cedula: text(data, "cedula") || null, p_telefono: normalizarWhatsapp(text(data, "telefono")) || null,
    p_email: text(data, "email") || null, p_direccion: text(data, "direccion") || null, p_fecha_nacimiento: text(data, "fecha_nacimiento") || null, p_sexo: text(data, "sexo") || null,
    p_ocupacion: text(data, "ocupacion") || null, p_responsable_id: text(data, "responsable_id") || null,
  });
  if (error) throw new Error(error.message || "No se pudo registrar el paciente.");
  revalidatePath("/pacientes");
  return result as { paciente_id: string; ya_existia: boolean };
}

const astigmatismo = (k1: string, k2: string) => { const a = Number(k1); const b = Number(k2); return Number.isFinite(a) && Number.isFinite(b) && k1 !== "" && k2 !== "" ? Math.abs(a - b).toFixed(2) : ""; };
const monthsFor = { "3m": 3, "6m": 6, "1a": 12 } as const;

export async function crearConsulta(data: FormData) {
  const { supabase, profile } = await currentClinicalProfile();
  const pacienteId = text(data, "paciente_id");
  if (!pacienteId) throw new Error("Falta identificar al paciente.");

  const antecedentes = { dispositivos_electronicos: text(data, "ante_dispositivos"), horas_dispositivos: text(data, "ante_horas_dispositivos"), hipersensibilidad: text(data, "ante_hipersensibilidad"), ultimo_control: text(data, "ante_ultimo_control"), enfermedades_condiciones: text(data, "ante_enfermedades") };
  const agudezaVisual = { sc_od: text(data, "av_sc_od"), sc_oi: text(data, "av_sc_oi"), scp_od: text(data, "av_scp_od"), scp_oi: text(data, "av_scp_oi") };
  const lensometria = { od_esfera: text(data, "lens_od_esfera"), od_cilindro: text(data, "lens_od_cilindro"), od_eje: text(data, "lens_od_eje"), od_add: text(data, "lens_od_add"), od_av_lejos: text(data, "lens_od_av_lejos"), od_av_cerca: text(data, "lens_od_av_cerca"), oi_esfera: text(data, "lens_oi_esfera"), oi_cilindro: text(data, "lens_oi_cilindro"), oi_eje: text(data, "lens_oi_eje"), oi_add: text(data, "lens_oi_add"), oi_av_lejos: text(data, "lens_oi_av_lejos"), oi_av_cerca: text(data, "lens_oi_av_cerca") };
  const odK1 = text(data, "quera_od_k1"); const odK2 = text(data, "quera_od_k2"); const oiK1 = text(data, "quera_oi_k1"); const oiK2 = text(data, "quera_oi_k2");
  const queratometria = { od_k1: odK1, od_k2: odK2, od_eje: text(data, "quera_od_eje"), od_astigmatismo: astigmatismo(odK1, odK2), oi_k1: oiK1, oi_k2: oiK2, oi_eje: text(data, "quera_oi_eje"), oi_astigmatismo: astigmatismo(oiK1, oiK2) };
  const autorefractor = { od_esfera: text(data, "auto_od_esfera"), od_cilindro: text(data, "auto_od_cilindro"), od_eje: text(data, "auto_od_eje"), od_add: text(data, "auto_od_add"), oi_esfera: text(data, "auto_oi_esfera"), oi_cilindro: text(data, "auto_oi_cilindro"), oi_eje: text(data, "auto_oi_eje"), oi_add: text(data, "auto_oi_add") };
  const refraccion = { od_esfera: text(data, "ref_od_esfera"), od_cilindro: text(data, "ref_od_cilindro"), od_eje: text(data, "ref_od_eje"), od_add: text(data, "ref_od_add"), od_av_lejos: text(data, "ref_od_av_lejos"), od_av_cerca: text(data, "ref_od_av_cerca"), od_dnp: text(data, "ref_od_dnp"), oi_esfera: text(data, "ref_oi_esfera"), oi_cilindro: text(data, "ref_oi_cilindro"), oi_eje: text(data, "ref_oi_eje"), oi_add: text(data, "ref_oi_add"), oi_av_lejos: text(data, "ref_oi_av_lejos"), oi_av_cerca: text(data, "ref_oi_av_cerca"), oi_dnp: text(data, "ref_oi_dnp") };
  const examenBinocular = { cover_test: text(data, "bino_cover_test"), motilidad: text(data, "bino_motilidad"), estereopsis: text(data, "bino_estereopsis") };
  const biomicroscopia = { od: text(data, "biom_od"), oi: text(data, "biom_oi") };
  const receta = {
    lagrimas_artificiales: data.get("receta_lagrimas") === "si", lagrimas_productos: data.getAll("lagrimas_producto").map(String), lagrimas_otro: text(data, "lagrimas_otro"), lagrimas_frecuencia: text(data, "lagrimas_frecuencia"),
    vitaminas: data.get("receta_vitaminas") === "si", vitaminas_productos: data.getAll("vitaminas_producto").map(String), vitaminas_otro: text(data, "vitaminas_otro"), vitaminas_frecuencia: text(data, "vitaminas_frecuencia"),
    terapia_visual: data.get("receta_terapia_visual") === "si", terapia_instrucciones: text(data, "terapia_instrucciones"),
  };

  const { data: consulta, error } = await supabase.from("consultas_optometricas").insert({
    paciente_id: pacienteId, empresa_atencion_id: profile.empresa_id, sucursal_atencion_id: profile.sucursal_id, optometrista_id: profile.id,
    motivo_consulta: text(data, "motivo_consulta") || null, antecedentes,
    agudeza_visual: agudezaVisual, lensometria, queratometria, autorefractor, refraccion, examen_binocular: examenBinocular, biomicroscopia,
    impresion_diagnostica: text(data, "impresion_diagnostica") || null, receta, plan_manejo: text(data, "plan_manejo") || null, observaciones: text(data, "observaciones") || null,
    created_by: profile.id,
  }).select("id").single();
  if (error || !consulta) throw new Error("No se pudo guardar la consulta.");

  const siguienteControl = text(data, "siguiente_control") as keyof typeof monthsFor | "";
  if (siguienteControl && monthsFor[siguienteControl]) {
    const inicio = new Date(); inicio.setMonth(inicio.getMonth() + monthsFor[siguienteControl]); inicio.setHours(10, 0, 0, 0);
    const { error: agendaError } = await supabase.from("citas_agenda").insert({ paciente_id: pacienteId, empresa_atencion_id: profile.empresa_id, sucursal_atencion_id: profile.sucursal_id, responsable_id: profile.id, inicio: inicio.toISOString(), duracion_minutos: 30, tipo: "control", motivo: "Próximo control programado desde consulta", estado: "programada", created_by: profile.id });
    if (agendaError) throw new Error(`La consulta se guardó, pero no se pudo agendar el próximo control: ${agendaError.message}`);
  }
  revalidatePath("/pacientes"); revalidatePath("/agenda");
}

export async function buscarPacientesClinicos(query: string): Promise<PatientRecord[]> {
  const { supabase } = await currentClinicalProfile();
  const q = query.trim();
  if (q.length < 2) return [];
  const esc = (s: string) => s.replace(/[%,()]/g, " ").trim();
  const tokens = q.split(/\s+/).map(esc).filter(Boolean).slice(0, 4);
  if (!tokens.length) return [];
  const nameFilter = tokens.length === 1
    ? `or(nombres.ilike.%${tokens[0]}%,apellidos.ilike.%${tokens[0]}%)`
    : `and(${tokens.map((t) => `or(nombres.ilike.%${t}%,apellidos.ilike.%${t}%)`).join(",")})`;
  const cedulaFilter = `cedula.ilike.%${esc(q)}%`;
  const { data, error } = await supabase.from("pacientes_clinicos")
    .select("id,nombres,apellidos,cedula,telefono,email,direccion,sexo,ocupacion,responsable_id,fecha_nacimiento,frecuencia_cobro,empresa_origen_id,actualizado_en")
    .or(`${nameFilter},${cedulaFilter}`).order("actualizado_en", { ascending: false }).limit(30);
  if (error) throw new Error("No se pudo buscar pacientes.");
  return data ?? [];
}

export async function obtenerHistorialPaciente(pacienteId: string): Promise<{ consultations: Consultation[]; photos: ClinicalPhoto[]; sales: PatientSale[]; labOrders: SaleLabOrder[]; garantias: Garantia[] }> {
  const { supabase } = await currentClinicalProfile();
  if (!pacienteId) throw new Error("Falta identificar al paciente.");
  const [consultationsResult, photosResult, salesResult] = await Promise.all([
    supabase.from("consultas_optometricas").select("id,paciente_id,empresa_atencion_id,sucursal_atencion_id,optometrista_id,fecha_consulta,motivo_consulta,antecedentes,agudeza_visual,lensometria,queratometria,autorefractor,refraccion,examen_binocular,biomicroscopia,impresion_diagnostica,receta,plan_manejo,observaciones").eq("paciente_id", pacienteId).order("fecha_consulta", { ascending: false }).limit(150),
    supabase.from("historia_fotos").select("id,paciente_id,consulta_id,tipo,descripcion,storage_path,creado_en").eq("paciente_id", pacienteId).order("creado_en", { ascending: false }).limit(150),
    supabase.from("ventas").select("id,empresa_id,sucursal_id,paciente_id,cliente_nombre,estado,subtotal,descuento,total,pagado,saldo,motivo_anulacion,recibo_token,fecha_entrega_estimada,creado_en,folio,venta_items(id,producto_id,descripcion,cantidad,precio_unitario,descuento,total_linea),pagos_venta(id,metodo,monto,referencia,banco,creado_en)").eq("paciente_id", pacienteId).order("creado_en", { ascending: false }).limit(150),
  ]);
  if (consultationsResult.error || photosResult.error) throw new Error("No se pudieron leer los detalles clínicos.");
  const consultationRows = consultationsResult.data ?? [];
  const optometristaIds = Array.from(new Set(consultationRows.map((consultation) => consultation.optometrista_id).filter(Boolean))) as string[];
  const optometristasResult = optometristaIds.length
    ? hasSupabaseAdminConfiguration()
      ? await createSupabaseAdminClient().from("usuarios").select("id,nombre").in("id", optometristaIds)
      : await supabase.from("usuarios").select("id,nombre").in("id", optometristaIds)
    : { data: [] as { id: string; nombre: string }[], error: null };
  const optometristaNombre = new Map((optometristasResult.data ?? []).map((usuario) => [usuario.id, usuario.nombre]));
  const photoRows = photosResult.data ?? [];
  const signed = photoRows.length ? await supabase.storage.from("historias").createSignedUrls(photoRows.map((photo) => photo.storage_path), 3600) : { data: [] as { path: string; signedUrl: string }[] };
  const urlByPath = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));
  const sales = salesResult.error ? [] : ((salesResult.data ?? []) as unknown as PatientSale[]);
  const saleIds = sales.map((sale) => sale.id);
  const [labOrdersResult, garantiasResult] = saleIds.length ? await Promise.all([
    supabase.from("ordenes_laboratorio").select("id,venta_id,venta_item_id,estado,laboratorio,es_garantia").in("venta_id", saleIds),
    supabase.from("garantias").select("id,venta_id,venta_item_id,tipo,motivo,estado,orden_laboratorio_id,notas,creado_en").in("venta_id", saleIds).order("creado_en", { ascending: false }),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  return {
    consultations: consultationRows.map((consultation) => ({ ...consultation, optometrista_nombre: consultation.optometrista_id ? optometristaNombre.get(consultation.optometrista_id) ?? null : null })) as unknown as Consultation[],
    photos: photoRows.map((photo) => ({ ...photo, url: urlByPath.get(photo.storage_path) ?? null })) as ClinicalPhoto[],
    sales,
    labOrders: labOrdersResult.error ? [] : (labOrdersResult.data ?? []),
    garantias: garantiasResult.error ? [] : ((garantiasResult.data ?? []) as unknown as Garantia[]),
  };
}

export async function subirArchivoClinico(data: FormData) {
  const { supabase, profile } = await currentClinicalProfile();
  const pacienteId = text(data, "paciente_id"); const tipo = text(data, "tipo") === "documento" ? "documento" : "foto"; const descripcion = text(data, "descripcion"); const consultaId = text(data, "consulta_id");
  const file = data.get("archivo");
  if (!pacienteId) throw new Error("Falta identificar al paciente.");
  if (!(file instanceof File) || file.size === 0) throw new Error("Selecciona un archivo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo no puede superar 10 MB.");
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `${pacienteId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("historias").upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error("No se pudo subir el archivo.");
  const { error } = await supabase.from("historia_fotos").insert({ paciente_id: pacienteId, consulta_id: consultaId || null, storage_path: path, tipo, descripcion: descripcion || null, empresa_id: profile.empresa_id, sucursal_id: profile.sucursal_id, subido_por: profile.id });
  if (error) { await supabase.storage.from("historias").remove([path]); throw new Error("No se pudo registrar el archivo."); }
  revalidatePath("/pacientes");
}
