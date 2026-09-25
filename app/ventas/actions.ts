"use server";
import { bancos } from "@/lib/bancos";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const text = (form: FormData, name: string) => typeof form.get(name) === "string" ? String(form.get(name)).trim() : "";
const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

export async function crearProducto(form: FormData) {
  const supabase = await createSupabaseServerClient(); const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw } = await supabase.from("usuarios").select("empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as { empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  const role = profile ? roleName(profile.roles) : undefined;
  if (!profile?.activo || !["superadmin", "admin_sucursal"].includes(role ?? "")) throw new Error("Solo administración puede crear productos.");
  const nombre = text(form, "nombre"); const categoria = text(form, "categoria") || "producto"; const codigo = text(form, "codigo"); const empresaId = text(form, "empresa_id") || profile.empresa_id; const precio = Number(text(form, "precio_venta")); const costoRaw = text(form, "costo_referencial"); const costo = costoRaw ? Number(costoRaw) : null;
  if (!nombre || !Number.isFinite(precio) || precio < 0 || (costo !== null && (!Number.isFinite(costo) || costo < 0))) throw new Error("Completa nombre y precios válidos.");
  const controlaInventario = !["servicio", "tratamiento"].includes(categoria);
  const { error } = await supabase.from("productos_catalogo").insert({ empresa_id: empresaId, nombre, categoria, codigo: codigo || null, precio_venta: precio, costo_referencial: costo, controla_inventario: controlaInventario });
  if (error) throw new Error(error.message.includes("productos_catalogo_empresa_id_codigo_key") ? "Ese código ya existe en esta empresa." : "No se pudo crear el producto.");
  revalidatePath("/ventas"); revalidatePath("/inventario");
}

export async function registrarVenta(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const empresaId = text(form, "empresa_id"); const sucursalId = text(form, "sucursal_id") || null; const cliente = text(form, "cliente_nombre"); const pacienteId = text(form, "paciente_id") || null;
  const tipoVenta = text(form, "tipo_venta");
  let ventaId: string;
  try {
    const items = JSON.parse(text(form, "items")); const payments = JSON.parse(text(form, "pagos") || "[]");
    if (!Array.isArray(items) || !items.length || !Array.isArray(payments)) throw new Error();
    const productIds = items.map((item: { producto_id?: string }) => item.producto_id).filter(Boolean);
    const { data: products, error: productsError } = await supabase.from("productos_catalogo").select("id,categoria,empresa_id").in("id", productIds);
    if (productsError || (products?.length ?? 0) !== productIds.length || products?.some((product) => product.empresa_id !== empresaId)) throw new Error("Uno de los productos no pertenece al catálogo seleccionado.");
    if (!new Set(["rapida", "lentes"]).has(tipoVenta)) throw new Error("Selecciona el tipo de venta.");
    const allowed = tipoVenta === "rapida" ? new Set(["accesorio", "gafas_sol", "servicio"]) : new Set(["montura", "lente"]);
    if (products?.some((product) => !allowed.has(product.categoria))) throw new Error(tipoVenta === "rapida" ? "La venta rápida solo admite accesorios, gafas de sol y exámenes." : "La venta de lentes solo admite armazones y lunas.");
    const { data, error } = await supabase.rpc("registrar_venta", { p_empresa: empresaId, p_sucursal: sucursalId, p_cliente: cliente, p_items: items, p_pagos: payments, p_paciente: pacienteId });
    if (error) throw new Error(error.message);
    ventaId = data as string;
  } catch (error) { throw new Error(error instanceof Error && error.message ? error.message : "No se pudo cerrar la venta."); }
  revalidatePath("/ventas"); revalidatePath("/pacientes");
  return ventaId;
}

export async function registrarAbono(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const ventaId = text(form, "venta_id"); const metodo = text(form, "metodo"); const monto = Number(text(form, "monto").replace(",", ".")); const referencia = text(form, "referencia"); const banco = text(form, "banco");
  if (!ventaId) throw new Error("Falta identificar la venta.");
  if (metodo === "transferencia" && !bancos.some((b) => b.value === banco)) throw new Error("Selecciona el banco de la transferencia.");
  if (!Number.isFinite(monto) || monto <= 0) throw new Error("Indica un monto válido para el abono.");
  const { error } = await supabase.rpc("registrar_abono_venta", { p_venta: ventaId, p_metodo: metodo, p_monto: monto, p_referencia: referencia || null, p_banco: banco || null });
  if (error) throw new Error(error.message || "No se pudo registrar el abono.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
}

export async function actualizarEntregaVenta(ventaId: string, fecha: string) {
  const supabase = await createSupabaseServerClient();
  if (!ventaId) throw new Error("Falta identificar la venta.");
  const { data, error } = await supabase.rpc("actualizar_entrega_venta", { p_venta: ventaId, p_fecha: fecha || null });
  if (error) throw new Error(error.message || "No se pudo generar el recibo.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
  return data as { recibo_token: string; fecha_entrega_estimada: string | null };
}

export async function anularVenta(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const ventaId = text(form, "venta_id"); const motivo = text(form, "motivo");
  if (!ventaId) throw new Error("Falta identificar la venta.");
  if (motivo.length < 5) throw new Error("Escribe el motivo de la anulación (mínimo 5 caracteres).");
  const { error } = await supabase.rpc("anular_venta", { p_venta: ventaId, p_motivo: motivo });
  if (error) throw new Error(error.message || "No se pudo anular la venta.");
  revalidatePath("/ventas"); revalidatePath("/pacientes");
}
