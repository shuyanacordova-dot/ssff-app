import { getLabMonitorData } from "@/lib/monitor-laboratorio";
import LabMonitorBoard from "./lab-monitor-board";

export const dynamic = "force-dynamic";

export default async function LaboratorioPage() {
  return <LabMonitorBoard {...await getLabMonitorData()} />;
}
