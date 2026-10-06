import { NextResponse } from "next/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";
import { enviarPlantillaWhatsapp } from "@/lib/whatsapp-cloud";
import { nombreOpticaLargo, plantillaMeta, primerNombre, type MensajesDia, type TipoPlantilla } from "@/lib/mensajes-dia-textos";

// Envío automático diario (Vercel Cron, 16:00 UTC = 11:00 Ecuador). Reemplaza los escenarios de Make.
// Envía si la empresa tiene "Mensajes automáticos" activado, la sucursal tiene número oficial y existe WHATSAPP_TOKEN:
// cumpleaños, controles (anuales, aniversarios de revisiones importadas y de 3/6 meses) y cobros de pacientes con
// "Envío automático" activado en Cuentas por cobrar, según su frecuencia.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Config = { empresa_id: string; activo: boolean; cumpleanos: boolean; control_anual: boolean; cobros: boolean; max_controles_dia: number; actualizado_por: string | null };
type Cobro = { paciente_id: string; nombres: string; telefono: string | null; empresa_id: string; saldo: number; dias_deuda: number; cobro_insistente: boolean; frecuencia: string | null; apartado: boolean; fecha_cobro_acordada: string | null };
type Envio = { paciente_id: string; telefono: string | null; tipo: "cumpleanos" | "control" | "cobro"; plantilla: TipoPlantilla; parametros: string[]; referencia: string | null; saldo?: number };

const fechaEc = (ymd?: string | null) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit", year: "numeric" }).format(ymd ? new Date(`${ymd}T12:00:00-05:00`) : new Date());

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!hasSupabaseAdminConfiguration() || !process.env.WHATSAPP_TOKEN) return NextResponse.json({ ok: true, omitido: "Falta configuración (Supabase o WhatsApp)." });

  const supabase = createSupabaseAdminClient();
  const { data: configs, error } = await supabase.from("mensajes_automaticos_config").select("empresa_id,activo,cumpleanos,control_anual,cobros,max_controles_dia,actualizado_por").eq("activo", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resumen: Record<string, { enviados: number; errores: number }> = {};
  for (const config of (configs ?? []) as Config[]) {
    if (!config.actualizado_por) continue;
    const optica = nombreOpticaLargo(config.empresa_id);
    const { data: sucursales } = await supabase.from("sucursales").select("id,nombre").eq("empresa_id", config.empresa_id);
    for (const sucursal of sucursales ?? []) {
      // Cada sucursal envía desde su propio número; si aún no está conectado en Meta, se envía a mano.
      const { data: numero } = await supabase.from("mensajes_numeros_sucursal").select("whatsapp_phone_id").eq("sucursal_id", sucursal.id).maybeSingle();
      const phoneId = numero?.whatsapp_phone_id as string | null | undefined;
      if (!phoneId) continue;
      const cola: Envio[] = [];

      const { data, error: diaError } = await supabase.rpc("mensajes_del_dia_sistema", { p_sucursal: sucursal.id });
      if (!diaError && data) {
        const dia = data as MensajesDia;
        if (config.cumpleanos) for (const c of dia.cumpleanos) if (!c.enviado_en && !c.enviado_auto && c.telefono)
          cola.push({ paciente_id: c.paciente_id, telefono: c.telefono, tipo: "cumpleanos", plantilla: "cumpleanos", parametros: [primerNombre(c.nombres || c.nombre)], referencia: null });
        if (config.control_anual) dia.controles.filter((c) => !c.enviado_en && !c.enviado_auto && !c.make_ya_envio && c.telefono).slice(0, config.max_controles_dia)
          .forEach((c) => cola.push(c.meses >= 10
            ? { paciente_id: c.paciente_id, telefono: c.telefono, tipo: "control", plantilla: "control_anual", parametros: [primerNombre(c.nombres || c.nombre)], referencia: c.consulta_id }
            : { paciente_id: c.paciente_id, telefono: c.telefono, tipo: "control", plantilla: "control_periodico", parametros: [primerNombre(c.nombres || c.nombre), optica, String(c.meses)], referencia: c.consulta_id }));
      }

      if (config.cobros) {
        const { data: cobros } = await supabase.rpc("cola_cobros_automaticos_sistema", { p_sucursal: sucursal.id });
        for (const c of (cobros ?? []) as Cobro[]) {
          if (!c.telefono) continue;
          const nombre = primerNombre(c.nombres);
          // Misma regla que "Cobros de hoy": insistente o > 90 días sin plan = firme; apartado = recordatorio de apartado.
          const firme = c.cobro_insistente || (!c.frecuencia && !c.apartado && c.dias_deuda > 90);
          if (firme) cola.push({ paciente_id: c.paciente_id, telefono: c.telefono, tipo: "cobro", plantilla: "cobro_insistente", parametros: [nombre], referencia: null, saldo: Number(c.saldo) });
          else if (c.apartado && !c.frecuencia) cola.push({ paciente_id: c.paciente_id, telefono: c.telefono, tipo: "cobro", plantilla: "cobro_apartado", parametros: [nombre], referencia: null, saldo: Number(c.saldo) });
          else cola.push({ paciente_id: c.paciente_id, telefono: c.telefono, tipo: "cobro", plantilla: "cobro", parametros: [nombre, Number(c.saldo).toFixed(2), fechaEc(c.fecha_cobro_acordada)], referencia: null, saldo: Number(c.saldo) });
        }
      }

      const r = resumen[sucursal.nombre] ??= { enviados: 0, errores: 0 };
      for (const item of cola) {
        const envio = await enviarPlantillaWhatsapp({ phoneId, telefono: item.telefono, plantilla: plantillaMeta(config.empresa_id, item.plantilla), parametros: item.parametros });
        await supabase.from("mensajes_automaticos_envios").insert({ empresa_id: config.empresa_id, sucursal_id: sucursal.id, paciente_id: item.paciente_id, tipo: item.tipo, telefono: item.telefono, estado: envio.ok ? "enviado" : "error", error: envio.ok ? null : `${item.plantilla}: ${envio.error}`, wa_message_id: envio.ok ? envio.id : null });
        if (!envio.ok) { r.errores++; continue; }
        r.enviados++;
        if (item.tipo === "cobro") {
          await supabase.from("cobros_mensajes").insert({ paciente_id: item.paciente_id, empresa_id: config.empresa_id, sucursal_id: sucursal.id, saldo: item.saldo ?? 0, enviado_por: config.actualizado_por });
        } else {
          await supabase.from("crm_contactos").insert({ paciente_id: item.paciente_id, empresa_id: config.empresa_id, sucursal_id: sucursal.id, motivo: item.tipo, canal: "whatsapp", resultado: "enviado", nota: item.tipo === "cumpleanos" ? "Cumpleaños · envío automático" : "Control · envío automático", referencia_id: item.referencia, created_by: config.actualizado_por });
        }
      }
    }
  }
  return NextResponse.json({ ok: true, resumen });
}
