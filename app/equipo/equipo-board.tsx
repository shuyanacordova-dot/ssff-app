"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { useState, useTransition } from "react";
import type { Colaborador, EmpresaEquipo, EquipoData, RolEquipo, SucursalEquipo } from "@/lib/equipo";
import { actualizarAsignacionColaborador, cambiarContrasenaColaborador, cambiarEstadoColaborador, crearColaborador } from "./actions";

const rolLabel: Record<string, string> = { superadmin: "Administración general", admin_sucursal: "Administración de sucursal", vendedor: "Vendedor", optometra: "Optómetra", caja: "Caja" };
const roleCapabilities: Record<string, { summary: string; items: string[] }> = {
  superadmin: { summary: "Control total del sistema", items: ["Equipo y configuraciones", "Historias clínicas", "Ventas, caja e inventario", "Todas las sucursales"] },
  admin_sucursal: { summary: "Administra la operación de su sucursal", items: ["Pacientes e historias clínicas", "Ventas e inventario", "Caja e informes de sucursal"] },
  optometra: { summary: "Atención clínica y agenda", items: ["Crear y editar historias clínicas", "Registrar revisiones y recetas", "Aparece automáticamente como profesional"] },
  vendedor: { summary: "Atención comercial sin acceso clínico", items: ["Pacientes comerciales", "Ventas y cobros", "Sin acceso a historias clínicas"] },
  caja: { summary: "Cobros y movimiento diario", items: ["Ventas y cobros", "Caja de sucursal", "Sin acceso a historias clínicas"] },
};

function RolePreview({ roleName }: { roleName?: string }) {
  const capability = roleCapabilities[roleName ?? ""];
  if (!capability) return null;
  return <div className="role-preview"><strong>{capability.summary}</strong><div>{capability.items.map((item) => <span key={item}>{item}</span>)}</div></div>;
}

