"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TaskStatus, TeamMember } from "@/lib/tasks";

type Profile = { id: string; activo: boolean; empresa_id: string; sucursal_id: string; roles: { nombre: string } | { nombre: string }[] | null };
const statuses = new Set<TaskStatus>(["pendiente", "en_proceso", "completada", "en_revision", "aprobada", "devuelta"]);
const roleName = (profile: Profile | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
const message = (error: unknown) => error instanceof Error ? error.message : "No se pudo completar la acción.";

async function currentProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw, error } = await supabase.from("usuarios").select("id,activo,empresa_id,sucursal_id,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as Profile | null;
  if (error || !profile?.activo || !roleName(profile)) throw new Error("Tu perfil no está activo.");
  return { supabase, profile, role: roleName(profile)! };
}

export async function crearTarea(formData: FormData) {
  try {
    const { supabase, profile, role } = await currentProfile();
    if (role !== "superadmin" && role !== "admin_sucursal") throw new Error("Solo una administradora puede asignar tareas.");
    const titulo = String(formData.get("titulo") ?? "").trim(); const descripcion = String(formData.get("descripcion") ?? "").trim(); const asignadaA = String(formData.get("asignada_a") ?? ""); const prioridad = String(formData.get("prioridad") ?? "media"); const shared = String(formData.get("alcance") ?? "empresa") === "compartida"; const fechaLimite = String(formData.get("fecha_limite") ?? ""); const supervisors = formData.getAll("supervisores").map(String).filter(Boolean);
    if (!titulo || !asignadaA) throw new Error("Indica el título y la persona responsable.");
    if (!new Set(["baja", "media", "alta", "urgente"]).has(prioridad)) throw new Error("La prioridad no es válida.");
    const { data: teamRows, error: teamError } = await supabase.rpc("directorio_tareas"); const team = (teamRows ?? []) as TeamMember[]; const permitted = new Set(team.map((member) => member.id));
    if (teamError || !permitted.has(asignadaA) || supervisors.some((id) => !permitted.has(id))) throw new Error("Una de las personas elegidas no pertenece al equipo permitido.");
    const { data: task, error: taskError } = await supabase.from("tareas").insert({ titulo, descripcion: descripcion || null, prioridad, estado: "pendiente", empresa_id: shared ? null : profile.empresa_id, sucursal_id: shared ? null : profile.sucursal_id, es_compartida: shared, creada_por: profile.id, asignada_a: asignadaA, requiere_revision: supervisors.length > 0, fecha_limite: fechaLimite || null }).select("id").single();
    if (taskError || !task) throw new Error("No se pudo guardar la tarea.");
    if (supervisors.length) { const { error: supervisorsError } = await supabase.from("tarea_supervisores").insert(supervisors.map((supervisor_id) => ({ tarea_id: task.id, supervisor_id }))); if (supervisorsError) { await supabase.from("tareas").delete().eq("id", task.id); throw new Error("No se pudo guardar la supervisión; la tarea no fue creada."); } }
  } catch (error) { return { error: message(error) }; }
  revalidatePath("/tareas"); return { success: true };
}

export async function cambiarEstadoTarea(formData: FormData) {
  try {
    const { supabase, profile, role } = await currentProfile(); const taskId = String(formData.get("tarea_id") ?? ""); const estado = String(formData.get("estado") ?? "") as TaskStatus;
    if (!taskId || !statuses.has(estado)) throw new Error("Cambio de tarea inválido.");
    const { data: task, error: taskError } = await supabase.from("tareas").select("id,estado,asignada_a,creada_por").eq("id", taskId).single();
    if (taskError || !task) throw new Error("No tienes acceso a esta tarea.");
    const { data: supervisor } = await supabase.from("tarea_supervisores").select("tarea_id").eq("tarea_id", taskId).eq("supervisor_id", profile.id).maybeSingle();
    const manager = role === "superadmin" || task.creada_por === profile.id;
    const workerMove = task.asignada_a === profile.id && ((task.estado === "pendiente" && estado === "en_proceso") || (["en_proceso", "devuelta"].includes(task.estado) && estado === "completada"));
    const supervisorMove = Boolean(supervisor) && ((task.estado === "completada" && estado === "en_revision") || (task.estado === "en_revision" && ["aprobada", "devuelta"].includes(estado)));
    if (!manager && !workerMove && !supervisorMove) throw new Error("Ese cambio no corresponde a tu función en esta tarea.");
    const { error: updateError } = await supabase.from("tareas").update({ estado }).eq("id", taskId); if (updateError) throw new Error("No se pudo actualizar la tarea.");
  } catch (error) { return { error: message(error) }; }
  revalidatePath("/tareas"); return { success: true };
}
