"use client";
import { printDocumentById } from "@/lib/print-document";

import Link from "next/link";
import { Banknote, CircleAlert, Printer, ReceiptText, Target, Wallet } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import type { InformesData } from "@/lib/informes";
import { establecerMetaVenta, obtenerInformeMensual, type InformeMensual, type InformeSucursal } from "./actions";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const pct = (actual: number, meta: number) => meta > 0 ? Math.round((actual / meta) * 100) : 0;
const clasificacionLabel: Record<string, string> = { salarios: "Salarios", pago_proveedor: "Pago a proveedor", gastos_mensuales: "Gastos mensuales", gastos_operacion: "Gastos de operación", ajuste: "Ajuste" };
const metodoLabel: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", credito: "Crédito", otro: "Otro" };
const mesActual = () => new Date().toISOString().slice(0, 7);
const mesLargo = (mes: string) => new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric" }).format(new Date(`${mes}-01T12:00:00`));

export default function InformesBoard(props: InformesData) {
  const [empresaId, setEmpresaId] = useState<string>(props.profile?.empresa_id ?? props.companies[0]?.id ?? "");
  const [mes, setMes] = useState(mesActual());
  const [informe, setInforme] = useState<InformeMensual | null>(null);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(props.message ?? "");
  const isSuperadmin = props.profile?.rol === "superadmin";
  const todoElNegocio = empresaId === "__todo__";

  useEffect(() => {
    if (props.status !== "ready") return;
    startLoading(async () => {
      try { setInforme(await obtenerInformeMensual(todoElNegocio ? null : empresaId, `${mes}-01`)); setError(""); }
      catch (err) { setError(err instanceof Error ? err.message : "No se pudo generar el informe."); setInforme(null); }
    });
  }, [empresaId, mes, props.status, todoElNegocio]);

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">DIRECCIÓN</p><h1>Informes</h1><p className="subtitle">{props.message ?? "No se pudo abrir informes."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/informes">Iniciar sesión</Link>}</header></div></main>;

  const guardarMeta = (row: InformeSucursal, monto: number) => startLoading(async () => {
    try { await establecerMetaVenta(row.empresa_id, row.sucursal_id, `${mes}-01`, monto); setInforme(await obtenerInformeMensual(todoElNegocio ? null : empresaId, `${mes}-01`)); setNotice("Meta actualizada."); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la meta."); }
  });

  const cumplimientoTotal = informe ? pct(informe.totales.ingresos_total ?? 0, informe.totales.meta_total) : 0;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header no-print"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">DIRECCIÓN</p><h1>Informes</h1><p className="subtitle">Metas, ventas por sucursal e informe mensual del negocio.</p></div>
      <div className="tabs">{props.companies.map((c) => <button key={c.id} className={c.id === empresaId ? "active" : ""} onClick={() => setEmpresaId(c.id)}>{c.nombre}</button>)}{isSuperadmin && <button className={todoElNegocio ? "active" : ""} onClick={() => setEmpresaId("__todo__")}>Todo el negocio</button>}</div>
    </header>
    <div className="new-patient-form no-print" style={{ maxWidth: 220, marginBottom: 12 }}><label>Mes del informe<input type="month" value={mes} onChange={(event) => setMes(event.target.value)} /></label></div>
    <div className="notice no-print"><CircleAlert size={18} /><span>{error || notice || "Las ventas se cuentan solo cuando quedan completadas; los saldos se calculan en tiempo real."}</span></div>

    <div id="monthly-report-print" className="print-area">
    <p className="section-label" style={{ textTransform: "capitalize" }}>{mesLargo(mes)}{todoElNegocio ? " · Todo el negocio" : ` · ${props.companies.find((c) => c.id === empresaId)?.nombre ?? ""}`}</p>

    {loading && !informe ? <p className="field-hint">Calculando informe…</p> : informe && <>
      <section className="agenda-summary">
        <article><ReceiptText size={21} /><strong>{money(informe.totales.ventas_total)}</strong><span>ventas del mes ({informe.totales.ventas_count})</span></article>
        <article><Wallet size={21} /><strong>{money(informe.totales.cobrado_total)}</strong><span>cobrado de las ventas del mes</span></article>
        <article><Banknote size={21} /><strong>{money(informe.totales.saldo_total)}</strong><span>saldo del mes</span></article>
        <article><CircleAlert size={21} /><strong>{money(informe.totales.gastos_total)}</strong><span>gastos del mes</span></article>
        <article><Wallet size={21} /><strong>{money(informe.totales.cuentas_por_cobrar_total)}</strong><span>cuentas por cobrar (total)</span></article>
        <article><Wallet size={21} /><strong>{money(informe.totales.ingresos_total ?? 0)}</strong><span>Cobrado en el mes</span></article>
        <article><Target size={21} /><strong>{informe.totales.meta_total > 0 ? `${cumplimientoTotal}%` : "Sin meta"}</strong><span>cumplimiento de meta</span></article>
      </section>

      <section className="glass agenda-board" style={{ marginBottom: 18 }}>
        <p className="section-label">VENTAS POR SUCURSAL</p><h2>Metas y cumplimiento</h2>
        {informe.por_sucursal.length ? <div className="task-list">{informe.por_sucursal.map((row) => <SucursalRow key={row.sucursal_id} row={row} showEmpresa={todoElNegocio} onGuardarMeta={(monto) => guardarMeta(row, monto)} />)}</div> : <p className="field-hint">No hay sucursales activas.</p>}
      </section>

      <section className="glass agenda-board" style={{ marginBottom: 18 }}>
        <p className="section-label">GASTOS POR CLASIFICACIÓN</p><h2>Egresos del mes</h2>
        {informe.gastos_por_clasificacion.length ? <div className="consultation-stats">{informe.gastos_por_clasificacion.map((g) => <span key={g.clasificacion}><strong>{clasificacionLabel[g.clasificacion] ?? g.clasificacion}</strong>{money(g.monto)}</span>)}</div> : <p className="field-hint">Sin gastos registrados este mes.</p>}
      </section>

      <section className="glass agenda-board" style={{ marginBottom: 18 }}>
        <p className="section-label">COBROS POR FORMA DE PAGO</p><h2>Cómo pagaron los pacientes</h2>
        {informe.cobros_por_metodo.length ? <div className="consultation-stats">{informe.cobros_por_metodo.map((c) => <span key={c.metodo}><strong>{metodoLabel[c.metodo] ?? c.metodo}</strong>{money(c.monto)}</span>)}</div> : <p className="field-hint">Sin cobros registrados este mes.</p>}
      </section>

      <section className="glass agenda-board">
        <p className="section-label">CUADRES DE CAJA</p><h2>Control diario del mes</h2>
        <p>{informe.cuadres.correctos} de {informe.cuadres.total} cuadres salieron correctos este mes.</p>
      </section>
    </>}
    </div>

    {informe && <div className="modal-actions no-print" style={{ marginTop: 14 }}><button className="outline-action" type="button" onClick={() => printDocumentById("monthly-report-print")}><Printer size={15} /> Imprimir / guardar informe</button></div>}
  </div></main>;
}

