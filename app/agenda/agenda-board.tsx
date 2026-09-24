"use client";
import { formatRecordDate } from "@/lib/record-date";

import Link from "next/link";
import { Building2, CalendarCheck2, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, MessageCircle, Plus, Stethoscope, UserRound, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { AgendaData, AgendaStatus, Appointment } from "@/lib/agenda";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { cambiarEstadoCita, crearCita } from "./actions";

const stateLabel: Record<AgendaStatus, string> = { programada: "Programada", confirmada: "Confirmada", atendida: "Atendida", cancelada: "Cancelada", no_asistio: "No asistió" };
const formatDay = (date: Date) => new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
const formatMonth = (date: Date) => new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric" }).format(date);
const formatTime = (value: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const dateInputValue = (date: Date) => `${dayKey(date)}T09:00`;
const byDay = (value: string, key: string) => dayKey(new Date(value)) === key;
const weekdayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function AgendaBoard(props: AgendaData) {
  const [view, setView] = useState<"dia" | "mes">("dia");
  const [selectedDate, setSelectedDate] = useState(() => new Date()); const [showNew, setShowNew] = useState(false); const [notice, setNotice] = useState(props.message ?? ""); const [pending, startTransition] = useTransition();
  const dateKey = dayKey(selectedDate);
  const appointments = useMemo(() => props.appointments.filter((appointment) => byDay(appointment.inicio, dateKey)), [props.appointments, dateKey]);
  const monthAppointments = useMemo(() => { const key = monthKey(selectedDate); const map = new Map<string, Appointment[]>(); for (const appointment of props.appointments) { const k = dayKey(new Date(appointment.inicio)); if (!k.startsWith(key)) continue; if (!map.has(k)) map.set(k, []); map.get(k)!.push(appointment); } return map; }, [props.appointments, selectedDate]);
  const patientById = useMemo(() => new Map(props.patients.map((patient) => [patient.id, patient])), [props.patients]);
  const companyById = useMemo(() => new Map(props.companies.map((company) => [company.id, company])), [props.companies]);
  const branchById = useMemo(() => new Map(props.branches.map((branch) => [branch.id, branch])), [props.branches]);
  const teamById = useMemo(() => new Map(props.team.map((member) => [member.id, member])), [props.team]);
  const moveDay = (amount: number) => setSelectedDate((current) => { const next = new Date(current); next.setDate(next.getDate() + amount); return next; });
  const moveMonth = (amount: number) => setSelectedDate((current) => { const next = new Date(current); next.setDate(1); next.setMonth(next.getMonth() + amount); return next; });
  const goToDay = (date: Date) => { setSelectedDate(date); setView("dia"); };
  const create = (form: HTMLFormElement) => startTransition(async () => { const result = await crearCita(new FormData(form)); if (result.error) setNotice(result.error); else { setNotice("Cita registrada en la agenda."); setShowNew(false); form.reset(); } });
  const changeState = (appointment: Appointment, state: AgendaStatus) => startTransition(async () => { const data = new FormData(); data.set("cita_id", appointment.id); data.set("estado", state); const result = await cambiarEstadoCita(data); setNotice(result.error ?? (result.success ? `La cita quedó ${stateLabel[state].toLowerCase()}.` : "No se pudo actualizar la cita.")); });

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">ATENCIÓN Y SEGUIMIENTO</p><h1>Agenda de citas</h1><p className="subtitle">{props.message ?? "No se pudo abrir la agenda."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/agenda">Iniciar sesión</Link>}</header></div></main>;

  return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">ATENCIÓN Y SEGUIMIENTO</p><h1>Agenda de citas</h1><p className="subtitle">Agenda única para Shuvisión y Focus. Cada cita conserva la empresa y sucursal donde se atenderá.</p></div><button className="new-task" type="button" onClick={() => setShowNew(true)} disabled={!props.patients.length}><Plus size={18} /> Nueva cita</button></header><section className="agenda-summary"><article><CalendarCheck2 size={21} /><strong>{appointments.filter((item) => ["programada", "confirmada"].includes(item.estado)).length}</strong><span>citas por atender hoy</span></article><article><Stethoscope size={21} /><strong>{appointments.filter((item) => item.estado === "atendida").length}</strong><span>atendidas hoy</span></article><article><Building2 size={21} /><strong>{new Set(appointments.map((item) => item.empresa_atencion_id)).size}</strong><span>empresas con atención</span></article></section><section className="glass agenda-board">
    <div className="agenda-toolbar">
      <div className="tabs" role="tablist"><button role="tab" className={view === "dia" ? "active" : ""} type="button" onClick={() => setView("dia")}>Día</button><button role="tab" className={view === "mes" ? "active" : ""} type="button" onClick={() => setView("mes")}>Mes</button></div>
      {view === "dia" ? <><button className="date-move" type="button" onClick={() => moveDay(-1)} aria-label="Día anterior"><ChevronLeft size={20} /></button><div><p className="section-label">DÍA SELECCIONADO</p><h2>{formatDay(selectedDate)}</h2></div><button className="date-move" type="button" onClick={() => moveDay(1)} aria-label="Día siguiente"><ChevronRight size={20} /></button></> : <><button className="date-move" type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior"><ChevronLeft size={20} /></button><div><p className="section-label">MES</p><h2>{formatMonth(selectedDate)}</h2></div><button className="date-move" type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente"><ChevronRight size={20} /></button></>}
      <button className="today-action" type="button" onClick={() => setSelectedDate(new Date())}>Hoy</button>
    </div>
    <div className="notice"><CircleAlert size={18} /><span>{notice || "Las citas canceladas se conservan en el historial; no se borran."}</span></div>
    {view === "mes" ? <MonthGrid month={selectedDate} appointmentsByDay={monthAppointments} onSelectDay={goToDay} /> : (appointments.length ? <div className="appointment-list">{appointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} patient={patientById.get(appointment.paciente_id)} company={companyById.get(appointment.empresa_atencion_id)?.nombre ?? "Empresa"} branch={appointment.sucursal_atencion_id ? branchById.get(appointment.sucursal_atencion_id)?.nombre : undefined} responsible={appointment.responsable_id ? teamById.get(appointment.responsable_id)?.nombre : undefined} pending={pending} onStateChange={changeState} />)}</div> : <section className="empty-state agenda-empty"><CalendarDays size={28} /><h3>No hay citas para este día</h3><p>{props.patients.length ? "Puedes registrar una cita para Shuvisión o Focus." : "Cuando registremos pacientes, podrás agendarles citas aquí."}</p>{!props.patients.length && <Link className="outline-action" href="/pacientes">Abrir ficha clínica</Link>}</section>)}
  </section></div>{showNew && <NewAppointmentModal {...props} onClose={() => setShowNew(false)} onCreate={create} pending={pending} />}</main>;
}

