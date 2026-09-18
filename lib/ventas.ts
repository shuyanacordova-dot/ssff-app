import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

export type SaleStatus = "borrador" | "completada" | "anulada";
export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta" | "credito" | "otro";
export type SaleProduct = { id: string; empresa_id: string; nombre: string; categoria: string; precio_venta: number; controla_inventario: boolean };
export type SaleCompany = { id: string; nombre: string };
export type SaleBranch = { id: string; empresa_id: string; nombre: string };
export type SaleStock = { producto_id: string; sucursal_id: string; cantidad: number };
export type SaleItem = { id: string; producto_id: string | null; descripcion: string; cantidad: number; precio_unitario: number; descuento: number; total_linea: number };
export type SalePayment = { id: string; metodo: PaymentMethod; monto: number; referencia: string | null; banco: string | null; creado_en: string };
export type SalePatient = { id: string; nombres: string; apellidos: string; cedula: string | null; telefono: string | null };
export type Sale = { id: string; empresa_id: string; sucursal_id: string | null; paciente_id: string | null; cliente_nombre: string | null; estado: SaleStatus; subtotal: number; descuento: number; total: number; pagado: number; saldo: number; motivo_anulacion: string | null; recibo_token: string; fecha_entrega_estimada: string | null; creado_en: string; venta_items: SaleItem[]; pagos_venta: SalePayment[] };
export type SalesProfile = { id: string; empresa_id: string; sucursal_id: string | null; rol: string };
export type SaleLabOrder = { id: string; venta_id: string; venta_item_id: string | null; estado: string; laboratorio: string };
export type EmpresaConvenio = { id: string; nombre: string };
export type VentasData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: SalesProfile; products: SaleProduct[]; stock: SaleStock[]; sales: Sale[]; companies: SaleCompany[]; branches: SaleBranch[]; patients: SalePatient[]; labOrders: SaleLabOrder[]; empresasConvenio: EmpresaConvenio[] };

const salesRoles = new Set(["superadmin", "admin_sucursal", "vendedor", "caja", "optometra"]);
const roleName = (profile: { roles: { nombre: string } | { nombre: string }[] | null } | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;

export async function getVentasData(): Promise<VentasData> {
  const empty = { products: [], stock: [], sales: [], companies: [], branches: [], patients: [], labOrders: [], empresasConvenio: [] };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para abrir ventas.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,empresa_id,sucursal_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; empresa_id: string; sucursal_id: string | null; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !salesRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para ventas.", ...empty };

    const [productsResult, salesResult, companiesResult, branchesResult, patientsResult, empresasConvenioResult] = await Promise.all([
      supabase.from("productos_catalogo").select("id,empresa_id,nombre,categoria,precio_venta,controla_inventario").eq("activo", true).order("nombre").limit(200),
      supabase.from("ventas").select("id,empresa_id,sucursal_id,paciente_id,cliente_nombre,estado,subtotal,descuento,total,pagado,saldo,motivo_anulacion,recibo_token,fecha_entrega_estimada,creado_en,venta_items(id,producto_id,descripcion,cantidad,precio_unitario,descuento,total_linea),pagos_venta(id,metodo,monto,referencia,banco,creado_en)").order("creado_en", { ascending: false }).limit(30),
      supabase.from("empresas").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("sucursales").select("id,empresa_id,nombre").eq("activo", true).order("nombre"),
      supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,telefono").order("apellidos").order("nombres").limit(500),
      supabase.from("empresas_convenio").select("id,nombre").eq("activo", true).order("nombre"),
    ]);
    if (productsResult.error || salesResult.error || companiesResult.error || branchesResult.error) return { status: "error", message: "No se pudo cargar ventas. Revisa la conexión y los permisos.", ...empty };

    const productIds = (productsResult.data ?? []).map((product) => product.id);
    const stockResult = productIds.length ? await supabase.from("inventario_stock").select("producto_id,sucursal_id,cantidad").in("producto_id", productIds) : { data: [], error: null };
    if (stockResult.error) return { status: "error", message: "No se pudo cargar el stock de ventas.", ...empty };

    const saleIds = (salesResult.data ?? []).map((sale) => sale.id);
    const labOrdersResult = saleIds.length ? await supabase.from("ordenes_laboratorio").select("id,venta_id,venta_item_id,estado,laboratorio").in("venta_id", saleIds) : { data: [], error: null };

    return {
      status: "ready",
      profile: { id: profile.id, empresa_id: profile.empresa_id, sucursal_id: profile.sucursal_id, rol: role },
      products: (productsResult.data ?? []) as SaleProduct[],
      stock: stockResult.data ?? [],
      sales: (salesResult.data ?? []) as unknown as Sale[],
      companies: (companiesResult.data ?? []) as SaleCompany[],
      branches: (branchesResult.data ?? []) as SaleBranch[],
      patients: patientsResult.error ? [] : (patientsResult.data ?? []),
      labOrders: labOrdersResult.error ? [] : (labOrdersResult.data ?? []),
      empresasConvenio: empresasConvenioResult.error ? [] : (empresasConvenioResult.data ?? []),
    };
  } catch {
    return { status: "error", message: "La conexión de ventas no está disponible.", ...empty };
  }
}
