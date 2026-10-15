"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Borra un abono (solo la Superadministradora; la base de datos lo vuelve a comprobar y deja la huella). */
export async function eliminarAbono(pagoId: string, motivo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(pagoId)) return { ok: false, error: "Abono inválido." };
  const texto = motivo.trim();
  if (texto.length < 3 || texto.length > 300) return { ok: false, error: "Escribe por qué se borra el abono (3 a 300 letras)." };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("eliminar_abono_venta", { p_pago: pagoId, p_motivo: texto });
    if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") || "No se pudo borrar el abono." };
    revalidatePath("/resumen-dia");
    revalidatePath("/caja");
    revalidatePath("/ventas");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo borrar el abono." };
  }
}
