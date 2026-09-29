"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AgendaStatus, AgendaTeamMember } from "@/lib/agenda";

const agendaRoles = new Set(["superadmin", "admin_sucursal", "optometra", "vendedor"]);
const states = new Set<AgendaStatus>(["programada", "confirmada", "atendida", "cancelada", "no_asistio"]);
type Profile = { id: string; empresa_id: string; sucursal_id: string | null; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null };
const field = (form: FormData, name: string) => typeof form.get(name) === "string" ? String(form.get(name)).trim() : "";
const roleName = (profile: Profile | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
const errorText = (error: unknown) => error instanceof Error ? error.message : "No se pudo guardar la cita.";

async function currentProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw, error } = await supabase.from("usuarios").select("id,empresa_id,sucursal_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as Profile | null;
  const role = roleName(profile);
  if (error || !profile?.activo || !role || !agendaRoles.has(role)) throw new Error("No tienes permiso para gestionar la agenda clínica.");
  return { supabase, profile, role };
}

export async function crearCita(formData: FormData) {
  try {
    const { supabase, profile } = await currentProfile();
    const pacienteId = field(formData, "paciente_id"); const empresaId = field(formData, "empresa_atencion_id"); const sucursalId = field(formData, "sucursal_atencion_id"); const responsableId = field(formData, "responsable_id"); const inicio = field(formData, "inicio"); const tipo = field(formData, "tipo") || "consulta"; const motivo = field(formData, "motivo"); const notas = field(formData, "notas_agenda"); const duration = Number(field(formData, "duracion_minutos") || "30");
    if (!pacienteId || !empresaId || !inicio) throw new Error("Elige paciente, empresa y fecha de la cita.");
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) throw new Error("La duración debe estar entre 5 minutos y 8 horas.");
    if (Number.isNaN(new Date(inicio).getTime())) throw new Error("La fecha y hora no son válidas.");
    const [{ data: patient }, { data: company }, { data: teamRows, error: teamError }] = await Promise.all([
      supabase.from("pacientes_clinicos").select("id").eq("id", pacienteId).maybeSingle(),
      supabase.from("empresas").select("id").eq("id", empresaId).eq("activo", true).maybeSingle(),
      supabase.rpc("directorio_tareas"),
    ]);
    const team = (teamRows ?? []) as AgendaTeamMember[];
    if (!patient || !company) throw new Error("El paciente o empresa elegidos ya no están disponibles.");
    if (teamError || (responsableId && !team.some((member) => member.id === responsableId))) throw new Error("La persona responsable no pertenece al equipo disponible.");
    const { error } = await supabase.from("citas_agenda").insert({ paciente_id: pacienteId, empresa_atencion_id: empresaId, sucursal_atencion_id: sucursalId || null, responsable_id: responsableId || null, inicio, duracion_minutos: duration, tipo, motivo: motivo || null, notas_agenda: notas || null, estado: "programada", created_by: profile.id });
    if (error) throw new Error(error.message.includes("sucursal") ? "La sucursal no corresponde a la empresa elegida." : "No se pudo registrar la cita.");
  } catch (error) { return { error: errorText(error) }; }
  revalidatePath("/agenda"); return { success: true };
}

export async function cambiarEstadoCita(formData: FormData) {
  try {
    const { supabase } = await currentProfile();
    const citaId = field(formData, "cita_id"); const estado = field(formData, "estado") as AgendaStatus;
    if (!citaId || !states.has(estado)) throw new Error("El estado de la cita no es válido.");
    const { error } = await supabase.from("citas_agenda").update({ estado }).eq("id", citaId);
    if (error) throw new Error("No se pudo actualizar el estado de la cita.");
  } catch (error) { return { error: errorText(error) }; }
  revalidatePath("/agenda"); return { success: true };
}

const activityTypes = new Set(["reunion", "campana", "convenio", "pago", "capacitacion", "entrega", "otro"]);
const activityStates = new Set(["pendiente", "hecha", "cancelada"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function crearActividad(formData: FormData) {
  try {
    const { supabase, profile, role } = await currentProfile();
    const titulo = field(formData, "titulo");
    const fecha = field(formData, "fecha");
    const tipo = field(formData, "tipo");
    const horaInicio = field(formData, "hora_inicio");
    const horaFin = field(formData, "hora_fin");
    const sucursalId = field(formData, "sucursal_id");
    const responsableId = field(formData, "responsable_id");
    if (!titulo || [...titulo].length > 160) throw new Error("El título debe tener entre 1 y 160 caracteres.");
    const parsedDate = new Date(fecha + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== fecha) throw new Error("La fecha no es válida.");
    if (!activityTypes.has(tipo)) throw new Error("Selecciona un tipo de actividad válido.");
    const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if ((horaInicio && !validTime(horaInicio)) || (horaFin && !validTime(horaFin))) throw new Error("Las horas no son válidas.");
    if (horaFin && (!horaInicio || horaFin < horaInicio)) throw new Error("La hora fin debe ser igual o posterior a la hora inicio.");
    if (!sucursalId && role !== "superadmin") throw new Error("Selecciona una óptica.");
    if (sucursalId) {
      if (!uuidPattern.test(sucursalId)) throw new Error("La óptica no es válida.");
      const { data: branch, error } = await supabase.from("sucursales").select("id,empresa_id").eq("id", sucursalId).maybeSingle();
      if (error || !branch || (role !== "superadmin" && branch.empresa_id !== profile.empresa_id)) throw new Error("No tienes permiso para crear actividades en esta óptica.");
    }
    if (responsableId) {
      const { data, error } = await supabase.rpc("directorio_tareas");
      if (error || !(data as AgendaTeamMember[] | null)?.some((member) => member.id === responsableId)) throw new Error("La persona responsable no pertenece al equipo disponible.");
    }
    const { error } = await supabase.from("actividades_agenda").insert({
      titulo, fecha, tipo, hora_inicio: horaInicio || null, hora_fin: horaFin || null,
      sucursal_id: sucursalId || null, responsable_id: responsableId || null,
      descripcion: field(formData, "descripcion") || null, estado: "pendiente", created_by: profile.id,
    });
    if (error) throw new Error("No se pudo registrar la actividad.");
  } catch (error) { return { error: error instanceof Error ? error.message : "No se pudo guardar la actividad." }; }
  revalidatePath("/agenda"); return { success: true };
}

export async function cambiarEstadoActividad(formData: FormData) {
  try {
    const { supabase } = await currentProfile();
    const actividadId = field(formData, "actividad_id");
    const estado = field(formData, "estado");
    if (!uuidPattern.test(actividadId) || !activityStates.has(estado)) throw new Error("La actividad o el estado no son válidos.");
    const { data, error } = await supabase.from("actividades_agenda").update({ estado, actualizado_en: new Date().toISOString() }).eq("id", actividadId).select("id").maybeSingle();
    if (error || !data) throw new Error("No se pudo actualizar la actividad. Revisa tus permisos.");
  } catch (error) { return { error: error instanceof Error ? error.message : "No se pudo actualizar la actividad." }; }
  revalidatePath("/agenda"); return { success: true };
}
