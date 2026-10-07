import { getTaskData } from "@/lib/tasks";
import DashboardShell from "./dashboard-shell";
import { obtenerInformeMensual, type InformeMensual } from "./informes/actions";
import { getOperationalContext } from "@/lib/operational-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ResumenHoy } from "./dashboard-shell";
import type { DineroDisponible } from "@/lib/informes";

export const dynamic = "force-dynamic";

export default async function Home() {
  const taskData = await getTaskData();
  const puedeVerMetas = taskData.profile?.rol === "superadmin" || taskData.profile?.rol === "admin_sucursal";
  let informeMensual: InformeMensual | null = null;
  let metasMessage = "";

  if (puedeVerMetas) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    try { informeMensual = await obtenerInformeMensual(taskData.profile?.rol === "superadmin" ? null : taskData.profile?.empresaId ?? null, `${year}-${month}-01`); }
    catch { metasMessage = "No se pudo cargar el avance de metas en este momento."; }
  }

  // Acumulado = dinero disponible de cada óptica (bancos desde su último cuadre + efectivo de caja). No se reinicia cada
  // mes: solo suben los cobros y bajan los egresos (Shuyana 2026-10-01). Solo superadmin.
  let acumulado: DineroDisponible[] | null = null;
  if (taskData.profile?.rol === "superadmin") {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc("dinero_disponible", { p_fecha: null });
      if (!error && Array.isArray(data)) acumulado = data as DineroDisponible[];
    } catch { acumulado = null; }
  }

  // Resumen del día de la sucursal donde se trabaja (mismos cálculos que el cuadre de caja).
  let resumenHoy: ResumenHoy | null = null;
  let cobrosHoy = { cantidad: 0, total: 0 };
  let cuadresFaltantes: string[] = [];
  try {
    const context = await getOperationalContext();
    if (context) {
      const supabase = await createSupabaseServerClient();
      try {
        const { data: cola, error } = await supabase.rpc("cola_cobros_hoy", { p_sucursal: context.activeBranch.id });
        if (!error && Array.isArray(cola)) cobrosHoy = { cantidad: cola.length, total: cola.reduce((sum: number, row: { saldo: number }) => sum + Number(row.saldo), 0) };
      } catch { /* El inicio sigue disponible si falla la cola. */ }
      try {
        const { data: dias } = await supabase.rpc("cuadres_faltantes", { p_sucursal: context.activeBranch.id });
        if (Array.isArray(dias)) cuadresFaltantes = dias as string[];
      } catch { /* El inicio sigue disponible si falla el aviso. */ }
      const { data } = await supabase.rpc("previsualizar_cierre_caja", { p_empresa: context.activeCompany.id, p_sucursal: context.activeBranch.id, p_fecha: null });
      if (data) resumenHoy = { ...(data as Omit<ResumenHoy, "sucursal">), sucursal: context.activeBranch.nombre };
    }
  } catch { resumenHoy = null; }

  return <DashboardShell taskData={taskData} informeMensual={informeMensual} metasMessage={metasMessage} resumenHoy={resumenHoy} cobrosHoy={cobrosHoy} acumulado={acumulado} cuadresFaltantes={cuadresFaltantes} />;
}
