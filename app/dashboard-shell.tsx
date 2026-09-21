"use client";

import Link from "next/link";
import Image from "next/image";
import { BarChart3, Banknote, Building2, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Coins, FlaskConical, Glasses, FileBarChart, Landmark, LogOut, Package, Palette, Search, Settings, ShieldCheck, Target, UserPlus, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import type { TaskData } from "@/lib/tasks";
import type { InformeMensual } from "./informes/actions";
import TaskBoard from "./tareas/task-board";
import { cerrarSesion } from "./login/actions";
import BranchSelector from "./branch-selector";

const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
const pct = (actual: number, meta: number) => meta > 0 ? Math.round((actual / meta) * 100) : 0;

export default function DashboardShell({ taskData, informeMensual, metasMessage }: { taskData: TaskData; informeMensual: InformeMensual | null; metasMessage?: string }) {
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const role = taskData.profile?.rol;
  const isSuperadmin = role === "superadmin";
  const canVerInformes = isSuperadmin || role === "admin_sucursal";

  useEffect(() => { setMenuCollapsed(window.localStorage.getItem("shu-dashboard-menu") === "collapsed"); }, []);
  const toggleMenu = () => setMenuCollapsed((current) => {
    const next = !current;
    window.localStorage.setItem("shu-dashboard-menu", next ? "collapsed" : "expanded");
    return next;
  });

  return <main className="page dashboard-page"><div className="container dashboard-shell">
    <header className="dashboard-header">
      <div><p className="brand-mark"><Image className="dashboard-logo" src={taskData.profile?.logoUrl || "/logos/shuvision-logo.png"} alt={taskData.profile?.empresaNombre || "Shuvisión OS"} width={36} height={36} priority /> {taskData.profile?.empresaNombre ?? "Shuvisión OS"}</p><h1>Hola, {taskData.profile?.nombre ?? "equipo"}</h1>{taskData.profile && <><p className="dashboard-branch">{taskData.profile.sucursalNombre}</p><BranchSelector activeId={taskData.profile.sucursalId} branches={taskData.profile.accessibleBranches} /></>}</div>
      <form action={cerrarSesion}><button className="outline-action" type="submit"><LogOut size={15} /> Cerrar sesión</button></form>
    </header>

    <section className="operations-quick-grid" aria-label="Acciones frecuentes">
      <Link href="/pacientes?new=1"><span className="quick-icon teal"><UserPlus size={21} /></span><span><strong>Nuevo paciente</strong><small>Crear ficha clínica</small></span></Link>
      <Link href="/ventas"><span className="quick-icon blue"><Banknote size={21} /></span><span><strong>Nueva venta</strong><small>Cobrar o registrar pedido</small></span></Link>
      <Link href="/laboratorio"><span className="quick-icon amber"><FlaskConical size={21} /></span><span><strong>Laboratorio</strong><small>Revisar órdenes pendientes</small></span></Link>
      <Link href="/agenda"><span className="quick-icon lilac"><CalendarDays size={21} /></span><span><strong>Agenda</strong><small>Ver citas de hoy</small></span></Link>
    </section>

    <div className={`dashboard-layout ${menuCollapsed ? "menu-collapsed" : ""}`}>
      <aside className={`dashboard-sidebar ${menuCollapsed ? "is-collapsed" : ""}`}>
        <div className="dashboard-menu-heading"><p className="section-label">MENÚ</p><button type="button" onClick={toggleMenu} aria-label={menuCollapsed ? "Expandir menú" : "Contraer menú"} aria-expanded={!menuCollapsed}>{menuCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button></div>
        <nav className="dashboard-nav">
          <Link title="Nuevo paciente" className="dashboard-nav-item" href="/pacientes?new=1"><UserPlus size={18} /><span>Nuevo paciente</span></Link>
          <Link title="Buscar paciente" className="dashboard-nav-item" href="/pacientes"><Search size={18} /><span>Buscar paciente</span></Link>
          <Link title="Tareas y supervisión" className="dashboard-nav-item" href="/"><ClipboardList size={18} /><span>Tareas y supervisión</span></Link>
          {isSuperadmin && <Link title="Configuración y equipo" className="dashboard-nav-item dashboard-nav-settings" href="/equipo"><Settings size={18} /><span>Configuración y equipo</span></Link>}
          {isSuperadmin && <Link title="Sucursales e identidad" className="dashboard-nav-item dashboard-nav-settings" href="/configuracion/sucursales"><Palette size={18} /><span>Sucursales e identidad</span></Link>}
          <Link title="Agenda" className="dashboard-nav-item" href="/agenda"><CalendarDays size={18} /><span>Agenda</span></Link>
          <Link title="Órdenes de laboratorio" className="dashboard-nav-item dashboard-nav-featured" href="/laboratorio"><FlaskConical size={18} /><span>Órdenes de laboratorio</span></Link>
          <Link title="Resumen del día" className="dashboard-nav-item" href="/resumen-dia"><FileBarChart size={18} /><span>Resumen del día</span></Link>
          <Link title="Cuadre de caja diario" className="dashboard-nav-item" href="/caja"><Banknote size={18} /><span>Cuadre de caja diario</span></Link>
          {isSuperadmin && <Link title="Bancos y caja global" className="dashboard-nav-item" href="/caja"><Landmark size={18} /><span>Cuentas de bancos y cuadre de caja global</span></Link>}
          <Link title="Salidas de caja chica" className="dashboard-nav-item" href="/caja?gasto=1"><Coins size={18} /><span>Salidas de caja chica</span></Link>
          <Link title="Cuentas por cobrar" className="dashboard-nav-item" href="/cuentas-cobrar"><Wallet size={18} /><span>Cuentas por cobrar</span></Link>
          <Link title="Convenios" className="dashboard-nav-item" href="/convenios"><Building2 size={18} /><span>Convenios</span></Link>
          <Link title="Inventario de monturas y accesorios" className="dashboard-nav-item" href="/inventario?grupo=monturas"><Package size={18} /><span>Inventario de monturas y accesorios</span></Link>
          <Link title="Inventario de lunas" className="dashboard-nav-item" href="/inventario?grupo=lunas"><Glasses size={18} /><span>Inventario de lunas</span></Link>
          {canVerInformes && <Link title="Informes" className="dashboard-nav-item" href="/informes"><BarChart3 size={18} /><span>Informes</span></Link>}
        </nav>
        <div className="shared-note"><ShieldCheck size={16} /><span>Tu rol define qué módulos puedes usar.</span></div>
      </aside>

      <section className="dashboard-main">
        {canVerInformes && <MetasDashboard informe={informeMensual} message={metasMessage} />}
        <TaskBoard {...taskData} embedded />
      </section>
    </div>
  </div></main>;
}

function MetasDashboard({ informe, message }: { informe: InformeMensual | null; message?: string }) {
  const mes = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", month: "long", year: "numeric" }).format(new Date());
  return <section className="goal-overview glass">
    <div className="goal-overview-heading"><div><p className="section-label">METAS DEL MES</p><h2>Avance por sucursal</h2><p>{mes}</p></div><Link className="outline-action" href="/informes"><Target size={15} /> Configurar metas</Link></div>
    {message ? <p className="field-hint">{message}</p> : informe?.por_sucursal.length ? <div className="goal-grid">{informe.por_sucursal.map((row) => {
      const cumplimiento = pct(row.ventas_total, row.meta);
      const restante = Math.max(0, row.meta - row.ventas_total);
      return <article className="goal-card" key={row.sucursal_id}>
        <div className="goal-card-top"><div><span>{row.empresa_nombre}</span><h3>{row.sucursal_nombre}</h3></div><strong>{row.meta > 0 ? `${cumplimiento}%` : "Sin meta"}</strong></div>
        <div className="goal-progress"><span style={{ width: `${Math.min(100, cumplimiento)}%` }} /></div>
        <p><strong>{money(row.ventas_total)}</strong> vendidos</p>
        <small>{row.meta > 0 ? `Meta ${money(row.meta)} · Faltan ${money(restante)}` : "Configura la meta mensual de esta sucursal"}</small>
      </article>;
    })}</div> : <div className="goal-empty"><Target size={22} /><p>Aún no hay metas de sucursales disponibles para este mes.</p></div>}
  </section>;
}
