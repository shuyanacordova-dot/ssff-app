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

  return <section className="branch-directory" aria-label="Sucursales">
    <p className="section-label">SUCURSALES</p>
    <div className="branch-directory-grid">{branches.map((branch) => {
      const active = branch.id === activeId;
      return <button type="button" className={`branch-directory-card ${active ? "active" : ""}`} key={branch.id} disabled={pending || active} onClick={() => enter(branch.id)} aria-current={active ? "location" : undefined}>
        <strong>{branch.nombre}</strong>{active && <small><CheckCircle2 size={13} /> Estás aquí</small>}{pendingId === branch.id && <small>Abriendo…</small>}
      </button>;
    })}</div>
    {error && <p className="field-hint" role="alert">{error}</p>}
  </section>;
}
