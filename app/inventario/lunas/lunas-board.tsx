"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Glasses, PackagePlus, Pencil, X } from "lucide-react";
import { guardarLunaStock } from "../lunas-actions";

export type LunaStock = {
  id: string; sucursal_id: string; origen: "bodega" | "garantia"; tipo: string; material: string | null; indice: number | null; tratamiento: string | null;
  esfera: number; cilindro: number; eje: number | null; adicion: number | null; diametro: number | null; tallada: boolean; cantidad: number; notas: string | null; creado_en: string;
};
type Props = { status: "ready" | "needs_login" | "forbidden" | "error"; message?: string; lunas: LunaStock[]; branches: { id: string; nombre: string }[]; empresaId: string; empresaNombre?: string; canEdit: boolean };

const fmt = (n: number | null) => n === null || n === undefined ? "" : `${n > 0 ? "+" : ""}${Number(n).toFixed(2)}`;
const tipos = ["monofocal", "bifocal", "progresivo", "otro"];

export default function LunasBoard(props: Props) {
  const [origen, setOrigen] = useState<"todas" | "bodega" | "garantia">("todas");
  const [query, setQuery] = useState("");
  const [sinStock, setSinStock] = useState(false);
  const [editing, setEditing] = useState<LunaStock | "new" | null>(null);
  const branchName = (id: string) => props.branches.find((b) => b.id === id)?.nombre ?? "";
  const visibles = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return props.lunas.filter((l) => (origen === "todas" || l.origen === origen) && (sinStock || l.cantidad > 0) && words.every((w) =>
      `${fmt(l.esfera)} ${fmt(l.cilindro)} ${l.adicion ? fmt(l.adicion) : ""} ${l.tipo} ${l.material ?? ""} ${l.indice ?? ""} ${l.tratamiento ?? ""} ${branchName(l.sucursal_id)} ${l.notas ?? ""}`.toLowerCase().includes(w)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.lunas, origen, query, sinStock]);
  const unidades = (o: "bodega" | "garantia") => props.lunas.filter((l) => l.origen === o).reduce((s, l) => s + l.cantidad, 0);

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/inventario">← Inventario</Link><h1>Banco de lunas</h1><p className="subtitle">{props.message}</p></div></header></div></main>;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/inventario">← Inventario</Link><p className="eyebrow">INVENTARIO · {props.empresaNombre}</p><h1>Banco de lunas</h1><p className="subtitle">Lunas en bodega y lunas nuevas de garantías. Cuando una orden de laboratorio coincide, el sistema avisa.</p></div>
      {props.canEdit && <button className="new-consultation" type="button" onClick={() => setEditing("new")}><PackagePlus size={17} /> Agregar luna</button>}</header>
    <section className="agenda-summary"><article><Glasses size={21} /><strong>{unidades("bodega")}</strong><span>unidades en bodega</span></article><article><Glasses size={21} /><strong>{unidades("garantia")}</strong><span>unidades de garantía</span></article></section>
    <section className="glass agenda-board">
      <div className="agenda-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="tabs">{(["todas", "bodega", "garantia"] as const).map((o) => <button key={o} type="button" className={origen === o ? "active" : ""} onClick={() => setOrigen(o)}>{o === "todas" ? "Todas" : o === "bodega" ? "Bodega" : "Garantía"}</button>)}</div>
        <label className="new-patient-form" style={{ flex: 1, minWidth: 220 }}><input placeholder="Buscar: -1.25, policarbonato, blue…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={sinStock} onChange={(e) => setSinStock(e.target.checked)} /> Mostrar agotadas</label>
      </div>
      {visibles.length ? <div style={{ overflowX: "auto" }}><table className="resumen-table"><thead><tr><th>Origen</th><th>Esfera</th><th>Cilindro</th><th>Add</th><th>Tipo · material · tratamiento</th><th>Sucursal</th><th>Cant.</th>{props.canEdit && <th />}</tr></thead>
        <tbody>{visibles.map((l) => <tr key={l.id}><td>{l.origen === "garantia" ? "Garantía" : "Bodega"}</td><td>{fmt(l.esfera)}</td><td>{l.cilindro ? `${fmt(l.cilindro)}${l.tallada && l.eje !== null ? ` × ${l.eje}°` : ""}` : "—"}</td><td>{l.adicion ? fmt(l.adicion) : "—"}</td>
          <td>{[l.tipo, l.material, l.indice, l.tratamiento, l.tallada ? "tallada" : null].filter(Boolean).join(" · ")}{l.notas ? <small style={{ display: "block" }}>{l.notas}</small> : null}</td><td>{branchName(l.sucursal_id)}</td><td><strong>{l.cantidad}</strong></td>
          {props.canEdit && <td><button className="text-action" type="button" onClick={() => setEditing(l)}><Pencil size={13} /> Editar</button></td>}</tr>)}</tbody></table></div>
        : <section className="empty-state"><Glasses size={27} /><h3>No hay lunas en esta vista</h3><p>Agrega lunas una por una o envía tu inventario en Excel para cargarlo.</p></section>}
    </section>
    {editing && <LunaModal luna={editing === "new" ? null : editing} empresaId={props.empresaId} branches={props.branches} onClose={() => setEditing(null)} />}
  </div></main>;
}

