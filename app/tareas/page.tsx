"use client";

import Link from "next/link";
import { Bell, Check, ChevronRight, CircleAlert, ClipboardCheck, Clock3, Eye, Plus, RotateCcw, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

type Estado = "pendiente" | "en_proceso" | "completada" | "en_revision" | "aprobada" | "devuelta";

type Tarea = {
  id: number;
  titulo: string;
  detalle: string;
  area: "SHUVISION" | "Focus" | "Compartida";
  prioridad: "Baja" | "Media" | "Alta" | "Urgente";
  estado: Estado;
  fecha: string;
  responsable: string;
  supervisores: string[];
};

const tareasIniciales: Tarea[] = [
  {
    id: 1,
    titulo: "Revisar pedidos pendientes de laboratorio",
    detalle: "Confirmar fecha de entrega y avisar al paciente si existe una novedad.",
    area: "SHUVISION",
    prioridad: "Alta",
    estado: "en_proceso",
    fecha: "Hoy",
    responsable: "María",
    supervisores: ["Shuyana", "Mamá"],
  },
  {
    id: 2,
    titulo: "Verificar cierre de caja del día",
    detalle: "Comparar efectivo, transferencias y comprobantes antes del cierre.",
    area: "Focus",
    prioridad: "Urgente",
    estado: "completada",
    fecha: "Hoy",
    responsable: "Carlos",
    supervisores: ["Shuyana", "Hermano"],
  },
  {
    id: 3,
    titulo: "Actualizar inventario de monturas",
    detalle: "Registrar los ingresos nuevos y separar los modelos para transferencia.",
    area: "Compartida",
    prioridad: "Media",
    estado: "pendiente",
    fecha: "Mañana",
    responsable: "Andrea",
    supervisores: ["Shuyana"],
  },
  {
    id: 4,
    titulo: "Contactar pacientes para control visual",
    detalle: "Llamar a los pacientes con control recomendado para este mes.",
    area: "SHUVISION",
    prioridad: "Baja",
    estado: "devuelta",
    fecha: "Viernes",
    responsable: "María",
    supervisores: ["Mamá"],
  },
];

const etiquetaEstado: Record<Estado, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completada: "Por revisar",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  devuelta: "Devuelta",
};

export default function TareasPage() {
  const [tareas, setTareas] = useState(tareasIniciales);
  const [vista, setVista] = useState<"mis-tareas" | "supervision">("mis-tareas");
  const [aviso, setAviso] = useState("2 tareas requieren revisión");

  const resumen = useMemo(() => ({
    pendientes: tareas.filter((t) => t.estado === "pendiente" || t.estado === "en_proceso").length,
    revision: tareas.filter((t) => t.estado === "completada" || t.estado === "en_revision").length,
    aprobadas: tareas.filter((t) => t.estado === "aprobada").length,
  }), [tareas]);

  function cambiarEstado(id: number, estado: Estado) {
    setTareas((actuales) => actuales.map((tarea) => tarea.id === id ? { ...tarea, estado } : tarea));
    if (estado === "completada") setAviso("La tarea fue enviada a supervisión");
    if (estado === "aprobada") setAviso("La tarea fue aprobada y el responsable fue notificado");
    if (estado === "devuelta") setAviso("La tarea fue devuelta para corrección");
  }

  const visibles = vista === "supervision"
    ? tareas.filter((tarea) => tarea.estado === "completada" || tarea.estado === "en_revision" || tarea.estado === "devuelta")
    : tareas;

  return (
    <main className="page tasks-page">
      <div className="container tasks-shell">
        <header className="tasks-header">
          <div>
            <Link className="back-link" href="">← SHUVISION OS</Link>
            <p className="eyebrow">OPERACIÓN DEL DÍA</p>
            <h1>Mis tareas y supervisión</h1>
            <p className="subtitle">Cada persona ve lo que debe hacer; los supervisores pueden revisar y aprobar.</p>
          </div>
          <button className="notification" type="button" onClick={() => setAviso("No hay notificaciones nuevas")}> 
            <Bell size={19} />
            <span>{aviso}</span>
          </button>
        </header>

        <section className="summary-grid" aria-label="Resumen de tareas">
          <article className="summary-card sky"><Clock3 size={22} /><span>Por hacer</span><strong>{resumen.pendientes}</strong><small>pendientes o en proceso</small></article>
          <article className="summary-card amber"><Eye size={22} /><span>Por revisar</span><strong>{resumen.revision}</strong><small>necesitan supervisión</small></article>
          <article className="summary-card mint"><Check size={22} /><span>Aprobadas</span><strong>{resumen.aprobadas}</strong><small>tareas finalizadas</small></article>
          <article className="summary-card lilac"><UsersRound size={22} /><span>Equipo</span><strong>2</strong><small>supervisores asignados</small></article>
        </section>

        <section className="glass task-board">
          <div className="board-toolbar">
            <div className="tabs" role="tablist" aria-label="Vista de tareas">
              <button className={vista === "mis-tareas" ? "active" : ""} onClick={() => setVista("mis-tareas")} role="tab">Mis tareas</button>
              <button className={vista === "supervision" ? "active" : ""} onClick={() => setVista("supervision")} role="tab">Para supervisar <span>{resumen.revision}</span></button>
            </div>
            <button className="new-task" type="button" onClick={() => setAviso("La creación de tareas se conectará con los usuarios reales en el siguiente bloque")}> <Plus size={18} /> Nueva tarea</button>
          </div>

          <div className="notice"><CircleAlert size={18} /> <span>{aviso}</span></div>

          <div className="task-list">
            {visibles.map((tarea) => (
              <article className="task-card" key={tarea.id}>
                <div className="task-status"><span className={`status-dot ${tarea.estado}`} /></div>
                <div className="task-main">
                  <div className="task-meta"><span className={`area ${tarea.area.toLowerCase()}`}>{tarea.area}</span><span className={`priority ${tarea.prioridad.toLowerCase()}`}>{tarea.prioridad}</span><span>{tarea.fecha}</span></div>
                  <h2>{tarea.titulo}</h2>
                  <p>{tarea.detalle}</p>
                  <div className="people"><span>Responsable: <strong>{tarea.responsable}</strong></span><span>Supervisa: <strong>{tarea.supervisores.join(" · ")}</strong></span></div>
                </div>
                <div className="task-actions">
                  <span className={`state-pill ${tarea.estado}`}>{etiquetaEstado[tarea.estado]}</span>
                  {vista === "mis-tareas" && tarea.estado === "pendiente" && <button onClick={() => cambiarEstado(tarea.id, "en_proceso")}>Iniciar <ChevronRight size={16} /></button>}
                  {vista === "mis-tareas" && tarea.estado === "en_proceso" && <button onClick={() => cambiarEstado(tarea.id, "completada")}><ClipboardCheck size={16} /> Completar</button>}
                  {vista === "supervision" && (tarea.estado === "completada" || tarea.estado === "en_revision") && <div className="review-buttons"><button className="approve" onClick={() => cambiarEstado(tarea.id, "aprobada")}><Check size={16} /> Aprobar</button><button className="return" onClick={() => cambiarEstado(tarea.id, "devuelta")}><RotateCcw size={16} /> Devolver</button></div>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <p className="prototype-note">Prototipo visual de Fase 2. La estructura real de tareas, historial y notificaciones ya está protegida en Supabase; la conexión de esta pantalla se hará al recuperar la app completa.</p>
      </div>
    </main>
  );
}
