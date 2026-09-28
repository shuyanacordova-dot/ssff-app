"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Scale, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { fechaCorta, money } from "@/lib/mis-deudas-calc";
import { guardarCuadreGeneral } from "./actions";
import s from "../mis-deudas.module.css";

export type FilaCuadreGeneral = {
  sucursal_id: string; sucursal_nombre: string; fecha: string;
  cuentas_total: number; cuentas_cuadradas: number; bancos_real: number; bancos_esperado: number;
  caja_contada: boolean; caja_fecha: string | null; caja_real: number | null; caja_esperada: number;
  caja_base_origen: string | null; caja_base_monto: number | null;
  guardado: { tarjetas_por_acreditar: number; diferencia: number; notas: string | null; creado_en: string } | null;
};

const nombreSucursal = (n: string) => n === "Shuvision" ? "Shuvision Shushufindi" : n;
const limpiarMonto = (v: string) => v.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const cuadra = (d: number) => Math.abs(d) < 0.005;
const redondear = (n: number) => Math.round(n * 100) / 100;

function Pill({ diferencia }: { diferencia: number }) {
  if (cuadra(diferencia)) return <span className={`${s.pill} ${s.pillPagado}`}>Cuadra</span>;
  return <span className={`${s.pill} ${s.pillVencido}`}>{diferencia > 0 ? `Sobra ${money(diferencia)}` : `Falta ${money(-diferencia)}`}</span>;
}

