"use client";
import { buscarPacientesAgenda } from "./actions";
import { formatRecordDate } from "@/lib/record-date";

import Link from "next/link";
import { Building2, CalendarCheck2, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, MessageCircle, Plus, Stethoscope, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { Activity, AgendaData, AgendaStatus, Appointment } from "@/lib/agenda";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { cambiarEstadoActividad, crearActividad, cambiarEstadoCita, crearCita } from "./actions";

const stateLabel: Record<AgendaStatus, string> = { programada: "Programada", confirmada: "Confirmada", atendida: "Atendida", cancelada: "Cancelada", no_asistio: "No asistió" };
const formatDay = (date: Date) => new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
const formatMonth = (date: Date) => new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric" }).format(date);
const formatTime = (value: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const ecuadorDay = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const todayDate = () => new Date(ecuadorDay(new Date()) + "T12:00:00");
const activityLabels: Record<Activity["tipo"], string> = { reunion: "Reunión", campana: "Campaña", convenio: "Visita a convenio", pago: "Pago", capacitacion: "Capacitación", entrega: "Entrega", permiso: "Permiso", vacaciones: "Vacaciones", otro: "Otro" };
const optics = [
  { id: "3bd2a17c-b4e0-4137-a5f3-66475dbcb836", name: "Shuvision", tone: "cal-shuvision" },
  { id: "1db17433-cc24-409f-92d2-794a01ce79d4", name: "Sacha", tone: "cal-sacha" },
  { id: "e2775b83-2105-46a7-8c40-d8de6b3a63dd", name: "Focus", tone: "cal-focus" },
];
const opticTone = (id: string | null) => id === null ? "cal-all" : optics.find((optic) => optic.id === id)?.tone ?? "cal-unspecified";
// Días que ocupa una actividad (permisos y vacaciones pueden durar varios días).
const diasEntre = (desde: string, hasta: string | null) => {
  const dias = [desde];
  if (!hasta || hasta <= desde) return dias;
  const d = new Date(desde + "T12:00:00Z");
  while (dias.length < 120) { d.setUTCDate(d.getUTCDate() + 1); const k = d.toISOString().slice(0, 10); if (k > hasta) break; dias.push(k); }
  return dias;
};
type CalendarItem = { id: string; date: string; time: string; text: string; branchId: string | null; cancelled: boolean };
const dateInputValue = (date: Date) => `${dayKey(date)}T09:00`;
const byDay = (value: string, key: string) => ecuadorDay(value) === key;
const weekdayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Nombre que se ve en el calendario: "Nombres Apellidos" (muchos pacientes de Optox tienen todo en "nombres").
const nombreCorto = (patient?: { nombres: string | null; apellidos: string | null }) => {
  if (!patient) return "Paciente";
  const nombre = `${patient.nombres ?? ""} ${patient.apellidos ?? ""}`.trim().replace(/\s+/g, " ");
  return nombre ? nombre.toLowerCase().replace(/(^|\s)\S/g, (letra) => letra.toUpperCase()) : "Paciente";
};

// Dos agendas separadas (Shuyana 2026-09-30): "citas" = citas de pacientes; "actividades" = actividades de la óptica.
export type AgendaModo = "citas" | "actividades";

export default function AgendaBoard({ modo = "citas", ...props }: AgendaData & { modo?: AgendaModo }) {
  const esCitas = modo === "citas";
  const [view, setView] = useState<"dia" | "mes">("mes");
  const [selectedDate, setSelectedDate] = useState(todayDate); const [showNew, setShowNew] = useState(false); const [notice, setNotice] = useState(props.message ?? ""); const [pending, startTransition] = useTransition();
  const dateKey = dayKey(selectedDate);
  const [branchFilter, setBranchFilter] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [activityError, setActivityError] = useState("");
  const filteredAppointments = useMemo(() => props.appointments.filter((item) => !branchFilter || item.sucursal_atencion_id === branchFilter), [props.appointments, branchFilter]);
  const filteredActivities = useMemo(() => props.activities.filter((item) => !branchFilter || item.sucursal_id === null || item.sucursal_id === branchFilter), [props.activities, branchFilter]);
  const appointments = filteredAppointments.filter((item) => byDay(item.inicio, dateKey));
  const activities = filteredActivities.filter((item) => item.fecha <= dateKey && dateKey <= (item.fecha_fin ?? item.fecha));
  const patientById = useMemo(() => new Map(props.patients.map((patient) => [patient.id, patient])), [props.patients]);
  const companyById = useMemo(() => new Map(props.companies.map((company) => [company.id, company])), [props.companies]);
  const branchById = useMemo(() => new Map(props.branches.map((branch) => [branch.id, branch])), [props.branches]);
  const teamById = useMemo(() => new Map(props.team.map((member) => [member.id, member])), [props.team]);
  const calendarItems = useMemo(() => {
    const items: CalendarItem[] = esCitas ? filteredAppointments.map((item) => ({ id: "cita-" + item.id, date: ecuadorDay(item.inicio), time: formatTime(item.inicio), text: formatTime(item.inicio) + " " + nombreCorto(patientById.get(item.paciente_id)), branchId: item.sucursal_atencion_id, cancelled: item.estado === "cancelada" })) : filteredActivities.flatMap((item) => diasEntre(item.fecha, item.fecha_fin).map((dia) => ({ id: "actividad-" + item.id + "-" + dia, date: dia, time: item.hora_inicio?.slice(0, 5) ?? "", text: (item.estado === "hecha" ? "✓ " : "") + item.titulo + (item.hora_inicio ? " · " + item.hora_inicio.slice(0, 5) : ""), branchId: item.sucursal_id, cancelled: item.estado === "cancelada" })));
    const map = new Map<string, CalendarItem[]>();
    items.sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
    for (const item of items) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  }, [esCitas, filteredAppointments, filteredActivities, patientById]);
  const createActivity = (form: HTMLFormElement) => {
    const data = new FormData(form);
    setActivityError("");
    startTransition(async () => {
      try {
        const result = await crearActividad(data);
        if (result.error) setActivityError(result.error);
        else { setNotice("Actividad registrada en la agenda."); setShowActivity(false); }
      } catch { setActivityError("No se pudo guardar la actividad. Intenta nuevamente."); }
    });
  };
  const changeActivityState = (activity: Activity, state: Activity["estado"]) => startTransition(async () => {
    const data = new FormData(); data.set("actividad_id", activity.id); data.set("estado", state);
    try {
      const result = await cambiarEstadoActividad(data);
      setNotice(result.error ?? "Estado de la actividad actualizado.");
    } catch { setNotice("No se pudo actualizar la actividad. Intenta nuevamente."); }
  });
  const moveDay = (amount: number) => setSelectedDate((current) => { const next = new Date(current); next.setDate(next.getDate() + amount); return next; });
  const moveMonth = (amount: number) => setSelectedDate((current) => { const next = new Date(current); next.setDate(1); next.setMonth(next.getMonth() + amount); return next; });
  const goToDay = (date: Date) => { setSelectedDate(date); setView("dia"); };
  const create = (form: HTMLFormElement) => startTransition(async () => { const result = await crearCita(new FormData(form)); if (result.error) setNotice(result.error); else { setNotice("Cita registrada en la agenda."); setShowNew(false); form.reset(); } });
  const changeState = (appointment: Appointment, state: AgendaStatus) => startTransition(async () => { const data = new FormData(); data.set("cita_id", appointment.id); data.set("estado", state); const result = await cambiarEstadoCita(data); setNotice(result.error ?? (result.success ? `La cita quedó ${stateLabel[state].toLowerCase()}.` : "No se pudo actualizar la cita.")); });

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">ATENCIÓN Y SEGUIMIENTO</p><h1>{esCitas ? "Agenda de citas" : "Agenda de actividades"}</h1><p className="subtitle">{props.message ?? "No se pudo abrir la agenda."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/agenda">Iniciar sesión</Link>}</header></div></main>;

  return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">{esCitas ? "ATENCIÓN A PACIENTES" : "ORGANIZACIÓN DE LAS ÓPTICAS"}</p><h1>{esCitas ? "Agenda de citas" : "Agenda de actividades"}</h1><p className="subtitle">{esCitas ? "Citas de pacientes de las 3 ópticas." : "Reuniones, campañas, visitas a convenios, pagos y pendientes de las ópticas."}</p><nav className="agenda-switch" aria-label="Cambiar de agenda"><Link href="/agenda" className={esCitas ? "active" : ""}>Citas de pacientes</Link><Link href="/agenda/actividades" className={esCitas ? "" : "active"}>Actividades de la óptica</Link></nav></div><div className="cal-header-actions">{esCitas ? <button className="new-task" type="button" onClick={() => setShowNew(true)}><Plus size={18} /> Nueva cita</button> : <button className="new-task" type="button" onClick={() => { setActivityError(""); setShowActivity(true); }}><Plus size={18} /> Nueva actividad</button>}</div></header>{esCitas && <section className="agenda-summary"><article><CalendarCheck2 size={21} /><strong>{appointments.filter((item) => ["programada", "confirmada"].includes(item.estado)).length}</strong><span>citas por atender en el día</span></article><article><Stethoscope size={21} /><strong>{appointments.filter((item) => item.estado === "atendida").length}</strong><span>atendidas en el día</span></article><article><Building2 size={21} /><strong>{new Set(appointments.map((item) => item.empresa_atencion_id)).size}</strong><span>empresas con atención</span></article></section>}<section className="glass agenda-board">
    <div className="tabs cal-filters" role="group" aria-label="Filtrar por óptica">
      {[{ id: "", name: "Todas" }, ...optics].map((optic) => <button key={optic.id} type="button" className={branchFilter === optic.id ? "active" : ""} aria-pressed={branchFilter === optic.id} onClick={() => setBranchFilter(optic.id)}>{optic.name}</button>)}
    </div>
    <div className="cal-legend" aria-label="Colores de las ópticas">{[...optics, { id: "all", name: "Las 3 ópticas", tone: "cal-all" }].map((optic) => <span key={optic.id}><i className={`cal-dot ${optic.tone}`} aria-hidden="true" />{optic.name}</span>)}</div>
    <div className="agenda-toolbar">
      <div className="tabs" role="tablist"><button role="tab" aria-selected={view === "dia"} className={view === "dia" ? "active" : ""} type="button" onClick={() => setView("dia")}>Día</button><button role="tab" aria-selected={view === "mes"} className={view === "mes" ? "active" : ""} type="button" onClick={() => setView("mes")}>Mes</button></div>
      {view === "dia" ? <><button className="date-move" type="button" onClick={() => moveDay(-1)} aria-label="Día anterior"><ChevronLeft size={20} /></button><div><p className="section-label">DÍA SELECCIONADO</p><h2>{formatDay(selectedDate)}</h2></div><button className="date-move" type="button" onClick={() => moveDay(1)} aria-label="Día siguiente"><ChevronRight size={20} /></button></> : <><button className="date-move" type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior"><ChevronLeft size={20} /></button><div><p className="section-label">MES</p><h2>{formatMonth(selectedDate)}</h2></div><button className="date-move" type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente"><ChevronRight size={20} /></button></>}
      <button className="today-action" type="button" onClick={() => setSelectedDate(todayDate())}>Hoy</button>
    </div>
    <div className="notice" role="status"><CircleAlert size={18} /><span>{notice || (esCitas ? "Las citas canceladas se conservan en el historial; no se borran." : "Las actividades sin óptica asignada aparecen en las 3 ópticas.")}</span></div>
    {view === "mes" ? <MonthGrid month={selectedDate} itemsByDay={calendarItems} onSelectDay={goToDay} /> : <>{!esCitas && <section className="cal-activities"><h2>Actividades</h2>
      {activities.length ? activities.map((activity) => <article key={activity.id} className={`glass cal-activity ${opticTone(activity.sucursal_id)} ${activity.estado === "cancelada" ? "cal-cancelled" : ""}`}>
        <div className="appointment-meta"><span>{activityLabels[activity.tipo]}</span><span>{activity.fecha_fin ? `Del ${activity.fecha.slice(8, 10)}/${activity.fecha.slice(5, 7)} al ${activity.fecha_fin.slice(8, 10)}/${activity.fecha_fin.slice(5, 7)}` : activity.hora_inicio ? activity.hora_inicio.slice(0, 5) + (activity.hora_fin ? "–" + activity.hora_fin.slice(0, 5) : "") : "Todo el día"}</span><span>{activity.sucursal_id ? branchById.get(activity.sucursal_id)?.nombre ?? optics.find((optic) => optic.id === activity.sucursal_id)?.name ?? "Óptica" : "Las 3 ópticas"}</span></div>
        <h3>{activity.estado === "hecha" && "✓ "}{activity.titulo}</h3>
        <p><UserRound size={14} /> {activity.responsable_id ? teamById.get(activity.responsable_id)?.nombre ?? "Responsable no disponible" : "Sin responsable asignado"}</p>
        {activity.descripcion && <p className="cal-description">{activity.descripcion}</p>}
        <div className="cal-activity-actions"><span>{activity.estado === "hecha" ? "Hecha" : activity.estado === "cancelada" ? "Cancelada" : "Pendiente"}</span>{activity.estado === "pendiente" && <><button className="outline-action" disabled={pending} onClick={() => changeActivityState(activity, "hecha")}>Marcar hecha</button><button className="outline-action" disabled={pending} onClick={() => changeActivityState(activity, "cancelada")}>Cancelar</button></>}</div>
      </article>) : <p>No hay actividades para este día.</p>}
    </section>}{esCitas && <><h2>Citas</h2>{appointments.length ? <div className="appointment-list">{appointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} patient={patientById.get(appointment.paciente_id)} company={companyById.get(appointment.empresa_atencion_id)?.nombre ?? "Empresa"} branch={appointment.sucursal_atencion_id ? branchById.get(appointment.sucursal_atencion_id)?.nombre : undefined} responsible={appointment.responsable_id ? teamById.get(appointment.responsable_id)?.nombre : undefined} pending={pending} onStateChange={changeState} />)}</div> : <section className="empty-state agenda-empty"><CalendarDays size={28} /><h3>No hay citas para este día</h3><p>{props.patients.length ? "Puedes registrar una cita para Shuvisión o Focus." : "Cuando registremos pacientes, podrás agendarles citas aquí."}</p>{!props.patients.length && <Link className="outline-action" href="/pacientes">Abrir ficha clínica</Link>}</section>}</>}</>}
  </section></div>{showNew && <NewAppointmentModal {...props} onClose={() => setShowNew(false)} onCreate={create} pending={pending} />}{showActivity && <NewActivityModal {...props} date={dateKey} error={activityError} onClose={() => setShowActivity(false)} onCreate={createActivity} pending={pending} />}</main>;
}

