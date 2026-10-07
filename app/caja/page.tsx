import { getCajaData } from "@/lib/caja";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CajaBoard from "./caja-board";

export const dynamic = "force-dynamic";

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ gasto?: string }> }) {
  const query = await searchParams;
  const data = await getCajaData();
  // Días con movimientos y sin cuadre guardado, por sucursal (aviso "Falta el cuadre").
  const faltantes: Record<string, string[]> = {};
  if (data.status === "ready") {
    const supabase = await createSupabaseServerClient();
    await Promise.all(data.branches.map(async (b) => {
      const { data: dias } = await supabase.rpc("cuadres_faltantes", { p_sucursal: b.id });
      if (Array.isArray(dias) && dias.length) faltantes[b.id] = dias as string[];
    }));
  }
  return <CajaBoard {...data} autoGasto={query.gasto === "1"} faltantes={faltantes} />;
}
