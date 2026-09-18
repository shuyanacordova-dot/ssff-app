"use client";
import { X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { Sale, SaleItem } from "@/lib/ventas";
import { calcularUso, emptyMedidas, emptyRx, laboratorioLabels, rxFromRefraccion, tipoLenteLabels, tipoLenteSugerido, usoCalculadoLabels } from "@/lib/laboratorio";
import type { LaboratorioProveedor, OrdenLaboratorioMedidas, OrdenLaboratorioRx, RefraccionOption, RxEye, TipoLente } from "@/lib/laboratorio";
import { crearOrdenLaboratorio, getRefraccionesPaciente } from "./lab-actions";

const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));

function RxEyeCard({ eye, value, onChange, disabled }: { eye: "OD" | "OI"; value: RxEye; onChange: (v: RxEye) => void; disabled?: boolean }) {
  const set = (k: keyof RxEye) => (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: event.target.value });
  return <div className="eye-card">
    <div className="eye-card-header">{eye}</div>
    <div className="eye-card-body">
      <label>Esf<input value={value.esfera} onChange={set("esfera")} placeholder="0.00" disabled={disabled} /></label>
      <label>Cil<input value={value.cilindro} onChange={set("cilindro")} placeholder="0.00" disabled={disabled} /></label>
      <label>Eje<input value={value.eje} onChange={set("eje")} disabled={disabled} /></label>
      <label>Add<input value={value.add} onChange={set("add")} placeholder="0.00" disabled={disabled} /></label>
      <label>DNP<input value={value.dnp} onChange={set("dnp")} placeholder="mm" disabled={disabled} /></label>
    </div>
  </div>;
}

