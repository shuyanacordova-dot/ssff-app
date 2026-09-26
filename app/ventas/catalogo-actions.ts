"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { SaleProduct, SaleStock } from "@/lib/ventas";

// Catálogo y stock para vender: se piden solo al abrir una venta, orden de laboratorio o garantía
// (antes se descargaban completos en cada carga de Ventas y de la carpeta del paciente).
export async function obtenerCatalogoVenta(): Promise<{ products: SaleProduct[]; stock: SaleStock[]; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { products: [], stock: [], error: "Inicia sesión para ver los productos." };
  const [products, stock] = await Promise.all([
    fetchAll<SaleProduct>((from, to) => supabase.from("productos_catalogo").select("id,empresa_id,nombre,categoria,precio_venta,precio_venta_2,precio_venta_3,controla_inventario,codigo,codigo_barra,marca,modelo,color").eq("activo", true).order("nombre").order("id").range(from, to)),
    fetchAll<SaleStock>((from, to) => supabase.from("inventario_stock").select("producto_id,sucursal_id,cantidad").order("id").range(from, to)),
  ]);
  if (products.error || stock.error) return { products: [], stock: [], error: "No se pudieron cargar los productos." };
  return { products: products.data, stock: stock.data };
}
