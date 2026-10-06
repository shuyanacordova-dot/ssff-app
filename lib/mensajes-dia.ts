import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import { getCuentasCobrarData, type CobroHoy } from "@/lib/cuentas-cobrar";
import type { ConfigMensajesAutomaticos, MensajesDia, NumeroSucursal } from "@/lib/mensajes-dia-textos";

export type MensajesDiaData = {
  status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error";
  message?: string;
  esSuperadmin?: boolean;
  empresaId?: string;
  empresaNombre?: string;
  sucursalId?: string;
  sucursalNombre?: string;
  dia?: MensajesDia;
  colaHoy: CobroHoy[];
  colaHoyError?: string;
  config?: ConfigMensajesAutomaticos;
  numeros: NumeroSucursal[];
  whatsappConectado: boolean;
};

const roles = new Set(["superadmin", "admin_sucursal", "optometra", "vendedor", "caja"]);

export async function getMensajesDiaData(): Promise<MensajesDiaData> {
  const whatsappConectado = Boolean(process.env.WHATSAPP_TOKEN);
  const empty = { colaHoy: [], numeros: [], whatsappConectado };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura.", ...empty };
  try {
    const context = await getOperationalContext();
    if (!context) return { status: "needs_login", message: "Inicia sesión para ver los mensajes del día.", ...empty };
    if (!roles.has(context.profile.rol)) return { status: "forbidden", message: "Tu perfil no tiene acceso a los mensajes del día.", ...empty };
    const supabase = await createSupabaseServerClient();
    const sucursalesEmpresa = context.branches.filter((b) => b.empresa_id === context.activeCompany.id);
    const [diaResult, configResult, cobros, numerosResult] = await Promise.all([
      supabase.rpc("mensajes_del_dia", { p_sucursal: context.activeBranch.id }),
      supabase.from("mensajes_automaticos_config").select("activo,cumpleanos,control_anual,cobros,actualizado_en").eq("empresa_id", context.activeCompany.id).maybeSingle(),
      getCuentasCobrarData(),
      supabase.from("mensajes_numeros_sucursal").select("sucursal_id,whatsapp_phone_id,numero").in("sucursal_id", sucursalesEmpresa.map((b) => b.id)),
    ]);
    const numerosRows = (numerosResult.data ?? []) as { sucursal_id: string; whatsapp_phone_id: string | null; numero: string | null }[];
    const numeros: NumeroSucursal[] = sucursalesEmpresa.map((b) => { const row = numerosRows.find((n) => n.sucursal_id === b.id); return { sucursal_id: b.id, nombre: b.nombre, numero: row?.numero ?? null, conectado: !!row?.whatsapp_phone_id }; });
    if (diaResult.error) return { status: "error", message: diaResult.error.message || "No se pudieron cargar los mensajes del día.", ...empty };
    return {
      status: "ready",
      esSuperadmin: context.profile.rol === "superadmin",
      empresaId: context.activeCompany.id,
      empresaNombre: context.activeCompany.nombre,
      sucursalId: context.activeBranch.id,
      sucursalNombre: context.activeBranch.nombre,
      dia: diaResult.data as MensajesDia,
      colaHoy: cobros.colaHoy,
      colaHoyError: cobros.status === "ready" ? cobros.colaHoyError : cobros.message,
      config: (configResult.data as ConfigMensajesAutomaticos | null) ?? { activo: false, cumpleanos: true, control_anual: true, cobros: true, actualizado_en: null },
      numeros,
      whatsappConectado,
    };
  } catch {
    return { status: "error", message: "No se pudieron cargar los mensajes del día.", ...empty };
  }
}
