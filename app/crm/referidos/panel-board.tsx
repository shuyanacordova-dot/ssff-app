"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { FolderOpen, Gift, Users, X } from "lucide-react";
import type { PanelData } from "@/lib/referidos-panel-data";
import { atajoPeriodo, dineroPanel, ordenarRanking, porcentaje, type AtajoPeriodo, type DetalleReferidor, type FilaRanking, type OrdenRanking } from "@/lib/referidos-panel";
import { estadoReferidoLabel, tipoMovimientoLabel } from "@/lib/referidos-textos";
import { obtenerDetalleReferidor } from "./actions";

const fecha = (iso: string | null) => iso ? new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)) : "—";
const atajos: { clave: AtajoPeriodo; etiqueta: string }[] = [{ clave: "este_mes", etiqueta: "Este mes" }, { clave: "mes_pasado", etiqueta: "Mes pasado" }, { clave: "ultimos_30", etiqueta: "Últimos 30 días" }];
const enlace = (desde: string, hasta: string, sucursal: string) => `/crm/referidos?desde=${desde}&hasta=${hasta}&sucursal=${sucursal}`;

export default function PanelBoard(props: PanelData) {
  const [orden, setOrden] = useState<OrdenRanking>("exitosos");
  const [detalle, setDetalle] = useState<DetalleReferidor | null>(null);
  const [error, setError] = useState("");
  const [cargando, startCargando] = useTransition();
  const filas = useMemo(() => ordenarRanking(props.panel?.ranking ?? [], orden), [props.panel, orden]);

  if (props.status !== "ready" || !props.panel || !props.periodo) {
    return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/crm">← CRM</Link><p className="eyebrow">REFERIDOS</p><h1>Panel de referidos</h1><p className="subtitle">{props.message ?? "No se pudo cargar."}</p></div></header></div></main>;
  }
  const { panel, periodo } = props;
  const ind = panel.indicadores;
  const sucursal = props.sucursalId ?? "todas";
  const sucursalNombre = sucursal === "todas" ? "Todas las sucursales" : panel.sucursales.find((s) => s.id === sucursal)?.nombre ?? "Sucursal";
  const abrir = (fila: FilaRanking) => startCargando(async () => {
    setError("");
    try {
      const resultado = await obtenerDetalleReferidor({ empresaId: props.empresaId ?? "", referidorId: fila.paciente_id, desde: periodo.desde, hasta: periodo.hasta, sucursalId: sucursal === "todas" ? null : sucursal });
      if (resultado.ok) setDetalle(resultado.detalle); else setError(resultado.error);
    } catch { setError("No se pudo cargar el detalle. Intenta de nuevo."); }
  });
  const sinDatos = ind.registrados === 0 && ind.ventas_n === 0 && ind.creditos_generados === 0 && ind.creditos_usados === 0;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/crm">← CRM</Link><p className="eyebrow">REFERIDOS · {props.empresaNombre}</p><h1>{panel.nombre ?? "Panel de referidos"}</h1><p className="subtitle">{sucursalNombre} · del {fecha(`${periodo.desde}T12:00:00-05:00`)} al {fecha(`${periodo.hasta}T12:00:00-05:00`)}</p></div></header>

    <section className="glass agenda-board">
      <div className="agenda-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="tabs">{atajos.map((a) => { const p = atajoPeriodo(a.clave); return <Link key={a.clave} className={p.desde === periodo.desde && p.hasta === periodo.hasta ? "active" : ""} href={enlace(p.desde, p.hasta, sucursal)}>{a.etiqueta}</Link>; })}</div>
        {panel.sucursales.length > 1 && <div className="tabs">{[{ id: "todas", nombre: "Todas" }, ...panel.sucursales].map((s) => <Link key={s.id} className={sucursal === s.id ? "active" : ""} href={enlace(periodo.desde, periodo.hasta, s.id)}>{s.nombre}</Link>)}</div>}
        <form method="get" action="/crm/referidos" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="sucursal" value={sucursal} />
          <label>Desde <input type="date" name="desde" defaultValue={periodo.desde} required /></label>
          <label>Hasta <input type="date" name="hasta" defaultValue={periodo.hasta} required /></label>
          <button className="outline-action" type="submit">Aplicar</button>
        </form>
      </div>

      {!panel.programa_activo && <p className="notice" role="status">El programa de referidos está apagado en esta óptica. Cuando se encienda, aquí verás los resultados.</p>}
      {panel.programa_activo && sinDatos && <p className="notice" role="status">Todavía no hay referidos en este período.</p>}

      <p className="section-label">RESULTADOS DEL PERÍODO</p>
      <section className="agenda-summary">
        <article><Users size={21} /><strong>{ind.registrados}</strong><span>referidos registrados</span></article>
        <article><Users size={21} /><strong>{ind.compraron}</strong><span>compraron · conversión {porcentaje(ind.conversion)}</span></article>
        <article><Gift size={21} /><strong>{dineroPanel(ind.ventas_total)}</strong><span>ventas atribuidas ({ind.ventas_n}) · ticket {dineroPanel(ind.ticket)}</span></article>
        <article><Gift size={21} /><strong>{dineroPanel(ind.costo)}</strong><span>costo del programa · {porcentaje(ind.costo_pct)} de las ventas</span></article>
        <article><Gift size={21} /><strong>{dineroPanel(ind.resultado)}</strong><span>ventas atribuidas menos costo</span></article>
      </section>
      <section className="agenda-summary">
        <article><strong>{dineroPanel(ind.descuentos)}</strong><span>descuentos de bienvenida</span></article>
        <article><strong>{dineroPanel(ind.creditos_generados)}</strong><span>créditos generados</span></article>
        <article><strong>{dineroPanel(ind.creditos_usados)}</strong><span>créditos y bonos usados</span></article>
        <article><strong>{dineroPanel(ind.pendientes)}</strong><span>créditos pendientes (hoy)</span></article>
        <article><strong>{dineroPanel(ind.creditos_vencidos)}</strong><span>créditos vencidos</span></article>
        <article><strong>{ind.bonos_n} · {dineroPanel(ind.bonos_monto)}</strong><span>bonos entregados</span></article>
        <article><strong>{ind.codigos}</strong><span>pacientes con código (hoy, toda la óptica)</span></article>
      </section>
      <p className="field-hint">Las ventas atribuidas son las de pacientes que llegaron con un código; no se sabe si habrían comprado sin él, por eso no se llaman “nuevas”. El costo suma los descuentos de bienvenida y los créditos y bonos que se usaron en ventas no anuladas; lo generado y aún no usado es una deuda pendiente, no un costo. Registrados y ventas se miden por fechas distintas (registro y venta). El margen exacto llegará cuando LumOS guarde el costo de cada producto.</p>

      <div className="cob-heading"><div><p><strong>Quienes más recomiendan</strong> · {panel.ranking_total} {panel.ranking_total === 1 ? "persona" : "personas"} con actividad{panel.ranking_total > panel.ranking.length ? ` (se muestran ${panel.ranking.length})` : ""}</p></div>
        <label>Ordenar por <select value={orden} onChange={(event) => setOrden(event.target.value as OrdenRanking)}><option value="exitosos">Referidos exitosos</option><option value="ventas">Ventas que trajo</option><option value="credito_ganado">Crédito ganado</option><option value="disponible">Crédito disponible</option></select></label></div>
      {error && <p className="notice" role="alert">{error}</p>}
      {filas.length ? <div className="task-list">{filas.map((f) => <article className="task-card" key={f.paciente_id}>
        <div className="task-status"><span className="status-dot" /></div>
        <div className="task-main"><div className="task-meta"><span>{f.codigo ?? "sin código"}</span><span>{f.exitosos} exitosos</span><span>Ventas {dineroPanel(f.ventas)}</span><span>Ganado {dineroPanel(f.credito_ganado)}</span><span>Disponible {dineroPanel(f.disponible)}</span></div><h2>{f.nombre}</h2></div>
        <div className="task-actions"><button className="outline-action" type="button" disabled={cargando} onClick={() => abrir(f)}>Ver detalle</button></div>
      </article>)}</div> : <section className="empty-state"><Users size={27} /><h3>Sin referidores en este período</h3><p>Cuando alguien recomiende y su referido compre, aparecerá aquí.</p></section>}
    </section>

    {detalle && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-label="Detalle del referidor">
      <button className="modal-close" onClick={() => setDetalle(null)} aria-label="Cerrar"><X size={19} /></button>
      <p className="section-label">REFERIDOR · {detalle.referidor.codigo ?? "sin código"}</p><h2>{detalle.referidor.nombre}</h2>
      <Link className="text-action" href={`/pacientes?paciente=${detalle.referidor.paciente_id}`}><FolderOpen size={14} /> Abrir carpeta</Link>
      <div className="task-meta" style={{ gap: 12, margin: "10px 0" }}>
        <span>Exitosos <strong>{detalle.resumen.exitosos}</strong></span><span>En espera <strong>{detalle.resumen.en_espera}</strong></span><span>Ventas <strong>{dineroPanel(detalle.resumen.ventas)}</strong></span>
        <span>Ganado <strong>{dineroPanel(detalle.resumen.credito_ganado)}</strong></span><span>Usado <strong>{dineroPanel(detalle.resumen.credito_usado)}</strong></span><span>Vencido <strong>{dineroPanel(detalle.resumen.credito_vencido)}</strong></span><span>Disponible hoy <strong>{dineroPanel(detalle.resumen.disponible)}</strong></span>
      </div>
      <h3>Sus referidos del período ({detalle.referidos.length})</h3>
      {detalle.referidos.length ? <div className="task-list">{detalle.referidos.map((r, i) => <article className="task-card" key={i}><div className="task-status" /><div className="task-main"><h2>{r.nombre}</h2><div className="task-meta"><span>{estadoReferidoLabel(r.estado)}</span><span>{fecha(r.creado_en)}</span>{r.sucursal && <span>{r.sucursal}</span>}{r.venta_total !== null && <span>Venta {dineroPanel(r.venta_total)}{r.folio ? ` · folio ${r.folio}` : ""}</span>}<span>Descuento {dineroPanel(r.descuento)}</span>{(r.estado === "en_pago" || r.estado === "recompensado") && <span>Crédito {dineroPanel(r.credito)}</span>}</div></div></article>)}</div> : <p className="field-hint">Sin referidos en este período.</p>}
      <h3>Movimientos de su monedero</h3>
      {detalle.movimientos.length ? <div className="task-list">{detalle.movimientos.map((m, i) => <article className="task-card" key={i}><div className="task-status" /><div className="task-main"><h2>{tipoMovimientoLabel(m.tipo)}: {Number(m.monto) > 0 ? "+" : "−"}{dineroPanel(Math.abs(Number(m.monto)))}</h2><div className="task-meta"><span>{fecha(m.creado_en)}</span>{m.vence_en && <span>Vence {fecha(m.vence_en)}</span>}{m.referido && <span>Por {m.referido}</span>}{m.motivo && <span>{m.motivo}</span>}</div></div></article>)}</div> : <p className="field-hint">Sin movimientos.</p>}
    </section></div>}
  </div></main>;
}
