import { formatRecordDate } from "@/lib/record-date";
import { Binoculars, Eye, Phone, UserRound } from "lucide-react";
import { alturaMontaje, resumenDiametroMinimo, diametroMinimoLuna, avisoAnisometropia } from "@/lib/laboratorio";
import type { OrdenLaboratorioMedidas, OrdenLaboratorioRx, RxEye } from "@/lib/laboratorio";

type PrintCompany = {
  nombre?: string | null;
  logo_url?: string | null;
};

export type LabOrderPrintProps = {
  orderId: string;
  createdAt: string;
  branchName: string;
  patientName: string;
  patientPhone?: string | null;
  productDescription: string;
  rx: OrdenLaboratorioRx;
  medidas: OrdenLaboratorioMedidas;
  reviewerName?: string | null;
  useLabel: string;
  notes?: string | null;
  deliveryDate?: string | null;
  saleFolio?: number | null;
  company?: PrintCompany | null;
  warranty?: boolean;
};

const value = (text?: string | null) => text?.trim() || "—";

export function labOrderCode(orderId: string, createdAt: string, saleFolio?: number | null) {
  const date = new Date(createdAt);
  const stamp = Number.isNaN(date.getTime())
    ? "000000000000"
    : [date.getFullYear().toString().slice(-2), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]
        .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, "0"))
        .join("");
  const suffix = saleFolio != null
    ? String(saleFolio).replace(/\D/g, "").slice(-3).padStart(3, "0")
    : orderId.replace(/[^a-fA-F0-9]/g, "").slice(-3).padStart(3, "0");
  return `${stamp}${suffix}`;
}

function EyeLine({ label, eye, altura }: { label: "OD" | "OI"; eye: RxEye; altura: string }) {
  if (!eye.procesar) return <div className="lab-print-rx-row"><strong><Eye size={18} /> {label}</strong><span className="lab-print-no-process">No procesar</span></div>;
  return <div className="lab-print-rx-row">
    <strong><Eye size={18} /> {label}</strong>
    <span><b>{value(eye.esfera)}</b></span>
    <span>= <b>{value(eye.cilindro)}</b></span>
    <span>X <b>{value(eye.eje)}{eye.eje ? "°" : ""}</b></span>
    <span>Add: <b>{value(eye.add)}</b></span>
    <span>Dnp: <b>{value(eye.dnp)}</b></span>
    <span>Alt: <b>{value(altura)}</b></span>
  </div>;
}

const formatDelivery = (dateValue?: string | null) => {
  if (!dateValue) return "No especificada";
  const date = new Date(dateValue.length === 10 ? `${dateValue}T12:00:00-05:00` : dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric", hour: dateValue.length > 10 ? "2-digit" : undefined, minute: dateValue.length > 10 ? "2-digit" : undefined }).format(date);
};

export default function LabOrderPrint(props: LabOrderPrintProps) {
  const code = labOrderCode(props.orderId, props.createdAt, props.saleFolio);
  const diametro = resumenDiametroMinimo(props.medidas, props.rx);
  const anisometropia = avisoAnisometropia(props.rx);
  const compensada = (["od", "oi"] as const).filter((eye) => props.rx[eye].procesar && props.rx.compensacion_vertice?.[eye]);
  const measures = [
    props.medidas.horizontal_mayor && `Horizontal mayor: ${props.medidas.horizontal_mayor}mm`,
    props.medidas.diagonal_efectiva && `Diagonal efectiva (ED): ${props.medidas.diagonal_efectiva} mm`,
    props.medidas.vertical && `Vertical: ${props.medidas.vertical}mm`,
    props.medidas.puente && `Puente: ${props.medidas.puente}mm`,
    props.medidas.altura && `Altura: ${props.medidas.altura}`,
    props.medidas.dnp && `Dp: ${props.medidas.dnp}`,
  ].filter(Boolean).join("  ");

  return <article className="lab-order-print" aria-label="Orden de trabajo para laboratorio">
    <header className="lab-print-header">
      <div className="lab-print-brand">
        {props.company?.logo_url ? <img src={props.company.logo_url} alt={props.company.nombre || "Logo de la sucursal"} /> : <strong>{props.company?.nombre || "SHUVISION"}</strong>}
      </div>
      <div className="lab-print-heading">
        <p>Detalle de la orden de trabajo #</p>
        <h1>{code}</h1>
        <p>Fecha de creación: <strong>{formatRecordDate(props.createdAt)}</strong></p>
        <span>Sucursal: {props.branchName.toUpperCase()}</span>
        {props.warranty && <em>GARANTÍA</em>}
      </div>
    </header>

    <section className="lab-print-patient">
      <h2>Paciente: {props.patientName}</h2>
      {props.patientPhone && <p><Phone size={13} /> {props.patientPhone}</p>}
    </section>

    <p className="lab-print-product"><Binoculars size={19} /> <span>{props.productDescription || "Producto no especificado"}</span></p>

    <section className="lab-print-rx">
      <EyeLine label="OD" eye={props.rx.od} altura={alturaMontaje(props.medidas, "od")} />
      <EyeLine label="OI" eye={props.rx.oi} altura={alturaMontaje(props.medidas, "oi")} />
    </section>

    <section className="lab-print-review">
      <p><UserRound size={18} /> Revisó: <strong>{props.reviewerName || "Profesional no identificado"}</strong></p>
      <p><Binoculars size={18} /> Distancia de uso: <strong>{props.useLabel}</strong></p>
    </section>

    <section className="lab-print-notes">
      <h3>Observaciones</h3>
      {measures && <p>{measures}</p>}
      {diametro && <p>{diametro}</p>}
      {(["od", "oi"] as const).map((eye) => {
        const result = diametroMinimoLuna(props.medidas, props.rx[eye]);
        return result && <p key={eye}>{eye.toUpperCase()} · Diámetro estándar sugerido: {result.estandar === null ? "supera 80 mm; consultar laboratorio" : `${result.estandar} mm`}</p>;
      })}
      {compensada.length > 0 && <p>Potencia compensada por distancia al vértice: {compensada.map((eye) => {
        const data = props.rx.compensacion_vertice![eye]!;
        return `${eye.toUpperCase()} (${data.refraccion_mm} mm → ${data.montaje_mm} mm)`;
      }).join(" · ")}</p>}
      {anisometropia && <p>{anisometropia}</p>}
      {props.notes && <p>{props.notes}</p>}
      {!measures && !props.notes && !diametro && !anisometropia && !compensada.length && <p>Sin observaciones.</p>}
    </section>

    <footer className="lab-print-footer">
      <span>Fecha de entrega: <strong>{formatDelivery(props.deliveryDate)}</strong></span>
      <span>Folio de Venta # <strong>{props.saleFolio ?? "—"}</strong></span>
    </footer>
  </article>;
}
