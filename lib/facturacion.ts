import { getVentasData, type Sale, type SaleBranch, type SaleCompany, type SalePatient } from "@/lib/ventas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InvoiceDraft = { id: string; venta_id: string | null; empresa_id: string; sucursal_id: string | null; cliente_nombre: string; cliente_identificacion: string | null; cliente_email: string | null; numero_interno: number; subtotal: number; descuento: number; iva: number; total: number; estado: string; creado_en: string };
export type BillingData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "setup_required" | "error"; message?: string; profile?: { id: string; rol: string }; sales: Sale[]; patients: SalePatient[]; companies: SaleCompany[]; branches: SaleBranch[]; drafts: InvoiceDraft[] };

export async function getBillingData(): Promise<BillingData> {
  const salesData = await getVentasData();
  const base = { sales: salesData.sales, patients: salesData.patients, companies: salesData.companies, branches: salesData.branches, drafts: [] };
  if (salesData.status !== "ready") return { status: salesData.status, message: salesData.message, profile: salesData.profile, ...base };
  if (!new Set(["superadmin", "admin_sucursal", "caja"]).has(salesData.profile?.rol ?? "")) return { status: "forbidden", message: "Tu perfil no tiene permiso para preparar facturas.", profile: salesData.profile, ...base };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("facturas_borrador").select("id,venta_id,empresa_id,sucursal_id,cliente_nombre,cliente_identificacion,cliente_email,numero_interno,subtotal,descuento,iva,total,estado,creado_en").order("creado_en", { ascending: false }).limit(100);
    if (error?.code === "42P01" || error?.message?.includes("facturas_borrador")) return { status: "setup_required", message: "El módulo está construido localmente. Falta autorizar y aplicar su migración a Supabase para guardar borradores.", profile: salesData.profile, ...base };
    if (error) return { status: "error", message: "No se pudieron cargar los borradores de facturación.", profile: salesData.profile, ...base };
    return { status: "ready", profile: salesData.profile, ...base, drafts: (data ?? []) as InvoiceDraft[] };
  } catch {
    return { status: "error", message: "No se pudo abrir facturación.", profile: salesData.profile, ...base };
  }
}
