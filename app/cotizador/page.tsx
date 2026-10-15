import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { getOperationalContext } from "@/lib/operational-context";
import { branchLetterhead } from "@/lib/sucursales";
import CotizadorBoard, { type LenteCotizador } from "./cotizador-board";

export const dynamic = "force-dynamic";

export default async function CotizadorPage() {
  if (!hasSupabaseConfiguration()) return <CotizadorBoard status="error" message="Falta configurar la conexión." lentes={[]} />;
  const context = await getOperationalContext();
  if (!context) return <CotizadorBoard status="needs_login" message="Inicia sesión para ver los precios de los lentes." lentes={[]} />;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await fetchAll<LenteCotizador>((from, to) => supabase.from("productos_catalogo")
    .select("id,nombre,codigo,diseno,linea,material,indice,tecnologia,precio_venta,precio_venta_2,precio_convenio")
    .eq("empresa_id", context.activeCompany.id).eq("categoria", "lente").eq("activo", true)
    .order("nombre").order("id").range(from, to));
  return <CotizadorBoard status={error ? "error" : "ready"} message={error?.message} lentes={data} empresaNombre={context.activeCompany.nombre} membrete={branchLetterhead(context.activeCompany, context.activeBranch)} />;
}
