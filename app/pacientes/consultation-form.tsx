"use client";
import { Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { crearConsulta } from "./actions";
import type { ClinicalOptometrist } from "@/lib/clinical";

const astig = (k1: string, k2: string) => { const a = Number(k1); const b = Number(k2); return k1 !== "" && k2 !== "" && Number.isFinite(a) && Number.isFinite(b) ? `${Math.abs(a - b).toFixed(2)} D estimado` : ""; };
const hyloSystaneProductos = ["Hylo-Comod", "Hylo-Gel", "Hylo-Forte", "Hylo-Fresh", "Hylo Dual", "Hylo Care", "Systane Ultra", "Systane Balance", "Systane Complete", "Systane Gel", "Systane Hydration", "Systane Ultra PF"];
const vitaminasProductos = ["Luteína", "Zeaxantina", "Omega-3", "Vitamina C", "Vitamina E", "Zinc", "Multivitamínico ocular (AREDS2)"];
const signedRxPattern = /^[+-](?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
type RxDiagnosticValues = { od_esfera: string; od_cilindro: string; od_add: string; oi_esfera: string; oi_cilindro: string; oi_add: string };
const numberValue = (value: string) => Number(value.replace(",", "."));
const diagnosticoDesdeRx = (rx: RxDiagnosticValues) => (["od", "oi"] as const).flatMap((eye) => {
  const esferaText = rx[`${eye}_esfera`];
  const cilindroText = rx[`${eye}_cilindro`];
  const esfera = numberValue(esferaText);
  const cilindro = numberValue(cilindroText);
  const hallazgos: string[] = [];
  if (esferaText.trim() && Number.isFinite(esfera) && esfera < 0) hallazgos.push("Miopía (CIE-10 H52.1)");
  if (esferaText.trim() && Number.isFinite(esfera) && esfera > 0) hallazgos.push("Hipermetropía (CIE-10 H52.0)");
  if (cilindroText.trim() && Number.isFinite(cilindro) && Math.abs(cilindro) > 0.001) hallazgos.push("Astigmatismo (CIE-10 H52.2)");
  return hallazgos.length ? [`${eye.toUpperCase()}: ${hallazgos.join(" y ")}`] : [];
}).concat(((["od_add", "oi_add"] as const).some((key) => {
  const value = numberValue(rx[key]);
  return rx[key].trim() !== "" && Number.isFinite(value) && Math.abs(value) > 0.001;
}) ? ["Presbicia (CIE-10 H52.4)"] : [])).join(". ");

const biomicroscopyOptions = ["Blefaritis", "Conjuntivitis", "Ojo seco", "Pterigión", "Catarata", "Lesión corneal"];
const complementaryExamOptions = ["Tonometría", "Fondo de ojo", "Ishihara", "Rejilla de Amsler", "Campimetría", "OCT", "Otro"];

function MultiFindingSelector({ eye, name }: { eye: "OD" | "OI"; name: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const value = [...selected, other.trim()].filter(Boolean).join(", ");
  return <fieldset className="biom-eye-fieldset"><legend>{eye}</legend><input type="hidden" name={name} value={value} />
    <div className="biom-problem-grid">{biomicroscopyOptions.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, option] : current.filter((item) => item !== option))} /> {option}</label>)}</div>
    <label>Otro hallazgo<input value={other} onChange={(event) => setOther(event.target.value)} placeholder="Describe otro problema" /></label>
  </fieldset>;
}

type ComplementaryExam = { id: string; name: string; result: string };
function ComplementaryExams() {
  const [exams, setExams] = useState<ComplementaryExam[]>([]);
  const add = () => setExams((current) => [...current, { id: crypto.randomUUID(), name: "Tonometría", result: "" }]);
  const update = (id: string, field: "name" | "result", value: string) => setExams((current) => current.map((exam) => exam.id === id ? { ...exam, [field]: value } : exam));
  return <div className="complementary-exams"><input type="hidden" name="examenes_complementarios" value={JSON.stringify(exams.map(({ name, result }) => ({ name, result })).filter((exam) => exam.name.trim() || exam.result.trim()))} />
    {exams.map((exam) => <div className="complementary-exam-row" key={exam.id}><select value={exam.name} onChange={(event) => update(exam.id, "name", event.target.value)}>{complementaryExamOptions.map((option) => <option key={option}>{option}</option>)}</select><input value={exam.result} onChange={(event) => update(exam.id, "result", event.target.value)} placeholder="Resultado u observación" /><button type="button" className="icon-button" aria-label="Eliminar examen" onClick={() => setExams((current) => current.filter((item) => item.id !== exam.id))}><Trash2 size={15} /></button></div>)}
    <button className="outline-action add-exam-button" type="button" onClick={add}><Plus size={15} /> Añadir examen</button>
  </div>;
}

