import { getTaskData } from "@/lib/tasks";
import DashboardShell from "./dashboard-shell";
import { obtenerInformeMensual, type InformeMensual } from "./informes/actions";
import { getOperationalContext } from "@/lib/operational-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ResumenHoy } from "./dashboard-shell";

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
    try { informeMensual = await obtenerInformeMensual(taskData.profile?.empresaId ?? null, `${year}-${month}-01`); }
    catch { metasMessage = "No se pudo cargar el avance de metas en este momento."; }
  }

  // Resumen del día de la sucursal donde se trabaja (mismos cálculos que el cuadre de caja).
  let resumenHoy: ResumenHoy | null = null;
  try {
    const context = await getOperationalContext();
    if (context) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.rpc("previsualizar_cierre_caja", { p_empresa: context.activeCompany.id, p_sucursal: context.activeBranch.id, p_fecha: null });
      if (data) resumenHoy = { ...(data as Omit<ResumenHoy, "sucursal">), sucursal: context.activeBranch.nombre };
    }
  } catch { resumenHoy = null; }

  return <DashboardShell taskData={taskData} informeMensual={informeMensual} metasMessage={metasMessage} resumenHoy={resumenHoy} />;
}
