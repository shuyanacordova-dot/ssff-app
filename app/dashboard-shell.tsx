"use client";

import Link from "next/link";
import { BarChart3, Banknote, CalendarDays, ClipboardList, Coins, Glasses, FileBarChart, Landmark, LogOut, Package, Search, ShieldCheck, UserPlus, Wallet } from "lucide-react";
import type { TaskData } from "@/lib/tasks";
import TaskBoard from "./tareas/task-board";
import { cerrarSesion } from "./login/actions";

export default function DashboardShell({ taskData }: { taskData: TaskData }) {
  const role = taskData.profile?.rol;
  const isSuperadmin = role === "superadmin";
  const canVerInformes = isSuperadmin || role === "admin_sucursal";

  return <main className="page dashboard-page"><div className="container dashboard-shell">
    <header className="dashboard-header">
      <div><p className="brand-mark"><span className="ring" /> Shuvisión OS</p><h1>Hola, {taskData.profile?.nombre ?? "equipo"}</h1></div>
      <form action={cerrarSesion}><button className="outline-action" type="submit"><LogOut size={15} /> Cerrar sesión</button></form>
    </header>

    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <p className="section-label">ACCESOS RÁPIDOS</p>
        <nav className="dashboard-nav">
          <Link className="dashboard-nav-item" href="/pacientes?new=1"><UserPlus size={18} /> Nuevo paciente</Link>
          <Link className="dashboard-nav-item" href="/pacientes"><Search size={18} /> Buscar paciente</Link>
          <Link className="dashboard-nav-item" href="/"><ClipboardList size={18} /> Tareas y supervisión</Link>
          <Link className="dashboard-nav-item" href="/agenda"><CalendarDays size={18} /> Agenda</Link>
          <Link className="dashboard-nav-item" href="/resumen-dia"><FileBarChart size={18} /> Resumen del día</Link>
          <Link className="dashboard-nav-item" href="/caja"><Banknote size={18} /> Cuadre de caja diario</Link>
          {isSuperadmin && <Link className="dashboard-nav-item" href="/caja"><Landmark size={18} /> Cuentas de bancos y cuadre de caja global</Link>}
          <Link className="dashboard-nav-item" href="/caja?gasto=1"><Coins size={18} /> Salidas de caja chica</Link>
          <Link className="dashboard-nav-item" href="/cuentas-cobrar"><Wallet size={18} /> Cuentas por cobrar</Link>
          <Link className="dashboard-nav-item" href="/inventario?grupo=monturas"><Package size={18} /> Inventario de monturas y accesorios</Link>
          <Link className="dashboard-nav-item" href="/inventario?grupo=lunas"><Glasses size={18} /> Inventario de lunas</Link>
          {canVerInformes && <Link className="dashboard-nav-item" href="/informes"><BarChart3 size={18} /> Informes</Link>}
        </nav>
        <div className="shared-note"><ShieldCheck size={16} /><span>Tu rol define qué módulos puedes usar.</span></div>
      </aside>

      <section className="dashboard-main">
        <TaskBoard {...taskData} embedded />
      </section>
    </div>
  </div></main>;
}
