import { getCuentasCobrarData } from "@/lib/cuentas-cobrar";
import CuentasCobrarBoard from "./cuentas-cobrar-board";

export const dynamic = "force-dynamic";

export default async function CuentasCobrarPage() {
  return <CuentasCobrarBoard {...await getCuentasCobrarData()} />;
}
