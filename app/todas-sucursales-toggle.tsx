"use client";
import { useEffect, useState } from "react";

// Casilla "Todas las sucursales": sin marcar se ve solo la sucursal donde se trabaja (la elegida en el menú).
// La elección se recuerda en este navegador; si el navegador no permite guardarla, empieza sin marcar.
const KEY = "lumos_todas_sucursales";

export function useTodasSucursales(): [boolean, (value: boolean) => void] {
  const [todas, setTodas] = useState(false);
  useEffect(() => { try { setTodas(window.localStorage.getItem(KEY) === "1"); } catch { /* sin almacenamiento */ } }, []);
  const cambiar = (value: boolean) => { setTodas(value); try { window.localStorage.setItem(KEY, value ? "1" : "0"); } catch { /* sin almacenamiento */ } };
  return [todas, cambiar];
}

export function TodasSucursalesToggle({ todas, onChange, sucursalNombre }: { todas: boolean; onChange: (value: boolean) => void; sucursalNombre?: string }) {
  return <label className="todas-sucursales-toggle" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid #d4e0ea", borderRadius: 10, background: "rgba(255,255,255,.8)", fontWeight: 800, fontSize: 13, color: "#2f4056", cursor: "pointer" }}>
    <input type="checkbox" checked={todas} onChange={(event) => onChange(event.target.checked)} style={{ width: 18, height: 18 }} />
    Todas las sucursales
    {!todas && sucursalNombre && <span style={{ fontWeight: 600, color: "#206f6b" }}>· viendo {sucursalNombre}</span>}
  </label>;
}
