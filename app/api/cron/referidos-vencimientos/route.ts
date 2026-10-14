import { NextResponse } from "next/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";

// Vence los créditos de referidos cuya fecha ya pasó (Vercel Cron, 07:00 UTC = 02:00 Ecuador).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!hasSupabaseAdminConfiguration()) return NextResponse.json({ ok: true, omitido: "Falta configuración de Supabase." });
  const { data, error } = await createSupabaseAdminClient().rpc("vencer_creditos_referidos");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, vencidos: data });
}
