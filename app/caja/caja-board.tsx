"use client";
import { fechaGuayaquil, formatRecordDate } from "@/lib/record-date";

import Link from "next/link";
import { AlertCircle, Banknote, CheckCircle2, Plus, Receipt, XCircle, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { CajaData, CajaBranch, CierreCaja } from "@/lib/caja";
import { crearCierreCaja, crearGasto, registrarAperturaCaja, previsualizarCierre, type ResultadoCierre, type VistaCierre } from "./actions";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
// Acepta coma o punto como decimal (teclados en español) y deja solo números.
const montoInput = (value: string) => value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const today = fechaGuayaquil;
const fechaCuadre = (fecha: string) => fecha ? new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", weekday: "long", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${fecha}T12:00:00-05:00`)) : "fecha por seleccionar";
const origenCaja = (vista: VistaCierre) => vista.origen_caja_anterior && vista.fecha_caja_anterior ? `${vista.origen_caja_anterior === "apertura" ? "Apertura" : "Cierre"} del ${formatDate(vista.fecha_caja_anterior)}` : "Sin registro previo";
const formatDate = formatRecordDate;
const bancoLabel: Record<string, string> = { pichincha: "Banco Pichincha", guayaquil: "Banco Guayaquil", internacional: "Banco Internacional" };
const clasificacionLabel: Record<string, string> = { salarios: "Salarios", pago_proveedor: "Pago a proveedor", gastos_mensuales: "Gastos mensuales", gastos_operacion: "Gastos de operación", ajuste: "Ajuste" };

export default function CajaBoard(props: CajaData & { autoGasto?: boolean }) {
  const [notice, setNotice] = useState(props.message ?? "");
  const [empresaId, setEmpresaId] = useState(props.profile?.empresa_id ?? props.companies[0]?.id ?? "");
  const [showGasto, setShowGasto] = useState(!!props.autoGasto);
  const [showCierre, setShowCierre] = useState(false);
  const [cierreSucursalId, setCierreSucursalId] = useState("");
  const [pending, startTransition] = useTransition();
  const role = props.profile?.rol;
  const canSaldos = role === "superadmin" || role === "admin_sucursal" || role === "caja";

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">FINANZAS</p><h1>Cuadre de caja</h1><p className="subtitle">{props.message ?? "No se pudo abrir caja."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/caja">Iniciar sesión</Link>}</header></div></main>;

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
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">FINANZAS</p><h1>Cuadre de caja</h1><p className="subtitle">Cuadre diario y gastos, separados por empresa.</p></div><div className="tabs">{props.companies.map((company) => <button key={company.id} className={company.id === empresaId ? "active" : ""} onClick={() => setEmpresaId(company.id)}>{company.nombre}</button>)}</div></header>
    <section className="agenda-summary"><article><Receipt size={21} /><strong>{gastos.length}</strong><span>gastos registrados</span></article><article><Banknote size={21} /><strong>{cierres.filter((c) => c.cuadre_correcto).length}/{cierres.length}</strong><span>cuadres correctos</span></article></section>
    <div className="notice"><AlertCircle size={18} /><span>{notice || "Un cuadre solo puede registrarse una vez por sucursal y fecha; verifica los datos antes de guardar."}</span></div>

    <ResumenCajaHoy empresaId={empresaId} branches={branches} cierres={cierres} defaultSucursalId={props.profile?.sucursal_id ?? ""} onNuevoCuadre={(sucursalId) => { setCierreSucursalId(sucursalId); setShowCierre(true); }} />

    <section className="glass agenda-board" style={{ marginBottom: 18 }}><div className="agenda-toolbar"><div><p className="section-label">EGRESOS</p><h2>Gastos recientes</h2></div><button className="new-task" type="button" onClick={() => setShowGasto(true)}><Plus size={18} /> Nuevo gasto</button></div>{gastos.length ? <div className="task-list">{gastos.slice(0, 15).map((gasto) => <article className="task-card" key={gasto.id}><div className="task-status"><span className="status-dot" /></div><div className="task-main"><div className="task-meta"><span>{clasificacionLabel[gasto.clasificacion]}</span><span>{gasto.origen === "banco" ? bancoLabel[cuentaById.get(gasto.cuenta_bancaria_id ?? "")?.banco ?? ""] || "Banco" : "Efectivo"}</span><span>{formatDate(gasto.fecha)}</span></div><h2>{gasto.concepto}</h2>{gasto.observaciones && <p>{gasto.observaciones}</p>}</div><div className="task-actions"><strong>{money(gasto.monto)}</strong></div></article>)}</div> : <section className="empty-state"><Receipt size={27} /><h3>Aún no hay gastos</h3><p>Registra el primer egreso de esta empresa.</p></section>}</section>

    <section className="glass agenda-board"><div className="agenda-toolbar"><div><p className="section-label">CIERRE DIARIO</p><h2>Cuadre de caja</h2></div><button className="new-task" type="button" onClick={() => { setCierreSucursalId(""); setShowCierre(true); }}><Plus size={18} /> Nuevo cuadre</button></div>{cierres.length ? <div className="task-list">{cierres.map((cierre) => <CierreCard key={cierre.id} cierre={cierre} sucursalNombre={props.branches.find((b) => b.id === cierre.sucursal_id)?.nombre ?? "Sucursal"} />)}</div> : <section className="empty-state"><Banknote size={27} /><h3>Sin cuadres registrados</h3><p>El primer cierre diario aparecerá aquí.</p></section>}</section>

    {showGasto && <GastoModal empresaId={empresaId} branches={branches} cuentas={cuentas} canSaldos={canSaldos} pending={pending} onClose={() => setShowGasto(false)} onSubmit={(form) => runAction(() => crearGasto(form), "Gasto registrado.")} />}
    {showCierre && <CierreModal key={`${empresaId}:${cierreSucursalId}`} empresaId={empresaId} branches={branches} initialSucursalId={cierreSucursalId || props.profile?.sucursal_id || ""} onClose={(message) => { setShowCierre(false); if (message) setNotice(message); }} />}
  </div></main>;
}

