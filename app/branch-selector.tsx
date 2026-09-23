"use client";

import { Building2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { seleccionarSucursalActiva } from "./sucursal/actions";

type BranchOption = { id: string; nombre: string; empresaNombre: string };

export default function BranchSelector({ activeId, branches }: { activeId: string; branches: BranchOption[] }) {
  const router = useRouter();
  const [value, setValue] = useState(activeId);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (branches.length < 2) return null;

  const change = (next: string) => {
    setValue(next); setError("");
    start(async () => {
      try { await seleccionarSucursalActiva(next); router.refresh(); }
      catch (err) { setValue(activeId); setError(err instanceof Error ? err.message : "No se pudo cambiar de sucursal."); }
    });
  };

  return <div className="branch-switcher"><label><Building2 size={16} /><span>Sucursal activa</span><select value={value} disabled={pending} onChange={(event) => change(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.empresaNombre} · {branch.nombre}</option>)}</select></label>{error && <small>{error}</small>}</div>;
}

export function BranchDirectory({ activeId, branches }: { activeId: string; branches: BranchOption[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (branches.length < 2) return null;

  const enter = (branchId: string) => {
    if (branchId === activeId) return;
    setPendingId(branchId); setError("");
    start(async () => {
      try { await seleccionarSucursalActiva(branchId); router.refresh(); }
      catch (err) { setError(err instanceof Error ? err.message : "No se pudo abrir esta sucursal."); setPendingId(""); }
    });
  };

  return <section className="branch-directory glass" aria-labelledby="branch-directory-title">
    <div className="branch-directory-heading"><div><p className="section-label">SUCURSALES</p><h2 id="branch-directory-title">Tus sucursales</h2></div><span>La información operativa se mantiene separada por sede.</span></div>
    <div className="branch-directory-grid">{branches.map((branch) => {
      const active = branch.id === activeId;
      return <article className={`branch-directory-card ${active ? "active" : ""}`} key={branch.id}><div><span className="branch-company">{branch.empresaNombre}</span><h3>{branch.nombre}</h3><small>{active ? "Sucursal activa" : "Disponible"}</small></div><button type="button" disabled={pending || active} onClick={() => enter(branch.id)}>{active ? <><CheckCircle2 size={15} /> Activa</> : pendingId === branch.id ? "Abriendo…" : "Ingresar"}</button></article>;
    })}</div>
    {error && <p className="field-hint">{error}</p>}
  </section>;
}
