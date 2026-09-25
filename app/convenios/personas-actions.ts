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

// Crea (o reutiliza, si la cédula ya existe) la carpeta del paciente con los datos de la persona del convenio.
export async function crearCarpetaDesdePersona(personaId: string, empresaConvenioId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data: persona, error } = await supabase.from("convenio_personas")
    .select("id,nombres,apellidos,cedula,telefono,email,cargo,paciente_id,empresas_convenio(nombre)").eq("id", personaId).maybeSingle();
  if (error || !persona) throw new Error("No se encontró la persona.");
  if (persona.paciente_id) return persona.paciente_id as string;
  const partes = String(persona.nombres).split(/\s+/);
  const apellidos = (persona.apellidos as string | null)?.trim() || (partes.length > 1 ? partes.slice(-1).join(" ") : "");
  const nombres = persona.apellidos ? String(persona.nombres) : (partes.length > 1 ? partes.slice(0, -1).join(" ") : String(persona.nombres));
  if (!apellidos) throw new Error("Agrega el apellido de la persona antes de crear su carpeta.");
  const digitos = String(persona.telefono ?? "").replace(/\D/g, "");
  const local = digitos.startsWith("593") ? digitos.slice(3) : digitos.startsWith("0") ? digitos.slice(1) : digitos;
  const emp = persona.empresas_convenio as unknown as { nombre: string } | { nombre: string }[] | null;
  const convenio = (Array.isArray(emp) ? emp[0]?.nombre : emp?.nombre) ?? "";
  const ocupacion = [persona.cargo, convenio && `Convenio ${convenio}`].filter(Boolean).join(" · ") || null;
  const { data: result, error: rpcError } = await supabase.rpc("registrar_paciente_clinico", {
    p_nombres: nombres, p_apellidos: apellidos, p_cedula: persona.cedula || null, p_telefono: local ? `+593 ${local}` : null,
    p_email: persona.email || null, p_direccion: null, p_fecha_nacimiento: null, p_sexo: null, p_ocupacion: ocupacion, p_responsable_id: null,
  });
  if (rpcError) throw new Error(rpcError.message || "No se pudo crear la carpeta.");
  const pacienteId = (result as { paciente_id: string }).paciente_id;
  const { error: linkError } = await supabase.from("convenio_personas").update({ paciente_id: pacienteId }).eq("id", personaId);
  if (linkError) throw new Error("La carpeta se creó, pero no se pudo enlazar con la persona del convenio.");
  revalidatePath(`/convenios/${empresaConvenioId}`); revalidatePath("/pacientes");
  return pacienteId;
}