function ResumenCajaHoy({ empresaId, branches, cierres, defaultSucursalId, onNuevoCuadre }: { empresaId: string; branches: CajaBranch[]; cierres: CierreCaja[]; defaultSucursalId: string; onNuevoCuadre: (sucursalId: string) => void }) {
  const [sucursalId, setSucursalId] = useState(() => (branches.some((b) => b.id === defaultSucursalId) ? defaultSucursalId : branches[0]?.id ?? ""));
  useEffect(() => { if (!branches.some((b) => b.id === sucursalId)) setSucursalId(branches[0]?.id ?? ""); }, [branches, sucursalId]);
  const [vista, setVista] = useState<VistaCierre | null>(null);
  const [error, setError] = useState("");
  const [loading, startLoading] = useTransition();
  const fecha = today();

  useEffect(() => {
    if (!sucursalId) { setVista(null); return; }
    startLoading(async () => {
      const result = await previsualizarCierre(empresaId, sucursalId, fecha);
      if ("error" in result) { setError(result.error); setVista(null); } else { setError(""); setVista(result); }
    });
  }, [empresaId, sucursalId, fecha]);

  const cierreDeHoy = useMemo(() => cierres.find((c) => c.sucursal_id === sucursalId && c.fecha === fecha), [cierres, sucursalId, fecha]);
  const transferencias = vista ? vista.cobro_transferencia_pichincha + vista.cobro_transferencia_guayaquil + vista.cobro_transferencia_internacional : 0;

  return <section className="glass agenda-board caja-resumen-hoy" style={{ marginBottom: 18 }}>
    <div className="agenda-toolbar">
      <div><p className="section-label">HOY · {formatDate(fecha)}</p><h2>Resumen de caja</h2></div>
      {branches.length > 1 && <select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>}
    </div>
    {!sucursalId ? <p className="field-hint">No hay sucursales para revisar.</p> : loading ? <p className="field-hint">Calculando…</p> : error ? <p className="notice">{error}</p> : vista && <>
      {cierreDeHoy ? <div className={`caja-estado ${cierreDeHoy.cuadre_correcto ? "ok" : "fail"}`}>{cierreDeHoy.cuadre_correcto ? <CheckCircle2 size={19} /> : <XCircle size={19} />}<span>{cierreDeHoy.cuadre_correcto ? "Caja cuadrada" : `Caja no cuadrada · Diferencia ${money(cierreDeHoy.diferencia)}`}</span></div> : <div className="caja-estado pending"><AlertCircle size={19} /><span>Aún no se ha cerrado la caja de hoy — estos son los valores registrados hasta el momento.</span></div>}
      <div className="caja-resumen-grid">
        <div><span className="section-label">Caja de partida</span><strong>{money(vista.caja_anterior)}</strong><small>{origenCaja(vista)}</small></div>
        <div><span className="section-label">Efectivo de hoy</span><strong>{money(cierreDeHoy ? cierreDeHoy.declarado_efectivo : vista.cobro_efectivo)}</strong></div>
        <div><span className="section-label">Tarjetas</span><strong>{money(cierreDeHoy ? cierreDeHoy.declarado_tarjeta : vista.cobro_tarjeta)}</strong></div>
        <div><span className="section-label">Transferencias (todos los bancos)</span><strong>{money(cierreDeHoy ? (cierreDeHoy.declarado_transferencia_pichincha + cierreDeHoy.declarado_transferencia_guayaquil + cierreDeHoy.declarado_transferencia_internacional) : transferencias)}</strong></div>
      </div>
      {!cierreDeHoy && <>
        <p className="field-hint" style={{ marginTop: 10 }}>Estos valores se calculan solos con las ventas y abonos del día. Para anotar lo que contaste (efectivo, tarjetas y transferencias por banco), pulsa el botón.</p>
        <button className="new-consultation" type="button" style={{ marginTop: 8 }} onClick={() => onNuevoCuadre(sucursalId)}>Anotar valores y cerrar caja</button>
      </>}
    </>}
  </section>;
}

