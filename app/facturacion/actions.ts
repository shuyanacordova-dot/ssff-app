"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

export async function crearBorradorFactura(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Necesitas iniciar sesión.");
  const { data: raw } = await supabase.from("usuarios").select("id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
  const profile = raw as unknown as { id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
  if (!profile?.activo || !new Set(["superadmin", "admin_sucursal", "caja"]).has(roleName(profile.roles) ?? "")) throw new Error("No tienes permiso para preparar facturas.");
  const ventaId = value(form, "venta_id"); const identificacion = value(form, "cliente_identificacion"); const email = value(form, "cliente_email"); const direccion = value(form, "cliente_direccion");
  if (!ventaId || !identificacion) throw new Error("Indica la venta y la identificación del cliente.");
  const { data: sale, error: saleError } = await supabase.from("ventas").select("id,empresa_id,sucursal_id,paciente_id,cliente_nombre,estado,subtotal,descuento,total,venta_items(id,producto_id,descripcion,cantidad,precio_unitario,descuento,total_linea),pacientes_clinicos(nombres,apellidos)").eq("id", ventaId).single();
  if (saleError || !sale || sale.estado !== "completada") throw new Error("La venta no está disponible para facturación.");
  const patient = Array.isArray(sale.pacientes_clinicos) ? sale.pacientes_clinicos[0] : sale.pacientes_clinicos;
  const patientName = patient ? `${patient.nombres} ${patient.apellidos}`.trim() : sale.cliente_nombre;
  const items = (sale.venta_items ?? []).map((item) => ({ producto_id: item.producto_id, descripcion: item.descripcion, cantidad: Number(item.cantidad), precio_unitario: Number(item.precio_unitario), descuento: Number(item.descuento), total_linea: Number(item.total_linea) }));
  if (!items.length) throw new Error("La venta no tiene productos para facturar.");
  const { error } = await supabase.from("facturas_borrador").insert({ venta_id: sale.id, empresa_id: sale.empresa_id, sucursal_id: sale.sucursal_id, cliente_nombre: patientName || "Consumidor final", cliente_identificacion: identificacion, cliente_email: email || null, cliente_direccion: direccion || null, subtotal: Number(sale.subtotal), descuento: Number(sale.descuento), iva: 0, total: Number(sale.total), items, estado: "borrador", notas: "Borrador interno. Impuestos y datos tributarios pendientes de validación antes de emisión SRI.", created_by: profile.id });
  if (error) {
    if (error.message.includes("facturas_borrador")) throw new Error("Falta aplicar la migración local de facturación.");
    if (error.message.includes("facturas_borrador_venta_unica")) throw new Error("Esta venta ya tiene un borrador activo.");
    throw new Error("No se pudo crear el borrador.");
  }
  revalidatePath("/facturacion");
}
