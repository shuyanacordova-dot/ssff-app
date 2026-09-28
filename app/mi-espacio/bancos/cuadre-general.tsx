"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { fechaCorta, money } from "@/lib/mis-deudas-calc";
import { guardarCuadreSucursal } from "./actions";
import s from "../mis-deudas.module.css";

export type FilaCuadreGeneral = {
  sucursal_id: string; sucursal_nombre: string; fecha: string;
  cuentas_total: number; cuentas_cuadradas: number; bancos_real: number; bancos_esperado: number;
  caja_contada: boolean; caja_fecha: string | null; caja_real: number | null; caja_esperada: number;
  caja_base_origen: string | null; caja_base_monto: number | null;
  tarjetas_cobradas: number; tarjetas_desde: string;
  guardado: { tarjetas_por_acreditar: number; diferencia: number; notas: string | null; creado_en: string } | null;
};

const limpiarMonto = (v: string) => v.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const cuadra = (d: number) => Math.abs(d) < 0.005;
const redondear = (n: number) => Math.round(n * 100) / 100;

function Pill({ diferencia }: { diferencia: number }) {
  if (cuadra(diferencia)) return <span className={`${s.pill} ${s.pillPagado}`}>Cuadra</span>;
  return <span className={`${s.pill} ${s.pillVencido}`}>{diferencia > 0 ? `Sobra ${money(diferencia)}` : `Falta ${money(-diferencia)}`}</span>;
}

export function ExtrasSucursal({ fila, fecha }: { fila: FilaCuadreGeneral; fecha: string }) {
  const router = useRouter();
  const [tarjetas, setTarjetas] = useState(fila.guardado ? String(Number(fila.guardado.tarjetas_por_acreditar)) : "");
  const [notas, setNotas] = useState(fila.guardado?.notas ?? "");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const montoTarjetas = Number(tarjetas) || 0;
  const real = Number(fila.bancos_real) + Number(fila.caja_real ?? 0) + montoTarjetas;
  const esperado = Number(fila.bancos_esperado) + Number(fila.caja_esperada);
  const diferencia = redondear(real - esperado);
  const faltanCuentas = Number(fila.cuentas_total) - Number(fila.cuentas_cuadradas);
  const desde = new Date(`${fila.tarjetas_desde}T12:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() + 1);
  const guardadoFecha = fila.guardado ? new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(fila.guardado.creado_en)) : null;

  const guardar = () => start(async () => {
    setMensaje("");
    setError("");
    const r = await guardarCuadreSucursal(fila.sucursal_id, fecha, tarjetas, notas);
    if (!r.ok) { setError(r.error); return; }
    setMensaje("Resultado guardado.");
    router.refresh();
  });

  return <>
    <article className={s.debt} style={{ borderTop: "4px solid #7a3fa0" }}>
      <h3>Tarjetas por depositar</h3>
      <p>Cobrado con tarjeta desde el {fechaCorta(desde.toISOString().slice(0, 10))}: {money(Number(fila.tarjetas_cobradas))}</p>
      <p>Datafast deposita días después: escribe cuánto de eso todavía no llega al banco.</p>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800, color: "#5d7086" }}>Por depositar $
        <input type="text" inputMode="decimal" value={tarjetas} disabled={pending} onChange={(e) => { setTarjetas(limpiarMonto(e.target.value)); setMensaje(""); }} placeholder="0.00" style={{ border: "1px solid #d4e0ea", borderRadius: 9, padding: "7px 9px" }} />
      </label>
    </article>

    <article className={s.debt} style={{ borderTop: "4px solid #247658" }}>
      <h3>Efectivo en caja</h3>
      {fila.caja_contada ? <>
        <p>Último cuadre de caja: {fila.caja_fecha ? fechaCorta(fila.caja_fecha) : "—"}</p>
        <div className={s.saldo}>{money(Number(fila.caja_real ?? 0))}</div>
        <p>Esperado {money(Number(fila.caja_esperada))}</p>
        <div><Pill diferencia={redondear(Number(fila.caja_real ?? 0) - Number(fila.caja_esperada))} /></div>
      </> : <p>Sin cuadre de caja todavía</p>}
      <Link href="/caja" className="text-action">Ver cuadre de caja</Link>
    </article>

    <div className={`${s.card} ${faltanCuentas > 0 ? s.cardNavy : cuadra(diferencia) ? s.cardGreen : s.cardRed}`} style={{ gridColumn: "1 / -1" }}>
      <span>{faltanCuentas > 0 ? `Faltan ${faltanCuentas} cuenta(s) por cuadrar hoy` : cuadra(diferencia) ? "Todo cuadrado" : diferencia > 0 ? "Sobra dinero" : "Falta dinero"}</span>
      {faltanCuentas <= 0 && <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {cuadra(diferencia) ? <><CheckCircle2 size={26} aria-hidden="true" />{money(real)}</> : `${diferencia > 0 ? "+" : "−"}${money(Math.abs(diferencia))}`}
      </strong>}
      <small>Real {money(real)} · Esperado {money(esperado)}</small>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>Notas (opcional)
          <input value={notas} disabled={pending} onChange={(e) => { setNotas(e.target.value); setMensaje(""); }} style={{ border: "1px solid #d4e0ea", borderRadius: 10, padding: "9px 10px", color: "#1f2f44", background: "#fff" }} />
        </label>
        {guardadoFecha && <small>Guardado el {fechaCorta(guardadoFecha)}</small>}
        {error && <p className="notice" role="alert">{error}</p>}
        {mensaje && <p role="status">{mensaje}</p>}
        <button className="new-consultation" type="button" disabled={pending} onClick={guardar}>{pending ? "Guardando…" : fila.guardado ? "Actualizar resultado" : "Guardar resultado"}</button>
      </div>
    </div>
  </>;
}
