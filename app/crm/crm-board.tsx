"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarHeart, FolderOpen, MessageCircle, Search, Users } from "lucide-react";
import { motivoLabels, type CrmData, type CrmItem, type CrmMotivo, type NoContactarItem } from "@/lib/crm-labels";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { mensajeLentesListos } from "@/lib/mensajes";
import { formatRecordDate } from "@/lib/record-date";
import { marcarContactoCrm } from "./actions";
import { marcarNoContactar } from "@/app/mensajes/actions";
import { buscarPacientesClinicos } from "@/app/pacientes/actions";
import BotonNoContactar from "@/app/no-contactar-button";

type Pestana = CrmMotivo | "no_contactar";
const motivos: CrmMotivo[] = ["examen_sin_compra", "lentes_listos", "control", "postventa", "cumpleanos", "inactivo"];

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0]?.toLowerCase().replace(/^./, (c) => c.toUpperCase()) ?? "";

function mensaje(item: CrmItem, empresa: string) {
  const n = primerNombre(item.nombre);
  switch (item.motivo) {
    case "control": return `Hola ${n}, te saludamos de ${empresa}. Ya te corresponde tu control visual. ¿Te agendamos una cita esta semana?`;
    case "examen_sin_compra": return `Hola ${n}, te saludamos de ${empresa}. Gracias por realizar tu examen visual con nosotros. ¿Pudiste elegir tus lentes? Te ayudamos con opciones y facilidades de pago.`;
    case "lentes_listos": return mensajeLentesListos({ nombre: item.nombre, empresa });
    case "postventa": return `Hola ${n}, te saludamos de ${empresa}. ¿Cómo te has adaptado a tus nuevos lentes? Si sientes alguna molestia, con gusto te ayudamos.`;
    case "cumpleanos": return `¡Feliz cumpleaños, ${n}! De parte de todo el equipo de ${empresa} te deseamos un excelente día.`;
    case "inactivo": return `Hola ${n}, te saludamos de ${empresa}. Hace tiempo no revisamos tu visión. ¿Te gustaría agendar un control?`;
  }
}

function detalle(item: CrmItem) {
  const fecha = item.fecha_referencia ? formatRecordDate(item.fecha_referencia) : "";
  switch (item.motivo) {
    case "control": return `${item.detalle}${fecha ? ` · ${fecha}` : ""}`;
    case "examen_sin_compra": return `Examen del ${fecha} sin compra`;
    case "lentes_listos": return `Lentes listos desde el ${fecha}`;
    case "postventa": return `Lentes entregados el ${fecha}`;
    case "cumpleanos": return `Cumple el ${fecha}`;
    case "inactivo": return `Última visita o compra: ${fecha}`;
  }
}

const claveItem = (i: CrmItem) => `${i.motivo}-${i.paciente_id}-${i.referencia_id ?? ""}`;

