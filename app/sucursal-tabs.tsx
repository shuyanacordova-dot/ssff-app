"use client";

// Botones por sucursal: el cuadre de caja y el resumen del día se ven siempre de una sola sucursal
// (Shuvision y Shuvision Sacha son la misma empresa pero cajas distintas).
export function SucursalTabs({ branches, value, onChange }: { branches: { id: string; nombre: string }[]; value: string; onChange: (id: string) => void }) {
  if (branches.length < 2) return null;
  return <div className="tabs">{branches.map((b) => <button key={b.id} type="button" className={b.id === value ? "active" : ""} onClick={() => onChange(b.id)}>{b.nombre}</button>)}</div>;
}
