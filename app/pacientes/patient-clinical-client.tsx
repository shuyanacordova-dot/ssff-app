"use client";
import { formatRecordDate } from "@/lib/record-date";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, ChevronRight, ClipboardPlus, FlaskConical, Pencil, Image as ImageIcon, History, Plus, ReceiptText, Search, ShieldCheck, Stethoscope, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { actualizarPacienteClinico, buscarPacientesClinicos, crearPacienteClinico, obtenerHistorialPaciente } from "./actions";
import ConsultationModal from "./consultation-form";
import ConsultationDetailModal from "./consultation-detail";
import FilesPanel from "./files-panel";
import Cart from "@/app/ventas/cart";
import { AnularModal, GarantiaModal, ReciboModal, SaleCard, VentaDetailModal } from "@/app/ventas/sales-board";
import LabOrderModal from "@/app/ventas/lab-order-modal";
import { anularVenta, registrarAbono } from "@/app/ventas/actions";
import { crearGarantia } from "@/app/ventas/garantia-actions";
import type { ClinicalData, ClinicalPhoto, Consultation, PatientRecord, PatientSale } from "@/lib/clinical";
import type { Garantia, SaleLabOrder } from "@/lib/ventas";
import { estadoOrdenLabels, laboratorioLabels, normalizarEstadoOrden, tipoLenteLabels, type LaboratorioProveedor, type TipoLente } from "@/lib/laboratorio";
import { branchLetterhead } from "@/lib/sucursales";