function MonthGrid({ month, appointmentsByDay, onSelectDay }: { month: Date; appointmentsByDay: Map<string, Appointment[]>; onSelectDay: (date: Date) => void }) {
  const year = month.getFullYear(); const monthIndex = month.getMonth();
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey = dayKey(new Date());
  const cells: Array<{ date: Date; inMonth: boolean } | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: new Date(year, monthIndex, day), inMonth: true });
  while (cells.length % 7 !== 0) cells.push(null);

  return <div className="month-grid">
    <div className="month-grid-weekdays">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div>
    <div className="month-grid-days">{cells.map((cell, index) => {
      if (!cell) return <div className="month-cell empty" key={`empty-${index}`} />;
      const key = dayKey(cell.date);
      const dayAppointments = appointmentsByDay.get(key) ?? [];
      const isToday = key === todayKey;
      const label = `${formatDay(cell.date)}${dayAppointments.length ? `, ${dayAppointments.length} cita${dayAppointments.length === 1 ? "" : "s"}` : ""}`;
      return <button type="button" className={`month-cell ${isToday ? "today" : ""} ${dayAppointments.length ? "has-events" : ""}`} key={key} onClick={() => onSelectDay(cell.date)} aria-label={label}>
        <span className="month-cell-number">{cell.date.getDate()}</span>
        {dayAppointments.length > 0 && <span className="month-cell-count">{dayAppointments.length}</span>}
      </button>;
    })}</div>
  </div>;
}

