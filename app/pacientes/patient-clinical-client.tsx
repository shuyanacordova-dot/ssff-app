"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, ChevronRight, ClipboardPlus, Image as ImageIcon, History, Plus, ReceiptText, Search, ShieldCheck, Stethoscope, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { buscarPacientesClinicos, crearPacienteClinico, obtenerHistorialPaciente } from "./actions";
import ConsultationModal from "./consultation-form";
import ConsultationDetailModal from "./consultation-detail";
import FilesPanel from "./files-panel";
import Cart from "@/app/ventas/cart";
import type { ClinicalData, ClinicalPhoto, Consultation, PatientRecord, PatientSale } from "@/lib/clinical";

const demoPatients: PatientRecord[] = [
  { id: "demo-1", nombres: "Paciente", apellidos: "de ejemplo", cedula: "No es un paciente real", telefono: "", ocupacion: null, responsable_id: null, fecha_nacimiento: null, frecuencia_cobro: null, actualizado_en: "2026-09-15" },
  { id: "demo-2", nombres: "Historia", apellidos: "compartida", cedula: "Solo demostración", telefono: "", ocupacion: null, responsable_id: null, fecha_nacimiento: null, frecuencia_cobro: null, actualizado_en: "2026-09-12" },
];
const fullName = (patient: PatientRecord) => `${patient.nombres} ${patient.apellidos}`;
const initials = (patient: PatientRecord) => `${patient.nombres[0] ?? ""}${patient.apellidos[0] ?? ""}`.toUpperCase();
const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const calcularEdad = (fechaISO: string): number | null => {
  if (!fechaISO) return null;
  const nacimiento = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad >= 0 ? edad : null;
};