function MonthGrid({ month, itemsByDay, onSelectDay }: { month: Date; itemsByDay: Map<string, CalendarItem[]>; onSelectDay: (date: Date) => void }) {
  const year = month.getFullYear(); const monthIndex = month.getMonth();
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey = ecuadorDay(new Date());
  const cells: Array<{ date: Date; inMonth: boolean } | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: new Date(year, monthIndex, day), inMonth: true });
  while (cells.length % 7 !== 0) cells.push(null);

  return <div className="cal-month">
    <div className="cal-weekdays">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div>
    <div className="cal-days">{cells.map((cell, index) => {
      if (!cell) return <div className="cal-cell cal-empty" key={`empty-${index}`} />;
      const key = dayKey(cell.date);
      const items = itemsByDay.get(key) ?? [];
      const isToday = key === todayKey;
      const label = `${formatDay(cell.date)}, ${items.length} eventos. ${items.map((item) => item.text + (item.cancelled ? " (cancelada)" : "")).join("; ")}`;
      return <button type="button" className={`cal-cell ${isToday ? "cal-today" : ""}`} aria-current={isToday ? "date" : undefined} key={key} onClick={() => onSelectDay(cell.date)} aria-label={label}>
        <span className="cal-number">{cell.date.getDate()}</span>
        <span className="cal-chips">{items.slice(0, 3).map((item) => <span key={item.id} title={item.text} className={`cal-chip ${opticTone(item.branchId)} ${item.cancelled ? "cal-cancelled" : ""}`}><span className="cal-chip-text">{item.text}</span></span>)}</span>
        {items.length > 3 && <span className="cal-more">+{items.length - 3} más</span>}
      </button>;
    })}</div>
  </div>;
}

