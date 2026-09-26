import { cache } from "react";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadBranchIdentities, type BranchIdentity, type CompanyIdentity } from "@/lib/sucursales";

export const ACTIVE_BRANCH_COOKIE = "shu_active_branch";

type RawProfile = { id: string; auth_user_id: string; nombre: string; empresa_id: string; sucursal_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null };
const roleName = (profile: RawProfile | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;

export type OperationalContext = {
  profile: { id: string; authUserId: string; nombre: string; rol: string; empresaPrincipalId: string; sucursalPrincipalId: string };
  companies: CompanyIdentity[];
  branches: BranchIdentity[];
  accessibleBranches: BranchIdentity[];
  activeBranch: BranchIdentity;
  activeCompany: CompanyIdentity;
  canSwitchBranch: boolean;
  brandingSchemaReady: boolean;
};

// Se calcula una sola vez por carga de página aunque varias funciones la pidan.
export const getOperationalContext = cache(async (): Promise<OperationalContext | null> => {
  const supabase = await createSupabaseServerClient();
  const auth = { user: await getCurrentUser() };
  if (!auth.user) return null;
  const { data: rawProfile, error: profileError } = await supabase.from("usuarios")
    .select("id,auth_user_id,nombre,empresa_id,sucursal_id,activo,roles(nombre)")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  const profile = rawProfile as unknown as RawProfile | null;
  const rol = roleName(profile);
  if (profileError || !profile?.activo || !rol) return null;

  const [companiesResult, branchResult] = await Promise.all([
    supabase.from("empresas").select("id,nombre,direccion,telefono,email,logo_url").eq("activo", true).order("nombre"),
    loadBranchIdentities(supabase),
  ]);
  if (companiesResult.error) return null;
  const companies = (companiesResult.data ?? []) as CompanyIdentity[];
  const accessibleBranches = rol === "superadmin"
    ? branchResult.branches
    : branchResult.branches.filter((branch) => branch.id === profile.sucursal_id);
  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_BRANCH_COOKIE)?.value;
  const activeBranch = accessibleBranches.find((branch) => branch.id === preferredId)
    ?? accessibleBranches.find((branch) => branch.id === profile.sucursal_id)
    ?? accessibleBranches[0];
  if (!activeBranch) return null;
  const activeCompany = companies.find((company) => company.id === activeBranch.empresa_id);
  if (!activeCompany) return null;

  return {
    profile: { id: profile.id, authUserId: profile.auth_user_id, nombre: profile.nombre, rol, empresaPrincipalId: profile.empresa_id, sucursalPrincipalId: profile.sucursal_id },
    companies,
    branches: branchResult.branches,
    accessibleBranches,
    activeBranch,
    activeCompany,
    canSwitchBranch: accessibleBranches.length > 1,
    brandingSchemaReady: branchResult.schemaReady,
  };
});
