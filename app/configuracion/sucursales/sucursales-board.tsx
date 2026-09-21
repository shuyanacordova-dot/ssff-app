"use client";

import Link from "next/link";
import { Building2, CircleAlert, Image as ImageIcon, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SucursalesConfigData } from "@/lib/configuracion-sucursales";
import type { BranchIdentity, CompanyIdentity } from "@/lib/sucursales";
import { guardarIdentidadSucursal } from "./actions";

function BranchCard({ branch, company, schemaReady }: { branch: BranchIdentity; company?: CompanyIdentity; schemaReady: boolean }) {
  const router = useRouter();
  const [logo, setLogo] = useState(branch.logo_url ?? "");
  const [direccion, setDireccion] = useState(branch.direccion ?? "");
  const [telefono, setTelefono] = useState(branch.telefono ?? "");
  const [email, setEmail] = useState(branch.email ?? "");
  const [color, setColor] = useState(branch.color_primario ?? "#087f8c");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const effectiveLogo = logo || company?.logo_url || "";

  const save = () => start(async () => {
    setMessage("");
    const data = new FormData();
    data.set("sucursal_id", branch.id); data.set("logo_url", logo); data.set("direccion", direccion); data.set("telefono", telefono); data.set("email", email); data.set("color_primario", color);
    try { await guardarIdentidadSucursal(data); setMessage("Identidad guardada."); router.refresh(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "No se pudo guardar."); }
  });

  return <article className="branch-config-card">
    <div className="branch-config-preview" style={{ borderTopColor: color }}>
      <div className="branch-logo-preview">{effectiveLogo ? <img src={effectiveLogo} alt="" /> : <ImageIcon size={24} />}</div>
      <div><span>{company?.nombre ?? "Empresa"}</span><h2>{branch.nombre}</h2><p>{direccion || company?.direccion || branch.ciudad || "Dirección pendiente"}</p></div>
    </div>
    <div className="branch-config-fields">
      <label className="team-field-full">Logo de la sucursal<input value={logo} onChange={(event) => setLogo(event.target.value)} placeholder={company?.logo_url || "/logos/logo-sucursal.png"} /><small>Si se deja vacío, hereda el logo de {company?.nombre ?? "la empresa"}.</small></label>
      <label className="team-field-full">Dirección<input value={direccion} onChange={(event) => setDireccion(event.target.value)} placeholder={company?.direccion || "Dirección de atención"} /></label>
      <label>Teléfono<input value={telefono} onChange={(event) => setTelefono(event.target.value)} placeholder={company?.telefono || "Teléfono"} /></label>
      <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={company?.email || "Correo"} /></label>
      <label>Color principal<span className="branch-color-field"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><input value={color} onChange={(event) => setColor(event.target.value)} /></span></label>
    </div>
    {message && <p className="field-hint">{message}</p>}
    <button className="new-consultation" type="button" disabled={pending || !schemaReady} onClick={save}><Save size={15} /> {pending ? "Guardando…" : "Guardar identidad"}</button>
  </article>;
}

export default function SucursalesBoard(props: SucursalesConfigData) {
  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">CONFIGURACIÓN</p><h1>Sucursales e identidad</h1><p className="subtitle">{props.message}</p></div></header></div></main>;
  return <main className="page agenda-page branch-config-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">CONFIGURACIÓN</p><h1>Sucursales e identidad</h1><p className="subtitle">Cada documento utilizará la identidad de la sucursal donde se originó, manteniendo una sola base compartida.</p></div><Building2 size={34} /></header>
    {!props.schemaReady && <div className="team-live-warning"><CircleAlert size={18} /><div><strong>Vista previa lista; migración todavía no aplicada</strong><span>Puedes revisar la interfaz. Los botones de guardar se habilitarán cuando autorices agregar los campos de identidad a tu Supabase actual.</span></div></div>}
    <section className="branch-config-grid">{props.branches.map((branch) => <BranchCard key={branch.id} branch={branch} company={props.companies.find((company) => company.id === branch.empresa_id)} schemaReady={props.schemaReady} />)}</section>
  </div></main>;
}
