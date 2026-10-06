"use client";
import { formatRecordDate } from "@/lib/record-date";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, ChevronRight, ClipboardPlus, FlaskConical, Pencil, Image as ImageIcon, History, MessageCircle, Plus, ReceiptText, Search, ShieldCheck, Stethoscope, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import { actualizarObservacionesPaciente, actualizarPacienteClinico, buscarPacientesClinicos, crearPacienteClinico, obtenerHistorialPaciente, obtenerPacienteClinico, obtenerProteccionPaciente, registrarConsentimientoPaciente, registrarAperturaCarpeta, registrarPromocionesPaciente, type ConsentimientoPaciente, type AccesoHistoria } from "./actions";
import ConsultationModal from "./consultation-form";
import ConsultationDetailModal from "./consultation-detail";
import FilesPanel from "./files-panel";
import ComunicacionesPanel from "./comunicaciones-panel";
import Cart from "@/app/ventas/cart";
import { useCatalogoVenta } from "@/app/ventas/use-catalogo-venta";
import { AnularModal, GarantiaModal, ReciboModal, SaleCard, VentaDetailModal, type OpcionesAnulacion } from "@/app/ventas/sales-board";
import LabOrderModal from "@/app/ventas/lab-order-modal";
import { anularVenta, registrarAbono, obtenerSaldosFavor } from "@/app/ventas/actions";
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
// Fecha simple (yyyy-mm-dd) sin cambio de zona horaria → dd/mm/aaaa.
const fechaSimple = (fecha: string) => { const [y, m, d] = fecha.slice(0, 10).split("-"); return d && m && y ? `${d}/${m}/${y}` : fecha; };
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

