"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const text = (form: FormData, name: string) => typeof form.get(name) === "string" ? String(form.get(name)).trim() : "";

async function requireInventarioAdmin() {
  const supabase = await createSupabaseServerClient(); const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw } = await supabase.from("usuarios").select("empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as { empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  const role = Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
  if (!profile?.activo || !["superadmin", "admin_sucursal"].includes(role ?? "")) throw new Error("Solo administración puede crear o editar productos.");
  return { supabase, profile };
}

const num = (form: FormData, name: string) => { const v = text(form, name); return v ? Number(v) : null; };

export async function crearProductoInventario(form: FormData) {
  const { supabase, profile } = await requireInventarioAdmin();
  const nombre = text(form, "nombre"); const categoria = text(form, "categoria") || "producto"; const codigo = text(form, "codigo");
  const clasificacion = text(form, "clasificacion"); const codigoBarra = text(form, "codigo_barra");
  const empresaId = text(form, "empresa_id") || profile.empresa_id; const proveedor = text(form, "proveedor");
  const precio = Number(text(form, "precio_venta")); const costoRaw = text(form, "costo_referencial"); const costo = costoRaw ? Number(costoRaw) : null;
  const controlaInventario = text(form, "controla_inventario") !== "no";
  const marca = text(form, "marca"); const modelo = text(form, "modelo"); const color = text(form, "color"); const material = text(form, "material");
  const consignacion = text(form, "consignacion") === "si";
  const precioVenta2 = num(form, "precio_venta_2"); const precioVenta3 = num(form, "precio_venta_3"); const medidaPuente = num(form, "medida_puente");
  const fechaCompra = text(form, "fecha_compra");
  if (!nombre || !Number.isFinite(precio) || precio < 0 || (costo !== null && (!Number.isFinite(costo) || costo < 0))) throw new Error("Completa nombre y precios válidos.");
  const { data: producto, error } = await supabase.from("productos_catalogo").insert({ empresa_id: empresaId, nombre, categoria, clasificacion: clasificacion || null, codigo: codigo || null, codigo_barra: codigoBarra || null, precio_venta: precio, costo_referencial: costo, proveedor: proveedor || null, controla_inventario: controlaInventario, marca: marca || null, modelo: modelo || null, color: color || null, material: material || null, consignacion, precio_venta_2: precioVenta2, precio_venta_3: precioVenta3, medida_puente: medidaPuente, fecha_compra: fechaCompra || null }).select("id").single();
  if (error || !producto) throw new Error(error?.message.includes("productos_catalogo_empresa_id_codigo_key") ? "Ese código ya existe en esta empresa." : "No se pudo crear el producto.");
  const sucursalId = text(form, "sucursal_id"); const cantidadInicial = Number(text(form, "cantidad_inicial"));
  if (sucursalId && controlaInventario && Number.isFinite(cantidadInicial) && cantidadInicial > 0) {
    const { error: movError } = await supabase.rpc("registrar_movimiento_inventario", { p_producto: producto.id, p_sucursal: sucursalId, p_tipo: "entrada", p_cantidad: cantidadInicial, p_motivo: "Carga inicial" });
    if (movError) throw new Error("El producto se creó, pero no se pudo cargar el stock inicial.");
  }
  revalidatePath("/inventario"); revalidatePath("/ventas");
}

