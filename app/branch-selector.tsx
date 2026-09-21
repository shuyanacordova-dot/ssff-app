"use client";

import { Building2 } from "lucide-react";
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
