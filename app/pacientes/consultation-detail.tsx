"use client";

import { Printer, X } from "lucide-react";
import type { Consultation, PatientRecord } from "@/lib/clinical";
import type { SaleCompany } from "@/lib/ventas";
import ClinicalReviewPrint from "./clinical-review-print";

export default function ConsultationDetailModal({ consultation, patient, company, branchName, onClose }: { consultation: Consultation; patient: PatientRecord; company?: SaleCompany; branchName?: string; onClose: () => void }) {
  return <div className="modal-backdrop"><section className="new-patient-modal clinical-review-modal" role="dialog" aria-modal="true" aria-labelledby="consultation-detail-title">
    <button className="modal-close no-print" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <div className="print-area print-a4"><ClinicalReviewPrint consultation={consultation} patient={patient} company={company} branchName={branchName} /></div>
    <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button><button className="new-consultation" type="button" onClick={() => window.print()}><Printer size={16} /> Imprimir revisión</button></div>
  </section></div>;
}
