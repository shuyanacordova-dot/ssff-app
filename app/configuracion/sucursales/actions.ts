"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function guardarIdentidadSucursal(data: FormData) {
  const context = await getOperationalContext();
  if (!context || context.profile.rol !== "superadmin") throw new Error("No tienes permiso para configurar sucursales.");
  if (!context.brandingSchemaReady) throw new Error("La migración de identidad por sucursal todavía no ha sido autorizada.");
  const sucursalId = value(data, "sucursal_id");
  if (!context.branches.some((branch) => branch.id === sucursalId)) throw new Error("La sucursal no existe.");
  const color = value(data, "color_primario");
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("El color debe tener formato hexadecimal, por ejemplo #087F8C.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("sucursales").update({
    logo_url: value(data, "logo_url") || null,
    direccion: value(data, "direccion") || null,
    telefono: value(data, "telefono") || null,
    email: value(data, "email") || null,
    color_primario: color || null,
  }).eq("id", sucursalId);
  if (error) throw new Error("No se pudo guardar la identidad de la sucursal: " + error.message);
  revalidatePath("/");
  revalidatePath("/configuracion/sucursales");
  revalidatePath("/pacientes");
  revalidatePath("/ventas");
}
