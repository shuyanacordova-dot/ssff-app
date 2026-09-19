import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";

export type Colaborador = { id: string; auth_user_id: string; nombre: string; email: string; rol: string; activo: boolean; empresa_id: string; empresa_nombre: string; sucursal_id: string | null; sucursal_nombre: string | null };
export type EquipoData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; colaboradores: Colaborador[] };

const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

export async function getEquipoData(): Promise<EquipoData> {
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", colaboradores: [] };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para ver el equipo.", colaboradores: [] };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile?.roles ?? null);
    if (profileError || !profile?.activo || role !== "superadmin") return { status: "forbidden", message: "Solo la administración general puede gestionar al equipo.", colaboradores: [] };
    if (!hasSupabaseAdminConfiguration()) return { status: "error", message: "Falta configurar la clave de servicio de Supabase en el servidor.", colaboradores: [] };

    const admin = createSupabaseAdminClient();
    const [usuariosResult, empresasResult, sucursalesResult] = await Promise.all([
      admin.from("usuarios").select("id,auth_user_id,nombre,email,activo,empresa_id,sucursal_id,roles(nombre)").order("nombre"),
      admin.from("empresas").select("id,nombre"),
      admin.from("sucursales").select("id,nombre"),
    ]);
    if (usuariosResult.error || empresasResult.error || sucursalesResult.error) return { status: "error", message: "No se pudo cargar el equipo.", colaboradores: [] };

    const empresaNombre = new Map((empresasResult.data ?? []).map((e) => [e.id, e.nombre]));
    const sucursalNombre = new Map((sucursalesResult.data ?? []).map((s) => [s.id, s.nombre]));
    const colaboradores = (usuariosResult.data ?? []).map((u) => ({ id: u.id, auth_user_id: u.auth_user_id, nombre: u.nombre, email: u.email, rol: roleName(u.roles as { nombre: string } | { nombre: string }[] | null) ?? "sin rol", activo: u.activo, empresa_id: u.empresa_id, empresa_nombre: empresaNombre.get(u.empresa_id) ?? "—", sucursal_id: u.sucursal_id, sucursal_nombre: u.sucursal_id ? sucursalNombre.get(u.sucursal_id) ?? "—" : null }));

    return { status: "ready", colaboradores };
  } catch {
    return { status: "error", message: "La conexión del equipo no está disponible.", colaboradores: [] };
  }
}
