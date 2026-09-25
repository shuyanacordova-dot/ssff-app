"use client";

import Link from "next/link";
import Image from "next/image";
import { Banknote, CalendarDays, Coins, FlaskConical, Landmark, LockKeyhole, LogOut, Receipt, Target, UserPlus } from "lucide-react";
import type { TaskData } from "@/lib/tasks";
import type { InformeMensual } from "./informes/actions";
import TaskBoard from "./tareas/task-board";
import { cerrarSesion } from "./login/actions";
import BranchSelector, { BranchDirectory } from "./branch-selector";

const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
const pct = (actual: number, meta: number) => meta > 0 ? Math.round((actual / meta) * 100) : 0;

export type ResumenHoy = { sucursal: string; ventas_brutas: number; cobro_efectivo: number; cobro_tarjeta: number; cobro_transferencia_pichincha: number; cobro_transferencia_guayaquil: number; cobro_transferencia_internacional: number; cobro_credito: number; cobro_otro: number; egresos_efectivo: number; caja_anterior: number; ya_existe: boolean };

function ResumenDelDia({ r }: { r: ResumenHoy }) {
  const transferencias = r.cobro_transferencia_pichincha + r.cobro_transferencia_guayaquil + r.cobro_transferencia_internacional;
  const cobrado = r.cobro_efectivo + r.cobro_tarjeta + transferencias + r.cobro_credito + r.cobro_otro;
  const cajaEsperada = r.caja_anterior + r.cobro_efectivo - r.egresos_efectivo;
  return <section className="glass agenda-board" style={{ marginBottom: 18 }}>
    <div className="agenda-toolbar"><div><p className="section-label">RESUMEN DEL DÍA · {r.sucursal.toUpperCase()}</p><h2>Hoy en caja</h2></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="new-consultation" href="/caja?gasto=1"><Receipt size={16} /> Registrar egreso</Link>
        <Link className="outline-action" href="/resumen-dia"><Landmark size={15} /> Ver resumen completo</Link>
        <Link className="outline-action" href="/caja"><Coins size={15} /> Cuadre de caja</Link>
      </div></div>
    <div className="consultation-stats" style={{ marginTop: 8 }}>
      <span><strong>Ventas del día</strong>{money(r.ventas_brutas)}</span>
      <span><strong>Cobrado hoy</strong>{money(cobrado)}</span>
      <span><strong>Efectivo</strong>{money(r.cobro_efectivo)}</span>
      <span><strong>Tarjetas</strong>{money(r.cobro_tarjeta)}</span>
      <span><strong>Transferencias</strong>{money(transferencias)}</span>
      <span><strong>Egresos</strong>{money(r.egresos_efectivo)}</span>
      <span><strong>Caja de partida</strong>{money(r.caja_anterior)}</span>
      <span><strong>Efectivo esperado</strong>{money(cajaEsperada)}</span>
    </div>
    <p className="field-hint" style={{ marginTop: 8 }}>{r.ya_existe ? "La caja de hoy ya está cerrada." : "La caja de hoy todavía no se ha cerrado."}</p>
  </section>;
}

export default function DashboardShell({ taskData, informeMensual, metasMessage, resumenHoy }: { taskData: TaskData; informeMensual: InformeMensual | null; metasMessage?: string; resumenHoy?: ResumenHoy | null }) {
  const role = taskData.profile?.rol;
  const canVerInformes = role === "superadmin" || role === "admin_sucursal";

  return <main className="page dashboard-page"><div className="container dashboard-shell">
    <header className="dashboard-header">
      <div><p className="brand-mark"><Image className="dashboard-logo" src={taskData.profile?.logoUrl || "/logos/lumos-logo.png"} alt={taskData.profile?.empresaNombre || "LumOS"} width={36} height={36} priority /> {taskData.profile?.empresaNombre ?? "LumOS"}</p><h1>Hola, {taskData.profile?.nombre ?? "equipo"}</h1>{taskData.profile && <><p className="dashboard-branch">{taskData.profile.sucursalNombre}</p><BranchSelector activeId={taskData.profile.sucursalId} branches={taskData.profile.accessibleBranches} /></>}</div>
      <form action={cerrarSesion}><button className="outline-action" type="submit"><LogOut size={15} /> Cerrar sesión</button></form>
    </header>

    {taskData.profile && <BranchDirectory activeId={taskData.profile.sucursalId} branches={taskData.profile.accessibleBranches} />}

    <section className="operations-quick-grid" aria-label="Acciones frecuentes">
      <Link href="/pacientes?new=1"><span className="quick-icon teal"><UserPlus size={21} /></span><span><strong>Nuevo paciente</strong><small>Crear ficha clínica</small></span></Link>
      <Link href="/ventas"><span className="quick-icon blue"><Banknote size={21} /></span><span><strong>Nueva venta</strong><small>Cobrar o registrar pedido</small></span></Link>
      <Link href="/laboratorio"><span className="quick-icon amber"><FlaskConical size={21} /></span><span><strong>Laboratorio</strong><small>Revisar órdenes pendientes</small></span></Link>
      <Link href="/agenda"><span className="quick-icon lilac"><CalendarDays size={21} /></span><span><strong>Agenda</strong><small>Ver citas de hoy</small></span></Link>
      <Link href="/caja?gasto=1"><span className="quick-icon amber"><Receipt size={21} /></span><span><strong>Registrar egreso</strong><small>Gasto o pago de caja</small></span></Link>
      {role === "superadmin" && <Link href="/mi-espacio"><span className="quick-icon blue"><LockKeyhole size={21} /></span><span><strong>Mi espacio</strong><small>Deudas privadas por sucursal</small></span></Link>}
    </section>

    {resumenHoy && <ResumenDelDia r={resumenHoy} />}
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
      const cobrado = row.cobrado_total ?? 0;
      const cumplimiento = pct(cobrado, row.meta);
      const restante = Math.max(0, row.meta - cobrado);
      return <article className="goal-card" key={row.sucursal_id}>
        <div className="goal-card-top"><div><span>{row.empresa_nombre}</span><h3>{row.sucursal_nombre}</h3></div><strong>{row.meta > 0 ? `${cumplimiento}%` : "Sin meta"}</strong></div>
        <div className="goal-progress"><span style={{ width: `${Math.min(100, cumplimiento)}%` }} /></div>
        <p><strong>{money(cobrado)}</strong> A cuenta del mes</p>
        <small>{row.meta > 0 ? `Meta ${money(row.meta)} · Faltan ${money(restante)}` : "Configura la meta mensual de esta sucursal"}</small>
      </article>;
    })}</div> : <div className="goal-empty"><Target size={22} /><p>Aún no hay metas de sucursales disponibles para este mes.</p></div>}
  </section>;
}
