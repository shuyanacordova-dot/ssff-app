import { getAgendaData } from "@/lib/agenda";
import AgendaBoard from "../agenda-board";

export const dynamic = "force-dynamic";

// Agenda de actividades de la óptica (reuniones, campañas, pagos…), separada de la agenda de citas de pacientes.
export default async function AgendaActividadesPage() {
  return <AgendaBoard modo="actividades" {...await getAgendaData()} />;
}
