import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";

export type AgendaStatus = "programada" | "confirmada" | "atendida" | "cancelada" | "no_asistio";
export type AgendaPatient = { id: string; nombres: string; apellidos: string; cedula: string | null; telefono: string | null };
export type AgendaCompany = { id: string; nombre: string; slug: string };
export type AgendaBranch = { id: string; empresa_id: string; nombre: string; ciudad: string | null };
export type AgendaTeamMember = { id: string; nombre: string; empresa_id: string | null; sucursal_id: string | null; rol: string };
export type Appointment = { id: string; paciente_id: string; empresa_atencion_id: string; sucursal_atencion_id: string | null; responsable_id: string | null; inicio: string; duracion_minutos: number; tipo: string; motivo: string | null; notas_agenda: string | null; estado: AgendaStatus };
export type AgendaProfile = { id: string; nombre: string; empresa_id: string; sucursal_id: string | null; rol: string };
export type AgendaData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: AgendaProfile; appointments: Appointment[]; patients: AgendaPatient[]; companies: AgendaCompany[]; branches: AgendaBranch[]; team: AgendaTeamMember[] };

const clinicalRoles = new Set(["superadmin", "admin_sucursal", "optometra"]);
const roleName = (profile: { roles: { nombre: string } | { nombre: string }[] | null } | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;

export async function getAgendaData(): Promise<AgendaData> {
  const empty = { appointments: [], patients: [], companies: [], branches: [], team: [] };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para abrir la agenda.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,nombre,empresa_id,sucursal_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; nombre: string; empresa_id: string; sucursal_id: string | null; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !clinicalRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para la agenda clínica.", ...empty };

    const rangeStart = new Date(); rangeStart.setDate(rangeStart.getDate() - 120);
    const rangeEnd = new Date(); rangeEnd.setDate(rangeEnd.getDate() + 180);
    const [appointmentsResult, patientsResult, companiesResult, branchesResult, teamResult, operationalContext] = await Promise.all([
      supabase.from("citas_agenda").select("id,paciente_id,empresa_atencion_id,sucursal_atencion_id,responsable_id,inicio,duracion_minutos,tipo,motivo,notas_agenda,estado").gte("inicio", rangeStart.toISOString()).lte("inicio", rangeEnd.toISOString()).order("inicio", { ascending: true }).limit(2000),
      supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,telefono").order("apellidos").order("nombres").limit(500),
      supabase.from("empresas").select("id,nombre,slug").eq("activo", true).order("nombre"),
      supabase.from("sucursales").select("id,empresa_id,nombre,ciudad").order("nombre"),
      supabase.rpc("directorio_tareas"),
      getOperationalContext(),
    ]);
    if (appointmentsResult.error || patientsResult.error || companiesResult.error || branchesResult.error || teamResult.error) return { status: "error", message: "No se pudo cargar la agenda. Revisa la conexión y los permisos.", ...empty };

    return {
      status: "ready",
      profile: { id: profile.id, nombre: profile.nombre, empresa_id: operationalContext?.activeCompany.id ?? profile.empresa_id, sucursal_id: operationalContext?.activeBranch.id ?? profile.sucursal_id, rol: role },
      appointments: (appointmentsResult.data ?? []) as Appointment[],
      patients: (patientsResult.data ?? []) as AgendaPatient[],
      companies: (companiesResult.data ?? []) as AgendaCompany[],
      branches: (branchesResult.data ?? []) as AgendaBranch[],
      team: (teamResult.data ?? []) as AgendaTeamMember[],
    };
  } catch {
    return { status: "error", message: "La conexión de la agenda no está disponible.", ...empty };
  }
}
