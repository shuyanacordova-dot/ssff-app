"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const text = (form: FormData, name: string) => typeof form.get(name) === "string" ? String(form.get(name)).trim() : "";

export async function crearProductoInventario(form: FormData) {
  const supabase = await createSupabaseServerClient(); const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw } = await supabase.from("usuarios").select("empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as { empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  const role = Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
  if (!profile?.activo || !["superadmin", "admin_sucursal"].includes(role ?? "")) throw new Error("Solo administración puede crear productos.");
  const nombre = text(form, "nombre"); const categoria = text(form, "categoria") || "producto"; const codigo = text(form, "codigo");
  const clasificacion = text(form, "clasificacion"); const codigoBarra = text(form, "codigo_barra");
  const empresaId = text(form, "empresa_id") || profile.empresa_id; const proveedor = text(form, "proveedor");
  const precio = Number(text(form, "precio_venta")); const costoRaw = text(form, "costo_referencial"); const costo = costoRaw ? Number(costoRaw) : null;
  const controlaInventario = text(form, "controla_inventario") !== "no";
  if (!nombre || !Number.isFinite(precio) || precio < 0 || (costo !== null && (!Number.isFinite(costo) || costo < 0))) throw new Error("Completa nombre y precios válidos.");
  const { error } = await supabase.from("productos_catalogo").insert({ empresa_id: empresaId, nombre, categoria, clasificacion: clasificacion || null, codigo: codigo || null, codigo_barra: codigoBarra || null, precio_venta: precio, costo_referencial: costo, proveedor: proveedor || null, controla_inventario: controlaInventario });
  if (error) throw new Error(error.message.includes("productos_catalogo_empresa_id_codigo_key") ? "Ese código ya existe en esta empresa." : "No se pudo crear el producto.");
  revalidatePath("/inventario"); revalidatePath("/ventas");
}

export type ArmazonMasivo = { nombre: string; categoria: string; clasificacion: string; codigo: string; codigo_barra: string; proveedor: string; precio_venta: string; costo_referencial: string; cantidad_inicial: string };

export async function crearArmazonesMasivo(empresaId: string, sucursalId: string, items: ArmazonMasivo[]) {
  const supabase = await createSupabaseServerClient(); const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw } = await supabase.from("usuarios").select("empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as { empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  const role = Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;
  if (!profile?.activo || !["superadmin", "admin_sucursal"].includes(role ?? "")) throw new Error("Solo administración puede crear productos.");
  let creados = 0; const errores: string[] = [];
  for (const item of items) {
    const nombre = item.nombre.trim();
    if (!nombre) continue;
    const precio = Number(item.precio_venta);
    if (!Number.isFinite(precio) || precio < 0) { errores.push(`${nombre}: precio inválido`); continue; }
    const costo = item.costo_referencial.trim() ? Number(item.costo_referencial) : null;
    const { data: producto, error } = await supabase.from("productos_catalogo").insert({ empresa_id: empresaId, nombre, categoria: item.categoria || "montura", clasificacion: item.clasificacion.trim() || null, codigo: item.codigo.trim() || null, codigo_barra: item.codigo_barra.trim() || null, precio_venta: precio, costo_referencial: costo, proveedor: item.proveedor.trim() || null, controla_inventario: true }).select("id").single();
    if (error || !producto) { errores.push(`${nombre}: ${error?.message.includes("productos_catalogo_empresa_id_codigo_key") ? "código ya existe" : "no se pudo crear"}`); continue; }
    creados++;
    const cantidad = Number(item.cantidad_inicial);
    if (sucursalId && Number.isFinite(cantidad) && cantidad > 0) {
      const { error: movError } = await supabase.rpc("registrar_movimiento_inventario", { p_producto: producto.id, p_sucursal: sucursalId, p_tipo: "entrada", p_cantidad: cantidad, p_motivo: "Carga inicial - subida masiva" });
      if (movError) errores.push(`${nombre}: producto creado pero no se pudo cargar el stock inicial`);
    }
  }
  revalidatePath("/inventario"); revalidatePath("/ventas");
  return { creados, errores };
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
