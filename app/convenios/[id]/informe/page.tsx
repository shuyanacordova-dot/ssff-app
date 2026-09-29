import { getOperationalContext } from "@/lib/operational-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import InformeConvenio, { type InformeData } from "./informe-convenio";

export const dynamic = "force-dynamic";

export default async function InformeConvenioPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string; optica?: string }>;
}) {
  const [{ id }, filtros] = await Promise.all([params, searchParams]);
  const context = await getOperationalContext();
  if (!context) return <InformeConvenio status="needs_login" convenioId={id} />;
  const supabase = await createSupabaseServerClient();
  if (!["superadmin", "admin_sucursal"].includes(context.profile.rol)) {
    // Permiso por persona (ej. Yuli entrega los informes a las empresas).
    const { data: permitido } = await supabase.rpc("tiene_permiso", { p_recurso: "informes_convenio", p_accion: "leer" });
    if (!permitido) return <InformeConvenio status="forbidden" convenioId={id} />;
  }

  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const mes = filtros.mes && /^\d{4}-\d{2}$/.test(filtros.mes)
    && Number(filtros.mes.slice(0, 4)) > 0
    && Number(filtros.mes.slice(5)) >= 1 && Number(filtros.mes.slice(5)) <= 12
    ? filtros.mes : hoy.slice(0, 7);
  const opticas = (context.profile.rol === "superadmin" ? context.companies : [context.activeCompany])
    .map(({ id, nombre }) => ({ id, nombre }));
  const optica = opticas.find(({ id }) => id === filtros.optica)?.id ?? context.activeCompany.id;
  const { data, error } = await supabase.rpc("informe_convenio_mensual", {
    p_convenio: id, p_optica: optica, p_mes: `${mes}-01`,
  });
  if (error) return <InformeConvenio status="error" message={error.message} convenioId={id} />;
  if (!data) return <InformeConvenio status="error" message="No se pudo cargar el informe." convenioId={id} />;
  return <InformeConvenio key={`${id}:${mes}:${optica}`} status="ready" data={data as InformeData}
    mes={mes} opticaId={optica} opticas={opticas} convenioId={id} />;
}
