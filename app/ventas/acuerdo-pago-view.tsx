"use client";
import { printDocumentById } from "@/lib/print-document";
import { Printer } from "lucide-react";
import type { AcuerdoPago } from "./convenio-actions";
import Letterhead from "../print-letterhead";

export default function AcuerdoPagoView({ acuerdo, onClose }: { acuerdo: AcuerdoPago; onClose: () => void }) {
  return <section className="glass agenda-board" style={{ marginBottom: 18 }}>
    <div id="payment-agreement-print" className="print-area">
      <Letterhead company={{ nombre: acuerdo.empresa_nombre ?? "LUMOS", direccion: acuerdo.empresa_direccion, telefono: acuerdo.empresa_telefono, email: acuerdo.empresa_email, logo_url: acuerdo.empresa_logo_url }} subtitle={acuerdo.sucursal_nombre ?? undefined} />
      <p className="section-label">ACUERDO DE PAGO FIRMADO</p>
      <h2>{acuerdo.paciente_nombre}</h2>
      <p style={{ margin: "0 0 4px" }}>Trabajador titular{acuerdo.paciente_cedula ? ` · C.I. ${acuerdo.paciente_cedula}` : ""} · {acuerdo.empresa_convenio_nombre}</p>
      {acuerdo.beneficiario_nombre && <p style={{ margin: "0 0 10px" }}>Beneficiario (paciente): <strong>{acuerdo.beneficiario_nombre}</strong>{acuerdo.beneficiario_cedula ? ` · C.I. ${acuerdo.beneficiario_cedula}` : ""}</p>}
      <p style={{ whiteSpace: "pre-line" }}>{acuerdo.texto}</p>
      <div className="acuerdo-firmas"><div><span />Firma del trabajador titular<br />{acuerdo.paciente_nombre}{acuerdo.paciente_cedula ? <><br />C.I. {acuerdo.paciente_cedula}</> : null}</div><div><span />Por la óptica<br />{acuerdo.atendio_nombre ?? ""}</div></div>
    </div>
    <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Listo</button><button className="new-consultation" type="button" onClick={() => printDocumentById("payment-agreement-print")}><Printer size={16} /> Imprimir acuerdo</button></div>
  </section>;
}