function EyeRxCard({ eye, prefix, showDnp, showAv = true, onRxChange }: { eye: "OD" | "OI"; prefix: string; showDnp?: boolean; showAv?: boolean; onRxChange?: (field: "esfera" | "cilindro" | "add", value: string) => void }) {
  return <div className="eye-card">
    <div className="eye-card-header">{eye}</div>
    <div className="eye-card-body">
      <label>Esf<input name={`${prefix}_esfera`} data-rx-sign="true" inputMode="decimal" placeholder="+0.00 / -0.00" onChange={(event) => onRxChange?.("esfera", event.target.value)} /></label>
      <label>Cil<input name={`${prefix}_cilindro`} data-rx-sign="true" inputMode="decimal" placeholder="+0.00 / -0.00" onChange={(event) => onRxChange?.("cilindro", event.target.value)} /></label>
      <label>Eje<input name={`${prefix}_eje`} /></label>
      {showAv && <label>Av lejos c/rx<input name={`${prefix}_av_lejos`} placeholder="20/20" /></label>}
      <label>Add<input name={`${prefix}_add`} data-rx-sign="true" inputMode="decimal" placeholder="+0.00 / -0.00" onChange={(event) => onRxChange?.("add", event.target.value)} /></label>
      {showAv && <label>Av cerca c/rx<input name={`${prefix}_av_cerca`} placeholder="0.5M" /></label>}
      {showDnp && <label>DNP<input name={`${prefix}_dnp`} placeholder="mm" /></label>}
    </div>
  </div>;
}