function CollaboratorCard({ colaborador, empresas, sucursales, roles, canManageAuth }: { colaborador: Colaborador; empresas: EmpresaEquipo[]; sucursales: SucursalEquipo[]; roles: RolEquipo[]; canManageAuth: boolean }) {
  const router = useRouter();
  const [contrasenaAbierta, setContrasenaAbierta] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [rolId, setRolId] = useState(colaborador.rol_id);
  const [empresaId, setEmpresaId] = useState(colaborador.empresa_id);
  const [sucursalId, setSucursalId] = useState(colaborador.sucursal_id);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pending, start] = useTransition();
  const sucursalesDisponibles = sucursales.filter((sucursal) => sucursal.empresa_id === empresaId);
  const selectedRole = roles.find((role) => role.id === rolId)?.nombre;

  const cambiarEmpresa = (id: string) => {
    setEmpresaId(id);
    setSucursalId(sucursales.find((sucursal) => sucursal.empresa_id === id)?.id ?? "");
    setMensaje("");
  };

  const guardarAsignacion = () => start(async () => {
    setError(""); setMensaje("");
    try {
      await actualizarAsignacionColaborador({ colaboradorId: colaborador.id, rolId, empresaId, sucursalId });
      setMensaje("Rol y sucursal actualizados.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el acceso.");
    }
  });

  const guardarContrasena = () => {
    setError(""); setMensaje("");
    if (password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (password !== confirmacion) { setError("Las contraseñas no coinciden."); return; }
    start(async () => {
      try {
        await cambiarContrasenaColaborador(colaborador.auth_user_id, password);
        setMensaje("Contraseña actualizada.");
        setPassword(""); setConfirmacion(""); setContrasenaAbierta(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
      }
    });
  };

  const cambiarEstado = () => {
    const accion = colaborador.activo ? "desactivar" : "reactivar";
    if (!window.confirm(`¿Quieres ${accion} el acceso de ${colaborador.nombre}?`)) return;
    start(async () => {
      setError(""); setMensaje("");
      try {
        await cambiarEstadoColaborador(colaborador.id, !colaborador.activo);
        setMensaje(colaborador.activo ? "Acceso desactivado." : "Acceso reactivado.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cambiar el estado del acceso.");
      }
    });
  };

  return <article className={`team-card ${colaborador.activo ? "" : "is-inactive"}`}>
    <div className="team-card-heading">
      <div><div className="task-meta"><span>{rolLabel[colaborador.rol] ?? colaborador.rol}</span><span>{colaborador.empresa_nombre} · {colaborador.sucursal_nombre}</span></div><h2>{colaborador.nombre}</h2>{colaborador.email && <p>{colaborador.email}</p>}</div>
      <span className={`team-status ${colaborador.activo ? "active" : "inactive"}`}>{colaborador.activo ? "Activo" : "Inactivo"}</span>
    </div>

    <div className="team-access-grid">
      <label>Rol<select value={rolId} disabled={pending || !canManageAuth} onChange={(event) => { setRolId(event.target.value); setMensaje(""); }}>{roles.map((rol) => <option key={rol.id} value={rol.id}>{rolLabel[rol.nombre] ?? rol.nombre}</option>)}</select></label>
      <label>Empresa<select value={empresaId} disabled={pending || !canManageAuth} onChange={(event) => cambiarEmpresa(event.target.value)}>{empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>)}</select></label>
      <label>Sucursal principal<select value={sucursalId} disabled={pending || !canManageAuth} required onChange={(event) => { setSucursalId(event.target.value); setMensaje(""); }}>{sucursalesDisponibles.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}</select></label>
    </div>
    <RolePreview roleName={selectedRole} />
    <p className="field-hint team-branch-note">El acceso a varias sucursales se configurará en el bloque de permisos.</p>

    {contrasenaAbierta && <div className="team-password-panel">
      <label>Contraseña nueva<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" /></label>
      <label>Confirmar contraseña<input type="password" value={confirmacion} onChange={(event) => setConfirmacion(event.target.value)} minLength={8} autoComplete="new-password" placeholder="Repite la contraseña" /></label>
    </div>}
    {error && <p className="login-error" role="alert">{error}</p>}
    {mensaje && <p className="team-success" role="status">{mensaje}</p>}
    <div className="team-card-actions">
      <button className="new-consultation" type="button" disabled={pending || !sucursalId || !canManageAuth} onClick={guardarAsignacion}>{pending ? "Guardando…" : "Guardar acceso"}</button>
      {contrasenaAbierta
        ? <><button className="outline-action" type="button" disabled={pending} onClick={guardarContrasena}>Guardar contraseña</button><button className="text-action" type="button" onClick={() => { setContrasenaAbierta(false); setPassword(""); setConfirmacion(""); setError(""); }}>Cancelar</button></>
        : <button className="outline-action" type="button" disabled={pending || !canManageAuth || !colaborador.auth_user_id} onClick={() => { setContrasenaAbierta(true); setError(""); setMensaje(""); }}>Cambiar contraseña</button>}
      <button className={`outline-action ${colaborador.activo ? "danger-action" : "success-action"}`} type="button" disabled={pending || !canManageAuth} onClick={cambiarEstado}>{colaborador.activo ? "Desactivar acceso" : "Reactivar acceso"}</button>
    </div>
  </article>;
}

