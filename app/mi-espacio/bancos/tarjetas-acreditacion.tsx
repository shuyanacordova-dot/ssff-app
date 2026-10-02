"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fechaCorta, hoyEcuador, money } from "@/lib/mis-deudas-calc";
import { registrarAcreditacionTarjeta } from "./actions";
import type { CuentaCuadre } from "./cuadre-bancos-board";
import s from "../mis-deudas.module.css";

export type PagoPendiente = { pago_id: string; fecha: string; monto: number; sucursal_id: string; sucursal_nombre: string; empresa_id: string; folio: number | null; cliente: string };
export type AcreditacionReciente = { id: string; fecha: string; cuenta_id: string; monto_bruto: number; monto_neto: number; comision: number };
const nombreBanco: Record<string, string> = { pichincha: "Pichincha", guayaquil: "Guayaquil", internacional: "Internacional" };

export default function TarjetasAcreditacion({ pendientes, acreditaciones, cuentas, errorCarga }: { pendientes: PagoPendiente[]; acreditaciones: AcreditacionReciente[]; cuentas: CuentaCuadre[]; errorCarga: string | null }) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [fecha, setFecha] = useState(hoyEcuador());
  const [monto, setMonto] = useState("");
  const [montoEditado, setMontoEditado] = useState(false);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pending, start] = useTransition();
  const elegidos = pendientes.filter((p) => seleccion.includes(p.pago_id));
  const bruto = Math.round(elegidos.reduce((s, p) => s + Number(p.monto), 0) * 100) / 100;
  const neto = montoEditado ? Number(monto.replace(",", ".")) : bruto;
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  const grupos = useMemo(() => Array.from(new Set(pendientes.map((p) => p.sucursal_id))).map((id) => ({ id, nombre: pendientes.find((p) => p.sucursal_id === id)?.sucursal_nombre ?? "Sucursal", pagos: pendientes.filter((p) => p.sucursal_id === id) })), [pendientes]);

  const cambiar = (pago: PagoPendiente) => {
    const siguiente = seleccion.includes(pago.pago_id) ? seleccion.filter((id) => id !== pago.pago_id) : [...seleccion, pago.pago_id];
    setSeleccion(siguiente); setError(""); setMensaje(""); setMontoEditado(false); setMonto("");
    const primero = pendientes.find((p) => p.pago_id === siguiente[0]);
    const actual = cuentas.find((c) => c.id === cuentaId);
    if (!primero) setCuentaId("");
    else if (!actual || actual.empresa_id !== primero.empresa_id) setCuentaId(cuentas.find((c) => c.sucursal_id === primero.sucursal_id && c.banco === "pichincha")?.id ?? cuentas.find((c) => c.empresa_id === primero.empresa_id)?.id ?? "");
  };
  const guardar = () => {
    setError(""); setMensaje("");
    if (!elegidos.length) return setError("Elige al menos un cobro con tarjeta.");
    if (!cuenta || elegidos.some((p) => p.empresa_id !== cuenta.empresa_id)) return setError("Todos los cobros deben ser de la misma empresa que la cuenta elegida.");
    if (!Number.isFinite(neto) || neto <= 0 || neto > bruto) return setError("El monto que llegó debe ser mayor que cero y no superar lo cobrado.");
    start(async () => {
      const resultado = await registrarAcreditacionTarjeta(seleccion, cuentaId, fecha, neto, notas);
      if (!resultado.ok) return setError(resultado.error);
      setSeleccion([]); setCuentaId(""); setMonto(""); setMontoEditado(false); setNotas(""); setMensaje("Acreditación registrada."); router.refresh();
    });
  };
  return <section id="tarjetas" className="glass agenda-board" style={{ scrollMarginTop: 20, marginBottom: 22 }}>
    <p className="section-label">COBROS CON TARJETA</p><h2>Tarjetas por acreditar</h2>
    {errorCarga && <p className="notice" role="alert">No se pudieron cargar las tarjetas: {errorCarga}</p>}
    {!errorCarga && !pendientes.length && <p className={s.empty}>No hay cobros con tarjeta pendientes de acreditar.</p>}
    {grupos.map((grupo) => <div key={grupo.id} style={{ marginBottom: 18 }}><h3>{grupo.nombre}</h3><div style={{ display: "grid", gap: 6 }}>{grupo.pagos.map((p) => <label key={p.pago_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "#f6fafb", borderRadius: 10 }}><input type="checkbox" checked={seleccion.includes(p.pago_id)} onChange={() => cambiar(p)} disabled={pending} /><span style={{ flex: 1 }}>{fechaCorta(p.fecha)} · {p.cliente} · folio {p.folio ?? "—"}</span><strong>{money(Number(p.monto))}</strong></label>)}</div><p style={{ textAlign: "right", fontWeight: 700 }}>Subtotal: {money(grupo.pagos.reduce((sum, p) => sum + Number(p.monto), 0))}</p></div>)}
    <div className={s.debt} style={{ borderTop: "4px solid #178e88" }}><h3>Registrar lo que llegó al banco</h3><div className="new-patient-form" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
      <label>Cuenta<select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} disabled={pending}><option value="">Elige una cuenta</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{nombreBanco[c.banco] ?? c.banco} · {c.sucursal_nombre}</option>)}</select></label>
      <label>Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={pending} /></label>
      <label>Monto que llegó al banco<input type="number" inputMode="decimal" min="0.01" max={bruto} step="0.01" value={montoEditado ? monto : elegidos.length ? bruto.toFixed(2) : ""} onChange={(e) => { setMontoEditado(true); setMonto(e.target.value); }} disabled={pending} /></label>
      <label>Notas (opcional)<input value={notas} onChange={(e) => setNotas(e.target.value)} disabled={pending} /></label>
    </div><p>Cobrado con tarjeta: {money(bruto)} · Llegó: {money(Number.isFinite(neto) ? neto : 0)} · Comisión: {money(Number.isFinite(neto) ? Math.round((bruto - neto) * 100) / 100 : 0)}</p>
    {error && <p className="notice" role="alert">{error}</p>}{mensaje && <p role="status">{mensaje}</p>}
    <button className="new-consultation" type="button" onClick={guardar} disabled={pending || !elegidos.length}>{pending ? "Registrando…" : "Marcar como acreditado"}</button></div>
    <h3 style={{ marginTop: 24 }}>Últimas acreditaciones</h3>{acreditaciones.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left", borderSpacing: "0 8px" }}><thead><tr><th>Fecha</th><th>Cuenta</th><th>Cobrado</th><th>Llegó</th><th>Comisión</th></tr></thead><tbody>{acreditaciones.map((a) => { const c = cuentas.find((item) => item.id === a.cuenta_id); return <tr key={a.id}><td>{fechaCorta(a.fecha)}</td><td>{c ? `${nombreBanco[c.banco] ?? c.banco} · ${c.sucursal_nombre}` : "Cuenta"}</td><td>{money(a.monto_bruto)}</td><td>{money(a.monto_neto)}</td><td>{money(a.comision)}</td></tr>; })}</tbody></table></div> : <p className={s.empty}>Aún no hay acreditaciones registradas.</p>}
  </section>;
}
