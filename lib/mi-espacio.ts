import { getOperationalContext } from "@/lib/operational-context";
import { hasSupabaseConfiguration } from "@/lib/supabase/server";

export type DebtPayment = { id: string; monto: number; fecha_pago: string; metodo: string; referencia: string | null; notas: string | null };
export type BusinessDebt = { id: string; empresa_id: string; sucursal_id: string | null; proveedor: string; concepto: string; monto_original: number; saldo: number; fecha_deuda: string; fecha_vencimiento: string | null; frecuencia: "unica" | "mensual"; estado: "pendiente" | "pagada" | "anulada"; notas: string | null; pagos_deuda_negocio: DebtPayment[] };
export type PrivateAdminData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "setup_required" | "error"; message?: string; profile?: { id: string; nombre: string }; companies: { id: string; nombre: string }[]; branches: { id: string; empresa_id: string; nombre: string }[]; debts: BusinessDebt[] };

const setupMissing = (error: { code?: string; message?: string } | null) => error?.code === "42P01" || Boolean(error?.message?.includes("deudas_negocio"));

export async function getPrivateAdminData(): Promise<PrivateAdminData> {
  const empty = { companies: [], branches: [], debts: [] };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const context = await getOperationalContext();
    if (!context) return { status: "needs_login", message: "Inicia sesión para abrir tu espacio privado.", ...empty };
    if (context.profile.rol !== "superadmin") return { status: "forbidden", message: "Este espacio es privado y solo está disponible para la administración general.", ...empty };
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("deudas_negocio").select("id,empresa_id,sucursal_id,proveedor,concepto,monto_original,saldo,fecha_deuda,fecha_vencimiento,frecuencia,estado,notas,pagos_deuda_negocio(id,monto,fecha_pago,metodo,referencia,notas)").order("fecha_vencimiento", { ascending: true, nullsFirst: false });
    if (setupMissing(error)) return { status: "setup_required", message: "El módulo está construido localmente. Falta autorizar y aplicar su migración a Supabase para guardar datos.", profile: { id: context.profile.id, nombre: context.profile.nombre }, companies: context.companies, branches: context.branches, debts: [] };
    if (error) return { status: "error", message: "No se pudieron cargar las deudas privadas.", ...empty };
    return { status: "ready", profile: { id: context.profile.id, nombre: context.profile.nombre }, companies: context.companies, branches: context.branches, debts: (data ?? []) as unknown as BusinessDebt[] };
  } catch {
    return { status: "error", message: "No se pudo abrir tu espacio privado.", ...empty };
  }
}
