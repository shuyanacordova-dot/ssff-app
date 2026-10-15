import { getPanelReferidos } from "@/lib/referidos-panel-data";
import PanelBoard from "./panel-board";

export const dynamic = "force-dynamic";

export default async function PanelReferidosPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }> }) {
  const query = await searchParams;
  return <PanelBoard {...await getPanelReferidos(query)} />;
}
