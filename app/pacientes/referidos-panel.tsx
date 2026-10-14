"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { ajustarMonedero, obtenerEstadoMonedero, registrarReferidoFicha } from "@/app/referidos/actions";
import { dinero, estadoReferidoLabel, mensajeCompartirCodigo, tipoMovimientoLabel, type EstadoMonedero } from "@/lib/referidos-textos";
import { enlaceCompartirWhatsapp } from "@/lib/whatsapp";

const fecha = (iso: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

export default function ReferidosPanel({ pacienteId, empresaId, esSuperadmin }: { pacienteId: string; empresaId: string; esSuperadmin: boolean }) {
  const [estado, setEstado] = useState<EstadoMonedero | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [codigoReferidor, setCodigoReferidor] = useState("");
  const [pending, start] = useTransition();
  const cargar = useCallback(() => { obtenerEstadoMonedero(pacienteId, empresaId).then(setEstado).catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar.")); }, [pacienteId, empresaId]);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <section className="clinical-content"><p className="notice" role="alert">{error}</p></section>;
  if (!estado) return <section className="clinical-content"><p className="field-hint">Cargando referidos…</p></section>;
  if (!estado.programa_activo) return <section className="clinical-content"><p className="notice">El programa de referidos no está activo en esta óptica.</p></section>;

  const mensaje = estado.codigo ? mensajeCompartirCodigo({ prefijo: estado.prefijo ?? "", descuento_bienvenida: Number(estado.descuento_bienvenida ?? 0) }, estado.codigo) : "";
  const copiar = async () => { try { await navigator.clipboard.writeText(estado.codigo ?? ""); setAviso("Código copiado."); } catch { setAviso("No se pudo copiar; selecciónalo y cópialo a mano."); } };
  const registrarReferidor = () => start(async () => {
    try { setError(""); const r = await registrarReferidoFicha(pacienteId, empresaId, codigoReferidor); setAviso(`Referido por ${r.referidor_nombre}.`); setCodigoReferidor(""); cargar(); }
    catch (err) { setAviso(err instanceof Error ? err.message : "No se pudo registrar."); }
  });
  const ajustar = (form: HTMLFormElement) => {
    const data = new FormData(form); data.set("programa_id", estado.programa_id ?? ""); data.set("paciente_id", pacienteId);
    start(async () => { try { await ajustarMonedero(data); setAviso("Ajuste registrado."); form.reset(); cargar(); } catch (err) { setAviso(err instanceof Error ? err.message : "No se pudo ajustar."); } });
  };

  return (
    <section className="clinical-content history-list">
      <p className="section-label">{(estado.nombre ?? "REFERIDOS").toUpperCase()}</p>
      {aviso && <p className="notice" role="status">{aviso}</p>}
      <article className="task-card"><div className="task-status" /><div className="task-main">
        <h2>Mi código: {estado.codigo ?? "—"}</h2>
        <div className="task-meta">
          <button type="button" className="outline-action" onClick={copiar} disabled={!estado.codigo}><Copy size={15} /> Copiar</button>
          {estado.codigo && <a className="outline-action" href={enlaceCompartirWhatsapp(mensaje)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Compartir mi código</a>}
        </div>
        <p className="field-hint">Quien lo use en su primera compra (mínimo {dinero(Number(estado.compra_minima ?? 0))}) recibe {dinero(Number(estado.descuento_bienvenida ?? 0))} de descuento. El crédito vence a los {estado.vigencia_dias} días.</p>
      </div></article>
      <div className="task-meta" style={{ gap: 16 }}>
        <span>Disponible <strong>{dinero(Number(estado.disponible ?? 0))}</strong></span>
        <span>Pendiente <strong>{dinero(Number(estado.pendiente ?? 0))}</strong></span>
        <span>Usado <strong>{dinero(Number(estado.usado ?? 0))}</strong></span>
        <span>Vencido <strong>{dinero(Number(estado.vencido ?? 0))}</strong></span>
        <span>Referidos exitosos <strong>{estado.exitosos ?? 0}</strong></span>
      </div>
      <p className="field-hint">El crédito baja el total de una venta (hasta el máximo permitido por compra); no es dinero en caja.</p>

      <h3>Quién lo refirió</h3>
      {estado.referido_por
        ? <p>{estado.referido_por.nombre} · {estado.referido_por.codigo} · {estadoReferidoLabel(estado.referido_por.estado)}</p>
        : <div className="new-patient-form"><label className="task-description">Registrar el código de quien lo refirió (solo si aún no ha comprado)
            <input value={codigoReferidor} onChange={(event) => setCodigoReferidor(event.target.value.toUpperCase())} placeholder="Ej.: SHU-000458" /></label>
            <button type="button" className="outline-action" disabled={pending || codigoReferidor.trim().length < 4} onClick={registrarReferidor}>Registrar</button></div>}

      <h3>Personas que ha referido ({estado.referidos?.length ?? 0})</h3>
      {(estado.referidos?.length ?? 0) === 0 ? <p className="field-hint">Todavía no ha referido a nadie.</p> : <div className="task-list">{estado.referidos?.map((r, i) => (
        <article className="task-card" key={i}><div className="task-status" /><div className="task-main"><h2>{r.nombre}</h2><div className="task-meta"><span>{estadoReferidoLabel(r.estado)}</span><span>{fecha(r.creado_en)}</span><span>Crédito {dinero(Number(r.credito))}</span></div></div></article>
      ))}</div>}

      <h3>Movimientos del monedero</h3>
      {(estado.movimientos?.length ?? 0) === 0 ? <p className="field-hint">Sin movimientos todavía.</p> : <div className="task-list">{estado.movimientos?.map((m, i) => (
        <article className="task-card" key={i}><div className="task-status" /><div className="task-main"><h2>{tipoMovimientoLabel(m.tipo)}: {Number(m.monto) > 0 ? "+" : "−"}{dinero(Math.abs(Number(m.monto)))}</h2>
          <div className="task-meta"><span>{fecha(m.creado_en)}</span>{m.vence_en && <span>Vence {fecha(m.vence_en)}</span>}{m.referido && <span>Por {m.referido}</span>}{m.motivo && <span>{m.motivo}</span>}</div></div></article>
      ))}</div>}

      {esSuperadmin && <form onSubmit={(event) => { event.preventDefault(); ajustar(event.currentTarget); }}>
        <h3>Ajuste manual (solo superadmin)</h3>
        <div className="new-patient-form">
          <label>Monto ($, negativo para descontar)<input name="monto" type="number" step="0.01" required /></label>
          <label className="task-description">Motivo (mínimo 5 caracteres)<input name="motivo" required minLength={5} /></label>
        </div>
        <button className="outline-action" type="submit" disabled={pending}>Registrar ajuste</button>
      </form>}
    </section>
  );
}
