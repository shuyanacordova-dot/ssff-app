import { NextResponse } from "next/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";
import { enviarPlantillaWhatsapp } from "@/lib/whatsapp-cloud";
import type { MensajesDia } from "@/lib/mensajes-dia-textos";

// Envío automático diario (Vercel Cron, 16:00 UTC = 11:00 Ecuador). Reemplaza los escenarios de Make.
// Solo envía si la empresa tiene "Mensajes automáticos" activado, la sucursal tiene número oficial y existe WHATSAPP_TOKEN.
// Controles automáticos: solo los anuales (la plantilla aprobada en Meta habla de "un año"); los de 3 y 6 meses van con un toque.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Config = { empresa_id: string; activo: boolean; cumpleanos: boolean; control_anual: boolean; max_controles_dia: number; actualizado_por: string | null };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!hasSupabaseAdminConfiguration() || !process.env.WHATSAPP_TOKEN) return NextResponse.json({ ok: true, omitido: "Falta configuración (Supabase o WhatsApp)." });

  const supabase = createSupabaseAdminClient();
  const { data: configs, error } = await supabase.from("mensajes_automaticos_config").select("empresa_id,activo,cumpleanos,control_anual,max_controles_dia,actualizado_por").eq("activo", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resumen: Record<string, { enviados: number; errores: number }> = {};
  for (const config of (configs ?? []) as Config[]) {
    if (!config.actualizado_por) continue;
    const { data: sucursales } = await supabase.from("sucursales").select("id,nombre").eq("empresa_id", config.empresa_id);
    for (const sucursal of sucursales ?? []) {
      // Cada sucursal envía desde su propio número; si aún no está conectado, se envía a mano.
      const { data: numero } = await supabase.from("mensajes_numeros_sucursal").select("whatsapp_phone_id").eq("sucursal_id", sucursal.id).maybeSingle();
      const phoneId = numero?.whatsapp_phone_id as string | null | undefined;
      if (!phoneId) continue;
      const { data, error: diaError } = await supabase.rpc("mensajes_del_dia_sistema", { p_sucursal: sucursal.id });
      if (diaError || !data) continue;
      const dia = data as MensajesDia;
      const cola: { paciente_id: string; nombre: string; telefono: string | null; tipo: "cumpleanos" | "control"; referencia: string | null }[] = [];
      if (config.cumpleanos) for (const c of dia.cumpleanos) if (!c.enviado_en && !c.enviado_auto && c.telefono) cola.push({ paciente_id: c.paciente_id, nombre: c.nombres || c.nombre, telefono: c.telefono, tipo: "cumpleanos", referencia: null });
      if (config.control_anual) dia.controles.filter((c) => !c.enviado_en && !c.enviado_auto && !c.make_ya_envio && c.meses >= 10 && c.telefono).slice(0, config.max_controles_dia)
        .forEach((c) => cola.push({ paciente_id: c.paciente_id, nombre: c.nombres || c.nombre, telefono: c.telefono, tipo: "control", referencia: c.consulta_id }));
      const r = resumen[sucursal.nombre] ??= { enviados: 0, errores: 0 };
      for (const item of cola) {
        const envio = await enviarPlantillaWhatsapp({ phoneId, telefono: item.telefono, tipo: item.tipo, nombre: item.nombre });
        await supabase.from("mensajes_automaticos_envios").insert({ empresa_id: config.empresa_id, sucursal_id: sucursal.id, paciente_id: item.paciente_id, tipo: item.tipo, telefono: item.telefono, estado: envio.ok ? "enviado" : "error", error: envio.ok ? null : envio.error, wa_message_id: envio.ok ? envio.id : null });
        if (envio.ok) {
          r.enviados++;
          await supabase.from("crm_contactos").insert({ paciente_id: item.paciente_id, empresa_id: config.empresa_id, sucursal_id: sucursal.id, motivo: item.tipo, canal: "whatsapp", resultado: "enviado", nota: item.tipo === "cumpleanos" ? "Cumpleaños · envío automático" : "Control anual · envío automático", referencia_id: item.referencia, created_by: config.actualizado_por });
        } else r.errores++;
      }
    }
  }
  return NextResponse.json({ ok: true, resumen });
}
