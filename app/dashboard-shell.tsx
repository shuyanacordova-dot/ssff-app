"use client";

import Link from "next/link";
import Image from "next/image";
import { Banknote, CalendarDays, Coins, Landmark, LogOut, Receipt, Target, UserPlus } from "lucide-react";
import type { TaskData } from "@/lib/tasks";
import type { InformeMensual } from "./informes/actions";
import type { DineroDisponible } from "@/lib/informes";
import { cerrarSesion } from "./login/actions";
import { BranchDirectory } from "./branch-selector";

const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
const pct = (actual: number, meta: number) => meta > 0 ? Math.round((actual / meta) * 100) : 0;

export type ResumenHoy = { sucursal: string; ventas_brutas: number; cobro_efectivo: number; cobro_tarjeta: number; cobro_transferencia_pichincha: number; cobro_transferencia_guayaquil: number; cobro_transferencia_internacional: number; cobro_credito: number; cobro_otro: number; egresos_efectivo: number; egresos_banco: number; caja_anterior: number; ya_existe: boolean };

function ResumenDelDia({ r }: { r: ResumenHoy }) {
  const transferencias = r.cobro_transferencia_pichincha + r.cobro_transferencia_guayaquil + r.cobro_transferencia_internacional;
  const cobrado = r.cobro_efectivo + r.cobro_tarjeta + transferencias + r.cobro_credito + r.cobro_otro;
  const cajaEsperada = r.caja_anterior + r.cobro_efectivo - r.egresos_efectivo;
  return <section className="glass agenda-board dashboard-today">
    <div className="dashboard-card-heading"><div><p className="section-label">HOY · {r.sucursal.toUpperCase()}</p><h2>Resumen del día</h2></div><div className="dashboard-card-links"><Link className="outline-action" href="/resumen-dia">Ver resumen</Link><Link className="outline-action" href="/caja">Cuadre de caja</Link></div></div>
    <div className="consultation-stats dashboard-today-stats">
      <span><strong>Ventas del día</strong>{money(r.ventas_brutas)}</span>
      <span><strong>Cobrado hoy</strong>{money(cobrado)}</span>
      <span><strong>Egresos en efectivo</strong>{money(r.egresos_efectivo)}</span>
      <span><strong>Egresos por transferencia</strong>{money(r.egresos_banco ?? 0)}</span>
      <span><strong>Efectivo esperado en caja</strong>{money(cajaEsperada)}</span>
    </div>
    <p className="field-hint">{r.ya_existe ? "Caja cerrada" : "Caja abierta"}</p>
  </section>;
}

