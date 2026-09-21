import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";

export type TaskStatus = "pendiente" | "en_proceso" | "completada" | "en_revision" | "aprobada" | "devuelta";
export type TaskRecord = { id: string; titulo: string; descripcion: string | null; estado: TaskStatus; prioridad: "baja" | "media" | "alta" | "urgente"; empresa_id: string | null; sucursal_id: string | null; es_compartida: boolean; creada_por: string; asignada_a: string; requiere_revision: boolean; fecha_limite: string | null; creada_en: string };
export type TeamMember = { id: string; nombre: string; empresa_id: string; sucursal_id: string; rol: string };
export type TaskNotification = { id: string; titulo: string; mensaje: string | null; tarea_id: string | null; leida_en: string | null; creada_en: string };
export type TaskData = { status: "ready" | "needs_login" | "forbidden" | "error"; message?: string; profile?: { id: string; nombre: string; rol: string; empresaId: string; empresaNombre: string; sucursalId: string; sucursalNombre: string; logoUrl: string | null; colorPrimario: string | null; accessibleBranches: { id: string; nombre: string; empresaNombre: string }[] }; tasks: TaskRecord[]; supervisorTaskIds: string[]; team: TeamMember[]; notifications: TaskNotification[] };
type RawProfile = { id: string; nombre: string; activo: boolean; empresa_id: string; sucursal_id: string; roles: { nombre: string } | { nombre: string }[] | null };
const roleName = (profile: RawProfile | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;

export async function getTaskData(): Promise<TaskData> {
  const empty = { tasks: [], supervisorTaskIds: [], team: [], notifications: [] };
  if (!hasSupabaseConfiguration()) return { status: "error", message: "Falta configurar esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para ver tus tareas.", ...empty };
    const { data: raw, error: profileError } = await supabase.from("usuarios").select("id,nombre,activo,empresa_id,sucursal_id,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = raw as unknown as RawProfile | null;
    const rol = roleName(profile);
    if (profileError || !profile?.activo || !rol) return { status: "forbidden", message: "Tu cuenta no tiene un perfil operativo activo.", ...empty };
    const [tasksResult, notificationsResult, operationalContext] = await Promise.all([
      supabase.from("tareas").select("id,titulo,descripcion,estado,prioridad,empresa_id,sucursal_id,es_compartida,creada_por,asignada_a,requiere_revision,fecha_limite,creada_en").order("fecha_limite", { ascending: true, nullsFirst: false }).limit(100),
      supabase.from("notificaciones").select("id,titulo,mensaje,tarea_id,leida_en,creada_en").order("creada_en", { ascending: false }).limit(12),
      getOperationalContext(),
    ]);
    if (tasksResult.error || notificationsResult.error) return { status: "error", message: "No se pudieron cargar las tareas todavía.", ...empty };
    const tasks = (tasksResult.data ?? []) as TaskRecord[];
    const ids = tasks.map((task) => task.id);
    const { data: supervisionRows } = ids.length ? await supabase.from("tarea_supervisores").select("tarea_id").in("tarea_id", ids).eq("supervisor_id", profile.id) : { data: [] };
    const canManage = rol === "superadmin" || rol === "admin_sucursal";
    const { data: teamRows, error: teamError } = canManage || (supervisionRows?.length ?? 0) > 0 ? await supabase.rpc("directorio_tareas") : { data: [], error: null };
    const activeCompany = operationalContext?.activeCompany;
    const activeBranch = operationalContext?.activeBranch;
    return { status: "ready", message: teamError ? "No se pudo cargar el equipo para asignar tareas." : undefined, profile: {
      id: profile.id,
      nombre: profile.nombre,
      rol,
      empresaId: activeCompany?.id ?? profile.empresa_id,
      empresaNombre: activeCompany?.nombre ?? "Shuvisión OS",
      sucursalId: activeBranch?.id ?? profile.sucursal_id,
      sucursalNombre: activeBranch?.nombre ?? "Sucursal",
      logoUrl: activeBranch?.logo_url || activeCompany?.logo_url || null,
      colorPrimario: activeBranch?.color_primario ?? null,
      accessibleBranches: operationalContext?.accessibleBranches.map((branch) => ({ id: branch.id, nombre: branch.nombre, empresaNombre: operationalContext.companies.find((company) => company.id === branch.empresa_id)?.nombre ?? "Empresa" })) ?? [],
    }, tasks, supervisorTaskIds: (supervisionRows ?? []).map((row) => row.tarea_id), team: (teamRows ?? []) as TeamMember[], notifications: (notificationsResult.data ?? []) as TaskNotification[] };
  } catch { return { status: "error", message: "No se pudo conectar el módulo de tareas.", ...empty }; }
}
