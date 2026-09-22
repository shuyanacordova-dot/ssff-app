import type { Consultation, PatientRecord } from "@/lib/clinical";
import type { SaleCompany } from "@/lib/ventas";

type Props = { consultation: Consultation; patient: PatientRecord; company?: SaleCompany; branchName?: string };
const shown = (value?: string | null) => value?.trim() || "";
const display = (value?: string | null) => shown(value) || "—";
const sex: Record<string, string> = { femenino: "F", masculino: "M", otro: "Otro" };

const dateLabel = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date).replaceAll("/", "-");
};

const ageAt = (birthDate: string | null, eventDate: string) => {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const event = new Date(`${eventDate.slice(0, 10)}T12:00:00`);
  let age = event.getFullYear() - birth.getFullYear();
  if (event.getMonth() < birth.getMonth() || (event.getMonth() === birth.getMonth() && event.getDate() < birth.getDate())) age -= 1;
  return Number.isFinite(age) && age >= 0 ? age : null;
};

function rxLine(data: Record<string, string> | null | undefined, eye: "od" | "oi") {
  const get = (key: string) => shown(data?.[`${eye}_${key}`]);
  return [
    `${get("esfera") || "—"} = ${get("cilindro") || "—"}`,
    get("eje") ? `X ${get("eje")}` : "X —",
    get("av_lejos") ? `AV CRx: ${get("av_lejos")}` : "",
    get("add") ? `Add: ${get("add")}` : "",
    get("dnp") ? `DNP: ${get("dnp")}` : "",
  ].filter(Boolean).join("  ");
}

function compactValues(data: Record<string, string> | null | undefined, eye: "od" | "oi") {
  const get = (key: string) => shown(data?.[`${eye}_${key}`]);
  return [get("esfera"), get("cilindro"), get("eje") && `X ${get("eje")}`, get("add") && `Add ${get("add")}`].filter(Boolean).join("  ");
}

function ReviewFinding({ title, text }: { title: string; text?: string | null }) {
  if (!shown(text)) return null;
  return <p className="clinical-print-finding"><strong>{title}</strong><span>{text}</span></p>;
}