export async function actualizarProductoInventario(form: FormData) {
  const { supabase } = await requireInventarioAdmin();
  const productoId = text(form, "producto_id");
  if (!productoId) throw new Error("Falta identificar el producto.");
  const nombre = text(form, "nombre"); const categoria = text(form, "categoria") || "producto"; const codigo = text(form, "codigo");
  const clasificacion = text(form, "clasificacion"); const codigoBarra = text(form, "codigo_barra"); const proveedor = text(form, "proveedor");
  const precio = Number(text(form, "precio_venta")); const costoRaw = text(form, "costo_referencial"); const costo = costoRaw ? Number(costoRaw) : null;
  const controlaInventario = text(form, "controla_inventario") !== "no";
  const marca = text(form, "marca"); const modelo = text(form, "modelo"); const color = text(form, "color"); const material = text(form, "material");
  const consignacion = text(form, "consignacion") === "si";
  const precioVenta2 = num(form, "precio_venta_2"); const precioVenta3 = num(form, "precio_venta_3"); const medidaPuente = num(form, "medida_puente");
  const fechaCompra = text(form, "fecha_compra");
  if (!nombre || !Number.isFinite(precio) || precio < 0 || (costo !== null && (!Number.isFinite(costo) || costo < 0))) throw new Error("Completa nombre y precios válidos.");
  const { error } = await supabase.from("productos_catalogo").update({ nombre, categoria, clasificacion: clasificacion || null, codigo: codigo || null, codigo_barra: codigoBarra || null, precio_venta: precio, costo_referencial: costo, proveedor: proveedor || null, controla_inventario: controlaInventario, marca: marca || null, modelo: modelo || null, color: color || null, material: material || null, consignacion, precio_venta_2: precioVenta2, precio_venta_3: precioVenta3, medida_puente: medidaPuente, fecha_compra: fechaCompra || null }).eq("id", productoId);
  if (error) throw new Error(error.message.includes("productos_catalogo_empresa_id_codigo_key") ? "Ese código ya existe en esta empresa." : "No se pudo actualizar el producto.");
  revalidatePath("/inventario"); revalidatePath("/ventas");
}

export type ArmazonMasivo = { nombre: string; marca: string; modelo: string; color: string; material: string; categoria: string; clasificacion: string; proveedor: string; codigo: string; codigo_barra: string; medida_puente: string; precio_venta: string; precio_venta_2: string; precio_venta_3: string; costo_referencial: string; cantidad_inicial: string };

const numero = (v: string) => { const t = String(v ?? "").trim().replace(/\$/g, "").replace(",", "."); return t ? Number(t) : null; };

// Subida masiva (formulario o Excel/Numbers). El armazón se crea en la empresa de la sucursal elegida.
// Administración puede cargar en su empresa; si tiene acceso extra (inventario_acceso_extra), también en la otra.
export async function crearArmazonesMasivo(sucursalId: string, items: ArmazonMasivo[]) {
  const supabase = await createSupabaseServerClient(); const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw } = await supabase.from("usuarios").select("id,empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as { id: string; empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  const role = Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
  if (!profile?.activo || !["superadmin", "admin_sucursal"].includes(role ?? "")) throw new Error("Solo administración puede crear productos.");
  if (!sucursalId) throw new Error("Elige la sucursal donde entran los armazones.");
  const admin = createSupabaseAdminClient();
  const { data: sucursal } = await admin.from("sucursales").select("id,empresa_id").eq("id", sucursalId).maybeSingle();
  if (!sucursal) throw new Error("Sucursal no encontrada.");
  const empresaId = sucursal.empresa_id as string;
  let permitido = role === "superadmin" || empresaId === profile.empresa_id;
  if (!permitido) {
    const { data: extra } = await supabase.from("inventario_acceso_extra").select("empresa_id").eq("empresa_id", empresaId).maybeSingle();
    permitido = !!extra;
  }
  if (!permitido) throw new Error("No tienes permiso para ingresar armazones en esa sucursal.");
  let creados = 0; const errores: string[] = [];
  for (const item of items) {
    const nombre = String(item.nombre ?? "").trim();
    if (!nombre) continue;
    const precio = numero(item.precio_venta);
    if (precio === null || !Number.isFinite(precio) || precio < 0) { errores.push(`${nombre}: precio de venta inválido`); continue; }
    const costo = numero(item.costo_referencial); const p2 = numero(item.precio_venta_2); const p3 = numero(item.precio_venta_3); const puente = numero(item.medida_puente);
    const categoria = /sol/i.test(item.categoria ?? "") ? "gafas_sol" : "montura";
    const t = (v: string) => String(v ?? "").trim() || null;
    const { data: producto, error } = await admin.from("productos_catalogo").insert({ empresa_id: empresaId, nombre, categoria, marca: t(item.marca), modelo: t(item.modelo), color: t(item.color), material: t(item.material), clasificacion: t(item.clasificacion), codigo: t(item.codigo), codigo_barra: t(item.codigo_barra), proveedor: t(item.proveedor), precio_venta: precio, precio_venta_2: p2, precio_venta_3: p3, costo_referencial: costo, medida_puente: puente, controla_inventario: true }).select("id").single();
    if (error || !producto) { errores.push(`${nombre}: ${error?.message.includes("productos_catalogo_empresa_id_codigo_key") ? "código ya existe" : "no se pudo crear"}`); continue; }
    creados++;
    const cantidad = numero(item.cantidad_inicial);
    if (cantidad !== null && Number.isFinite(cantidad) && cantidad > 0) {
      const { error: movError } = await admin.from("movimientos_inventario").insert({ producto_id: producto.id, sucursal_id: sucursalId, tipo: "entrada", cantidad, motivo: "Carga inicial - subida masiva", created_by: profile.id });
      if (movError) errores.push(`${nombre}: armazón creado pero no se pudo cargar el stock`);
    }
  }
  revalidatePath("/inventario"); revalidatePath("/ventas");
  return { creados, errores };
}