export default function PatientClinicalClient(props: ClinicalData & { autoCreate?: boolean; initialSearch?: string; initialPacienteId?: string; initialVentaId?: string; initialTab?: string }) {
  const router = useRouter();
  const demoMode = props.status !== "ready";
  const patients = demoMode ? demoPatients : props.patients;
  const initialIds = useMemo(() => new Set(patients.map((patient) => patient.id)), [patients]);
  const [search, setSearch] = useState(props.initialSearch ?? "");
  const [searchResults, setSearchResults] = useState<PatientRecord[]>([]);
  const [searchBranchId, setSearchBranchId] = useState(props.profile?.sucursal_id ?? "all");
  const [historyBranchId, setHistoryBranchId] = useState("all");
  const [searching, setSearching] = useState(false);
  const [extraPatients, setExtraPatients] = useState<PatientRecord[]>([]);
  const [historial, setHistorial] = useState<Record<string, { consultations: Consultation[]; photos: ClinicalPhoto[]; sales: PatientSale[]; labOrders: SaleLabOrder[]; garantias: Garantia[] }>>({});
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [section, setSection] = useState<"consultations" | "sales" | "files" | "laboratory" | "comms">("consultations");
  const [isCreating, setIsCreating] = useState(!!props.autoCreate && !demoMode);
  const [editingObservations, setEditingObservations] = useState(false);
  const [observationsText, setObservationsText] = useState("");
  const [observationsError, setObservationsError] = useState("");
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
  // El catálogo solo se descarga al abrir una venta, una orden de laboratorio o una garantía.
  const catalogo = useCatalogoVenta(!demoMode && (isSelling || !!labOrderContext || !!garantiaModal));
  const [anulling, setAnulling] = useState<PatientSale | null>(null);
  const [notice, setNotice] = useState("");
  const [consentimiento, setConsentimiento] = useState<ConsentimientoPaciente | null>(null);
  const [promociones, setPromociones] = useState<boolean | null>(null);
  const [accesos, setAccesos] = useState<AccesoHistoria[]>([]);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentModal, setConsentModal] = useState(false);
  const [consentError, setConsentError] = useState("");
    const [consentSigner, setConsentSigner] = useState("");
  const [consentSignerEdited, setConsentSignerEdited] = useState(false);
  const [patientNameInput, setPatientNameInput] = useState("");
  const [saldosFavor, setSaldosFavor] = useState<Record<string, number>>({});
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
  // Las ventas se ven solo en la sucursal donde se hicieron (la Superadministradora ve todas); las revisiones clínicas son compartidas.
  const ventasPermitidas = props.profile?.rol === "superadmin" || !props.profile?.sucursal_id ? sales : sales.filter((sale) => sale.sucursal_id === props.profile?.sucursal_id);
  const visibleSales = ventasPermitidas.filter((sale) => historyBranchId === "all" || sale.sucursal_id === historyBranchId);
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
  const productoById = useMemo(() => new Map(catalogo.products.map((product) => [product.id, product])), [catalogo.products]);
  const lensItemsFor = (sale: PatientSale) => sale.venta_items;
  const labOrderItemsFor = (sale: PatientSale) => lensItemsFor(sale);
  const eligibleLabSales = sales.filter((sale) => sale.estado === "completada");
  const canEditPatient = ["superadmin", "admin_sucursal", "optometra", "vendedor", "caja"].includes(props.profile?.rol ?? "")
    && (props.profile?.rol === "superadmin" || !!selected?.empresa_ids.includes(props.profile?.empresa_id ?? ""));
  const canAnular = props.profile?.rol === "superadmin" || !!props.profile?.puede_anular;
  const canAuthorClinical = props.profile?.rol !== "vendedor";
  const abonar = (sale: PatientSale, data: FormData) => start(async () => { data.set("venta_id", sale.id); try { await registrarAbono(data); setNotice("Abono registrado."); refreshSelected(); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar el abono."); } });
  const anular = (sale: PatientSale, motivo: string, opciones: OpcionesAnulacion) => start(async () => { const data = new FormData(); data.set("venta_id", sale.id); data.set("motivo", motivo); data.set("modo", opciones.modo); data.set("devolucion_origen", opciones.devolucion_origen); data.set("devolucion_banco", opciones.devolucion_banco); try { await anularVenta(data); setNotice(sale.pagado > 0 ? (opciones.modo === "credito" ? `Venta anulada. $${sale.pagado.toFixed(2)} quedan como saldo a favor del paciente.` : `Venta anulada. Devolución de $${sale.pagado.toFixed(2)} registrada como salida de hoy.`) : "Venta anulada."); setAnulling(null); refreshSelected(); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo anular la venta."); } });
  const crearGarantiaSubmit = (form: HTMLFormElement) => start(async () => {
    try {
      const garantiaId = await crearGarantia(new FormData(form));
      const ventaId = new FormData(form).get("venta_id") as string;
      const tipo = new FormData(form).get("tipo") as string;
      setNotice("Garantía registrada.");
      refreshSelected();
      setGarantiaModal(null);
      form.reset();
      if (tipo === "luna") { const sale = sales.find((s) => s.id === ventaId); if (sale) setLabOrderContext({ sale, esGarantia: true }); }
      void garantiaId;
    } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar la garantía."); }
  });

  useEffect(() => {
    if (demoMode || !selectedId || selectedId.startsWith("demo-")) { setConsentimiento(null); setAccesos([]); return; }
    let active = true;
    setConsentLoading(true); setConsentimiento(null); setAccesos([]); setPromociones(null);
    void registrarAperturaCarpeta(selectedId).catch(() => {});
    obtenerProteccionPaciente(selectedId).then((data) => { if (active) { setConsentimiento(data.consentimiento); setAccesos(data.accesos); setPromociones(data.promociones); } })
      .catch(() => { if (active) setNotice("No se pudo consultar el estado del consentimiento."); })
      .finally(() => { if (active) setConsentLoading(false); });
    return () => { active = false; };
  }, [selectedId, demoMode]);

  const selectPatient = (id: string) => {
    setShowLabSalePicker(false); setEditingObservations(false); setObservationsError(""); setSelectedId(id); setSection("consultations"); setHistoryBranchId("all");
    if (!demoMode && !initialIds.has(id) && !historial[id]) {
      setLoadingHistorial(true);
      obtenerHistorialPaciente(id).then((data) => setHistorial((prev) => ({ ...prev, [id]: data }))).catch(() => setNotice("No se pudo cargar el historial de este paciente.")).finally(() => setLoadingHistorial(false));
    }
  };

  // Enlace desde Cuentas por cobrar: /pacientes?paciente=ID&venta=ID abre Ventas con el abono listo.
  const abrirEnlaceInicial = useRef(false);
  useEffect(() => {
    const id = props.initialPacienteId;
    if (demoMode || !id || abrirEnlaceInicial.current) return;
    abrirEnlaceInicial.current = true;
    const abrir = () => { selectPatient(id); if (props.initialVentaId || props.initialTab === "ventas") setSection("sales"); };
    if (allPatients.has(id)) { abrir(); return; }
    obtenerPacienteClinico(id).then((patient) => {
      if (!patient) { setNotice("No se encontró la carpeta de este paciente."); return; }
      setExtraPatients((prev) => [...prev.filter((item) => item.id !== patient.id), patient]);
      abrir();
    }).catch(() => setNotice("No se pudo abrir la carpeta del paciente."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialPacienteId, demoMode]);

  const recargarSaldoFavor = (id: string) => { obtenerSaldosFavor(id).then(setSaldosFavor).catch(() => setSaldosFavor({})); };
  useEffect(() => { if (demoMode || !selectedId) { setSaldosFavor({}); return; } recargarSaldoFavor(selectedId); }, [selectedId, demoMode]);
  const saldoFavorTotal = Object.values(saldosFavor).reduce((sum, value) => sum + value, 0);

  const closeCreating = () => { setEditingPatient(null); setPatientFormError(""); setIsCreating(false); setEdadNuevoPaciente(null); setTieneResponsable(false); setResponsableId(""); setBuscarResponsable(""); setResponsableResults([]); setPatientNameInput(""); setConsentSigner(""); setConsentSignerEdited(false); };
  const refreshSelected = () => {
    if (demoMode || !selected) return;
    router.refresh();
    recargarSaldoFavor(selected.id);
    if (usingExtraHistorial) {
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
      refreshSelected();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo actualizar el paciente.";
      setNotice(message); setPatientFormError(message);
    }
  });
  const saveObservations = () => {
    if (!selected) return;
    start(async () => {
      try {
        const { patient } = await actualizarObservacionesPaciente(selected.id, observationsText);
        setExtraPatients((prev) => [...prev.filter((item) => item.id !== patient.id), patient]);
        setSearchResults((prev) => prev.map((item) => item.id === patient.id ? patient : item));
        setEditingObservations(false);
        setObservationsError("");
        setNotice("Observaciones generales guardadas.");
        router.refresh();
      } catch (err) {
        setObservationsError(err instanceof Error ? err.message : "No se pudieron guardar las observaciones.");
      }
    });
  };
  const createPatient = (form: HTMLFormElement) => start(async () => {
    try {
      const data = new FormData(form);
      if (data.get("autorizacion_datos") !== "si") { setPatientFormError("Confirma la autorización de datos del paciente o su representante."); return; }
      const result = await crearPacienteClinico(data);
      setExtraPatients((prev) => { const map = new Map(prev.map((patient) => [patient.id, patient])); map.set(result.patient.id, result.patient); return Array.from(map.values()); });
      const company = result.patient.empresa_origen_id ? props.companies.find((item) => item.id === result.patient.empresa_origen_id)?.nombre : null;
      let consentNotice = "";
      try {
        const saved = await registrarConsentimientoPaciente({ pacienteId: result.patient.id, estado: "otorgado", metodo: "verbal", firmadoPor: String(data.get("firmado_por") ?? ""), esRepresentante: edadNuevoPaciente !== null && edadNuevoPaciente < 18 });
        consentNotice = saved.ok ? " Consentimiento registrado." : ` La ficha se guardó, pero no se pudo registrar el consentimiento: ${saved.error}`;
      } catch { consentNotice = " La ficha se guardó, pero no se pudo registrar el consentimiento."; }
      setNotice((result.ya_existia ? `Este paciente ya tenía una ficha${company ? ` en ${company}` : ""}. Se vinculó a la sucursal actual y puedes consultar todas sus revisiones y compras.` : "Ficha clínica registrada.") + consentNotice);
      closeCreating(); form.reset(); selectPatient(result.patient.id);
    }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar el paciente."); }
  });
  const savePromociones = (acepta: boolean) => start(async () => {
    if (!selected) return;
    const saved = await registrarPromocionesPaciente(selected.id, acepta);
    if (saved.ok) { setPromociones(acepta); setNotice(acepta ? "El paciente acepta recibir promociones." : "El paciente no recibirá promociones."); }
    else setNotice(saved.error ?? "No se pudo guardar la preferencia.");
  });
  const saveConsent = (form: HTMLFormElement, estado: "otorgado" | "revocado") => start(async () => {
    if (!selected) return;
    const data = new FormData(form);
    if (estado === "otorgado" && data.get("autorizacion_datos") !== "si") { setConsentError("Confirma la autorización del paciente o su representante."); return; }
    try {
      const saved = await registrarConsentimientoPaciente({ pacienteId: selected.id, estado, metodo: "verbal", firmadoPor: String(data.get("firmado_por") ?? ""), esRepresentante: calcularEdad(selected.fecha_nacimiento ?? "") !== null && (calcularEdad(selected.fecha_nacimiento ?? "") ?? 18) < 18, notas: String(data.get("notas") ?? "") });
      if (!saved.ok) { setConsentError(saved.error ?? "No se pudo guardar."); return; }
      const fresh = await obtenerProteccionPaciente(selected.id);
      setConsentimiento(fresh.consentimiento); setAccesos(fresh.accesos); setPromociones(fresh.promociones);
      setConsentModal(false); setConsentError(""); setNotice(estado === "otorgado" ? "Consentimiento registrado." : "Revocación registrada.");
    } catch (err) { setConsentError(err instanceof Error ? err.message : "No se pudo guardar."); }
  });
  const responsablesVisibles = buscarResponsable.trim().length >= 2 ? responsableResults.filter((patient) => patient.id !== editingPatient?.id) : [];
  const responsableElegido = allPatients.get(responsableId);

  return <main className="page clinical-page pac-page"><div className="container clinical-shell pac-shell">
    <header className="clinical-header"><div><Link className="back-link" href="/"><ArrowLeft size={15} /> LUMOS</Link><p className="eyebrow">HISTORIAS CLÍNICAS</p><h1>Pacientes y consulta optométrica</h1><p className="subtitle">Historia clínica compartida, con acceso clínico autorizado.</p></div><div className="clinical-security"><ShieldCheck size={20} /><span>Acceso clínico protegido</span></div></header>
    <div className="clinical-alert"><ShieldCheck size={17} /><span>{notice || (demoMode ? `${props.message} Se muestran ejemplos, nunca pacientes reales.` : `Sesión clínica de ${props.profile?.nombre}. Los datos se leen con tus permisos.`)}</span>{props.status === "needs_login" && <Link className="login-inline" href="/login?next=/pacientes">Iniciar sesión</Link>}</div>
    <section className="pac-search-panel" aria-label="Buscar pacientes">
      <div className="pac-search-top"><div><p className="section-label">PACIENTES</p><h2>Buscar historia</h2></div>{!demoMode && <button className="pac-add-button" type="button" onClick={() => setIsCreating(true)} aria-label="Registrar paciente"><Plus size={18} /> <span>Nuevo paciente</span></button>}</div>
      <label className="pac-search-field"><Search size={20} /><input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedId(""); }} placeholder="Buscar por nombre o cédula" aria-label="Buscar por nombre o cédula" /></label>
      <div className="pac-search-options"><p>{search.trim().length >= 2 ? "Buscando en todos los pacientes registrados." : "Escribe al menos 2 letras para buscar en todos los pacientes."}</p>{props.branches.length > 1 && <div className="pac-branch-chips" aria-label="Filtrar pacientes por sucursal"><button type="button" className={searchBranchId === "all" ? "active" : ""} onClick={() => setSearchBranchId("all")}>Todas</button>{props.branches.map((branch) => <button type="button" key={branch.id} className={searchBranchId === branch.id ? "active" : ""} onClick={() => setSearchBranchId(branch.id)}>{branch.nombre}</button>)}</div>}</div>
      {!selected && <div className="pac-results">{searching && <p className="empty-patients">Buscando…</p>}{!searching && visible.map((patient) => <button type="button" key={patient.id} className="pac-result" onClick={() => selectPatient(patient.id)}><span className="pac-result-avatar">{initials(patient)}</span><span className="pac-result-text"><strong>{fullName(patient)}</strong><small>{patient.cedula ?? "Sin cédula"} <span aria-hidden="true">·</span> Carpeta creada: {patient.fecha_registro ? fechaSimple(patient.fecha_registro) : "Sin fecha"}</small></span><ChevronRight size={18} /></button>)}{!searching && search.trim().length >= 2 && visible.length === 0 && <p className="empty-patients">No se encontraron pacientes en esta sucursal.</p>}</div>}
    </section>
    <div className="pac-layout">
    <section className="clinical-main">{selected ? <>
      <article className="pac-hero"><div className="pac-hero-main"><p className="section-label">CARPETA CENTRAL DEL PACIENTE</p><h2>{fullName(selected)}</h2><p className="pac-created">Carpeta creada: {selected.fecha_registro ? fechaSimple(selected.fecha_registro) : "Sin fecha"}</p><div className={`priv-consent-status ${consentimiento?.estado === "otorgado" ? "priv-granted" : consentimiento?.estado === "revocado" ? "priv-revoked" : "priv-missing"}`}><span>{consentLoading ? "Consultando consentimiento…" : consentimiento?.estado === "otorgado" ? `Autorizó el uso de sus datos (${consentimiento.metodo === "aceptado_en_linea" ? "en su recibo virtual" : "verbal"})` : consentimiento?.estado === "revocado" ? "Consentimiento revocado" : "Falta el consentimiento de datos"}</span>{!demoMode && canEditPatient && <button type="button" className="text-action" onClick={() => { setConsentSigner(consentimiento?.firmado_por || fullName(selected)); setConsentError(""); setConsentModal(true); }}>{consentimiento?.estado === "otorgado" ? "Gestionar consentimiento" : "Registrar consentimiento"}</button>}</div><div className={`priv-consent-status ${promociones === true ? "priv-granted" : promociones === false ? "priv-revoked" : "priv-missing"}`}><span>{consentLoading ? "" : promociones === true ? "Acepta recibir promociones" : promociones === false ? "No quiere promociones" : "Promociones: sin respuesta"}</span>{!demoMode && canEditPatient && !consentLoading && <>{promociones !== true && <button type="button" className="text-action" disabled={pending} onClick={() => savePromociones(true)}>Acepta promociones</button>}{promociones !== false && <button type="button" className="text-action" disabled={pending} onClick={() => savePromociones(false)}>No quiere promociones</button>}</>}</div>{props.profile?.rol === "superadmin" && <details className="priv-access"><summary>Quién abrió esta carpeta</summary>{accesos.length ? <ul>{accesos.map((item) => <li key={item.id}>{item.nombre} · {formatTimestamp(item.creado_en)}</li>)}</ul> : <p>Sin accesos recientes registrados.</p>}</details>}{saldoFavorTotal > 0.004 && <p className="origin-badge">Saldo a favor: ${saldoFavorTotal.toFixed(2)}</p>}<div className="pac-observations"><div className="pac-observations-heading"><strong>Observaciones generales</strong>{!demoMode && canEditPatient && !editingObservations && <button type="button" onClick={() => { setObservationsText(selected.observaciones ?? ""); setObservationsError(""); setEditingObservations(true); }} aria-label="Editar observaciones generales"><Pencil size={15} /></button>}</div>{editingObservations ? <div className="pac-observations-editor"><textarea value={observationsText} onChange={(event) => setObservationsText(event.target.value)} rows={4} aria-label="Observaciones generales" />{observationsError && <p role="alert">{observationsError}</p>}<div><button type="button" disabled={pending} onClick={saveObservations}>Guardar</button><button type="button" disabled={pending} onClick={() => { setEditingObservations(false); setObservationsError(""); }}>Cancelar</button></div></div> : <p>{selected.observaciones?.trim() || "Sin observaciones"}</p>}</div></div><div className="pac-hero-actions">{!demoMode && canEditPatient && <button className="outline-action" type="button" onClick={openEditing}><Pencil size={16} /> Editar datos</button>}{!demoMode && canAuthorClinical && <button className="new-consultation" type="button" onClick={() => setIsConsulting(true)}><ClipboardPlus size={17} /> Nueva revisión</button>}</div></article>
      {fromAnotherCompany && <div className="patient-origin-warning"><AlertTriangle size={19} /><div><strong>Paciente compartido de otra sucursal</strong><span>Su ficha se originó en {originCompany?.nombre ?? "otra empresa"}{originBranch ? ` · ${originBranch.nombre}` : ""}. Puedes ver aquí sus revisiones y compras anteriores sin duplicar la ficha.</span></div></div>}
      {usingExtraHistorial && loadingHistorial && <p className="empty-patients">Cargando historial…</p>}
      {patientBranches.length > 1 && <section className="branch-filter-panel patient-history-filter" aria-label="Filtrar historial por sucursal"><div><Building2 size={18} /><span>Historial de</span></div><div className="branch-filter-buttons"><button type="button" className={historyBranchId === "all" ? "active" : ""} onClick={() => setHistoryBranchId("all")}>Todas</button>{patientBranches.map((branch) => <button type="button" key={branch.id} className={historyBranchId === branch.id ? "active" : ""} onClick={() => setHistoryBranchId(branch.id)}>{branch.nombre}</button>)}</div></section>}
      <nav className="clinical-tabs"><button type="button" className={section === "consultations" ? "active" : ""} onClick={() => setSection("consultations")}><Stethoscope size={16} /> Revisiones ({visibleConsultations.length})</button><button type="button" className={section === "sales" ? "active" : ""} onClick={() => setSection("sales")}><ReceiptText size={16} /> Ventas ({visibleSales.length})</button><button type="button" className={section === "files" ? "active" : ""} onClick={() => setSection("files")}><ImageIcon size={16} /> Fotos y documentos</button><button type="button" className={section === "laboratory" ? "active" : ""} onClick={() => setSection("laboratory")}><FlaskConical size={16} /> Laboratorio ({labOrders.length})</button><button type="button" className={section === "comms" ? "active" : ""} onClick={() => setSection("comms")}><MessageCircle size={16} /> Comunicaciones</button></nav>
    {section === "consultations" && <section className="clinical-content history-list">{visibleConsultations.length ? visibleConsultations.map((consultation) => <button className="pac-revision" type="button" key={consultation.id} onClick={() => setViewingConsultation(consultation)}><span className="pac-revision-date"><CalendarDays size={17} /><strong>{formatDate(consultation.fecha_consulta)}</strong><small>{props.branches.find((branch) => branch.id === consultation.sucursal_atencion_id)?.nombre ?? "Consulta clínica"}</small></span><span className="pac-revision-content"><strong>{consultation.impresion_diagnostica?.trim() || "Sin diagnóstico"}</strong>{consultation.observaciones?.trim() && <span>{consultation.observaciones}</span>}</span><ChevronRight size={18} /></button>) : <section className="glass empty-state"><Stethoscope size={27} /><h3>Sin consultas en esta sucursal</h3><p>Selecciona otra sucursal o registra la primera consulta.</p></section>}</section>}
    {section === "sales" && <section className="clinical-content history-list">{!demoMode && <div className="tab-actions"><button className="new-consultation" type="button" onClick={() => setIsSelling(true)}><ReceiptText size={17} /> Nueva venta</button></div>}{visibleSales.length ? <div className="task-list">{visibleSales.map((sale) => <SaleCard key={sale.id} sale={sale} companyName={companyName(sale.empresa_id)} branchName={props.branches.find((branch) => branch.id === sale.sucursal_id)?.nombre} patient={selected} lensItems={lensItemsFor(sale)} hasLabOrderItems={labOrderItemsFor(sale).length > 0} labOrders={labOrders.filter((order) => order.venta_id === sale.id)} canAnular={canAnular} pending={pending} onAbono={abonar} onRequestAnular={setAnulling} onCreateLabOrder={() => setLabOrderContext({ sale })} onViewOrder={(orderId) => setLabOrderContext({ sale, orderId })} onRecibo={() => setReciboSale(sale)} onDetalle={() => setViewingSale(sale)} onGarantia={() => setGarantiaModal({ defaultVentaId: sale.id })} autoAbono={sale.id === props.initialVentaId && sale.saldo > 0} saldoFavor={saldosFavor[sale.empresa_id] ?? 0} />)}</div> : <section className="glass empty-state"><ReceiptText size={27} /><h3>Sin compras en esta sucursal</h3><p>Selecciona otra sucursal para consultar sus compras anteriores.</p></section>}</section>}
    {section === "comms" && selected && <ComunicacionesPanel key={selected.id} pacienteId={selected.id} empresaId={props.profile?.empresa_id ?? ""} sucursalId={props.profile?.sucursal_id ?? null} telefono={selected.telefono ?? null} />}
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
  {(isCreating || editingPatient) && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-patient-title"><button className="modal-close" onClick={closeCreating} aria-label="Cerrar"><X size={19} /></button><p className="section-label">{editingPatient ? "DATOS DEL PACIENTE" : "NUEVA FICHA"}</p><h2 id="new-patient-title">{editingPatient ? "Editar datos del paciente" : "Registrar paciente"}</h2><p>{editingPatient ? "Corrige los datos de la ficha. Los cambios quedan registrados." : "Guarda una ficha clínica central; no crea ventas, caja ni inventario. Si la cédula ya existe, se vincula a tu empresa en vez de duplicarse."}</p>{patientFormError && <p className="notice" role="alert">{patientFormError}</p>}<form onSubmit={(event) => { event.preventDefault(); if (editingPatient) updatePatient(event.currentTarget); else createPatient(event.currentTarget); }}><div className="new-patient-form"><label>Nombres<input defaultValue={editingPatient?.nombres ?? ""} name="nombres" onChange={(event) => setPatientNameInput(`${event.target.value} ${event.target.form?.elements.namedItem("apellidos") instanceof HTMLInputElement ? (event.target.form.elements.namedItem("apellidos") as HTMLInputElement).value : ""}`.trim())} required /></label><label>Apellidos<input defaultValue={editingPatient?.apellidos ?? ""} name="apellidos" onChange={(event) => setPatientNameInput(`${event.target.form?.elements.namedItem("nombres") instanceof HTMLInputElement ? (event.target.form.elements.namedItem("nombres") as HTMLInputElement).value : ""} ${event.target.value}`.trim())} required /></label><label>Cédula<input defaultValue={editingPatient?.cedula ?? ""} name="cedula" /></label><label>WhatsApp<span style={{ display: "flex", gap: 6 }}><span style={{ display: "grid", placeItems: "center", padding: "0 10px", border: "1px solid #d4e0ea", borderRadius: 9, color: "#5d7086", fontWeight: 800, fontSize: 13 }}>+593</span><input defaultValue={(editingPatient?.telefono ?? "").replace(/\D/g, "").replace(/^(593|0)/, "")} name="telefono" type="tel" inputMode="numeric" maxLength={9} pattern="9[0-9]{8}" placeholder="9XXXXXXXX" title="9 dígitos, empieza con 9" style={{ flex: 1 }} /></span></label><label>Correo<input defaultValue={editingPatient?.email ?? ""} name="email" type="email" /></label><label>Sexo<select name="sexo" defaultValue={editingPatient?.sexo ?? ""}><option value="">Sin especificar</option><option value="femenino">Femenino</option><option value="masculino">Masculino</option><option value="otro">Otro</option></select></label><label>Fecha de nacimiento<input defaultValue={editingPatient?.fecha_nacimiento ?? ""} name="fecha_nacimiento" type="date" onChange={(event) => { const edad = calcularEdad(event.target.value); setEdadNuevoPaciente(edad); if (edad !== null && edad < 18) setTieneResponsable(true); }} /></label><label>Edad<input value={edadNuevoPaciente === null ? "" : `${edadNuevoPaciente} años`} disabled placeholder="Se calcula sola" /></label><label className="task-description">Ocupación<input defaultValue={editingPatient?.ocupacion ?? ""} name="ocupacion" placeholder="Ej.: Estudiante, chofer, comerciante" /></label></div>
    <label className="receta-option-header" style={{ marginTop: 12 }}><input type="checkbox" checked={tieneResponsable} onChange={(event) => { setTieneResponsable(event.target.checked); if (!event.target.checked) { setResponsableId(""); setBuscarResponsable(""); } }} /> Responsable de la cuenta (menor de edad u otra persona a cargo de la deuda)</label>
    {tieneResponsable && <div className="new-patient-form" style={{ marginTop: 8 }}>
      <input type="hidden" name="responsable_id" value={responsableId} />
      <label className="task-description">Buscar responsable ya registrado<input value={buscarResponsable} onChange={(event) => { setBuscarResponsable(event.target.value); setResponsableId(""); }} placeholder="Nombre o cédula del responsable" /></label>
      {responsableId && !responsableElegido && <p className="field-hint">Se conservará el responsable actual. Busca otra persona para cambiarlo o desmarca la casilla para quitarlo.</p>}
      {responsableElegido ? <p className="field-hint">Responsable seleccionado: <strong>{fullName(responsableElegido)}</strong> · {responsableElegido.cedula ?? "sin cédula"} <button type="button" className="text-action" onClick={() => { setResponsableId(""); setBuscarResponsable(""); }}>Quitar</button></p> : responsablesVisibles.length > 0 && <div className="patient-list">{responsablesVisibles.map((patient) => <button key={patient.id} type="button" className="patient-row" onClick={() => { setResponsableId(patient.id); setBuscarResponsable(fullName(patient)); }}><span className="patient-avatar">{initials(patient)}</span><span className="patient-row-text"><strong>{fullName(patient)}</strong><small>{patient.cedula ?? "Sin cédula"}</small></span></button>)}</div>}
      <p className="field-hint">Si el responsable no existe todavía, guarda primero su propia ficha y luego vincúlalo aquí buscándolo por nombre o cédula.</p>
    </div>}
    {!editingPatient && <div className="priv-consent-fields"><label className="priv-check"><input name="autorizacion_datos" type="checkbox" value="si" required /> Le expliqué para qué usamos sus datos (atención, historia clínica, lentes, facturación y recordatorios) y el paciente (o su representante) lo autorizó verbalmente</label><label>{edadNuevoPaciente !== null && edadNuevoPaciente < 18 ? "Representante legal que autoriza" : "Nombre de quien autoriza"}<input name="firmado_por" required value={edadNuevoPaciente !== null && edadNuevoPaciente < 18 ? consentSigner : consentSignerEdited ? consentSigner : patientNameInput} onChange={(event) => { setConsentSigner(event.target.value); setConsentSignerEdited(true); }} /></label><Link href="/privacidad" target="_blank">Aviso de privacidad</Link></div>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={closeCreating}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : editingPatient ? "Guardar cambios" : "Guardar ficha clínica"}</button></div></form></section></div>}
  {consentModal && selected && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title"><button className="modal-close" type="button" onClick={() => setConsentModal(false)} aria-label="Cerrar"><X size={19} /></button><h2 id="consent-title">Consentimiento de datos</h2><p>La autorización es verbal: explica al paciente para qué usamos sus datos. Aviso completo en <Link href="/privacidad" target="_blank">ssff-app.vercel.app/privacidad</Link>.</p>{consentError && <p className="notice" role="alert">{consentError}</p>}<form onSubmit={(event) => { event.preventDefault(); saveConsent(event.currentTarget, "otorgado"); }}><div className="priv-consent-fields"><label className="priv-check"><input type="checkbox" name="autorizacion_datos" value="si" /> El paciente (o su representante) autorizó verbalmente el tratamiento de sus datos, incluidos datos de salud</label><label>{calcularEdad(selected.fecha_nacimiento ?? "") !== null && (calcularEdad(selected.fecha_nacimiento ?? "") ?? 18) < 18 ? "Representante legal que autoriza" : "Nombre de quien autoriza"}<input name="firmado_por" required value={consentSigner} onChange={(event) => setConsentSigner(event.target.value)} /></label><label>Notas (opcional)<textarea name="notas" rows={3}  /></label></div><div className="modal-actions">{consentimiento?.estado === "otorgado" && <button type="button" className="outline-action" disabled={pending} onClick={(event) => saveConsent(event.currentTarget.closest("form")!, "revocado")}>Registrar revocación</button>}<button type="submit" className="new-consultation" disabled={pending}>Registrar consentimiento</button></div></form></section></div>}
  {showLabSalePicker && selected && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="lab-sale-title">
    <button className="modal-close" type="button" onClick={() => setShowLabSalePicker(false)} aria-label="Cerrar"><X size={19} /></button>
    <h2 id="lab-sale-title">Nueva orden de laboratorio</h2>
    {eligibleLabSales.length ? <><p>Selecciona la venta de los lentes.</p><div className="patient-list">{eligibleLabSales.map((sale) => <button className="patient-row" type="button" key={sale.id} onClick={() => { setShowLabSalePicker(false); setLabOrderContext({ sale }); }}>
      <span className="patient-row-text"><strong>{formatTimestamp(sale.creado_en)} · {money(sale.total)}</strong><small>{sale.venta_items.map((item) => `${item.descripcion} ×${item.cantidad}`).join(", ") || "Sin artículos registrados"}</small></span><ChevronRight size={16} />
    </button>)}</div></> : <><p>Para crear una orden primero registra la venta de los lentes.</p><button className="new-consultation" type="button" onClick={() => { setShowLabSalePicker(false); setIsSelling(true); }}><ReceiptText size={17} /> Nueva venta</button></>}
  </section></div>}
  {(isConsulting || editingConsultation) && selected && <ConsultationModal pacienteId={selected.id} optometrists={props.optometrists} defaultOptometristId={props.optometrists.some((person) => person.id === props.profile?.id) ? props.profile?.id : undefined} initial={editingConsultation ?? undefined} previousConsultations={consultations} onClose={() => { setIsConsulting(false); setEditingConsultation(null); }} onSaved={(message) => { setNotice(message); refreshSelected(); }} />}
  {isSelling && selected && !demoMode && <div className="modal-backdrop"><div className="sale-modal-shell"><button className="modal-close" onClick={() => setIsSelling(false)} aria-label="Cerrar"><X size={19} /></button><Cart products={catalogo.products} stock={catalogo.stock} cargandoCatalogo={catalogo.cargando} companies={props.companies} branches={props.branches} patients={[selected]} empresasConvenio={props.empresasConvenio} defaultCompany={props.profile?.empresa_id ?? props.companies[0]?.id ?? ""} defaultBranch={props.profile?.sucursal_id ?? ""} defaultPacienteId={selected.id} saldosFavor={saldosFavor} lockPatient onDone={(message) => { setNotice(message); setSection("sales"); setIsSelling(false); refreshSelected(); }} /></div></div>}
  {viewingConsultation && selected && <ConsultationDetailModal consultation={viewingConsultation} patient={selected} company={branchLetterhead(props.companies.find((c) => c.id === viewingConsultation.empresa_atencion_id) ?? props.companies[0], props.branches.find((b) => b.id === viewingConsultation.sucursal_atencion_id)) ?? undefined} branchName={props.branches.find((b) => b.id === viewingConsultation.sucursal_atencion_id)?.nombre} onClose={() => setViewingConsultation(null)} onEdit={() => { setEditingConsultation(viewingConsultation); setViewingConsultation(null); }} />}
  {viewingSale && selected && <VentaDetailModal sale={viewingSale} companyName={companyName(viewingSale.empresa_id)} patient={selected} onClose={() => setViewingSale(null)} />}
  {labOrderContext && selected && <LabOrderModal sale={labOrderContext.sale} lensItems={labOrderItemsFor(labOrderContext.sale)} productoById={catalogo.products.length ? productoById : undefined} existingOrderId={labOrderContext.orderId} esGarantia={labOrderContext.esGarantia} patientName={fullName(selected)} patientPhone={selected.telefono} company={branchLetterhead(props.companies.find((c) => c.id === labOrderContext.sale.empresa_id), props.branches.find((b) => b.id === labOrderContext.sale.sucursal_id)) ?? undefined} branchName={props.branches.find((b) => b.id === labOrderContext.sale.sucursal_id)?.nombre} onClose={() => setLabOrderContext(null)} onCreated={(message) => { setNotice(message); setSection("laboratory"); refreshSelected(); }} />}
  {reciboSale && selected && <ReciboModal sale={reciboSale} patient={selected} onClose={() => setReciboSale(null)} onSaved={(message) => { setNotice(message); refreshSelected(); }} />}
  {anulling && <AnularModal sale={anulling} pending={pending} onClose={() => setAnulling(null)} onConfirm={(motivo, opciones) => anular(anulling, motivo, opciones)} />}
  {garantiaModal && selected && <GarantiaModal sales={sales.filter((sale) => sale.estado === "completada")} defaultVentaId={garantiaModal.defaultVentaId} productoById={productoById} patients={[selected]} onClose={() => setGarantiaModal(null)} onCreate={crearGarantiaSubmit} pending={pending} />}
  </main>;
}
