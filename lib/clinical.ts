import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import type { EmpresaConvenio, SaleBranch, SaleCompany, SaleProduct, SaleStock } from "@/lib/ventas";

export type PatientRecord = { id: string; nombres: string; apellidos: string; cedula: string | null; telefono: string | null; ocupacion: string | null; responsable_id: string | null; fecha_nacimiento: string | null; frecuencia_cobro: string | null; actualizado_en: string };
export type Receta = { lagrimas_artificiales: boolean; lagrimas_productos: string[]; lagrimas_otro: string; lagrimas_frecuencia: string; vitaminas: boolean; vitaminas_productos: string[]; vitaminas_otro: string; vitaminas_frecuencia: string; terapia_visual: boolean; terapia_instrucciones: string };
export type Consultation = { id: string; paciente_id: string; fecha_consulta: string; motivo_consulta: string | null; antecedentes: Record<string, string>; agudeza_visual: Record<string, string>; lensometria: Record<string, string>; queratometria: Record<string, string>; autorefractor: Record<string, string>; refraccion: Record<string, string>; examen_binocular: Record<string, string>; biomicroscopia: Record<string, string>; impresion_diagnostica: string | null; receta: Receta; plan_manejo: string | null; observaciones: string | null };
export type ClinicalPhoto = { id: string; paciente_id: string; consulta_id: string | null; tipo: "foto" | "documento"; descripcion: string | null; storage_path: string; creado_en: string; url: string | null };
export type PatientSaleItem = { descripcion: string; cantidad: number };
export type PatientSale = { id: string; paciente_id: string; empresa_id: string; estado: string; total: number; pagado: number; saldo: number; creado_en: string; venta_items: PatientSaleItem[] };
export type ClinicalProfile = { id: string; nombre: string; rol: string };
export type ClinicalData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: ClinicalProfile; patients: PatientRecord[]; consultations: Consultation[]; photos: ClinicalPhoto[]; sales: PatientSale[]; companies: SaleCompany[]; products: SaleProduct[]; stock: SaleStock[]; branches: SaleBranch[]; empresasConvenio: EmpresaConvenio[] };

type UserProfile = { id: string; nombre: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null };
const clinicalRoles = new Set(["superadmin", "admin_sucursal", "optometra"]);
const roleName = (profile: UserProfile | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
const empty = { patients: [], consultations: [], photos: [], sales: [], companies: [], products: [], stock: [], branches: [], empresasConvenio: [] };

export async function getClinicalData(): Promise<ClinicalData> {
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para abrir historias clínicas.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,nombre,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as UserProfile | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !clinicalRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso clínico.", ...empty };

    const { data: patients, error: patientsError } = await supabase.from("pacientes_clinicos").select("id,nombres,apellidos,cedula,telefono,ocupacion,responsable_id,fecha_nacimiento,frecuencia_cobro,actualizado_en").order("actualizado_en", { ascending: false }).limit(50);
    if (patientsError) return { status: "error", message: "No se pudieron leer las historias clínicas.", ...empty };
    const ids = (patients ?? []).map((patient) => patient.id);
    if (!ids.length) return { status: "ready", profile: { id: profile.id, nombre: profile.nombre, rol: role }, ...empty };

    const [consultationsResult, photosResult, salesResult, companiesResult, productsResult, branchesResult, empresasConvenioResult] = await Promise.all([
      supabase.from("consultas_optometricas").select("id,paciente_id,fecha_consulta,motivo_consulta,antecedentes,agudeza_visual,lensometria,queratometria,autorefractor,refraccion,examen_binocular,biomicroscopia,impresion_diagnostica,receta,plan_manejo,observaciones").in("paciente_id", ids).order("fecha_consulta", { ascending: false }).limit(150),
      supabase.from("historia_fotos").select("id,paciente_id,consulta_id,tipo,descripcion,storage_path,creado_en").in("paciente_id", ids).order("creado_en", { ascending: false }).limit(150),
      supabase.from("ventas").select("id,paciente_id,empresa_id,estado,total,pagado,saldo,creado_en,venta_items(descripcion,cantidad)").in("paciente_id", ids).order("creado_en", { ascending: false }).limit(150),
      supabase.from("empresas").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("productos_catalogo").select("id,empresa_id,nombre,categoria,precio_venta,controla_inventario").eq("activo", true).order("nombre").limit(200),
      supabase.from("sucursales").select("id,empresa_id,nombre").eq("activo", true).order("nombre"),
      supabase.from("empresas_convenio").select("id,nombre").eq("activo", true).order("nombre"),
    ]);
    if (consultationsResult.error || photosResult.error) return { status: "error", message: "No se pudieron leer los detalles clínicos.", ...empty };

    const photoRows = photosResult.data ?? [];
    const signed = photoRows.length ? await supabase.storage.from("historias").createSignedUrls(photoRows.map((photo) => photo.storage_path), 3600) : { data: [] };
    const urlByPath = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));

    const productIds = (productsResult.data ?? []).map((product) => product.id);
    const stockResult = productIds.length ? await supabase.from("inventario_stock").select("producto_id,sucursal_id,cantidad").in("producto_id", productIds) : { data: [], error: null };

    return {
      status: "ready",
      profile: { id: profile.id, nombre: profile.nombre, rol: role },
      patients: patients ?? [],
      consultations: (consultationsResult.data ?? []) as unknown as Consultation[],
      photos: photoRows.map((photo) => ({ ...photo, url: urlByPath.get(photo.storage_path) ?? null })) as ClinicalPhoto[],
      sales: salesResult.error ? [] : ((salesResult.data ?? []) as unknown as PatientSale[]),
      companies: companiesResult.error ? [] : (companiesResult.data ?? []),
      products: productsResult.error ? [] : ((productsResult.data ?? []) as SaleProduct[]),
      stock: stockResult.error ? [] : (stockResult.data ?? []),
      branches: branchesResult.error ? [] : ((branchesResult.data ?? []) as SaleBranch[]),
      empresasConvenio: empresasConvenioResult.error ? [] : (empresasConvenioResult.data ?? []),
    };
  } catch { return { status: "error", message: "La conexión clínica no está disponible.", ...empty }; }
}