export default function PatientClinicalClient(props: ClinicalData & { autoCreate?: boolean }) {
  const demoMode = props.status !== "ready";
  const patients = demoMode ? demoPatients : props.patients;
  const initialIds = useMemo(() => new Set(patients.map((patient) => patient.id)), [patients]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PatientRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [extraPatients, setExtraPatients] = useState<PatientRecord[]>([]);
  const [historial, setHistorial] = useState<Record<string, { consultations: Consultation[]; photos: ClinicalPhoto[]; sales: PatientSale[] }>>({});
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [selectedId, setSelectedId] = useState(patients[0]?.id ?? "");
  const [section, setSection] = useState<"consultations" | "sales" | "files">("consultations");
  const [isCreating, setIsCreating] = useState(!!props.autoCreate && !demoMode);
  const [isConsulting, setIsConsulting] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [viewingConsultation, setViewingConsultation] = useState<Consultation | null>(null);
  const [notice, setNotice] = useState("");
  const [edadNuevoPaciente, setEdadNuevoPaciente] = useState<number | null>(null);
  const [tieneResponsable, setTieneResponsable] = useState(false);
  const [responsableId, setResponsableId] = useState("");
  const [buscarResponsable, setBuscarResponsable] = useState("");
  const [responsableResults, setResponsableResults] = useState<PatientRecord[]>([]);
  const [pending, start] = useTransition();
  const allPatients = useMemo(() => { const map = new Map(patients.map((patient) => [patient.id, patient])); extraPatients.forEach((patient) => map.set(patient.id, patient)); return map; }, [patients, extraPatients]);

  useEffect(() => {
    if (demoMode) return;
    const q = search.trim();
    if (q.length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      buscarPacientesClinicos(q).then((results) => {
        setExtraPatients((prev) => { const map = new Map(prev.map((patient) => [patient.id, patient])); results.forEach((patient) => map.set(patient.id, patient)); return Array.from(map.values()); });
        setSearchResults(results);
      }).catch(() => setSearchResults([])).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, demoMode]);

  useEffect(() => {
    if (demoMode) return;
    const q = buscarResponsable.trim();
    if (q.length < 2) { setResponsableResults([]); return; }
    const timer = setTimeout(() => {
      buscarPacientesClinicos(q).then((results) => {
        setExtraPatients((prev) => { const map = new Map(prev.map((patient) => [patient.id, patient])); results.forEach((patient) => map.set(patient.id, patient)); return Array.from(map.values()); });
        setResponsableResults(results.slice(0, 6));
      }).catch(() => setResponsableResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [buscarResponsable, demoMode]);

  const visible = search.trim().length >= 2 ? searchResults : patients.filter((patient) => `${fullName(patient)} ${patient.cedula ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const selected = allPatients.get(selectedId) ?? patients[0];
  const usingExtraHistorial = !!selected && !initialIds.has(selected.id);
  const consultations = usingExtraHistorial ? (historial[selected.id]?.consultations ?? []) : props.consultations.filter((consultation) => consultation.paciente_id === selected?.id);
  const photos = usingExtraHistorial ? (historial[selected.id]?.photos ?? []) : props.photos.filter((photo) => photo.paciente_id === selected?.id);
  const sales = usingExtraHistorial ? (historial[selected.id]?.sales ?? []) : props.sales.filter((sale) => sale.paciente_id === selected?.id);
  const companyName = (id: string) => props.companies.find((company) => company.id === id)?.nombre ?? "Empresa";

  const selectPatient = (id: string) => {
    setSelectedId(id); setSection("consultations");
    if (!demoMode && !initialIds.has(id) && !historial[id]) {
      setLoadingHistorial(true);
      obtenerHistorialPaciente(id).then((data) => setHistorial((prev) => ({ ...prev, [id]: data }))).catch(() => setNotice("No se pudo cargar el historial de este paciente.")).finally(() => setLoadingHistorial(false));
    }
  };

  const closeCreating = () => { setIsCreating(false); setEdadNuevoPaciente(null); setTieneResponsable(false); setResponsableId(""); setBuscarResponsable(""); setResponsableResults([]); };
  const createPatient = (form: HTMLFormElement) => start(async () => {
    try { const result = await crearPacienteClinico(new FormData(form)); setNotice(result.ya_existia ? "Ya existía una ficha con esa cédula; se vinculó a tu empresa." : "Ficha clínica registrada."); closeCreating(); form.reset(); if (result.paciente_id) setSelectedId(result.paciente_id); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar el paciente."); }
  });
  const responsablesVisibles = buscarResponsable.trim().length >= 2 ? responsableResults : [];
  const responsableElegido = allPatients.get(responsableId);

  return <main className="page clinical-page"><div className="container clinical-shell">
    <header className="clinical-header"><div><Link className="back-link" href="/"><ArrowLeft size={15} /> SHUVISION OS</Link><p className="eyebrow">HISTORIAS CLÍNICAS</p><h1>Pacientes y consulta optométrica</h1><p className="subtitle">Una historia clínica central para SHUVISION y Focus, visible solo para personal clínico autorizado.</p></div><div className="clinical-security"><ShieldCheck size={20} /><span>Acceso clínico protegido</span></div></header>
    <div className="clinical-alert"><ShieldCheck size={17} /><span>{notice || (demoMode ? `${props.message} Se muestran ejemplos, nunca pacientes reales.` : `Sesión clínica de ${props.profile?.nombre}. Los datos se leen con tus permisos.`)}</span>{props.status === "needs_login" && <Link className="login-inline" href="/login?next=/pacientes">Iniciar sesión</Link>}</div>
    <div className="clinical-layout"><aside className="glass patient-sidebar"><div className="sidebar-top"><div><p className="section-label">PACIENTES</p><h2>Buscar historia</h2></div>{!demoMode && <button className="icon-button" onClick={() => setIsCreating(true)} aria-label="Registrar paciente"><Plus size={18} /></button>}</div><label className="patient-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o cédula" /></label><p className="search-hint">{search.trim().length >= 2 ? "Buscando en los 3,000+ pacientes registrados." : "Escribe al menos 2 letras para buscar en todos los pacientes."}</p><div className="patient-list">{searching && <p className="empty-patients">Buscando…</p>}{!searching && visible.map((patient) => <button key={patient.id} className={`patient-row ${patient.id === selected?.id ? "selected" : ""}`} onClick={() => selectPatient(patient.id)}><span className="patient-avatar">{initials(patient)}</span><span className="patient-row-text"><strong>{fullName(patient)}</strong><small>{patient.cedula ?? "Sin cédula"} · {formatDate(patient.actualizado_en)}</small></span><ChevronRight size={16} /></button>)}{!searching && visible.length === 0 && <p className="empty-patients">No se encontraron pacientes.</p>}</div><div className="shared-note"><History size={16} /><span>Las atenciones de SHUVISION y Focus quedan en la misma ficha.</span></div></aside>
    <section className="clinical-main">{selected ? <><article className="glass patient-hero"><div className="patient-identity"><span className="patient-avatar large">{initials(selected)}</span><div><p className="section-label">CARPETA CENTRAL DEL PACIENTE</p><h2>{fullName(selected)}</h2><p>{selected.cedula ?? "Sin cédula"} · {selected.telefono || "Sin WhatsApp"}</p></div></div>{!demoMode && <button className="new-consultation" type="button" onClick={() => setIsConsulting(true)}><ClipboardPlus size={17} /> Nueva revisión</button>}</article>{usingExtraHistorial && loadingHistorial && <p className="empty-patients">Cargando historial…</p>}<nav className="clinical-tabs"><button className={section === "consultations" ? "active" : ""} onClick={() => setSection("consultations")}><Stethoscope size={16} /> Revisiones ({consultations.length})</button><button className={section === "sales" ? "active" : ""} onClick={() => setSection("sales")}><ReceiptText size={16} /> Ventas ({sales.length})</button><button className={section === "files" ? "active" : ""} onClick={() => setSection("files")}><ImageIcon size={16} /> Fotos y documentos</button></nav>
    {section === "consultations" && <section className="clinical-content history-list">{consultations.length ? consultations.map((consultation) => <article className="glass consultation-card" key={consultation.id} onClick={() => setViewingConsultation(consultation)} style={{ cursor: "pointer" }}><div className="consultation-date"><CalendarDays size={17} /><strong>{formatDate(consultation.fecha_consulta)}</strong><span>Consulta clínica</span></div><div><p className="section-label">{consultation.motivo_consulta ?? "Sin motivo registrado"}</p><h3>{consultation.impresion_diagnostica ?? "Sin diagnóstico registrado"}</h3><p>{consultation.plan_manejo ?? "Sin receta registrada"}</p><div className="consultation-stats"><span><strong>AV lejos c/rx antigua OD/OI</strong>{consultation.lensometria?.od_av_lejos || "—"} / {consultation.lensometria?.oi_av_lejos || "—"}</span><span><strong>Rx final OD</strong>{[consultation.refraccion?.od_esfera, consultation.refraccion?.od_cilindro, consultation.refraccion?.od_eje].filter(Boolean).join(" ") || "—"}</span><span><strong>Astigmatismo corneal OD/OI</strong>{consultation.queratometria?.od_astigmatismo || "—"} / {consultation.queratometria?.oi_astigmatismo || "—"}</span></div></div></article>) : <section className="glass empty-state"><Stethoscope size={27} /><h3>Sin consultas registradas</h3><p>La primera consulta se guardará en esta ficha compartida.</p></section>}</section>}
    {section === "sales" && <section className="clinical-content history-list">{!demoMode && <div className="tab-actions"><button className="new-consultation" type="button" onClick={() => setIsSelling(true)}><ReceiptText size={17} /> Nueva venta</button></div>}{sales.length ? sales.map((sale) => <article className="glass consultation-card" key={sale.id}><div className="consultation-date"><ReceiptText size={17} /><strong>{formatTimestamp(sale.creado_en)}</strong><span>{companyName(sale.empresa_id)}</span></div><div><p className="section-label">{sale.estado}</p><h3>{sale.venta_items.map((item) => `${item.descripcion} ×${item.cantidad}`).join(", ") || "Compra sin detalle"}</h3><p>Total: ${Number(sale.total).toFixed(2)} · Pagado: ${Number(sale.pagado).toFixed(2)} · Saldo: ${Number(sale.saldo).toFixed(2)}</p></div></article>) : <section className="glass empty-state"><ReceiptText size={27} /><h3>Sin compras registradas</h3><p>Las ventas que se registren para este paciente aparecerán aquí, aunque se hayan realizado en SHUVISION o Focus.</p></section>}</section>}
    {section === "files" && <FilesPanel pacienteId={selected.id} photos={photos} consultations={consultations} onNotice={setNotice} />}
    </> : <section className="glass empty-state"><Search size={27} /><h3>No hay pacientes para mostrar</h3><p>Los pacientes autorizados aparecerán aquí.</p></section>}</section></div>
  </div>
  {isCreating && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-patient-title"><button className="modal-close" onClick={closeCreating} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVA FICHA</p><h2 id="new-patient-title">Registrar paciente</h2><p>Guarda una ficha clínica central; no crea ventas, caja ni inventario. Si la cédula ya existe, se vincula a tu empresa en vez de duplicarse.</p><form onSubmit={(event) => { event.preventDefault(); createPatient(event.currentTarget); }}><div className="new-patient-form"><label>Nombres<input name="nombres" required /></label><label>Apellidos<input name="apellidos" required /></label><label>Cédula<input name="cedula" /></label><label>WhatsApp<span style={{ display: "flex", gap: 6 }}><span style={{ display: "grid", placeItems: "center", padding: "0 10px", border: "1px solid #d4e0ea", borderRadius: 9, color: "#5d7086", fontWeight: 800, fontSize: 13 }}>+593</span><input name="telefono" type="tel" inputMode="numeric" maxLength={9} pattern="9[0-9]{8}" placeholder="9XXXXXXXX" title="9 dígitos, empieza con 9" style={{ flex: 1 }} /></span></label><label>Correo<input name="email" type="email" /></label><label>Sexo<select name="sexo" defaultValue=""><option value="">Sin especificar</option><option value="femenino">Femenino</option><option value="masculino">Masculino</option><option value="otro">Otro</option></select></label><label>Fecha de nacimiento<input name="fecha_nacimiento" type="date" onChange={(event) => { const edad = calcularEdad(event.target.value); setEdadNuevoPaciente(edad); if (edad !== null && edad < 18) setTieneResponsable(true); }} /></label><label>Edad<input value={edadNuevoPaciente === null ? "" : `${edadNuevoPaciente} años`} disabled placeholder="Se calcula sola" /></label><label className="task-description">Ocupación<input name="ocupacion" placeholder="Ej.: Estudiante, chofer, comerciante" /></label></div>
    <label className="receta-option-header" style={{ marginTop: 12 }}><input type="checkbox" checked={tieneResponsable} onChange={(event) => { setTieneResponsable(event.target.checked); if (!event.target.checked) { setResponsableId(""); setBuscarResponsable(""); } }} /> Responsable de la cuenta (menor de edad u otra persona a cargo de la deuda)</label>
    {tieneResponsable && <div className="new-patient-form" style={{ marginTop: 8 }}>
      <input type="hidden" name="responsable_id" value={responsableId} />
      <label className="task-description">Buscar responsable ya registrado<input value={buscarResponsable} onChange={(event) => { setBuscarResponsable(event.target.value); setResponsableId(""); }} placeholder="Nombre o cédula del responsable" /></label>
      {responsableElegido ? <p className="field-hint">Responsable seleccionado: <strong>{fullName(responsableElegido)}</strong> · {responsableElegido.cedula ?? "sin cédula"} <button type="button" className="text-action" onClick={() => { setResponsableId(""); setBuscarResponsable(""); }}>Quitar</button></p> : responsablesVisibles.length > 0 && <div className="patient-list">{responsablesVisibles.map((patient) => <button key={patient.id} type="button" className="patient-row" onClick={() => { setResponsableId(patient.id); setBuscarResponsable(fullName(patient)); }}><span className="patient-avatar">{initials(patient)}</span><span className="patient-row-text"><strong>{fullName(patient)}</strong><small>{patient.cedula ?? "Sin cédula"}</small></span></button>)}</div>}
      <p className="field-hint">Si el responsable no existe todavía, guarda primero su propia ficha y luego vincúlalo aquí buscándolo por nombre o cédula.</p>
    </div>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={closeCreating}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar ficha clínica"}</button></div></form></section></div>}
  {isConsulting && selected && <ConsultationModal pacienteId={selected.id} onClose={() => setIsConsulting(false)} onSaved={setNotice} />}
  {isSelling && selected && !demoMode && <div className="modal-backdrop"><div className="sale-modal-shell"><button className="modal-close" onClick={() => setIsSelling(false)} aria-label="Cerrar"><X size={19} /></button><Cart products={props.products} stock={props.stock} companies={props.companies} branches={props.branches} patients={[selected]} empresasConvenio={props.empresasConvenio} defaultCompany={props.companies[0]?.id ?? ""} defaultBranch="" defaultPacienteId={selected.id} lockPatient onDone={(message) => { setNotice(message); setSection("sales"); setIsSelling(false); }} /></div></div>}
  {viewingConsultation && selected && <ConsultationDetailModal consultation={viewingConsultation} patientName={fullName(selected)} onClose={() => setViewingConsultation(null)} />}
  </main>;
}
