"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";

const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

async function verificarSuperadmin() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Inicia sesión de nuevo.");
  const { data: rawProfile } = await supabase.from("usuarios").select("activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = rawProfile as unknown as { activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  if (!profile?.activo || roleName(profile?.roles ?? null) !== "superadmin") throw new Error("No tienes permiso para esta acción.");
}

export async function cambiarContrasenaColaborador(authUserId: string, password: string) {
  await verificarSuperadmin();
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  if (!hasSupabaseAdminConfiguration()) throw new Error("Falta configurar la clave de servicio de Supabase en el servidor (SUPABASE_SERVICE_ROLE_KEY).");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(authUserId, { password });
  if (error) throw new Error("No se pudo cambiar la contraseña: " + error.message);
}
