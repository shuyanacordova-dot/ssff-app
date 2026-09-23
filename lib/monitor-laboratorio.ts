import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import { branchLetterhead, type BranchIdentity, type CompanyIdentity } from "@/lib/sucursales";
import type { EstadoOrdenLaboratorio, LaboratorioProveedor, OrdenLaboratorioMedidas, OrdenLaboratorioRx, TipoLente, UsoCalculado } from "@/lib/laboratorio";

export type LabMonitorOrder = {
  id: string;
  empresa_id: string;
  sucursal_id: string;
  paciente_id: string;
  venta_id: string;
  consulta_id: string | null;
  estado: EstadoOrdenLaboratorio;
  laboratorio: LaboratorioProveedor;
  uso_calculado: UsoCalculado;
  tipo_lente: TipoLente;
  rx: OrdenLaboratorioRx;
  medidas: OrdenLaboratorioMedidas;
  notas: string | null;
  motivo_rechazo: string | null;
  es_garantia: boolean;
  creado_en: string;
  actualizado_en: string;
  paciente_nombre: string;
  paciente_telefono: string | null;
  venta_folio: number | null;
  fecha_entrega_estimada: string | null;
  producto_descripcion: string;
  reviso_nombre: string | null;
  empresa_nombre: string;
  sucursal_nombre: string;
  membrete: ReturnType<typeof branchLetterhead>;
};

export type LabMonitorData = {
  status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error";
  message?: string;
  role?: string;
  activeBranchId?: string;
  branches: BranchIdentity[];
  orders: LabMonitorOrder[];
};

const allowedRoles = new Set(["superadmin", "admin_sucursal", "vendedor", "caja", "optometra"]);

export async function getLabMonitorData(): Promise<LabMonitorData> {
  const empty = { branches: [], orders: [] };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const context = await getOperationalContext();
    if (!context) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      return { status: data.user ? "forbidden" : "needs_login", message: data.user ? "Tu perfil no tiene acceso al laboratorio." : "Inicia sesión para abrir el laboratorio.", ...empty };
    }
    if (!allowedRoles.has(context.profile.rol)) return { status: "forbidden", message: "Tu rol no tiene acceso al laboratorio.", ...empty };

    const supabase = await createSupabaseServerClient();
    const branchIds = context.accessibleBranches.map((branch) => branch.id);
    let orderQuery = supabase.from("ordenes_laboratorio")
      .select("id,empresa_id,sucursal_id,paciente_id,venta_id,consulta_id,estado,laboratorio,uso_calculado,tipo_lente,rx,medidas,notas,motivo_rechazo,es_garantia,creado_en,actualizado_en")
      .order("actualizado_en", { ascending: false })
      .limit(250);
    if (branchIds.length) orderQuery = orderQuery.in("sucursal_id", branchIds);
    const { data: rawOrders, error: ordersError } = await orderQuery;
    if (ordersError) return { status: "error", message: "No se pudieron cargar las órdenes de laboratorio.", ...empty };

    const orders = rawOrders ?? [];
    const patientIds = [...new Set(orders.map((order) => order.paciente_id).filter(Boolean))];
    const saleIds = [...new Set(orders.map((order) => order.venta_id).filter(Boolean))];
    const consultationIds = [...new Set(orders.map((order) => order.consulta_id).filter(Boolean))] as string[];
    const [patientsResult, salesResult, consultationsResult] = await Promise.all([
      patientIds.length ? supabase.from("pacientes_clinicos").select("id,nombres,apellidos,telefono").in("id", patientIds) : Promise.resolve({ data: [], error: null }),
      saleIds.length ? supabase.from("ventas").select("id,folio,fecha_entrega_estimada,venta_items(id,descripcion)").in("id", saleIds) : Promise.resolve({ data: [], error: null }),
      consultationIds.length ? supabase.from("consultas_optometricas").select("id,optometrista_id").in("id", consultationIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (patientsResult.error || salesResult.error || consultationsResult.error) return { status: "error", message: "Las órdenes cargaron, pero faltan datos de pacientes, ventas o revisiones.", ...empty };

    const professionalIds = [...new Set((consultationsResult.data ?? []).map((consultation) => consultation.optometrista_id).filter(Boolean))] as string[];
    const professionalsResult = professionalIds.length ? await supabase.from("usuarios").select("id,nombre").in("id", professionalIds) : { data: [], error: null };

    const patients = new Map((patientsResult.data ?? []).map((patient) => [patient.id, patient]));
    const sales = new Map((salesResult.data ?? []).map((sale) => [sale.id, sale]));
    const consultations = new Map((consultationsResult.data ?? []).map((consultation) => [consultation.id, consultation]));
    const professionalNames = new Map((professionalsResult.data ?? []).map((professional) => [professional.id, professional.nombre]));
    const companies = new Map<string, CompanyIdentity>(context.companies.map((company) => [company.id, company]));
    const branches = new Map(context.accessibleBranches.map((branch) => [branch.id, branch]));
    const enriched = orders.map((order) => {
      const patient = patients.get(order.paciente_id);
      const sale = sales.get(order.venta_id);
      const consultation = order.consulta_id ? consultations.get(order.consulta_id) : null;
      const company = companies.get(order.empresa_id);
      const branch = branches.get(order.sucursal_id);
      return {
        ...order,
        paciente_nombre: patient ? [patient.nombres, patient.apellidos].map((part) => part?.trim()).filter(Boolean).join(" ") || "Paciente" : "Paciente",
        paciente_telefono: patient?.telefono ?? null,
        venta_folio: sale?.folio ?? null,
        fecha_entrega_estimada: sale?.fecha_entrega_estimada ?? null,
        producto_descripcion: sale?.venta_items?.map((item) => item.descripcion).filter(Boolean).join(" + ") || "Producto no especificado",
        reviso_nombre: consultation?.optometrista_id ? professionalNames.get(consultation.optometrista_id) ?? null : null,
        empresa_nombre: company?.nombre ?? "Empresa",
        sucursal_nombre: branch?.nombre ?? "Sucursal",
        membrete: branchLetterhead(company, branch),
      } as LabMonitorOrder;
    });

    return {
      status: "ready",
      role: context.profile.rol,
      activeBranchId: context.activeBranch.id,
      branches: context.accessibleBranches,
      orders: enriched,
    };
  } catch {
    return { status: "error", message: "El monitor de laboratorio no está disponible en este momento.", ...empty };
  }
}
