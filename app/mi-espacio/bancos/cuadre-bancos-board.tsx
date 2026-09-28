"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Landmark, LockKeyhole, X, XCircle } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { fechaCorta, hoyEcuador, money } from "@/lib/mis-deudas-calc";
import { previsualizarCuadreBanco, registrarCuadreBanco, type MovimientoCuadre, type ResultadoCuadreBanco, type VistaCuadreBanco } from "./actions";
import s from "../mis-deudas.module.css";
import { ExtrasSucursal, type FilaCuadreGeneral } from "./cuadre-general";

export type CuentaCuadre = { id: string; empresa_id: string; empresa_nombre: string; sucursal_nombre: string; banco: string; saldo_actual: number };
export type CuadreGuardado = { id: string; cuenta_id: string; fecha: string; desde: string | null; saldo_anterior: number | null; transferencias: number; tarjetas: number; depositos_caja: number; otros_ingresos: number; egresos: number; comisiones: number; saldo_esperado: number | null; saldo_real: number; diferencia: number | null; notas: string | null };

const bancoLabel: Record<string, string> = { pichincha: "Banco Pichincha", guayaquil: "Banco Guayaquil", internacional: "Banco Internacional" };
const bancoColor: Record<string, string> = { pichincha: "#c99a00", guayaquil: "#c2185b", internacional: "#1f4e8c" };
const grupoLabel: Record<MovimientoCuadre["grupo"], string> = { transferencias: "Transferencia", tarjetas: "Tarjeta", depositos_caja: "Depósito", otros_ingresos: "Ingreso", egresos: "Egreso" };
const limpiarMonto = (v: string) => v.replace(/,/g, ".").replace(/[^0-9.-]/g, "").replace(/(?!^)-/g, "").replace(/(\..*)\./g, "$1");
// "Shuvision" es la sucursal de Shushufindi.
const nombreSucursal = (n: string) => n === "Shuvision" ? "Shuvision Shushufindi" : n;
const cuadra = (d: number | null) => d !== null && Math.abs(d) < 0.005;

function PillDiferencia({ diferencia }: { diferencia: number | null }) {
  if (diferencia === null) return <span className={`${s.pill} ${s.pillProximo}`}>Punto de partida</span>;
  if (cuadra(diferencia)) return <span className={`${s.pill} ${s.pillPagado}`}>Cuadra</span>;
  return <span className={`${s.pill} ${s.pillVencido}`}>{diferencia > 0 ? `Sobra ${money(diferencia)}` : `Falta ${money(-diferencia)}`}</span>;
}