function CheckBadge({ label, value }: { label: string; value: boolean | null }) {
  const cls = value === null ? "na" : value ? "ok" : "fail";
  const text = value === null ? "N/A" : value ? "OK" : "Revisar";
  return <span className={`check-badge ${cls}`}>{label}: {text}</span>;
}

function CierreCard({ cierre, sucursalNombre }: { cierre: CierreCaja; sucursalNombre: string }) {
  const transferencias = cierre.declarado_transferencia_pichincha + cierre.declarado_transferencia_guayaquil + cierre.declarado_transferencia_internacional;
  return <article className="task-card"><div className="task-status"><span className={`status-dot ${cierre.cuadre_correcto ? "aprobada" : "devuelta"}`} /></div><div className="task-main"><div className="task-meta"><span>{sucursalNombre}</span><strong>Cierre del {formatDate(cierre.fecha)}</strong></div><h2>Caja física: {money(cierre.caja_fisica)} · Esperada: {money(cierre.caja_esperada)}</h2><p>Caja anterior: {money(cierre.caja_anterior)} · Efectivo declarado: {money(cierre.declarado_efectivo)} · Tarjetas: {money(cierre.declarado_tarjeta)} · Transferencias: {money(transferencias)}</p><p>Egresos efectivo: {money(cierre.egresos_efectivo)} · Depósitos: {money(cierre.depositos)} · Diferencia de caja: {money(cierre.diferencia)}</p><div className="check-badges"><CheckBadge label="Métodos de pago" value={cierre.check_metodos_pago} /><CheckBadge label="Efectivo en caja" value={cierre.check_caja_fisica} /></div></div><div className="task-actions"><span className={`state-pill ${cierre.cuadre_correcto ? "aprobada" : "devuelta"}`}>{cierre.cuadre_correcto ? "Caja cuadrada" : "Caja no cuadrada"}</span></div></article>;
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

function CierreModal({ empresaId, branches, initialSucursalId, onClose }: { empresaId: string; branches: CajaData["branches"]; initialSucursalId: string; onClose: (message?: string) => void }) {
  const [sucursalId, setSucursalId] = useState(branches.some((b) => b.id === initialSucursalId) ? initialSucursalId : branches[0]?.id ?? "");
  const [fecha, setFecha] = useState(today());
  const [declaradoEfectivo, setDeclaradoEfectivo] = useState("");
  const [declaradoTarjeta, setDeclaradoTarjeta] = useState("");
  const [declaradoPichincha, setDeclaradoPichincha] = useState("");
  const [declaradoGuayaquil, setDeclaradoGuayaquil] = useState("");
  const [declaradoInternacional, setDeclaradoInternacional] = useState("");
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
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setVista(null); setVistaError("");
    if (!sucursalId || !fecha) return;
    startVista(async () => {
      try {
        const result = await previsualizarCierre(empresaId, sucursalId, fecha);
        if (cancelled) return;
        if ("error" in result) setVistaError(result.error); else setVista(result);
      } catch { if (!cancelled) setVistaError("No se pudo cargar la vista previa."); }
    });
    return () => { cancelled = true; };
  }, [sucursalId, fecha, empresaId, revision]);

  const depositosTotal = (Number(depositoPichincha) || 0) + (Number(depositoGuayaquil) || 0) + (Number(depositoInternacional) || 0);
  const cajaEsperadaPreview = vista ? vista.caja_anterior + vista.cobro_efectivo - vista.egresos_efectivo - depositosTotal : null;
  const diferenciaPreview = cajaEsperadaPreview !== null && cajaFisica !== "" ? Number(cajaFisica) - cajaEsperadaPreview : null;
  const abonosTotal = vista ? vista.cobro_efectivo + vista.cobro_tarjeta + vista.cobro_transferencia_pichincha + vista.cobro_transferencia_guayaquil + vista.cobro_transferencia_internacional + vista.cobro_credito + vista.cobro_otro : 0;
  const metodosCompletos = [declaradoEfectivo, declaradoTarjeta, declaradoPichincha, declaradoGuayaquil, declaradoInternacional].every((value) => value !== "");
  const metodosCoinciden = !!vista && metodosCompletos && [
    [declaradoEfectivo, vista.cobro_efectivo],
    [declaradoTarjeta, vista.cobro_tarjeta],
    [declaradoPichincha, vista.cobro_transferencia_pichincha],
    [declaradoGuayaquil, vista.cobro_transferencia_guayaquil],
    [declaradoInternacional, vista.cobro_transferencia_internacional],
  ].every(([declarado, sistema]) => Math.abs(Number(declarado) - Number(sistema)) < 0.01);
  const cierreCompleto = metodosCompletos && cajaFisica !== "";
  const cierreCuadrado = cierreCompleto && metodosCoinciden && diferenciaPreview !== null && Math.abs(diferenciaPreview) < 0.01;

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

  if (resultado) return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => onClose(resultado.cuadre_correcto ? "Caja cuadrada." : "Caja no cuadrada — revisa las diferencias.")} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">Cierre del {formatDate(fecha)}</p>
    {resultado.cuadre_correcto ? <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "20px 0" }}><CheckCircle2 size={48} color="#247658" /><h2 style={{ margin: 0 }}>Caja cuadrada</h2><p className="field-hint">El efectivo, las tarjetas y las transferencias coinciden con el sistema.</p></div>
      : <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "20px 0" }}><XCircle size={48} color="#a24150" /><h2 style={{ margin: 0 }}>Caja no cuadrada</h2><p className="field-hint">Diferencia en efectivo: <strong>{money(resultado.diferencia)}</strong>. Diferencia en métodos de pago: <strong>{money(resultado.diferencia_cobros_declarados)}</strong>. El cierre quedó registrado para revisión.</p></div>}
    <div className="modal-actions"><button className="new-consultation" type="button" onClick={() => onClose(resultado.cuadre_correcto ? "Caja cuadrada." : "Caja no cuadrada — revisa las diferencias.")}>Listo</button></div>
  </section></div>;

  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="new-cierre-title"><button className="modal-close" onClick={() => onClose()} aria-label="Cerrar"><X size={19} /></button><p className="section-label">CIERRE DE CAJA</p><h2 id="new-cierre-title">Cuadre del {fechaCuadre(fecha)}</h2><p>Ingresa lo recibido por cada método de pago y el efectivo contado. El sistema lo comparará con las ventas registradas.</p>{vista && !loadingVista && <AperturaCaja key={`${empresaId}:${sucursalId}:${fecha}:${revision}`} empresaId={empresaId} sucursalId={sucursalId} fecha={fecha} vista={vista} onSaved={() => { setVista(null); setRevision((value) => value + 1); }} />}<form onSubmit={submit}><input type="hidden" name="empresa_id" value={empresaId} /><div className="new-patient-form">
    <label>Sucursal<select name="sucursal_id" required value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}><option value="" disabled>Selecciona la sucursal</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
    <label>Fecha<input name="fecha" type="date" required value={fecha} onChange={(event) => setFecha(event.target.value)} /></label>
  </div>

  {sucursalId && <div className="glass clinical-card" style={{ minHeight: "auto", margin: "14px 0", padding: 16 }}>
    {loadingVista && <p className="field-hint">Calculando…</p>}
    {vistaError && <p className="notice">{vistaError}</p>}
    {vista && <>
      {vista.ya_existe && <p className="notice">Ya existe un cuadre guardado para esta sucursal y fecha.</p>}

      <p className="section-label">RESUMEN DEL DÍA</p>
      <div className="consultation-stats"><span><strong>Abonos del día</strong>{money(abonosTotal)}</span><span><strong>Egresos del día</strong>{money(vista.egresos_efectivo)}</span></div>

      <p className="section-label" style={{ marginTop: 14 }}>VALORES REGISTRADOS EN EL SISTEMA</p>
      <div className="consultation-stats"><span><strong>Efectivo</strong>{money(vista.cobro_efectivo)}</span><span><strong>Tarjetas</strong>{money(vista.cobro_tarjeta)}</span><span><strong>Pichincha</strong>{money(vista.cobro_transferencia_pichincha)}</span><span><strong>Guayaquil</strong>{money(vista.cobro_transferencia_guayaquil)}</span><span><strong>Internacional</strong>{money(vista.cobro_transferencia_internacional)}</span></div>

      {(vista.cobro_credito > 0 || vista.cobro_otro > 0) && <div className="consultation-stats" style={{ marginTop: 8 }}><span><strong>Crédito / otro</strong>{money(vista.cobro_credito + vista.cobro_otro)}</span></div>}
    </>}
  </div>}

  <p className="section-label" style={{ marginTop: 14 }}>VALORES RECIBIDOS SEGÚN EL CIERRE</p>
  <div className="new-patient-form">
    <label>Efectivo recibido<input name="declarado_efectivo" type="text" inputMode="decimal" autoComplete="off" required placeholder={vista ? `Sistema: ${money(vista.cobro_efectivo)}` : "0.00"} value={declaradoEfectivo} onChange={(event) => setDeclaradoEfectivo(montoInput(event.target.value))} /></label>
    <label>Tarjetas<input name="declarado_tarjeta" type="text" inputMode="decimal" autoComplete="off" required placeholder={vista ? `Sistema: ${money(vista.cobro_tarjeta)}` : "0.00"} value={declaradoTarjeta} onChange={(event) => setDeclaradoTarjeta(montoInput(event.target.value))} /></label>
    <label>Transferencia · Banco Pichincha<input name="declarado_transferencia_pichincha" type="text" inputMode="decimal" autoComplete="off" required placeholder={vista ? `Sistema: ${money(vista.cobro_transferencia_pichincha)}` : "0.00"} value={declaradoPichincha} onChange={(event) => setDeclaradoPichincha(montoInput(event.target.value))} /></label>
    <label>Transferencia · Banco Guayaquil<input name="declarado_transferencia_guayaquil" type="text" inputMode="decimal" autoComplete="off" required placeholder={vista ? `Sistema: ${money(vista.cobro_transferencia_guayaquil)}` : "0.00"} value={declaradoGuayaquil} onChange={(event) => setDeclaradoGuayaquil(montoInput(event.target.value))} /></label>
    <label>Transferencia · Banco Internacional<input name="declarado_transferencia_internacional" type="text" inputMode="decimal" autoComplete="off" required placeholder={vista ? `Sistema: ${money(vista.cobro_transferencia_internacional)}` : "0.00"} value={declaradoInternacional} onChange={(event) => setDeclaradoInternacional(montoInput(event.target.value))} /></label>
  </div>
  {metodosCompletos && <p className="notice" style={{ marginTop: 8 }}><span className={`check-badge ${metodosCoinciden ? "ok" : "fail"}`}>{metodosCoinciden ? "Los métodos de pago coinciden" : "Hay diferencias en los métodos de pago"}</span></p>}

  <p className="section-label" style={{ marginTop: 14 }}>DEPÓSITO EN CADA BANCO (SI APLICA)</p>
  <div className="new-patient-form">
    <label>Banco Pichincha<input name="deposito_pichincha" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={depositoPichincha} onChange={(event) => setDepositoPichincha(montoInput(event.target.value))} /></label>
    <label>Banco Guayaquil<input name="deposito_guayaquil" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={depositoGuayaquil} onChange={(event) => setDepositoGuayaquil(montoInput(event.target.value))} /></label>
    <label>Banco Internacional<input name="deposito_internacional" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={depositoInternacional} onChange={(event) => setDepositoInternacional(montoInput(event.target.value))} /></label>
  </div>

  <p className="section-label" style={{ marginTop: 14 }}>EFECTIVO CONTADO EN CAJA</p>
  <div className="new-patient-form">
    <label>¿Cuánto dinero hay en efectivo?<input name="caja_fisica" type="text" inputMode="decimal" autoComplete="off" required value={cajaFisica} onChange={(event) => setCajaFisica(montoInput(event.target.value))} /></label>
    {cajaEsperadaPreview !== null && <label>Caja esperada<input value={money(cajaEsperadaPreview)} disabled /></label>}
  </div>
  {cierreCompleto && <p className="notice" style={{ marginTop: 8 }}><span className={`check-badge ${cierreCuadrado ? "ok" : "fail"}`}>{cierreCuadrado ? "Caja cuadrada" : `Caja no cuadrada${diferenciaPreview !== null && Math.abs(diferenciaPreview) >= 0.01 ? ` · Diferencia en efectivo: ${money(diferenciaPreview)}` : ""}`}</span></p>}

  <div className="new-patient-form" style={{ marginTop: 14 }}><label className="task-description">Observaciones<textarea name="observaciones" value={observaciones} onChange={(event) => setObservaciones(event.target.value)} /></label></div>
  {guardarError && <p className="notice">{guardarError}</p>}
  <div className="modal-actions"><button className="outline-action" type="button" onClick={() => onClose()}>Cancelar</button><button className="new-consultation" disabled={guardando || loadingVista || !vista || vista.ya_existe} type="submit">{guardando ? "Guardando…" : vista?.ya_existe ? "Cierre ya registrado" : "Registrar cierre"}</button></div></form></section></div>;
}

