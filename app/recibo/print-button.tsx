"use client";

export default function PrintButton() {
  return <button type="button" className="outline-action no-print" onClick={() => window.print()}>Guardar / imprimir</button>;
}
