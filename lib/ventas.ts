import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";
import { getOperationalContext } from "@/lib/operational-context";
import { loadBranchIdentities, type BranchIdentity, type CompanyIdentity } from "@/lib/sucursales";

export type SaleStatus = "borrador" | "completada" | "anulada";
export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta" | "credito" | "otro";
export type SaleProduct = { id: string; empresa_id: string; nombre: string; categoria: string; precio_venta: number; controla_inventario: boolean };
export type SaleCompany = CompanyIdentity;
export type SaleBranch = BranchIdentity;
export type SaleStock = { producto_id: string; sucursal_id: string; cantidad: number };
export type SaleItem = { id: string; producto_id: string | null; descripcion: string; cantidad: number; precio_unitario: number; descuento: number; total_linea: number };
export type SalePayment = { id: string; metodo: PaymentMethod; monto: number; referencia: string | null; banco: string | null; creado_en: string };
export type SalePatient = { id: string; nombres: string; apellidos: string; cedula: string | null; telefono: string | null };
export type Sale = { id: string; empresa_id: string; sucursal_id: string | null; paciente_id: string | null; cliente_nombre: string | null; estado: SaleStatus; subtotal: number; descuento: number; total: number; pagado: number; saldo: number; motivo_anulacion: string | null; recibo_token: string; fecha_entrega_estimada: string | null; creado_en: string; folio: number | null; apartado?: boolean; apartado_hasta?: string | null; venta_items: SaleItem[]; pagos_venta: SalePayment[] };
export type SalesProfile = { id: string; empresa_id: string; sucursal_id: string | null; rol: string };
export type SaleLabOrder = { id: string; venta_id: string; venta_item_id: string | null; estado: string; laboratorio: string; creado_en: string; tipo_lente: string; es_garantia: boolean };
export type EmpresaConvenio = { id: string; nombre: string };
export type Garantia = { id: string; venta_id: string; venta_item_id: string | null; tipo: "armazon" | "luna"; motivo: string; estado: "abierta" | "resuelta" | "rechazada"; orden_laboratorio_id: string | null; notas: string | null; creado_en: string };
export type VentasData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: SalesProfile; products: SaleProduct[]; stock: SaleStock[]; sales: Sale[]; companies: SaleCompany[]; branches: SaleBranch[]; accessibleBranches: SaleBranch[]; patients: SalePatient[]; labOrders: SaleLabOrder[]; garantias: Garantia[]; empresasConvenio: EmpresaConvenio[] };

const salesRoles = new Set(["superadmin", "admin_sucursal", "vendedor", "caja", "optometra"]);
const roleName = (profile: { roles: { nombre: string } | { nombre: string }[] | null } | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;

export async function getVentasData(): Promise<VentasData> {
  const empty = { products: [], stock: [], sales: [], companies: [], branches: [], accessibleBranches: [], patients: [], labOrders: [], garantias: [], empresasConvenio: [] };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para abrir ventas.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,empresa_id,sucursal_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; empresa_id: string; sucursal_id: string | null; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !salesRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para ventas.", ...empty };

    const [productsResult, salesResult, companiesResult, branchesResult, empresasConvenioResult, operationalContext] = await Promise.all([
      supabase.from("productos_catalogo").select("id,empresa_id,nombre,categoria,precio_venta,controla_inventario").eq("activo", true).order("nombre").limit(200),
      supabase.from("ventas").select("id,empresa_id,sucursal_id,paciente_id,cliente_nombre,estado,subtotal,descuento,total,pagado,saldo,motivo_anulacion,recibo_token,fecha_entrega_estimada,creado_en,folio,apartado,apartado_hasta,venta_items(id,producto_id,descripcion,cantidad,precio_unitario,descuento,total_linea),pagos_venta(id,metodo,monto,referencia,banco,creado_en)").order("creado_en", { ascending: false }).limit(30),
      supabase.from("empresas").select("id,nombre,direccion,telefono,email,logo_url").eq("activo", true).order("nombre"),
      loadBranchIdentities(supabase),
      supabase.from("empresas_convenio").select("id,nombre").eq("activo", true).order("nombre"),
      getOperationalContext(),
    ]);
    if (productsResult.error || salesResult.error || companiesResult.error) return { status: "error", message: "No se pudo cargar ventas. Revisa la conexión y los permisos.", ...empty };

    // El directorio comercial puede estar limitado por RLS, pero cada venta debe
    // conservar el nombre de su paciente. La lectura administrativa ocurre solo
    // después de validar que la sesión tenga un rol autorizado para Ventas.
    const patientReader = hasSupabaseAdminConfiguration() ? createSupabaseAdminClient() : supabase;
    const salePatientIds = Array.from(new Set((salesResult.data ?? []).map((sale) => sale.paciente_id).filter(Boolean))) as string[];
    const [patientDirectoryResult, salePatientsResult] = await Promise.all([
      patientReader.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,telefono").order("apellidos").order("nombres").limit(500),
      salePatientIds.length
        ? patientReader.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,telefono").in("id", salePatientIds)
        : Promise.resolve({ data: [] as SalePatient[], error: null }),
    ]);
    const patientMap = new Map<string, SalePatient>();
    (patientDirectoryResult.data ?? []).forEach((patient) => patientMap.set(patient.id, patient));
    (salePatientsResult.data ?? []).forEach((patient) => patientMap.set(patient.id, patient));

    const productIds = (productsResult.data ?? []).map((product) => product.id);
    const stockResult = productIds.length ? await supabase.from("inventario_stock").select("producto_id,sucursal_id,cantidad").in("producto_id", productIds) : { data: [], error: null };
    if (stockResult.error) return { status: "error", message: "No se pudo cargar el stock de ventas.", ...empty };

    const saleIds = (salesResult.data ?? []).map((sale) => sale.id);
    const [labOrdersResult, garantiasResult] = saleIds.length ? await Promise.all([
      supabase.from("ordenes_laboratorio").select("id,venta_id,venta_item_id,estado,laboratorio,es_garantia,creado_en,tipo_lente").in("venta_id", saleIds),
      supabase.from("garantias").select("id,venta_id,venta_item_id,tipo,motivo,estado,orden_laboratorio_id,notas,creado_en").in("venta_id", saleIds).order("creado_en", { ascending: false }),
    ]) : [{ data: [], error: null }, { data: [], error: null }];

    return {
      status: "ready",
      profile: { id: profile.id, empresa_id: operationalContext?.activeCompany.id ?? profile.empresa_id, sucursal_id: operationalContext?.activeBranch.id ?? profile.sucursal_id, rol: role },
      products: (productsResult.data ?? []) as SaleProduct[],
      stock: stockResult.data ?? [],
      sales: (salesResult.data ?? []) as unknown as Sale[],
      companies: (companiesResult.data ?? []) as SaleCompany[],
      branches: branchesResult.branches,
      accessibleBranches: operationalContext?.accessibleBranches ?? branchesResult.branches,
      patients: Array.from(patientMap.values()),
      labOrders: labOrdersResult.error ? [] : (labOrdersResult.data ?? []),
      garantias: garantiasResult.error ? [] : ((garantiasResult.data ?? []) as unknown as Garantia[]),
      empresasConvenio: empresasConvenioResult.error ? [] : (empresasConvenioResult.data ?? []),
    };
  } catch {
    return { status: "error", message: "La conexión de ventas no está disponible.", ...empty };
  }
}
