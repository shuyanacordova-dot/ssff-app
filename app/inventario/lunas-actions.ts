"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LunaStockMatch = {
  id: string; origen: "bodega" | "garantia"; tipo: string; material: string | null; indice: number | null; tratamiento: string | null;
  esfera: number; cilindro: number; eje: number | null; adicion: number | null; tallada: boolean; cantidad: number; sucursal: string; notas: string | null;
};

const num = (value: FormDataEntryValue | null) => { const text = String(value ?? "").trim().replace(",", "."); if (!text) return null; const n = Number(text); return Number.isFinite(n) ? n : null; };
const str = (value: FormDataEntryValue | null) => String(value ?? "").trim();

export async function buscarLunasStock(empresaId: string, esfera: number, cilindro: number, eje: number | null, adicion: number | null): Promise<LunaStockMatch[]> {
  if (!empresaId || !Number.isFinite(esfera)) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("buscar_lunas_stock", { p_empresa: empresaId, p_esfera: esfera, p_cilindro: cilindro || 0, p_eje: eje, p_adicion: adicion });
  if (error) return [];
  return (data ?? []) as LunaStockMatch[];
}

export async function usarLunaStock(lunaId: string, ordenId: string | null, nota: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("usar_luna_stock", { p_luna: lunaId, p_orden: ordenId, p_nota: nota || null });
  if (error) throw new Error(error.message || "No se pudo usar la luna.");
  revalidatePath("/inventario/lunas");
  return data as number;
}

export async function guardarLunaStock(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const esfera = num(form.get("esfera"));
  if (esfera === null) throw new Error("Ingresa la esfera.");
  const { error } = await supabase.rpc("guardar_luna_stock", {
    p_id: str(form.get("id")) || null,
    p_empresa: str(form.get("empresa_id")),
    p_sucursal: str(form.get("sucursal_id")),
    p_origen: str(form.get("origen")) || "bodega",
    p_tipo: str(form.get("tipo")) || "monofocal",
    p_material: str(form.get("material")) || null,
    p_indice: num(form.get("indice")),
    p_tratamiento: str(form.get("tratamiento")) || null,
    p_esfera: esfera,
    p_cilindro: num(form.get("cilindro")) ?? 0,
    p_eje: num(form.get("eje")),
    p_adicion: num(form.get("adicion")),
    p_diametro: num(form.get("diametro")),
    p_tallada: form.get("tallada") === "on",
    p_cantidad: num(form.get("cantidad")) ?? 1,
    p_notas: str(form.get("notas")) || null,
  });
  if (error) throw new Error(error.message || "No se pudo guardar la luna.");
  revalidatePath("/inventario/lunas");
}