function AppointmentCard({ appointment, patient, company, branch, responsible, pending, onStateChange }: { appointment: Appointment; patient?: { nombres: string; apellidos: string; telefono: string | null }; company: string; branch?: string; responsible?: string; pending: boolean; onStateChange: (appointment: Appointment, state: AgendaStatus) => void }) {
  const patientName = patient ? `${patient.apellidos}, ${patient.nombres}` : "Paciente no disponible";
  const mensaje = `Hola ${patient?.nombres ?? ""}! Te confirmamos tu cita en ${company}${branch ? ` (${branch})` : ""} el ${new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(appointment.inicio))}. ¡Te esperamos!`;
  const wa = patient ? enlaceWhatsapp(patient.telefono, mensaje) : null;
  return <article className={`appointment-card ${appointment.estado} ${appointment.estado === "cancelada" ? "cal-cancelled" : ""}`}><div className="appointment-time"><Clock3 size={18} /><strong>{formatTime(appointment.inicio)}</strong><span>{appointment.duracion_minutos} min</span></div><div className="appointment-main"><div className="appointment-meta"><span>{formatRecordDate(appointment.inicio)}</span><span>{company}{branch ? ` · ${branch}` : ""}</span><span>{appointment.tipo}</span></div><h2>{patientName}</h2><p>{appointment.motivo || "Sin motivo registrado."}</p><div className="appointment-people"><span><UserRound size={14} /> {responsible || "Sin responsable asignado"}</span></div></div><div className="appointment-actions"><span className={`appointment-state ${appointment.estado}`}>{stateLabel[appointment.estado]}</span>{wa && <a href={wa} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}{appointment.estado === "programada" && <button disabled={pending} onClick={() => onStateChange(appointment, "confirmada")}>Confirmar</button>}{["programada", "confirmada"].includes(appointment.estado) && <button disabled={pending} onClick={() => onStateChange(appointment, "atendida")}><Check size={15} /> Atendida</button>}{!["atendida", "cancelada", "no_asistio"].includes(appointment.estado) && <button className="cancel-appointment" disabled={pending} onClick={() => onStateChange(appointment, "cancelada")}>Cancelar</button>}</div></article>;
}

