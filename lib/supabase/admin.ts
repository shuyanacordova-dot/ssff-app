import { createClient } from "@supabase/supabase-js";

export function hasSupabaseAdminConfiguration() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Falta configurar la clave de servicio de Supabase.");
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
