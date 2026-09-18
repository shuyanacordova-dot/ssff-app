import { getVentasData } from "@/lib/ventas";
import SalesBoard from "./sales-board";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  return <SalesBoard {...await getVentasData()} />;
}