export default function ClinicalReviewPrint({ consultation, patient, company, branchName }: Props) {
  const age = ageAt(patient.fecha_nacimiento, consultation.fecha_consulta);
  const observations = [consultation.plan_manejo, consultation.observaciones].filter(Boolean).join("\n");
  const receta = consultation.receta;
  const prescriptions = [
    receta?.lagrimas_artificiales && `Lágrimas: ${[...(receta.lagrimas_productos ?? []), receta.lagrimas_otro, receta.lagrimas_frecuencia].filter(Boolean).join(", ") || "Sí"}`,
    receta?.vitaminas && `Vitaminas: ${[...(receta.vitaminas_productos ?? []), receta.vitaminas_otro, receta.vitaminas_frecuencia].filter(Boolean).join(", ") || "Sí"}`,
    receta?.terapia_visual && `Terapia visual: ${receta.terapia_instrucciones || "Sí"}`,
  ].filter(Boolean).join(". ");
  const hasOldRx = Object.values(consultation.lensometria ?? {}).some(Boolean);

  return <article className="clinical-review-print" aria-label="Informe de revisión optométrica">
    <header className="clinical-print-letterhead">
      <div className="clinical-print-logo">{company?.logo_url ? <img src={company.logo_url} alt={company.nombre} /> : null}</div>
      <div><h1>{company?.nombre?.toUpperCase() || "SHUVISIÓN"}</h1>{company?.direccion && <p>{company.direccion}</p>}{branchName && <p>{branchName}</p>}<p>{[company?.telefono ? `Tels: ${company.telefono}` : "", company?.email ? `Email: ${company.email}` : ""].filter(Boolean).join("  ")}</p></div>
    </header>

    <h2 className="clinical-print-title" id="consultation-detail-title">Revisión</h2>
    <div className="clinical-print-patient-row"><strong>Paciente: {patient.nombres} {patient.apellidos}</strong><span>{dateLabel(consultation.fecha_consulta)}</span></div>

    <section className="clinical-print-demographics">
      <p>Género: <strong>{patient.sexo ? sex[patient.sexo] ?? patient.sexo : "—"}</strong></p><p>Fecha de nacimiento: <strong>{patient.fecha_nacimiento ? dateLabel(patient.fecha_nacimiento) : "—"}</strong></p><p>Edad: <strong>{age !== null ? `${age} años` : "—"}</strong></p>
      <p>Número local: <strong>{display(patient.cedula)}</strong></p><p>Celular: <strong>{display(patient.telefono)}</strong></p><p>Email: <strong>{display(patient.email)}</strong></p>
      <p>Calle y número: <strong>{display(patient.direccion)}</strong></p><p>C.P.: <strong>—</strong></p><p>Colonia: <strong>—</strong></p>
      <p>Municipio: <strong>—</strong></p><p>Estado: <strong>—</strong></p><p>Ocupación: <strong>{display(patient.ocupacion)}</strong></p>
    </section>

    <section className="clinical-print-section"><h3>Enfermedades o condiciones</h3><p>{display(consultation.antecedentes?.enfermedades_condiciones)}</p><h3>Motivo de consulta</h3><p>{display(consultation.motivo_consulta)}</p></section>

    <section className="clinical-print-section">
      <h3>Exploración y pruebas</h3>
      <ReviewFinding title="Derecho/CÓRNEA" text={shown(consultation.queratometria?.od_k1) || shown(consultation.queratometria?.od_k2) ? `QUERATOMETRÍA: ${display(consultation.queratometria?.od_k1)}/${display(consultation.queratometria?.od_k2)} X ${display(consultation.queratometria?.od_eje)}` : ""} />
      <ReviewFinding title="Izquierdo/CÓRNEA" text={shown(consultation.queratometria?.oi_k1) || shown(consultation.queratometria?.oi_k2) ? `QUERATOMETRÍA: ${display(consultation.queratometria?.oi_k1)}/${display(consultation.queratometria?.oi_k2)} X ${display(consultation.queratometria?.oi_eje)}` : ""} />
      <ReviewFinding title="Derecho/BIOMICROSCOPÍA" text={consultation.biomicroscopia?.od} /><ReviewFinding title="Izquierdo/BIOMICROSCOPÍA" text={consultation.biomicroscopia?.oi} />
      <ReviewFinding title="Derecho/AUTORREFRACTOR" text={compactValues(consultation.autorefractor, "od")} /><ReviewFinding title="Izquierdo/AUTORREFRACTOR" text={compactValues(consultation.autorefractor, "oi")} />
      <ReviewFinding title="Visión binocular" text={Object.entries(consultation.examen_binocular ?? {}).filter(([, val]) => shown(val)).map(([key, val]) => `${key.replaceAll("_", " ")}: ${val}`).join(" · ")} />
    </section>

    <section className="clinical-print-section">
      <h3>Rx anterior</h3>{hasOldRx ? <div className="clinical-print-rx-lines"><p><strong>OD</strong>{rxLine(consultation.lensometria, "od")}</p><p><strong>OI</strong>{rxLine(consultation.lensometria, "oi")}</p></div> : <p>Sin Rx anterior registrada.</p>}
      <h3>Agudeza y Capacidad Visual</h3><div className="clinical-print-av"><strong /><strong>OD</strong><strong>OI</strong><span>AV sin Rx</span><span>{display(consultation.agudeza_visual?.sc_od)}</span><span>{display(consultation.agudeza_visual?.sc_oi)}</span><span>CV lejana</span><span>{display(consultation.lensometria?.od_av_lejos)}</span><span>{display(consultation.lensometria?.oi_av_lejos)}</span><span>AV cercana sin Rx</span><span>{display(consultation.agudeza_visual?.scp_od)}</span><span>{display(consultation.agudeza_visual?.scp_oi)}</span></div>
      <h3>Rx final</h3><div className="clinical-print-rx-lines"><p><strong>OD</strong>{rxLine(consultation.refraccion, "od")}</p><p><strong>OI</strong>{rxLine(consultation.refraccion, "oi")}</p></div>
    </section>

    <section className="clinical-print-section"><h3>Diagnóstico</h3><p>{display(consultation.impresion_diagnostica)}</p>{prescriptions && <><h3>Receta</h3><p>{prescriptions}</p></>}<h3>Observaciones</h3><p className="clinical-print-observations">{observations || "Sin observaciones."}</p></section>

    <footer className="clinical-print-signature"><div><span /><strong>{consultation.optometrista_nombre || "Profesional no identificado"}</strong><small>Optometrista que realizó la revisión</small></div></footer>
  </article>;
}
