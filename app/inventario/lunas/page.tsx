import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import LunasBoard, { type LunaStock } from "./lunas-board";

export const dynamic = "force-dynamic";

const editores = new Set(["superadmin", "admin_sucursal", "optometra"]);
const lectores = new Set([...editores, "vendedor"]);

export default async function LunasPage() {
  if (!hasSupabaseConfiguration()) return <LunasBoard status="error" message="Falta configurar la conexión." lunas={[]} branches={[]} empresaId="" canEdit={false} />;
  const context = await getOperationalContext();
  if (!context) return <LunasBoard status="needs_login" message="Inicia sesión para ver el banco de lunas." lunas={[]} branches={[]} empresaId="" canEdit={false} />;
  if (!lectores.has(context.profile.rol)) return <LunasBoard status="forbidden" message="Tu perfil no tiene acceso al banco de lunas." lunas={[]} branches={[]} empresaId="" canEdit={false} />;
  const empresaId = context.activeCompany.id;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("lunas_stock")
    .select("id,sucursal_id,origen,tipo,material,indice,tratamiento,esfera,cilindro,eje,adicion,diametro,tallada,cantidad,notas,creado_en")
    .eq("empresa_id", empresaId).order("esfera").order("cilindro", { ascending: false });
  const branches = context.accessibleBranches.filter((b) => b.empresa_id === empresaId).map((b) => ({ id: b.id, nombre: b.nombre }));
  return <LunasBoard status={error ? "error" : "ready"} message={error?.message} lunas={(data ?? []) as LunaStock[]} branches={branches} empresaId={empresaId} empresaNombre={context.activeCompany.nombre} canEdit={editores.has(context.profile.rol)} />;
}
