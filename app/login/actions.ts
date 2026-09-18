"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

async function origen() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function destinoSeguro(value: FormDataEntryValue | null) {
  const destino = String(value ?? "/");
  return destino.startsWith("/") && !destino.startsWith("//") ? destino : "/";
}

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = destinoSeguro(formData.get("next"));

  if (!hasSupabaseConfiguration()) {
    redirect("/login?error=Esta%20copia%20a%C3%BAn%20no%20tiene%20conexi%C3%B3n%20configurada.");
  }
  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Ingresa correo y contraseña.")}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent("Correo o contraseña incorrectos.")}&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function solicitarRecuperacion(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!hasSupabaseConfiguration()) {
    redirect("/olvide-contrasena?error=Esta%20copia%20a%C3%BAn%20no%20tiene%20conexi%C3%B3n%20configurada.");
  }
  if (!email) {
    redirect(`/olvide-contrasena?error=${encodeURIComponent("Ingresa tu correo.")}`);
  }
  const supabase = await createSupabaseServerClient();
  const redirectTo = `${await origen()}/auth/callback?next=${encodeURIComponent("/actualizar-contrasena")}`;
  await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  redirect("/olvide-contrasena?enviado=1");
}

export async function actualizarContrasena(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmacion = String(formData.get("confirmacion") ?? "");
  if (!hasSupabaseConfiguration()) {
    redirect("/actualizar-contrasena?error=Esta%20copia%20a%C3%BAn%20no%20tiene%20conexi%C3%B3n%20configurada.");
  }
  if (password.length < 8) {
    redirect(`/actualizar-contrasena?error=${encodeURIComponent("La contraseña debe tener al menos 8 caracteres.")}`);
  }
  if (password !== confirmacion) {
    redirect(`/actualizar-contrasena?error=${encodeURIComponent("Las contraseñas no coinciden.")}`);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/actualizar-contrasena?error=${encodeURIComponent("El enlace ya expiró. Solicita uno nuevo desde \"Olvidé mi contraseña\".")}`);
  }
  redirect("/login?enviado=contrasena-actualizada");
}

export async function cerrarSesion() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Si falla el cierre de sesión en el servidor, igual sacamos a la persona del panel.
  }
  redirect("/login");
}