const demoPatients: PatientRecord[] = [
  { id: "demo-1", nombres: "Paciente", apellidos: "de ejemplo", cedula: "No es un paciente real", telefono: "", email: null, direccion: null, sexo: null, ocupacion: null, responsable_id: null, fecha_nacimiento: null, frecuencia_cobro: null, empresa_origen_id: null, origen_sucursal_id: null, empresa_ids: [], sucursal_ids: [], actualizado_en: "2026-09-15" },
  { id: "demo-2", nombres: "Historia", apellidos: "compartida", cedula: "Solo demostración", telefono: "", email: null, direccion: null, sexo: null, ocupacion: null, responsable_id: null, fecha_nacimiento: null, frecuencia_cobro: null, empresa_origen_id: null, origen_sucursal_id: null, empresa_ids: [], sucursal_ids: [], actualizado_en: "2026-09-12" },
];
const money = (n: number) => `$${Number(n).toFixed(2)}`;
const fullName = (patient: PatientRecord) => `${patient.nombres} ${patient.apellidos}`;
const initials = (patient: PatientRecord) => `${patient.nombres[0] ?? ""}${patient.apellidos[0] ?? ""}`.toUpperCase();
const formatDate = formatRecordDate;
const formatTimestamp = formatRecordDate;
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
  const router = useRouter();
  const demoMode = props.status !== "ready";
  const patients = demoMode ? demoPatients : props.patients;
  const initialIds = useMemo(() => new Set(patients.map((patient) => patient.id)), [patients]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PatientRecord[]>([]);
  const [searchBranchId, setSearchBranchId] = useState(props.profile?.sucursal_id ?? "all");
  const [historyBranchId, setHistoryBranchId] = useState("all");
  const [searching, setSearching] = useState(false);
  const [extraPatients, setExtraPatients] = useState<PatientRecord[]>([]);
  const [historial, setHistorial] = useState<Record<string, { consultations: Consultation[]; photos: ClinicalPhoto[]; sales: PatientSale[]; labOrders: SaleLabOrder[]; garantias: Garantia[] }>>({});
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [section, setSection] = useState<"consultations" | "sales" | "files" | "laboratory">("consultations");
  const [isCreating, setIsCreating] = useState(!!props.autoCreate && !demoMode);
  const [editingPatient, setEditingPatient] = useState<PatientRecord | null>(null);
  const [showLabSalePicker, setShowLabSalePicker] = useState(false);
  const [patientFormError, setPatientFormError] = useState("");
  const [isConsulting, setIsConsulting] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [viewingConsultation, setViewingConsultation] = useState<Consultation | null>(null);
  const [editingConsultation, setEditingConsultation] = useState<Consultation | null>(null);
  const [viewingSale, setViewingSale] = useState<PatientSale | null>(null);
  const [labOrderContext, setLabOrderContext] = useState<{ sale: PatientSale; orderId?: string; esGarantia?: boolean; ordenOriginalId?: string | null } | null>(null);
  const [reciboSale, setReciboSale] = useState<PatientSale | null>(null);
  const [garantiaModal, setGarantiaModal] = useState<{ defaultVentaId?: string } | null>(null);
  const [anulling, setAnulling] = useState<PatientSale | null>(null);
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

  const visible = search.trim().length >= 2
    ? searchResults.filter((patient) => searchBranchId === "all" || patient.sucursal_ids.includes(searchBranchId))
    : [];
  const selected = selectedId ? allPatients.get(selectedId) : undefined;
  const usingExtraHistorial = !!selected && !initialIds.has(selected.id);
  const consultations = usingExtraHistorial ? (historial[selected.id]?.consultations ?? []) : props.consultations.filter((consultation) => consultation.paciente_id === selected?.id);
  const photos = usingExtraHistorial ? (historial[selected.id]?.photos ?? []) : props.photos.filter((photo) => photo.paciente_id === selected?.id);
  const sales = usingExtraHistorial ? (historial[selected.id]?.sales ?? []) : props.sales.filter((sale) => sale.paciente_id === selected?.id);
  const visibleConsultations = consultations.filter((consultation) => historyBranchId === "all" || consultation.sucursal_atencion_id === historyBranchId);
  const visibleSales = sales.filter((sale) => historyBranchId === "all" || sale.sucursal_id === historyBranchId);
  const patientBranchIds = useMemo(() => new Set([
    ...(selected?.sucursal_ids ?? []),
    ...consultations.map((consultation) => consultation.sucursal_atencion_id).filter((id): id is string => Boolean(id)),
    ...sales.map((sale) => sale.sucursal_id).filter((id): id is string => Boolean(id)),
  ]), [selected, consultations, sales]);
  const patientBranches = props.branches.filter((branch) => patientBranchIds.has(branch.id));
  const originCompany = selected?.empresa_origen_id ? props.companies.find((company) => company.id === selected.empresa_origen_id) : undefined;
  const originBranch = selected?.origen_sucursal_id ? props.branches.find((branch) => branch.id === selected.origen_sucursal_id) : undefined;
  const fromAnotherCompany = Boolean(selected?.empresa_origen_id && props.profile?.empresa_id && selected.empresa_origen_id !== props.profile.empresa_id);
  const saleIds = useMemo(() => new Set(sales.map((sale) => sale.id)), [sales]);
  const labOrders = usingExtraHistorial ? (historial[selected?.id ?? ""]?.labOrders ?? []) : props.labOrders.filter((order) => saleIds.has(order.venta_id));
  const garantias = usingExtraHistorial ? (historial[selected?.id ?? ""]?.garantias ?? []) : props.garantias.filter((garantia) => saleIds.has(garantia.venta_id));
  const companyName = (id: string) => props.companies.find((company) => company.id === id)?.nombre ?? "Empresa";
  const productoById = useMemo(() => new Map(props.products.map((product) => [product.id, product])), [props.products]);
  const lensItemsFor = (sale: PatientSale) => sale.venta_items;
  const labOrderItemsFor = (sale: PatientSale) => lensItemsFor(sale);
  const eligibleLabSales = sales.filter((sale) => sale.estado === "completada");
  const canEditPatient = ["superadmin", "admin_sucursal", "optometra", "vendedor", "caja"].includes(props.profile?.rol ?? "")
    && (props.profile?.rol === "superadmin" || !!selected?.empresa_ids.includes(props.profile?.empresa_id ?? ""));
  const canAnular = props.profile?.rol === "superadmin";
  const canAuthorClinical = props.profile?.rol !== "vendedor";
  const abonar = (sale: PatientSale, data: FormData) => start(async () => { data.set("venta_id", sale.id); try { await registrarAbono(data); setNotice("Abono registrado."); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar el abono."); } });
  const anular = (sale: PatientSale, motivo: string) => start(async () => { const data = new FormData(); data.set("venta_id", sale.id); data.set("motivo", motivo); try { await anularVenta(data); setNotice("Venta anulada."); setAnulling(null); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo anular la venta."); } });
  const crearGarantiaSubmit = (form: HTMLFormElement) => start(async () => {
    try {
      const garantiaId = await crearGarantia(new FormData(form));
      const ventaId = new FormData(form).get("venta_id") as string;
      const tipo = new FormData(form).get("tipo") as string;
      setNotice("Garantía registrada.");
      setGarantiaModal(null);
      form.reset();
      if (tipo === "luna") { const sale = sales.find((s) => s.id === ventaId); if (sale) setLabOrderContext({ sale, esGarantia: true }); }
      void garantiaId;
    } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar la garantía."); }
  });

  const selectPatient = (id: string) => {
    setShowLabSalePicker(false); setSelectedId(id); setSection("consultations"); setHistoryBranchId("all");
    if (!demoMode && !initialIds.has(id) && !historial[id]) {
      setLoadingHistorial(true);
      obtenerHistorialPaciente(id).then((data) => setHistorial((prev) => ({ ...prev, [id]: data }))).catch(() => setNotice("No se pudo cargar el historial de este paciente.")).finally(() => setLoadingHistorial(false));
    }
  };

  const closeCreating = () => { setEditingPatient(null); setPatientFormError(""); setIsCreating(false); setEdadNuevoPaciente(null); setTieneResponsable(false); setResponsableId(""); setBuscarResponsable(""); setResponsableResults([]); };
  const refreshPatientHistory = () => {
    router.refresh();
    if (selected && usingExtraHistorial) {
      const id = selected.id;
      obtenerHistorialPaciente(id).then((data) => setHistorial((prev) => ({ ...prev, [id]: data })))
        .catch(() => setNotice("Los cambios se guardaron, pero no se pudo recargar el historial. Vuelve a abrir la carpeta."));
    }
  };
  const openEditing = () => {
    if (!selected || !canEditPatient) return;
    setEditingPatient(selected);
    setPatientFormError("");
    setEdadNuevoPaciente(calcularEdad(selected.fecha_nacimiento ?? ""));
    setTieneResponsable(!!selected.responsable_id);
    setResponsableId(selected.responsable_id ?? "");
    setBuscarResponsable("");
    setResponsableResults([]);
  };
  const updatePatient = (form: HTMLFormElement) => start(async () => {
    if (!editingPatient) return;
    try {
      const data = new FormData(form);
      data.set("paciente_id", editingPatient.id);
      const { patient } = await actualizarPacienteClinico(data);
      setExtraPatients((prev) => [...prev.filter((item) => item.id !== patient.id), patient]);
      setSearchResults((prev) => prev.map((item) => item.id === patient.id ? patient : item));
      setNotice("Datos del paciente actualizados.");
      closeCreating();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo actualizar el paciente.";
      setNotice(message); setPatientFormError(message);
    }
  });
  const createPatient = (form: HTMLFormElement) => start(async () => {
    try {
      const result = await crearPacienteClinico(new FormData(form));
      setExtraPatients((prev) => { const map = new Map(prev.map((patient) => [patient.id, patient])); map.set(result.patient.id, result.patient); return Array.from(map.values()); });
      const company = result.patient.empresa_origen_id ? props.companies.find((item) => item.id === result.patient.empresa_origen_id)?.nombre : null;
      setNotice(result.ya_existia ? `Este paciente ya tenía una ficha${company ? ` en ${company}` : ""}. Se vinculó a la sucursal actual y puedes consultar todas sus revisiones y compras.` : "Ficha clínica registrada.");
      closeCreating(); form.reset(); selectPatient(result.patient.id);
    }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar el paciente."); }
  });
  const responsablesVisibles = buscarResponsable.trim().length >= 2 ? responsableResults.filter((patient) => patient.id !== editingPatient?.id) : [];
  const responsableElegido = allPatients.get(responsableId);

  return <main className="page clinical-page"><div className="container clinical-shell">
    <header className="clinical-header"><div><Link className="back-link" href="/"><ArrowLeft size={15} /> LUMOS</Link><p className="eyebrow">HISTORIAS CLÍNICAS</p><h1>Pacientes y consulta optométrica</h1><p className="subtitle">Una historia clínica central para SHUVISION y Focus, visible solo para personal clínico autorizado.</p></div><div className="clinical-security"><ShieldCheck size={20} /><span>Acceso clínico protegido</span></div></header>
    <div className="clinical-alert"><ShieldCheck size={17} /><span>{notice || (demoMode ? `${props.message} Se muestran ejemplos, nunca pacientes reales.` : `Sesión clínica de ${props.profile?.nombre}. Los datos se leen con tus permisos.`)}</span>{props.status === "needs_login" && <Link className="login-inline" href="/login?next=/pacientes">Iniciar sesión</Link>}</div>
    <div className="clinical-layout"><aside className="glass patient-sidebar">
      <div className="sidebar-top"><div><p className="section-label">PACIENTES</p><h2>Buscar historia</h2></div>{!demoMode && <button className="icon-button" type="button" onClick={() => setIsCreating(true)} aria-label="Registrar paciente"><Plus size={18} /></button>}</div>
      <label className="patient-search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedId(""); }} placeholder="Nombre o cédula" /></label>
      <p className="search-hint">{search.trim().length >= 2 ? "Buscando en todos los pacientes registrados." : "Escribe al menos 2 letras para buscar en todos los pacientes."}</p>
      {props.branches.length > 1 && <div className="branch-filter-buttons compact" aria-label="Filtrar pacientes por sucursal"><button type="button" className={searchBranchId === "all" ? "active" : ""} onClick={() => setSearchBranchId("all")}>Todas</button>{props.branches.map((branch) => <button type="button" key={branch.id} className={searchBranchId === branch.id ? "active" : ""} onClick={() => setSearchBranchId(branch.id)}>{branch.nombre}</button>)}</div>}
      <div className="patient-list">{searching && <p className="empty-patients">Buscando…</p>}{!searching && visible.map((patient) => <button type="button" key={patient.id} className={`patient-row ${patient.id === selected?.id ? "selected" : ""}`} onClick={() => selectPatient(patient.id)}><span className="patient-avatar">{initials(patient)}</span><span className="patient-row-text"><strong>{fullName(patient)}</strong><small>{patient.cedula ?? "Sin cédula"} · {patient.empresa_origen_id ? props.companies.find((company) => company.id === patient.empresa_origen_id)?.nombre ?? "Origen compartido" : "Sin origen registrado"}</small></span><ChevronRight size={16} /></button>)}{!searching && search.trim().length >= 2 && visible.length === 0 && <p className="empty-patients">No se encontraron pacientes en esta sucursal.</p>}</div>
      <div className="shared-note"><History size={16} /><span>Las atenciones de SHUVISION y Focus quedan en la misma ficha.</span></div>
    </aside>
    <section className="clinical-main">{selected ? <>
      <article className="glass patient-hero"><div className="patient-identity"><span className="patient-avatar large">{initials(selected)}</span><div><p className="section-label">CARPETA CENTRAL DEL PACIENTE</p><h2>{fullName(selected)}</h2><p>{selected.cedula ?? "Sin cédula"} · {selected.telefono || "Sin WhatsApp"}</p></div></div>{!demoMode && canEditPatient && <button className="outline-action" type="button" onClick={openEditing}><Pencil size={16} /> Editar datos</button>}{!demoMode && canAuthorClinical && <button className="new-consultation" type="button" onClick={() => setIsConsulting(true)}><ClipboardPlus size={17} /> Nueva revisión</button>}</article>
      {fromAnotherCompany && <div className="patient-origin-warning"><AlertTriangle size={19} /><div><strong>Paciente compartido de otra sucursal</strong><span>Su ficha se originó en {originCompany?.nombre ?? "otra empresa"}{originBranch ? ` · ${originBranch.nombre}` : ""}. Puedes ver aquí sus revisiones y compras anteriores sin duplicar la ficha.</span></div></div>}
      {usingExtraHistorial && loadingHistorial && <p className="empty-patients">Cargando historial…</p>}
      {patientBranches.length > 1 && <section className="branch-filter-panel patient-history-filter" aria-label="Filtrar historial por sucursal"><div><Building2 size={18} /><span>Historial de</span></div><div className="branch-filter-buttons"><button type="button" className={historyBranchId === "all" ? "active" : ""} onClick={() => setHistoryBranchId("all")}>Todas</button>{patientBranches.map((branch) => <button type="button" key={branch.id} className={historyBranchId === branch.id ? "active" : ""} onClick={() => setHistoryBranchId(branch.id)}>{branch.nombre}</button>)}</div></section>}
      <nav className="clinical-tabs"><button type="button" className={section === "consultations" ? "active" : ""} onClick={() => setSection("consultations")}><Stethoscope size={16} /> Revisiones ({visibleConsultations.length})</button><button type="button" className={section === "sales" ? "active" : ""} onClick={() => setSection("sales")}><ReceiptText size={16} /> Ventas ({visibleSales.length})</button><button type="button" className={section === "files" ? "active" : ""} onClick={() => setSection("files")}><ImageIcon size={16} /> Fotos y documentos</button><button type="button" className={section === "laboratory" ? "active" : ""} onClick={() => setSection("laboratory")}><FlaskConical size={16} /> Laboratorio ({labOrders.length})</button></nav>
    {section === "consultations" && <section className="clinical-content history-list">{visibleConsultations.length ? visibleConsultations.map((consultation) => <article className="glass consultation-card" key={consultation.id} onClick={() => setViewingConsultation(consultation)} style={{ cursor: "pointer" }}><div className="consultation-date"><CalendarDays size={17} /><strong>{formatDate(consultation.fecha_consulta)}</strong><span>{props.branches.find((branch) => branch.id === consultation.sucursal_atencion_id)?.nombre ?? "Consulta clínica"}</span></div><div><p className="section-label">{consultation.motivo_consulta ?? "Sin motivo registrado"}</p><h3>{consultation.impresion_diagnostica ?? "Sin diagnóstico registrado"}</h3><p>{consultation.plan_manejo ?? "Sin receta registrada"}</p><div className="consultation-stats">{consultation.optometrista_nombre && <span><strong>Examinó</strong>{consultation.optometrista_nombre}</span>}<span><strong>AV lejos c/rx antigua OD/OI</strong>{consultation.lensometria?.od_av_lejos || "—"} / {consultation.lensometria?.oi_av_lejos || "—"}</span><span><strong>Rx final OD</strong>{[consultation.refraccion?.od_esfera, consultation.refraccion?.od_cilindro, consultation.refraccion?.od_eje].filter(Boolean).join(" ") || "—"}</span><span><strong>Astigmatismo corneal OD/OI</strong>{consultation.queratometria?.od_astigmatismo || "—"} / {consultation.queratometria?.oi_astigmatismo || "—"}</span></div></div></article>) : <section className="glass empty-state"><Stethoscope size={27} /><h3>Sin consultas en esta sucursal</h3><p>Selecciona otra sucursal o registra la primera consulta.</p></section>}</section>}
    {section === "sales" && <section className="clinical-content history-list">{!demoMode && <div className="tab-actions"><button className="new-consultation" type="button" onClick={() => setIsSelling(true)}><ReceiptText size={17} /> Nueva venta</button></div>}{visibleSales.length ? <div className="task-list">{visibleSales.map((sale) => <SaleCard key={sale.id} sale={sale} companyName={companyName(sale.empresa_id)} branchName={props.branches.find((branch) => branch.id === sale.sucursal_id)?.nombre} patient={selected} lensItems={lensItemsFor(sale)} hasLabOrderItems={labOrderItemsFor(sale).length > 0} labOrders={labOrders.filter((order) => order.venta_id === sale.id)} canAnular={canAnular} pending={pending} onAbono={abonar} onRequestAnular={setAnulling} onCreateLabOrder={() => setLabOrderContext({ sale })} onViewOrder={(orderId) => setLabOrderContext({ sale, orderId })} onRecibo={() => setReciboSale(sale)} onDetalle={() => setViewingSale(sale)} onGarantia={() => setGarantiaModal({ defaultVentaId: sale.id })} />)}</div> : <section className="glass empty-state"><ReceiptText size={27} /><h3>Sin compras en esta sucursal</h3><p>Selecciona otra sucursal para consultar sus compras anteriores.</p></section>}</section>}
    {section === "laboratory" && <section className="clinical-content history-list">
      {!demoMode && <div className="tab-actions"><button className="new-consultation" type="button" disabled={loadingHistorial} onClick={() => {
        if (eligibleLabSales.length === 1) setLabOrderContext({ sale: eligibleLabSales[0] });
        else setShowLabSalePicker(true);
      }}><FlaskConical size={17} /> Nueva orden de laboratorio</button></div>}
      {labOrders.length ? labOrders.map((order) => {
        const sale = sales.find((item) => item.id === order.venta_id);
        return <article className="glass consultation-card" key={order.id} style={{ cursor: sale ? "pointer" : undefined }} onClick={() => { if (sale) setLabOrderContext({ sale, orderId: order.id }); }}>
          <div className="consultation-date"><FlaskConical size={17} /><strong>{formatTimestamp(order.creado_en)}</strong><span>{tipoLenteLabels[order.tipo_lente as TipoLente] ?? order.tipo_lente}</span></div>
          <div><h3>{laboratorioLabels[order.laboratorio as LaboratorioProveedor] ?? order.laboratorio}</h3><span className="state-pill">{estadoOrdenLabels[normalizarEstadoOrden(order.estado)]}</span>{order.es_garantia && <span className="check-badge ok">Garantía</span>}
            <button className="outline-action" type="button" disabled={!sale} onClick={() => { if (sale) setLabOrderContext({ sale, orderId: order.id }); }}>Ver orden de laboratorio</button>
          </div>
        </article>;
      }) : <section className="glass empty-state"><FlaskConical size={27} /><h3>Sin órdenes de laboratorio</h3><p>Las órdenes de este paciente aparecerán aquí.</p></section>}
    </section>}
    {section === "files" && <FilesPanel pacienteId={selected.id} photos={photos} consultations={consultations} onNotice={setNotice} />}
    </> : <section className="glass empty-state"><Search size={27} /><h3>Busca una historia clínica</h3><p>La carpeta del paciente aparecerá únicamente después de buscarlo y seleccionarlo.</p></section>}</section></div>
  </div>
  {(isCreating || editingPatient) && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-patient-title"><button className="modal-close" onClick={closeCreating} aria-label="Cerrar"><X size={19} /></button><p className="section-label">{editingPatient ? "DATOS DEL PACIENTE" : "NUEVA FICHA"}</p><h2 id="new-patient-title">{editingPatient ? "Editar datos del paciente" : "Registrar paciente"}</h2><p>{editingPatient ? "Corrige los datos de la ficha. Los cambios quedan registrados." : "Guarda una ficha clínica central; no crea ventas, caja ni inventario. Si la cédula ya existe, se vincula a tu empresa en vez de duplicarse."}</p>{patientFormError && <p className="notice" role="alert">{patientFormError}</p>}<form onSubmit={(event) => { event.preventDefault(); if (editingPatient) updatePatient(event.currentTarget); else createPatient(event.currentTarget); }}><div className="new-patient-form"><label>Nombres<input defaultValue={editingPatient?.nombres ?? ""} name="nombres" required /></label><label>Apellidos<input defaultValue={editingPatient?.apellidos ?? ""} name="apellidos" required /></label><label>Cédula<input defaultValue={editingPatient?.cedula ?? ""} name="cedula" /></label><label>WhatsApp<span style={{ display: "flex", gap: 6 }}><span style={{ display: "grid", placeItems: "center", padding: "0 10px", border: "1px solid #d4e0ea", borderRadius: 9, color: "#5d7086", fontWeight: 800, fontSize: 13 }}>+593</span><input defaultValue={(editingPatient?.telefono ?? "").replace(/\D/g, "").replace(/^(593|0)/, "")} name="telefono" type="tel" inputMode="numeric" maxLength={9} pattern="9[0-9]{8}" placeholder="9XXXXXXXX" title="9 dígitos, empieza con 9" style={{ flex: 1 }} /></span></label><label>Correo<input defaultValue={editingPatient?.email ?? ""} name="email" type="email" /></label><label>Sexo<select name="sexo" defaultValue={editingPatient?.sexo ?? ""}><option value="">Sin especificar</option><option value="femenino">Femenino</option><option value="masculino">Masculino</option><option value="otro">Otro</option></select></label><label>Fecha de nacimiento<input defaultValue={editingPatient?.fecha_nacimiento ?? ""} name="fecha_nacimiento" type="date" onChange={(event) => { const edad = calcularEdad(event.target.value); setEdadNuevoPaciente(edad); if (edad !== null && edad < 18) setTieneResponsable(true); }} /></label><label>Edad<input value={edadNuevoPaciente === null ? "" : `${edadNuevoPaciente} años`} disabled placeholder="Se calcula sola" /></label><label className="task-description">Ocupación<input defaultValue={editingPatient?.ocupacion ?? ""} name="ocupacion" placeholder="Ej.: Estudiante, chofer, comerciante" /></label></div>
    <label className="receta-option-header" style={{ marginTop: 12 }}><input type="checkbox" checked={tieneResponsable} onChange={(event) => { setTieneResponsable(event.target.checked); if (!event.target.checked) { setResponsableId(""); setBuscarResponsable(""); } }} /> Responsable de la cuenta (menor de edad u otra persona a cargo de la deuda)</label>
    {tieneResponsable && <div className="new-patient-form" style={{ marginTop: 8 }}>
      <input type="hidden" name="responsable_id" value={responsableId} />
      <label className="task-description">Buscar responsable ya registrado<input value={buscarResponsable} onChange={(event) => { setBuscarResponsable(event.target.value); setResponsableId(""); }} placeholder="Nombre o cédula del responsable" /></label>
      {responsableId && !responsableElegido && <p className="field-hint">Se conservará el responsable actual. Busca otra persona para cambiarlo o desmarca la casilla para quitarlo.</p>}
      {responsableElegido ? <p className="field-hint">Responsable seleccionado: <strong>{fullName(responsableElegido)}</strong> · {responsableElegido.cedula ?? "sin cédula"} <button type="button" className="text-action" onClick={() => { setResponsableId(""); setBuscarResponsable(""); }}>Quitar</button></p> : responsablesVisibles.length > 0 && <div className="patient-list">{responsablesVisibles.map((patient) => <button key={patient.id} type="button" className="patient-row" onClick={() => { setResponsableId(patient.id); setBuscarResponsable(fullName(patient)); }}><span className="patient-avatar">{initials(patient)}</span><span className="patient-row-text"><strong>{fullName(patient)}</strong><small>{patient.cedula ?? "Sin cédula"}</small></span></button>)}</div>}
      <p className="field-hint">Si el responsable no existe todavía, guarda primero su propia ficha y luego vincúlalo aquí buscándolo por nombre o cédula.</p>
    </div>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={closeCreating}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : editingPatient ? "Guardar cambios" : "Guardar ficha clínica"}</button></div></form></section></div>}
  {showLabSalePicker && selected && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="lab-sale-title">
    <button className="modal-close" type="button" onClick={() => setShowLabSalePicker(false)} aria-label="Cerrar"><X size={19} /></button>
    <h2 id="lab-sale-title">Nueva orden de laboratorio</h2>
    {eligibleLabSales.length ? <><p>Selecciona la venta de los lentes.</p><div className="patient-list">{eligibleLabSales.map((sale) => <button className="patient-row" type="button" key={sale.id} onClick={() => { setShowLabSalePicker(false); setLabOrderContext({ sale }); }}>
      <span className="patient-row-text"><strong>{formatTimestamp(sale.creado_en)} · {money(sale.total)}</strong><small>{sale.venta_items.map((item) => `${item.descripcion} ×${item.cantidad}`).join(", ") || "Sin artículos registrados"}</small></span><ChevronRight size={16} />
    </button>)}</div></> : <><p>Para crear una orden primero registra la venta de los lentes.</p><button className="new-consultation" type="button" onClick={() => { setShowLabSalePicker(false); setIsSelling(true); }}><ReceiptText size={17} /> Nueva venta</button></>}
  </section></div>}
  {(isConsulting || editingConsultation) && selected && <ConsultationModal pacienteId={selected.id} optometrists={props.optometrists} defaultOptometristId={props.optometrists.some((person) => person.id === props.profile?.id) ? props.profile?.id : undefined} initial={editingConsultation ?? undefined} onClose={() => { setIsConsulting(false); setEditingConsultation(null); }} onSaved={setNotice} />}
  {isSelling && selected && !demoMode && <div className="modal-backdrop"><div className="sale-modal-shell"><button className="modal-close" onClick={() => setIsSelling(false)} aria-label="Cerrar"><X size={19} /></button><Cart products={props.products} stock={props.stock} companies={props.companies} branches={props.branches} patients={[selected]} empresasConvenio={props.empresasConvenio} defaultCompany={props.profile?.empresa_id ?? props.companies[0]?.id ?? ""} defaultBranch={props.profile?.sucursal_id ?? ""} defaultPacienteId={selected.id} lockPatient onDone={(message) => { setNotice(message); setSection("sales"); setIsSelling(false); refreshPatientHistory(); }} /></div></div>}
  {viewingConsultation && selected && <ConsultationDetailModal consultation={viewingConsultation} patient={selected} company={branchLetterhead(props.companies.find((c) => c.id === viewingConsultation.empresa_atencion_id) ?? props.companies[0], props.branches.find((b) => b.id === viewingConsultation.sucursal_atencion_id)) ?? undefined} branchName={props.branches.find((b) => b.id === viewingConsultation.sucursal_atencion_id)?.nombre} onClose={() => setViewingConsultation(null)} onEdit={() => { setEditingConsultation(viewingConsultation); setViewingConsultation(null); }} />}
  {viewingSale && selected && <VentaDetailModal sale={viewingSale} companyName={companyName(viewingSale.empresa_id)} patient={selected} onClose={() => setViewingSale(null)} />}
  {labOrderContext && selected && <LabOrderModal sale={labOrderContext.sale} lensItems={labOrderItemsFor(labOrderContext.sale)} productoById={productoById} existingOrderId={labOrderContext.orderId} esGarantia={labOrderContext.esGarantia} patientName={fullName(selected)} patientPhone={selected.telefono} company={branchLetterhead(props.companies.find((c) => c.id === labOrderContext.sale.empresa_id), props.branches.find((b) => b.id === labOrderContext.sale.sucursal_id)) ?? undefined} branchName={props.branches.find((b) => b.id === labOrderContext.sale.sucursal_id)?.nombre} onClose={() => setLabOrderContext(null)} onCreated={(message) => { setNotice(message); refreshPatientHistory(); }} />}
  {reciboSale && selected && <ReciboModal sale={reciboSale} patient={selected} onClose={() => setReciboSale(null)} onSaved={(message) => setNotice(message)} />}
  {anulling && <AnularModal sale={anulling} pending={pending} onClose={() => setAnulling(null)} onConfirm={(motivo) => anular(anulling, motivo)} />}
  {garantiaModal && selected && <GarantiaModal sales={sales.filter((sale) => sale.estado === "completada")} defaultVentaId={garantiaModal.defaultVentaId} productoById={productoById} patients={[selected]} onClose={() => setGarantiaModal(null)} onCreate={crearGarantiaSubmit} pending={pending} />}
  </main>;
}
