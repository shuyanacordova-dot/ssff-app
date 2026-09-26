"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronLeft, ChevronRight, History, LockKeyhole, Pencil, Plus, Wallet, X } from "lucide-react";
import type { PrivateAdminData } from "@/lib/mi-espacio";
import { atrasadas, avance, cuotasPagadas, fechaCorta, hoyEcuador, itemsDelMes, mesDe, modalidades, money, nombreMes, pagosDelMes, proximoPago, sumarMeses, tipos, type BusinessDebt, type ItemMes, type ModalidadDeuda, type TipoDeuda } from "@/lib/mis-deudas-calc";
import { actualizarDeuda, archivarDeuda, crearDeuda, registrarPagoDeuda } from "./actions";
import s from "./mis-deudas.module.css";

const estadoTexto = { pagado: "Pagado", vencido: "Vencido", hoy: "Vence hoy", proximo: "Próximo" } as const;
const estadoClase = { pagado: s.pillPagado, vencido: s.pillVencido, hoy: s.pillHoy, proximo: s.pillProximo } as const;
const metodos = [{ value: "transferencia", label: "Transferencia" }, { value: "efectivo", label: "Efectivo" }, { value: "tarjeta", label: "Tarjeta" }, { value: "otro", label: "Otro" }];
const limpiarMonto = (v: string) => v.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
type Pago = { deuda: BusinessDebt; monto: number; periodo: string };

