"use client";

import Link from "next/link";
import { Bot, CheckCheck, CircleAlert, Clipboard, FileBarChart, ListChecks, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { generarAyudaAdministrativa, type TareaAsistente } from "./actions";

const tasks: Array<{ id: TareaAsistente; title: string; detail: string; icon: typeof MessageCircle }> = [
  { id: "pedido_listo", title: "Pedido listo", detail: "Plantilla para avisar que los lentes pueden retirarse.", icon: CheckCheck },
  { id: "cobro_amable", title: "Cobro mensual", detail: "Recordatorio amable con campos para completar.", icon: MessageCircle },
  { id: "cobro_firme", title: "Cobro insistente", detail: "Mensaje firme y respetuoso para saldos vencidos.", icon: CircleAlert },
  { id: "cierre_dia", title: "Cierre del día", detail: "Checklist operativo de caja y pendientes.", icon: ListChecks },
  { id: "informe_mensual", title: "Informe mensual", detail: "Estructura de resultados por sucursal.", icon: FileBarChart },
];

export default function AssistantBoard({ configured }: { configured: boolean }) {
  const [result, setResult] = useState("");
  const [selected, setSelected] = useState<TareaAsistente | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (task: TareaAsistente) => startTransition(async () => {
    setSelected(task); setError(""); setResult(""); setCopied(false);
    try { const response = await generarAyudaAdministrativa(task); setResult(response.text); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo consultar al asistente."); }
  });
  const copy = async () => { try { await navigator.clipboard.writeText(result); setCopied(true); } catch { setCopied(false); } };

  return <main className="page agenda-page assistant-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">FASE 6 · INTELIGENCIA ARTIFICIAL</p><h1>Asistente Shu</h1><p className="subtitle">Plantillas y guías administrativas con tecnología de OpenAI, sin compartir datos de pacientes.</p></div><div className={`assistant-status ${configured ? "ready" : "pending"}`}><span />{configured ? "Conexión privada disponible" : "Pendiente de conectar la clave"}</div></header>

    <section className="assistant-safety"><ShieldCheck size={21} /><div><strong>Modo protegido de solo lectura</strong><p>Las solicitudes son predefinidas y no contienen nombres, cédulas, teléfonos, diagnósticos, ventas ni información de tu empresa. El resultado es un borrador: nada se envía ni se guarda automáticamente.</p></div></section>
    {!configured && <div className="notice"><CircleAlert size={18} /><span>La Fase 6 está construida. Para generar respuestas falta configurar <strong>AI_GATEWAY_API_KEY</strong> únicamente en el servidor.</span></div>}

    <div className="assistant-layout">
      <section className="assistant-task-panel"><p className="section-label">ELIGE UNA TAREA</p><h2>¿Qué quieres preparar?</h2><div className="assistant-task-grid">{tasks.map((task) => { const Icon = task.icon; return <button className={selected === task.id ? "active" : ""} key={task.id} type="button" disabled={!configured || pending} onClick={() => run(task.id)}><span><Icon size={19} /></span><strong>{task.title}</strong><small>{task.detail}</small></button>; })}</div></section>

      <section className="assistant-result glass"><div className="assistant-result-head"><div><Bot size={21} /><span><strong>Resultado del Asistente Shu</strong><small>{selected ? tasks.find((task) => task.id === selected)?.title : "Selecciona una tarea"}</small></span></div>{result && <button className="outline-action" type="button" onClick={copy}><Clipboard size={14} /> {copied ? "Copiado" : "Copiar"}</button>}</div>
        <div className={`assistant-output ${pending ? "loading" : ""}`}>{pending ? <><Sparkles size={25} /><p>Preparando un borrador seguro…</p></> : result ? <p>{result}</p> : <><Bot size={30} /><h3>Tu borrador aparecerá aquí</h3><p>Elige una tarea de la izquierda. Podrás copiar el resultado, revisarlo y completar manualmente los marcadores.</p></>}</div>
        {error && <p className="assistant-error"><CircleAlert size={16} /> {error}</p>}
      </section>
    </div>
  </div></main>;
}