export default function DashboardShell({ taskData, informeMensual, metasMessage, resumenHoy, cobrosHoy, acumulado }: { taskData: TaskData; informeMensual: InformeMensual | null; metasMessage?: string; resumenHoy?: ResumenHoy | null; cobrosHoy: { cantidad: number; total: number }; acumulado?: DineroDisponible[] | null }) {
  const role = taskData.profile?.rol;
  const canVerInformes = role === "superadmin" || role === "admin_sucursal";

  return <main className="page dashboard-page"><div className="container dashboard-shell">
    <header className="dashboard-header">
      <div><p className="brand-mark"><Image className="dashboard-logo" src={taskData.profile?.logoUrl || "/logos/lumos-logo.png"} alt={taskData.profile?.empresaNombre || "LumOS"} width={36} height={36} priority /> {taskData.profile?.empresaNombre ?? "LumOS"}</p><h1>Hola, {taskData.profile?.nombre ?? "equipo"}</h1>{taskData.profile && <p className="dashboard-branch">{taskData.profile.sucursalNombre}</p>}</div>
      <form action={cerrarSesion}><button className="outline-action" type="submit"><LogOut size={15} /> Cerrar sesión</button></form>
    </header>

    {taskData.profile && <BranchDirectory activeId={taskData.profile.sucursalId} branches={taskData.profile.accessibleBranches} />}

    <section className="operations-quick-grid" aria-label="Acciones rápidas">
      <Link href="/pacientes?new=1"><span className="quick-icon teal"><UserPlus size={21} /></span><span><strong>Nuevo paciente</strong><small>Crear ficha clínica</small></span></Link>
      <Link href="/ventas"><span className="quick-icon blue"><Banknote size={21} /></span><span><strong>Nueva venta</strong><small>Cobrar o registrar pedido</small></span></Link>
      <Link href="/caja?gasto=1"><span className="quick-icon teal"><Receipt size={21} /></span><span><strong>Registrar egreso</strong><small>Gasto o pago de caja</small></span></Link>
      <Link href="/cuentas-cobrar"><span className="quick-icon teal"><Coins size={21} /></span><span><strong>Cobros de hoy</strong><small>Mensajes por enviar</small></span></Link>
      <Link href="/agenda"><span className="quick-icon teal"><CalendarDays size={21} /></span><span><strong>Agenda</strong><small>Ver citas de hoy</small></span></Link>
    </section>

    {cobrosHoy.cantidad > 0 && <section className="glass cob-dashboard-banner"><span>Hoy hay <strong>{cobrosHoy.cantidad}</strong> mensajes de cobro por enviar ({money(cobrosHoy.total)})</span><Link className="outline-action" href="/cuentas-cobrar">Ver cobros de hoy</Link></section>}
    {resumenHoy && <ResumenDelDia r={resumenHoy} />}
    {acumulado && acumulado.length > 0 && <AcumuladoOpticas filas={acumulado} />}
    <section className="dashboard-main dashboard-main-wide">
      {canVerInformes && <MetasDashboard informe={informeMensual} message={metasMessage} />}
      <PendingTasks taskData={taskData} />
    </section>
  </div></main>;
}


function PendingTasks({ taskData }: { taskData: TaskData }) {
  // Pendientes = mías por hacer (pendiente, en proceso, devuelta) + las que superviso y esperan mi revisión.
  const mias = taskData.tasks.filter((task) => task.asignada_a === taskData.profile?.id && ["pendiente", "en_proceso", "devuelta"].includes(task.estado));
  const porRevisar = taskData.tasks.filter((task) => taskData.supervisorTaskIds.includes(task.id) && ["completada", "en_revision"].includes(task.estado));
  const ownTasks = [...porRevisar.map((task) => ({ ...task, revisar: true })), ...mias.map((task) => ({ ...task, revisar: false }))].slice(0, 5);
  const formatDue = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Guayaquil" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
  return <section className="glass dashboard-tasks"><div className="dashboard-card-heading"><div><p className="section-label">TAREAS</p><h2>Tareas pendientes</h2></div><Link className="outline-action" href="/tareas">Ver todas</Link></div>
    {ownTasks.length ? <ul>{ownTasks.map((task) => <li key={task.id}><span>{task.revisar && <strong>Por revisar · </strong>}{task.titulo}</span>{task.fecha_limite && <small>{formatDue(task.fecha_limite)}</small>}</li>)}</ul> : <p className="field-hint">Sin tareas pendientes</p>}
  </section>;
}

