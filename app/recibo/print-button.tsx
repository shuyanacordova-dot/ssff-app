"use client";

import { printCurrentDocument } from "@/lib/print-document";

export default function PrintButton() {
  return <button type="button" className="outline-action no-print" onClick={printCurrentDocument}>Guardar / imprimir</button>;
}
