import { getInventarioData } from "@/lib/inventario";
import InventarioBoard from "./inventario-board";

export const dynamic = "force-dynamic";

export default async function InventarioPage({ searchParams }: { searchParams: Promise<{ grupo?: string }> }) {
  const { grupo } = await searchParams;
  return <InventarioBoard {...await getInventarioData()} grupoInicial={grupo === "lunas" ? "lunas" : "monturas"} />;
}