// Acumulado de cada óptica = dinero disponible (bancos desde su último cuadre + efectivo de caja). No se reinicia cada mes:
// suben los cobros (efectivo, transferencias, tarjetas) y bajan los egresos (Shuyana 2026-10-01).
function AcumuladoOpticas({ filas }: { filas: DineroDisponible[] }) {
  const listas = filas.filter((f) => f.estado === "listo" && f.total !== null);
  const total = listas.reduce((t, f) => t + Number(f.total ?? 0), 0);
  return <section className="glass dashboard-today dash-acum">
    <div className="dashboard-card-heading"><div><p className="section-label">ACUMULADO · DINERO DISPONIBLE</p><h2>Las {filas.length} ópticas</h2></div><Link className="outline-action" href="/mi-espacio/bancos">Cuadre de bancos</Link></div>
    <div className="dash-acum-table" role="table" aria-label="Acumulado por óptica">
      <div className="dash-acum-row dash-acum-head" role="row"><span role="columnheader">Óptica</span><span role="columnheader">Bancos</span><span role="columnheader">Efectivo</span><span role="columnheader">Acumulado</span></div>
      {filas.map((f) => <div className="dash-acum-row" role="row" key={f.sucursal_id}><span role="cell">{f.sucursal_nombre}</span><span role="cell">{f.cuentas_sin_cuadre > 0 ? "Por cuadrar" : money(Number(f.bancos))}{Number(f.tarjetas_por_acreditar ?? 0) > 0.004 && <Link href="/mi-espacio/bancos#tarjetas" className="dash-acum-tarj">+ {money(Number(f.tarjetas_por_acreditar))} tarjetas por acreditar</Link>}</span><span role="cell">{f.efectivo === null ? "—" : money(Number(f.efectivo))}</span><strong role="cell" className={f.total === null ? "dash-acum-pend" : Number(f.total) < 0 ? "dash-acum-neg" : "dash-acum-pos"}>{f.total === null ? "Pendiente" : money(Number(f.total))}</strong></div>)}
      <div className="dash-acum-row dash-acum-total" role="row"><span role="cell">Total{listas.length < filas.length ? ` (${listas.length} de ${filas.length})` : ""}</span><span role="cell" /><span role="cell" /><strong role="cell">{money(total)}</strong></div>
    </div>
    <p className="field-hint">Parte del último cuadre de bancos y de caja; suma lo que entra y resta los egresos. No se reinicia cada mes. Los cobros con tarjeta se muestran aparte hasta que el banco los acredita (con el cuadre del sábado quedan dentro de "Bancos").{filas.some((f) => f.cuentas_sin_cuadre > 0) ? " Las ópticas \"Por cuadrar\" necesitan su primer cuadre de bancos." : ""}</p>
  </section>;
}

function MetasDashboard({ informe, message }: { informe: InformeMensual | null; message?: string }) {
  const mes = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", month: "long", year: "numeric" }).format(new Date());
  return <section className="goal-overview glass">
    <div className="goal-overview-heading"><div><p className="section-label">METAS DEL MES</p><h2>Avance por sucursal</h2><p>{mes}</p></div><Link className="outline-action" href="/informes"><Target size={15} /> Configurar metas</Link></div>
    {message ? <p className="field-hint">{message}</p> : informe?.por_sucursal.length ? <div className="goal-grid">{informe.por_sucursal.map((row) => {
      // "A cuenta" = TODO el dinero que entró en el mes: lentes nuevos, abonos de quienes retiran y abonos de convenios
      // (pagos registrados de ventas vigentes). Antes solo contaba lo pagado de las ventas creadas en el mes.
      const cobrado = Number(row.ingresos_total ?? 0);
      const cumplimiento = pct(cobrado, row.meta);
      const restante = Math.max(0, row.meta - cobrado);
      // En el inicio solo meta y a cuenta (Shuyana 2026-09-30); el desglose (egresos, resultado, dinero disponible) está en Informes.
      return <article className="goal-card" key={row.sucursal_id}>
        <div className="goal-card-top"><div><span>{row.empresa_nombre}</span><h3>{row.sucursal_nombre}</h3></div><strong>{row.meta > 0 ? `${cumplimiento}%` : "Sin meta"}</strong></div>
        <div className="goal-progress"><span style={{ width: `${Math.min(100, cumplimiento)}%` }} /></div>
        <p><strong>{money(cobrado)}</strong> A cuenta del mes</p>
        <small>{row.meta > 0 ? `Meta ${money(row.meta)} · Faltan ${money(restante)}` : "Configura la meta mensual de esta sucursal"}</small>
      </article>;
    })}</div> : <div className="goal-empty"><Target size={22} /><p>Aún no hay metas de sucursales disponibles para este mes.</p></div>}
  </section>;
}
