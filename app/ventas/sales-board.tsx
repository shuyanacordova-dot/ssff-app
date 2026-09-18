"use client";

import Link from "next/link";
import { CircleAlert, FlaskConical, MessageCircle, Package, Plus, ReceiptText, Wallet, X } from "lucide-react";
import { useState, useTransition } from "react";
import type { Sale, SaleItem, SaleLabOrder, VentasData } from "@/lib/ventas";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import Cart from "./cart";
import LabOrderModal from "./lab-order-modal";
import { actualizarEntregaVenta, anularVenta, crearProducto, registrarAbono } from "./actions";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const stateLabel: Record<Sale["estado"], string> = { borrador: "Borrador", completada: "Completada", anulada: "Anulada" };
const statePillClass: Record<Sale["estado"], string> = { borrador: "", completada: "aprobada", anulada: "devuelta" };
const categories = ["montura", "gafas_sol", "lente", "accesorio", "servicio", "tratamiento", "otro"];

export default function SalesBoard(props: VentasData) {
  const [notice, setNotice] = useState(props.message ?? "");
  const [showProduct, setShowProduct] = useState(false);
  const [anulling, setAnulling] = useState<Sale | null>(null);
  const [labOrderSale, setLabOrderSale] = useState<Sale | null>(null);
  const [reciboSale, setReciboSale] = useState<Sale | null>(null);
  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  const [pending, startTransition] = useTransition();
  const role = props.profile?.rol;
  const canCreateProduct = role === "superadmin" || role === "admin_sucursal";
  const canAnular = role === "superadmin";
  const productoById = new Map(props.products.map((product) => [product.id, product]));
  const lensItemsFor = (sale: Sale) => sale.venta_items.filter((item) => item.producto_id && productoById.get(item.producto_id)?.categoria === "lente");

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Cobros</h1><p className="subtitle">{props.message ?? "No se pudo abrir ventas."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/ventas">Iniciar sesión</Link>}</header></div></main>;

  const collected = props.sales.filter((sale) => sale.estado !== "anulada").reduce((sum, sale) => sum + Number(sale.pagado), 0);
  const pendingTotal = props.sales.filter((sale) => sale.estado === "completada").reduce((sum, sale) => sum + Number(sale.saldo), 0);

  const createProduct = (form: HTMLFormElement) => startTransition(async () => { try { await crearProducto(new FormData(form)); setNotice("Producto guardado en el catálogo."); setShowProduct(false); form.reset(); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo crear el producto."); } });
  const abonar = (sale: Sale, data: FormData) => startTransition(async () => { data.set("venta_id", sale.id); try { await registrarAbono(data); setNotice("Abono registrado."); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar el abono."); } });
  const anular = (sale: Sale, motivo: string) => startTransition(async () => { const data = new FormData(); data.set("venta_id", sale.id); data.set("motivo", motivo); try { await anularVenta(data); setNotice("Venta anulada."); setAnulling(null); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo anular la venta."); } });

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Cobros</h1><p className="subtitle">SHUVISION y Focus conservan ventas y saldos separados.</p></div>{canCreateProduct && <button className="new-task" type="button" onClick={() => setShowProduct(true)}><Plus size={18} /> Nuevo producto</button>}</header>
    <section className="agenda-summary"><article><Package size={21} /><strong>{props.products.length}</strong><span>productos activos</span></article><article><Wallet size={21} /><strong>{money(collected)}</strong><span>cobros registrados</span></article><article><ReceiptText size={21} /><strong>{money(pendingTotal)}</strong><span>saldo pendiente</span></article></section>
    <div className="notice"><CircleAlert size={18} /><span>{notice || "Las ventas anuladas se conservan con el motivo registrado; no se eliminan."}</span></div>
    <Cart products={props.products} stock={props.stock} companies={props.companies} branches={props.branches} patients={props.patients} empresasConvenio={props.empresasConvenio} defaultCompany={props.profile?.empresa_id ?? props.companies[0]?.id ?? ""} defaultBranch={props.profile?.sucursal_id ?? ""} onDone={setNotice} />
    <section className="glass agenda-board"><p className="section-label">VENTAS RECIENTES</p><h2>Historial y cobros</h2>{props.sales.length ? <div className="task-list">{props.sales.map((sale) => <SaleCard key={sale.id} sale={sale} companyName={props.companies.find((c) => c.id === sale.empresa_id)?.nombre ?? "Empresa"} patient={props.patients.find((p) => p.id === sale.paciente_id)} lensItems={lensItemsFor(sale)} labOrders={props.labOrders.filter((o) => o.venta_id === sale.id)} canAnular={canAnular} pending={pending} onAbono={abonar} onRequestAnular={setAnulling} onCreateLabOrder={() => setLabOrderSale(sale)} onRecibo={() => setReciboSale(sale)} onDetalle={() => setDetailSale(sale)} />)}</div> : <section className="empty-state"><h3>Aún no hay ventas</h3><p>Cuando registres una venta aparecerá en este historial.</p></section>}</section>
    {showProduct && <ProductModal companies={props.companies} defaultCompany={props.profile?.empresa_id ?? props.companies[0]?.id ?? ""} onClose={() => setShowProduct(false)} onCreate={createProduct} pending={pending} />}
    {anulling && <AnularModal sale={anulling} pending={pending} onClose={() => setAnulling(null)} onConfirm={(motivo) => anular(anulling, motivo)} />}
    {labOrderSale && <LabOrderModal sale={labOrderSale} lensItems={lensItemsFor(labOrderSale)} patientName={props.patients.find((p) => p.id === labOrderSale.paciente_id)?.nombres ? `${props.patients.find((p) => p.id === labOrderSale.paciente_id)?.apellidos}, ${props.patients.find((p) => p.id === labOrderSale.paciente_id)?.nombres}` : (labOrderSale.cliente_nombre || "Paciente")} onClose={() => setLabOrderSale(null)} onCreated={(message) => setNotice(message)} />}
    {reciboSale && <ReciboModal sale={reciboSale} patient={props.patients.find((p) => p.id === reciboSale.paciente_id)} onClose={() => setReciboSale(null)} onSaved={(message) => setNotice(message)} />}
    {detailSale && <VentaDetailModal sale={detailSale} companyName={props.companies.find((c) => c.id === detailSale.empresa_id)?.nombre ?? "Empresa"} patient={props.patients.find((p) => p.id === detailSale.paciente_id)} onClose={() => setDetailSale(null)} />}
  </div></main>;
}

function SaleCard({ sale, companyName, patient, lensItems, labOrders, canAnular, pending, onAbono, onRequestAnular, onCreateLabOrder, onRecibo, onDetalle }: { sale: Sale; companyName: string; patient?: { id: string; nombres: string; apellidos: string; telefono?: string | null }; lensItems: SaleItem[]; labOrders: SaleLabOrder[]; canAnular: boolean; pending: boolean; onAbono: (sale: Sale, data: FormData) => void; onRequestAnular: (sale: Sale) => void; onCreateLabOrder: () => void; onRecibo: () => void; onDetalle: () => void }) {
  const [showAbono, setShowAbono] = useState(false); const [metodo, setMetodo] = useState("efectivo"); const [monto, setMonto] = useState("");
  const submitAbono = () => { const data = new FormData(); data.set("metodo", metodo); data.set("monto", monto); onAbono(sale, data); setShowAbono(false); setMonto(""); };
  const displayName = patient ? `${patient.apellidos}, ${patient.nombres}` : (sale.cliente_nombre || "Cliente sin nombre");
  const items = sale.venta_items;
  const resumenItems = items.slice(0, 2).map((item) => `${item.descripcion} ×${item.cantidad}`).join(", ");
  const resumen = items.length ? (items.length > 2 ? `${resumenItems} +${items.length - 2} más` : resumenItems) : "Sin líneas";
  return <article className="task-card"><div className="task-status"><span className={`status-dot ${statePillClass[sale.estado]}`} /></div><div className="task-main" style={{ cursor: "pointer" }} onClick={onDetalle}><div className="task-meta"><span>{companyName}</span>{patient && <span>Paciente</span>}<span>{new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(sale.creado_en))}</span></div><h2>{displayName}</h2><p>{resumen}{items.length > 0 && <span className="text-action" style={{ marginLeft: 8 }}>Ver detalle</span>}</p><p>Total: <strong>{money(sale.total)}</strong> · Pagado: {money(sale.pagado)} · Saldo: <strong>{money(sale.saldo)}</strong></p>{sale.estado === "anulada" && sale.motivo_anulacion && <p className="notice">Motivo de anulación: {sale.motivo_anulacion}</p>}
    {labOrders.length > 0 && <div className="lab-order-badges">{labOrders.map((order) => <span key={order.id} className="check-badge ok"><FlaskConical size={13} /> {order.laboratorio} · {order.estado}</span>)}</div>}
    {showAbono && <div className="new-patient-form" style={{ marginTop: 10 }} onClick={(event) => event.stopPropagation()}><label>Método<select value={metodo} onChange={(event) => setMetodo(event.target.value)}>{["efectivo", "transferencia", "tarjeta", "credito", "otro"].map((m) => <option key={m} value={m}>{m}</option>)}</select></label><label>Monto<input type="number" min={0} step={0.01} max={sale.saldo} value={monto} onChange={(event) => setMonto(event.target.value)} /></label></div>}
  </div><div className="task-actions"><span className={`state-pill ${statePillClass[sale.estado]}`}>{stateLabel[sale.estado]}</span>{sale.estado === "completada" && <button onClick={onRecibo}><MessageCircle size={14} /> Recibo virtual</button>}{sale.estado === "completada" && patient && lensItems.length > 0 && <button onClick={onCreateLabOrder}><FlaskConical size={14} /> Crear orden de laboratorio</button>}{sale.estado === "completada" && sale.saldo > 0 && (showAbono ? <button disabled={pending || !Number(monto) || Number(monto) > sale.saldo} onClick={submitAbono}>Confirmar abono</button> : <button onClick={() => setShowAbono(true)}>Registrar abono</button>)}{sale.estado === "completada" && canAnular && <button className="cancel-appointment" disabled={pending} onClick={() => onRequestAnular(sale)}>Anular</button>}</div></article>;
}

function VentaDetailModal({ sale, companyName, patient, onClose }: { sale: Sale; companyName: string; patient?: { id: string; nombres: string; apellidos: string; telefono?: string | null }; onClose: () => void }) {
  const displayName = patient ? `${patient.apellidos}, ${patient.nombres}` : (sale.cliente_nombre || "Cliente sin nombre");
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="venta-detalle-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">DETALLE DE VENTA</p>
    <h2 id="venta-detalle-title">{displayName}</h2>
    <p className="field-hint">{companyName} · {new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(sale.creado_en))} · <span className={`state-pill ${statePillClass[sale.estado]}`}>{stateLabel[sale.estado]}</span></p>
    {sale.estado === "anulada" && sale.motivo_anulacion && <p className="notice">Motivo de anulación: {sale.motivo_anulacion}</p>}

    <p className="section-label" style={{ marginTop: 14 }}>ARTÍCULOS</p>
    {sale.venta_items.length ? <div className="task-list">{sale.venta_items.map((item) => <article className="task-card" key={item.id}><div className="task-status" /><div className="task-main"><h2 style={{ fontSize: 15 }}>{item.descripcion}</h2><p>Cantidad: {item.cantidad} · {money(item.precio_unitario)} c/u{item.descuento > 0 && ` · Descuento ${money(item.descuento)}`}</p></div><div className="task-actions"><strong>{money(item.total_linea)}</strong></div></article>)}</div> : <p className="field-hint">Sin líneas registradas.</p>}

    <div className="consultation-stats" style={{ marginTop: 12 }}>
      <span><strong>Subtotal</strong>{money(sale.subtotal)}</span>
      {sale.descuento > 0 && <span><strong>Descuento</strong>{money(sale.descuento)}</span>}
      <span><strong>Total</strong>{money(sale.total)}</span>
      <span><strong>Pagado</strong>{money(sale.pagado)}</span>
      <span><strong>Saldo</strong>{money(sale.saldo)}</span>
    </div>

    <p className="section-label" style={{ marginTop: 14 }}>PAGOS Y ABONOS</p>
    {sale.pagos_venta.length ? <div className="task-list">{sale.pagos_venta.map((pago) => <article className="task-card" key={pago.id}><div className="task-status" /><div className="task-main"><p style={{ margin: 0 }}>{new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(pago.creado_en))} · {pago.metodo}{pago.banco && ` · ${pago.banco}`}{pago.referencia && ` · Ref: ${pago.referencia}`}</p></div><div className="task-actions"><strong>{money(pago.monto)}</strong></div></article>)}</div> : <p className="field-hint">Todavía no se han registrado pagos.</p>}

    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button></div>
  </section></div>;
}

function ProductModal({ companies, defaultCompany, onClose, onCreate, pending }: { companies: VentasData["companies"]; defaultCompany: string; onClose: () => void; onCreate: (form: HTMLFormElement) => void; pending: boolean }) {
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-product-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVO PRODUCTO O SERVICIO</p><h2 id="new-product-title">Agregar al catálogo</h2><form onSubmit={(event) => { event.preventDefault(); onCreate(event.currentTarget); }}><div className="new-patient-form"><label>Nombre<input name="nombre" required /></label><label>Categoría<select name="categoria" defaultValue="montura">{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Empresa<select name="empresa_id" defaultValue={defaultCompany}>{companies.map((company) => <option key={company.id} value={company.id}>{company.nombre}</option>)}</select></label><label>Código<input name="codigo" /></label><label>Precio de venta<input name="precio_venta" required type="number" min="0" step="0.01" /></label><label>Costo referencial<input name="costo_referencial" type="number" min="0" step="0.01" /></label></div><div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar producto"}</button></div></form></section></div>;
}

function AnularModal({ sale, pending, onClose, onConfirm }: { sale: Sale; pending: boolean; onClose: () => void; onConfirm: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState("");
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="anular-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">ANULAR VENTA</p><h2 id="anular-title">{sale.cliente_nombre || "Venta"} · {money(sale.total)}</h2><p>La venta anulada se conserva en el historial con el motivo registrado; no se puede modificar después.</p><label className="task-description">Motivo de la anulación<textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ej.: Producto entregado por error, se anula y se re-emite" /></label><div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="cancel-appointment" disabled={pending || motivo.trim().length < 5} onClick={() => onConfirm(motivo.trim())}>{pending ? "Anulando…" : "Confirmar anulación"}</button></div></section></div>;
}

function ReciboModal({ sale, patient, onClose, onSaved }: { sale: Sale; patient?: { id: string; nombres: string; apellidos: string; telefono?: string | null }; onClose: () => void; onSaved: (message: string) => void }) {
  const [fecha, setFecha] = useState(sale.fecha_entrega_estimada ?? "");
  const [token, setToken] = useState(sale.recibo_token);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/recibo/${token}`;
  const nombre = patient ? patient.nombres : (sale.cliente_nombre || "Cliente");
  const mensaje = `Hola ${nombre}! Aquí tienes tu recibo de SHUVISION con el detalle de tu compra y abonos, siempre actualizado: ${link}`;
  const wa = enlaceWhatsapp(patient?.telefono, mensaje);

  const guardar = async () => {
    setSaving(true); setError("");
    try { const result = await actualizarEntregaVenta(sale.id, fecha); setToken(result.recibo_token); onSaved("Fecha de entrega guardada en el recibo."); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo actualizar el recibo."); }
    setSaving(false);
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(link); onSaved("Enlace del recibo copiado."); } catch { setError("No se pudo copiar el enlace."); } };

  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="recibo-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">RECIBO VIRTUAL</p><h2 id="recibo-title">{nombre}</h2><p>Este enlace siempre muestra el estado más reciente de la venta: total, abonos y saldo. No necesitas volver a generarlo después de cada abono, se actualiza solo cada vez que alguien lo abre.</p>
    <div className="new-patient-form"><label>Fecha tentativa de entrega (opcional)<input type="date" value={fecha ?? ""} onChange={(event) => setFecha(event.target.value)} /></label></div>
    <div className="glass clinical-card" style={{ minHeight: "auto", padding: 12, margin: "12px 0", wordBreak: "break-all" }}><p className="section-label">ENLACE DEL RECIBO</p><p style={{ margin: 0 }}>{link}</p></div>
    {error && <p className="notice">{error}</p>}
    <div className="modal-actions" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}><button className="outline-action" type="button" onClick={copiar}>Copiar enlace</button><button className="outline-action" type="button" onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar fecha de entrega"}</button></div>
      {wa ? <a className="new-consultation" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Enviar por WhatsApp</a> : <span style={{ color: "#a24150", fontSize: 13, fontWeight: 700 }}>Este paciente no tiene WhatsApp registrado.</span>}
    </div>
  </section></div>;
}
