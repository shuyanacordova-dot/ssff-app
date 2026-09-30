"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { responderPreferenciasRecibo } from "./actions";

// Casillas del recibo virtual: autorización de datos y promociones (aparte y opcional). Ninguna viene marcada.
export default function PreferenciasDatos({ token, confirmado, promociones }: { token: string; confirmado: boolean; promociones: boolean | null }) {
  const [datos, setDatos] = useState(confirmado);
  const [promo, setPromo] = useState(promociones === true);
  const [mensaje, setMensaje] = useState("");
  const [pending, start] = useTransition();

  const guardar = () => start(async () => {
    const res = await responderPreferenciasRecibo(token, datos, promo);
    setMensaje(res.ok ? "¡Gracias! Guardamos tus preferencias." : res.error ?? "No se pudo guardar.");
  });

  return <div className="no-print recibo-datos">
    <p className="section-label">TUS DATOS</p>
    <p className="field-hint">Usamos tus datos solo para tu atención, tu historia clínica, el pedido de tus lentes, la facturación y recordatorios. <Link href="/privacidad" target="_blank">Aviso de privacidad</Link></p>
    <label className="priv-check"><input type="checkbox" checked={datos} disabled={confirmado} onChange={(event) => setDatos(event.target.checked)} /> Autorizo el uso de mis datos, incluidos mis datos de salud, para estos fines.</label>
    <label className="priv-check"><input type="checkbox" checked={promo} onChange={(event) => setPromo(event.target.checked)} /> Quiero recibir promociones y novedades por WhatsApp (opcional; puedes darte de baja cuando quieras).</label>
    <button type="button" className="new-consultation" disabled={pending} onClick={guardar}>{pending ? "Guardando…" : "Guardar mis preferencias"}</button>
    {mensaje && <p className="field-hint" role="status">{mensaje}</p>}
  </div>;
}
