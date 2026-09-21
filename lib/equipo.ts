import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";

export type Colaborador = { id: string; auth_user_id: string; nombre: string; email: string; rol_id: string; rol: string; activo: boolean; empresa_id: string; empresa_nombre: string; sucursal_id: string; sucursal_nombre: string };
export type EmpresaEquipo = { id: string; nombre: string };
export type SucursalEquipo = { id: string; empresa_id: string; nombre: string };
export type RolEquipo = { id: string; nombre: string };
type RawColaborador = { id: string; auth_user_id: string; nombre: string; email: string; activo: boolean; rol_id: string; empresa_id: string; sucursal_id: string; roles: { nombre: string } | { nombre: string }[] | null };
export type EquipoData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; canManageAuth: boolean; colaboradores: Colaborador[]; empresas: EmpresaEquipo[]; sucursales: SucursalEquipo[]; roles: RolEquipo[] };

const emptyEquipoData = (status: EquipoData["status"], message: string): EquipoData => ({ status, message, canManageAuth: false, colaboradores: [], empresas: [], sucursales: [], roles: [] });

const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

export async function getEquipoData(): Promise<EquipoData> {
  if (!hasSupabaseConfiguration()) return emptyEquipoData("needs_configuration", "Falta configurar la conexión segura de esta copia local.");
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return emptyEquipoData("needs_login", "Inicia sesión para ver el equipo.");
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile?.roles ?? null);
    if (profileError || !profile?.activo || role !== "superadmin") return emptyEquipoData("forbidden", "Solo la administración general puede gestionar al equipo.");
    const canManageAuth = hasSupabaseAdminConfiguration();
    const reader = canManageAuth ? createSupabaseAdminClient() : supabase;
    const [usuariosResult, empresasResult, sucursalesResult, rolesResult] = await Promise.all([
      canManageAuth
        ? reader.from("usuarios").select("id,auth_user_id,nombre,email,activo,rol_id,empresa_id,sucursal_id,roles(nombre)").order("nombre")
        : supabase.rpc("directorio_tareas"),
      reader.from("empresas").select("id,nombre").order("nombre"),
      reader.from("sucursales").select("id,empresa_id,nombre").order("nombre"),
      reader.from("roles").select("id,nombre").order("nombre"),
    ]);
    if (empresasResult.error || sucursalesResult.error) return emptyEquipoData("error", "No se pudo cargar la información de empresas y sucursales.");

    const empresaNombre = new Map((empresasResult.data ?? []).map((e) => [e.id, e.nombre]));
    const sucursalNombre = new Map((sucursalesResult.data ?? []).map((s) => [s.id, s.nombre]));
    const roles = (rolesResult.data ?? []) as RolEquipo[];
    const roleId = new Map(roles.map((item) => [item.nombre, item.id]));
    const colaboradores = canManageAuth
      ? ((usuariosResult.data ?? []) as RawColaborador[]).map((u) => ({ id: u.id, auth_user_id: u.auth_user_id, nombre: u.nombre, email: u.email, rol_id: u.rol_id, rol: roleName(u.roles) ?? "sin rol", activo: u.activo, empresa_id: u.empresa_id, empresa_nombre: empresaNombre.get(u.empresa_id) ?? "—", sucursal_id: u.sucursal_id, sucursal_nombre: sucursalNombre.get(u.sucursal_id) ?? "—" }))
      : ((usuariosResult.data ?? []) as { id: string; nombre: string; empresa_id: string; sucursal_id: string; rol: string }[]).map((u) => ({ id: u.id, auth_user_id: "", nombre: u.nombre, email: "", rol_id: roleId.get(u.rol) ?? "", rol: u.rol, activo: true, empresa_id: u.empresa_id, empresa_nombre: empresaNombre.get(u.empresa_id) ?? "—", sucursal_id: u.sucursal_id, sucursal_nombre: sucursalNombre.get(u.sucursal_id) ?? "—" }));

    return { status: "ready", message: canManageAuth ? undefined : "Vista de revisión: la clave administrativa no está instalada en esta copia local.", canManageAuth, colaboradores, empresas: (empresasResult.data ?? []) as EmpresaEquipo[], sucursales: (sucursalesResult.data ?? []) as SucursalEquipo[], roles };
  } catch {
    return emptyEquipoData("error", "La conexión del equipo no está disponible.");
  }
}
