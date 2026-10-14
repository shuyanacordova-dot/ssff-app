import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import type { ProgramaReferidos } from "@/lib/referidos-textos";

export type ReferidosConfigData = {
  status: "ready" | "needs_login" | "forbidden" | "error";
  message?: string;
  programas: (ProgramaReferidos & { empresa_nombre: string })[];
  historial: { id: string; programa_id: string; evento: string; detalle: Record<string, unknown>; creado_en: string }[];
};

export async function getReferidosConfig(): Promise<ReferidosConfigData> {
  const empty = { programas: [], historial: [] };
  if (!hasSupabaseConfiguration()) return { status: "error", message: "Falta configurar la conexión segura.", ...empty };
  try {
    const context = await getOperationalContext();
    if (!context) return { status: "needs_login", message: "Inicia sesión para ver los referidos.", ...empty };
    if (context.profile.rol !== "superadmin") return { status: "forbidden", message: "Solo la Superadministradora configura los referidos.", ...empty };
    const supabase = await createSupabaseServerClient();
    const [programas, historial] = await Promise.all([
      supabase.from("programas_referidos").select("*, empresas(nombre)").order("nombre"),
      supabase.from("referidos_auditoria").select("id,programa_id,evento,detalle,creado_en").eq("evento", "config").order("creado_en", { ascending: false }).limit(30),
    ]);
    if (programas.error) return { status: "error", message: "No se pudo cargar la configuración de referidos.", ...empty };
    const filas = (programas.data ?? []).map((row) => {
      const { empresas, ...resto } = row as unknown as ProgramaReferidos & { empresas: { nombre: string } | { nombre: string }[] | null };
      const empresa = Array.isArray(empresas) ? empresas[0] : empresas;
      return { ...resto, empresa_nombre: empresa?.nombre ?? "" };
    });
    return { status: "ready", programas: filas, historial: (historial.data ?? []) as ReferidosConfigData["historial"] };
  } catch {
    return { status: "error", message: "No se pudo cargar la configuración de referidos.", ...empty };
  }
}
