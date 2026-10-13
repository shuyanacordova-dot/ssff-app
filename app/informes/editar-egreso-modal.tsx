"use client";

import { AlertCircle, X } from "lucide-react";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { EgresoParaEditar } from "./actions";
import { editarGasto } from "@/app/caja/actions";

const clasificacionLabel: Record<string, string> = { salarios: "Salarios", pago_proveedor: "Pago a proveedor", gastos_mensuales: "Gastos mensuales", gastos_operacion: "Gastos de operación", ajuste: "Ajuste" };
const bancoLabel: Record<string, string> = { pichincha: "Banco Pichincha", guayaquil: "Banco Guayaquil", internacional: "Banco Internacional" };
const montoInput = (value: string) => value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

export default function EditarEgresoModal({ datos, onClose, onSaved }: { datos: EgresoParaEditar; onClose: () => void; onSaved: () => void }) {
  const { gasto, cuentas, cuadreGuardado } = datos;
  const [origen, setOrigen] = useState<"caja" | "banco">(gasto.origen);
  const [monto, setMonto] = useState(String(gasto.monto));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const guardar = (form: HTMLFormElement) => start(async () => {
    setError("");
    try {
      const data = new FormData(form);
      data.set("gasto_id", gasto.id);
      const result = await editarGasto(data);
      if (!result.ok) { setError(result.error); return; }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el egreso."); }
  });

  return createPortal(<div className="modal-backdrop" onClick={(event) => { event.stopPropagation(); onClose(); }}>
    <section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="editar-egreso-informe-title" onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
      <p className="section-label">EDITAR EGRESO</p><h2 id="editar-egreso-informe-title">{gasto.concepto}</h2>
      {cuadreGuardado && <p className="notice"><AlertCircle size={16} /> El cuadre de caja de ese día ya se guardó con el valor anterior; el cambio se verá desde el siguiente cuadre.</p>}
      <form onSubmit={(event) => { event.preventDefault(); guardar(event.currentTarget); }}><div className="new-patient-form">
        <label>Fecha<input name="fecha" type="date" defaultValue={gasto.fecha} required /></label>
        <label>Clasificación<select name="clasificacion" defaultValue={gasto.clasificacion}>{Object.entries(clasificacionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Concepto<input name="concepto" defaultValue={gasto.concepto} required /></label>
        <label>Monto<input name="monto" inputMode="decimal" value={monto} onChange={(event) => setMonto(montoInput(event.target.value))} required /></label>
        <label>Origen<span className="radio-row"><label><input type="radio" name="origen" value="caja" checked={origen === "caja"} onChange={() => setOrigen("caja")} /> Caja (efectivo)</label><label><input type="radio" name="origen" value="banco" checked={origen === "banco"} onChange={() => setOrigen("banco")} /> Banco</label></span></label>
        {origen === "banco" && <label>Cuenta bancaria<select name="cuenta_bancaria_id" defaultValue={gasto.cuenta_bancaria_id ?? ""} required><option value="" disabled>Selecciona la cuenta</option>{cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{bancoLabel[cuenta.banco] ?? cuenta.banco}</option>)}</select></label>}
        <label className="task-description">Observaciones<textarea name="observaciones" defaultValue={gasto.observaciones ?? ""} /></label>
        <label className="task-description">Motivo de la corrección (opcional)<input name="motivo" placeholder="Ej.: el monto era 90, no 100" /></label>
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</button></div>
      </form>
    </section>
  </div>, document.body);
}
