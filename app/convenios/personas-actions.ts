"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const estados = new Set(["nuevo", "contactado", "interesado", "agendo", "cliente", "no_interesado"]);

export async function agregarPersonaConvenio(form: FormData) {
  const empresaConvenioId = str(form, "empresa_convenio_id");
  const nombres = str(form, "nombres");
  if (!empresaConvenioId || !nombres) throw new Error("Ingresa al menos el nombre.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("convenio_personas").insert({
    empresa_convenio_id: empresaConvenioId, nombres, apellidos: str(form, "apellidos") || null, cedula: str(form, "cedula") || null,
    telefono: str(form, "telefono") || null, email: str(form, "email") || null, cargo: str(form, "cargo") || null,
    sucursal_id: str(form, "sucursal_id") || null, notas: str(form, "notas") || null,
  });
  if (error) throw new Error(error.message.includes("convenio_personas_cedula_uidx") ? "Esa cédula ya está en la lista de este convenio." : "No se pudo agregar la persona.");
  revalidatePath(`/convenios/${empresaConvenioId}`);
}

export async function actualizarEstadoPersona(personaId: string, empresaConvenioId: string, estado: string, contactado: boolean) {
  if (!estados.has(estado)) throw new Error("Estado no válido.");
  const supabase = await createSupabaseServerClient();
  const cambios: Record<string, unknown> = { estado };
  if (contactado) cambios.ultimo_contacto = new Date().toISOString();
  const { error } = await supabase.from("convenio_personas").update(cambios).eq("id", personaId);
  if (error) throw new Error("No se pudo actualizar el estado.");
  revalidatePath(`/convenios/${empresaConvenioId}`);
}

export async function guardarMensajeInvitacion(empresaConvenioId: string, mensaje: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("empresas_convenio").update({ mensaje_invitacion: mensaje.trim() || null }).eq("id", empresaConvenioId);
  if (error) throw new Error("No se pudo guardar el mensaje.");
  revalidatePath(`/convenios/${empresaConvenioId}`);
}
