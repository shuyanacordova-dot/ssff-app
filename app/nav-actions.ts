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
