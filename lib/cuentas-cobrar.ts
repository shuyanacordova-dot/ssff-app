import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import { diasCalendarioGuayaquil } from "@/lib/record-date";

export type DeudaVenta = { id: string; total: number; pagado: number; saldo: number; creado_en: string; fecha_entrega_estimada: string | null; recibo_token: string; folio: number | null; apartado: boolean; apartado_hasta: string | null };
export type ConvenioDeuda = { empresa: string; cuotas: number; monto_cuota: number; fecha_primera_cuota: string | null };
export type CategoriaDeuda = "urgentes" | "recientes" | "mensuales" | "convenio" | "apartados";
export type DeudaPaciente = { paciente_id: string; nombres: string; apellidos: string; telefono: string | null; frecuencia_cobro: string | null; cobro_insistente: boolean; empresa_nombre: string; saldo_total: number; ventas: DeudaVenta[]; convenio: ConvenioDeuda | null; dias_mas_antigua: number; categoria: CategoriaDeuda; categoria_auto: CategoriaDeuda; categoria_manual: CategoriaDeuda | null };

export { DIAS_URGENTE } from "@/lib/cuentas-cobrar-config";
import { DIAS_URGENTE } from "@/lib/cuentas-cobrar-config";
export type EmpresaConvenio = { id: string; nombre: string };
export type LenteRezagado = { orden_id: string; paciente_id: string | null; paciente_nombre: string; telefono: string | null; sucursal_nombre: string; laboratorio: string; estado: string; listo_en: string; dias_listo: number; venta_id: string | null; folio: number | null; saldo: number };
export type CuentasCobrarProfile = { id: string; empresa_id: string; rol: string };
export type CuentasCobrarData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: CuentasCobrarProfile; empresaNombre?: string; deudas: DeudaPaciente[]; rezagados: LenteRezagado[]; empresasConvenio: EmpresaConvenio[]; makeConfigured: boolean };

const cobroRoles = new Set(["superadmin", "admin_sucursal", "vendedor", "caja", "optometra"]);
const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

export async function getCuentasCobrarData(): Promise<CuentasCobrarData> {
  const makeConfigured = Boolean(process.env.MAKE_COBROS_WEBHOOK_URL);
  const empty = { deudas: [], rezagados: [], empresasConvenio: [], makeConfigured };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para ver cuentas por cobrar.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile?.roles ?? null);
    if (profileError || !profile?.activo || !role || !cobroRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para ver cuentas por cobrar.", ...empty };

    const context = await getOperationalContext();
    const empresaActiva = context?.activeCompany.id ?? profile.empresa_id;
    const [ventasResult, empresasConvenioResult, rezagados] = await Promise.all([
      supabase.from("ventas").select("id,empresa_id,paciente_id,total,pagado,saldo,fecha_entrega_estimada,creado_en,recibo_token,folio,apartado,apartado_hasta,empresas(nombre)").eq("estado", "completada").eq("empresa_id", empresaActiva).gt("saldo", 0).not("paciente_id", "is", null).order("creado_en", { ascending: true }),
      supabase.from("empresas_convenio").select("id,nombre").eq("activo", true).order("nombre"),
      cargarRezagados(supabase, empresaActiva),
    ]);
    const { data: ventas, error: ventasError } = ventasResult;
    if (ventasError) return { status: "error", message: "No se pudieron cargar las cuentas por cobrar.", ...empty };
    const empresasConvenio = empresasConvenioResult.error ? [] : (empresasConvenioResult.data ?? []);

    const pacienteIds = Array.from(new Set((ventas ?? []).map((v) => v.paciente_id as string)));
    if (!pacienteIds.length) return { status: "ready", profile: { id: profile.id, empresa_id: empresaActiva, rol: role }, empresaNombre: context?.activeCompany.nombre, deudas: [], rezagados, empresasConvenio, makeConfigured };

    const { data: pacientes, error: pacientesError } = await supabase.from("pacientes_clinicos").select("id,nombres,apellidos,telefono,frecuencia_cobro,cobro_insistente,categoria_cobro").in("id", pacienteIds);
    if (pacientesError) return { status: "error", message: "No se pudieron cargar los pacientes con saldo pendiente.", ...empty };
    const pacienteById = new Map((pacientes ?? []).map((p) => [p.id, p]));
    const ventaIds = (ventas ?? []).map((v) => v.id);
    const { data: acuerdos } = ventaIds.length ? await supabase.from("acuerdos_pago").select("venta_id,cuotas,monto_cuota,fecha_primera_cuota,empresas_convenio(nombre)").in("venta_id", ventaIds) : { data: [] };
    const acuerdoByVenta = new Map((acuerdos ?? []).map((a) => {
      const emp = a.empresas_convenio as unknown as { nombre: string } | { nombre: string }[] | null;
      return [a.venta_id as string, { empresa: (Array.isArray(emp) ? emp[0]?.nombre : emp?.nombre) ?? "Convenio", cuotas: Number(a.cuotas), monto_cuota: Number(a.monto_cuota), fecha_primera_cuota: a.fecha_primera_cuota as string | null } satisfies ConvenioDeuda];
    }));

    const grupos = new Map<string, DeudaPaciente>();
    for (const venta of ventas ?? []) {
      const paciente = pacienteById.get(venta.paciente_id as string);
      if (!paciente) continue;
      const empresaNombre = (venta.empresas as unknown as { nombre: string } | { nombre: string }[] | null);
      const nombreEmpresa = Array.isArray(empresaNombre) ? empresaNombre[0]?.nombre : empresaNombre?.nombre;
      const key = paciente.id;
      const existente = grupos.get(key);
      const ventaResumen: DeudaVenta = { id: venta.id, total: Number(venta.total), pagado: Number(venta.pagado), saldo: Number(venta.saldo), creado_en: venta.creado_en, fecha_entrega_estimada: venta.fecha_entrega_estimada, recibo_token: venta.recibo_token, folio: venta.folio, apartado: Boolean(venta.apartado), apartado_hasta: (venta.apartado_hasta as string | null) ?? null };
      if (existente) { existente.saldo_total += Number(venta.saldo); existente.ventas.push(ventaResumen); }
      else grupos.set(key, { paciente_id: paciente.id, nombres: paciente.nombres, apellidos: paciente.apellidos, telefono: paciente.telefono, frecuencia_cobro: paciente.frecuencia_cobro, cobro_insistente: paciente.cobro_insistente ?? false, empresa_nombre: nombreEmpresa ?? "Empresa", saldo_total: Number(venta.saldo), ventas: [ventaResumen], convenio: null, dias_mas_antigua: 0, categoria: "recientes", categoria_auto: "recientes", categoria_manual: (paciente.categoria_cobro as CategoriaDeuda | null) ?? null });
      const grupo = grupos.get(key)!;
      const acuerdo = acuerdoByVenta.get(venta.id);
      if (acuerdo && !grupo.convenio) grupo.convenio = acuerdo;
    }

    const ahora = new Date();
    const deudas = Array.from(grupos.values()).map((d) => {
      const dias = Math.max(0, ...d.ventas.map((v) => diasCalendarioGuayaquil(v.creado_en, ahora)));
      const tieneApartado = d.ventas.some((v) => v.apartado);
      const categoria_auto: CategoriaDeuda = tieneApartado ? "apartados" : d.convenio ? "convenio" : d.frecuencia_cobro === "mensual" ? "mensuales" : dias > DIAS_URGENTE ? "urgentes" : "recientes";
      // Un apartado siempre va a su pestaña: el producto no se entrega hasta pagar todo.
      return { ...d, dias_mas_antigua: dias, categoria_auto, categoria: tieneApartado ? "apartados" : d.categoria_manual ?? categoria_auto };
    });
    return { status: "ready", profile: { id: profile.id, empresa_id: empresaActiva, rol: role }, empresaNombre: context?.activeCompany.nombre, deudas, rezagados, empresasConvenio, makeConfigured };
  } catch {
    return { status: "error", message: "La conexión de cuentas por cobrar no está disponible.", ...empty };
  }
}

