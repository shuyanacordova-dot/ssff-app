"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Archive, ChevronLeft, ChevronRight, History, Landmark, LockKeyhole, Pencil, Plus, Wallet, X } from "lucide-react";
import type { PrivateAdminData } from "@/lib/mi-espacio";
import { atrasadas, avance, cuotasPagadas, fechaCorta, hoyEcuador, itemsDelMes, mesDe, modalidades, money, nombreMes, proximoPago, sumarMeses, tipos, type BusinessDebt, type ItemMes, type ModalidadDeuda, type TipoDeuda } from "@/lib/mis-deudas-calc";
import { actualizarDeuda, archivarDeuda, crearDeuda, registrarFacturaProveedor, registrarPagoDeuda } from "./actions";
import s from "./mis-deudas.module.css";

const estadoTexto = { pagado: "Pagado", vencido: "Vencido", hoy: "Vence hoy", proximo: "Próximo" } as const;
const estadoClase = { pagado: s.pillPagado, vencido: s.pillVencido, hoy: s.pillHoy, proximo: s.pillProximo } as const;
const metodos = [{ value: "transferencia", label: "Transferencia" }, { value: "efectivo", label: "Efectivo" }, { value: "tarjeta", label: "Tarjeta" }, { value: "otro", label: "Otro" }];
const bancoLabel: Record<string, string> = { pichincha: "Pichincha", guayaquil: "Guayaquil", internacional: "Internacional" };
const limpiarMonto = (v: string) => v.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
type Pago = { deuda: BusinessDebt; monto: number; periodo: string };

