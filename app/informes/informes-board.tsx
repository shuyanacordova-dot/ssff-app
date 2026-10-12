"use client";
import { printDocumentById } from "@/lib/print-document";

import Link from "next/link";
import { Banknote, ChevronRight, CircleAlert, Printer, ReceiptText, Target, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import type { InformesData } from "@/lib/informes";
import { establecerMetaVenta, obtenerInformeMensual, type InformeMensual, type InformeSucursal, type TipoDesglose } from "./actions";
import DesgloseModal from "./desglose-modal";

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
  const [desglose, setDesglose] = useState<TipoDesglose | null>(null);
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

  const recargar = () => startLoading(async () => { try { setInforme(await obtenerInformeMensual(todoElNegocio ? null : empresaId, `${mes}-01`)); } catch { /* el informe anterior se mantiene */ } });
  const etiquetaPeriodo = `${mesLargo(mes)}${todoElNegocio ? " · Todo el negocio" : ` · ${props.companies.find((c) => c.id === empresaId)?.nombre ?? ""}`}`;
  const cumplimientoTotal = informe ? pct(informe.totales.ingresos_total ?? informe.totales.cobrado_total ?? 0, informe.totales.meta_total) : 0;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header no-print"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">DIRECCIÓN</p><h1>Informes</h1></div>
      <div className="tabs">{props.companies.map((c) => <button key={c.id} className={c.id === empresaId ? "active" : ""} onClick={() => setEmpresaId(c.id)}>{c.nombre}</button>)}{isSuperadmin && <button className={todoElNegocio ? "active" : ""} onClick={() => setEmpresaId("__todo__")}>Todo el negocio</button>}</div>
    </header>
    <div className="new-patient-form no-print" style={{ maxWidth: 220, marginBottom: 12 }}><label>Mes del informe<input type="month" value={mes} onChange={(event) => setMes(event.target.value)} /></label></div>
    <div className="notice no-print"><CircleAlert size={18} /><span>{error || notice || "Las ventas se cuentan solo cuando quedan completadas; los saldos se calculan en tiempo real."}</span></div>

    <div id="monthly-report-print" className="print-area">
    <p className="section-label" style={{ textTransform: "capitalize" }}>{mesLargo(mes)}{todoElNegocio ? " · Todo el negocio" : ` · ${props.companies.find((c) => c.id === empresaId)?.nombre ?? ""}`}</p>

    {loading && !informe ? <p className="field-hint">Calculando informe…</p> : informe && <>
      <section className="informe-cards">
        <InformeCard icon={ReceiptText} label={`Ventas del mes (${informe.totales.ventas_count})`} valor={money(informe.totales.ventas_total)} onClick={() => setDesglose("ventas")} />
        <InformeCard icon={Wallet} label="Cobrado de las ventas del mes" valor={money(informe.totales.cobrado_total)} onClick={() => setDesglose("ventas")} />
        <InformeCard icon={Wallet} label="Cobrado en el mes (a cuenta)" valor={money(informe.totales.ingresos_total ?? 0)} onClick={() => setDesglose("cobros")} />
        <InformeCard icon={Banknote} label="Saldo de las ventas del mes" valor={money(informe.totales.saldo_total)} onClick={() => setDesglose("saldo")} />
        <InformeCard icon={CircleAlert} label="Egresos del mes" valor={money(informe.totales.gastos_total)} onClick={() => setDesglose("gastos")} tono="egreso" />
        <InformeCard icon={Wallet} label="Cuentas por cobrar (total)" valor={money(informe.totales.cuentas_por_cobrar_total)} onClick={() => setDesglose("cxc")} />
        <InformeCard icon={Target} label="Cumplimiento de meta" valor={informe.totales.meta_total > 0 ? `${cumplimientoTotal}%` : "Sin meta"} />
      </section>

      <section className="glass agenda-board" style={{ marginBottom: 18 }}>
        <p className="section-label">VENTAS POR SUCURSAL</p><h2>Metas y cumplimiento</h2>
        {informe.por_sucursal.length ? <div className="task-list">{informe.por_sucursal.map((row) => <SucursalRow key={row.sucursal_id} row={row} showEmpresa={todoElNegocio} onGuardarMeta={(monto) => guardarMeta(row, monto)} />)}</div> : <p className="field-hint">No hay sucursales activas.</p>}
      </section>

      {isSuperadmin && <section className="glass agenda-board" style={{ marginBottom: 18 }}>
        <p className="section-label">DESGLOSE POR SUCURSAL</p><h2>Resultado del mes y dinero disponible</h2>
        <div className="task-list">{informe.por_sucursal.filter((row) => row.sucursal_id !== "sin_sucursal").map((row) => {
          const aCuenta = Number(row.ingresos_total ?? 0);
          const egresos = Number(row.gastos_total ?? 0);
          const resultado = aCuenta - egresos;
          const dinero = props.dineroDisponible?.find((d) => d.sucursal_id === row.sucursal_id);
          return <article className="task-card" key={row.sucursal_id}><div className="task-main">
            <h2>{row.sucursal_nombre}</h2>
            <div className="informe-kv">
              <span><small>A cuenta del mes</small><b>{money(aCuenta)}</b></span>
              <span><small>Egresos del mes</small><b>{money(egresos)}</b></span>
              <span><small>Resultado del mes</small><b style={{ color: resultado < 0 ? "#a24150" : "#247658" }}>{resultado < 0 ? "−" : ""}{money(Math.abs(resultado))}</b></span>
              <span><small>Acumulado (dinero disponible)</small>{!dinero ? <b>—</b> : dinero.estado === "listo" ? <><b>{money(Number(dinero.total))}</b><small>Bancos {money(Number(dinero.bancos))} + efectivo {money(Number(dinero.efectivo))}</small></> : <>Por cuadrar <Link className="text-action no-print" href="/mi-espacio/bancos">Cuadrar</Link></>}</span>
            </div>
          </div></article>;
        })}</div>
        <p className="field-hint">El dinero disponible es de hoy (bancos desde su último cuadre + efectivo de la caja), no del mes elegido.</p>
      </section>}

      <section className="glass agenda-board" style={{ marginBottom: 18 }}>
        <div className="informe-section-head"><div><p className="section-label">GASTOS POR CLASIFICACIÓN</p><h2>Egresos del mes</h2></div><button type="button" className="outline-action no-print" onClick={() => setDesglose("gastos")}>Ver egresos y clasificar <ChevronRight size={14} /></button></div>
        {informe.gastos_por_clasificacion.length ? <div className="informe-kv">{informe.gastos_por_clasificacion.map((g) => <button type="button" key={g.clasificacion} onClick={() => setDesglose("gastos")}><small>{clasificacionLabel[g.clasificacion] ?? g.clasificacion}</small><b>{money(g.monto)}</b></button>)}</div> : <p className="field-hint">Sin gastos registrados este mes.</p>}
      </section>

      <section className="glass agenda-board" style={{ marginBottom: 18 }}>
        <div className="informe-section-head"><div><p className="section-label">COBROS POR FORMA DE PAGO</p><h2>Cómo pagaron los pacientes</h2></div><button type="button" className="outline-action no-print" onClick={() => setDesglose("cobros")}>Ver cobros <ChevronRight size={14} /></button></div>
        {informe.cobros_por_metodo.length ? <div className="informe-kv">{informe.cobros_por_metodo.map((c) => <button type="button" key={c.metodo} onClick={() => setDesglose("cobros")}><small>{metodoLabel[c.metodo] ?? c.metodo}</small><b>{money(c.monto)}</b></button>)}</div> : <p className="field-hint">Sin cobros registrados este mes.</p>}
      </section>

      <section className="glass agenda-board">
        <div className="informe-section-head"><div><p className="section-label">CUADRES DE CAJA</p><h2>Control diario del mes</h2></div><button type="button" className="outline-action no-print" onClick={() => setDesglose("cuadres")}>Ver cuadres <ChevronRight size={14} /></button></div>
        <p>{informe.cuadres.correctos} de {informe.cuadres.total} cuadres salieron correctos este mes.</p>
      </section>
    </>}
    </div>

    {desglose && <DesgloseModal tipo={desglose} empresaId={todoElNegocio ? null : empresaId} mes={`${mes}-01`} etiquetaPeriodo={etiquetaPeriodo} puedeClasificar={isSuperadmin} onClose={() => setDesglose(null)} onCambio={recargar} />}
    {informe && <div className="modal-actions no-print" style={{ marginTop: 14 }}><button className="outline-action" type="button" onClick={() => printDocumentById("monthly-report-print")}><Printer size={15} /> Imprimir / guardar informe</button></div>}
  </div></main>;
}

