import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Usuario de la sesión, consultado una sola vez por cada carga de página (varias funciones lo necesitan).
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});