function AperturaCaja({ empresaId, sucursalId, fecha, vista, onSaved }: { empresaId: string; sucursalId: string; fecha: string; vista: VistaCierre; onSaved: () => void }) {
  const anterior = new Date(`${fecha}T12:00:00Z`);
  anterior.setUTCDate(anterior.getUTCDate() - 1);
  const tieneApertura = vista.origen_caja_anterior === "apertura" && vista.fecha_caja_anterior === fecha;
  const tieneCierreAyer = vista.origen_caja_anterior === "cierre" && vista.fecha_caja_anterior === anterior.toISOString().slice(0, 10);
  const [abierta, setAbierta] = useState(!tieneApertura && !tieneCierreAyer);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <section className="glass clinical-card" style={{ minHeight: "auto", margin: "14px 0", padding: 16 }}>
    <p className="section-label">Caja de partida</p><h2>{money(vista.caja_anterior)}</h2><p>{origenCaja(vista)}</p>
    {!vista.ya_existe && <>
      <button className="text-action" type="button" onClick={() => setAbierta(true)}>Corregir apertura</button>
      {abierta && <form onSubmit={async (event) => {
        event.preventDefault(); setPending(true); setError("");
        const form = new FormData(event.currentTarget);
        try { await registrarAperturaCaja(form); onSaved(); }
        catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar la apertura."); }
        finally { setPending(false); }
      }}>
        <h3>Apertura de caja — ¿Con cuánto efectivo abrió hoy la caja?</h3><p>Fecha de apertura: <strong>{formatDate(fecha)}</strong></p>
        <input type="hidden" name="empresa_id" value={empresaId} /><input type="hidden" name="sucursal_id" value={sucursalId} /><input type="hidden" name="fecha" value={fecha} />
        <div className="new-patient-form"><label>Monto de apertura<input name="monto" type="text" inputMode="decimal" autoComplete="off" required defaultValue={tieneApertura ? vista.caja_anterior : ""} /></label><label>Nota (opcional)<input name="observaciones" /></label></div>
        {error && <p className="notice" role="alert">{error}</p>}
        <button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar apertura"}</button>
      </form>}
    </>}
  </section>;
}
