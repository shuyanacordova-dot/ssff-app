"use client";

import Link from "next/link";
import { Building2, CircleAlert, FileText, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import type { ConveniosData } from "@/lib/convenios";
import { actualizarEmpresaConvenio, crearEmpresaConvenio } from "@/app/ventas/convenio-actions";

export default function ConveniosBoard(props: ConveniosData) {
  const [notice, setNotice] = useState(props.message ?? "");
  const [pending, start] = useTransition();
  const [showNueva, setShowNueva] = useState(false);
  const [nombre, setNombre] = useState("");

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Convenios</h1><p className="subtitle">{props.message ?? "No se pudo abrir convenios."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/convenios">Iniciar sesión</Link>}</header></div></main>;

  const crear = () => start(async () => {
    try { await crearEmpresaConvenio(nombre); setNotice("Empresa de convenio registrada."); setShowNueva(false); setNombre(""); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo crear la empresa."); }
  });
  const toggle = (id: string, activo: boolean) => start(async () => {
    try { await actualizarEmpresaConvenio(id, activo); setNotice(activo ? "Empresa activada." : "Empresa desactivada."); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo actualizar la empresa."); }
  });

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Convenios</h1><p className="subtitle">Empresas con las que se firman acuerdos de pago por descuento a rol de pagos.</p></div><button className="new-task" type="button" onClick={() => setShowNueva(true)}><Plus size={18} /> Nueva empresa</button></header>
    <div className="notice"><CircleAlert size={18} /><span>{notice || "Estas empresas aparecen al firmar un convenio de pago, en Ventas o en Cuentas por cobrar."}</span></div>

    <section className="glass agenda-board">
      <p className="section-label">EMPRESAS DE CONVENIO</p><h2>{props.empresas.length} registrada(s)</h2>
      {props.empresas.length ? <div className="task-list">{props.empresas.map((empresa) => <article className="task-card" key={empresa.id}><div className="task-status" /><div className="task-main"><div className="task-meta"><span>{empresa.acuerdos} acuerdo(s) de pago firmado(s)</span></div><h2><Building2 size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{empresa.nombre}</h2></div><div className="task-actions"><span className={`state-pill ${empresa.activo ? "aprobada" : "devuelta"}`}>{empresa.activo ? "Activa" : "Inactiva"}</span><button type="button" className="outline-action" disabled={pending} onClick={() => toggle(empresa.id, !empresa.activo)}>{empresa.activo ? "Desactivar" : "Activar"}</button></div></article>)}</div> : <section className="empty-state"><FileText size={27} /><h3>Aún no hay empresas de convenio</h3><p>Regístralas aquí para poder elegirlas al firmar un acuerdo de pago.</p></section>}
    </section>

    {showNueva && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="nueva-convenio-title"><button className="modal-close" onClick={() => setShowNueva(false)} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVA EMPRESA DE CONVENIO</p><h2 id="nueva-convenio-title">Registrar empresa</h2><div className="new-patient-form"><label className="task-description">Nombre<input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Ej.: Municipio de Shushufindi" autoFocus /></label></div><div className="modal-actions"><button className="outline-action" type="button" onClick={() => setShowNueva(false)}>Cancelar</button><button className="new-consultation" type="button" disabled={pending || !nombre.trim()} onClick={crear}>{pending ? "Guardando…" : "Guardar empresa"}</button></div></section></div>}
  </div></main>;
}
