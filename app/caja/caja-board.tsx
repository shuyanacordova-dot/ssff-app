"use client";

import Link from "next/link";
import { AlertCircle, Banknote, CheckCircle2, Plus, Receipt, XCircle, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import type { CajaData, CierreCaja } from "@/lib/caja";
import { crearCierreCaja, crearGasto, previsualizarCierre, type ResultadoCierre, type VistaCierre } from "./actions";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const bancoLabel: Record<string, string> = { pichincha: "Banco Pichincha", guayaquil: "Banco Guayaquil", internacional: "Banco Internacional" };
const clasificacionLabel: Record<string, string> = { salarios: "Salarios", pago_proveedor: "Pago a proveedor", gastos_mensuales: "Gastos mensuales", gastos_operacion: "Gastos de operación", ajuste: "Ajuste" };

export default function CajaBoard(props: CajaData & { autoGasto?: boolean }) {
  const [notice, setNotice] = useState(props.message ?? "");
  const [empresaId, setEmpresaId] = useState(props.profile?.empresa_id ?? props.companies[0]?.id ?? "");
  const [showGasto, setShowGasto] = useState(!!props.autoGasto);
  const [showCierre, setShowCierre] = useState(false);
  const [pending, startTransition] = useTransition();
  const role = props.profile?.rol;
  const canSaldos = role === "superadmin" || role === "admin_sucursal" || role === "caja";

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">FINANZAS</p><h1>Cuadre de caja</h1><p className="subtitle">{props.message ?? "No se pudo abrir caja."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/caja">Iniciar sesión</Link>}</header></div></main>;

  const branches = props.branches.filter((branch) => branch.empresa_id === empresaId);
  const cuentas = props.cuentas.filter((cuenta) => cuenta.empresa_id === empresaId);
  const gastos = props.gastos.filter((gasto) => gasto.empresa_id === empresaId);
  const cierres = props.cierres.filter((cierre) => cierre.empresa_id === empresaId);
  const cuentaById = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));

  const runAction = (action: () => Promise<unknown>, onOk: string) => startTransition(async () => {
    try { await action(); setNotice(onOk); setShowGasto(false); setShowCierre(false); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo completar la acción."); }
  });

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">FINANZAS</p><h1>Cuadre de caja</h1><p className="subtitle">Cuadre diario y gastos, separados por empresa.</p></div><div className="tabs">{props.companies.map((company) => <button key={company.id} className={company.id === empresaId ? "active" : ""} onClick={() => setEmpresaId(company.id)}>{company.nombre}</button>)}</div></header>
    <section className="agenda-summary"><article><Receipt size={21} /><strong>{gastos.length}</strong><span>gastos registrados</span></article><article><Banknote size={21} /><strong>{cierres.filter((c) => c.cuadre_correcto).length}/{cierres.length}</strong><span>cuadres correctos</span></article></section>
    <div className="notice"><AlertCircle size={18} /><span>{notice || "Un cuadre solo puede registrarse una vez por sucursal y fecha; verifica los datos antes de guardar."}</span></div>

    <section className="glass agenda-board" style={{ marginBottom: 18 }}><div className="agenda-toolbar"><div><p className="section-label">EGRESOS</p><h2>Gastos recientes</h2></div><button className="new-task" type="button" onClick={() => setShowGasto(true)}><Plus size={18} /> Nuevo gasto</button></div>{gastos.length ? <div className="task-list">{gastos.slice(0, 15).map((gasto) => <article className="task-card" key={gasto.id}><div className="task-status"><span className="status-dot" /></div><div className="task-main"><div className="task-meta"><span>{clasificacionLabel[gasto.clasificacion]}</span><span>{gasto.origen === "banco" ? bancoLabel[cuentaById.get(gasto.cuenta_bancaria_id ?? "")?.banco ?? ""] || "Banco" : "Efectivo"}</span><span>{formatDate(gasto.fecha)}</span></div><h2>{gasto.concepto}</h2>{gasto.observaciones && <p>{gasto.observaciones}</p>}</div><div className="task-actions"><strong>{money(gasto.monto)}</strong></div></article>)}</div> : <section className="empty-state"><Receipt size={27} /><h3>Aún no hay gastos</h3><p>Registra el primer egreso de esta empresa.</p></section>}</section>

    <section className="glass agenda-board"><div className="agenda-toolbar"><div><p className="section-label">CIERRE DIARIO</p><h2>Cuadre de caja</h2></div><button className="new-task" type="button" onClick={() => setShowCierre(true)}><Plus size={18} /> Nuevo cuadre</button></div>{cierres.length ? <div className="task-list">{cierres.map((cierre) => <CierreCard key={cierre.id} cierre={cierre} sucursalNombre={props.branches.find((b) => b.id === cierre.sucursal_id)?.nombre ?? "Sucursal"} />)}</div> : <section className="empty-state"><Banknote size={27} /><h3>Sin cuadres registrados</h3><p>El primer cierre diario aparecerá aquí.</p></section>}</section>

    {showGasto && <GastoModal empresaId={empresaId} branches={branches} cuentas={cuentas} canSaldos={canSaldos} pending={pending} onClose={() => setShowGasto(false)} onSubmit={(form) => runAction(() => crearGasto(form), "Gasto registrado.")} />}
    {showCierre && <CierreModal empresaId={empresaId} branches={branches} onClose={(message) => { setShowCierre(false); if (message) setNotice(message); }} />}
  </div></main>;
}

