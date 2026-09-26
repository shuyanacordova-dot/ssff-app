import { getOperationalContext } from "@/lib/operational-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ConteoBoard, { type ConteoData } from "./conteo-board";

export const dynamic = "force-dynamic";

export default async function ConteoPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const context = await getOperationalContext();
  if (!context) return <ConteoBoard status="needs_login" branches={[]} recientes={[]} aprobables={[]} />;
  const supabase = await createSupabaseServerClient();
  const branches = context.accessibleBranches.map((b) => ({ id: b.id, nombre: b.nombre }));
  const aprobables = (await Promise.all(branches.map(async (b) => {
    const { data } = await supabase.rpc("puede_aprobar_inventario", { p_sucursal: b.id });
    return data === true ? b.id : null;
  }))).filter(Boolean) as string[];

  const { data: recientesRaw } = await supabase.from("conteos_inventario")
    .select("id,sucursal_id,categoria,estado,creado_en,enviado_en,revisado_en,motivo_rechazo,notas,creado_por,conteo_inventario_items(esperado,contado)")
    .in("sucursal_id", branches.map((b) => b.id)).order("creado_en", { ascending: false }).limit(30);
  const recientes = (recientesRaw ?? []).map((c) => ({
    id: c.id as string, sucursal_id: c.sucursal_id as string, categoria: c.categoria as string, estado: c.estado as string, creado_en: c.creado_en as string,
    enviado_en: c.enviado_en as string | null, revisado_en: c.revisado_en as string | null, motivo_rechazo: c.motivo_rechazo as string | null, notas: c.notas as string | null,
    diferencias: ((c.conteo_inventario_items ?? []) as { esperado: number; contado: number | null }[]).filter((i) => i.contado !== null && Number(i.contado) !== Number(i.esperado)).length,
  }));

  let conteo: ConteoData["conteo"] = null;
  const abierto = id ?? recientes.find((c) => c.estado === "en_curso" && c.sucursal_id === context.activeBranch.id)?.id;
  if (abierto) {
    const { data } = await supabase.from("conteos_inventario")
      .select("id,sucursal_id,categoria,estado,creado_en,notas,motivo_rechazo,conteo_inventario_clasificaciones(clasificacion,esperado,contado),conteo_inventario_items(producto_id,clasificacion,esperado,contado,productos_catalogo(nombre,codigo_barra,codigo,color))")
      .eq("id", abierto).maybeSingle();
    if (data) conteo = {
      id: data.id, sucursal_id: data.sucursal_id, categoria: data.categoria, estado: data.estado, creado_en: data.creado_en, notas: data.notas, motivo_rechazo: data.motivo_rechazo,
      clasificaciones: ((data.conteo_inventario_clasificaciones ?? []) as { clasificacion: string; esperado: number; contado: number | null }[])
        .map((c) => ({ clasificacion: c.clasificacion, esperado: Number(c.esperado), contado: c.contado === null ? null : Number(c.contado) }))
        .sort((a, b) => a.clasificacion.localeCompare(b.clasificacion)),
      items: ((data.conteo_inventario_items ?? []) as unknown as { producto_id: string; clasificacion: string; esperado: number; contado: number | null; productos_catalogo: { nombre: string; codigo_barra: string | null; codigo: string | null; color: string | null } | null }[])
        .map((i) => ({ producto_id: i.producto_id, clasificacion: i.clasificacion, esperado: Number(i.esperado), contado: i.contado === null ? null : Number(i.contado), nombre: i.productos_catalogo?.nombre ?? "Producto", codigo_barra: i.productos_catalogo?.codigo_barra ?? null }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  }
  return <ConteoBoard status="ready" branches={branches} activaId={context.activeBranch.id} aprobables={aprobables} recientes={recientes} conteo={conteo} />;
}
