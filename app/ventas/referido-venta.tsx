"use client";

import { useEffect, useRef, useState } from "react";
import { obtenerEstadoMonedero, previsualizarReferido } from "@/app/referidos/actions";
import { dinero, type PreviewReferido } from "@/lib/referidos-textos";

export type ReferidoValor = { codigo: string; usarCredito: number; descuento: number; credito: number };
export const referidoVacio: ReferidoValor = { codigo: "", usarCredito: 0, descuento: 0, credito: 0 };

type VistaPrevia = { paraCodigo: string; resultado: PreviewReferido };

export default function ReferidoVenta({ empresaId, pacienteId, base, esConvenio, hayOtrosDescuentos, onChange }: {
  empresaId: string; pacienteId: string; base: number; esConvenio: boolean; hayOtrosDescuentos: boolean; onChange: (valor: ReferidoValor) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [usar, setUsar] = useState(false);
  const [monto, setMonto] = useState("");
  // Cada vista previa guarda el código para el que se calculó: si el código escrito ya cambió, su descuento no vale.
  const [preview, setPreview] = useState<VistaPrevia | null>(null);
  const pacientesConsultados = useRef(new Set<string>());
  const pacientesEnConsulta = useRef(new Set<string>());
  const claveActual = useRef(`${empresaId}:${pacienteId}`);

  useEffect(() => {
    claveActual.current = `${empresaId}:${pacienteId}`;
    return () => { claveActual.current = ""; };
  }, [empresaId, pacienteId]);

  useEffect(() => {
    if (!empresaId || !pacienteId || base <= 0) { setPreview(null); return; }
    let vigente = true;
    const paraCodigo = codigo.trim();
    const espera = setTimeout(() => {
      previsualizarReferido({ empresaId, pacienteId, codigo, base, esConvenio, hayOtrosDescuentos })
        .then((resultado) => { if (vigente) setPreview({ paraCodigo, resultado }); })
        .catch(() => { if (vigente) setPreview(null); });
    }, 350);
    return () => { vigente = false; clearTimeout(espera); };
  }, [empresaId, pacienteId, codigo, base, esConvenio, hayOtrosDescuentos]);

  const ultimo = preview?.resultado ?? null;
  // Solo vale el resultado calculado para el código que está escrito ahora.
  const actual = preview && preview.paraCodigo === codigo.trim() ? preview.resultado : null;
  const activo = !!ultimo?.programa_activo;

  useEffect(() => {
    if (!ultimo?.programa_activo || !empresaId || !pacienteId) return;
    const clave = `${empresaId}:${pacienteId}`;
    if (pacientesConsultados.current.has(clave) || pacientesEnConsulta.current.has(clave)) return;
    pacientesEnConsulta.current.add(clave);
    void obtenerEstadoMonedero(pacienteId, empresaId)
      .then((estado) => {
        pacientesConsultados.current.add(clave);
        if (claveActual.current !== clave) return; // respuesta de otro paciente/óptica o con la pantalla ya cerrada
        if (estado.referido_por?.estado === "registrado") {
          setCodigo((escrito) => escrito.trim() ? escrito : estado.referido_por?.codigo ?? "");
        }
      })
      .catch(() => undefined)
      .finally(() => { pacientesEnConsulta.current.delete(clave); });
  }, [ultimo?.programa_activo, empresaId, pacienteId]);

  const codigoValido = !!(activo && actual?.codigo?.ok);
  const descuento = codigoValido ? Number(actual?.codigo?.descuento ?? 0) : 0;
  const maximo = activo && actual ? Number(actual.credito_maximo ?? 0) : 0;
  const maximoMostrado = activo ? Number(ultimo?.credito_maximo ?? 0) : 0;
  const disponible = activo ? Number(ultimo?.credito_disponible ?? 0) : 0;
  const bloqueCredito = disponible > 0 && !esConvenio && !hayOtrosDescuentos;
  const credito = activo && usar && bloqueCredito ? Math.round(Math.min(Math.max(Number(monto.replace(",", ".")) || 0, 0), maximo) * 100) / 100 : 0;

  // Solo se baja el monto escrito cuando hay un máximo real; con máximo 0 (carrito vacío o error) se conserva lo escrito.
  useEffect(() => {
    if (!usar || !monto.trim() || maximo <= 0) return;
    const escrito = Number(monto.replace(",", "."));
    if (escrito > maximo) setMonto(String(Math.round(maximo * 100) / 100));
  }, [usar, monto, maximo]);

  // Si el bloque de crédito se oculta (convenio, otros descuentos, sin saldo), la casilla vuelve a quedar sin marcar.
  useEffect(() => {
    if (!bloqueCredito && usar) { setUsar(false); setMonto(""); }
  }, [bloqueCredito, usar]);

  useEffect(() => {
    onChange(activo ? { codigo: codigoValido ? codigo.trim() : "", usarCredito: credito, descuento, credito } : referidoVacio);
  }, [activo, codigoValido, codigo, credito, descuento, onChange]);

  if (!pacienteId || !ultimo || !activo) return null;
  const rechazo = actual?.codigo && !actual.codigo.ok ? actual.codigo.motivo : "";
  return (
    <div className="receta-option" style={{ marginTop: 12 }}>
      <p className="section-label">{(ultimo.nombre ?? "REFERIDOS").toUpperCase()}</p>
      <label>¿Tiene un código de referido?
        <input value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase())} placeholder="Código de referido" autoComplete="off" />
      </label>
      {actual?.codigo?.ok && <p className="notice" role="status" style={{ fontWeight: 700 }}>Código de {actual.codigo.referidor_nombre}: descuento de bienvenida −{dinero(descuento)}. Quien lo refirió gana {dinero(Number(actual.codigo.credito ?? 0))} cuando esta venta quede pagada por completo.</p>}
      {rechazo && <p className="notice" role="status" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{rechazo}</p>}
      {bloqueCredito && <div style={{ marginTop: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={usar} onChange={(event) => { setUsar(event.target.checked); setMonto(event.target.checked ? String(maximoMostrado) : ""); }} /> Usar crédito de referidos (disponible {dinero(disponible)}, máximo en esta compra {dinero(maximoMostrado)})</label>
        {usar && <label>Monto del crédito $<input type="text" inputMode="decimal" value={monto} onChange={(event) => setMonto(event.target.value)} /></label>}
      </div>}
    </div>
  );
}
