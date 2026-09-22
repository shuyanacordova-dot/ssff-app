import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";
import type { EmpresaConvenio, Garantia, Sale, SaleBranch, SaleCompany, SaleLabOrder, SaleProduct, SaleStock } from "@/lib/ventas";
import { getOperationalContext } from "@/lib/operational-context";
import { loadBranchIdentities } from "@/lib/sucursales";

export type PatientRecord = { id: string; nombres: string; apellidos: string; cedula: string | null; telefono: string | null; email: string | null; direccion: string | null; sexo: string | null; ocupacion: string | null; responsable_id: string | null; fecha_nacimiento: string | null; frecuencia_cobro: string | null; empresa_origen_id: string | null; actualizado_en: string };
export type Receta = { lagrimas_artificiales: boolean; lagrimas_productos: string[]; lagrimas_otro: string; lagrimas_frecuencia: string; vitaminas: boolean; vitaminas_productos: string[]; vitaminas_otro: string; vitaminas_frecuencia: string; terapia_visual: boolean; terapia_instrucciones: string };
export type Consultation = { id: string; paciente_id: string; empresa_atencion_id: string | null; sucursal_atencion_id: string | null; optometrista_id: string | null; optometrista_nombre: string | null; fecha_consulta: string; motivo_consulta: string | null; antecedentes: Record<string, string>; agudeza_visual: Record<string, string>; lensometria: Record<string, string>; queratometria: Record<string, string>; autorefractor: Record<string, string>; refraccion: Record<string, string>; examen_binocular: Record<string, string>; biomicroscopia: Record<string, string>; impresion_diagnostica: string | null; receta: Receta; plan_manejo: string | null; observaciones: string | null };
export type ClinicalPhoto = { id: string; paciente_id: string; consulta_id: string | null; tipo: "foto" | "documento"; descripcion: string | null; storage_path: string; creado_en: string; url: string | null };
export type PatientSale = Sale;
export type ClinicalProfile = { id: string; nombre: string; rol: string; empresa_id: string; sucursal_id: string };
export type ClinicalOptometrist = { id: string; nombre: string };
export type ClinicalData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: ClinicalProfile; patients: PatientRecord[]; consultations: Consultation[]; photos: ClinicalPhoto[]; sales: PatientSale[]; companies: SaleCompany[]; products: SaleProduct[]; stock: SaleStock[]; branches: SaleBranch[]; optometrists: ClinicalOptometrist[]; empresasConvenio: EmpresaConvenio[]; labOrders: SaleLabOrder[]; garantias: Garantia[] };

