"use client";

import { ChevronDown, ChevronRight, Pencil, Printer, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { printDocumentById } from "@/lib/print-document";
import { clasificarEgreso, obtenerDesgloseInforme, obtenerEgresoParaEditar, type DesgloseInforme, type EgresoParaEditar, type FilaDesglose, type TipoDesglose } from "./actions";
import EditarEgresoModal from "./editar-egreso-modal";

const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;
const fecha = (value: unknown) => typeof value === "string" ? new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`)) : "";
const metodoLabel: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", credito: "Crédito", otro: "Otro" };
const clasificacionLabel: Record<string, string> = { salarios: "Salarios", pago_proveedor: "Pago a proveedor", gastos_mensuales: "Gastos mensuales", gastos_operacion: "Gastos de operación", ajuste: "Ajuste" };
const tipoVentaLabel: Record<string, string> = { lentes: "Lentes", rapida: "Venta rápida", traspaso: "Traspaso" };
const SIN_CLASIFICAR = "Sin clasificar";

type Agrupacion = { valor: string; etiqueta: string; de: (f: FilaDesglose) => string };
const str = (v: unknown, vacio = "—") => (typeof v === "string" && v.trim()) ? v.trim() : vacio;
const porSucursal: Agrupacion = { valor: "sucursal", etiqueta: "Sucursal", de: (f) => str(f.sucursal, "Sin sucursal") };
const sinAgrupar: Agrupacion = { valor: "ninguno", etiqueta: "Sin agrupar", de: () => "Todos" };

const config: Record<TipoDesglose, { titulo: string; montoDe: (f: FilaDesglose) => number; agrupaciones: Agrupacion[] }> = {
  ventas: { titulo: "Ventas del mes", montoDe: (f) => Number(f.total ?? 0), agrupaciones: [porSucursal, { valor: "tipo", etiqueta: "Tipo de venta", de: (f) => tipoVentaLabel[str(f.tipo_venta, "")] ?? "Otra" }, sinAgrupar] },
  saldo: { titulo: "Saldo de las ventas del mes", montoDe: (f) => Number(f.saldo ?? 0), agrupaciones: [porSucursal, sinAgrupar] },
  cxc: { titulo: "Cuentas por cobrar (todas)", montoDe: (f) => Number(f.saldo ?? 0), agrupaciones: [porSucursal, { valor: "mes", etiqueta: "Mes de la venta", de: (f) => str(f.fecha).slice(0, 7) }, sinAgrupar] },
  cobros: { titulo: "Cobros del mes", montoDe: (f) => Number(f.monto ?? 0), agrupaciones: [{ valor: "metodo", etiqueta: "Forma de pago", de: (f) => metodoLabel[str(f.metodo, "")] ?? str(f.metodo) }, porSucursal, { valor: "origen", etiqueta: "Venta del mes o anterior", de: (f) => f.venta_del_mes ? "Ventas de este mes" : "Abonos de ventas anteriores" }, sinAgrupar] },
  gastos: { titulo: "Egresos del mes", montoDe: (f) => Number(f.monto ?? 0), agrupaciones: [{ valor: "clasificacion", etiqueta: "Clasificación", de: (f) => clasificacionLabel[str(f.clasificacion, "")] ?? SIN_CLASIFICAR }, { valor: "concepto", etiqueta: "Concepto", de: (f) => str(f.concepto).toUpperCase() }, porSucursal] },
  cuadres: { titulo: "Cuadres de caja del mes", montoDe: (f) => Math.abs(Number(f.diferencia ?? 0)), agrupaciones: [{ valor: "estado", etiqueta: "Resultado", de: (f) => f.correcto ? "Correctos" : "Con diferencia" }, porSucursal] },
};

export default function DesgloseModal({ tipo, empresaId, mes, etiquetaPeriodo, puedeClasificar, onClose, onCambio }: { tipo: TipoDesglose; empresaId: string | null; mes: string; etiquetaPeriodo: string; puedeClasificar: boolean; onClose: () => void; onCambio?: () => void }) {
  const cfg = config[tipo];
  const [datos, setDatos] = useState<DesgloseInforme | null>(null);
  const [error, setError] = useState("");
  const [agrupar, setAgrupar] = useState(cfg.agrupaciones[0].valor);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [egresoEditando, setEgresoEditando] = useState<EgresoParaEditar | null>(null);
  const [pending, start] = useTransition();

  const cargar = () => start(async () => { try { setDatos(await obtenerDesgloseInforme(empresaId, mes, tipo)); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo abrir el desglose."); } });
  useEffect(cargar, [empresaId, mes, tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const agrupacion = cfg.agrupaciones.find((a) => a.valor === agrupar) ?? cfg.agrupaciones[0];
  const filas = datos?.filas ?? [];
  const grupos = new Map<string, FilaDesglose[]>();
  for (const f of filas) { const g = agrupacion.de(f); grupos.set(g, [...(grupos.get(g) ?? []), f]); }
  const listaGrupos = Array.from(grupos.entries()).map(([nombre, items]) => ({ nombre, items, total: items.reduce((s, f) => s + cfg.montoDe(f), 0) }))
    .sort((a, b) => (a.nombre === SIN_CLASIFICAR ? 1 : 0) - (b.nombre === SIN_CLASIFICAR ? 1 : 0) || b.total - a.total);
  const total = filas.reduce((s, f) => s + cfg.montoDe(f), 0);
  const unSoloGrupo = listaGrupos.length === 1;
  const alternar = (nombre: string) => setAbiertos((set) => { const n = new Set(set); if (n.has(nombre)) n.delete(nombre); else n.add(nombre); return n; });

  const clasificar = (fila: FilaDesglose, categoria: string) => start(async () => {
    try { await clasificarEgreso(String(fila.id), categoria); setDatos(await obtenerDesgloseInforme(empresaId, mes, tipo)); onCambio?.(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la categoría."); }
  });
  const abrirEdicion = (fila: FilaDesglose) => start(async () => {
    try { setError(""); setEgresoEditando(await obtenerEgresoParaEditar(String(fila.id))); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo abrir el egreso."); }
  });
  const guardarEdicion = () => {
    setEgresoEditando(null);
    cargar();
    onCambio?.();
  };

  return createPortal(<div className="modal-backdrop" onClick={onClose}><section className="new-patient-modal informe-desglose" role="dialog" aria-modal="true" aria-labelledby="desglose-title" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close no-print" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <div id="informe-desglose-print" className="print-area">
      <p className="section-label">DESGLOSE · {etiquetaPeriodo}</p>
      <h2 id="desglose-title">{cfg.titulo}</h2>
      <p className="informe-desglose-total"><strong>{tipo === "cuadres" ? `${filas.filter((f) => f.correcto).length} de ${filas.length} correctos` : money(total)}</strong><span>{filas.length} registro(s)</span></p>
      <div className="informe-desglose-toolbar no-print">
        <label>Agrupar por<select value={agrupar} onChange={(event) => { setAgrupar(event.target.value); setAbiertos(new Set()); }}>{cfg.agrupaciones.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}</select></label>
        <button type="button" className="text-action" onClick={() => setAbiertos(abiertos.size ? new Set() : new Set(listaGrupos.map((g) => g.nombre)))}>{abiertos.size ? "Cerrar todo" : "Abrir todo"}</button>
        <button type="button" className="outline-action" onClick={() => printDocumentById("informe-desglose-print")}><Printer size={14} /> Imprimir</button>
      </div>
      {tipo === "gastos" && puedeClasificar && <p className="field-hint no-print">Abre “Editar” en el egreso que quieras corregir. Los cambios quedan registrados.</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      {!datos && !error && <p className="field-hint">Cargando…</p>}
      {datos && !filas.length && <p className="field-hint">No hay registros en este periodo.</p>}
      <div className="informe-grupos">{listaGrupos.map((g) => { const abierto = unSoloGrupo || abiertos.has(g.nombre); return <div className="informe-grupo" key={g.nombre}>
        <button type="button" className="informe-grupo-header" onClick={() => alternar(g.nombre)} aria-expanded={abierto}>{abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span className="informe-grupo-nombre">{g.nombre}</span><span className="informe-grupo-count">{g.items.length}</span><strong>{tipo === "cuadres" ? "" : money(g.total)}</strong></button>
        {abierto && <ul className="informe-filas">{g.items.map((f) => <FilaItem key={String(f.id)} tipo={tipo} fila={f} puedeClasificar={puedeClasificar && tipo === "gastos"} pending={pending} onClasificar={(cat) => clasificar(f, cat)} onEditar={() => abrirEdicion(f)} />)}</ul>}
      </div>; })}</div>
    </div>
    {egresoEditando && <EditarEgresoModal datos={egresoEditando} onClose={() => setEgresoEditando(null)} onSaved={guardarEdicion} />}
  </section></div>, document.body);
}

function FilaItem({ tipo, fila: f, puedeClasificar, pending, onClasificar, onEditar }: { tipo: TipoDesglose; fila: FilaDesglose; puedeClasificar: boolean; pending: boolean; onClasificar: (categoria: string) => void; onEditar: () => void }) {
  let titulo = ""; let detalle: string[] = []; let monto = "";
  if (tipo === "ventas" || tipo === "saldo" || tipo === "cxc") { titulo = str(f.cliente); detalle = [fecha(f.fecha), f.folio ? `N.º ${f.folio}` : "", str(f.sucursal, ""), `Total ${money(f.total)}`, `Pagado ${money(f.pagado)}`]; monto = tipo === "ventas" ? money(f.total) : `Saldo ${money(f.saldo)}`; }
  else if (tipo === "cobros") { titulo = str(f.cliente); detalle = [fecha(f.fecha), f.folio ? `N.º ${f.folio}` : "", metodoLabel[str(f.metodo, "")] ?? str(f.metodo), str(f.banco, ""), str(f.sucursal, "")]; monto = money(f.monto); }
  else if (tipo === "gastos") { titulo = `Concepto: ${str(f.concepto)}`; detalle = [`Clasificación: ${clasificacionLabel[str(f.clasificacion, "")] ?? SIN_CLASIFICAR}`, fecha(f.fecha), str(f.sucursal, ""), f.origen === "banco" ? "Banco" : f.origen ? "Caja" : "", str(f.observaciones, "")]; monto = money(f.monto); }
  else { titulo = `${fecha(f.fecha)} · ${str(f.sucursal)}`; detalle = [`Esperado ${money(f.caja_esperada)}`, `Físico ${money(f.caja_fisica)}`, str(f.observaciones, "")]; monto = f.correcto ? "Correcto" : `Diferencia ${money(f.diferencia)}`; }
  return <li className="informe-fila">
    <div className="informe-fila-main"><span className="informe-fila-titulo">{titulo}</span><span className="informe-fila-detalle">{detalle.filter(Boolean).join(" · ")}</span></div>
    <strong className="informe-fila-monto">{monto}</strong>
    {puedeClasificar && <button className="outline-action no-print" type="button" disabled={pending} onClick={onEditar}><Pencil size={14} /> Editar</button>}
    {puedeClasificar && !f.clasificacion && <div className="informe-fila-clasificar no-print">
      <select defaultValue="" disabled={pending} onChange={(event) => { if (event.target.value) onClasificar(event.target.value); }} aria-label="Clasificar egreso">
        <option value="">Elegir clasificación</option>
        {Object.entries(clasificacionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>}
  </li>;
}
