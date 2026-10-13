"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// El menú pregunta una vez si la persona es Superadministradora, para mostrar sus apartados privados.
export async function esSuperadminActual(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("es_superadmin");
    return data === true;
  } catch { return false; }
}

export async function puedeVerCuadreBancosActual(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("sucursales_cuadre_bancos_usuario");
    return !error && Array.isArray(data) && data.length > 0;
  } catch { return false; }
}
