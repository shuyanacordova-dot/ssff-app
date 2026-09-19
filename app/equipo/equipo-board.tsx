"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Colaborador, EquipoData } from "@/lib/equipo";
import { cambiarContrasenaColaborador } from "./actions";

const rolLabel: Record<string, string> = { superadmin: "Administración general", admin_sucursal: "Administración de sucursal", vendedor: "Vendedor", optometra: "Optómetra", caja: "Caja" };

function CollaboratorCard({ colaborador }: { colaborador: Colaborador }) {
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [pending, start] = useTransition();

  const guardar = () => {
    setError(""); setExito(false);
    if (password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (password !== confirmacion) { setError("Las contraseñas no coinciden."); return; }
    start(async () => {
      try { await cambiarContrasenaColaborador(colaborador.auth_user_id, password); setExito(true); setPassword(""); setConfirmacion(""); }
      catch (err) { setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña."); }
    });
  };

  return <article className="task-card"><div className="task-status" /><div className="task-main">
    <div className="task-meta"><span>{rolLabel[colaborador.rol] ?? colaborador.rol}</span><span>{colaborador.empresa_nombre}{colaborador.sucursal_nombre ? ` · ${colaborador.sucursal_nombre}` : ""}</span>{!colaborador.activo && <span className="urgente">Inactivo</span>}</div>
    <h2>{colaborador.nombre}</h2>
    <p>{colaborador.email}</p>
    {abierto ? <div className="new-patient-form" style={{ marginTop: 10 }}>
      <label>Contraseña nueva<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" placeholder="••••••••" /></label>
      <label>Confirmar contraseña<input type="password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} minLength={8} autoComplete="new-password" placeholder="••••••••" /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      {exito && <p className="login-copy">Contraseña actualizada. Compártesela al colaborador por WhatsApp o en persona.</p>}
      <div className="task-actions">
        <button className="new-consultation" type="button" disabled={pending} onClick={guardar}>{pending ? "Guardando…" : "Guardar contraseña"}</button>
        <button className="outline-action" type="button" onClick={() => { setAbierto(false); setError(""); setExito(false); setPassword(""); setConfirmacion(""); }}>Cancelar</button>
      </div>
    </div> : <div className="task-actions"><button className="outline-action" type="button" onClick={() => setAbierto(true)}>Cambiar contraseña</button></div>}
  </div></article>;
}

export default function EquipoBoard(props: EquipoData) {
  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">DIRECCIÓN</p><h1>Equipo</h1><p className="subtitle">{props.message ?? "No se pudo abrir el equipo."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/equipo">Iniciar sesión</Link>}</header></div></main>;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">DIRECCIÓN</p><h1>Equipo</h1><p className="subtitle">Cambia la contraseña de un colaborador directamente, sin depender del correo.</p></div></header>
    <section className="glass agenda-board">
      <p className="section-label">COLABORADORES</p>
      <div className="task-list">{props.colaboradores.map((c) => <CollaboratorCard key={c.id} colaborador={c} />)}</div>
    </section>
  </div></main>;
}
