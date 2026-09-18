import { getCajaData } from "@/lib/caja";
import CajaBoard from "./caja-board";

export const dynamic = "force-dynamic";

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ gasto?: string }> }) {
  const query = await searchParams;
  return <CajaBoard {...await getCajaData()} autoGasto={query.gasto === "1"} />;
}