export default function CrmBoard(props: CrmData) {
  const router = useRouter();
  const [tab, setTab] = useState<Pestana>("examen_sin_compra");
  const [enviados, setEnviados] = useState<string[]>([]);
  const [sinContacto, setSinContacto] = useState<string[]>([]);
  const [aviso, setAviso] = useState("");
  const visiblesItems = useMemo(() => props.items.filter((i) => !sinContacto.includes(i.paciente_id) && !enviados.includes(claveItem(i))), [props.items, sinContacto, enviados]);
  const counts = useMemo(() => Object.fromEntries(motivos.map((m) => [m, visiblesItems.filter((i) => i.motivo === m).length])) as Record<CrmMotivo, number>, [visiblesItems]);
  const visibles = tab === "no_contactar" ? [] : visiblesItems.filter((i) => i.motivo === tab);

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">RELACIÓN CON PACIENTES</p><h1>A quién contactar hoy</h1><p className="subtitle">{props.message ?? "No se pudo abrir el CRM."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/crm">Iniciar sesión</Link>}</header></div></main>;

  const enviar = (item: CrmItem, abrirWhatsapp: boolean) => {
    if (!props.empresaId) return;
    if (abrirWhatsapp) {
      const url = enlaceWhatsapp(item.telefono, mensaje(item, props.empresaNombre ?? ""));
      if (!url) return;
      const ventana = window.open(url, "_blank");
      if (!ventana) { setAviso("Permite las ventanas emergentes para abrir WhatsApp."); return; }
      ventana.opener = null;
    }
    const clave = claveItem(item);
    setEnviados((prev) => [...prev, clave]);
    setAviso(`Enviado ✓ · ${item.nombre}`);
    void marcarContactoCrm({ pacienteId: item.paciente_id, empresaId: props.empresaId, sucursalId: item.sucursal_id, motivo: item.motivo, referenciaId: item.referencia_id }).catch((err) => {
      setEnviados((prev) => prev.filter((c) => c !== clave));
      setAviso(err instanceof Error ? err.message : "No se pudo registrar el envío.");
    });
  };

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">RELACIÓN CON PACIENTES · {props.empresaNombre}</p><h1>A quién contactar hoy</h1><p className="subtitle">Nada se envía solo.</p></div></header>
    <section className="agenda-summary"><article><Users size={21} /><strong>{visiblesItems.length}</strong><span>pacientes por contactar</span></article><article><CalendarHeart size={21} /><strong>{counts.cumpleanos}</strong><span>cumpleaños esta semana</span></article><article><Ban size={21} /><strong>{props.noContactar.length}</strong><span>no contactar</span></article></section>
    {aviso && <div className="notice" role="status"><span>{aviso}</span></div>}
    <section className="glass agenda-board">
      <div className="agenda-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="tabs" role="tablist">{motivos.map((m) => <button key={m} role="tab" type="button" className={tab === m ? "active" : ""} onClick={() => setTab(m)}>{motivoLabels[m]} ({counts[m]})</button>)}<button role="tab" type="button" className={tab === "no_contactar" ? "active" : ""} onClick={() => setTab("no_contactar")}>No contactar ({props.noContactar.length})</button></div>
        {props.branches.length > 1 && <div className="tabs">{[{ id: "todas", nombre: "Todas" }, ...props.branches].map((b) => <Link key={b.id} className={props.sucursalId === b.id ? "active" : ""} href={`/crm?sucursal=${b.id}`}>{b.nombre}</Link>)}</div>}
      </div>
      {tab === "no_contactar" ? <NoContactarPanel lista={props.noContactar} puedeRestaurar={!!props.puedeRestaurar} onCambio={() => router.refresh()} /> : <>
        <div className="cob-heading"><div><p><strong>{visibles.length}</strong> mensajes pendientes en esta lista</p></div>
          <button className="new-consultation" type="button" disabled={!visibles.length} onClick={() => { const primero = visibles[0]; if (primero) enviar(primero, !!enlaceWhatsapp(primero.telefono, "")); }}>Modo seguido · Siguiente</button></div>
        {visibles.length ? <div className="task-list">{visibles.map((item) => {
          const tieneWhatsapp = !!enlaceWhatsapp(item.telefono, "");
          return <article className="task-card" key={claveItem(item)}>
            <div className="task-status"><span className="status-dot" /></div>
            <div className="task-main"><div className="task-meta"><span>{motivoLabels[item.motivo]}</span>{item.telefono && <span>{item.telefono}</span>}{item.ultimo_contacto && <span>Último contacto {formatRecordDate(item.ultimo_contacto)}</span>}</div>
              <h2>{item.nombre}</h2><p>{detalle(item)}</p></div>
            <div className="task-actions">
              {tieneWhatsapp ? <button className="new-consultation" type="button" onClick={() => enviar(item, true)}><MessageCircle size={14} /> Enviar por WhatsApp</button> : <><span className="field-hint">Sin teléfono</span><button className="outline-action" type="button" onClick={() => enviar(item, false)}>Marcar como avisado</button></>}
              <Link className="text-action" href={`/pacientes?buscar=${encodeURIComponent(item.nombre.trim())}`}><FolderOpen size={14} /> Abrir carpeta</Link>
              <BotonNoContactar className="outline-action" pacienteId={item.paciente_id} nombre={item.nombre} onDone={() => { setSinContacto((prev) => [...prev, item.paciente_id]); router.refresh(); }} />
            </div>
          </article>;
        })}</div> : <section className="empty-state"><Users size={27} /><h3>Nada pendiente en esta lista</h3><p>Cuando haya pacientes para contactar aparecerán aquí.</p></section>}
      </>}
    </section>
  </div></main>;
}