function CheckBadge({ label, value }: { label: string; value: boolean | null }) {
  const cls = value === null ? "na" : value ? "ok" : "fail";
  const text = value === null ? "N/A" : value ? "OK" : "Revisar";
  return <span className={`check-badge ${cls}`}>{label}: {text}</span>;
}

function CierreCard({ cierre, sucursalNombre }: { cierre: CierreCaja; sucursalNombre: string }) {
  return <article className="task-card"><div className="task-status"><span className={`status-dot ${cierre.cuadre_correcto ? "aprobada" : "devuelta"}`} /></div><div className="task-main"><div className="task-meta"><span>{sucursalNombre}</span><span>{formatDate(cierre.fecha)}</span></div><h2>Caja física: {money(cierre.caja_fisica)} · Esperada: {money(cierre.caja_esperada)}</h2><p>Ventas: {money(cierre.ventas_brutas)} · Egresos efectivo: {money(cierre.egresos_efectivo)} · Depósitos: {money(cierre.depositos)} · Diferencia: {money(cierre.diferencia)}</p><div className="check-badges"><CheckBadge label="Cobros=ventas" value={cierre.check_cobros_ventas} /><CheckBadge label="Caja física" value={cierre.check_caja_fisica} /></div></div><div className="task-actions"><span className={`state-pill ${cierre.cuadre_correcto ? "aprobada" : "devuelta"}`}>{cierre.cuadre_correcto ? "Cuadre correcto" : "Con diferencias"}</span></div></article>;
}

function GastoModal({ empresaId, branches, cuentas, canSaldos, pending, onClose, onSubmit }: { empresaId: string; branches: CajaData["branches"]; cuentas: CajaData["cuentas"]; canSaldos: boolean; pending: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) {
  const [origen, setOrigen] = useState<"caja" | "banco">("caja");
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-gasto-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVO GASTO</p><h2 id="new-gasto-title">Registrar egreso</h2><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><input type="hidden" name="empresa_id" value={empresaId} /><div className="new-patient-form">
    <label>Sucursal{origen === "caja" ? <select name="sucursal_id" required defaultValue=""><option value="" disabled>Selecciona la sucursal</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select> : <select name="sucursal_id" defaultValue=""><option value="">Gasto general de la empresa</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>}</label>
    <label>Fecha<input name="fecha" type="date" defaultValue={today()} /></label>
    <label>Clasificación<select name="clasificacion" defaultValue="gastos_operacion">{Object.entries(clasificacionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Concepto<input name="concepto" required placeholder="Ej.: Renta, OPTEC, marketing" /></label>
    <label>Monto<input name="monto" type="number" min="0.01" step="0.01" required /></label>
    <label>Origen<span className="radio-row"><label><input type="radio" name="origen" value="caja" checked={origen === "caja"} onChange={() => setOrigen("caja")} /> Caja (efectivo)</label>{canSaldos && <label><input type="radio" name="origen" value="banco" checked={origen === "banco"} onChange={() => setOrigen("banco")} /> Banco</label>}</span></label>
    {origen === "banco" && <label>Cuenta bancaria<select name="cuenta_bancaria_id" defaultValue=""><option value="" disabled>Selecciona la cuenta</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{bancoLabel[c.banco]}</option>)}</select></label>}
    <label className="task-description">Observaciones<textarea name="observaciones" placeholder="Detalle específico del gasto" /></label>
  </div><div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : "Registrar gasto"}</button></div></form></section></div>;
}