export default function LabOrderModal({ sale, lensItems, patientName, onClose, onCreated }: { sale: Sale; lensItems: SaleItem[]; patientName: string; onClose: () => void; onCreated: (message: string) => void }) {
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"form" | "created">("form");
  const [itemId, setItemId] = useState(lensItems[0]?.id ?? "");
  const [laboratorio, setLaboratorio] = useState<LaboratorioProveedor>("provision");
  const [refracciones, setRefracciones] = useState<RefraccionOption[]>([]);
  const [loadingRx, setLoadingRx] = useState(true);
  const [consultaId, setConsultaId] = useState("");
  const [rx, setRx] = useState<OrdenLaboratorioRx>(emptyRx());
  const [medidas, setMedidas] = useState<OrdenLaboratorioMedidas>(emptyMedidas());
  const [tipoLente, setTipoLente] = useState<TipoLente>("monofocal_lejos");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getRefraccionesPaciente(sale.paciente_id ?? "").then((rows) => { if (active) setRefracciones(rows); }).finally(() => { if (active) setLoadingRx(false); });
    return () => { active = false; };
  }, [sale.paciente_id]);

  const uso = useMemo(() => calcularUso(rx), [rx]);
  useEffect(() => { setTipoLente(tipoLenteSugerido(uso)); }, [uso]);

  const selectConsulta = (id: string) => {
    setConsultaId(id);
    const found = refracciones.find((r) => r.id === id);
    setRx(found ? rxFromRefraccion(found.refraccion) : emptyRx());
    const dnpTotal = found ? (Number(found.refraccion.od_dnp) || 0) + (Number(found.refraccion.oi_dnp) || 0) : 0;
    if (dnpTotal) setMedidas((m) => ({ ...m, dnp: String(dnpTotal) }));
  };

  const selectedItem = lensItems.find((item) => item.id === itemId);

  const submit = () => {
    setError("");
    if (!itemId) { setError("Elige el producto de esta venta."); return; }
    start(async () => {
      const data = new FormData();
      data.set("venta_id", sale.id);
      data.set("venta_item_id", itemId);
      data.set("consulta_id", consultaId);
      data.set("laboratorio", laboratorio);
      data.set("uso_calculado", uso);
      data.set("tipo_lente", tipoLente);
      data.set("rx", JSON.stringify(rx));
      data.set("medidas", JSON.stringify(medidas));
      data.set("notas", notas);
      try { await crearOrdenLaboratorio(data); setStep("created"); onCreated("Orden de laboratorio creada."); }
      catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear la orden de laboratorio."); }
    });
  };

  return <div className="modal-backdrop"><section className="new-patient-modal task-modal lab-modal" role="dialog" aria-modal="true" aria-labelledby="lab-order-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">ORDEN DE LABORATORIO</p>
    <h2 id="lab-order-title">{patientName}</h2>

    {step === "form" ? <>
      <div className="new-patient-form">
        {lensItems.length > 1 && <label>Producto<select value={itemId} onChange={(event) => setItemId(event.target.value)}>{lensItems.map((item) => <option key={item.id} value={item.id}>{item.descripcion}</option>)}</select></label>}
        <label>Laboratorio<select value={laboratorio} onChange={(event) => setLaboratorio(event.target.value as LaboratorioProveedor)}>{Object.entries(laboratorioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>

      <p className="section-label" style={{ marginTop: 14 }}>ELEGIR REFRACCIÓN</p>
      {loadingRx ? <p className="field-hint">Cargando historial…</p> : refracciones.length ? <div className="new-patient-form"><label className="task-description">Refracción del historial<select value={consultaId} onChange={(event) => selectConsulta(event.target.value)}><option value="">Ingresar manualmente</option>{refracciones.map((option) => <option key={option.id} value={option.id}>{formatDate(option.fecha_consulta)} · OD {option.refraccion.od_esfera || "—"} {option.refraccion.od_cilindro || ""} · OI {option.refraccion.oi_esfera || "—"} {option.refraccion.oi_cilindro || ""}</option>)}</select></label></div> : <p className="field-hint">No hay historial clínico disponible con tu perfil; ingresa la graduación manualmente.</p>}

      <div className="eye-grid" style={{ marginTop: 10 }}><RxEyeCard eye="OD" value={rx.od} onChange={(value) => setRx({ ...rx, od: value })} /><RxEyeCard eye="OI" value={rx.oi} onChange={(value) => setRx({ ...rx, oi: value })} /></div>

      <div className="new-patient-form" style={{ marginTop: 10 }}>
        <label>Uso calculado<input value={usoCalculadoLabels[uso]} disabled /></label>
        <label>Tipo de lente<select value={tipoLente} onChange={(event) => setTipoLente(event.target.value as TipoLente)}>{Object.entries(tipoLenteLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>

      <p className="section-label" style={{ marginTop: 14 }}>MEDIDAS PARA MONTAJE (MM)</p>
      <div className="new-patient-form">
        <label>Vertical<input value={medidas.vertical} onChange={(event) => setMedidas({ ...medidas, vertical: event.target.value })} /></label>
        <label>Horizontal mayor<input value={medidas.horizontal_mayor} onChange={(event) => setMedidas({ ...medidas, horizontal_mayor: event.target.value })} /></label>
        <label>Puente<input value={medidas.puente} onChange={(event) => setMedidas({ ...medidas, puente: event.target.value })} /></label>
        <label>Altura<input value={medidas.altura} onChange={(event) => setMedidas({ ...medidas, altura: event.target.value })} /></label>
        <label>DNP<input value={medidas.dnp} onChange={(event) => setMedidas({ ...medidas, dnp: event.target.value })} /></label>
      </div>

      <div className="new-patient-form" style={{ marginTop: 10 }}><label className="task-description">Notas<textarea value={notas} onChange={(event) => setNotas(event.target.value)} placeholder="Indicaciones para el laboratorio" /></label></div>

      {error && <p className="notice">{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending || !itemId} type="button" onClick={submit}>{pending ? "Guardando…" : "Crear orden de laboratorio"}</button></div>
    </> : <>
      <div className="consultation-stats">
        <span><strong>Producto</strong>{selectedItem?.descripcion}</span>
        <span><strong>Laboratorio</strong>{laboratorioLabels[laboratorio]}</span>
        <span><strong>Tipo de lente</strong>{tipoLenteLabels[tipoLente]}</span>
        <span><strong>Uso</strong>{usoCalculadoLabels[uso]}</span>
      </div>
      <div className="eye-grid" style={{ marginTop: 10 }}><RxEyeCard eye="OD" value={rx.od} onChange={() => {}} disabled /><RxEyeCard eye="OI" value={rx.oi} onChange={() => {}} disabled /></div>
      <div className="consultation-stats" style={{ marginTop: 10 }}>
        <span><strong>Vertical</strong>{medidas.vertical || "—"}</span>
        <span><strong>Horizontal mayor</strong>{medidas.horizontal_mayor || "—"}</span>
        <span><strong>Puente</strong>{medidas.puente || "—"}</span>
        <span><strong>Altura</strong>{medidas.altura || "—"}</span>
        <span><strong>DNP</strong>{medidas.dnp || "—"}</span>
      </div>
      <div className="modal-actions"><button className="new-consultation" type="button" onClick={onClose}>Cerrar</button></div>
    </>}
  </section></div>;
}