export default function CuadreBancosBoard(props: { status: "ready" | "needs_login" | "forbidden"; fecha: string; cuentas: CuentaCuadre[]; historial: CuadreGuardado[]; general: FilaCuadreGeneral[] }) {
  const router = useRouter();
  // La fecha va en la dirección (?fecha=) para que el cuadre general se calcule en el servidor.
  const fecha = props.fecha;
  const setFecha = (f: string) => router.push(`/mi-espacio/bancos?fecha=${f}`);
  const [abierta, setAbierta] = useState<CuentaCuadre | null>(null);
  const [notice, setNotice] = useState("");

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/mi-espacio">← Mis deudas</Link><p className="eyebrow">ESPACIO PRIVADO</p><h1>Cuadre de bancos</h1><p className="subtitle">{props.status === "needs_login" ? "Inicia sesión para continuar." : "Este apartado es solo para la Superadministradora."}</p></div></header></div></main>;

  const ultimo = (cuentaId: string) => props.historial.find((h) => h.cuenta_id === cuentaId);
  const esSabado = new Date(`${fecha}T12:00:00Z`).getUTCDay() === 6;
  // Cada sucursal tiene sus propias cuentas: Shuvision (Shushufindi), Shuvision Sacha y Focus.
  const sucursales = Array.from(new Set(props.cuentas.map((c) => c.sucursal_nombre)));
  const hechasEnFecha = props.cuentas.filter((c) => props.historial.some((h) => h.cuenta_id === c.id && h.fecha === fecha)).length;
  const cuentaPorId = new Map(props.cuentas.map((c) => [c.id, c]));

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header">
      <div><Link className="back-link" href="/mi-espacio">← Mis deudas</Link><p className="eyebrow">ESPACIO PRIVADO · SOLO PARA TI</p><h1>Cuadre de bancos</h1><p className="subtitle">Cada sábado: el saldo real de cada cuenta y el efectivo de cada caja, comparados con lo que LumOS esperaba según ventas, abonos, depósitos y pagos.</p></div>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800, color: "#5d7086" }}>Fecha del cuadre<input type="date" value={fecha} max={hoyEcuador()} onChange={(e) => setFecha(e.target.value || hoyEcuador())} style={{ border: "1px solid #d4e0ea", borderRadius: 10, padding: "8px 10px" }} /></label>
    </header>
    {notice && <div className="notice"><LockKeyhole size={18} /><span>{notice}</span></div>}

    {!esSabado && <div className="notice"><Landmark size={18} /><span>El cuadre toca los sábados, pero puedes hacerlo cualquier día: se cuenta desde el último cuadre de cada cuenta hasta la fecha elegida.</span></div>}

    <div className={s.cards} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
      <div className={`${s.card} ${s.cardNavy}`}><span>Cuentas cuadradas</span><strong>{hechasEnFecha} de {props.cuentas.length}</strong><small>en la fecha {fechaCorta(fecha)}</small></div>
      <div className={`${s.card} ${s.cardTeal}`}><span>Saldo total en LumOS</span><strong>{money(props.cuentas.reduce((a, c) => a + c.saldo_actual, 0))}</strong><small>según el último cuadre y lo registrado después</small></div>
    </div>

    {sucursales.map((sucursal) => {
      const fila = props.general.find((g) => g.sucursal_nombre === sucursal);
      return <section key={sucursal} style={{ marginBottom: 18 }}>
      <div className={s.sectionTitle}><h2>{nombreSucursal(sucursal)}</h2></div>
      <div className={s.grid}>{props.cuentas.filter((c) => c.sucursal_nombre === sucursal).map((c) => {
        const u = ultimo(c.id); const hecha = u?.fecha === fecha;
        return <article key={c.id} className={s.debt} style={{ borderTop: `4px solid ${bancoColor[c.banco] ?? "#274c77"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><h3>{bancoLabel[c.banco] ?? c.banco}</h3>{u && <PillDiferencia diferencia={u.diferencia} />}</div>
          <p>Saldo en LumOS</p>
          <div className={s.saldo}>{money(c.saldo_actual)}</div>
          <p>{u ? `Último cuadre: ${fechaCorta(u.fecha)} · saldo real ${money(u.saldo_real)}` : "Todavía sin cuadrar: el primer cuadre fija el punto de partida."}</p>
          <div className={s.actions}><button type="button" className={hecha ? "outline-action" : "new-consultation"} onClick={() => setAbierta(c)}>{hecha ? "Rehacer cuadre" : "Cuadrar"}</button></div>
        </article>;
      })}
        {fila && <ExtrasSucursal key={`${fila.sucursal_id}:${fecha}:${fila.guardado?.creado_en ?? ""}`} fila={fila} fecha={fecha} />}
      </div>
    </section>;
    })}

    <section className="glass agenda-board">
      <p className="section-label">HISTORIAL</p><h2>Cuadres anteriores</h2>
      {props.historial.length ? <div className={s.timeline}>{props.historial.map((h) => {
        const c = cuentaPorId.get(h.cuenta_id);
        return <div key={h.id} className={s.row} style={{ gridTemplateColumns: "62px 6px minmax(0, 1fr) auto" }}>
          <div className={s.day}><strong>{h.fecha.slice(8, 10)}</strong><small>{fechaCorta(h.fecha).replace(/^\d+\s*/, "")}</small></div>
          <div className={s.bar} style={{ background: bancoColor[c?.banco ?? ""] ?? "#274c77" }} />
          <div className={s.info}><h3>{bancoLabel[c?.banco ?? ""] ?? "Cuenta"} · {nombreSucursal(c?.sucursal_nombre ?? "")}</h3><p>{h.saldo_esperado === null ? "Punto de partida" : `Esperado ${money(h.saldo_esperado)}`} · Real {money(h.saldo_real)}{h.comisiones ? ` · Comisiones ${money(h.comisiones)}` : ""}{h.notas ? ` · ${h.notas}` : ""}</p></div>
          <div className={s.right}><PillDiferencia diferencia={h.diferencia} /></div>
        </div>;
      })}</div> : <p className={s.empty}>Aún no hay cuadres. Empieza con cualquier cuenta: el primero solo guarda el saldo real como punto de partida.</p>}
    </section>

    {abierta && <CuadreModal key={`${abierta.id}:${fecha}`} cuenta={abierta} fecha={fecha} onClose={() => setAbierta(null)} onSaved={(m) => { setNotice(m); router.refresh(); }} />}
  </div></main>;
}

function CuadreModal({ cuenta, fecha, onClose, onSaved }: { cuenta: CuentaCuadre; fecha: string; onClose: () => void; onSaved: (m: string) => void }) {
  const [vista, setVista] = useState<VistaCuadreBanco | null>(null);
  const [error, setError] = useState("");
  const [saldoReal, setSaldoReal] = useState("");
  const [comisiones, setComisiones] = useState("");
  const [notas, setNotas] = useState("");
  const [verDetalle, setVerDetalle] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCuadreBanco | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let activo = true;
    previsualizarCuadreBanco(cuenta.id, fecha).then((r) => { if (!activo) return; if (r.ok) setVista(r.data); else setError(r.error); });
    return () => { activo = false; };
  }, [cuenta.id, fecha]);

  const cargos = Number(comisiones.replace(",", ".")) || 0;
  const esperado = vista && !vista.primer_cuadre && vista.saldo_anterior !== null
    ? Number(vista.saldo_anterior) + Number(vista.transferencias) + Number(vista.tarjetas) + Number(vista.depositos_caja) + Number(vista.otros_ingresos) - Number(vista.egresos) - cargos
    : null;
  const real = saldoReal.trim() ? Number(saldoReal.replace(",", ".")) : null;
  const diferencia = esperado !== null && real !== null && Number.isFinite(real) ? Math.round((real - esperado) * 100) / 100 : null;

  const guardar = () => start(async () => {
    setError("");
    const r = await registrarCuadreBanco(cuenta.id, fecha, saldoReal, comisiones, notas);
    if (!r.ok) { setError(r.error); return; }
    setResultado(r.data);
    onSaved(`Cuadre de ${bancoLabel[cuenta.banco] ?? cuenta.banco} · ${nombreSucursal(cuenta.sucursal_nombre)} guardado.`);
  });

  const Linea = ({ signo, texto, monto, ayuda }: { signo: string; texto: string; monto: number; ayuda?: string }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid #edf2f7" }}>
    <span style={{ fontSize: 14 }}><strong style={{ display: "inline-block", width: 16, color: signo === "−" ? "#a24150" : "#247658" }}>{signo}</strong>{texto}{ayuda && <small style={{ display: "block", marginLeft: 16, color: "#66768b" }}>{ayuda}</small>}</span>
    <strong style={{ whiteSpace: "nowrap" }}>{money(monto)}</strong>
  </div>;

  return <div className="modal-backdrop"><section className="new-patient-modal sale-modal-shell" role="dialog" aria-modal="true" aria-labelledby="cuadre-banco-title">
    <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">CUADRE DE BANCOS · {fechaCorta(fecha).toUpperCase()}</p>
    <h2 id="cuadre-banco-title">{bancoLabel[cuenta.banco] ?? cuenta.banco} · {nombreSucursal(cuenta.sucursal_nombre)}</h2>

    {resultado ? <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "18px 0", textAlign: "center" }}>
      {resultado.primer_cuadre ? <><CheckCircle2 size={48} color="#274c77" /><h3 style={{ margin: 0 }}>Punto de partida guardado</h3><p>Desde ahora, cada cuadre comparará contra {money(resultado.saldo_real)}.</p></>
        : cuadra(resultado.diferencia) ? <><CheckCircle2 size={48} color="#247658" /><h3 style={{ margin: 0 }}>¡La cuenta cuadra!</h3><p>Saldo real {money(resultado.saldo_real)}, igual a lo esperado.</p></>
        : <><XCircle size={48} color="#a24150" /><h3 style={{ margin: 0 }}>{(resultado.diferencia ?? 0) > 0 ? "Sobra" : "Falta"} {money(Math.abs(resultado.diferencia ?? 0))}</h3><p>Esperado {money(resultado.saldo_esperado ?? 0)} · real {money(resultado.saldo_real)}. Quedó guardado con la diferencia y tus notas.</p></>}
      <button className="new-consultation" type="button" onClick={onClose}>Listo</button>
    </div>
    : !vista ? (error ? <p className="notice" role="alert">{error}</p> : <p className="field-hint">Calculando los movimientos de la semana…</p>)
    : <>
      <p style={{ marginTop: 0 }}>{vista.primer_cuadre
        ? "Es el primer cuadre de esta cuenta: escribe el saldo que muestra hoy el banco y quedará como punto de partida. Abajo ves lo que LumOS registró en los últimos 7 días, como referencia."
        : `Movimientos desde el cuadre del ${fechaCorta(vista.desde)} hasta el ${fechaCorta(vista.fecha)}.`}</p>
      {vista.hay_posterior && <p className="notice" role="alert"><AlertTriangle size={16} /> Ya hay un cuadre posterior de esta cuenta; este no se puede cambiar.</p>}
      {vista.ya_existe && !vista.hay_posterior && <p className="notice">Ya hiciste el cuadre de esta fecha; si lo guardas de nuevo, se reemplaza.</p>}

      <div className="glass clinical-card" style={{ minHeight: "auto", padding: "8px 14px", margin: "10px 0" }}>
        {!vista.primer_cuadre && <Linea signo="" texto={`Saldo real del cuadre anterior (${fechaCorta(vista.desde)})`} monto={Number(vista.saldo_anterior ?? 0)} />}
        <Linea signo="+" texto="Transferencias de pacientes" monto={Number(vista.transferencias)} />
        {cuenta.banco === "pichincha" && <Linea signo="+" texto="Pagos con tarjeta" monto={Number(vista.tarjetas)} ayuda="Llegan a Pichincha con comisión y 1 a 3 días después." />}
        <Linea signo="+" texto="Depósitos desde la caja" monto={Number(vista.depositos_caja)} />
        {Number(vista.otros_ingresos) !== 0 && <Linea signo="+" texto="Otros ingresos registrados" monto={Number(vista.otros_ingresos)} />}
        <Linea signo="−" texto="Pagos y egresos por banco" monto={Number(vista.egresos)} ayuda="Proveedores, gastos fijos, deudas y devoluciones pagados desde esta cuenta." />
        {!vista.primer_cuadre && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #edf2f7" }}>
          <span style={{ fontSize: 14 }}><strong style={{ display: "inline-block", width: 16, color: "#a24150" }}>−</strong>Comisiones y cargos del banco</span>
          <input inputMode="decimal" value={comisiones} onChange={(e) => setComisiones(limpiarMonto(e.target.value).replace("-", ""))} placeholder="0.00" style={{ width: 100, border: "1px solid #d4e0ea", borderRadius: 9, padding: "6px 8px", textAlign: "right" }} />
        </div>}
        {esperado !== null && <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", fontSize: 17 }}><strong>= Saldo esperado</strong><strong>{money(esperado)}</strong></div>}
      </div>

      {Number(vista.transferencias_sin_banco) > 0 && <p className="notice"><AlertTriangle size={16} /> Hay {money(Number(vista.transferencias_sin_banco))} en transferencias de {nombreSucursal(cuenta.sucursal_nombre)} sin banco anotado en este periodo: no se sabe a qué cuenta llegaron y no se suman aquí.</p>}

      {vista.detalle.length > 0 && <button type="button" className="text-action" onClick={() => setVerDetalle(!verDetalle)}>{verDetalle ? "Ocultar movimientos" : `Ver los ${vista.detalle.length} movimientos`}</button>}
      {verDetalle && <div style={{ display: "grid", gap: 4, margin: "8px 0", maxHeight: 260, overflow: "auto" }}>{vista.detalle.map((m, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, background: "#f6f9fc", borderRadius: 8, padding: "6px 10px" }}>
        <span><strong>{fechaCorta(m.fecha)}</strong> · {grupoLabel[m.grupo]} · {m.descripcion}</span><strong style={{ color: m.monto < 0 ? "#a24150" : "#247658", whiteSpace: "nowrap" }}>{m.monto < 0 ? "−" : "+"}{money(Math.abs(m.monto))}</strong>
      </div>)}</div>}

      <div className="new-patient-form" style={{ marginTop: 12 }}>
        <label>Saldo real que muestra el banco $<input inputMode="decimal" value={saldoReal} onChange={(e) => setSaldoReal(limpiarMonto(e.target.value))} placeholder="Ej. 1250.40" autoFocus style={{ fontSize: 18 }} /></label>
        <label>Notas (opcional)<input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. tarjeta del viernes aún no acreditada" /></label>
      </div>
      {diferencia !== null && <p style={{ margin: "10px 0 0", fontWeight: 800, color: cuadra(diferencia) ? "#247658" : "#a24150" }}>{cuadra(diferencia) ? "✓ La cuenta cuadra." : `${diferencia > 0 ? "Sobran" : "Faltan"} ${money(Math.abs(diferencia))} respecto a lo esperado.`}</p>}
      {error && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="button" disabled={pending || !saldoReal.trim() || vista.hay_posterior} onClick={guardar}>{pending ? "Guardando…" : vista.primer_cuadre ? "Guardar punto de partida" : "Guardar cuadre"}</button></div>
    </>}
  </section></div>;
}
