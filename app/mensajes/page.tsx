import { getMensajesDiaData } from "@/lib/mensajes-dia";
import MensajesBoard from "./mensajes-board";

export const dynamic = "force-dynamic";

export default async function MensajesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <MensajesBoard {...await getMensajesDiaData()} tabInicial={tab} />;
}