function CierreModal({ empresaId, branches, onClose }: { empresaId: string; branches: CajaData["branches"]; onClose: (message?: string) => void }) {
  const [sucursalId, setSucursalId] = useState("");
  const [fecha, setFecha] = useState(today());
  const [cajaFisica, setCajaFisica] = useState("");
  const [depositoPichincha, setDepositoPichincha] = useState("");
  const [depositoGuayaquil, setDepositoGuayaquil] = useState("");
  const [depositoInternacional, setDepositoInternacional] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [vista, setVista] = useState<VistaCierre | null>(null);
  const [vistaError, setVistaError] = useState("");
  const [loadingVista, startVista] = useTransition();
  const [resultado, setResultado] = useState<ResultadoCierre | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardarError, setGuardarError] = useState("");

  useEffect(() => {
    if (!sucursalId) { setVista(null); setVistaError(""); return; }
    startVista(async () => {
      const result = await previsualizarCierre(empresaId, sucursalId, fecha);
      if ("error" in result) { setVistaError(result.error); setVista(null); } else { setVistaError(""); setVista(result); }
    });
  }, [sucursalId, fecha, empresaId]);

  const depositosTotal = (Number(depositoPichincha) || 0) + (Number(depositoGuayaquil) || 0) + (Number(depositoInternacional) || 0);
  const cajaEsperadaPreview = vista ? vista.caja_anterior + vista.cobro_efectivo - vista.egresos_efectivo - depositosTotal : null;
  const diferenciaPreview = cajaEsperadaPreview !== null && cajaFisica !== "" ? Number(cajaFisica) - cajaEsperadaPreview : null;
  const abonosTotal = vista ? vista.cobro_efectivo + vista.cobro_tarjeta + vista.cobro_transferencia_pichincha + vista.cobro_transferencia_guayaquil + vista.cobro_transferencia_internacional + vista.cobro_credito + vista.cobro_otro : 0;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGuardarError(""); setGuardando(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await crearCierreCaja(form);
      setResultado(result);
    } catch (err) { setGuardarError(err instanceof Error ? err.message : "No se pudo registrar el cuadre."); }
    setGuardando(false);
  };

  if (resultado) return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => onClose(resultado.cuadre_correcto ? "Cuadre de caja exitoso." : "Cuadre guardado con diferencias — revísalo.")} aria-label="Cerrar"><X size={19} /></button>
    {resultado.cuadre_correcto ? <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "20px 0" }}><CheckCircle2 size={48} color="#247658" /><h2 style={{ margin: 0 }}>Cuadre de caja exitoso</h2><p className="field-hint">El efectivo contado coincide con lo esperado.</p></div>
      : <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "20px 0" }}><XCircle size={48} color="#a24150" /><h2 style={{ margin: 0 }}>Cuadre guardado con diferencias</h2><p className="field-hint">Diferencia: <strong>{money(resultado.diferencia)}</strong> (esperado {money(resultado.caja_esperada)}, contado {money(resultado.caja_fisica)}). El cuadre quedó registrado para revisarlo.</p></div>}
    <div className="modal-actions"><button className="new-consultation" type="button" onClick={() => onClose(resultado.cuadre_correcto ? "Cuadre de caja exitoso." : "Cuadre guardado con diferencias — revísalo.")}>Listo</button></div>
  </section></div>;

  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="new-cierre-title"><button className="modal-close" onClick={() => onClose()} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVO CUADRE</p><h2 id="new-cierre-title">Cierre de caja diario</h2><p>Las ventas, abonos y egresos del día se cargan solos desde el Resumen del día. Solo cuenta el efectivo y compara.</p><form onSubmit={submit}><input type="hidden" name="empresa_id" value={empresaId} /><div className="new-patient-form">
    <label>Sucursal<select name="sucursal_id" required value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}><option value="" disabled>Selecciona la sucursal</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
    <label>Fecha<input name="fecha" type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} /></label>
  </div>

  {sucursalId && <div className="glass clinical-card" style={{ minHeight: "auto", margin: "14px 0", padding: 16 }}>
    {loadingVista && <p className="field-hint">Calculando…</p>}
    {vistaError && <p className="notice">{vistaError}</p>}
    {vista && <>
      {vista.ya_existe && <p className="notice">Ya existe un cuadre guardado para esta sucursal y fecha.</p>}

      <p className="section-label">RESUMEN DEL DÍA</p>
      <div className="consultation-stats"><span><strong>Abonos del día</strong>{money(abonosTotal)}</span><span><strong>Egresos del día</strong>{money(vista.egresos_efectivo)}</span></div>

      <p className="section-label" style={{ marginTop: 14 }}>VALOR EN CAJA DÍA ANTERIOR</p>
      <div className="consultation-stats"><span><strong>Caja anterior</strong>{money(vista.caja_anterior)}</span></div>

      <p className="section-label" style={{ marginTop: 14 }}>PAGO EN TRANSFERENCIAS</p>
      <div className="consultation-stats"><span><strong>Banco Pichincha</strong>{money(vista.cobro_transferencia_pichincha)}</span><span><strong>Banco Guayaquil</strong>{money(vista.cobro_transferencia_guayaquil)}</span><span><strong>Banco Internacional</strong>{money(vista.cobro_transferencia_internacional)}</span></div>

      <p className="section-label" style={{ marginTop: 14 }}>PAGO CON TARJETAS DE CRÉDITO</p>
      <div className="consultation-stats"><span><strong>Tarjeta</strong>{money(vista.cobro_tarjeta)}</span>{(vista.cobro_credito > 0 || vista.cobro_otro > 0) && <span><strong>Crédito / otro</strong>{money(vista.cobro_credito + vista.cobro_otro)}</span>}</div>

      <p className="section-label" style={{ marginTop: 14 }}>DINERO EN EFECTIVO</p>
      <div className="consultation-stats"><span><strong>Cobrado en efectivo</strong>{money(vista.cobro_efectivo)}</span></div>
    </>}
  </div>}

  <p className="section-label" style={{ marginTop: 14 }}>DEPÓSITO EN CADA BANCO (SI APLICA)</p>
  <div className="new-patient-form">
    <label>Banco Pichincha<input name="deposito_pichincha" type="number" min="0" step="0.01" placeholder="0.00" value={depositoPichincha} onChange={(event) => setDepositoPichincha(event.target.value)} /></label>
    <label>Banco Guayaquil<input name="deposito_guayaquil" type="number" min="0" step="0.01" placeholder="0.00" value={depositoGuayaquil} onChange={(event) => setDepositoGuayaquil(event.target.value)} /></label>
    <label>Banco Internacional<input name="deposito_internacional" type="number" min="0" step="0.01" placeholder="0.00" value={depositoInternacional} onChange={(event) => setDepositoInternacional(event.target.value)} /></label>
  </div>

  <p className="section-label" style={{ marginTop: 14 }}>EFECTIVO CONTADO EN CAJA</p>
  <div className="new-patient-form">
    <label>¿Cuánto dinero hay en efectivo?<input name="caja_fisica" type="number" min="0" step="0.01" required value={cajaFisica} onChange={(event) => setCajaFisica(event.target.value)} /></label>
    {cajaEsperadaPreview !== null && <label>Caja esperada<input value={money(cajaEsperadaPreview)} disabled /></label>}
  </div>
  {diferenciaPreview !== null && <p className="notice" style={{ marginTop: 8 }}><span className={`check-badge ${Math.abs(diferenciaPreview) < 0.01 ? "ok" : "fail"}`}>{Math.abs(diferenciaPreview) < 0.01 ? "El valor coincide" : `Diferencia de ${money(diferenciaPreview)}`}</span></p>}

  <div className="new-patient-form" style={{ marginTop: 14 }}><label className="task-description">Observaciones<textarea name="observaciones" value={observaciones} onChange={(event) => setObservaciones(event.target.value)} /></label></div>
  {guardarError && <p className="notice">{guardarError}</p>}
  <div className="modal-actions"><button className="outline-action" type="button" onClick={() => onClose()}>Cancelar</button><button className="new-consultation" disabled={guardando || !sucursalId} type="submit">{guardando ? "Guardando…" : "Registrar cuadre"}</button></div></form></section></div>;
}