function NewCollaboratorModal({ empresas, sucursales, roles, onClose }: { empresas: EmpresaEquipo[]; sucursales: SucursalEquipo[]; roles: RolEquipo[]; onClose: () => void }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [rolId, setRolId] = useState(roles.find((rol) => rol.nombre === "vendedor")?.id ?? roles[0]?.id ?? "");
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const [sucursalId, setSucursalId] = useState(sucursales.find((sucursal) => sucursal.empresa_id === empresas[0]?.id)?.id ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const sucursalesDisponibles = sucursales.filter((sucursal) => sucursal.empresa_id === empresaId);
  const selectedRole = roles.find((role) => role.id === rolId)?.nombre;

  const cambiarEmpresa = (id: string) => {
    setEmpresaId(id);
    setSucursalId(sucursales.find((sucursal) => sucursal.empresa_id === id)?.id ?? "");
  };

  const guardar = () => {
    setError("");
    if (password !== confirmacion) { setError("Las contraseñas no coinciden."); return; }
    start(async () => {
      try {
        await crearColaborador({ nombre, email, password, rolId, empresaId, sucursalId });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear el integrante.");
      }
    });
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <section className="new-patient-modal team-modal" role="dialog" aria-modal="true" aria-labelledby="new-team-title">
      <button className="modal-close" type="button" aria-label="Cerrar" disabled={pending} onClick={onClose}><X size={17} /></button>
      <p className="section-label">NUEVO ACCESO</p><h2 id="new-team-title">Añadir integrante</h2><p>La persona podrá entrar inmediatamente con el correo y la contraseña inicial que definas.</p>
      <div className="new-patient-form">
        <label className="team-field-full">Nombre completo<input value={nombre} onChange={(event) => setNombre(event.target.value)} autoFocus required /></label>
        <label className="team-field-full">Correo de acceso<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required /></label>
        <label>Contraseña inicial<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
        <label>Confirmar contraseña<input type="password" value={confirmacion} onChange={(event) => setConfirmacion(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
        <label>Rol que cumple<select value={rolId} onChange={(event) => setRolId(event.target.value)} required>{roles.map((rol) => <option key={rol.id} value={rol.id}>{rolLabel[rol.nombre] ?? rol.nombre}</option>)}</select></label>
        <label>Empresa<select value={empresaId} onChange={(event) => cambiarEmpresa(event.target.value)} required>{empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>)}</select></label>
        <label className="team-field-full">Sucursal principal<select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)} required>{sucursalesDisponibles.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}</select></label>
      </div>
      <RolePreview roleName={selectedRole} />
      {error && <p className="login-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="new-consultation" type="button" disabled={pending || !sucursalId} onClick={guardar}>{pending ? "Creando…" : "Crear acceso"}</button></div>
    </section>
  </div>;
}

export default function EquipoBoard(props: EquipoData) {
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← REVELIO</Link><p className="eyebrow">CONFIGURACIÓN</p><h1>Equipo y accesos</h1><p className="subtitle">{props.message ?? "No se pudo abrir el equipo."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/equipo">Iniciar sesión</Link>}</header></div></main>;

  const termino = busqueda.trim().toLowerCase();
  const colaboradores = props.colaboradores.filter((colaborador) => !termino || [colaborador.nombre, colaborador.email, colaborador.empresa_nombre, colaborador.sucursal_nombre, colaborador.rol].some((value) => value.toLowerCase().includes(termino)));
  const activos = props.colaboradores.filter((colaborador) => colaborador.activo).length;

  return <main className="page agenda-page team-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← REVELIO</Link><p className="eyebrow">CONFIGURACIÓN</p><h1>Equipo y accesos</h1><p className="subtitle">Crea usuarios, define su rol y sucursal, cambia contraseñas o desactiva accesos.</p></div><button className="new-task" type="button" disabled={!props.canManageAuth} title={!props.canManageAuth ? "Requiere la clave administrativa en el servidor" : undefined} onClick={() => setNuevoAbierto(true)}><UserPlus size={17} /> Añadir integrante</button></header>

    <div className="team-summary">
      <article><strong>{props.colaboradores.length}</strong><span>Integrantes registrados</span></article>
      <article><strong>{activos}</strong><span>Accesos activos</span></article>
      <article><strong>{props.colaboradores.length - activos}</strong><span>Accesos desactivados</span></article>
    </div>
    <div className="team-live-warning"><ShieldCheck size={18} /><div><strong>{props.canManageAuth ? "Configuración conectada a tu Supabase actual" : "Vista disponible; acciones administrativas protegidas"}</strong><span>{props.canManageAuth ? "Crear, guardar o desactivar aquí sí cambia el acceso real de tu equipo. La actualización del diseño sigue únicamente en esta copia local." : "Puedes revisar la interfaz y los integrantes activos. Crear usuarios, cambiar contraseñas o desactivar accesos requiere instalar la clave privada únicamente en el servidor."}</span></div></div>

    <section className="glass agenda-board team-board">
      <div className="team-toolbar"><div><p className="section-label">INTEGRANTES</p><h2>Administración de usuarios</h2></div><label className="patient-search"><Search size={16} /><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, correo o sucursal" aria-label="Buscar integrantes" /></label></div>
      <div className="team-list">{colaboradores.map((colaborador) => <CollaboratorCard key={colaborador.id} colaborador={colaborador} empresas={props.empresas} sucursales={props.sucursales} roles={props.roles} canManageAuth={props.canManageAuth} />)}</div>
      {!colaboradores.length && <div className="empty-state"><h3>No encontramos integrantes</h3><p>Prueba con otra búsqueda.</p></div>}
    </section>
    {nuevoAbierto && <NewCollaboratorModal empresas={props.empresas} sucursales={props.sucursales} roles={props.roles} onClose={() => setNuevoAbierto(false)} />}
  </div></main>;
}
