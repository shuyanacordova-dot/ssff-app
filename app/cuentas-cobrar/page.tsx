import { getCuentasCobrarData } from "@/lib/cuentas-cobrar";
import CuentasCobrarBoard from "./cuentas-cobrar-board";

export const dynamic = "force-dynamic";

export default async function CuentasCobrarPage({ searchParams }: { searchParams: Promise<{ convenio?: string }> }) {
  const { convenio } = await searchParams;
  return <CuentasCobrarBoard key={convenio ?? "todas"} {...await getCuentasCobrarData(convenio)} />;
}