function NewAppointmentModal({ patients, companies, branches, team, profile, onClose, onCreate, pending }: Pick<AgendaData, "patients" | "companies" | "branches" | "team" | "profile"> & { onClose: () => void; onCreate: (form: HTMLFormElement) => void; pending: boolean }) {
  const defaultCompany = profile?.empresa_id ?? companies[0]?.id ?? ""; const [companyId, setCompanyId] = useState(defaultCompany); const branchesForCompany = branches.filter((branch) => branch.empresa_id === companyId);
  const [busqueda, setBusqueda] = useState(""); const [resultados, setResultados] = useState<AgendaData["patients"]>([]); const [seleccionado, setSeleccionado] = useState<AgendaData["patients"][number] | null>(null);
  useEffect(() => { if (busqueda.trim().length < 2 || seleccionado) return; let vigente = true; const timer = window.setTimeout(() => { void buscarPacientesAgenda(busqueda).then((rows) => { if (vigente) setResultados(rows); }).catch(() => { if (vigente) setResultados([]); }); }, 300); return () => { vigente = false; window.clearTimeout(timer); }; }, [busqueda, seleccionado]);
  return <div className="modal-backdrop"><section className="new-patient-modal appointment-modal" role="dialog" aria-modal="true" aria-labelledby="new-appointment-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVA CITA</p><h2 id="new-appointment-title">Agendar atención</h2><p>Elige dónde se atenderá el paciente. La historia clínica seguirá siendo central y compartida.</p><form onSubmit={(event) => { event.preventDefault(); if (seleccionado) onCreate(event.currentTarget); }}><div className="new-patient-form"><div><label>Paciente<input value={busqueda} onChange={(event) => { setBusqueda(event.target.value); setSeleccionado(null); setResultados([]); }} placeholder="Busca por nombre o cédula" autoComplete="off" /></label><input type="hidden" name="paciente_id" value={seleccionado?.id ?? ""} />{!seleccionado && resultados.length > 0 && <div className="task-list">{resultados.map((patient) => <button className="outline-action" type="button" key={patient.id} onClick={() => { setSeleccionado(patient); setBusqueda(`${patient.nombres} ${patient.apellidos}`); setResultados([]); }}>{patient.nombres} {patient.apellidos}{patient.cedula ? ` · ${patient.cedula}` : ""}</button>)}</div>}{!seleccionado && busqueda.length >= 2 && !resultados.length && <p className="field-hint">Sin resultados</p>}</div><label>Fecha y hora<input name="inicio" type="datetime-local" required defaultValue={dateInputValue(new Date())} /></label><label>Empresa<select name="empresa_atencion_id" required value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.nombre}</option>)}</select></label><label>Sucursal<select key={companyId} name="sucursal_atencion_id" defaultValue={companyId === profile?.empresa_id ? profile?.sucursal_id ?? "" : ""}><option value="">Sin sucursal específica</option>{branchesForCompany.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}{branch.ciudad ? ` · ${branch.ciudad}` : ""}</option>)}</select></label><label>Responsable<select name="responsable_id" defaultValue=""><option value="">Sin responsable específico</option>{team.map((member) => <option key={member.id} value={member.id}>{member.nombre} · {member.rol.replace("_", " ")}</option>)}</select></label><label>Duración<select name="duracion_minutos" defaultValue="30">{[15, 20, 30, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}</select></label><label>Tipo<input name="tipo" defaultValue="Consulta optométrica" /></label><label>Motivo<input name="motivo" placeholder="Ej.: Control visual" /></label><label className="task-description">Nota de agenda<textarea name="notas_agenda" placeholder="Información necesaria para organizar la cita, sin escribir detalles clínicos." /></label></div><div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending || !seleccionado} type="submit">{pending ? "Guardando…" : "Registrar cita"}</button></div></form></section></div>;
}

