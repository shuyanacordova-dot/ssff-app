"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { responderPreferenciasRecibo } from "./actions";

// Aviso de datos ANTES del recibo; se muestra una sola vez por paciente (la base guarda que ya respondió).
// Las casillas vienen sin marcar: la autorización tiene que darla el propio paciente.
export default function AvisoDatosRecibo({ token, children }: { token: string; children: ReactNode }) {
  const [datos, setDatos] = useState(false);
  const [promo, setPromo] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const continuar = (autoriza: boolean) => start(async () => {
    const res = await responderPreferenciasRecibo(token, autoriza, promo);
    if (res.ok) setListo(true); else setError(res.error ?? "No se pudo guardar.");
  });

  if (listo) return <>{children}</>;

  return <main className="login-page"><section className="glass login-card recibo-aviso" style={{ width: "min(420px, 100%)" }}>
    <span className="recibo-aviso-icon"><ShieldCheck size={26} /></span>
    <h1>Antes de ver tu recibo</h1>
    <p>Usamos tus datos solo para tu atención, tu historia clínica, el pedido de tus lentes, la facturación y recordatorios. <Link href="/privacidad" target="_blank">Leer aviso de privacidad</Link></p>
    <label className="priv-check"><input type="checkbox" checked={datos} onChange={(event) => setDatos(event.target.checked)} /> Autorizo el uso de mis datos, incluidos mis datos de salud, para estos fines.</label>
    <label className="priv-check"><input type="checkbox" checked={promo} onChange={(event) => setPromo(event.target.checked)} /> Quiero recibir promociones y novedades por WhatsApp (opcional).</label>
    {error && <p className="recibo-aviso-error" role="alert">{error}</p>}
    <button type="button" className="new-consultation" disabled={pending || !datos} onClick={() => continuar(true)}>{pending ? "Guardando…" : "Aceptar y ver mi recibo"}</button>
    <button type="button" className="text-action" disabled={pending} onClick={() => continuar(false)}>Ver mi recibo sin autorizar</button>
  </section></main>;
}
