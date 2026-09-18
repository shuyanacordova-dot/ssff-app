import { getTaskData } from "@/lib/tasks";
import DashboardShell from "./dashboard-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <DashboardShell taskData={await getTaskData()} />;
}