function LunaModal({ luna, empresaId, branches, onClose }: { luna: LunaStock | null; empresaId: string; branches: { id: string; nombre: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="luna-title">
    <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">BANCO DE LUNAS</p><h2 id="luna-title">{luna ? "Editar luna" : "Agregar luna"}</h2>
    <form className="new-patient-form" onSubmit={(event) => {
      event.preventDefault(); setError("");
      const form = new FormData(event.currentTarget);
      startTransition(async () => { try { await guardarLunaStock(form); router.refresh(); onClose(); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar."); } });
    }}>
      <input type="hidden" name="id" value={luna?.id ?? ""} /><input type="hidden" name="empresa_id" value={empresaId} />
      <label>Sucursal<select name="sucursal_id" defaultValue={luna?.sucursal_id ?? branches[0]?.id} required>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
      <label>Origen<select name="origen" defaultValue={luna?.origen ?? "bodega"}><option value="bodega">Bodega (banco de lunas)</option><option value="garantia">Garantía (nueva, reutilizable)</option></select></label>
      <label>Tipo<select name="tipo" defaultValue={luna?.tipo ?? "monofocal"}>{tipos.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</select></label>
      <label>Esfera<input name="esfera" inputMode="decimal" required defaultValue={luna ? String(luna.esfera) : ""} placeholder="-1.25" /></label>
      <label>Cilindro (negativo)<input name="cilindro" inputMode="decimal" defaultValue={luna ? String(luna.cilindro) : "0"} /></label>
      <label>Adición (bifocal/progresivo)<input name="adicion" inputMode="decimal" defaultValue={luna?.adicion ?? ""} /></label>
      <label>Material<input name="material" defaultValue={luna?.material ?? ""} placeholder="CR39, Policarbonato…" /></label>
      <label>Índice<input name="indice" inputMode="decimal" defaultValue={luna?.indice ?? ""} placeholder="1.56" /></label>
      <label>Tratamiento<input name="tratamiento" defaultValue={luna?.tratamiento ?? ""} placeholder="AR, Blue, Fotocromático…" /></label>
      <label>Diámetro (mm)<input name="diametro" inputMode="numeric" defaultValue={luna?.diametro ?? ""} /></label>
      <label>Cantidad (unidades)<input name="cantidad" inputMode="numeric" defaultValue={luna?.cantidad ?? 1} required /></label>
      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" name="tallada" defaultChecked={luna?.tallada ?? false} /> Ya está tallada (cortada)</label>
      <label>Eje (si está tallada)<input name="eje" inputMode="numeric" defaultValue={luna?.eje ?? ""} /></label>
      <label>Notas<textarea name="notas" rows={2} defaultValue={luna?.notas ?? ""} /></label>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button></div>
    </form>
  </section></div>;
}