export default function PrivateAdminBoard(props: PrivateAdminData) {
  const router = useRouter();
  const hoy = hoyEcuador();
  const [mes, setMes] = useState(mesDe(hoy));
  
  const [nueva, setNueva] = useState<{ tipo?: TipoDeuda; destino: "optica" | "personal" } | null>(null);
  const [pagando, setPagando] = useState<Pago | null>(null);
  const [historial, setHistorial] = useState<BusinessDebt | null>(null);
  const [editando, setEditando] = useState<BusinessDebt | null>(null);
  const [facturando, setFacturando] = useState<BusinessDebt | null>(null);
  const [vista, setVista] = useState<"todo" | "optica" | "personal">("optica");
  const [notice, setNotice] = useState(props.message ?? "");
  const [pending, start] = useTransition();

  const deudas = useMemo(() => props.debts.filter((d) => vista === "todo" || (vista === "personal" ? d.ambito === "personal" : d.ambito !== "personal")), [props.debts, vista]);
  const activas = useMemo(() => deudas.filter((d) => d.estado === "pendiente"), [deudas]);
  const items = useMemo(() => itemsDelMes(deudas, mes, hoy), [deudas, mes, hoy]);
  const atraso = useMemo(() => atrasadas(deudas, mes, hoy), [deudas, mes, hoy]);

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">ESPACIO PRIVADO</p><h1>Mis deudas</h1><p className="subtitle">{props.message}</p></div></header><div className="notice"><LockKeyhole size={18} /><span>Este apartado es solo para la Superadministradora.</span></div></div></main>;

  // Recordatorio del cuadre de bancos: los sábados, o si pasó más de una semana desde el último.
  const diasDesdeCuadre = props.ultimoCuadreBanco ? Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${props.ultimoCuadreBanco}T12:00:00Z`)) / 86400000) : null;
  const tocaCuadre = props.ultimoCuadreBanco !== hoy && ((new Date(`${hoy}T12:00:00Z`).getUTCDay() === 6) || diasDesdeCuadre === null || diasDesdeCuadre > 7);


  const archivar = (d: BusinessDebt) => {
    if (!window.confirm("¿Quitar esta deuda? Se archiva y se conserva su historial de pagos.")) return;
    start(async () => { const r = await archivarDeuda(d.id); setNotice(r.ok ? `"${d.proveedor}" archivada.` : r.error); if (r.ok) router.refresh(); });
  };

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header">
      <div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">ESPACIO PRIVADO · SOLO PARA TI</p><h1>Mis deudas</h1><p className="subtitle">Pagos y deudas de Shuvisión y personales.</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="outline-action" href="/mi-espacio/bancos" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Landmark size={16} /> Cuadre de bancos</Link><button className="new-task" type="button" onClick={() => setNueva({ destino: vista === "personal" ? "personal" : "optica" })}><Plus size={18} /> Nueva deuda</button></div>
    </header>
    {notice && <div className="notice"><LockKeyhole size={18} /><span>{notice}</span></div>}
    {tocaCuadre && <Link href="/mi-espacio/bancos" className="notice" style={{ textDecoration: "none", fontWeight: 800 }}><Landmark size={18} /><span>{new Date(`${hoy}T12:00:00Z`).getUTCDay() === 6 ? "Hoy es sábado: toca el cuadre de bancos." : "Hace más de una semana que no cuadras los bancos."} Ábrelo aquí →</span></Link>}

    <div className="tabs" style={{ marginBottom: 10 }}>{([["optica", "Deudas Shuvisión"], ["personal", "Deudas personales"], ["todo", "Todo"]] as const).map(([v, label]) => <button key={v} type="button" className={vista === v ? "active" : ""} onClick={() => setVista(v)}>{label}</button>)}</div>
    <div className={s.monthNav}>
      <button type="button" onClick={() => setMes(sumarMeses(mes, -1))} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
      <span className={s.monthName}>{nombreMes(mes)}</span>
      <button type="button" onClick={() => setMes(sumarMeses(mes, 1))} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
      {mes !== mesDe(hoy) && <button type="button" onClick={() => setMes(mesDe(hoy))}>Volver a este mes</button>}
    </div>


    <section className="glass agenda-board" style={{ marginBottom: 18 }}>
      <div className={s.sectionTitle}><h2>Pagos de {nombreMes(mes)}</h2><span className="field-hint">Del más próximo al más lejano</span></div>
      {atraso.length > 0 && <><p className="section-label" style={{ color: "#a24150" }}>ATRASADOS DE MESES ANTERIORES</p><div className={s.timeline} style={{ marginBottom: 14 }}>{atraso.map((i) => <FilaPago key={`${i.deuda.id}-${i.periodo}`} item={i} onPagar={() => setPagando({ deuda: i.deuda, monto: i.monto, periodo: i.periodo })} />)}</div></>}
      {items.length ? <div className={s.timeline}>{items.map((i) => <FilaPago key={`${i.deuda.id}-${i.periodo}`} item={i} onPagar={() => setPagando({ deuda: i.deuda, monto: i.monto, periodo: i.periodo })} />)}</div>
        : <p className={s.empty}>No hay pagos programados para este mes. {deudas.length === 0 && "Empieza con “Nueva deuda”."}</p>}
    </section>

    <section className="glass agenda-board">
      <div className={s.sectionTitle}><h2>Todas mis deudas</h2></div>
      {(vista === "todo" ? (["optica", "personal"] as const) : [vista]).map((destino) => <div key={destino} className={s.part}>
        <h3 className={s.partTitle}>{destino === "optica" ? "Deudas Shuvisión" : "Deudas personales"}</h3>
        {(destino === "optica" ? [
          { label: "Gastos fijos", tipos: ["gasto_fijo"] as TipoDeuda[], preset: "gasto_fijo" as TipoDeuda },
          { label: "Salarios", tipos: ["salario"] as TipoDeuda[], preset: "salario" as TipoDeuda },
          { label: "Préstamos", tipos: ["prestamo_banco", "prestamo_personal"] as TipoDeuda[], preset: "prestamo_banco" as TipoDeuda },
          { label: "Tarjetas", tipos: ["tarjeta"] as TipoDeuda[], preset: "tarjeta" as TipoDeuda },
          { label: "Proveedores", tipos: ["proveedor"] as TipoDeuda[], preset: "proveedor" as TipoDeuda },
        ] : [
          { label: "Tarjetas", tipos: ["tarjeta"] as TipoDeuda[], preset: "tarjeta" as TipoDeuda },
          { label: "Gastos fijos", tipos: ["gasto_fijo"] as TipoDeuda[], preset: "gasto_fijo" as TipoDeuda },
          { label: "Préstamos", tipos: ["prestamo_banco", "prestamo_personal"] as TipoDeuda[], preset: "prestamo_personal" as TipoDeuda },
        ]).map((grupo) => {
          const rows = props.debts.filter((d) => d.estado === "pendiente" && (destino === "personal" ? d.ambito === "personal" : d.ambito !== "personal") && grupo.tipos.includes(d.tipo));
          if (destino === "personal" && !rows.length && grupo.label === "Préstamos") return null;
          const saldo = rows.reduce((sum, d) => sum + (d.modalidad === "mensual" ? 0 : Number(d.saldo)), 0);
          const mensual = rows.reduce((sum, d) => sum + (d.modalidad === "libre" ? 0 : Number(d.monto_cuota ?? 0)), 0);
          const tarjetas = grupo.preset === "tarjeta" ? Array.from(new Set(rows.map((d) => d.proveedor))) : [];
          const renderDeuda = (d: BusinessDebt) => <TarjetaDeuda key={d.id} deuda={d} empresa={d.sucursal_id ? props.branches.find((b) => b.id === d.sucursal_id)?.nombre : destino === "personal" ? "Personal" : props.companies.find((c) => c.id === d.empresa_id)?.nombre} pending={pending} onEditar={() => setEditando(d)} onPagar={() => { const p = proximoPago(d, hoy); setPagando({ deuda: d, monto: p?.monto ?? Number(d.saldo), periodo: p ? mesDe(p.fecha) : mesDe(hoy) }); }} onHistorial={() => setHistorial(d)} onFactura={() => setFacturando(d)} onArchivar={() => archivar(d)} />;
          // Cada clasificación se abre y se cierra (Shuyana 2026-10-01): cerrada muestra solo el total.
          return <details key={grupo.label} className={s.debtGroup}>
            <summary className={s.groupHead}><div><h4>{grupo.label} <span>({rows.length})</span></h4><p>Saldo {money(saldo)}{mensual > 0 ? ` · Mensual ${money(mensual)}` : ""}</p></div><button type="button" className="outline-action" onClick={(event) => { event.preventDefault(); setNueva({ tipo: grupo.preset, destino }); }}><Plus size={15} /> Agregar</button></summary>
            {grupo.preset === "tarjeta" ? tarjetas.map((nombre) => { const cardRows = rows.filter((d) => d.proveedor === nombre); return <div key={nombre} className={s.cardGroup}><div className={s.cardGroupHead}><strong>{nombre}</strong><span>Saldo {money(cardRows.reduce((sum, d) => sum + Number(d.saldo), 0))} · Mensual {money(cardRows.reduce((sum, d) => sum + Number(d.monto_cuota ?? 0), 0))}</span></div><div className={s.grid}>{cardRows.map(renderDeuda)}</div></div>; }) : rows.length ? <div className={s.grid}>{rows.map(renderDeuda)}</div> : <p className={s.empty}>No hay deudas activas.</p>}
          </details>;
        })}
      </div>)}
    </section>

    {nueva && <NuevaDeuda preset={nueva} companies={props.companies} branches={props.branches} onClose={() => setNueva(null)} onSaved={(m) => { setNotice(m); setNueva(null); router.refresh(); }} />}
    {pagando && <PagarDeuda pago={pagando} branches={props.branches} cuentas={props.cuentas} companies={props.companies} onClose={() => setPagando(null)} onSaved={(m) => { setNotice(m); setPagando(null); router.refresh(); }} />}
    {historial && <Historial deuda={historial} onClose={() => setHistorial(null)} />}
    {editando && <EditarDeuda deuda={editando} companies={props.companies} branches={props.branches} onClose={() => setEditando(null)} onSaved={(m) => { setNotice(m); setEditando(null); router.refresh(); }} />}
    {facturando && <AgregarFactura deuda={facturando} onClose={() => setFacturando(null)} onSaved={() => { setNotice(`Factura agregada a ${facturando.proveedor}.`); setFacturando(null); router.refresh(); }} />}
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
    <div className={s.right}><span className={s.amount}>{money(item.monto)}</span><span className={`${s.pill} ${estadoClase[item.estado]}`}>{estadoTexto[item.estado]}</span>{item.estado !== "pagado" && <button className="new-consultation" type="button" onClick={onPagar}>{item.deuda.tipo === "gasto_fijo" ? "Marcar pagado" : "Pagar"}</button>}</div>
  </article>;
}

function TarjetaDeuda({ deuda, empresa, pending, onPagar, onHistorial, onFactura, onArchivar, onEditar }: { deuda: BusinessDebt; empresa?: string; pending: boolean; onPagar: () => void; onHistorial: () => void; onFactura: () => void; onArchivar: () => void; onEditar: () => void }) {
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
      {deuda.tipo === "proveedor" && deuda.modalidad === "libre" && <button className="outline-action" type="button" onClick={onFactura}><Plus size={14} /> Agregar factura</button>}
      <button className="outline-action" type="button" onClick={onHistorial}><History size={14} /> Historial</button>
      <button className="outline-action" type="button" onClick={onEditar}><Pencil size={14} /> Editar</button>
      <button className="outline-action" type="button" disabled={pending} onClick={onArchivar} title="Ya no aplica o se terminó"><Archive size={14} /> Quitar</button>
    </div>
  </article>;
}

function NuevaDeuda({ preset, companies, branches, onClose, onSaved }: { preset: { tipo?: TipoDeuda; destino: "optica" | "personal" }; companies: PrivateAdminData["companies"]; branches: PrivateAdminData["branches"]; onClose: () => void; onSaved: (m: string) => void }) {
  const [tipo, setTipo] = useState<TipoDeuda | null>(preset.tipo ?? null);
  const [modalidad, setModalidad] = useState<ModalidadDeuda>(preset.tipo ? tipos[preset.tipo].modalidad : "libre");
  const [cuota, setCuota] = useState(""); const [nCuotas, setNCuotas] = useState(""); const [previas, setPrevias] = useState("0");
  const [total, setTotal] = useState(""); const [saldo, setSaldo] = useState("");
  const [error, setError] = useState(""); const [pending, start] = useTransition();
  const [destino, setDestino] = useState(preset.destino === "personal" ? "personal" : "");
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
        <label>¿De quién es la deuda?<select name="empresa_id" value={destino} onChange={(e) => setDestino(e.target.value)}><option value="">General (las 3 sucursales)</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}<option value="personal">Personal (Shu)</option></select></label>
        {tipo !== "gasto_fijo" && tipo !== "salario" && <label>¿Cómo se paga?<select value={modalidad} onChange={(e) => setModalidad(e.target.value as ModalidadDeuda)}><option value="cuotas">{modalidades.cuotas}</option><option value="libre">{modalidades.libre}</option></select></label>}
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
        {(tipo === "gasto_fijo" || tipo === "salario") && destino !== "personal" && <label>Sucursal (se registra el egreso en su caja)<select name="sucursal_id" defaultValue=""><option value="">Ninguna / pago general</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>}
      </div>}
      <div className="new-patient-form" style={{ marginTop: 12 }}><label className="task-description" style={{ gridColumn: "1 / -1" }}>Notas (opcional)<textarea name="notas" /></label></div>
      {error && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar deuda"}</button></div>
    </form>}
  </section></div>;
}

function PagarDeuda({ pago, branches, cuentas, companies, onClose, onSaved }: { pago: Pago; branches: PrivateAdminData["branches"]; cuentas: PrivateAdminData["cuentas"]; companies: PrivateAdminData["companies"]; onClose: () => void; onSaved: (m: string) => void }) {
  const d = pago.deuda;
  const [origen, setOrigen] = useState(d.ambito === "personal" ? "personal" : "");
  const nombreCuenta = (c: PrivateAdminData["cuentas"][number]) => `${bancoLabel[c.banco] ?? c.banco} · ${branches.find((b) => b.id === c.sucursal_id)?.nombre ?? companies.find((e) => e.id === c.empresa_id)?.nombre ?? "Empresa"}`;
  const [monto, setMonto] = useState(pago.monto.toFixed(2));
  const [error, setError] = useState(""); const [pending, start] = useTransition();
  const submit = (form: HTMLFormElement) => start(async () => {
    setError("");
    const data = new FormData(form); data.set("deuda_id", d.id);
    if (!origen) { setError("Elige de dónde salió el dinero."); return; }
    const cuentaId = origen.startsWith("cuenta:") ? origen.slice(7) : "";
    const sucursalId = origen.startsWith("caja:") ? origen.slice(5) : "";
    data.set("metodo", cuentaId ? "transferencia" : sucursalId ? "efectivo" : "otro");
    if (cuentaId) { data.set("cuenta_id", cuentaId); if (d.sucursal_id) data.set("egreso_sucursal", d.sucursal_id); }
    else if (sucursalId) data.set("egreso_sucursal", sucursalId);
    const r = await registrarPagoDeuda(data);
    if (!r.ok) { setError(r.error); return; }
    const cuenta = cuentas.find((c) => c.id === cuentaId);
    onSaved(`Pago de ${money(Number(monto))} a "${d.proveedor}" registrado.${cuenta ? ` Salió de ${nombreCuenta(cuenta)}.` : sucursalId ? " También quedó como egreso de caja." : ""}`);
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
        <label>¿De dónde salió el dinero?<select required value={origen} onChange={(e) => setOrigen(e.target.value)}><option value="" disabled>Selecciona el origen</option>{cuentas.map((c) => <option key={c.id} value={`cuenta:${c.id}`}>{nombreCuenta(c)}</option>)}{branches.map((b) => <option key={b.id} value={`caja:${b.id}`}>Efectivo de la caja de {b.nombre}</option>)}<option value="personal">Dinero personal (no afecta a las ópticas)</option></select></label>
        <label>Referencia (opcional)<input name="referencia" placeholder="N.º de transferencia o recibo" /></label>
        <label>Nota (opcional)<input name="notas" /></label>
      </div>
      <p className="field-hint">Los pagos con dinero de las ópticas aparecen como egreso en el Resumen del día y se restan del “a cuenta” del mes de esa sucursal.</p>
      {error && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending || !(Number(monto) > 0)}>{pending ? "Guardando…" : "Registrar pago"}</button></div>
    </form>
  </section></div>;
}

function Historial({ deuda, onClose }: { deuda: BusinessDebt; onClose: () => void }) {
  const pagos = [...deuda.pagos_deuda_negocio].sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago));
  const facturas = [...(deuda.facturas_proveedor ?? [])].sort((a, b) => b.fecha_emision.localeCompare(a.fecha_emision));
  return <div className="modal-backdrop" onClick={onClose}><section className="new-patient-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">HISTORIAL</p><h2>{deuda.proveedor}</h2>
    {deuda.tipo === "proveedor" && <><h3>Facturas ({facturas.length})</h3>{facturas.length ? <div className="task-list">{facturas.map((f) => <article className="task-card" key={f.id}><div className="task-main"><p style={{ margin: 0 }}><strong>{fechaCorta(f.fecha_emision)}</strong> · {f.numero} · {f.origen === "xml" ? "XML" : f.origen === "correo" ? "Correo" : "Manual"}</p>{f.razon_social && <p className="field-hint" style={{ margin: 0 }}>{f.razon_social}</p>}</div><div className="task-actions"><strong>{money(Number(f.total))}</strong></div></article>)}</div> : <p className={s.empty}>Todavía no hay facturas registradas.</p>}</>}
    <h3>Pagos ({pagos.length})</h3>
    {pagos.length ? <div className="task-list">{pagos.map((p) => <article className="task-card" key={p.id}><div className="task-main"><p style={{ margin: 0 }}><strong>{fechaCorta(p.fecha_pago)}</strong> · {metodos.find((m) => m.value === p.metodo)?.label ?? p.metodo}{p.periodo ? ` · mes ${nombreMes(p.periodo.slice(0, 7))}` : ""}{p.referencia ? ` · Ref. ${p.referencia}` : ""}</p>{p.notas && <p className="field-hint" style={{ margin: 0 }}>{p.notas}</p>}</div><div className="task-actions"><strong>{money(Number(p.monto))}</strong></div></article>)}</div>
      : <p className={s.empty}>Todavía no hay pagos registrados.</p>}
  </section></div>;
}

function AgregarFactura({ deuda, onClose, onSaved }: { deuda: BusinessDebt; onClose: () => void; onSaved: () => void }) {
  const [campos, setCampos] = useState({ numero: "", fecha: "", subtotal: "", iva: "", total: "", ruc: "", razon_social: "", clave_acceso: "", notas: "", origen: "manual" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const setCampo = (nombre: keyof typeof campos, valor: string) => setCampos((actual) => ({ ...actual, [nombre]: valor }));
  const leerXml = async (archivo?: File) => {
    if (!archivo) return;
    try {
      const parse = (texto: string) => {
        const xml = new DOMParser().parseFromString(texto, "text/xml");
        if (xml.getElementsByTagName("parsererror").length) throw new Error("XML inválido");
        return xml;
      };
      let xml = parse(await archivo.text());
      if (xml.documentElement.localName === "autorizacion") {
        const comprobante = xml.getElementsByTagName("comprobante")[0]?.textContent;
        if (!comprobante) throw new Error("Sin comprobante");
        xml = parse(comprobante);
      }
      if (xml.documentElement.localName !== "factura") throw new Error("No es una factura");
      const dato = (padre: Element | null, etiqueta: string) => padre?.getElementsByTagName(etiqueta)[0]?.textContent?.trim() ?? "";
      const tributaria = xml.getElementsByTagName("infoTributaria")[0];
      const info = xml.getElementsByTagName("infoFactura")[0];
      const fechaSRI = dato(info, "fechaEmision");
      const fechaPartes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fechaSRI);
      const fecha = fechaPartes ? `${fechaPartes[3]}-${fechaPartes[2]}-${fechaPartes[1]}` : "";
      const numeroFactura = ["estab", "ptoEmi", "secuencial"].map((campo) => dato(tributaria, campo)).join("-");
      const subtotal = dato(info, "totalSinImpuestos");
      const total = dato(info, "importeTotal");
      if (!tributaria || !info || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`)) || new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10) !== fecha || numeroFactura.split("-").some((parte) => !parte) || !(Number(total) > 0)) throw new Error("Factura incompleta");
      const impuestos = Array.from(info.getElementsByTagName("totalImpuesto"));
      const iva = impuestos.length ? impuestos.reduce((suma, impuesto) => suma + Number(dato(impuesto, "valor") || 0), 0) : Number(total) - Number(subtotal || 0);
      setCampos((actual) => ({ ...actual, numero: numeroFactura, fecha, subtotal, iva: iva.toFixed(2), total, ruc: dato(tributaria, "ruc"), razon_social: dato(tributaria, "razonSocial"), clave_acceso: dato(tributaria, "claveAcceso"), origen: "xml" }));
      setError("");
    } catch {
      setCampos((actual) => ({ ...actual, origen: "manual", clave_acceso: "" }));
      setError("No se pudo leer el XML; escribe los datos a mano.");
    }
  };
  const submit = () => start(async () => {
    setError("");
    const data = new FormData();
    data.set("deuda_id", deuda.id);
    for (const [nombre, valor] of Object.entries(campos)) data.set(nombre, valor);
    const resultado = await registrarFacturaProveedor(data);
    if (!resultado.ok) { setError(resultado.error); return; }
    onSaved();
  });
  return createPortal(<div className="modal-backdrop" onClick={onClose}><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-label={`Agregar factura a ${deuda.proveedor}`} style={{ width: "min(640px, 100%)" }} onClick={(e) => e.stopPropagation()}>
    <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">PROVEEDORES</p><h2>Agregar factura · {deuda.proveedor}</h2>
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="new-patient-form"><label className="task-description" style={{ gridColumn: "1 / -1" }}>Subir el XML de la factura (SRI)<input type="file" accept=".xml,text/xml" onChange={(e) => void leerXml(e.target.files?.[0])} /></label></div>
      <div className="new-patient-form" style={{ marginTop: 12 }}>
        <label>Número de factura<input name="numero" required value={campos.numero} onChange={(e) => setCampo("numero", e.target.value)} /></label>
        <label>Fecha<input name="fecha" type="date" required value={campos.fecha} onChange={(e) => setCampo("fecha", e.target.value)} /></label>
        <label>Subtotal $ (opcional)<input name="subtotal" inputMode="decimal" value={campos.subtotal} onChange={(e) => setCampo("subtotal", limpiarMonto(e.target.value))} /></label>
        <label>IVA $ (opcional)<input name="iva" inputMode="decimal" value={campos.iva} onChange={(e) => setCampo("iva", limpiarMonto(e.target.value))} /></label>
        <label>Total $<input name="total" inputMode="decimal" required value={campos.total} onChange={(e) => setCampo("total", limpiarMonto(e.target.value))} /></label>
        <label className="task-description" style={{ gridColumn: "1 / -1" }}>Notas (opcional)<textarea name="notas" value={campos.notas} onChange={(e) => setCampo("notas", e.target.value)} /></label>
      </div>
      <p className={s.summaryLine}>Se sumará {money(Number(campos.total))} a la deuda con {deuda.proveedor}. Saldo nuevo: {money(Number(deuda.saldo) + (Number(campos.total) || 0))}</p>
      {error && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Agregar factura"}</button></div>
    </form>
  </section></div>, document.body);
}

