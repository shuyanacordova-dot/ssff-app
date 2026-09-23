"use client";
import Link from "next/link";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import type { ResumenDiaData } from "@/lib/resumen-dia";

const money = (n: number) => `$${n.toFixed(2)}`;
const formatHora = (value: string) => new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
const metodoLabel: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", credito: "Crédito", otro: "Otro" };
const clasificacionLabel: Record<string, string> = { salarios: "Salarios", pago_proveedor: "Pago a proveedor", gastos_mensuales: "Gastos mensuales", gastos_operacion: "Gastos de operación", ajuste: "Ajuste" };

export default function ResumenDiaBoard(props: ResumenDiaData & { fecha: string }) {
  const router = useRouter();

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN DEL DÍA</p><h1>Resumen del día</h1><p className="subtitle">{props.message ?? "No se pudo abrir el resumen."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/resumen-dia">Iniciar sesión</Link>}</header></div></main>;

  const empresaId = props.profile?.empresa_id ?? props.companies[0]?.id ?? "";
  const irA = (fecha: string, empresa: string) => router.push(`/resumen-dia?fecha=${fecha}&empresa=${empresa}`);

  const totalVentas = props.ventas.reduce((sum, v) => sum + v.total, 0);
  const totalAbonos = props.abonos.reduce((sum, a) => sum + a.monto, 0);
  const totalSalidas = props.salidas.reduce((sum, s) => sum + s.monto, 0);
  const abonosPorMetodo = props.abonos.reduce<Record<string, number>>((acc, a) => { acc[a.metodo] = (acc[a.metodo] ?? 0) + a.monto; return acc; }, {});
  const salidasPorClasificacion = props.salidas.reduce<Record<string, typeof props.salidas>>((acc, s) => { (acc[s.clasificacion] ??= []).push(s); return acc; }, {});

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header no-print">
      <div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN DEL DÍA</p><h1>Resumen del día</h1><p className="subtitle">Ventas, abonos y salidas del día — la base para cerrar la <Link href="/caja" className="text-action" style={{ display: "inline" }}>caja diaria</Link>.</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="date" value={props.fecha} onChange={(event) => irA(event.target.value, empresaId)} />
        <button className="outline-action" type="button" onClick={() => window.print()}><Printer size={15} /> Imprimir</button>
      </div>
    </header>
    <div className="tabs no-print">{props.companies.map((company) => <button key={company.id} className={company.id === empresaId ? "active" : ""} onClick={() => irA(props.fecha, company.id)}>{company.nombre}</button>)}</div>

    <div className="print-area">
      <section className="glass agenda-board" style={{ marginTop: 14, marginBottom: 18 }}>
        <p className="section-label">RESUMEN DE VENTAS</p><h2>Ventas del día</h2>
        {props.ventas.length ? <table className="resumen-table"><thead><tr><th>Hora</th><th>Subtotal</th><th>Descuento</th><th>Total</th><th>Paciente</th><th>Autor(a)</th></tr></thead><tbody>
          {props.ventas.map((v) => <tr key={v.id}><td>{formatHora(v.creado_en)}</td><td>{money(v.subtotal)}</td><td>{money(v.descuento)}</td><td>{money(v.total)}</td><td>{v.paciente_nombre || v.cliente_nombre || "Cliente sin nombre"}</td><td>{v.autor_nombre || "—"}</td></tr>)}
          <tr className="total-row"><td colSpan={3}>Total</td><td>{money(totalVentas)}</td><td colSpan={2} /></tr>
        </tbody></table> : <p className="field-hint">No hay ventas registradas este día.</p>}
      </section>

      <section className="glass agenda-board" style={{ marginBottom: 18 }}>
        <p className="section-label">RESUMEN DE ABONOS</p><h2>Abonos del día</h2>
        {props.abonos.length ? <table className="resumen-table"><thead><tr><th>Monto</th><th>Forma de pago</th><th>Paciente</th><th>Recibió</th><th>Saldo actual</th></tr></thead><tbody>
          {props.abonos.map((a) => <tr key={a.id}><td>{money(a.monto)}</td><td>{metodoLabel[a.metodo] || a.metodo}</td><td>{a.paciente_nombre || a.cliente_nombre || "Cliente sin nombre"}</td><td>{a.autor_nombre || "—"}</td><td>{money(a.venta_saldo)}</td></tr>)}
          <tr className="total-row"><td>{money(totalAbonos)}</td><td colSpan={4} /></tr>
        </tbody></table> : <p className="field-hint">No hay abonos registrados este día.</p>}
      </section>

      <section className="glass agenda-board" style={{ marginBottom: 18 }}>
        <p className="section-label">RESUMEN DE ABONOS POR FORMA DE PAGO</p><h2>Por método</h2>
        <table className="resumen-table"><thead><tr><th>Forma de pago</th><th>Suma</th></tr></thead><tbody>
          {Object.entries(abonosPorMetodo).map(([metodo, monto]) => <tr key={metodo}><td>{metodoLabel[metodo] || metodo}</td><td>{money(monto)}</td></tr>)}
          <tr className="total-row"><td>Total</td><td>{money(totalAbonos)}</td></tr>
        </tbody></table>
      </section>

      <section className="glass agenda-board">
        <p className="section-label">SALIDAS</p><h2>Salidas de caja del día</h2>
        {props.salidas.length ? <table className="resumen-table"><thead><tr><th>Concepto</th><th>Monto</th><th>Observaciones</th><th>Autor</th></tr></thead><tbody>
          {Object.entries(salidasPorClasificacion).map(([clasificacion, rows]) => <Fragment key={clasificacion}>
            <tr className="group-header"><td colSpan={4}>{clasificacionLabel[clasificacion] || clasificacion}</td></tr>
            {rows.map((s) => <tr key={s.id}><td>{s.concepto}</td><td>{money(s.monto)}</td><td>{s.observaciones || "—"}</td><td>{s.autor_nombre || "—"}</td></tr>)}
          </Fragment>)}
          <tr className="total-row"><td colSpan={1}>Total</td><td>{money(totalSalidas)}</td><td colSpan={2} /></tr>
        </tbody></table> : <p className="field-hint">No hay salidas registradas este día.</p>}
      </section>
    </div>
  </div></main>;
}