function AppointmentCard({ appointment, patient, company, branch, responsible, pending, onStateChange }: { appointment: Appointment; patient?: { nombres: string; apellidos: string; telefono: string | null }; company: string; branch?: string; responsible?: string; pending: boolean; onStateChange: (appointment: Appointment, state: AgendaStatus) => void }) {
  const patientName = patient ? `${patient.apellidos}, ${patient.nombres}` : "Paciente no disponible";
  const mensaje = `Hola ${patient?.nombres ?? ""}! Te confirmamos tu cita en ${company}${branch ? ` (${branch})` : ""} el ${new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(appointment.inicio))}. ¡Te esperamos!`;
  const wa = patient ? enlaceWhatsapp(patient.telefono, mensaje) : null;
  return <article className={`appointment-card ${appointment.estado}`}><div className="appointment-time"><Clock3 size={18} /><strong>{formatTime(appointment.inicio)}</strong><span>{appointment.duracion_minutos} min</span></div><div className="appointment-main"><div className="appointment-meta"><span>{formatRecordDate(appointment.inicio)}</span><span>{company}{branch ? ` · ${branch}` : ""}</span><span>{appointment.tipo}</span></div><h2>{patientName}</h2><p>{appointment.motivo || "Sin motivo registrado."}</p><div className="appointment-people"><span><UserRound size={14} /> {responsible || "Sin responsable asignado"}</span></div></div><div className="appointment-actions"><span className={`appointment-state ${appointment.estado}`}>{stateLabel[appointment.estado]}</span>{wa && <a href={wa} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}{appointment.estado === "programada" && <button disabled={pending} onClick={() => onStateChange(appointment, "confirmada")}>Confirmar</button>}{["programada", "confirmada"].includes(appointment.estado) && <button disabled={pending} onClick={() => onStateChange(appointment, "atendida")}><Check size={15} /> Atendida</button>}{!["atendida", "cancelada", "no_asistio"].includes(appointment.estado) && <button className="cancel-appointment" disabled={pending} onClick={() => onStateChange(appointment, "cancelada")}>Cancelar</button>}</div></article>;
}

function NewAppointmentModal({ patients, companies, branches, team, profile, onClose, onCreate, pending }: Pick<AgendaData, "patients" | "companies" | "branches" | "team" | "profile"> & { onClose: () => void; onCreate: (form: HTMLFormElement) => void; pending: boolean }) {
  const defaultCompany = profile?.empresa_id ?? companies[0]?.id ?? ""; const [companyId, setCompanyId] = useState(defaultCompany); const branchesForCompany = branches.filter((branch) => branch.empresa_id === companyId);
  return <div className="modal-backdrop"><section className="new-patient-modal appointment-modal" role="dialog" aria-modal="true" aria-labelledby="new-appointment-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVA CITA</p><h2 id="new-appointment-title">Agendar atención</h2><p>Elige dónde se atenderá el paciente. La historia clínica seguirá siendo central y compartida.</p><form onSubmit={(event) => { event.preventDefault(); onCreate(event.currentTarget); }}><div className="new-patient-form"><label>Paciente<select name="paciente_id" required defaultValue=""><option value="" disabled>Selecciona un paciente</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.apellidos}, {patient.nombres}{patient.cedula ? ` · ${patient.cedula}` : ""}</option>)}</select></label><label>Fecha y hora<input name="inicio" type="datetime-local" required defaultValue={dateInputValue(new Date())} /></label><label>Empresa<select name="empresa_atencion_id" required value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.nombre}</option>)}</select></label><label>Sucursal<select key={companyId} name="sucursal_atencion_id" defaultValue={companyId === profile?.empresa_id ? profile?.sucursal_id ?? "" : ""}><option value="">Sin sucursal específica</option>{branchesForCompany.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}{branch.ciudad ? ` · ${branch.ciudad}` : ""}</option>)}</select></label><label>Responsable<select name="responsable_id" defaultValue=""><option value="">Sin responsable específico</option>{team.map((member) => <option key={member.id} value={member.id}>{member.nombre} · {member.rol.replace("_", " ")}</option>)}</select></label><label>Duración<select name="duracion_minutos" defaultValue="30">{[15, 20, 30, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}</select></label><label>Tipo<input name="tipo" defaultValue="Consulta optométrica" /></label><label>Motivo<input name="motivo" placeholder="Ej.: Control visual" /></label><label className="task-description">Nota de agenda<textarea name="notas_agenda" placeholder="Información necesaria para organizar la cita, sin escribir detalles clínicos." /></label></div><div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : "Registrar cita"}</button></div></form></section></div>;
}
