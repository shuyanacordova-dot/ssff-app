"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import { enviarPlantillaAMeta, sincronizarPlantillas } from "@/lib/plantillas-meta";
import { tiposPlantilla, validarPlantilla, type TipoPlantilla } from "@/lib/plantillas-mensajes";

async function soloSuperadmin() {
  const context = await getOperationalContext();
  if (!context || context.profile.rol !== "superadmin") throw new Error("Solo la superadministradora puede cambiar las plantillas.");
  return { context, supabase: await createSupabaseServerClient() };
}

export async function actualizarPlantillasDesdeMeta() {
  const { supabase } = await soloSuperadmin();
  await sincronizarPlantillas(supabase);
  revalidatePath("/mensajes");
}

// Crea una versión nueva del mensaje y la envía a Meta para aprobación. La activa sigue funcionando mientras tanto.
export async function crearPlantilla(input: { empresaId: string; tipo: TipoPlantilla; texto: string; categoria: "MARKETING" | "UTILITY" }) {
  const { context, supabase } = await soloSuperadmin();
  if (!tiposPlantilla.some((t) => t.tipo === input.tipo)) throw new Error("Tipo de mensaje no válido.");
  const error = validarPlantilla(input.texto, input.tipo);
  if (error) throw new Error(error);
  const sello = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(/\D/g, "");
  const nombre_meta = `lumos_${input.tipo}_${input.empresaId === "51820b6b-9fc1-495c-b2ea-ab50547e2ce3" ? "shuvision" : "focus"}_${sello}`;
  const enviado = await enviarPlantillaAMeta({ nombre_meta, categoria: input.categoria, texto: input.texto });
  const { error: insertError } = await supabase.from("plantillas_mensajes").insert({
    empresa_id: input.empresaId, tipo: input.tipo, nombre_meta, categoria: enviado.categoria === "UTILITY" ? "UTILITY" : input.categoria,
    texto: input.texto.trim(), variables: enviado.variables, estado: enviado.estado, meta_id: enviado.meta_id, creado_por: context.profile.id,
  });
  if (insertError) throw new Error(`Meta recibió la plantilla, pero no se pudo guardar en LumOS: ${insertError.message}`);
  revalidatePath("/mensajes");
}

// Elige cuál plantilla aprobada se usa para ese tipo de mensaje.
export async function activarPlantilla(id: string) {
  const { supabase } = await soloSuperadmin();
  const { data: fila, error } = await supabase.from("plantillas_mensajes").select("id,empresa_id,tipo,estado").eq("id", id).single();
  if (error || !fila) throw new Error("No se encontró la plantilla.");
  if (fila.estado !== "APPROVED") throw new Error("Solo se puede usar una plantilla aprobada por Meta.");
  await supabase.from("plantillas_mensajes").update({ activa: false }).eq("empresa_id", fila.empresa_id).eq("tipo", fila.tipo).eq("activa", true);
  const { error: updateError } = await supabase.from("plantillas_mensajes").update({ activa: true }).eq("id", id);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/mensajes");
}
