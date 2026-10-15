"use client";

import { useEffect, useRef, useState } from "react";
import { obtenerEstadoMonedero, previsualizarReferido } from "@/app/referidos/actions";
import { dinero, type PreviewReferido } from "@/lib/referidos-textos";

export type ReferidoValor = { codigo: string; usarCredito: number; descuento: number; credito: number };
export const referidoVacio: ReferidoValor = { codigo: "", usarCredito: 0, descuento: 0, credito: 0 };

export default function ReferidoVenta({ empresaId, pacienteId, base, esConvenio, hayOtrosDescuentos, onChange }: {
  empresaId: string; pacienteId: string; base: number; esConvenio: boolean; hayOtrosDescuentos: boolean; onChange: (valor: ReferidoValor) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [usar, setUsar] = useState(false);
  const [monto, setMonto] = useState("");
  const [preview, setPreview] = useState<PreviewReferido | null>(null);
  const pacientesConsultados = useRef(new Set<string>());

  useEffect(() => {
    setPreview(null);
    if (!empresaId || !pacienteId || base <= 0) return;
    let vigente = true;
    const espera = setTimeout(() => {
      previsualizarReferido({ empresaId, pacienteId, codigo, base, esConvenio, hayOtrosDescuentos })
        .then((resultado) => { if (vigente) setPreview(resultado); })
        .catch(() => { if (vigente) setPreview(null); });
    }, 350);
    return () => { vigente = false; clearTimeout(espera); };
  }, [empresaId, pacienteId, codigo, base, esConvenio, hayOtrosDescuentos]);

  useEffect(() => {
    if (!preview?.programa_activo || !empresaId || !pacienteId) return;
    const clave = `${empresaId}:${pacienteId}`;
    if (pacientesConsultados.current.has(clave)) return;
    pacientesConsultados.current.add(clave);
    let vigente = true;
    void obtenerEstadoMonedero(pacienteId, empresaId)
      .then((estado) => {
        if (vigente && estado.referido_por?.estado === "registrado") {
          setCodigo((actual) => actual.trim() ? actual : estado.referido_por?.codigo ?? "");
        }
      })
      .catch(() => undefined);
    return () => { vigente = false; };
  }, [preview?.programa_activo, empresaId, pacienteId]);

  const activo = !!preview?.programa_activo;
  const descuento = activo && preview?.codigo?.ok ? Number(preview.codigo.descuento ?? 0) : 0;
  const maximo = activo ? Number(preview?.credito_maximo ?? 0) : 0;
  const disponible = activo ? Number(preview?.credito_disponible ?? 0) : 0;
  const credito = activo && usar ? Math.min(Math.max(Number(monto.replace(",", ".")) || 0, 0), maximo) : 0;

  useEffect(() => {
    onChange(activo ? { codigo: preview?.codigo?.ok ? codigo.trim() : "", usarCredito: credito, descuento, credito } : referidoVacio);
  }, [activo, preview, codigo, credito, descuento, onChange]);

  if (!pacienteId || !activo) return null;
  const rechazo = preview.codigo && !preview.codigo.ok ? preview.codigo.motivo : "";
  return (
    <div className="receta-option" style={{ marginTop: 12 }}>
      <p className="section-label">{(preview.nombre ?? "REFERIDOS").toUpperCase()}</p>
      <label>¿Tiene un código de referido?
        <input value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase())} placeholder="Ej.: SHU-000458" autoComplete="off" />
      </label>
      {preview.codigo?.ok && <p className="notice" role="status" style={{ fontWeight: 700 }}>Código de {preview.codigo.referidor_nombre}: descuento de bienvenida −{dinero(descuento)}. Quien lo refirió gana {dinero(Number(preview.codigo.credito ?? 0))} cuando esta venta quede pagada por completo.</p>}
      {rechazo && <p className="notice" role="status" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{rechazo}</p>}
      {disponible > 0 && <div style={{ marginTop: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={usar} onChange={(event) => { setUsar(event.target.checked); setMonto(event.target.checked ? String(maximo) : ""); }} /> Usar crédito de referidos (disponible {dinero(disponible)}, máximo en esta compra {dinero(maximo)})</label>
        {usar && <label>Monto del crédito $<input type="text" inputMode="decimal" value={monto} onChange={(event) => setMonto(event.target.value)} /></label>}
      </div>}
    </div>
  );
}
