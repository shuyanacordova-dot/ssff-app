"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";

const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

type SuperadminProfile = { id: string; auth_user_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null };
type CrearColaboradorInput = { nombre: string; email: string; password: string; rolId: string; empresaId: string; sucursalId: string };
type ActualizarAsignacionInput = { colaboradorId: string; rolId: string; empresaId: string; sucursalId: string };

async function verificarSuperadmin(): Promise<SuperadminProfile> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Inicia sesión de nuevo.");
  const { data: rawProfile } = await supabase.from("usuarios").select("id,auth_user_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = rawProfile as unknown as SuperadminProfile | null;
  if (!profile?.activo || roleName(profile.roles) !== "superadmin") throw new Error("No tienes permiso para esta acción.");
  return profile;
}

function obtenerAdmin() {
  if (!hasSupabaseAdminConfiguration()) throw new Error("Falta configurar la clave de servicio de Supabase en el servidor (SUPABASE_SERVICE_ROLE_KEY).");
  return createSupabaseAdminClient();
}

async function validarAsignacion(rolId: string, empresaId: string, sucursalId: string) {
  if (!rolId || !empresaId || !sucursalId) throw new Error("Selecciona el rol, la empresa y la sucursal principal.");
  const admin = obtenerAdmin();
  const [rolResult, sucursalResult] = await Promise.all([
    admin.from("roles").select("id").eq("id", rolId).maybeSingle(),
    admin.from("sucursales").select("id,empresa_id,activo").eq("id", sucursalId).maybeSingle(),
  ]);
  if (rolResult.error || !rolResult.data) throw new Error("El rol seleccionado no existe.");
  if (sucursalResult.error || !sucursalResult.data || sucursalResult.data.empresa_id !== empresaId) throw new Error("La sucursal seleccionada no pertenece a esa empresa.");
  if (!sucursalResult.data.activo) throw new Error("La sucursal seleccionada está inactiva.");
}

export async function crearColaborador(input: CrearColaboradorInput) {
  await verificarSuperadmin();
  const nombre = input.nombre.trim();
  const email = input.email.trim().toLowerCase();
  if (nombre.length < 3) throw new Error("Escribe el nombre completo del integrante.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Escribe un correo válido.");
  if (input.password.length < 8) throw new Error("La contraseña inicial debe tener al menos 8 caracteres.");
  await validarAsignacion(input.rolId, input.empresaId, input.sucursalId);

  const admin = obtenerAdmin();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (createError || !created.user) throw new Error("No se pudo crear el acceso: " + (createError?.message ?? "respuesta incompleta"));

  const { error: profileError } = await admin.from("usuarios").insert({
    auth_user_id: created.user.id,
    nombre,
    email,
    rol_id: input.rolId,
    empresa_id: input.empresaId,
    sucursal_id: input.sucursalId,
    activo: true,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error("No se pudo completar el perfil del integrante: " + profileError.message);
  }
  revalidatePath("/equipo");
  revalidatePath("/pacientes");
}

export async function actualizarAsignacionColaborador(input: ActualizarAsignacionInput) {
  const current = await verificarSuperadmin();
  if (input.colaboradorId === current.id) throw new Error("Para proteger tu cuenta principal, no puedes cambiar aquí tu propio rol o sucursal.");
  await validarAsignacion(input.rolId, input.empresaId, input.sucursalId);
  const admin = obtenerAdmin();
  const { error } = await admin.from("usuarios").update({ rol_id: input.rolId, empresa_id: input.empresaId, sucursal_id: input.sucursalId }).eq("id", input.colaboradorId);
  if (error) throw new Error("No se pudo actualizar el acceso: " + error.message);
  revalidatePath("/equipo");
  revalidatePath("/pacientes");
}

export async function cambiarEstadoColaborador(colaboradorId: string, activo: boolean) {
  const current = await verificarSuperadmin();
  if (colaboradorId === current.id) throw new Error("No puedes desactivar tu propia cuenta de superadministración.");
  const admin = obtenerAdmin();
  const { data: colaborador, error: colaboradorError } = await admin.from("usuarios").select("id,auth_user_id,activo").eq("id", colaboradorId).maybeSingle();
  if (colaboradorError || !colaborador) throw new Error("No se encontró al integrante del equipo.");
  if (colaborador.activo === activo) return;

  if (activo) {
    const { error: authError } = await admin.auth.admin.updateUserById(colaborador.auth_user_id, { ban_duration: "none" });
    if (authError) throw new Error("No se pudo reactivar el inicio de sesión: " + authError.message);
    const { error: profileError } = await admin.from("usuarios").update({ activo: true }).eq("id", colaboradorId);
    if (profileError) {
      await admin.auth.admin.updateUserById(colaborador.auth_user_id, { ban_duration: "876000h" });
      throw new Error("No se pudo reactivar el perfil: " + profileError.message);
    }
  } else {
    const { error: profileError } = await admin.from("usuarios").update({ activo: false }).eq("id", colaboradorId);
    if (profileError) throw new Error("No se pudo desactivar el perfil: " + profileError.message);
    const { error: authError } = await admin.auth.admin.updateUserById(colaborador.auth_user_id, { ban_duration: "876000h" });
    if (authError) {
      await admin.from("usuarios").update({ activo: true }).eq("id", colaboradorId);
      throw new Error("No se pudo bloquear el inicio de sesión: " + authError.message);
    }
  }
  revalidatePath("/equipo");
  revalidatePath("/pacientes");
}

export async function cambiarContrasenaColaborador(authUserId: string, password: string) {
  await verificarSuperadmin();
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  const admin = obtenerAdmin();
  const { error } = await admin.auth.admin.updateUserById(authUserId, { password });
  if (error) throw new Error("No se pudo cambiar la contraseña: " + error.message);
}
