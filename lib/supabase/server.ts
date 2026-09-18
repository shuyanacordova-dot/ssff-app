import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseConfiguration() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && key());
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = key();
  if (!url || !publishableKey) throw new Error("Faltan variables de conexión a Supabase.");
  return createServerClient(url, publishableKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value; },
      set(name: string, value: string, options: CookieOptions) { try { cookieStore.set({ name, value, ...options }); } catch {} },
      remove(name: string, options: CookieOptions) { try { cookieStore.set({ name, value: "", ...options }); } catch {} },
    },
  });
}
