import { getAgendaData } from "@/lib/agenda";
import AgendaBoard from "./agenda-board";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  return <AgendaBoard {...await getAgendaData()} />;
}
