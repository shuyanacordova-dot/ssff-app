import { getTaskData } from "@/lib/tasks";
import DashboardShell from "./dashboard-shell";
import { obtenerInformeMensual, type InformeMensual } from "./informes/actions";

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

  return <DashboardShell taskData={taskData} informeMensual={informeMensual} metasMessage={metasMessage} />;
}
