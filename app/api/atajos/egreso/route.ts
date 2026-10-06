import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Atajo de iPhone "Registrar egreso": recibe { clave, sucursal, monto, concepto, metodo, clasificacion } y lo registra
// con la clave personal creada en Cuadre de caja. La validación (clave, permisos, sucursal, banco) la hace la base de datos.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, mensaje: "Datos no válidos." }, { status: 400 });
  const monto = Number(String(body.monto ?? "").replace(",", "."));
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("registrar_gasto_atajo", {
    p_token: String(body.clave ?? ""),
    p_sucursal: String(body.sucursal ?? "shuvision"),
    p_monto: Number.isFinite(monto) ? monto : null,
    p_concepto: String(body.concepto ?? ""),
    p_metodo: String(body.metodo ?? "efectivo"),
    p_clasificacion: String(body.clasificacion ?? "gastos_operacion"),
  });
  if (error) return NextResponse.json({ ok: false, mensaje: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, mensaje: data });
}
