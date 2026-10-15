"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Calculator, Copy, Plus, Printer, Search, X } from "lucide-react";
import Letterhead, { type CompanyInfo } from "@/app/print-letterhead";
import { printDocumentById } from "@/lib/print-document";

export type LenteCotizador = {
  id: string; nombre: string; codigo: string | null; diseno: string | null; linea: string | null; material: string | null; indice: number | string | null; tecnologia: string | null;
  precio_venta: number | string | null; precio_venta_2: number | string | null; precio_convenio: number | string | null;
};
type Props = { status: "ready" | "needs_login" | "error"; message?: string; lentes: LenteCotizador[]; empresaNombre?: string; membrete?: CompanyInfo | null };
type Tarifa = "mayor" | "menor" | "convenio";

const MAX_FILAS = 60;
const money = (n: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n);
const num = (v: number | string | null | undefined) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
// Lunas (lista oficial): precio_venta = Mayor, precio_venta_2 = Menor, precio_convenio = Convenio (Menor + 8 %).
const precioDe = (l: LenteCotizador, t: Tarifa) => t === "mayor" ? num(l.precio_venta) : t === "menor" ? num(l.precio_venta_2) : num(l.precio_convenio);
const tarifaLabel: Record<Tarifa, string> = { mayor: "Mayor", menor: "Menor", convenio: "Convenio" };
const texto = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const leerMonto = (v: string) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };

export default function CotizadorBoard(props: Props) {
  const [query, setQuery] = useState("");
  const [diseno, setDiseno] = useState("");
  const [material, setMaterial] = useState("");
  const [tarifa, setTarifa] = useState<Tarifa>("mayor");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [armazon, setArmazon] = useState("");
  const [verTodo, setVerTodo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [cliente, setCliente] = useState("");

  const disenos = useMemo(() => Array.from(new Set(props.lentes.map((l) => l.diseno).filter(Boolean) as string[])).sort(), [props.lentes]);
  const materiales = useMemo(() => Array.from(new Set(props.lentes.map((l) => l.material).filter(Boolean) as string[])).sort(), [props.lentes]);
  const visibles = useMemo(() => {
    const palabras = texto(query).split(/\s+/).filter(Boolean);
    return props.lentes.filter((l) => (!diseno || l.diseno === diseno) && (!material || l.material === material)
      && palabras.every((p) => texto(`${l.nombre} ${l.codigo ?? ""} ${l.tecnologia ?? ""}`).includes(p)));
  }, [props.lentes, query, diseno, material]);
  const mostrados = verTodo ? visibles : visibles.slice(0, MAX_FILAS);
  const seleccion = elegidos.map((id) => props.lentes.find((l) => l.id === id)).filter(Boolean) as LenteCotizador[];
  const montoArmazon = leerMonto(armazon);

  const textoCotizacion = () => [
    `Cotización${props.empresaNombre ? ` · ${props.empresaNombre}` : ""} (precio ${tarifaLabel[tarifa].toLowerCase()})`,
    ...(montoArmazon ? [`Armazón: ${money(montoArmazon)}`] : []),
    ...seleccion.map((l) => { const p = precioDe(l, tarifa); return p === null ? `${l.nombre}: sin precio` : `${l.nombre}: ${money(p)}${montoArmazon ? ` · Total ${money(p + montoArmazon)}` : ""}`; }),
  ].join("\n");
  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoCotizacion()); setCopiado(true); window.setTimeout(() => setCopiado(false), 1800); } catch { setCopiado(false); }
  };

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← Inicio</Link><h1>Cotizador de lunas</h1><p className="subtitle">{props.message}</p></div></header></div></main>;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← Inicio</Link><p className="eyebrow">PRECIOS · {props.empresaNombre}</p><h1>Cotizador de lunas</h1><p className="subtitle">Busca la luna, compara precios y arma una cotización.</p></div></header>

    <section className="glass agenda-board">
      <div className="agenda-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <label className="patient-search" style={{ flex: "1 1 240px" }}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, código o tecnología (ej. progresivo blue)" /></label>
        <select value={diseno} onChange={(event) => setDiseno(event.target.value)} aria-label="Diseño"><option value="">Todos los diseños</option>{disenos.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        <select value={material} onChange={(event) => setMaterial(event.target.value)} aria-label="Material"><option value="">Todos los materiales</option>{materiales.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      </div>
      <div className="tabs" style={{ margin: "12px 0" }}>{(["mayor", "menor", "convenio"] as const).map((t) => <button key={t} type="button" className={tarifa === t ? "active" : ""} onClick={() => setTarifa(t)}>{tarifaLabel[t]}</button>)}</div>
      <p className="field-hint">{visibles.length} lunas{!verTodo && visibles.length > MAX_FILAS ? ` · mostrando ${MAX_FILAS}` : ""}. La cotización usa el precio {tarifaLabel[tarifa].toLowerCase()}.</p>

      {seleccion.length > 0 && <section className="glass" style={{ padding: 14, margin: "10px 0", borderRadius: 16 }}>
        <p className="section-label"><Calculator size={14} style={{ verticalAlign: "-2px" }} /> COTIZACIÓN</p>
        <label className="new-patient-form" style={{ gridTemplateColumns: "minmax(0, 220px)", marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Precio del armazón (opcional)</span><input inputMode="decimal" value={armazon} onChange={(event) => setArmazon(event.target.value)} placeholder="0,00" /></label>
        <div className="task-list">{seleccion.map((l) => { const p = precioDe(l, tarifa); return <article className="task-card" key={l.id}><div className="task-main"><h2 style={{ fontSize: 15 }}>{l.nombre}</h2><p>{p === null ? "Sin precio en esta tarifa" : <>Lunas <strong>{money(p)}</strong>{montoArmazon > 0 && <> · Total con armazón <strong>{money(p + montoArmazon)}</strong></>}</>}</p></div><div className="task-actions"><button className="outline-action" type="button" onClick={() => setElegidos((c) => c.filter((id) => id !== l.id))} aria-label="Quitar"><X size={14} /></button></div></article>; })}</div>
        <label className="new-patient-form" style={{ gridTemplateColumns: "minmax(0, 320px)", marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Nombre del cliente (opcional, sale en la hoja impresa)</span><input value={cliente} onChange={(event) => setCliente(event.target.value)} maxLength={120} /></label>
        <div className="modal-actions"><button className="outline-action" type="button" onClick={() => setElegidos([])}>Vaciar</button><button className="outline-action" type="button" onClick={copiar}><Copy size={15} /> {copiado ? "Copiado" : "Copiar cotización"}</button><button className="new-consultation" type="button" onClick={() => printDocumentById("cotizacion-print")}><Printer size={15} /> Imprimir cotización</button></div>
        <div style={{ display: "none" }}><div id="cotizacion-print" className="print-area cotizacion-doc">
          <Letterhead company={props.membrete ?? { nombre: props.empresaNombre ?? "LUMOS" }} />
          <h2>COTIZACIÓN</h2>
          <p><strong>Fecha:</strong> {new Date().toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "long", year: "numeric" })}{cliente.trim() && <> · <strong>Cliente:</strong> {cliente.trim()}</>}</p>
          <table className="resumen-table"><thead><tr><th>Opción de lunas</th><th>Lunas</th>{montoArmazon > 0 && <th>Armazón</th>}{montoArmazon > 0 && <th>Total</th>}</tr></thead><tbody>
            {seleccion.map((l) => { const p = precioDe(l, tarifa); return <tr key={l.id}><td>{l.nombre}</td><td>{p === null ? "—" : money(p)}</td>{montoArmazon > 0 && <td>{money(montoArmazon)}</td>}{montoArmazon > 0 && <td><strong>{p === null ? "—" : money(p + montoArmazon)}</strong></td>}</tr>; })}
          </tbody></table>
          <p className="cotizacion-nota">Cada fila es una opción distinta: no se suman entre sí.</p>
        </div></div>
      </section>}

      <div className="task-list">{mostrados.map((l) => {
        const enCotizacion = elegidos.includes(l.id);
        return <article className="task-card" key={l.id}><div className="task-main">
          <h2 style={{ fontSize: 15 }}>{l.nombre}</h2>
          <div className="consultation-stats">
            {(["mayor", "menor", "convenio"] as const).map((t) => { const p = precioDe(l, t); return <span key={t} style={t === tarifa ? { outline: "2px solid #2f7094" } : undefined}><strong>{tarifaLabel[t]}</strong>{p === null ? "—" : money(p)}</span>; })}
            {l.codigo && <span><strong>Código</strong>{l.codigo}</span>}
          </div>
        </div><div className="task-actions"><button className="outline-action" type="button" disabled={enCotizacion} onClick={() => setElegidos((c) => [...c, l.id])}><Plus size={14} /> {enCotizacion ? "Agregada" : "Cotizar"}</button></div></article>;
      })}</div>
      {!visibles.length && <section className="empty-state"><h3>No hay lunas con ese filtro</h3><p>Prueba con otras palabras o quita un filtro.</p></section>}
      {!verTodo && visibles.length > MAX_FILAS && <div className="tab-actions" style={{ justifyContent: "center", marginTop: 10 }}><button className="outline-action" type="button" onClick={() => setVerTodo(true)}>Ver las {visibles.length} lunas</button></div>}
    </section>
  </div></main>;
}
