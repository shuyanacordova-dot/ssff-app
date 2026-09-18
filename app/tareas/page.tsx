import { getTaskData } from "@/lib/tasks";
import TaskBoard from "./task-board";

export const dynamic = "force-dynamic";

export default async function TareasPage() {
  return <TaskBoard {...await getTaskData()} />;
}