type UserProfile = { id: string; nombre: string; empresa_id: string; sucursal_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null };
const clinicalRoles = new Set(["superadmin", "admin_sucursal", "optometra"]);
const roleName = (profile: UserProfile | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
const empty = { patients: [], consultations: [], photos: [], sales: [], companies: [], products: [], stock: [], branches: [], optometrists: [], empresasConvenio: [], labOrders: [], garantias: [] };

export async function getClinicalData(): Promise<ClinicalData> {
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para abrir historias clínicas.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,nombre,empresa_id,sucursal_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as UserProfile | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !clinicalRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso clínico.", ...empty };

    const { data: patients, error: patientsError } = await supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,telefono,email,direccion,sexo,ocupacion,responsable_id,fecha_nacimiento,frecuencia_cobro,empresa_origen_id,actualizado_en").order("actualizado_en", { ascending: false }).limit(50);
    if (patientsError) return { status: "error", message: "No se pudieron leer las historias clínicas.", ...empty };
    const ids = (patients ?? []).map((patient) => patient.id);
    if (!ids.length) return { status: "ready", profile: { id: profile.id, nombre: profile.nombre, rol: role, empresa_id: profile.empresa_id, sucursal_id: profile.sucursal_id }, ...empty };

    const [consultationsResult, photosResult, salesResult, companiesResult, productsResult, branchesResult, teamResult, empresasConvenioResult, operationalContext] = await Promise.all([
      supabase.from("consultas_optometricas").select("id,paciente_id,empresa_atencion_id,sucursal_atencion_id,optometrista_id,fecha_consulta,motivo_consulta,antecedentes,agudeza_visual,lensometria,queratometria,autorefractor,refraccion,examen_binocular,biomicroscopia,impresion_diagnostica,receta,plan_manejo,observaciones").in("paciente_id", ids).order("fecha_consulta", { ascending: false }).limit(150),
      supabase.from("historia_fotos").select("id,paciente_id,consulta_id,tipo,descripcion,storage_path,creado_en").in("paciente_id", ids).order("creado_en", { ascending: false }).limit(150),
      supabase.from("ventas").select("id,empresa_id,sucursal_id,paciente_id,cliente_nombre,estado,subtotal,descuento,total,pagado,saldo,motivo_anulacion,recibo_token,fecha_entrega_estimada,creado_en,folio,venta_items(id,producto_id,descripcion,cantidad,precio_unitario,descuento,total_linea),pagos_venta(id,metodo,monto,referencia,banco,creado_en)").in("paciente_id", ids).order("creado_en", { ascending: false }).limit(150),
      supabase.from("empresas").select("id,nombre,direccion,telefono,email,logo_url").eq("activo", true).order("nombre"),
      supabase.from("productos_catalogo").select("id,empresa_id,nombre,categoria,precio_venta,controla_inventario").eq("activo", true).order("nombre").limit(200),
      loadBranchIdentities(supabase),
      supabase.from("usuarios").select("id,nombre,activo,roles(nombre)").eq("activo", true).order("nombre"),
      supabase.from("empresas_convenio").select("id,nombre").eq("activo", true).order("nombre"),
      getOperationalContext(),
    ]);
    if (consultationsResult.error || photosResult.error) return { status: "error", message: "No se pudieron leer los detalles clínicos.", ...empty };

    const photoRows = photosResult.data ?? [];
    const consultationRows = consultationsResult.data ?? [];
    const optometristaIds = Array.from(new Set(consultationRows.map((consultation) => consultation.optometrista_id).filter(Boolean))) as string[];
    const optometristasResult = optometristaIds.length
      ? hasSupabaseAdminConfiguration()
        ? await createSupabaseAdminClient().from("usuarios").select("id,nombre").in("id", optometristaIds)
        : await supabase.from("usuarios").select("id,nombre").in("id", optometristaIds)
      : { data: [] as { id: string; nombre: string }[], error: null };
    const optometristaNombre = new Map((optometristasResult.data ?? []).map((usuario) => [usuario.id, usuario.nombre]));
    const signed = photoRows.length ? await supabase.storage.from("historias").createSignedUrls(photoRows.map((photo) => photo.storage_path), 3600) : { data: [] };
    const urlByPath = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));

    const productIds = (productsResult.data ?? []).map((product) => product.id);
    const stockResult = productIds.length ? await supabase.from("inventario_stock").select("producto_id,sucursal_id,cantidad").in("producto_id", productIds) : { data: [], error: null };

    const saleIds = (salesResult.data ?? []).map((sale) => sale.id);
    const [labOrdersResult, garantiasResult] = saleIds.length ? await Promise.all([
      supabase.from("ordenes_laboratorio").select("id,venta_id,venta_item_id,estado,laboratorio,es_garantia").in("venta_id", saleIds),
      supabase.from("garantias").select("id,venta_id,venta_item_id,tipo,motivo,estado,orden_laboratorio_id,notas,creado_en").in("venta_id", saleIds).order("creado_en", { ascending: false }),
    ]) : [{ data: [], error: null }, { data: [], error: null }];

    return {
      status: "ready",
      profile: { id: profile.id, nombre: profile.nombre, rol: role, empresa_id: operationalContext?.activeCompany.id ?? profile.empresa_id, sucursal_id: operationalContext?.activeBranch.id ?? profile.sucursal_id },
      patients: patients ?? [],
      consultations: consultationRows.map((consultation) => ({ ...consultation, optometrista_nombre: consultation.optometrista_id ? optometristaNombre.get(consultation.optometrista_id) ?? null : null })) as unknown as Consultation[],
      photos: photoRows.map((photo) => ({ ...photo, url: urlByPath.get(photo.storage_path) ?? null })) as ClinicalPhoto[],
      sales: salesResult.error ? [] : ((salesResult.data ?? []) as unknown as PatientSale[]),
      companies: companiesResult.error ? [] : (companiesResult.data ?? []),
      products: productsResult.error ? [] : ((productsResult.data ?? []) as SaleProduct[]),
      stock: stockResult.error ? [] : (stockResult.data ?? []),
      branches: branchesResult.branches as SaleBranch[],
      optometrists: teamResult.error ? [] : (teamResult.data ?? []).filter((member) => roleName(member as unknown as UserProfile) === "optometra").map((member) => ({ id: member.id, nombre: member.nombre })),
      empresasConvenio: empresasConvenioResult.error ? [] : (empresasConvenioResult.data ?? []),
      labOrders: labOrdersResult.error ? [] : (labOrdersResult.data ?? []),
      garantias: garantiasResult.error ? [] : ((garantiasResult.data ?? []) as unknown as Garantia[]),
    };
  } catch { return { status: "error", message: "La conexión clínica no está disponible.", ...empty }; }
}