function NewActivityModal({ branches, team, profile, esSuperadmin, date, error, onClose, onCreate, pending }: Pick<AgendaData, "branches" | "team" | "profile" | "esSuperadmin"> & { date: string; error: string; onClose: () => void; onCreate: (form: HTMLFormElement) => void; pending: boolean }) {
  const availableBranches = branches.filter((branch) => esSuperadmin || branch.empresa_id === profile?.empresa_id);
  const defaultBranch = availableBranches.some((branch) => branch.id === profile?.sucursal_id) ? profile?.sucursal_id ?? "" : availableBranches[0]?.id ?? "";
  const [startTime, setStartTime] = useState("");
  return <div className="modal-backdrop" onKeyDown={(event) => { if (event.key === "Escape" && !pending) onClose(); }}>
    <section className="new-patient-modal appointment-modal" role="dialog" aria-modal="true" aria-labelledby="cal-new-title">
      <button className="modal-close" type="button" disabled={pending} onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
      <p className="section-label">NUEVA ACTIVIDAD</p><h2 id="cal-new-title">Organizar una actividad</h2>
      <form onSubmit={(event) => { event.preventDefault(); onCreate(event.currentTarget); }}>
        <div className="new-patient-form">
          <label>Título<input name="titulo" required maxLength={160} autoFocus /></label>
          <label>Fecha<input name="fecha" type="date" required defaultValue={date} /></label>
          <label>Hasta (opcional)<input name="fecha_fin" type="date" min={date} title="Para permisos o vacaciones de varios días" /></label>
          <label>Hora inicio<input name="hora_inicio" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
          <label>Hora fin (opcional)<input name="hora_fin" type="time" min={startTime || undefined} /></label>
          <label>Óptica<select name="sucursal_id" required={!esSuperadmin} defaultValue={defaultBranch}>
            {esSuperadmin ? <option value="">Las 3 ópticas</option> : <option value="" disabled>Selecciona una óptica</option>}
            {availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}
          </select></label>
          <label>Tipo<select name="tipo" required defaultValue="reunion">{Object.entries(activityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Responsable<select name="responsable_id" defaultValue=""><option value="">Sin responsable específico</option>{team.map((member) => <option key={member.id} value={member.id}>{member.nombre}</option>)}</select></label>
          <label className="task-description">Descripción<textarea name="descripcion" /></label>
        </div>
        {error && <p className="cal-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="outline-action" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar actividad"}</button></div>
      </form>
    </section>
  </div>;
}
