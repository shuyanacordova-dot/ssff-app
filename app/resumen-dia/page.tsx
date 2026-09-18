import { getResumenDiaData } from "@/lib/resumen-dia";
import ResumenDiaBoard from "./resumen-dia-board";

export const dynamic = "force-dynamic";

export default async function ResumenDiaPage({ searchParams }: { searchParams: Promise<{ fecha?: string; empresa?: string }> }) {
  const query = await searchParams;
  const fecha = query.fecha || new Date().toISOString().slice(0, 10);
  return <ResumenDiaBoard {...await getResumenDiaData(fecha, query.empresa)} fecha={fecha} />;
}