export default function PrivateAdminBoard(props: PrivateAdminData) {
  const router = useRouter();
  const hoy = hoyEcuador();
  const [mes, setMes] = useState(mesDe(hoy));
  const [filtro, setFiltro] = useState<TipoDeuda | "todas">("todas");
  const [nueva, setNueva] = useState(false);
  const [pagando, setPagando] = useState<Pago | null>(null);
  const [historial, setHistorial] = useState<BusinessDebt | null>(null);
  const [editando, setEditando] = useState<BusinessDebt | null>(null);
  const [vista, setVista] = useState<"todo" | "optica" | "personal">("todo");
  const [notice, setNotice] = useState(props.message ?? "");
  const [pending, start] = useTransition();

  const deudas = useMemo(() => props.debts.filter((d) => vista === "todo" || (vista === "personal" ? d.ambito === "personal" : d.ambito !== "personal")), [props.debts, vista]);
  const activas = useMemo(() => deudas.filter((d) => d.estado === "pendiente"), [deudas]);
  const items = useMemo(() => itemsDelMes(deudas, mes, hoy), [deudas, mes, hoy]);
  const atraso = useMemo(() => atrasadas(deudas, mes, hoy), [deudas, mes, hoy]);

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">ESPACIO PRIVADO</p><h1>Mis deudas</h1><p className="subtitle">{props.message}</p></div></header><div className="notice"><LockKeyhole size={18} /><span>Este apartado es solo para la Superadministradora.</span></div></div></main>;

  const aPagar = items.filter((i) => i.estado !== "pagado").reduce((sum, i) => sum + i.monto, 0);
  const pagadoMes = deudas.reduce((sum, d) => sum + pagosDelMes(d, mes).reduce((a, p) => a + Number(p.monto), 0), 0);
  const vencido = [...atraso, ...items.filter((i) => i.estado === "vencido")].reduce((sum, i) => sum + i.monto, 0);
  const deudaTotal = activas.filter((d) => d.modalidad !== "mensual").reduce((sum, d) => sum + Number(d.saldo), 0);
  const listaTipo = activas.filter((d) => filtro === "todas" || d.tipo === filtro);

  const archivar = (d: BusinessDebt) => {
    if (!window.confirm(`¿Archivar "${d.proveedor}"? Ya no aparecerá en tus pagos.`)) return;
    start(async () => { const r = await archivarDeuda(d.id); setNotice(r.ok ? `"${d.proveedor}" archivada.` : r.error); if (r.ok) router.refresh(); });
  };

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header">
      <div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">ESPACIO PRIVADO · SOLO PARA TI</p><h1>Mis deudas</h1><p className="subtitle">Lo que debe la óptica y cuándo toca pagarlo.</p></div>
      <button className="new-task" type="button" onClick={() => setNueva(true)}><Plus size={18} /> Nueva deuda</button>
    </header>
    {notice && <div className="notice"><LockKeyhole size={18} /><span>{notice}</span></div>}

    <div className="tabs" style={{ marginBottom: 10 }}>{([["todo", "Todo"], ["optica", "Óptica"], ["personal", "Personal Shu"]] as const).map(([v, label]) => <button key={v} type="button" className={vista === v ? "active" : ""} onClick={() => setVista(v)}>{label}</button>)}</div>
    <div className={s.monthNav}>
      <button type="button" onClick={() => setMes(sumarMeses(mes, -1))} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
      <span className={s.monthName}>{nombreMes(mes)}</span>
      <button type="button" onClick={() => setMes(sumarMeses(mes, 1))} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
      {mes !== mesDe(hoy) && <button type="button" onClick={() => setMes(mesDe(hoy))}>Volver a este mes</button>}
    </div>

    <section className={s.cards}>
      <div className={`${s.card} ${s.cardTeal}`}><span>Por pagar este mes</span><strong>{money(aPagar)}</strong><small>{items.filter((i) => i.estado !== "pagado").length} pago(s) pendiente(s)</small></div>
      <div className={`${s.card} ${s.cardGreen}`}><span>Pagado este mes</span><strong>{money(pagadoMes)}</strong><small>{items.filter((i) => i.estado === "pagado").length} pago(s) al día</small></div>
      <div className={`${s.card} ${s.cardRed}`}><span>Vencido</span><strong>{money(vencido)}</strong><small>{atraso.length + items.filter((i) => i.estado === "vencido").length} pago(s) atrasado(s)</small></div>
      <div className={`${s.card} ${s.cardNavy}`}><span>Deuda total</span><strong>{money(deudaTotal)}</strong><small>{activas.length} deuda(s) activa(s)</small></div>
    </section>

    <section className="glass agenda-board" style={{ marginBottom: 18 }}>
      <div className={s.sectionTitle}><h2>Pagos de {nombreMes(mes)}</h2><span className="field-hint">Del más próximo al más lejano</span></div>
      {atraso.length > 0 && <><p className="section-label" style={{ color: "#a24150" }}>ATRASADOS DE MESES ANTERIORES</p><div className={s.timeline} style={{ marginBottom: 14 }}>{atraso.map((i) => <FilaPago key={`${i.deuda.id}-${i.periodo}`} item={i} onPagar={() => setPagando({ deuda: i.deuda, monto: i.monto, periodo: i.periodo })} />)}</div></>}
      {items.length ? <div className={s.timeline}>{items.map((i) => <FilaPago key={`${i.deuda.id}-${i.periodo}`} item={i} onPagar={() => setPagando({ deuda: i.deuda, monto: i.monto, periodo: i.periodo })} />)}</div>
        : <p className={s.empty}>No hay pagos programados para este mes. {deudas.length === 0 && "Empieza con “Nueva deuda”."}</p>}
    </section>

    <section className="glass agenda-board">
      <div className={s.sectionTitle}><h2>Todas mis deudas</h2></div>
      <div className="tabs" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" className={filtro === "todas" ? "active" : ""} onClick={() => setFiltro("todas")}>Todas ({activas.length})</button>
        {(Object.keys(tipos) as TipoDeuda[]).map((t) => <button key={t} type="button" className={filtro === t ? "active" : ""} onClick={() => setFiltro(t)}>{tipos[t].plural} ({activas.filter((d) => d.tipo === t).length})</button>)}
      </div>
      {listaTipo.length ? <div className={s.grid}>{listaTipo.map((d) => <TarjetaDeuda key={d.id} deuda={d} empresa={d.ambito === "personal" ? "Personal Shu" : props.companies.find((c) => c.id === d.empresa_id)?.nombre} pending={pending} onEditar={() => setEditando(d)} onPagar={() => { const p = proximoPago(d, hoy); setPagando({ deuda: d, monto: p?.monto ?? Number(d.saldo), periodo: p ? mesDe(p.fecha) : mesDe(hoy) }); }} onHistorial={() => setHistorial(d)} onArchivar={() => archivar(d)} />)}</div>
        : <p className={s.empty}>No hay deudas activas en esta categoría.</p>}
    </section>

    {nueva && <NuevaDeuda companies={props.companies} onClose={() => setNueva(false)} onSaved={(m) => { setNotice(m); setNueva(false); router.refresh(); }} />}
    {pagando && <PagarDeuda pago={pagando} branches={props.branches} onClose={() => setPagando(null)} onSaved={(m) => { setNotice(m); setPagando(null); router.refresh(); }} />}
    {historial && <Historial deuda={historial} onClose={() => setHistorial(null)} />}
    {editando && <EditarDeuda deuda={editando} companies={props.companies} onClose={() => setEditando(null)} onSaved={(m) => { setNotice(m); setEditando(null); router.refresh(); }} />}
  </div></main>;
}

