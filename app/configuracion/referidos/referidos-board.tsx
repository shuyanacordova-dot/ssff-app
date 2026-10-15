"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarProgramaReferidos } from "@/app/referidos/actions";
import type { ReferidosConfigData } from "@/lib/referidos";
import { dinero, type ProgramaReferidos } from "@/lib/referidos-textos";

const categorias: { value: string; label: string }[] = [
  { value: "montura", label: "Armazones" }, { value: "lente", label: "Lunas" }, { value: "accesorio", label: "Accesorios" },
  { value: "gafas_sol", label: "Gafas de sol" }, { value: "servicio", label: "Exámenes y servicios" },
];
const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function ProgramaCard({ programa, onSaved }: { programa: ProgramaReferidos & { empresa_nombre: string }; onSaved: (mensaje: string) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const costoPorVenta = programa.compra_minima > 0 ? ((programa.descuento_bienvenida + programa.credito_por_referido) / programa.compra_minima) * 100 : 0;
  const guardar = (form: HTMLFormElement) => {
    const data = new FormData(form);
    if (data.get("activo") === "si" && !programa.activo && !window.confirm(`Vas a ENCENDER ${programa.nombre}. Se crean los códigos de todos los pacientes de ${programa.empresa_nombre} y el equipo ya podrá usarlos en las ventas. ¿Continuar?`)) return;
    if (programa.recompensas_suspendidas && data.get("recompensas_suspendidas") !== "si" && !window.confirm("Al reanudar se otorgarán las recompensas que estaban en espera. ¿Continuar?")) return;
    start(async () => {
      try { setError(""); await guardarProgramaReferidos(data); onSaved(`${programa.nombre}: configuración guardada.`); }
      catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar."); }
    });
  };
  return (
    <form className="glass agenda-board" onSubmit={(event) => { event.preventDefault(); guardar(event.currentTarget); }}>
      <input type="hidden" name="programa_id" value={programa.id} />
      <p className="section-label">{programa.empresa_nombre.toUpperCase()}</p>
      <h2>{programa.nombre} <span className={`state-pill ${programa.activo ? "aprobada" : ""}`}>{programa.activo ? "Encendido" : "Apagado"}</span></h2>
      {programa.compra_minima > 0 && <p className="field-hint">Beneficio por referido ≈ {costoPorVenta.toFixed(0)} % de la compra mínima ({dinero(programa.descuento_bienvenida)} de descuento + {dinero(programa.credito_por_referido)} de crédito), sin contar bonos.</p>}
      <div className="new-patient-form">
        <label>Nombre comercial<input name="nombre" defaultValue={programa.nombre} required /></label>
        <label>Compra mínima ($)<input name="compra_minima" type="number" min={0} step="0.01" defaultValue={programa.compra_minima} required /></label>
        <label>Descuento de bienvenida ($)<input name="descuento_bienvenida" type="number" min={0} step="0.01" defaultValue={programa.descuento_bienvenida} required /></label>
        <label>Crédito por referido ($)<input name="credito_por_referido" type="number" min={0} step="0.01" defaultValue={programa.credito_por_referido} required /></label>
        <label>Bono a los 3 referidos ($)<input name="bono_3_referidos" type="number" min={0} step="0.01" defaultValue={programa.bono_3_referidos} required /></label>
        <label>Bono a los 5 referidos ($)<input name="bono_5_referidos" type="number" min={0} step="0.01" defaultValue={programa.bono_5_referidos} required /></label>
        <label>Vigencia del crédito (días)<input name="vigencia_credito_dias" type="number" min={1} step={1} defaultValue={programa.vigencia_credito_dias} required /></label>
        <label>Uso máximo por compra (%)<input name="tope_uso_porcentaje" type="number" min={0} max={100} step="0.01" defaultValue={programa.tope_uso_porcentaje} required /></label>
        <label>Presupuesto mensual ($, vacío = sin tope)<input name="presupuesto_mensual" type="number" min={0} step="0.01" defaultValue={programa.presupuesto_mensual ?? ""} /></label>
        <label>Campaña desde<input name="campana_desde" type="date" defaultValue={programa.campana_desde ?? ""} /></label>
        <label>Campaña hasta<input name="campana_hasta" type="date" defaultValue={programa.campana_hasta ?? ""} /></label>
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>Categorías que NO cuentan para la compra mínima ni para el crédito:</p>
      <div className="task-meta" style={{ gap: 12 }}>
        {categorias.map((c) => <label key={c.value} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="categorias_excluidas" value={c.value} defaultChecked={programa.categorias_excluidas.includes(c.value)} /> {c.label}</label>)}
      </div>
      <div className="receta-option" style={{ marginTop: 12 }}>
        <label className="receta-option-header"><input type="checkbox" name="activo" value="si" defaultChecked={programa.activo} /> Programa encendido</label>
        <label className="receta-option-header"><input type="checkbox" name="recompensas_suspendidas" value="si" defaultChecked={programa.recompensas_suspendidas} /> Suspender recompensas temporalmente (los referidos quedan esperando)</label>
      </div>
      {error && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{error}</p>}
      <button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar configuración"}</button>
    </form>
  );
}

const etiquetas: Record<string, string> = { activo: "Encendido", nombre: "Nombre", compra_minima: "Compra mínima", descuento_bienvenida: "Descuento de bienvenida", credito_por_referido: "Crédito por referido", bono_3_referidos: "Bono 3", bono_5_referidos: "Bono 5", vigencia_credito_dias: "Vigencia (días)", tope_uso_porcentaje: "Uso máximo (%)", presupuesto_mensual: "Presupuesto mensual", recompensas_suspendidas: "Recompensas suspendidas", categorias_excluidas: "Categorías excluidas", campana_desde: "Campaña desde", campana_hasta: "Campaña hasta" };

const camposDinero = new Set(["compra_minima", "descuento_bienvenida", "credito_por_referido", "bono_3_referidos", "bono_5_referidos", "presupuesto_mensual"]);

// Muestra un valor del historial en lenguaje de persona: Sí/No, montos con $, listas con comas y "—" si está vacío.
function valorLegible(clave: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (Array.isArray(valor)) return valor.length ? valor.map((v) => categorias.find((c) => c.value === v)?.label ?? String(v)).join(", ") : "—";
  if (camposDinero.has(clave) && Number.isFinite(Number(valor))) return dinero(Number(valor));
  if (clave === "tope_uso_porcentaje" && Number.isFinite(Number(valor))) return `${Number(valor)} %`;
  return String(valor);
}

function cambiosDe(detalle: Record<string, unknown>): string {
  const antes = (detalle.antes ?? {}) as Record<string, unknown>; const despues = (detalle.despues ?? {}) as Record<string, unknown>;
  const lista = Object.keys(etiquetas)
    .map((k) => ({ k, antes: valorLegible(k, antes[k]), despues: valorLegible(k, despues[k]) }))
    .filter((c) => c.antes !== c.despues)
    .map((c) => `${etiquetas[c.k]}: ${c.antes} → ${c.despues}`);
  return lista.length ? lista.join(" · ") : "Sin cambios de valores";
}

export default function ReferidosBoard(props: ReferidosConfigData) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  if (props.status !== "ready") return <section className="glass agenda-board"><p className="section-label">REFERIDOS</p><h2>Referidos y recompensas</h2><p className="notice">{props.message}</p></section>;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="glass agenda-board">
        <p className="section-label">ADMINISTRACIÓN</p>
        <h1>Referidos y recompensas</h1>
        <p className="subtitle">Círculo Shu (SHUVISION) y Focus Friends (Focus) son programas separados: no comparten códigos ni créditos. Los cambios solo afectan a los referidos nuevos.</p>
        {notice && <p className="notice" role="status">{notice}</p>}
      </section>
      {props.programas.map((programa) => <ProgramaCard key={programa.id + programa.activo + programa.compra_minima} programa={programa} onSaved={(mensaje) => { setNotice(mensaje); router.refresh(); }} />)}
      <section className="glass agenda-board">
        <p className="section-label">HISTORIAL DE CAMBIOS</p>
        {props.historial.length === 0 ? <p className="field-hint">Todavía no hay cambios guardados.</p> : <div className="task-list">{props.historial.map((h) => (
          <article className="task-card" key={h.id}><div className="task-status" /><div className="task-main"><h2>{props.programas.find((p) => p.id === h.programa_id)?.nombre ?? "Programa"}</h2><div className="task-meta"><span>{fechaHora(h.creado_en)}</span></div><p className="field-hint">{cambiosDe(h.detalle)}</p></div></article>
        ))}</div>}
      </section>
    </div>
  );
}
