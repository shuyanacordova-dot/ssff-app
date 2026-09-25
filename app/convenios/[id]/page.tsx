import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import PersonasBoard, { type PersonaConvenio } from "./personas-board";

export const dynamic = "force-dynamic";

const roles = new Set(["superadmin", "admin_sucursal", "optometra", "vendedor"]);

export default async function PersonasConvenioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vacio = { personas: [], branches: [], empresaNombre: "", mensaje: null, empresaConvenioId: id, opticaNombre: "" };
  if (!hasSupabaseConfiguration()) return <PersonasBoard status="error" message="Falta configurar la conexión." {...vacio} />;
  const context = await getOperationalContext();
  if (!context) return <PersonasBoard status="needs_login" message="Inicia sesión." {...vacio} />;
  if (!roles.has(context.profile.rol)) return <PersonasBoard status="forbidden" message="Tu perfil no tiene acceso a convenios." {...vacio} />;
  const supabase = await createSupabaseServerClient();
  const [{ data: empresa }, { data: personas, error }] = await Promise.all([
    supabase.from("empresas_convenio").select("id,nombre,mensaje_invitacion").eq("id", id).maybeSingle(),
    supabase.from("convenio_personas").select("id,nombres,apellidos,cedula,telefono,email,cargo,sucursal_id,estado,paciente_id,notas,ultimo_contacto").eq("empresa_convenio_id", id).order("apellidos").order("nombres"),
  ]);
  if (!empresa) return <PersonasBoard status="error" message="No se encontró el convenio." {...vacio} />;
  const branches = context.accessibleBranches.map((b) => ({ id: b.id, nombre: b.nombre }));
  return <PersonasBoard status={error ? "error" : "ready"} message={error?.message} personas={(personas ?? []) as PersonaConvenio[]} branches={branches}
    empresaNombre={empresa.nombre} mensaje={empresa.mensaje_invitacion} empresaConvenioId={id} opticaNombre={context.activeCompany.nombre} />;
}
