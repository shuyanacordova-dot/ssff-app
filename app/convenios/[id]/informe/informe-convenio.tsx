"use client";

import { liquidarConvenio } from "@/lib/convenio-liquidacion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { printDocumentById } from "@/lib/print-document";

type Numeric = number | string;
type Fila = {
  venta_id: string; folio: Numeric; fecha_venta: string; empleado: string;
  cedula: string | null; sucursal: string | null;
  total: Numeric; pagado: Numeric; saldo: Numeric; con_acuerdo: boolean;
  cuotas: Numeric | null; monto_cuota: Numeric | null; cuota_numero: Numeric | null; cuota_mes: Numeric;
};
export type InformeData = {
  convenio: { id: string; nombre: string };
  optica: { id: string; nombre: string; direccion: string | null; telefono: string | null; email: string | null; logo_url: string | null };
  mes: string; filas: Fila[];
};
type Props = { convenioId: string } & (
  | { status: "ready"; data: InformeData; mes: string; opticaId: string; opticas: { id: string; nombre: string }[] }
  | { status: "needs_login" | "forbidden" | "error"; message?: string }
);
type Edicion = { incluir: boolean; descuento: string };
const money = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
const importe = (value: string) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;

export default function InformeConvenio(props: Props) {
  const router = useRouter();
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>(() => Object.fromEntries(
    props.status === "ready" ? props.data.filas.map((fila) => [fila.venta_id, {
      incluir: true, descuento: Number(fila.cuota_mes).toFixed(2),
    }]) : [],
  ));
  const header = <header className="agenda-header no-print"><div>
    <Link className="back-link" href={`/convenios/${props.convenioId}`}>← Convenio</Link>
    <p className="eyebrow">CONVENIOS</p><h1>Informe mensual</h1>
    {props.status === "ready" && <p className="subtitle">Descuentos por rol de pagos de {props.data.convenio.nombre}</p>}
  </div></header>;

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell">
    {header}<p role="status">{props.message ?? (props.status === "needs_login" ? "Inicia sesión para ver el informe."
      : props.status === "forbidden" ? "Tu perfil no tiene acceso a este informe." : "No se pudo cargar el informe.")}</p>
  </div></main>;

  const { data: { convenio, optica, filas }, mes, opticaId, opticas, convenioId } = props;
  const cambiarFiltro = (m: string, o: string) => {
    if (m) router.push(`/convenios/${convenioId}/informe?mes=${encodeURIComponent(m)}&optica=${encodeURIComponent(o)}`);
  };
  const editar = (id: string, cambio: Partial<Edicion>) => setEdiciones((actual) => ({
    ...actual, [id]: { ...actual[id], ...cambio },
  }));
  const liquidacion = liquidarConvenio(convenio.id, filas.filter((fila) => ediciones[fila.venta_id].incluir).map((fila) => importe(ediciones[fila.venta_id].descuento)));
  const total = liquidacion.bruto;
  const excedeSaldo = filas.some((fila) => ediciones[fila.venta_id].incluir && importe(ediciones[fila.venta_id].descuento) > Number(fila.saldo));
  const mesNombre = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${mes}-15T12:00:00Z`));
  const fechaEmision = new Intl.DateTimeFormat("es-EC", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil",
  }).format(new Date());
  let numero = 0;

  return <main className="page agenda-page"><div className="container agenda-shell">
    {header}
    <div className="agenda-toolbar no-print">
      <label className="new-patient-form">Mes<input type="month" value={mes} onChange={(e) => cambiarFiltro(e.target.value, opticaId)} /></label>
      {opticas.length > 1 && <label className="new-patient-form">Óptica<select value={opticaId} onChange={(e) => cambiarFiltro(mes, e.target.value)}>
        {opticas.map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.nombre}</option>)}
      </select></label>}
      <button type="button" className="new-consultation" disabled={excedeSaldo} onClick={() => printDocumentById("informe-convenio-print")}>Imprimir / Guardar PDF</button>
      <Link className="outline-action" href={`/cuentas-cobrar?convenio=${convenioId}`}>Ver cuentas por cobrar</Link>
      <p className="field-hint" style={{ flexBasis: "100%" }}>Revisa los valores antes de imprimir; puedes cambiar el valor a descontar o quitar a alguien.</p>
    </div>
    <section id="informe-convenio-print" className="glass agenda-board print-area">
      <div className="letterhead" style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 24 }}>
        {optica.logo_url ? <img src={optica.logo_url} alt={`Logo de ${optica.nombre}`} style={{ maxHeight: 70, maxWidth: 180, objectFit: "contain" }} /> : <strong>{optica.nombre}</strong>}
        <div><strong>{optica.nombre}</strong>
          {optica.direccion && <div>{optica.direccion}</div>}
          {optica.telefono && <div>{optica.telefono}</div>}
          {optica.email && <div>{optica.email}</div>}
        </div>
      </div>
      <h2>Informe de descuentos por rol de pagos</h2>
      <p>Empresa: {convenio.nombre}<br />Mes: {mesNombre}<br />Fecha de emisión: {fechaEmision}</p>
      {filas.length === 0 ? <p>No hay empleados con saldo pendiente en esta óptica para este convenio.</p> : <table className="resumen-table">
        <thead><tr><th scope="col" className="no-print">Incluir</th><th scope="col">N°</th><th scope="col">Empleado</th><th scope="col">Cédula</th><th scope="col">Detalle</th><th scope="col">Valor a descontar</th><th scope="col">Saldo después</th></tr></thead>
        <tbody>{filas.map((fila) => {
          const { incluir, descuento } = ediciones[fila.venta_id];
          const saldo = Number(fila.saldo);
          const valor = importe(descuento);
          const cuota = Number(fila.cuota_numero);
          const cuotas = Number(fila.cuotas);
          const detalle = !fila.con_acuerdo ? "Saldo pendiente" : cuota < 1 ? "Aún no inicia"
            : cuota > cuotas ? "Saldo final" : `Cuota ${cuota} de ${cuotas}`;
          return <tr key={fila.venta_id} className={incluir ? undefined : "no-print"} style={{ opacity: incluir ? 1 : 0.45 }}>
            <td className="no-print"><input type="checkbox" checked={incluir} aria-label={`Incluir a ${fila.empleado}, folio ${fila.folio}`} onChange={(e) => editar(fila.venta_id, { incluir: e.target.checked })} /></td>
            <td>{incluir ? ++numero : "—"}</td><td>{fila.empleado}</td><td>{fila.cedula}</td>
            <td>{detalle}<small style={{ display: "block", color: "#6b7280" }}>Folio {fila.folio} · {fila.sucursal}</small></td>
            <td style={{ textAlign: "right" }}><input inputMode="decimal" value={descuento} aria-label={`Valor a descontar a ${fila.empleado}, folio ${fila.folio}`}
              aria-invalid={valor > saldo} aria-describedby={valor > saldo ? `saldo-${fila.venta_id}` : undefined}
              style={{ width: 90, textAlign: "right" }}
              onChange={(e) => editar(fila.venta_id, { descuento: e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1") })}
              onBlur={() => editar(fila.venta_id, { descuento: Math.max(0, Math.min(valor, saldo)).toFixed(2) })} />
              {valor > saldo && <small id={`saldo-${fila.venta_id}`} className="no-print" style={{ display: "block", color: "#b42318" }}>No puede superar el saldo de {money.format(saldo)}.</small>}
            </td><td style={{ textAlign: "right" }}>{money.format(saldo - valor)}</td>
          </tr>;
        })}</tbody>
        <tfoot><tr className="total-row"><td className="no-print" /><td colSpan={4}>Total a descontar</td><td style={{ textAlign: "right" }}>{money.format(total)}</td><td /></tr></tfoot>
      </table>}
      {liquidacion.porcentaje > 0 && <div style={{ marginTop: 24, breakInside: "avoid" }}>
        <p>Total a descontar a los empleados: <strong>{money.format(total)}</strong></p>
        <p>Descuento retenido por el sindicato (5 %): <strong>{money.format(liquidacion.retencion)}</strong></p>
        <p>Neto a entregar a {optica.nombre}: <strong>{money.format(liquidacion.neto)}</strong></p>
        <p className="field-hint">El sindicato conserva el 5 % del total del mes y entrega el 95 % a la óptica.</p>
      </div>}
      <p className="field-hint no-print">Este informe usa los saldos pendientes actuales. Generarlo no registra abonos ni modifica la deuda.</p>
      <footer style={{ marginTop: 32, breakInside: "avoid" }}><p>Atentamente,</p>
        <div style={{ borderTop: "1px solid", width: 260, maxWidth: "100%", marginTop: 48, paddingTop: 8 }}>{optica.nombre}</div>
      </footer>
    </section>
  </div></main>;
}