function InformeCard({ icon: Icon, label, valor, onClick, tono }: { icon: LucideIcon; label: string; valor: string; onClick?: () => void; tono?: "egreso" }) {
  const contenido = <><span className="informe-card-label"><Icon size={16} />{label}</span><strong className="informe-card-valor">{valor}</strong>{onClick && <span className="informe-card-ver no-print">Ver detalle <ChevronRight size={13} /></span>}</>;
  return onClick ? <button type="button" className={`informe-card ${tono ?? ""}`} onClick={onClick}>{contenido}</button> : <div className={`informe-card ${tono ?? ""}`}>{contenido}</div>;
}

function SucursalRow({ row, showEmpresa, onGuardarMeta }: { row: InformeSucursal; showEmpresa: boolean; onGuardarMeta: (monto: number) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(row.meta || ""));
  // Igual que en el inicio: "A cuenta" = todo el dinero que entró en el mes (ingresos_total).
  const cobrado = Number(row.ingresos_total ?? row.cobrado_total ?? 0);
  const cumplimiento = pct(cobrado, row.meta);
  const restante = Math.max(0, row.meta - cobrado);
  const barWidth = Math.min(100, cumplimiento);
  return <article className="task-card"><div className="task-status"><span className={`status-dot ${row.meta > 0 && cobrado >= row.meta ? "aprobada" : ""}`} /></div><div className="task-main">
    <div className="task-meta">{showEmpresa && <span>{row.empresa_nombre}</span>}<span>{row.ventas_count} venta(s)</span></div>
    <h2>{row.sucursal_nombre}</h2>
    <p>A cuenta del mes: <strong>{money(cobrado)}</strong></p>
    {row.meta > 0 && <>
      <div style={{ height: 8, borderRadius: 99, background: "#edf1f5", overflow: "hidden", marginTop: 6 }}><div style={{ height: "100%", width: `${barWidth}%`, background: cumplimiento >= 100 ? "#2ba879" : "#3b82c4", borderRadius: 99 }} /></div>
      <p className="field-hint" style={{ marginTop: 4 }}>Meta {money(row.meta)} · Faltan {money(restante)} · {cumplimiento}% cumplido</p>
    </>}
    {editando ? <div className="new-patient-form" style={{ marginTop: 8, maxWidth: 200 }}><label>Nueva meta del mes<input type="number" min={0} step={0.01} value={valor} onChange={(event) => setValor(event.target.value)} autoFocus onBlur={() => { setEditando(false); const n = Number(valor); if (Number.isFinite(n) && n !== row.meta) onGuardarMeta(n); }} onKeyDown={(event) => event.key === "Enter" && (event.currentTarget as HTMLInputElement).blur()} /></label></div> : null}
  </div><div className="task-actions no-print">{row.sucursal_id !== "sin_sucursal" && !editando && <button className="outline-action" type="button" onClick={() => setEditando(true)}><Target size={14} /> {row.meta > 0 ? "Editar meta" : "Poner meta"}</button>}</div></article>;
}
