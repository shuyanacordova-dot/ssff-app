import { fetchAll } from "@/lib/supabase/fetch-all";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";

export type AgendaStatus = "programada" | "confirmada" | "atendida" | "cancelada" | "no_asistio";
export type AgendaPatient = { id: string; nombres: string; apellidos: string; cedula: string | null; telefono: string | null };
export type AgendaCompany = { id: string; nombre: string; slug: string };
export type AgendaBranch = { id: string; empresa_id: string; nombre: string; ciudad: string | null };
export type AgendaTeamMember = { id: string; nombre: string; empresa_id: string | null; sucursal_id: string | null; rol: string };
export type Appointment = { id: string; paciente_id: string; empresa_atencion_id: string; sucursal_atencion_id: string | null; responsable_id: string | null; inicio: string; duracion_minutos: number; tipo: string; motivo: string | null; notas_agenda: string | null; estado: AgendaStatus };
export type Activity = { id: string; titulo: string; descripcion: string | null; tipo: "reunion" | "campana" | "convenio" | "pago" | "capacitacion" | "entrega" | "permiso" | "vacaciones" | "otro"; fecha: string; fecha_fin: string | null; hora_inicio: string | null; hora_fin: string | null; sucursal_id: string | null; responsable_id: string | null; estado: "pendiente" | "hecha" | "cancelada"; created_by: string };
export type AgendaProfile = { id: string; nombre: string; empresa_id: string; sucursal_id: string | null; rol: string };
export type AgendaData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: AgendaProfile; appointments: Appointment[]; activities: Activity[]; esSuperadmin: boolean; patients: AgendaPatient[]; companies: AgendaCompany[]; branches: AgendaBranch[]; team: AgendaTeamMember[] };

const agendaRoles = new Set(["superadmin", "admin_sucursal", "optometra", "vendedor"]);
const roleName = (profile: { roles: { nombre: string } | { nombre: string }[] | null } | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;

export async function getAgendaData(): Promise<AgendaData> {
  const empty = { activities: [], esSuperadmin: false, appointments: [], patients: [], companies: [], branches: [], team: [] };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const auth = { user: await getCurrentUser() };
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para abrir la agenda.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,nombre,empresa_id,sucursal_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; nombre: string; empresa_id: string; sucursal_id: string | null; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !agendaRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para la agenda clínica.", ...empty };

    const rangeStart = new Date(); rangeStart.setDate(rangeStart.getDate() - 120);
    const rangeEnd = new Date(); rangeEnd.setDate(rangeEnd.getDate() + 180);
    const dateKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    const [activitiesResult, appointmentsResult, patientsResult, companiesResult, branchesResult, teamResult, operationalContext] = await Promise.all([
      fetchAll<Activity>((from, to) => supabase.from("actividades_agenda").select("id,titulo,descripcion,tipo,fecha,fecha_fin,hora_inicio,hora_fin,sucursal_id,responsable_id,estado,created_by").gte("fecha", dateKey(rangeStart)).lte("fecha", dateKey(rangeEnd)).order("fecha").order("hora_inicio", { nullsFirst: true }).order("id").range(from, to)),
      supabase.from("citas_agenda").select("id,paciente_id,empresa_atencion_id,sucursal_atencion_id,responsable_id,inicio,duracion_minutos,tipo,motivo,notas_agenda,estado").gte("inicio", rangeStart.toISOString()).lte("inicio", rangeEnd.toISOString()).order("inicio", { ascending: true }).limit(2000),
      supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,telefono").order("apellidos").order("nombres").limit(500),
      supabase.from("empresas").select("id,nombre,slug").eq("activo", true).order("nombre"),
      supabase.from("sucursales").select("id,empresa_id,nombre,ciudad").order("nombre"),
      supabase.rpc("directorio_tareas"),
      getOperationalContext(),
    ]);
    if (activitiesResult.error || appointmentsResult.error || patientsResult.error || companiesResult.error || branchesResult.error || teamResult.error) return { status: "error", message: "No se pudo cargar la agenda. Revisa la conexión y los permisos.", ...empty };

    // Pacientes de las citas que no vinieron en la lista inicial (solo trae 500): sin esto el calendario decía "Paciente".
    const patients = (patientsResult.data ?? []) as AgendaPatient[];
    const known = new Set(patients.map((patient) => patient.id));
    const missing = [...new Set(((appointmentsResult.data ?? []) as Appointment[]).map((item) => item.paciente_id).filter((id) => id && !known.has(id)))];
    for (let i = 0; i < missing.length; i += 200) {
      const { data } = await supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,telefono").in("id", missing.slice(i, i + 200));
      patients.push(...((data ?? []) as AgendaPatient[]));
    }

    return {
      status: "ready",
      activities: activitiesResult.data,
      esSuperadmin: role === "superadmin",
      profile: { id: profile.id, nombre: profile.nombre, empresa_id: operationalContext?.activeCompany.id ?? profile.empresa_id, sucursal_id: operationalContext?.activeBranch.id ?? profile.sucursal_id, rol: role },
      appointments: (appointmentsResult.data ?? []) as Appointment[],
      patients,
      companies: (companiesResult.data ?? []) as AgendaCompany[],
      branches: (branchesResult.data ?? []) as AgendaBranch[],
      team: (teamResult.data ?? []) as AgendaTeamMember[],
    };
  } catch {
    return { status: "error", message: "La conexión de la agenda no está disponible.", ...empty };
  }
}
