"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, ClipboardList, Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { enviarConteo, guardarConteo, iniciarConteo, revisarConteo } from "./actions";

type Branch = { id: string; nombre: string };
type Reciente = { id: string; sucursal_id: string; categoria: string; estado: string; creado_en: string; enviado_en: string | null; revisado_en: string | null; motivo_rechazo: string | null; notas: string | null; diferencias: number };
type Clasif = { clasificacion: string; esperado: number; contado: number | null };
type Item = { producto_id: string; clasificacion: string; esperado: number; contado: number | null; nombre: string; codigo_barra: string | null };
export type ConteoData = { conteo: { id: string; sucursal_id: string; categoria: string; estado: string; creado_en: string; notas: string | null; motivo_rechazo: string | null; clasificaciones: Clasif[]; items: Item[] } | null };

const categoriaLabel: Record<string, string> = { montura: "Armazones", gafas_sol: "Gafas de sol", accesorio: "Accesorios", lente: "Lunas" };
const estadoLabel: Record<string, { texto: string; clase: string }> = {
  en_curso: { texto: "En curso", clase: "na" }, enviado: { texto: "Por aprobar", clase: "warn" },
  aprobado: { texto: "Aprobado y ajustado", clase: "ok" }, rechazado: { texto: "Rechazado", clase: "fail" },
};
const fecha = (v: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
const normalizar = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const entero = (v: string) => v.replace(/[^0-9]/g, "");

function Diferencia({ esperado, contado }: { esperado: number; contado: number | null }) {
  if (contado === null) return <span className="check-badge na">Sin contar</span>;
  const d = contado - esperado;
  if (d === 0) return <span className="check-badge ok">Cuadra</span>;
  return <span className="check-badge fail">{d > 0 ? `Sobra ${d}` : `Falta ${-d}`}</span>;
}

export default function ConteoBoard(props: { status: "ready" | "needs_login"; branches: Branch[]; activaId?: string; aprobables: string[]; recientes: Reciente[] } & Partial<ConteoData>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [sucursalId, setSucursalId] = useState(props.activaId ?? props.branches[0]?.id ?? "");
  const [categoria, setCategoria] = useState("montura");
  const conteo = props.conteo ?? null;
  const [clasifs, setClasifs] = useState<Clasif[]>(conteo?.clasificaciones ?? []);
  const [items, setItems] = useState<Item[]>(conteo?.items ?? []);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [notas, setNotas] = useState("");
  const [motivo, setMotivo] = useState("");
  const [conteoId, setConteoId] = useState(conteo?.id);
  if (conteo?.id !== conteoId) { setConteoId(conteo?.id); setClasifs(conteo?.clasificaciones ?? []); setItems(conteo?.items ?? []); setAbiertas(new Set()); }

  const nombreSucursal = (id: string) => props.branches.find((b) => b.id === id)?.nombre ?? "Sucursal";
  const porAprobar = props.recientes.filter((c) => c.estado === "enviado" && props.aprobables.includes(c.sucursal_id));
  const itemsPorClasif = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) m.set(i.clasificacion, [...(m.get(i.clasificacion) ?? []), i]);
    return m;
  }, [items]);
  const sumaDetalle = (c: string) => (itemsPorClasif.get(c) ?? []).reduce((s, i) => s + (i.contado ?? i.esperado), 0);

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/inventario">← Inventario</Link><h1>Hacer inventario</h1><p className="subtitle">Inicia sesión para contar.</p></div><Link className="primary-link" href="/login?next=/inventario/conteo">Iniciar sesión</Link></header></div></main>;

  const empezar = () => startTransition(async () => {
    setNotice("");
    const r = await iniciarConteo(sucursalId, categoria);
    if (!r.ok) return setNotice(r.error);
    router.push(`/inventario/conteo?id=${r.data}`);
    router.refresh();
  });

  const guardar = (clasificacion: string | null, productoId: string | null, valor: string) => {
    if (!conteo) return;
    const contado = valor === "" ? null : Number(valor);
    if (productoId) setItems((prev) => prev.map((i) => i.producto_id === productoId ? { ...i, contado } : i));
    else setClasifs((prev) => prev.map((c) => c.clasificacion === clasificacion ? { ...c, contado } : c));
    if (clasificacion && !productoId && contado !== null) {
      const c = clasifs.find((x) => x.clasificacion === clasificacion);
      if (c && contado !== c.esperado) setAbiertas((prev) => new Set(prev).add(clasificacion));
    }
    startTransition(async () => {
      const r = await guardarConteo(conteo.id, clasificacion, productoId, contado);
      if (!r.ok) setNotice(r.error);
    });
  };

  const enviar = () => startTransition(async () => {
    if (!conteo) return;
    setNotice("");
    const r = await enviarConteo(conteo.id, notas);
    if (!r.ok) return setNotice(r.error);
    setNotice("Conteo enviado. Ahora debe aprobarlo Shuyana o el encargado de la sucursal.");
    router.refresh();
  });

  const revisar = (aprobar: boolean) => startTransition(async () => {
    if (!conteo) return;
    setNotice("");
    const r = await revisarConteo(conteo.id, aprobar, motivo);
    if (!r.ok) return setNotice(r.error);
    setNotice(aprobar ? `Inventario aprobado: se hicieron ${r.data} ajuste(s) de existencias.` : "Conteo rechazado. El equipo puede empezar uno nuevo.");
    router.refresh();
  });

  const totalEsperado = clasifs.reduce((s, c) => s + c.esperado, 0);
  const totalContado = clasifs.reduce((s, c) => s + (c.contado ?? 0), 0);
  const sinContar = clasifs.filter((c) => c.contado === null).length;
  const diferencias = items.filter((i) => i.contado !== null && i.contado !== i.esperado);
  const editable = conteo?.estado === "en_curso";
  const q = normalizar(busqueda.trim());
  const clasifsVisibles = q ? clasifs.filter((c) => normalizar(c.clasificacion).includes(q) || (itemsPorClasif.get(c.clasificacion) ?? []).some((i) => normalizar(`${i.nombre} ${i.codigo_barra ?? ""}`).includes(q))) : clasifs;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/inventario">← Inventario</Link><p className="eyebrow">OPERACIÓN</p><h1>Hacer inventario</h1><p className="subtitle">Cuenta lo que hay en la vitrina. El sistema compara con lo esperado y el ajuste se aplica solo cuando Shuyana (o Joao en Sacha, Erick en Focus) lo aprueba.</p></div></header>
    {notice && <p className="notice" role="status">{notice}</p>}

    {porAprobar.length > 0 && <section className="glass agenda-board" style={{ marginBottom: 18 }}>
      <p className="section-label">POR APROBAR</p><h2>Conteos esperando tu autorización</h2>
      <div className="task-list">{porAprobar.map((c) => <article className="task-card" key={c.id}><div className="task-status" /><div className="task-main"><h2>{categoriaLabel[c.categoria] ?? c.categoria} · {nombreSucursal(c.sucursal_id)}</h2><p>Enviado {c.enviado_en ? fecha(c.enviado_en) : ""} · {c.diferencias} producto(s) con diferencia{c.notas ? ` · “${c.notas}”` : ""}</p></div><div className="task-actions"><Link className="new-task" href={`/inventario/conteo?id=${c.id}`}>Revisar</Link></div></article>)}</div>
    </section>}

    {!conteo && <section className="glass agenda-board" style={{ marginBottom: 18 }}>
      <p className="section-label">NUEVO CONTEO</p><h2>¿Qué vas a contar?</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800, color: "#5d7086" }}>Sucursal<select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ border: "1px solid #d4e0ea", borderRadius: 9, padding: "9px 10px" }}>{props.branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800, color: "#5d7086" }}>Qué contar<select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ border: "1px solid #d4e0ea", borderRadius: 9, padding: "9px 10px" }}>{Object.entries(categoriaLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <button className="new-task" type="button" disabled={pending || !sucursalId} onClick={empezar}><ClipboardList size={17} /> {pending ? "Preparando…" : "Empezar o continuar conteo"}</button>
      </div>
      <p style={{ fontSize: 13, color: "#66768b", marginTop: 10 }}>Paso 1: cuenta rápido cuántos hay en cada clasificación. Paso 2: solo donde no cuadre, el sistema te pide revisar producto por producto.</p>
    </section>}

    {conteo && <section className="glass agenda-board" style={{ marginBottom: 18 }}>
      <div className="agenda-toolbar"><div><p className="section-label">{nombreSucursal(conteo.sucursal_id).toUpperCase()} · {(categoriaLabel[conteo.categoria] ?? conteo.categoria).toUpperCase()}</p><h2>Conteo del {fecha(conteo.creado_en)}</h2></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`check-badge ${estadoLabel[conteo.estado]?.clase ?? ""}`}>{estadoLabel[conteo.estado]?.texto ?? conteo.estado}</span><Link className="outline-action" href="/inventario/conteo?id=">Cerrar</Link></div></div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, margin: "12px 0" }}>
        <div className="glass clinical-card" style={{ minHeight: "auto", padding: 12 }}><small>En el sistema</small><strong style={{ fontSize: 24, display: "block" }}>{totalEsperado}</strong></div>
        <div className="glass clinical-card" style={{ minHeight: "auto", padding: 12 }}><small>Contado</small><strong style={{ fontSize: 24, display: "block" }}>{totalContado}</strong></div>
        <div className="glass clinical-card" style={{ minHeight: "auto", padding: 12 }}><small>Diferencia</small><strong style={{ fontSize: 24, display: "block", color: totalContado - totalEsperado === 0 ? "#247658" : "#a24150" }}>{totalContado - totalEsperado > 0 ? "+" : ""}{totalContado - totalEsperado}</strong></div>
        <div className="glass clinical-card" style={{ minHeight: "auto", padding: 12 }}><small>Clasificaciones sin contar</small><strong style={{ fontSize: 24, display: "block" }}>{sinContar}</strong></div>
      </div>
      {conteo.motivo_rechazo && <p className="notice">Motivo del rechazo: {conteo.motivo_rechazo}</p>}

      {editable && <>
        <label style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #d4e0ea", borderRadius: 10, padding: "8px 10px", background: "#fff", marginBottom: 10 }}><Search size={16} /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar clasificación, armazón o código de barras" style={{ border: 0, outline: 0, flex: 1, background: "transparent" }} /></label>
        <div className="task-list">{clasifsVisibles.map((c) => {
          const detalle = itemsPorClasif.get(c.clasificacion) ?? [];
          const abierta = abiertas.has(c.clasificacion) || (q !== "" && detalle.some((i) => normalizar(`${i.nombre} ${i.codigo_barra ?? ""}`).includes(q)));
          const suma = sumaDetalle(c.clasificacion);
          const noCuadraDetalle = c.contado !== null && c.contado !== c.esperado && suma !== c.contado;
          return <article key={c.clasificacion} className="task-card" style={{ display: "block" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}><h2 style={{ margin: 0 }}>{c.clasificacion}</h2><p style={{ margin: "2px 0 0" }}>En sistema: <strong>{c.esperado}</strong> · {detalle.length} modelo(s)</p></div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#5d7086" }}>Contados<input inputMode="numeric" defaultValue={c.contado ?? ""} onBlur={(e) => { const v = entero(e.target.value); if (v !== String(c.contado ?? "")) guardar(c.clasificacion, null, v); }} style={{ width: 70, border: "1px solid #d4e0ea", borderRadius: 9, padding: "8px 10px", fontSize: 16, textAlign: "center" }} /></label>
              <Diferencia esperado={c.esperado} contado={c.contado} />
              <button type="button" className="text-action" onClick={() => setAbiertas((prev) => { const n = new Set(prev); if (n.has(c.clasificacion)) n.delete(c.clasificacion); else n.add(c.clasificacion); return n; })}>{abierta ? "Ocultar detalle" : "Ver uno por uno"}</button>
            </div>
            {noCuadraDetalle && <p style={{ color: "#a24150", fontSize: 13, fontWeight: 700, margin: "8px 0 0" }}>No cuadra: revisa uno por uno y corrige los que faltan o sobran. El detalle suma {suma} y contaste {c.contado}.</p>}
            {abierta && <div style={{ marginTop: 10, display: "grid", gap: 6 }}>{detalle.filter((i) => !q || normalizar(c.clasificacion).includes(q) || normalizar(`${i.nombre} ${i.codigo_barra ?? ""}`).includes(q)).map((i) => <div key={i.producto_id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#f6f9fc", borderRadius: 10, padding: "6px 10px" }}>
              <div style={{ flex: 1, minWidth: 160, fontSize: 13 }}><strong>{i.nombre}</strong>{i.codigo_barra && <span style={{ color: "#66768b" }}> · {i.codigo_barra}</span>}<br /><span style={{ color: "#66768b" }}>En sistema: {i.esperado}</span></div>
              <input inputMode="numeric" placeholder={String(i.esperado)} defaultValue={i.contado ?? ""} onBlur={(e) => { const v = entero(e.target.value); if (v !== String(i.contado ?? "")) guardar(null, i.producto_id, v); }} style={{ width: 60, border: "1px solid #d4e0ea", borderRadius: 9, padding: "6px 8px", textAlign: "center" }} aria-label={`Contados de ${i.nombre}`} />
              {i.contado !== null && i.contado !== i.esperado ? <Diferencia esperado={i.esperado} contado={i.contado} /> : <span style={{ fontSize: 11, color: "#66768b" }}>{i.contado === null ? "Vacío = está completo" : "Cuadra"}</span>}
            </div>)}</div>}
          </article>;
        })}</div>
        {clasifs.length === 0 && <section className="empty-state"><ClipboardList size={27} /><h3>No hay productos con existencias</h3><p>En esta sucursal no hay stock registrado de esta categoría.</p></section>}
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas para quien aprueba (opcional)" rows={2} style={{ border: "1px solid #d4e0ea", borderRadius: 10, padding: 10 }} />
          <button className="new-consultation" type="button" disabled={pending || sinContar > 0} onClick={enviar}><ClipboardCheck size={17} /> {sinContar > 0 ? `Faltan ${sinContar} clasificación(es) por contar` : pending ? "Enviando…" : "Enviar para aprobación"}</button>
        </div>
      </>}

      {!editable && <>
        <p className="section-label" style={{ marginTop: 6 }}>DIFERENCIAS ENCONTRADAS</p>
        {diferencias.length ? <div className="task-list">{diferencias.map((i) => <article className="task-card" key={i.producto_id}><div className="task-status" /><div className="task-main"><h2>{i.nombre}</h2><p>{i.clasificacion}{i.codigo_barra ? ` · ${i.codigo_barra}` : ""} · sistema {i.esperado} → contado {i.contado}</p></div><div className="task-actions"><Diferencia esperado={i.esperado} contado={i.contado} /></div></article>)}</div>
          : <section className="empty-state"><CheckCircle2 size={27} /><h3>Todo cuadra</h3><p>No hay existencias que ajustar.</p></section>}
        {conteo.notas && <p style={{ fontSize: 13, color: "#4a5a70" }}>Notas: {conteo.notas}</p>}
        {conteo.estado === "enviado" && (props.aprobables.includes(conteo.sucursal_id)
          ? <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <button className="new-consultation" type="button" disabled={pending} onClick={() => revisar(true)}>{pending ? "Aplicando…" : `Aprobar y ajustar ${diferencias.length} producto(s)`}</button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo si lo rechazas (por ejemplo: volver a contar)" style={{ flex: 1, minWidth: 200, border: "1px solid #d4e0ea", borderRadius: 10, padding: "8px 10px" }} /><button className="outline-action" type="button" disabled={pending} onClick={() => revisar(false)}>Rechazar</button></div>
          </div>
          : <p className="notice">Enviado. Falta que lo apruebe Shuyana o el encargado de la sucursal.</p>)}
      </>}
    </section>}

    <section className="glass agenda-board">
      <p className="section-label">HISTORIAL</p><h2>Conteos recientes</h2>
      {props.recientes.length ? <div className="task-list">{props.recientes.map((c) => <article className="task-card" key={c.id}><div className="task-status" /><div className="task-main"><h2>{categoriaLabel[c.categoria] ?? c.categoria} · {nombreSucursal(c.sucursal_id)}</h2><p>{fecha(c.creado_en)} · {c.diferencias} diferencia(s){c.motivo_rechazo ? ` · Rechazo: ${c.motivo_rechazo}` : ""}</p></div><div className="task-actions"><span className={`check-badge ${estadoLabel[c.estado]?.clase ?? ""}`}>{estadoLabel[c.estado]?.texto ?? c.estado}</span><Link className="outline-action" href={`/inventario/conteo?id=${c.id}`}>Abrir</Link></div></article>)}</div>
        : <section className="empty-state"><ClipboardList size={27} /><h3>Aún no hay conteos</h3><p>Cuando alguien haga inventario aparecerá aquí.</p></section>}
    </section>
  </div></main>;
}
