import { NextResponse } from "next/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";

// Diagnóstico: confirma con Meta desde qué número envía cada sucursal (nombre verificado y número),
// sin mostrar el token. Protegido con CRON_SECRET.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return NextResponse.json({ token: false });
  if (!hasSupabaseAdminConfiguration()) return NextResponse.json({ token: true, error: "Falta Supabase" });
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("mensajes_numeros_sucursal").select("sucursal_id,whatsapp_phone_id,sucursales(nombre)");
  const sucursales = [];
  for (const row of (data ?? []) as unknown as { whatsapp_phone_id: string | null; sucursales: { nombre: string } | null }[]) {
    if (!row.whatsapp_phone_id) { sucursales.push({ sucursal: row.sucursales?.nombre, conectado: false }); continue; }
    const res = await fetch(`https://graph.facebook.com/v21.0/${row.whatsapp_phone_id}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${token}` } });
    sucursales.push({ sucursal: row.sucursales?.nombre, phone_id: row.whatsapp_phone_id, respuesta: await res.json().catch(() => null) });
  }
  // Números a los que este token tiene acceso (por si el de Shuvision tiene otro identificador).
  const debug = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${token}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null) as { data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } } | null;
  const wabas = [...new Set((debug?.data?.granular_scopes ?? []).flatMap((s) => s.target_ids ?? []))];
  const numeros = [];
  for (const waba of wabas) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${waba}/phone_numbers?fields=id,display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json()).catch(() => null);
    if (r?.data) numeros.push({ waba, numeros: r.data });
  }
  // Cuentas de WhatsApp asignadas al usuario del sistema y sus plantillas (nombre, estado, texto).
  const cuentas = await fetch("https://graph.facebook.com/v21.0/me/assigned_whatsapp_business_accounts?fields=id,name", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null) as { data?: { id: string; name: string }[] } | null;
  const plantillas = [];
  // Cuenta de WhatsApp Business de Shuvisión (identificador que mostraba la conexión de Make).
  const lista = cuentas?.data?.length ? cuentas.data : [{ id: "103661679039116", name: "Shuvision (Make)" }];
  for (const cuenta of lista) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${cuenta.id}/message_templates?fields=name,status,category,language,components&limit=100`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json()).catch(() => null);
    const tel = await fetch(`https://graph.facebook.com/v21.0/${cuenta.id}/phone_numbers?fields=id,display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json()).catch(() => null);
    plantillas.push({ cuenta, numeros: tel?.data ?? tel, plantillas: r?.data ?? r });
  }
  return NextResponse.json({ token: true, sucursales, numeros_del_token: numeros, cuentas: plantillas });
}
