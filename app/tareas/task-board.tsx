"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CircleAlert, ClipboardCheck, Eye, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import type { TaskData, TaskRecord, TaskStatus } from "@/lib/tasks";
import { cambiarEstadoTarea, crearTarea } from "./actions";

const labels: Record<TaskStatus, string> = { pendiente: "Pendiente", en_proceso: "En proceso", completada: "Por revisar", en_revision: "Revisando", aprobada: "Aprobada", devuelta: "Devuelta" };
const pretty = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).replace("_", " ");
const pendingStates: TaskStatus[] = ["pendiente", "en_proceso", "devuelta"];
const reviewStates: TaskStatus[] = ["completada", "en_revision"];

export default function TaskBoard(props: TaskData & { embedded?: boolean }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false); const [showMore, setShowMore] = useState(false); const [view, setView] = useState<"asignadas" | "revision" | "completadas">("asignadas"); const [notice, setNotice] = useState(props.message ?? ""); const [pending, startTransition] = useTransition();
  const [tasks, setTasks] = useState(props.tasks);
  useEffect(() => setTasks(props.tasks), [props.tasks]);
  const supervisorIds = new Set(props.supervisorTaskIds);
  const canCreate = props.profile?.rol === "superadmin" || props.profile?.rol === "admin_sucursal";
  const canSupervise = (task: TaskRecord) => supervisorIds.has(task.id) || task.creada_por === props.profile?.id || props.profile?.rol === "superadmin";
  const isRelevant = (task: TaskRecord) => task.asignada_a === props.profile?.id || task.creada_por === props.profile?.id || supervisorIds.has(task.id);
  const asignadas = tasks.filter((task) => isRelevant(task) && pendingStates.includes(task.estado));
  const revision = tasks.filter((task) => isRelevant(task) && reviewStates.includes(task.estado));
  const completadas = tasks.filter((task) => isRelevant(task) && task.estado === "aprobada");
  const visible = view === "revision" ? revision : view === "completadas" ? completadas : asignadas;
  const transition = (task: TaskRecord, status: TaskStatus) => startTransition(async () => { const fd = new FormData(); fd.set("tarea_id", task.id); fd.set("estado", status); const result = await cambiarEstadoTarea(fd); if (result.error) setNotice(result.error); else { setTasks((current) => current.map((item) => item.id === task.id ? { ...item, estado: status } : item)); setNotice(`La tarea “${task.titulo}” fue actualizada.`); router.refresh(); } });
  const create = (form: HTMLFormElement) => startTransition(async () => { const result = await crearTarea(new FormData(form)); if (result.error) setNotice(result.error); else { setNotice("Tarea asignada y supervisión configurada."); setShowNew(false); form.reset(); router.refresh(); } });

  if (props.status !== "ready") {
    const fallback = <header className="tasks-header"><div>{!props.embedded && <Link className="back-link" href="/">← LUMOS</Link>}<p className="eyebrow">OPERACIÓN DEL DÍA</p><h1>Mis tareas y supervisión</h1><p className="subtitle">{props.message ?? "No se pudo abrir el módulo."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/tareas">Iniciar sesión</Link>}</header>;
    return props.embedded ? fallback : <main className="page tasks-page"><div className="container tasks-shell">{fallback}</div></main>;
  }

  const content = <>
    <header className="tasks-header"><div>{!props.embedded && <Link className="back-link" href="/">← LUMOS</Link>}<p className="eyebrow">OPERACIÓN DEL DÍA</p><h1>Mis tareas y supervisión</h1><p className="subtitle">Hola, {props.profile?.nombre}. Aquí ves únicamente las tareas que te corresponden o que debes supervisar.</p></div><button className="notification" type="button" onClick={() => setNotice(props.notifications.length ? `${props.notifications.length} aviso(s) recientes.` : "No tienes avisos nuevos.")}><Bell size={19} /><span>{props.notifications.filter((item) => !item.leida_en).length} avisos sin leer</span></button></header>
    <section className="glass task-board"><div className="board-toolbar"><div className="tabs" role="tablist"><button className={view === "asignadas" ? "active" : ""} onClick={() => setView("asignadas")}>Asignadas <span>{asignadas.length}</span></button><button className={view === "revision" ? "active" : ""} onClick={() => setView("revision")}>Realizadas y por revisión <span>{revision.length}</span></button><button className={view === "completadas" ? "active" : ""} onClick={() => setView("completadas")}>Completadas <span>{completadas.length}</span></button></div>{canCreate && <button className="new-task" type="button" onClick={() => setShowNew(true)}><Plus size={18} /> Nueva tarea</button>}</div><div className="notice"><CircleAlert size={18} /><span>{notice || "La persona responsable confirma cuando termina; después la tarea aparece en supervisión."}</span></div><ul className="task-checklist">{visible.length ? visible.map((task) => <TaskCard key={task.id} task={task} isSupervisor={canSupervise(task)} isAssignee={task.asignada_a === props.profile?.id} pending={pending} onTransition={transition} />) : <section className="empty-state"><ClipboardCheck size={27} /><h3>{view === "revision" ? "No hay tareas realizadas o en revisión" : view === "completadas" ? "Aún no hay tareas completadas" : "No tienes tareas asignadas"}</h3><p>{view === "revision" ? "Cuando una persona confirme una tarea, aparecerá aquí para aprobarla o devolverla." : view === "completadas" ? "Las tareas aprobadas quedarán aquí." : canCreate ? "Puedes crear la primera tarea para tu equipo." : "Cuando te asignen una tarea aparecerá aquí."}</p></section>}</ul></section>
    {props.notifications.length > 0 && <section className="task-notifications"><h2>Avisos recientes</h2>{props.notifications.slice(0, 4).map((item) => <article key={item.id}><Bell size={15} /><div><strong>{item.titulo}</strong><p>{item.mensaje}</p></div></article>)}</section>}
  </>;

  const closeNew = () => { setShowNew(false); setShowMore(false); };
  const modal = showNew && <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="new-task-title"><button className="modal-close" onClick={closeNew} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVA TAREA</p><h2 id="new-task-title">Asignar tarea</h2><p>La persona responsable recibirá un aviso.</p><form onSubmit={(event) => { event.preventDefault(); create(event.currentTarget); }}><div className="new-patient-form"><label>Título<input name="titulo" required placeholder="Ej.: Revisar pedidos de laboratorio" /></label><label>Responsable<select name="asignada_a" required defaultValue=""><option value="" disabled>Selecciona una persona</option>{props.team.map((member) => <option key={member.id} value={member.id}>{member.nombre} · {pretty(member.rol)}</option>)}</select></label><label>Fecha límite<input name="fecha_limite" type="date" /></label><label className="task-description">Descripción<textarea name="descripcion" placeholder="Qué se debe revisar o entregar" /></label></div>
    {!showMore && <button className="text-action" type="button" onClick={() => setShowMore(true)}>+ Prioridad, alcance y supervisores</button>}
    {showMore && <div className="new-patient-form"><label>Prioridad<select name="prioridad" defaultValue="media">{["baja", "media", "alta", "urgente"].map((priority) => <option key={priority} value={priority}>{pretty(priority)}</option>)}</select></label><label>Alcance<select name="alcance" defaultValue="empresa"><option value="empresa">Mi empresa y sucursal</option>{props.profile?.rol === "superadmin" && <option value="compartida">Compartida: todas las sucursales</option>}</select></label></div>}
    {showMore && <fieldset className="supervisor-list"><legend>Supervisión</legend>{props.team.map((member) => <label key={member.id}><input name="supervisores" type="checkbox" value={member.id} defaultChecked={member.id === props.profile?.id} /> {member.nombre}</label>)}</fieldset>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={closeNew}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : "Asignar tarea"}</button></div></form></section></div>;

  if (props.embedded) return <>{content}{modal}</>;
  return <main className="page tasks-page"><div className="container tasks-shell">{content}</div>{modal}</main>;
}

