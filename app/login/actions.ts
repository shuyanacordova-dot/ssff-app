"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

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

export async function cerrarSesion() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Si falla el cierre de sesión en el servidor, igual sacamos a la persona del panel.
  }
  redirect("/login");
}
