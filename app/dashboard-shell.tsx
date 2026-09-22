"use client";

import Link from "next/link";
import Image from "next/image";
import { Banknote, CalendarDays, FlaskConical, LockKeyhole, LogOut, Target, UserPlus } from "lucide-react";
import type { TaskData } from "@/lib/tasks";
import type { InformeMensual } from "./informes/actions";
import TaskBoard from "./tareas/task-board";
import { cerrarSesion } from "./login/actions";
import BranchSelector from "./branch-selector";

const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
const pct = (actual: number, meta: number) => meta > 0 ? Math.round((actual / meta) * 100) : 0;

export default function DashboardShell({ taskData, informeMensual, metasMessage }: { taskData: TaskData; informeMensual: InformeMensual | null; metasMessage?: string }) {
  const role = taskData.profile?.rol;
  const canVerInformes = role === "superadmin" || role === "admin_sucursal";

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
      {role === "superadmin" && <Link href="/mi-espacio"><span className="quick-icon blue"><LockKeyhole size={21} /></span><span><strong>Mi espacio</strong><small>Deudas privadas por sucursal</small></span></Link>}
    </section>

    <section className="dashboard-main dashboard-main-wide">
      {canVerInformes && <MetasDashboard informe={informeMensual} message={metasMessage} />}
      <TaskBoard {...taskData} embedded />
    </section>
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