function TaskCard({ task, isSupervisor, isAssignee, pending, onTransition }: { task: TaskRecord; isSupervisor: boolean; isAssignee: boolean; pending: boolean; onTransition: (task: TaskRecord, status: TaskStatus) => void }) {
  const done = task.estado === "aprobada";
  const dueLabel = task.fecha_limite ? new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short" }).format(new Date(`${task.fecha_limite}T12:00:00`)) : null;
  return <li className={`task-row ${task.estado}`}>
    <span className="task-checkbox">{done ? <Check size={14} /> : <span className="task-checkbox-dot" />}</span>
    <div className="task-row-main">
      <div className="task-row-top"><strong>{task.titulo}</strong><span className={`state-pill ${task.estado}`}>{labels[task.estado]}</span></div>
      <div className="task-meta"><span className={`priority ${task.prioridad}`}>{pretty(task.prioridad)}</span><span className={`area ${task.es_compartida ? "compartida" : "shuvision"}`}>{task.es_compartida ? "Compartida" : "Operativa"}</span>{dueLabel && <span>Límite: {dueLabel}</span>}<span>{isAssignee ? "Responsable: Tú" : "Creador o supervisor"}</span></div>
      {task.descripcion && <p>{task.descripcion}</p>}
    </div>
    <div className="task-actions">{isAssignee && task.estado === "pendiente" && <button disabled={pending} onClick={() => onTransition(task, "en_proceso")}>Iniciar</button>}{isAssignee && ["en_proceso", "devuelta"].includes(task.estado) && <button disabled={pending} onClick={() => onTransition(task, "completada")}><ClipboardCheck size={16} /> Completar</button>}{isSupervisor && task.estado === "completada" && <button disabled={pending} onClick={() => onTransition(task, "en_revision")}><Eye size={16} /> Revisar</button>}{isSupervisor && task.estado === "en_revision" && <div className="review-buttons"><button className="approve" disabled={pending} onClick={() => onTransition(task, "aprobada")}><Check size={16} /> Aprobar</button><button className="return" disabled={pending} onClick={() => onTransition(task, "devuelta")}><RotateCcw size={16} /> Devolver</button></div>}</div>
  </li>;
}
