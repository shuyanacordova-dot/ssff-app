import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

export type VentaResumen = { id: string; creado_en: string; subtotal: number; descuento: number; total: number; paciente_nombre: string | null; cliente_nombre: string | null; autor_nombre: string | null };
export type AbonoResumen = { id: string; monto: number; metodo: string; creado_en: string; venta_id: string; venta_saldo: number; venta_fecha?: string; paciente_nombre: string | null; cliente_nombre: string | null; autor_nombre: string | null };
export type SalidaResumen = { id: string; clasificacion: string; concepto: string; monto: number; observaciones: string | null; autor_nombre: string | null };
export type ResumenCompany = { id: string; nombre: string };
export type ResumenDiaData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: { id: string; empresa_id: string; rol: string }; companies: ResumenCompany[]; ventas: VentaResumen[]; abonos: AbonoResumen[]; salidas: SalidaResumen[] };

const roles = new Set(["superadmin", "admin_sucursal", "vendedor", "caja"]);
const roleName = (profile: { roles: { nombre: string } | { nombre: string }[] | null } | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
const empty = { companies: [], ventas: [], abonos: [], salidas: [] };

function rangoGuayaquil(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  const inicio = `${fecha}T00:00:00-05:00`;
  const siguiente = new Date(Date.UTC(y, m - 1, d + 1));
  const fin = `${siguiente.toISOString().slice(0, 10)}T00:00:00-05:00`;
  return { inicio, fin };
}

export async function getResumenDiaData(fecha: string, empresaIdParam?: string): Promise<ResumenDiaData> {
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para ver el resumen del día.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !roles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para ver el resumen del día.", ...empty };

    const { data: companies, error: companiesError } = await supabase.from("empresas").select("id,nombre").eq("activo", true).order("nombre");
    if (companiesError) return { status: "error", message: "No se pudieron cargar las empresas.", ...empty };
    const empresa = empresaIdParam || profile.empresa_id || companies?.[0]?.id || "";
    if (!empresa) return { status: "ready", profile: { id: profile.id, empresa_id: profile.empresa_id, rol: role }, ...empty, companies: companies ?? [] };

    const { inicio, fin } = rangoGuayaquil(fecha);

    const [ventasResult, gastosResult] = await Promise.all([
      supabase.from("ventas").select("id,creado_en,subtotal,descuento,total,saldo,cliente_nombre,paciente_id,created_by,estado").eq("empresa_id", empresa).gte("creado_en", inicio).lt("creado_en", fin).order("creado_en", { ascending: true }),
      supabase.from("gastos").select("id,clasificacion,concepto,monto,observaciones,created_by").eq("empresa_id", empresa).eq("fecha", fecha).eq("origen", "caja").order("clasificacion"),
    ]);
    if (ventasResult.error || gastosResult.error) return { status: "error", message: "No se pudo cargar el resumen del día.", ...empty };

    const pagosResult = await supabase.from("pagos_venta")
      .select("id,venta_id,metodo,monto,creado_en,recibido_por,ventas!inner(id,creado_en,saldo,cliente_nombre,paciente_id,estado,anulacion_modo)")
      .eq("ventas.empresa_id", empresa).neq("metodo", "saldo_favor")
      .gte("creado_en", inicio).lt("creado_en", fin).order("creado_en", { ascending: true });
    if (pagosResult.error) return { status: "error", message: "No se pudieron cargar los abonos del día.", ...empty };
    // El dinero de una venta anulada con devolución o saldo a favor sí entró ese día; las anulaciones antiguas
    // (duplicados) no cuentan. El saldo a favor usado no es dinero nuevo (se excluye arriba).
    const ventaDePago = (p: { ventas: unknown }) => (Array.isArray(p.ventas) ? p.ventas[0] : p.ventas) as { estado: string; anulacion_modo: string | null } | undefined;
    if (pagosResult.data) pagosResult.data = pagosResult.data.filter((p) => { const v = ventaDePago(p); return !!v && (v.estado !== "anulada" || !!v.anulacion_modo); });

    const ventasPagadas = (pagosResult.data ?? []).flatMap((p) => p.ventas);
    const pacienteIds = Array.from(new Set([...(ventasResult.data ?? []), ...ventasPagadas].map((v) => v.paciente_id).filter(Boolean))) as string[];
    const userIds = Array.from(new Set([
      ...(ventasResult.data ?? []).map((v) => v.created_by),
      ...(pagosResult.data ?? []).map((p) => p.recibido_por),
      ...(gastosResult.data ?? []).map((g) => g.created_by),
    ].filter(Boolean))) as string[];

    const [pacientesResult, usuariosResult] = await Promise.all([
      pacienteIds.length ? supabase.from("pacientes_clinicos").select("id,nombres,apellidos").in("id", pacienteIds) : Promise.resolve({ data: [] as { id: string; nombres: string; apellidos: string }[] }),
      userIds.length ? supabase.from("usuarios").select("id,nombre").in("id", userIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    ]);
    const pacienteNombre = new Map((pacientesResult.data ?? []).map((p) => [p.id, `${p.nombres} ${p.apellidos}`]));
    const usuarioNombre = new Map((usuariosResult.data ?? []).map((u) => [u.id, u.nombre]));
    const ventaById = new Map(ventasPagadas.map((v) => [v.id, v]));

    const ventas: VentaResumen[] = (ventasResult.data ?? []).filter((v) => v.estado !== "anulada").map((v) => ({
      id: v.id, creado_en: v.creado_en, subtotal: Number(v.subtotal), descuento: Number(v.descuento), total: Number(v.total),
      paciente_nombre: v.paciente_id ? pacienteNombre.get(v.paciente_id) ?? null : null, cliente_nombre: v.cliente_nombre,
      autor_nombre: v.created_by ? usuarioNombre.get(v.created_by) ?? null : null,
    }));

    const abonos: AbonoResumen[] = (pagosResult.data ?? []).map((p) => {
      const venta = ventaById.get(p.venta_id);
      return {
        id: p.id, monto: Number(p.monto), metodo: p.metodo, creado_en: p.creado_en, venta_id: p.venta_id,
        venta_saldo: venta ? Number(venta.saldo) : 0,
        venta_fecha: venta?.creado_en,
        paciente_nombre: venta?.paciente_id ? pacienteNombre.get(venta.paciente_id) ?? null : null,
        cliente_nombre: venta?.cliente_nombre ?? null,
        autor_nombre: p.recibido_por ? usuarioNombre.get(p.recibido_por) ?? null : null,
      };
    });

    const salidas: SalidaResumen[] = (gastosResult.data ?? []).map((g) => ({
      id: g.id, clasificacion: g.clasificacion, concepto: g.concepto, monto: Number(g.monto), observaciones: g.observaciones,
      autor_nombre: g.created_by ? usuarioNombre.get(g.created_by) ?? null : null,
    }));

    return { status: "ready", profile: { id: profile.id, empresa_id: profile.empresa_id, rol: role }, companies: companies ?? [], ventas, abonos, salidas };
  } catch { return { status: "error", message: "El resumen del día no está disponible.", ...empty }; }
}