function TipoTag({ tipo }: { tipo: TipoDeuda }) {
  return <span className={s.tipoTag} style={{ color: tipos[tipo].color, background: tipos[tipo].fondo }}>{tipos[tipo].label}</span>;
}

function FilaPago({ item, onPagar }: { item: ItemMes; onPagar: () => void }) {
  const t = tipos[item.deuda.tipo];
  const [, mm, dd] = item.fecha.split("-");
  const mesCorto = new Intl.DateTimeFormat("es-EC", { month: "short", timeZone: "UTC" }).format(new Date(`${item.fecha}T12:00:00Z`));
  return <article className={`${s.row} ${item.estado === "pagado" ? s.rowPaid : ""}`}>
    <div className={s.day}><strong>{dd}</strong><small>{mesCorto || mm}</small></div>
    <div className={s.bar} style={{ background: t.color }} />
    <div className={s.info}><h3>{item.deuda.proveedor}</h3><p><TipoTag tipo={item.deuda.tipo} />{item.deuda.ambito === "personal" && <span className={s.tipoTag} style={{ color: "#5a4a8a", background: "#efeafb", marginLeft: 4 }}>Personal</span>} {item.etiqueta}{!item.deuda.dia_pago && item.deuda.modalidad !== "libre" ? " · día por confirmar" : ""}{item.deuda.concepto && item.deuda.concepto !== item.deuda.proveedor ? ` · ${item.deuda.concepto}` : ""}</p></div>
    <div className={s.right}><span className={s.amount}>{money(item.monto)}</span><span className={`${s.pill} ${estadoClase[item.estado]}`}>{estadoTexto[item.estado]}</span>{item.estado !== "pagado" && <button className="new-consultation" type="button" onClick={onPagar}>Pagar</button>}</div>
  </article>;
}

function TarjetaDeuda({ deuda, empresa, pending, onPagar, onHistorial, onArchivar, onEditar }: { deuda: BusinessDebt; empresa?: string; pending: boolean; onPagar: () => void; onHistorial: () => void; onArchivar: () => void; onEditar: () => void }) {
  const t = tipos[deuda.tipo];
  const prox = proximoPago(deuda);
  const pct = Math.round(avance(deuda) * 100);
  return <article className={s.debt}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><TipoTag tipo={deuda.tipo} /><span className="field-hint">{empresa ?? "General"}</span></div>
    <div><h3>{deuda.proveedor}</h3>{deuda.concepto && deuda.concepto !== deuda.proveedor && <p>{deuda.concepto}</p>}</div>
    {deuda.modalidad === "mensual"
      ? <><span className={s.saldo}>{money(Number(deuda.monto_cuota))}<small style={{ fontSize: 13, fontWeight: 700, color: "#66768b" }}> / mes</small></span><p>Se paga el día {deuda.dia_pago} de cada mes</p></>
      : <><span className={s.saldo}>{money(Number(deuda.saldo))}<small style={{ fontSize: 13, fontWeight: 700, color: "#66768b" }}> por pagar</small></span>
        <div className={s.progress}><div style={{ width: `${pct}%`, background: t.color }} /></div>
        <p>{deuda.modalidad === "cuotas" ? `${cuotasPagadas(deuda)} de ${deuda.cuotas_total} cuotas pagadas · cuota ${money(Number(deuda.monto_cuota))}` : `Pagado ${money(deuda.monto_original - Number(deuda.saldo))} de ${money(deuda.monto_original)} (${pct}%)`}</p></>}
    {prox && <p><strong>Próximo pago:</strong> {deuda.dia_pago ? fechaCorta(prox.fecha) : `${nombreMes(prox.fecha.slice(0, 7))} (día por confirmar)`} · {money(prox.monto)}</p>}
    {deuda.notas && <p style={{ color: "#8a5a00" }}>{deuda.notas}</p>}
    <div className={s.actions}>
      <button className="new-consultation" type="button" onClick={onPagar}><Wallet size={14} /> Pagar</button>
      <button className="outline-action" type="button" onClick={onHistorial}><History size={14} /> Pagos</button>
      <button className="outline-action" type="button" onClick={onEditar}><Pencil size={14} /> Editar</button>
      <button className="outline-action" type="button" disabled={pending} onClick={onArchivar} title="Ya no aplica o se terminó"><Archive size={14} /> Archivar</button>
    </div>
  </article>;
}

