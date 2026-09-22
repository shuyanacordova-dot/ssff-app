import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

export type DeudaVenta = { id: string; total: number; pagado: number; saldo: number; creado_en: string; fecha_entrega_estimada: string | null; recibo_token: string; folio: number | null };
export type DeudaPaciente = { paciente_id: string; nombres: string; apellidos: string; telefono: string | null; frecuencia_cobro: string | null; cobro_insistente: boolean; empresa_nombre: string; saldo_total: number; ventas: DeudaVenta[] };
export type EmpresaConvenio = { id: string; nombre: string };
export type CuentasCobrarProfile = { id: string; empresa_id: string; rol: string };
export type CuentasCobrarData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: CuentasCobrarProfile; deudas: DeudaPaciente[]; empresasConvenio: EmpresaConvenio[]; makeConfigured: boolean };

const cobroRoles = new Set(["superadmin", "admin_sucursal", "vendedor", "caja", "optometra"]);
const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

export async function getCuentasCobrarData(): Promise<CuentasCobrarData> {
  const makeConfigured = Boolean(process.env.MAKE_COBROS_WEBHOOK_URL);
  const empty = { deudas: [], empresasConvenio: [], makeConfigured };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para ver cuentas por cobrar.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile?.roles ?? null);
    if (profileError || !profile?.activo || !role || !cobroRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para ver cuentas por cobrar.", ...empty };

    const [ventasResult, empresasConvenioResult] = await Promise.all([
      supabase.from("ventas").select("id,empresa_id,paciente_id,total,pagado,saldo,fecha_entrega_estimada,creado_en,recibo_token,folio,empresas(nombre)").eq("estado", "completada").gt("saldo", 0).not("paciente_id", "is", null).order("creado_en", { ascending: true }),
      supabase.from("empresas_convenio").select("id,nombre").eq("activo", true).order("nombre"),
    ]);
    const { data: ventas, error: ventasError } = ventasResult;
    if (ventasError) return { status: "error", message: "No se pudieron cargar las cuentas por cobrar.", ...empty };
    const empresasConvenio = empresasConvenioResult.error ? [] : (empresasConvenioResult.data ?? []);

    const pacienteIds = Array.from(new Set((ventas ?? []).map((v) => v.paciente_id as string)));
    if (!pacienteIds.length) return { status: "ready", profile: { id: profile.id, empresa_id: profile.empresa_id, rol: role }, deudas: [], empresasConvenio, makeConfigured };

    const { data: pacientes, error: pacientesError } = await supabase.from("pacientes_clinicos").select("id,nombres,apellidos,telefono,frecuencia_cobro,cobro_insistente").in("id", pacienteIds);
    if (pacientesError) return { status: "error", message: "No se pudieron cargar los pacientes con saldo pendiente.", ...empty };
    const pacienteById = new Map((pacientes ?? []).map((p) => [p.id, p]));

    const grupos = new Map<string, DeudaPaciente>();
    for (const venta of ventas ?? []) {
      const paciente = pacienteById.get(venta.paciente_id as string);
      if (!paciente) continue;
      const empresaNombre = (venta.empresas as unknown as { nombre: string } | { nombre: string }[] | null);
      const nombreEmpresa = Array.isArray(empresaNombre) ? empresaNombre[0]?.nombre : empresaNombre?.nombre;
      const key = paciente.id;
      const existente = grupos.get(key);
      const ventaResumen: DeudaVenta = { id: venta.id, total: Number(venta.total), pagado: Number(venta.pagado), saldo: Number(venta.saldo), creado_en: venta.creado_en, fecha_entrega_estimada: venta.fecha_entrega_estimada, recibo_token: venta.recibo_token, folio: venta.folio };
      if (existente) { existente.saldo_total += Number(venta.saldo); existente.ventas.push(ventaResumen); }
      else grupos.set(key, { paciente_id: paciente.id, nombres: paciente.nombres, apellidos: paciente.apellidos, telefono: paciente.telefono, frecuencia_cobro: paciente.frecuencia_cobro, cobro_insistente: paciente.cobro_insistente ?? false, empresa_nombre: nombreEmpresa ?? "Empresa", saldo_total: Number(venta.saldo), ventas: [ventaResumen] });
    }

    return { status: "ready", profile: { id: profile.id, empresa_id: profile.empresa_id, rol: role }, deudas: Array.from(grupos.values()).sort((a, b) => b.saldo_total - a.saldo_total), empresasConvenio, makeConfigured };
  } catch {
    return { status: "error", message: "La conexión de cuentas por cobrar no está disponible.", ...empty };
  }
}
