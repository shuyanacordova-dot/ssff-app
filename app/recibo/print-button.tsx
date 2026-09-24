"use client";

import { printDocumentById } from "@/lib/print-document";

export default function PrintButton() {
  return <button type="button" className="outline-action no-print" onClick={() => printDocumentById("receipt-print")}>Guardar / imprimir</button>;
}
