import { getTaskData } from "@/lib/tasks";
import TaskBoard from "./task-board";

export const dynamic = "force-dynamic";

// ?nueva=1 abre directo el formulario de nueva tarea (ícono "Tarea" en el iPhone).
export default async function TareasPage({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  const query = await searchParams;
  return <TaskBoard {...await getTaskData()} autoNueva={query.nueva === "1"} />;
}
