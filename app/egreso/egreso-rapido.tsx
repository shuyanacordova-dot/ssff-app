"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { crearGasto } from "@/app/caja/actions";

const metodos = [{ id: "efectivo", label: "Efectivo" }, { id: "pichincha", label: "Pichincha" }, { id: "guayaquil", label: "Guayaquil" }, { id: "internacional", label: "Internacional" }];
const clasificaciones = [["gastos_operacion", "Gastos de operación"], ["gastos_mensuales", "Gastos mensuales"], ["pago_proveedor", "Pago a proveedor"], ["salarios", "Salarios"]];

export default function EgresoRapido({ sucursales, cuentas, sucursalInicial, montoInicial, conceptoInicial, metodoInicial }: { sucursales: { id: string; nombre: string; empresa_id: string }[]; cuentas: { id: string; banco: string; sucursal_id: string }[]; sucursalInicial: string; montoInicial: string; conceptoInicial: string; metodoInicial: string }) {
  const [sucursalId, setSucursalId] = useState(sucursalInicial);
  const [metodo, setMetodo] = useState(metodos.some((m) => m.id === metodoInicial) ? metodoInicial : "efectivo");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const sucursal = sucursales.find((s) => s.id === sucursalId);
  const guardar = (form: HTMLFormElement) => start(async () => {
    const data = new FormData(form);
    const cuenta = cuentas.find((c) => c.sucursal_id === sucursalId && c.banco.toLowerCase() === metodo);
    if (metodo !== "efectivo" && !cuenta) { setAviso({ ok: false, texto: "Esa sucursal no tiene cuenta en ese banco." }); return; }
    data.set("empresa_id", sucursal?.empresa_id ?? ""); data.set("sucursal_id", sucursalId);
    data.set("origen", metodo === "efectivo" ? "caja" : "banco"); data.set("cuenta_bancaria_id", cuenta?.id ?? "");
    try { await crearGasto(data); setAviso({ ok: true, texto: `Egreso de $${String(data.get("monto"))} registrado en ${sucursal?.nombre}.` }); form.reset(); }
    catch (err) { setAviso({ ok: false, texto: err instanceof Error ? err.message : "No se pudo registrar." }); }
  });
  return <main className="page agenda-page"><div className="container agenda-shell" style={{ maxWidth: 520 }}>
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><h1>Registrar egreso</h1></div></header>
    <form className="glass agenda-board new-patient-form" onSubmit={(event) => { event.preventDefault(); guardar(event.currentTarget); }}>
      <label>Monto ($)<input name="monto" required inputMode="decimal" autoFocus={!montoInicial} defaultValue={montoInicial} placeholder="0.00" style={{ fontSize: 28, fontWeight: 800 }} /></label>
      <label>Concepto<input name="concepto" required defaultValue={conceptoInicial} placeholder="Ej.: Almuerzo equipo, taxi, limpieza" /></label>
      <label>¿Cómo se pagó?</label>
      <div className="tabs" role="radiogroup" style={{ flexWrap: "wrap" }}>{metodos.map((m) => <button key={m.id} type="button" role="radio" aria-checked={metodo === m.id} className={metodo === m.id ? "active" : ""} onClick={() => setMetodo(m.id)}>{m.label}</button>)}</div>
      {sucursales.length > 1 && <label>Sucursal<select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>}
      <label>Clasificación<select name="clasificacion" defaultValue="gastos_operacion">{clasificaciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {aviso && <p className="notice" role="status" style={aviso.ok ? { background: "#dff6ed", color: "#247658", fontWeight: 700 } : { background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{aviso.texto}</p>}
      <button className="new-consultation" type="submit" disabled={pending} style={{ fontSize: 18, padding: "14px 18px" }}>{pending ? "Guardando…" : "Guardar egreso"}</button>
    </form>
  </div></main>;
}
