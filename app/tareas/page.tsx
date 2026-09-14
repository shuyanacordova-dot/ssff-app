"use client";

import { useMemo, useState } from "react";

type Estado = "pendiente" | "en_proceso" | "completada" | "aprobada" | "devuelta";
type Tarea = { id: number; titulo: string; area: "SHUVISION" | "Focus" | "Compartida"; responsable: string; supervisor: string; estado: Estado };

const iniciales: Tarea[] = [
  { id: 1, titulo: "Revisar pedidos pendientes de laboratorio", area: "SHUVISION", responsable: "María", supervisor: "Shuyana · Mamá", estado: "en_proceso" },
  { id: 2, titulo: "Verificar cierre de caja del día", area: "Focus", responsable: "Carlos", supervisor: "Shuyana · Hermano", estado: "completada" },
  { id: 3, titulo: "Actualizar inventario de monturas", area: "Compartida", responsable: "Andrea", supervisor: "Shuyana", estado: "pendiente" },
  { id: 4, titulo: "Contactar pacientes para control visual", area: "SHUVISION", responsable: "María", supervisor: "Mamá", estado: "devuelta" },
];

const nombres: Record<Estado, string> = { pendiente: "Pendiente", en_proceso: "En proceso", completada: "Por revisar", aprobada: "Aprobada", devuelta: "Devuelta" };

export default function TareasPage() {
  const [tareas, setTareas] = useState(iniciales);
  const [vista, setVista] = useState<"mis" | "supervisar">("mis");
  const [aviso, setAviso] = useState("2 tareas requieren revisión");
  const revisar = tareas.filter(t => t.estado === "completada");
  const visibles = vista === "mis" ? tareas : tareas.filter(t => t.estado === "completada" || t.estado === "devuelta");
  const cambiar = (id: number, estado: Estado, mensaje: string) => { setTareas(actual => actual.map(t => t.id === id ? { ...t, estado } : t)); setAviso(mensaje); };
  const resumen = useMemo(() => ({ hacer: tareas.filter(t => t.estado === "pendiente" || t.estado === "en_proceso").length, revision: revisar.length, aprobadas: tareas.filter(t => t.estado === "aprobada").length }), [tareas, revisar.length]);
  return <main style={{ minHeight: "100vh", padding: "32px", background: "linear-gradient(135deg,#eef5ff,#f8f2ff,#eefaf7)", color: "#243047", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 1100, margin: "auto" }}>
      <a href="/" style={{ color: "#43627d", fontWeight: 700, textDecoration: "none" }}>← SHUVISION OS</a>
      <h1 style={{ fontSize: 40, marginBottom: 8 }}>Mis tareas y supervisión</h1>
      <p style={{ color: "#5d6980", fontSize: 17 }}>Cada persona ve lo que debe hacer; los supervisores pueden revisar y aprobar.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "24px 0" }}>
        <Tarjeta titulo="Por hacer" valor={resumen.hacer} color="#e7f3ff" /> <Tarjeta titulo="Por revisar" valor={resumen.revision} color="#fff2d6" /> <Tarjeta titulo="Aprobadas" valor={resumen.aprobadas} color="#e1f7ef" /> <Tarjeta titulo="Equipo supervisor" valor={2} color="#eee8ff" />
      </div>
      <section style={{ background: "rgba(255,255,255,.8)", borderRadius: 24, padding: 22, boxShadow: "0 12px 28px rgba(59,78,108,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div><button onClick={() => setVista("mis")} style={boton(vista === "mis")}>Mis tareas</button><button onClick={() => setVista("supervisar")} style={boton(vista === "supervisar")}>Para supervisar ({resumen.revision})</button></div>
          <button onClick={() => setAviso("La creación se conectará con los usuarios reales en el siguiente bloque")} style={boton(true)}>+ Nueva tarea</button>
        </div>
        <p style={{ background: "#fff5df", padding: 12, borderRadius: 10, color: "#895b0b" }}>{aviso}</p>
        {visibles.map(t => <article key={t.id} style={{ borderTop: "1px solid #e3e8ef", padding: "18px 4px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div><strong style={{ color: t.area === "Focus" ? "#6f4a8e" : "#1c5c73" }}>{t.area}</strong><h2 style={{ margin: "8px 0" }}>{t.titulo}</h2><p style={{ margin: 0, color: "#5e6b80" }}>Responsable: <b>{t.responsable}</b> · Supervisa: <b>{t.supervisor}</b></p></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ padding: "6px 9px", background: "#edf1f5", borderRadius: 8, fontWeight: 700 }}>{nombres[t.estado]}</span>
            {vista === "mis" && t.estado === "pendiente" && <button onClick={() => cambiar(t.id,"en_proceso","La tarea se inició")}>Iniciar</button>}
            {vista === "mis" && t.estado === "en_proceso" && <button onClick={() => cambiar(t.id,"completada","La tarea fue enviada a supervisión")}>Completar</button>}
            {vista === "supervisar" && t.estado === "completada" && <><button onClick={() => cambiar(t.id,"aprobada","La tarea fue aprobada y el responsable fue notificado")}>Aprobar</button><button onClick={() => cambiar(t.id,"devuelta","La tarea fue devuelta para corrección")}>Devolver</button></>}
          </div>
        </article>)}
      </section>
      <p style={{ textAlign: "center", color: "#6e7c90" }}>Prototipo visual de Fase 2. La estructura real de tareas, historial y notificaciones ya está protegida en Supabase.</p>
    </section>
  </main>;
}
function Tarjeta({ titulo, valor, color }: { titulo: string; valor: number; color: string }) { return <div style={{ background: color, borderRadius: 18, padding: 18, minWidth: 160, flex: 1 }}><small>{titulo}</small><strong style={{ display: "block", fontSize: 34 }}>{valor}</strong></div>; }
function boton(activo: boolean) { return { border: 0, borderRadius: 9, padding: "10px 13px", marginRight: 6, background: activo ? "#274c77" : "#e8eff8", color: activo ? "white" : "#244c77", fontWeight: 700, cursor: "pointer" }; }
