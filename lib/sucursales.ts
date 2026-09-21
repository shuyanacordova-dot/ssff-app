import type { SupabaseClient } from "@supabase/supabase-js";

export type CompanyIdentity = { id: string; nombre: string; direccion: string | null; telefono: string | null; email: string | null; logo_url: string | null };
export type BranchIdentity = {
  id: string;
  empresa_id: string;
  nombre: string;
  ciudad: string | null;
  logo_url: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  color_primario: string | null;
};

export async function loadBranchIdentities(supabase: SupabaseClient): Promise<{ branches: BranchIdentity[]; schemaReady: boolean }> {
  const enriched = await supabase.from("sucursales")
    .select("id,empresa_id,nombre,ciudad,logo_url,direccion,telefono,email,color_primario")
    .eq("activo", true)
    .order("nombre");
  if (!enriched.error) return { branches: (enriched.data ?? []) as BranchIdentity[], schemaReady: true };

  const fallback = await supabase.from("sucursales").select("id,empresa_id,nombre,ciudad").eq("activo", true).order("nombre");
  if (fallback.error) throw fallback.error;
  return {
    schemaReady: false,
    branches: (fallback.data ?? []).map((branch) => ({ ...branch, logo_url: null, direccion: null, telefono: null, email: null, color_primario: null })),
  };
}

export function branchLetterhead(company: CompanyIdentity | null | undefined, branch: BranchIdentity | null | undefined) {
  if (!company) return null;
  return {
    id: company.id,
    nombre: company.nombre,
    direccion: branch?.direccion || company.direccion,
    telefono: branch?.telefono || company.telefono,
    email: branch?.email || company.email,
    logo_url: branch?.logo_url || company.logo_url,
  };
}
