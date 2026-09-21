import { getSucursalesConfigData } from "@/lib/configuracion-sucursales";
import SucursalesBoard from "./sucursales-board";

export const dynamic = "force-dynamic";

export default async function SucursalesPage() {
  return <SucursalesBoard {...await getSucursalesConfigData()} />;
}
