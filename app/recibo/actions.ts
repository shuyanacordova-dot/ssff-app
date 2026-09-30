"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// El paciente responde desde su recibo virtual (sin iniciar sesión; el token del recibo lo identifica).
export async function responderPreferenciasRecibo(token: string, datos: boolean, promociones: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: "Enlace no válido." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("responder_preferencias_recibo", { p_token: token, p_datos: datos, p_promociones: promociones });
  return error ? { ok: false, error: "No se pudo guardar. Intenta de nuevo o avísanos por WhatsApp." } : { ok: true, error: null };
}