// Cuadre general por sucursal: bancos (saldo real del cuadre de hoy) + efectivo en caja + tarjetas por acreditar vs lo esperado.
export default function CuadreGeneral({ fecha, filas }: { fecha: string; filas: FilaCuadreGeneral[] }) {
  const router = useRouter();
  const [tarjetas, setTarjetas] = useState<Record<string, string>>(() => Object.fromEntries(filas.map((f) => [f.sucursal_id, f.guardado?.tarjetas_por_acreditar ? String(f.guardado.tarjetas_por_acreditar) : ""])));
  const [notas, setNotas] = useState(filas.find((f) => f.guardado?.notas)?.guardado?.notas ?? "");
  const [mensaje, setMensaje] = useState("");
  const [pending, start] = useTransition();

  const calculo = filas.map((f) => {
    const tarj = Number(tarjetas[f.sucursal_id] || 0) || 0;
    const cajaReal = f.caja_real ?? f.caja_esperada;
    const real = redondear(Number(f.bancos_real) + Number(cajaReal) + tarj);
    const esperado = redondear(Number(f.bancos_esperado) + Number(f.caja_esperada));
    return { f, tarj, real, esperado, diferencia: redondear(real - esperado) };
  });
  const totalReal = redondear(calculo.reduce((a, c) => a + c.real, 0));
  const totalEsperado = redondear(calculo.reduce((a, c) => a + c.esperado, 0));
  const totalDif = redondear(totalReal - totalEsperado);
  const faltanCuentas = filas.reduce((a, f) => a + (f.cuentas_total - f.cuentas_cuadradas), 0);
  const cajasSinContar = filas.filter((f) => !f.caja_contada).length;
  const completo = faltanCuentas === 0 && cajasSinContar === 0;

  const guardar = () => start(async () => {
    setMensaje("");
    const r = await guardarCuadreGeneral(fecha, Object.fromEntries(calculo.map((c) => [c.f.sucursal_id, c.tarj])), notas);
    if (!r.ok) { setMensaje(r.error); return; }
    setMensaje(`Cuadre general del ${fechaCorta(fecha)} guardado.`);
    router.refresh();
  });

  return <section className="glass agenda-board" style={{ marginBottom: 18 }}>
    <p className="section-label">CUADRE GENERAL · {fechaCorta(fecha).toUpperCase()}</p>
    <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><Scale size={22} /> Bancos + efectivo + tarjetas</h2>
    <p style={{ marginTop: 0, color: "#66768b", fontSize: 14 }}>Por cada sucursal: el saldo real de sus bancos, el efectivo de su caja y las tarjetas que el banco aún no deposita, comparado con lo que LumOS espera según ventas, abonos, egresos y depósitos.</p>

    <div className={`${s.card} ${completo && cuadra(totalDif) ? s.cardGreen : cuadra(totalDif) ? s.cardNavy : s.cardRed}`} style={{ marginBottom: 14 }}>
      <span>{completo && cuadra(totalDif) ? "Cuentas cuadradas" : cuadra(totalDif) ? "Cuadra con lo registrado hasta ahora" : totalDif > 0 ? "Sobra dinero" : "Falta dinero"}</span>
      <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>{cuadra(totalDif) ? <CheckCircle2 size={26} /> : <XCircle size={26} />}{cuadra(totalDif) ? money(totalReal) : `${totalDif > 0 ? "+" : "−"}${money(Math.abs(totalDif))}`}</strong>
      <small>Real {money(totalReal)} · Esperado {money(totalEsperado)}{!completo ? ` · ${[faltanCuentas ? `${faltanCuentas} cuenta(s) sin cuadrar` : "", cajasSinContar ? `${cajasSinContar} caja(s) sin cuadre de hoy` : ""].filter(Boolean).join(" · ")}` : ""}</small>
    </div>

    <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>{calculo.map(({ f, real, esperado, diferencia }) => <article key={f.sucursal_id} className={s.debt}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><h3>{nombreSucursal(f.sucursal_nombre)}</h3><Pill diferencia={diferencia} /></div>

      <div style={{ display: "grid", gap: 2 }}>
        <p style={{ fontWeight: 800, color: "#274c77" }}>Bancos</p>
        <p>Real {money(Number(f.bancos_real))} · esperado {money(Number(f.bancos_esperado))}</p>
        {f.cuentas_cuadradas < f.cuentas_total && <p style={{ color: "#a24150", fontWeight: 700 }}><AlertTriangle size={12} /> {f.cuentas_cuadradas} de {f.cuentas_total} cuentas cuadradas hoy: faltan en el total.</p>}
      </div>

      <div style={{ display: "grid", gap: 2 }}>
        <p style={{ fontWeight: 800, color: "#274c77" }}>Efectivo en caja</p>
        {f.caja_contada
          ? <p>Contado {money(Number(f.caja_real))} · esperado {money(Number(f.caja_esperada))} (cuadre de caja de este día)</p>
          : <><p>Debería haber <strong>{money(Number(f.caja_esperada))}</strong></p>
            <p style={{ color: "#9a6400", fontWeight: 700 }}><AlertTriangle size={12} /> Sin cuadre de caja este día. {f.caja_fecha ? `Parte del ${f.caja_base_origen === "apertura" ? "efectivo de apertura" : "último cuadre"} del ${fechaCorta(f.caja_fecha)} (${money(Number(f.caja_base_monto ?? 0))}) + cobros en efectivo − egresos en efectivo desde entonces.` : "No hay cuadre ni apertura anterior."}</p></>}
      </div>

      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800, color: "#5d7086" }}>Tarjetas cobradas que el banco aún no deposita $
        <input inputMode="decimal" value={tarjetas[f.sucursal_id] ?? ""} onChange={(e) => setTarjetas({ ...tarjetas, [f.sucursal_id]: limpiarMonto(e.target.value) })} placeholder="0.00" style={{ border: "1px solid #d4e0ea", borderRadius: 9, padding: "7px 9px" }} />
      </label>

      <div className={s.summaryLine} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>Real {money(real)}</span><span>Esperado {money(esperado)}</span></div>
    </article>)}</div>

    <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
      <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (ej. diferencia de Sacha por abonos de Optox sin registrar)" style={{ border: "1px solid #d4e0ea", borderRadius: 10, padding: "9px 10px" }} />
      {mensaje && <p className="notice" role="status">{mensaje}</p>}
      <button className="new-consultation" type="button" disabled={pending} onClick={guardar}>{pending ? "Guardando…" : filas.some((f) => f.guardado) ? "Actualizar cuadre general" : "Guardar cuadre general"}</button>
    </div>
  </section>;
}