function NuevaDeuda({ companies, onClose, onSaved }: { companies: PrivateAdminData["companies"]; onClose: () => void; onSaved: (m: string) => void }) {
  const [tipo, setTipo] = useState<TipoDeuda | null>(null);
  const [modalidad, setModalidad] = useState<ModalidadDeuda>("libre");
  const [cuota, setCuota] = useState(""); const [nCuotas, setNCuotas] = useState(""); const [previas, setPrevias] = useState("0");
  const [total, setTotal] = useState(""); const [saldo, setSaldo] = useState("");
  const [error, setError] = useState(""); const [pending, start] = useTransition();
  const elegir = (t: TipoDeuda) => { setTipo(t); setModalidad(tipos[t].modalidad); };
  const totalCuotas = (Number(cuota) || 0) * (Number(nCuotas) || 0);
  const saldoCuotas = (Number(cuota) || 0) * Math.max(0, (Number(nCuotas) || 0) - (Number(previas) || 0));
  const submit = (form: HTMLFormElement) => start(async () => {
    setError("");
    const data = new FormData(form); data.set("tipo", tipo ?? ""); data.set("modalidad", modalidad);
    const r = await crearDeuda(data);
    if (!r.ok) { setError(r.error); return; }
    onSaved(`Deuda "${data.get("proveedor")}" registrada.`);
  });
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" style={{ width: "min(640px, 100%)" }}>
    <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">NUEVA DEUDA</p><h2>{tipo ? tipos[tipo].label : "¿Qué tipo de deuda es?"}</h2>
    <div className={s.tiles}>{(Object.keys(tipos) as TipoDeuda[]).map((t) => <button key={t} type="button" className={`${s.tile} ${tipo === t ? s.tileActive : ""}`} style={{ background: tipos[t].fondo, color: tipos[t].color }} onClick={() => elegir(t)}><strong>{tipos[t].label}</strong><small>{tipos[t].ayuda}</small></button>)}</div>
    {tipo && <form onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
      <div className="new-patient-form" style={{ marginTop: 12 }}>
        <label>{tipo === "gasto_fijo" ? "¿Qué se paga?" : "¿A quién le debes?"}<input name="proveedor" required placeholder={tipo === "gasto_fijo" ? "Ej.: Arriendo local Shushufindi" : tipo === "prestamo_banco" ? "Ej.: Banco Pichincha" : "Ej.: Optec"} /></label>
        <label>Detalle (opcional)<input name="concepto" placeholder={tipo === "gasto_fijo" ? "Ej.: Internet CNT" : "Ej.: Lunas de agosto"} /></label>
        <label>¿De quién es la deuda?<select name="empresa_id" defaultValue=""><option value="">General (las 3 sucursales)</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}<option value="personal">Personal (Shu)</option></select></label>
        {tipo !== "gasto_fijo" && <label>¿Cómo se paga?<select value={modalidad} onChange={(e) => setModalidad(e.target.value as ModalidadDeuda)}><option value="cuotas">{modalidades.cuotas}</option><option value="libre">{modalidades.libre}</option></select></label>}
      </div>
      {modalidad === "cuotas" && <div className="new-patient-form" style={{ marginTop: 12 }}>
        <label>Valor de cada cuota $<input name="monto_cuota" inputMode="decimal" required value={cuota} onChange={(e) => setCuota(limpiarMonto(e.target.value))} /></label>
        <label>Número total de cuotas<input name="cuotas_total" inputMode="numeric" required value={nCuotas} onChange={(e) => setNCuotas(e.target.value.replace(/\D/g, ""))} /></label>
        <label>Día de pago (1–31)<input name="dia_pago" inputMode="numeric" required placeholder="Ej.: 5" /></label>
        <label>Mes de la primera cuota<input name="primera_cuota" type="month" required /></label>
        <label>Cuotas ya pagadas antes de hoy<input name="cuotas_previas" inputMode="numeric" value={previas} onChange={(e) => setPrevias(e.target.value.replace(/\D/g, ""))} /></label>
        {totalCuotas > 0 && <p className={s.summaryLine} style={{ gridColumn: "1 / -1" }}>Total del crédito {money(totalCuotas)} · te falta pagar {money(saldoCuotas)}</p>}
      </div>}
      {modalidad === "libre" && <div className="new-patient-form" style={{ marginTop: 12 }}>
        <label>Monto total de la deuda $<input name="monto_original" inputMode="decimal" required value={total} onChange={(e) => setTotal(limpiarMonto(e.target.value))} /></label>
        <label>Saldo que falta pagar $<input name="saldo" inputMode="decimal" value={saldo} placeholder={total ? `Si no pagaste nada: ${total}` : ""} onChange={(e) => setSaldo(limpiarMonto(e.target.value))} /></label>
        <label>Fecha límite (opcional)<input name="fecha_vencimiento" type="date" /></label>
      </div>}
      {modalidad === "mensual" && <div className="new-patient-form" style={{ marginTop: 12 }}>
        <label>Monto mensual $<input name="monto_cuota" inputMode="decimal" required value={cuota} onChange={(e) => setCuota(limpiarMonto(e.target.value))} /></label>
        <label>Día de pago (1–31)<input name="dia_pago" inputMode="numeric" required placeholder="Ej.: 1" /></label>
        <label>Desde el mes<input name="desde" type="month" defaultValue={mesDe(hoyEcuador())} /></label>
      </div>}
      <div className="new-patient-form" style={{ marginTop: 12 }}><label className="task-description" style={{ gridColumn: "1 / -1" }}>Notas (opcional)<textarea name="notas" /></label></div>
      {error && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar deuda"}</button></div>
    </form>}
  </section></div>;
}

