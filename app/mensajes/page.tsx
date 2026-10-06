import { getMensajesDiaData } from "@/lib/mensajes-dia";
import MensajesBoard from "./mensajes-board";

export const dynamic = "force-dynamic";

export default async function MensajesPage() {
  return <MensajesBoard {...await getMensajesDiaData()} />;
}
