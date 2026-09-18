import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

export type Producto = { id: string; empresa_id: string; nombre: string; categoria: string; clasificacion: string | null; codigo: string | null; codigo_barra: string | null; precio_venta: number; costo_referencial: number | null; proveedor: string | null; controla_inventario: boolean; activo: boolean; diseno: string | null; material: string | null; indice: number | null; tecnologia: string | null; linea: string | null; rango_esf_pos: number | null; rango_esf_neg: number | null; rango_cil_pos: number | null; rango_cil_neg: number | null; rango_add_pos: number | null; rango_add_neg: number | null; marca: string | null; modelo: string | null; color: string | null; consignacion: boolean; precio_venta_2: number | null; precio_venta_3: number | null; medida_puente: number | null; fecha_compra: string | null };
export type StockRow = { id: string; producto_id: string; sucursal_id: string; cantidad: number; stock_minimo: number };
export type MovimientoInventario = { id: string; producto_id: string; sucursal_id: string; tipo: string; cantidad: number; motivo: string | null; venta_id: string | null; creado_en: string };
export type InventarioCompany = { id: string; nombre: string };
export type InventarioBranch = { id: string; empresa_id: string; nombre: string };
export type InventarioProfile = { id: string; empresa_id: string; sucursal_id: string | null; rol: string };
export type InventarioData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: InventarioProfile; companies: InventarioCompany[]; branches: InventarioBranch[]; productos: Producto[]; stock: StockRow[]; movimientos: MovimientoInventario[] };

const inventarioRoles = new Set(["superadmin", "admin_sucursal", "optometra", "vendedor"]);
const roleName = (profile: { roles: { nombre: string } | { nombre: string }[] | null } | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
const empty = { companies: [], branches: [], productos: [], stock: [], movimientos: [] };

export async function getInventarioData(): Promise<InventarioData> {
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para abrir inventario.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,empresa_id,sucursal_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; empresa_id: string; sucursal_id: string | null; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !inventarioRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para inventario.", ...empty };

    const [companiesResult, branchesResult, productosResult] = await Promise.all([
      supabase.from("empresas").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("sucursales").select("id,empresa_id,nombre").eq("activo", true).order("nombre"),
      supabase.from("productos_catalogo").select("id,empresa_id,nombre,categoria,clasificacion,codigo,codigo_barra,precio_venta,costo_referencial,proveedor,controla_inventario,activo,diseno,material,indice,tecnologia,linea,rango_esf_pos,rango_esf_neg,rango_cil_pos,rango_cil_neg,rango_add_pos,rango_add_neg,marca,modelo,color,consignacion,precio_venta_2,precio_venta_3,medida_puente,fecha_compra").eq("activo", true).order("nombre").limit(2000),
    ]);
    if (companiesResult.error || branchesResult.error || productosResult.error) return { status: "error", message: "No se pudo cargar inventario. Revisa la conexión y los permisos.", ...empty };

    const sucursalIds = (branchesResult.data ?? []).map((branch) => branch.id);
    const [stockResult, movimientosResult] = sucursalIds.length ? await Promise.all([
      supabase.from("inventario_stock").select("id,producto_id,sucursal_id,cantidad,stock_minimo").in("sucursal_id", sucursalIds).limit(5000),
      supabase.from("movimientos_inventario").select("id,producto_id,sucursal_id,tipo,cantidad,motivo,venta_id,creado_en").in("sucursal_id", sucursalIds).order("creado_en", { ascending: false }).limit(150),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (stockResult.error || movimientosResult.error) return { status: "error", message: "No se pudo cargar el stock. Revisa la conexión y los permisos.", ...empty };

    return {
      status: "ready",
      profile: { id: profile.id, empresa_id: profile.empresa_id, sucursal_id: profile.sucursal_id, rol: role },
      companies: companiesResult.data ?? [],
      branches: branchesResult.data ?? [],
      productos: (productosResult.data ?? []) as Producto[],
      stock: stockResult.data ?? [],
      movimientos: movimientosResult.data ?? [],
    };
  } catch { return { status: "error", message: "La conexión de inventario no está disponible.", ...empty }; }
}
