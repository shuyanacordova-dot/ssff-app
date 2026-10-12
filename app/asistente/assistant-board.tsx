"use client";

import Link from "next/link";
import { Bot, CheckCheck, CircleAlert, Clipboard, FileBarChart, ListChecks, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { conversarConAsistente, generarAyudaAdministrativa, type MensajeAsistente, type ModeloAsistente, type TareaAsistente } from "./actions";

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
  const [modelo, setModelo] = useState<ModeloAsistente>("chatgpt");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MensajeAsistente[]>([]);
  const [chatError, setChatError] = useState("");

  const send = () => {
    const content = draft.trim();
    if (!content || pending) return;
    const next: MensajeAsistente[] = [...messages.slice(-10), { role: "user", content }];
    setDraft(""); setMessages(next); setChatError("");
    startTransition(async () => {
      try {
        const response = await conversarConAsistente(modelo, next);
        setMessages([...next, { role: "assistant", content: response.text }]);
      } catch (err) { setChatError(err instanceof Error ? err.message : "No se pudo consultar al asistente."); }
    });
  };

  const run = (task: TareaAsistente) => startTransition(async () => {
    setSelected(task); setError(""); setResult(""); setCopied(false);
    try { const response = await generarAyudaAdministrativa(task); setResult(response.text); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo consultar al asistente."); }
  });
  const copy = async () => { try { await navigator.clipboard.writeText(result); setCopied(true); } catch { setCopied(false); } };

  return <main className="page agenda-page assistant-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">FASE 6 · INTELIGENCIA ARTIFICIAL</p><h1>Asistente Shu</h1><p className="subtitle">Plantillas y guías administrativas con tecnología de OpenAI, sin compartir datos de pacientes.</p></div><div className={`assistant-status ${configured ? "ready" : "pending"}`}><span />{configured ? "Conexión privada disponible" : "Pendiente de conectar la clave"}</div></header>

    <section className="assistant-safety"><ShieldCheck size={21} /><div><strong>Conversación privada de solo lectura</strong><p>Puedes conversar con ChatGPT o Claude. El texto que escribas se envía al proveedor elegido; evita incluir nombres, cédulas, teléfonos, historias clínicas, claves o datos bancarios. El asistente todavía no consulta los datos de LumOS y no guarda ni modifica nada.</p></div></section>
    {!configured && <div className="notice"><CircleAlert size={18} /><span>La Fase 6 está construida. Para generar respuestas falta configurar <strong>AI_GATEWAY_API_KEY</strong> únicamente en el servidor.</span></div>}

    <section className="assistant-chat glass" aria-label="Conversación con IA">
      <div className="assistant-chat-head"><div><p className="section-label">CONVERSACIÓN</p><h2>Pregunta lo que necesites</h2></div><div><label htmlFor="assistant-model">Responder con</label><select id="assistant-model" value={modelo} onChange={(event) => { setModelo(event.target.value as ModeloAsistente); setMessages([]); setChatError(""); }}><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option></select></div></div>
      <div className="assistant-messages" aria-live="polite">{messages.length ? messages.map((message, index) => <p className={message.role} key={index}><strong>{message.role === "user" ? "Tú" : modelo === "claude" ? "Claude" : "ChatGPT"}</strong><span>{message.content}</span></p>) : <p className="assistant-chat-empty">Escribe una pregunta general, pide ayuda para redactar o prepara la estructura de un informe.</p>}{pending && <p className="assistant-chat-empty">Preparando respuesta…</p>}</div>
      <form className="assistant-compose" onSubmit={(event) => { event.preventDefault(); send(); }}><label htmlFor="assistant-question" className="sr-only">Tu pregunta</label><textarea id="assistant-question" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder="Escribe tu pregunta sin datos personales ni clínicos…" disabled={!configured || pending} /><button type="submit" disabled={!configured || pending || !draft.trim()}>Enviar</button></form>
      {chatError && <p className="assistant-error"><CircleAlert size={16} /> {chatError}</p>}
    </section>

    <div className="assistant-layout">
      <section className="assistant-task-panel"><p className="section-label">ELIGE UNA TAREA</p><h2>¿Qué quieres preparar?</h2><div className="assistant-task-grid">{tasks.map((task) => { const Icon = task.icon; return <button className={selected === task.id ? "active" : ""} key={task.id} type="button" disabled={!configured || pending} onClick={() => run(task.id)}><span><Icon size={19} /></span><strong>{task.title}</strong><small>{task.detail}</small></button>; })}</div></section>

      <section className="assistant-result glass"><div className="assistant-result-head"><div><Bot size={21} /><span><strong>Resultado del Asistente Shu</strong><small>{selected ? tasks.find((task) => task.id === selected)?.title : "Selecciona una tarea"}</small></span></div>{result && <button className="outline-action" type="button" onClick={copy}><Clipboard size={14} /> {copied ? "Copiado" : "Copiar"}</button>}</div>
        <div className={`assistant-output ${pending ? "loading" : ""}`}>{pending ? <><Sparkles size={25} /><p>Preparando un borrador seguro…</p></> : result ? <p>{result}</p> : <><Bot size={30} /><h3>Tu borrador aparecerá aquí</h3><p>Elige una tarea de la izquierda. Podrás copiar el resultado, revisarlo y completar manualmente los marcadores.</p></>}</div>
        {error && <p className="assistant-error"><CircleAlert size={16} /> {error}</p>}
      </section>
    </div>
  </div></main>;
}