function PagarDeuda({ pago, branches, onClose, onSaved }: { pago: Pago; branches: PrivateAdminData["branches"]; onClose: () => void; onSaved: (m: string) => void }) {
  const d = pago.deuda;
  const [monto, setMonto] = useState(pago.monto.toFixed(2));
  const [metodo, setMetodo] = useState("transferencia");
  const [egreso, setEgreso] = useState(false);
  const [error, setError] = useState(""); const [pending, start] = useTransition();
  const submit = (form: HTMLFormElement) => start(async () => {
    setError("");
    const data = new FormData(form); data.set("deuda_id", d.id); if (!egreso) data.delete("egreso_sucursal");
    const r = await registrarPagoDeuda(data);
    if (!r.ok) { setError(r.error); return; }
    onSaved(`Pago de ${money(Number(monto))} a "${d.proveedor}" registrado.${egreso ? " También quedó como egreso de caja." : ""}`);
  });
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true">
    <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">REGISTRAR PAGO</p><h2>{d.proveedor}</h2>
    <p><TipoTag tipo={d.tipo} /> {d.modalidad === "mensual" ? `${money(Number(d.monto_cuota))} al mes` : `Saldo actual ${money(Number(d.saldo))}`}</p>
    <form onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
      <div className="new-patient-form">
        <label>Monto $<input name="monto" inputMode="decimal" required value={monto} onChange={(e) => setMonto(limpiarMonto(e.target.value))} /></label>
        <label>Fecha de pago<input name="fecha_pago" type="date" defaultValue={hoyEcuador()} /></label>
        <label>Corresponde al mes<input name="periodo" type="month" defaultValue={pago.periodo} /></label>
        <label>Forma de pago<select name="metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)}>{metodos.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        <label>Referencia (opcional)<input name="referencia" placeholder="N.º de transferencia o recibo" /></label>
        <label>Nota (opcional)<input name="notas" /></label>
      </div>
      <label className="radio-row" style={{ marginTop: 12, fontWeight: 700, fontSize: 13 }}><input type="checkbox" checked={egreso} onChange={(e) => setEgreso(e.target.checked)} /> El dinero salió de la caja de una sucursal (registrar también como egreso de caja)</label>
      {egreso && <div className="new-patient-form" style={{ marginTop: 8 }}><label>Sucursal<select name="egreso_sucursal" required defaultValue=""><option value="" disabled>Selecciona</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label></div>}
      {error && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending || !(Number(monto) > 0)}>{pending ? "Guardando…" : "Registrar pago"}</button></div>
    </form>
  </section></div>;
}