export default function ConsultationModal({ pacienteId, optometrists, defaultOptometristId, onClose, onSaved }: { pacienteId: string; optometrists: ClinicalOptometrist[]; defaultOptometristId?: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [pending, start] = useTransition();
  const [k, setK] = useState({ odK1: "", odK2: "", oiK1: "", oiK2: "" });
  const [receta, setReceta] = useState({ lagrimas: false, vitaminas: false, terapia: false });
  const [rxDiagnostico, setRxDiagnostico] = useState<RxDiagnosticValues>({ od_esfera: "", od_cilindro: "", od_add: "", oi_esfera: "", oi_cilindro: "", oi_add: "" });
  const [diagnostico, setDiagnostico] = useState("");
  const [diagnosticoManual, setDiagnosticoManual] = useState(false);
  const updateFinalRx = (eye: "od" | "oi", field: "esfera" | "cilindro" | "add", value: string) => {
    const next = { ...rxDiagnostico, [`${eye}_${field}`]: value };
    setRxDiagnostico(next);
    if (!diagnosticoManual) setDiagnostico(diagnosticoDesdeRx(next));
  };
  const submit = (form: HTMLFormElement) => {
    const invalid = Array.from(form.querySelectorAll<HTMLInputElement>("input[data-rx-sign='true']")).find((input) => input.value.trim() && !signedRxPattern.test(input.value.trim()));
    if (invalid) {
      window.alert("Cada valor de Esfera, Cilindro o Adición debe comenzar con + o -. Corrige el campo marcado antes de guardar.");
      invalid.focus();
      invalid.setCustomValidity("Es obligatorio escribir + o - al inicio.");
      invalid.reportValidity();
      window.setTimeout(() => invalid.setCustomValidity(""), 2500);
      return;
    }
    start(async () => {
    const data = new FormData(form); data.set("paciente_id", pacienteId);
    try { await crearConsulta(data); onSaved("Consulta registrada en la historia clínica."); onClose(); }
    catch (err) { onSaved(err instanceof Error ? err.message : "No se pudo guardar la consulta."); }
    });
  };
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="new-consultation-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVA CONSULTA</p><h2 id="new-consultation-title">Consulta optométrica</h2><form onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
    <div className="new-patient-form"><label className="task-description">Motivo de consulta<input name="motivo_consulta" placeholder="Ej.: Control anual, visión borrosa de lejos" /></label></div>

    <p className="section-label">ANTECEDENTES</p>
    <div className="new-patient-form">
      <label>Uso de dispositivos electrónicos<span className="radio-row"><label><input type="radio" name="ante_dispositivos" value="si" defaultChecked /> Sí</label><label><input type="radio" name="ante_dispositivos" value="no" /> No</label></span></label>
      <label>¿Cuántas horas al día?<input name="ante_horas_dispositivos" placeholder="Ej.: 6" /></label>
      <label>Hipersensibilidad<span className="radio-row"><label><input type="radio" name="ante_hipersensibilidad" value="si" /> Sí</label><label><input type="radio" name="ante_hipersensibilidad" value="no" defaultChecked /> No</label></span></label>
      <label>Último control<input name="ante_ultimo_control" placeholder="Ej.: Hace 1 año, sin control previo" /></label>
      <label className="task-description">Enfermedades o condiciones<textarea name="ante_enfermedades" placeholder="Antecedentes oculares o sistémicos relevantes" /></label>
    </div>

    <p className="section-label">AGUDEZA VISUAL SIN CORRECCIÓN</p>
    <div className="av-table">
      <span /><span className="av-head">OD</span><span className="av-head">OI</span>
      <span className="av-row-label">AV lejana sin RX</span><input name="av_sc_od" placeholder="20/20" /><input name="av_sc_oi" placeholder="20/20" />
      <span className="av-row-label">AV próxima sin RX</span><input name="av_scp_od" placeholder="0.5M" /><input name="av_scp_oi" placeholder="0.5M" />
    </div>

    <p className="section-label">CON CORRECCIÓN · RX ANTIGUA (LENSOMETRÍA)</p>
    <p className="field-hint">Mide la fórmula de los lentes que trae el paciente y su agudeza visual, lejos y cerca, con esa corrección.</p>
    <div className="eye-grid"><EyeRxCard eye="OD" prefix="lens_od" /><EyeRxCard eye="OI" prefix="lens_oi" /></div>

    <p className="section-label">QUERATOMETRÍA</p>
    <div className="quera-entry-grid">
      <div className="quera-entry-row"><strong>OD</strong><label>K1<input name="quera_od_k1" value={k.odK1} onChange={(event) => setK({ ...k, odK1: event.target.value })} /></label><label>K2<input name="quera_od_k2" value={k.odK2} onChange={(event) => setK({ ...k, odK2: event.target.value })} /></label><label>Eje<input name="quera_od_eje" /></label></div>
      <div className="quera-entry-row"><strong>OI</strong><label>K1<input name="quera_oi_k1" value={k.oiK1} onChange={(event) => setK({ ...k, oiK1: event.target.value })} /></label><label>K2<input name="quera_oi_k2" value={k.oiK2} onChange={(event) => setK({ ...k, oiK2: event.target.value })} /></label><label>Eje<input name="quera_oi_eje" /></label></div>
    </div>
    <p className="astig-value">Astigmatismo corneal estimado — OD: {astig(k.odK1, k.odK2) || "—"} · OI: {astig(k.oiK1, k.oiK2) || "—"}</p>

    <p className="section-label">AUTORREFRACTOR</p>
    <div className="eye-grid"><EyeRxCard eye="OD" prefix="auto_od" showAv={false} /><EyeRxCard eye="OI" prefix="auto_oi" showAv={false} /></div>

    <p className="section-label">VISIÓN BINOCULAR</p>
    <div className="new-patient-form"><label>Cover test<input name="bino_cover_test" /></label><label>Motilidad ocular<input name="bino_motilidad" /></label><label>Estereopsis<input name="bino_estereopsis" /></label></div>

    <p className="section-label">BIOMICROSCOPÍA</p>
    <p className="field-hint">Las imágenes de lámpara de hendidura se adjuntan después de guardar, desde la pestaña “Fotos y documentos” vinculándolas a esta consulta.</p>
    <div className="biom-grid"><MultiFindingSelector eye="OD" name="biom_od" /><MultiFindingSelector eye="OI" name="biom_oi" /></div>

    <p className="section-label">EXÁMENES COMPLEMENTARIOS</p>
    <p className="field-hint">Añade tantos exámenes como necesites y registra el resultado de cada uno.</p>
    <ComplementaryExams />

    <p className="section-label">RX FINAL</p>
    <p className="field-hint">Esfera, cilindro y adición deben llevar + o -. La RX sugiere miopía, hipermetropía, astigmatismo y presbicia con su CIE-10; el profesional puede corregir el texto.</p>
    <div className="eye-grid"><EyeRxCard eye="OD" prefix="ref_od" showDnp onRxChange={(field, value) => updateFinalRx("od", field, value)} /><EyeRxCard eye="OI" prefix="ref_oi" showDnp onRxChange={(field, value) => updateFinalRx("oi", field, value)} /></div>

    <p className="section-label">DIAGNÓSTICO</p>
    <div className="new-patient-form"><label className="task-description"><textarea name="impresion_diagnostica" value={diagnostico} onChange={(event) => { setDiagnostico(event.target.value); setDiagnosticoManual(true); }} placeholder="Se completa con la RX final y puedes editarlo" /></label></div>

    <p className="section-label">RECETA</p>
    <div className="receta-list">
      <div className="receta-option">
        <label className="receta-option-header"><input type="checkbox" name="receta_lagrimas" value="si" checked={receta.lagrimas} onChange={(event) => setReceta({ ...receta, lagrimas: event.target.checked })} /> Lágrimas artificiales</label>
        {receta.lagrimas && <div className="receta-option-body">
          <div className="product-list">{hyloSystaneProductos.map((producto) => <label key={producto}><input type="checkbox" name="lagrimas_producto" value={producto} /> {producto}</label>)}</div>
          <label>Otro producto<input name="lagrimas_otro" placeholder="Si no está en la lista" /></label>
          <label>Frecuencia de uso<input name="lagrimas_frecuencia" placeholder="Ej.: 1 gota cada 8 horas" /></label>
        </div>}
      </div>
      <div className="receta-option">
        <label className="receta-option-header"><input type="checkbox" name="receta_vitaminas" value="si" checked={receta.vitaminas} onChange={(event) => setReceta({ ...receta, vitaminas: event.target.checked })} /> Vitaminas</label>
        {receta.vitaminas && <div className="receta-option-body">
          <div className="product-list">{vitaminasProductos.map((producto) => <label key={producto}><input type="checkbox" name="vitaminas_producto" value={producto} /> {producto}</label>)}</div>
          <label>Otro producto<input name="vitaminas_otro" placeholder="Si no está en la lista" /></label>
          <label>Frecuencia de uso<input name="vitaminas_frecuencia" placeholder="Ej.: 1 tableta al día" /></label>
        </div>}
      </div>
      <div className="receta-option">
        <label className="receta-option-header"><input type="checkbox" name="receta_terapia_visual" value="si" checked={receta.terapia} onChange={(event) => setReceta({ ...receta, terapia: event.target.checked })} /> Terapia visual</label>
        {receta.terapia && <div className="receta-option-body"><label>Instrucciones<textarea name="terapia_instrucciones" placeholder="Ejercicios, frecuencia y duración de la terapia" /></label></div>}
      </div>
    </div>
    <div className="new-patient-form"><label className="task-description">Instrucciones adicionales<textarea name="plan_manejo" placeholder="Otras indicaciones para el paciente" /></label></div>
    <div className="new-patient-form" style={{ marginTop: 14 }}><label className="task-description">Observaciones<textarea name="observaciones" /></label></div>

    <p className="section-label">PROFESIONAL QUE ATENDIÓ</p>
    <div className="new-patient-form"><label className="task-description">Revisión realizada por<select name="optometrista_id" required defaultValue={optometrists.some((person) => person.id === defaultOptometristId) ? defaultOptometristId : (optometrists[0]?.id ?? "")}><option value="" disabled>Selecciona un optometrista</option>{optometrists.map((person) => <option key={person.id} value={person.id}>{person.nombre}</option>)}</select></label></div>
    {!optometrists.length && <p className="notice">No hay optometristas activos disponibles. Activa o registra uno desde Equipo antes de guardar la revisión.</p>}

    <p className="section-label">SIGUIENTE CONSULTA</p>
    <div className="new-patient-form"><label>Próximo control<select name="siguiente_control" defaultValue=""><option value="">Sin agendar</option><option value="3m">En 3 meses</option><option value="6m">En 6 meses</option><option value="1a">En 1 año</option></select></label></div>
    <p className="field-hint">Si eliges un plazo, se crea automáticamente una cita programada en la agenda.</p>

    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending || !optometrists.length} type="submit">{pending ? "Guardando…" : "Guardar consulta"}</button></div>
  </form></section></div>;
}