function SucursalRow({ row, showEmpresa, onGuardarMeta }: { row: InformeSucursal; showEmpresa: boolean; onGuardarMeta: (monto: number) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(row.meta || ""));
  const cobrado = row.ingresos_total ?? 0;
  const cumplimiento = pct(cobrado, row.meta);
  const restante = Math.max(0, row.meta - cobrado);
  const barWidth = Math.min(100, cumplimiento);
  return <article className="task-card"><div className="task-status"><span className={`status-dot ${row.meta > 0 && cobrado >= row.meta ? "aprobada" : ""}`} /></div><div className="task-main">
    <div className="task-meta">{showEmpresa && <span>{row.empresa_nombre}</span>}<span>{row.ventas_count} venta(s)</span></div>
    <h2>{row.sucursal_nombre}</h2>
    <p>Cobrado en el mes: <strong>{money(cobrado)}</strong></p>
    <p className="field-hint">Total vendido: {money(row.ventas_total)} · Cobrado de esas ventas: {money(row.cobrado_total)}</p>
    {row.meta > 0 && <>
      <div style={{ height: 8, borderRadius: 99, background: "#edf1f5", overflow: "hidden", marginTop: 6 }}><div style={{ height: "100%", width: `${barWidth}%`, background: cumplimiento >= 100 ? "#2ba879" : "#3b82c4", borderRadius: 99 }} /></div>
      <p className="field-hint" style={{ marginTop: 4 }}>Meta {money(row.meta)} · Cobrado {money(cobrado)} · Faltan {money(restante)} · {cumplimiento}% cumplido</p>
    </>}
    {editando ? <div className="new-patient-form" style={{ marginTop: 8, maxWidth: 200 }}><label>Nueva meta del mes<input type="number" min={0} step={0.01} value={valor} onChange={(event) => setValor(event.target.value)} autoFocus onBlur={() => { setEditando(false); const n = Number(valor); if (Number.isFinite(n) && n !== row.meta) onGuardarMeta(n); }} onKeyDown={(event) => event.key === "Enter" && (event.currentTarget as HTMLInputElement).blur()} /></label></div> : null}
  </div><div className="task-actions no-print">{row.sucursal_id !== "sin_sucursal" && !editando && <button className="outline-action" type="button" onClick={() => setEditando(true)}><Target size={14} /> {row.meta > 0 ? "Editar meta" : "Poner meta"}</button>}</div></article>;
}
