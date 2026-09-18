"use client";

import Link from "next/link";
import { CircleAlert, Glasses, MessageCircle, Wallet } from "lucide-react";
import { useState, useTransition } from "react";
import type { CuentasCobrarData, DeudaPaciente } from "@/lib/cuentas-cobrar";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { actualizarFrecuenciaCobro } from "./actions";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const frecuenciaLabel: Record<string, string> = { semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual" };

export default function CuentasCobrarBoard(props: CuentasCobrarData) {
  const [notice, setNotice] = useState(props.message ?? "");
  const [pending, startTransition] = useTransition();

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Cuentas por cobrar</h1><p className="subtitle">{props.message ?? "No se pudo abrir cuentas por cobrar."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/cuentas-cobrar">Iniciar sesión</Link>}</header></div></main>;

  const totalDeuda = props.deudas.reduce((sum, d) => sum + d.saldo_total, 0);

  const cambiarFrecuencia = (pacienteId: string, frecuencia: string) => startTransition(async () => {
    try { await actualizarFrecuenciaCobro(pacienteId, frecuencia); setNotice("Frecuencia de cobro actualizada."); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo actualizar la frecuencia."); }
  });

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Cuentas por cobrar</h1><p className="subtitle">Pacientes con saldo pendiente, listos para contactar por WhatsApp.</p></div></header>
    <section className="agenda-summary"><article><Wallet size={21} /><strong>{money(totalDeuda)}</strong><span>saldo total pendiente</span></article><article><CircleAlert size={21} /><strong>{props.deudas.length}</strong><span>pacientes con deuda</span></article></section>
    <div className="notice"><CircleAlert size={18} /><span>{notice || "El saldo se calcula solo desde las ventas completadas; los abonos lo actualizan automáticamente."}</span></div>

    <section className="glass agenda-board">
      <p className="section-label">PACIENTES CON SALDO PENDIENTE</p><h2>Cuentas por cobrar</h2>
      {props.deudas.length ? <div className="task-list">{props.deudas.map((deuda) => <DeudaCard key={deuda.paciente_id} deuda={deuda} pending={pending} onFrecuencia={(f) => cambiarFrecuencia(deuda.paciente_id, f)} />)}</div> : <section className="empty-state"><Wallet size={27} /><h3>No hay saldos pendientes</h3><p>Cuando una venta quede con saldo aparecerá aquí.</p></section>}
    </section>
  </div></main>;
}

function DeudaCard({ deuda, pending, onFrecuencia }: { deuda: DeudaPaciente; pending: boolean; onFrecuencia: (frecuencia: string) => void }) {
  const nombre = `${deuda.nombres} ${deuda.apellidos}`;
  const mensajeCobro = `Hola ${deuda.nombres}! Te escribimos de ${deuda.empresa_nombre} para recordarte que tienes un saldo pendiente de ${money(deuda.saldo_total)}. ¿Podemos coordinar tu pago?`;
  const mensajeRetiro = `Hola ${deuda.nombres}! Tus lentes ya están listos para retirar en ${deuda.empresa_nombre}. Te esperamos.`;
  const waCobro = enlaceWhatsapp(deuda.telefono, mensajeCobro);
  const waRetiro = enlaceWhatsapp(deuda.telefono, mensajeRetiro);

  return <article className="task-card"><div className="task-status" /><div className="task-main">
    <div className="task-meta"><span>{deuda.empresa_nombre}</span><span>{deuda.telefono || "Sin WhatsApp registrado"}</span></div>
    <h2>{nombre}</h2>
    <p>{deuda.ventas.length} venta(s) pendiente(s): {deuda.ventas.map((v) => `${formatDate(v.creado_en)} (${money(v.saldo)})`).join(", ")}</p>
    <div className="new-patient-form" style={{ marginTop: 8, maxWidth: 260 }}><label>Frecuencia de cobro<select defaultValue={deuda.frecuencia_cobro ?? ""} disabled={pending} onChange={(event) => onFrecuencia(event.target.value)}><option value="">Sin definir</option>{Object.entries(frecuenciaLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
  </div><div className="task-actions">
    <strong>{money(deuda.saldo_total)}</strong>
    {waCobro ? <a className="new-consultation" href={waCobro} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Contactar por WhatsApp</a> : <span style={{ color: "#a24150", fontSize: 12, fontWeight: 700 }}>Sin WhatsApp registrado</span>}
    {waRetiro && <a className="outline-action" href={waRetiro} target="_blank" rel="noreferrer"><Glasses size={14} /> Avisar que vengan a retirar</a>}
  </div></article>;
}
