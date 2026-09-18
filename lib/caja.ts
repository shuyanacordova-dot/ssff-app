import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

export type Banco = "pichincha" | "guayaquil" | "internacional";
export type CuentaBancaria = { id: string; empresa_id: string; banco: Banco; saldo_actual: number };
export type Gasto = { id: string; empresa_id: string; sucursal_id: string | null; fecha: string; clasificacion: string; concepto: string; monto: number; origen: "caja" | "banco"; cuenta_bancaria_id: string | null; observaciones: string | null; creado_en: string };
export type MovimientoBancario = { id: string; cuenta_id: string; fecha: string; tipo: string; monto: number; observaciones: string | null; creado_en: string };
export type CierreCaja = { id: string; empresa_id: string; sucursal_id: string; fecha: string; responsable_id: string; caja_anterior: number; caja_fisica: number; ventas_brutas: number; cobro_efectivo: number; cobro_tarjeta: number; cobro_transferencia_pichincha: number; cobro_transferencia_guayaquil: number; cobro_transferencia_internacional: number; cobro_credito: number; cobro_otro: number; egresos_efectivo: number; egresos_banco: number; deposito_pichincha: number; deposito_guayaquil: number; deposito_internacional: number; depositos: number; caja_esperada: number; diferencia: number; check_cobros_ventas: boolean | null; check_caja_fisica: boolean; cuadre_correcto: boolean; observaciones: string | null; creado_en: string };
export type CajaCompany = { id: string; nombre: string };
export type CajaBranch = { id: string; empresa_id: string; nombre: string };
export type CajaProfile = { id: string; empresa_id: string; sucursal_id: string | null; rol: string };
export type CajaData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: CajaProfile; companies: CajaCompany[]; branches: CajaBranch[]; cuentas: CuentaBancaria[]; movimientos: MovimientoBancario[]; gastos: Gasto[]; cierres: CierreCaja[] };

const cajaRoles = new Set(["superadmin", "admin_sucursal", "vendedor", "caja"]);
const roleName = (profile: { roles: { nombre: string } | { nombre: string }[] | null } | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
const empty = { companies: [], branches: [], cuentas: [], movimientos: [], gastos: [], cierres: [] };

export async function getCajaData(): Promise<CajaData> {
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para abrir caja.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,empresa_id,sucursal_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; empresa_id: string; sucursal_id: string | null; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !cajaRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para caja.", ...empty };

    const [companiesResult, branchesResult, cuentasResult, gastosResult, cierresResult] = await Promise.all([
      supabase.from("empresas").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("sucursales").select("id,empresa_id,nombre").eq("activo", true).order("nombre"),
      supabase.from("cuentas_bancarias").select("id,empresa_id,banco,saldo_actual").eq("activo", true).order("banco"),
      supabase.from("gastos").select("id,empresa_id,sucursal_id,fecha,clasificacion,concepto,monto,origen,cuenta_bancaria_id,observaciones,creado_en").order("fecha", { ascending: false }).limit(100),
      supabase.from("cierres_caja").select("id,empresa_id,sucursal_id,fecha,responsable_id,caja_anterior,caja_fisica,ventas_brutas,cobro_efectivo,cobro_tarjeta,cobro_transferencia_pichincha,cobro_transferencia_guayaquil,cobro_transferencia_internacional,cobro_credito,cobro_otro,egresos_efectivo,egresos_banco,deposito_pichincha,deposito_guayaquil,deposito_internacional,depositos,caja_esperada,diferencia,check_cobros_ventas,check_caja_fisica,cuadre_correcto,observaciones,creado_en").order("fecha", { ascending: false }).limit(60),
    ]);
    if (companiesResult.error || branchesResult.error || cuentasResult.error || gastosResult.error || cierresResult.error) return { status: "error", message: "No se pudo cargar caja. Revisa la conexión y los permisos.", ...empty };

    const cuentaIds = (cuentasResult.data ?? []).map((cuenta) => cuenta.id);
    const movimientosResult = cuentaIds.length ? await supabase.from("movimientos_bancarios").select("id,cuenta_id,fecha,tipo,monto,observaciones,creado_en").in("cuenta_id", cuentaIds).order("fecha", { ascending: false }).limit(150) : { data: [], error: null };
    if (movimientosResult.error) return { status: "error", message: "No se pudieron leer los movimientos bancarios.", ...empty };

    return {
      status: "ready",
      profile: { id: profile.id, empresa_id: profile.empresa_id, sucursal_id: profile.sucursal_id, rol: role },
      companies: companiesResult.data ?? [],
      branches: branchesResult.data ?? [],
      cuentas: (cuentasResult.data ?? []) as CuentaBancaria[],
      movimientos: movimientosResult.data ?? [],
      gastos: (gastosResult.data ?? []) as Gasto[],
      cierres: (cierresResult.data ?? []) as CierreCaja[],
    };
  } catch { return { status: "error", message: "La conexión de caja no está disponible.", ...empty }; }
}