// Pacientes que no se deben contactar por ningún motivo (problemas con la óptica u otra circunstancia).
function NoContactarPanel({ lista, puedeRestaurar, onCambio }: { lista: NoContactarItem[]; puedeRestaurar: boolean; onCambio: () => void }) {
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<{ id: string; nombres: string; apellidos: string; telefono: string | null }[] | null>(null);
  const [buscando, startBuscar] = useTransition();
  const [error, setError] = useState("");
  const idsMarcados = new Set(lista.map((p) => p.paciente_id));
  const buscar = () => startBuscar(async () => {
    setError("");
    try { setResultados(await buscarPacientesClinicos(consulta)); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo buscar."); }
  });
  const permitir = (id: string) => startBuscar(async () => {
    setError("");
    try { await marcarNoContactar(id, false); onCambio(); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo actualizar."); }
  });
  return <div>
    <p className="field-hint">Estos pacientes no aparecen en cobros, cumpleaños, controles, seguimiento ni CRM. Su ficha y su deuda se conservan.</p>
    <form className="agenda-toolbar" style={{ gap: 8, flexWrap: "wrap" }} onSubmit={(event) => { event.preventDefault(); if (consulta.trim().length >= 2) buscar(); }}>
      <label className="patient-search" style={{ flex: "1 1 260px" }}><Search size={16} /><input value={consulta} onChange={(event) => setConsulta(event.target.value)} placeholder="Buscar un paciente para marcarlo como no contactar" /></label>
      <button className="outline-action" type="submit" disabled={buscando || consulta.trim().length < 2}>Buscar</button>
    </form>
    {error && <p className="notice" role="alert">{error}</p>}
    {resultados && <div className="task-list" style={{ margin: "10px 0" }}>{resultados.length ? resultados.map((p) => <article className="task-card" key={p.id}><div className="task-status"><span className="status-dot" /></div><div className="task-main"><h2>{`${p.nombres} ${p.apellidos}`.trim()}</h2>{p.telefono && <p>{p.telefono}</p>}</div><div className="task-actions">{idsMarcados.has(p.id) ? <span className="field-hint">Ya está en la lista</span> : <BotonNoContactar className="outline-action" pacienteId={p.id} nombre={`${p.nombres} ${p.apellidos}`.trim()} onDone={() => { setResultados(null); setConsulta(""); onCambio(); }} />}</div></article>) : <p className="field-hint">No se encontró ningún paciente.</p>}</div>}
    {lista.length ? <div className="task-list">{lista.map((p) => <article className="task-card" key={p.paciente_id}>
      <div className="task-status"><span className="status-dot" /></div>
      <div className="task-main"><div className="task-meta">{p.telefono && <span>{p.telefono}</span>}{p.desde && <span>Desde {formatRecordDate(p.desde)}</span>}{p.marcado_por && <span>Marcado por {p.marcado_por}</span>}</div><h2>{p.nombre}</h2>{p.motivo && <p>{p.motivo}</p>}</div>
      <div className="task-actions"><Link className="text-action" href={`/pacientes?buscar=${encodeURIComponent(p.nombre.trim())}`}><FolderOpen size={14} /> Abrir carpeta</Link>{puedeRestaurar && <button className="outline-action" type="button" disabled={buscando} onClick={() => permitir(p.paciente_id)}>Volver a permitir contacto</button>}</div>
    </article>)}</div> : <section className="empty-state"><Ban size={27} /><h3>Ningún paciente marcado</h3><p>Usa el botón "No contactar" en cualquier mensaje o búscalo arriba.</p></section>}
  </div>;
}
