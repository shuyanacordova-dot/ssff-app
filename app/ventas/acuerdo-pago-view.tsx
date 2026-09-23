"use client";
import { Printer } from "lucide-react";
import type { AcuerdoPago } from "./convenio-actions";
import Letterhead from "../print-letterhead";

export default function AcuerdoPagoView({ acuerdo, onClose }: { acuerdo: AcuerdoPago; onClose: () => void }) {
  return <section className="glass agenda-board" style={{ marginBottom: 18 }}>
    <div className="print-area">
      <Letterhead company={{ nombre: acuerdo.empresa_nombre ?? "LUMOS", direccion: acuerdo.empresa_direccion, telefono: acuerdo.empresa_telefono, email: acuerdo.empresa_email, logo_url: acuerdo.empresa_logo_url }} subtitle={acuerdo.sucursal_nombre ?? undefined} />
      <p className="section-label">ACUERDO DE PAGO FIRMADO</p>
      <h2>{acuerdo.paciente_nombre}</h2>
      <p style={{ whiteSpace: "pre-line" }}>{acuerdo.texto}</p>
    </div>
    <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Listo</button><button className="new-consultation" type="button" onClick={() => window.print()}><Printer size={16} /> Imprimir acuerdo</button></div>
  </section>;
}