// Sucursales donde el usuario puede ingresar armazones (su empresa + acceso extra). Para la subida masiva.
export async function sucursalesParaIngreso(): Promise<{ id: string; nombre: string; empresa_id: string }[]> {
  const supabase = await createSupabaseServerClient(); const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data: raw } = await supabase.from("usuarios").select("empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as { empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  const role = Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
  if (!profile?.activo || !["superadmin", "admin_sucursal"].includes(role ?? "")) return [];
  const { data: extras } = await supabase.from("inventario_acceso_extra").select("empresa_id");
  const empresas = new Set([profile.empresa_id, ...((extras ?? []) as { empresa_id: string }[]).map((e) => e.empresa_id)]);
  const { data } = await createSupabaseAdminClient().from("sucursales").select("id,nombre,empresa_id").eq("activo", true).order("nombre");
  return ((data ?? []) as { id: string; nombre: string; empresa_id: string }[]).filter((s) => role === "superadmin" || empresas.has(s.empresa_id));
}

export async function crearMovimientoInventario(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const productoId = text(form, "producto_id"); const sucursalId = text(form, "sucursal_id"); const tipo = text(form, "tipo");
  const cantidad = Number(text(form, "cantidad")); const motivo = text(form, "motivo");
  if (!productoId || !sucursalId || !tipo) throw new Error("Elige producto, sucursal y tipo de movimiento.");
  if (!Number.isFinite(cantidad) || cantidad === 0) throw new Error("Indica una cantidad válida.");
  const { error } = await supabase.rpc("registrar_movimiento_inventario", { p_producto: productoId, p_sucursal: sucursalId, p_tipo: tipo, p_cantidad: cantidad, p_motivo: motivo || null });
  if (error) throw new Error(error.message || "No se pudo registrar el movimiento.");
  revalidatePath("/inventario");
}

export async function transferirInventario(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const productoId = text(form, "producto_id"); const origen = text(form, "sucursal_origen"); const destino = text(form, "sucursal_destino");
  const cantidad = Number(text(form, "cantidad")); const motivo = text(form, "motivo");
  if (!productoId || !origen || !destino) throw new Error("Elige producto, sucursal de origen y destino.");
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error("Indica una cantidad válida.");
  const { error } = await supabase.rpc("transferir_inventario", { p_producto: productoId, p_sucursal_origen: origen, p_sucursal_destino: destino, p_cantidad: cantidad, p_motivo: motivo || null });
  if (error) throw new Error(error.message || "No se pudo registrar la transferencia.");
  revalidatePath("/inventario");
}

export async function actualizarStockMinimo(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const productoId = text(form, "producto_id"); const sucursalId = text(form, "sucursal_id"); const stockMinimo = Number(text(form, "stock_minimo"));
  if (!productoId || !sucursalId) throw new Error("Falta identificar el producto y la sucursal.");
  if (!Number.isFinite(stockMinimo) || stockMinimo < 0) throw new Error("Indica un mínimo válido.");
  const { error } = await supabase.rpc("actualizar_stock_minimo", { p_producto: productoId, p_sucursal: sucursalId, p_minimo: stockMinimo });
  if (error) throw new Error(error.message || "No se pudo actualizar el mínimo de stock.");
  revalidatePath("/inventario");
}