function Historial({ deuda, onClose }: { deuda: BusinessDebt; onClose: () => void }) {
  const pagos = [...deuda.pagos_deuda_negocio].sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago));
  return <div className="modal-backdrop" onClick={onClose}><section className="new-patient-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">PAGOS REGISTRADOS</p><h2>{deuda.proveedor}</h2>
    {pagos.length ? <div className="task-list">{pagos.map((p) => <article className="task-card" key={p.id}><div className="task-main"><p style={{ margin: 0 }}><strong>{fechaCorta(p.fecha_pago)}</strong> · {metodos.find((m) => m.value === p.metodo)?.label ?? p.metodo}{p.periodo ? ` · mes ${nombreMes(p.periodo.slice(0, 7))}` : ""}{p.referencia ? ` · Ref. ${p.referencia}` : ""}</p>{p.notas && <p className="field-hint" style={{ margin: 0 }}>{p.notas}</p>}</div><div className="task-actions"><strong>{money(Number(p.monto))}</strong></div></article>)}</div>
      : <p className={s.empty}>Todavía no hay pagos registrados.</p>}
  </section></div>;
}

function EditarDeuda({ deuda, companies, onClose, onSaved }: { deuda: BusinessDebt; companies: PrivateAdminData["companies"]; onClose: () => void; onSaved: (m: string) => void }) {
  const [error, setError] = useState(""); const [pending, start] = useTransition();
  const destino = deuda.ambito === "personal" ? "personal" : deuda.empresa_id ?? "";
  const submit = (form: HTMLFormElement) => start(async () => {
    setError("");
    const data = new FormData(form); data.set("deuda_id", deuda.id); data.set("modalidad", deuda.modalidad);
    const r = await actualizarDeuda(data);
    if (!r.ok) { setError(r.error); return; }
    onSaved(`"${data.get("proveedor")}" actualizada.`);
  });
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" style={{ width: "min(620px, 100%)" }}>
    <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">EDITAR DEUDA · {modalidades[deuda.modalidad].toUpperCase()}</p><h2>{deuda.proveedor}</h2>
    <form onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
      <div className="new-patient-form">
        <label>{deuda.tipo === "gasto_fijo" ? "¿Qué se paga?" : "¿A quién le debes?"}<input name="proveedor" required defaultValue={deuda.proveedor} /></label>
        <label>Detalle<input name="concepto" defaultValue={deuda.concepto} /></label>
        <label>¿De quién es la deuda?<select name="empresa_id" defaultValue={destino}><option value="">General (las 3 sucursales)</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}<option value="personal">Personal (Shu)</option></select></label>
        {deuda.modalidad !== "libre" && <label>{deuda.modalidad === "mensual" ? "Monto mensual $" : "Valor de cada cuota $"}<input name="monto_cuota" inputMode="decimal" required defaultValue={deuda.monto_cuota ?? ""} /></label>}
        {deuda.modalidad !== "libre" && <label>Día de pago (1–31)<input name="dia_pago" inputMode="numeric" defaultValue={deuda.dia_pago ?? ""} placeholder="Vacío = por confirmar" /></label>}
        {deuda.modalidad === "cuotas" && <label>Número total de cuotas<input name="cuotas_total" inputMode="numeric" required defaultValue={deuda.cuotas_total ?? ""} /></label>}
        {deuda.modalidad === "cuotas" && <label>Cuotas pagadas antes de LumOS<input name="cuotas_previas" inputMode="numeric" defaultValue={deuda.cuotas_previas} /></label>}
        {deuda.modalidad === "libre" && <label>Monto total $<input name="monto_original" inputMode="decimal" required defaultValue={deuda.monto_original} /></label>}
        {deuda.modalidad !== "mensual" && <label>Saldo que falta pagar $<input name="saldo" inputMode="decimal" required defaultValue={deuda.saldo} /></label>}
        {deuda.modalidad === "libre" && <label>Fecha límite (opcional)<input name="fecha_vencimiento" type="date" defaultValue={deuda.fecha_vencimiento ?? ""} /></label>}
        <label className="task-description" style={{ gridColumn: "1 / -1" }}>Notas<textarea name="notas" defaultValue={deuda.notas ?? ""} /></label>
      </div>
      {error && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</button></div>
    </form>
  </section></div>;
}