// Lentes listos (o ya notificados) que el paciente no ha retirado. La pestaña muestra los de DIAS_REZAGO días o más.
async function cargarRezagados(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, empresaId: string): Promise<LenteRezagado[]> {
  const { data: ordenes, error } = await supabase.from("ordenes_laboratorio")
    .select("id,paciente_id,venta_id,sucursal_id,laboratorio,estado,listo_en,actualizado_en")
    .eq("empresa_id", empresaId).in("estado", ["listo_entrega", "notificado"]).order("listo_en", { ascending: true });
  if (error || !ordenes?.length) return [];
  const pacienteIds = Array.from(new Set(ordenes.map((o) => o.paciente_id).filter(Boolean))) as string[];
  const ventaIds = Array.from(new Set(ordenes.map((o) => o.venta_id).filter(Boolean))) as string[];
  const sucursalIds = Array.from(new Set(ordenes.map((o) => o.sucursal_id).filter(Boolean))) as string[];
  const [pacientes, ventas, sucursales] = await Promise.all([
    pacienteIds.length ? supabase.from("pacientes_clinicos").select("id,nombres,apellidos,telefono").in("id", pacienteIds) : Promise.resolve({ data: [] }),
    ventaIds.length ? supabase.from("ventas").select("id,folio,saldo,estado").in("id", ventaIds) : Promise.resolve({ data: [] }),
    sucursalIds.length ? supabase.from("sucursales").select("id,nombre").in("id", sucursalIds) : Promise.resolve({ data: [] }),
  ]);
  const pacienteById = new Map((pacientes.data ?? []).map((p) => [p.id as string, p]));
  const ventaById = new Map((ventas.data ?? []).map((v) => [v.id as string, v]));
  const sucursalById = new Map((sucursales.data ?? []).map((x) => [x.id as string, x.nombre as string]));
  const ahora = new Date();
  return ordenes.flatMap((o) => {
    const venta = o.venta_id ? ventaById.get(o.venta_id) : undefined;
    if (venta && venta.estado === "anulada") return [];
    const paciente = o.paciente_id ? pacienteById.get(o.paciente_id) : undefined;
    const listo = (o.listo_en ?? o.actualizado_en) as string;
    return [{
      orden_id: o.id, paciente_id: o.paciente_id, paciente_nombre: paciente ? `${paciente.nombres} ${paciente.apellidos}`.trim() : "Paciente",
      telefono: (paciente?.telefono as string | null) ?? null, sucursal_nombre: sucursalById.get(o.sucursal_id as string) ?? "Sucursal",
      laboratorio: o.laboratorio, estado: o.estado, listo_en: listo, dias_listo: diasCalendarioGuayaquil(listo, ahora),
      venta_id: o.venta_id, folio: (venta?.folio as number | null) ?? null, saldo: Number(venta?.saldo ?? 0),
    } satisfies LenteRezagado];
  });
}