function EditarDeuda({ deuda, companies, branches, onClose, onSaved }: { deuda: BusinessDebt; companies: PrivateAdminData["companies"]; branches: PrivateAdminData["branches"]; onClose: () => void; onSaved: (m: string) => void }) {
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
        <label>Tipo<select name="tipo" defaultValue={deuda.tipo}>{(Object.keys(tipos) as TipoDeuda[]).map((t) => <option key={t} value={t}>{tipos[t].label}</option>)}</select></label>
        <label>¿De quién es la deuda?<select name="empresa_id" defaultValue={destino}><option value="">General (las 3 sucursales)</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}<option value="personal">Personal (Shu)</option></select></label>
        {deuda.modalidad !== "libre" && <label>{deuda.modalidad === "mensual" ? "Monto mensual $" : "Valor de cada cuota $"}<input name="monto_cuota" inputMode="decimal" required defaultValue={deuda.monto_cuota ?? ""} /></label>}
        {deuda.modalidad !== "libre" && <label>Día de pago (1–31)<input name="dia_pago" inputMode="numeric" defaultValue={deuda.dia_pago ?? ""} placeholder="Vacío = por confirmar" /></label>}
        {deuda.tipo === "gasto_fijo" ? <label>Sucursal (egreso en su caja)<select name="sucursal_id" defaultValue={deuda.sucursal_id ?? ""}><option value="">Ninguna / pago general</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label> : <input type="hidden" name="sucursal_id" value={deuda.sucursal_id ?? ""} />}
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
