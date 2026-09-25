"use client";
import RxNumberField from "./rx-number-field";
import { transponer } from "@/lib/laboratorio";
import rxStyles from "./rx-number-field.module.css";
import { Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { crearConsulta, actualizarConsulta } from "./actions";
import type { ClinicalOptometrist, Consultation } from "@/lib/clinical";

const astig = (k1: string, k2: string) => { const a = Number(k1); const b = Number(k2); return k1 !== "" && k2 !== "" && Number.isFinite(a) && Number.isFinite(b) ? `${Math.abs(a - b).toFixed(2)} D estimado` : ""; };
const hyloSystaneProductos = ["Hylo-Comod", "Hylo-Gel", "Hylo-Forte", "Hylo-Fresh", "Hylo Dual", "Hylo Care", "Systane Ultra", "Systane Balance", "Systane Complete", "Systane Gel", "Systane Hydration", "Systane Ultra PF"];
const vitaminasProductos = ["Luteína", "Zeaxantina", "Omega-3", "Vitamina C", "Vitamina E", "Zinc", "Multivitamínico ocular (AREDS2)"];
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

function parseFindings(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const selected = parts.filter((part) => biomicroscopyOptions.includes(part));
  const other = parts.filter((part) => !biomicroscopyOptions.includes(part)).join(", ");
  return { selected, other };
}

function MultiFindingSelector({ eye, name, initialValue }: { eye: "OD" | "OI"; name: string; initialValue?: string }) {
  const initial = parseFindings(initialValue ?? "");
  const [selected, setSelected] = useState<string[]>(initial.selected);
  const [other, setOther] = useState(initial.other);
  const value = [...selected, other.trim()].filter(Boolean).join(", ");
  return <fieldset className="biom-eye-fieldset"><legend>{eye}</legend><input type="hidden" name={name} value={value} />
    <div className="biom-problem-grid">{biomicroscopyOptions.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, option] : current.filter((item) => item !== option))} /> {option}</label>)}</div>
    <label>Otro hallazgo<input value={other} onChange={(event) => setOther(event.target.value)} placeholder="Describe otro problema" /></label>
  </fieldset>;
}

type ComplementaryExam = { id: string; name: string; result: string };
function parseInitialExams(raw?: string): ComplementaryExam[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: { name?: string; result?: string }) => ({ id: crypto.randomUUID(), name: String(item?.name ?? complementaryExamOptions[0]), result: String(item?.result ?? "") }));
  } catch { return []; }
}
function ComplementaryExams({ initialValue }: { initialValue?: string }) {
  const [exams, setExams] = useState<ComplementaryExam[]>(() => parseInitialExams(initialValue));
  const add = () => setExams((current) => [...current, { id: crypto.randomUUID(), name: "Tonometría", result: "" }]);
  const update = (id: string, field: "name" | "result", value: string) => setExams((current) => current.map((exam) => exam.id === id ? { ...exam, [field]: value } : exam));
  return <div className="complementary-exams"><input type="hidden" name="examenes_complementarios" value={JSON.stringify(exams.map(({ name, result }) => ({ name, result })).filter((exam) => exam.name.trim() || exam.result.trim()))} />
    {exams.map((exam) => <div className="complementary-exam-row" key={exam.id}><select value={exam.name} onChange={(event) => update(exam.id, "name", event.target.value)}>{complementaryExamOptions.map((option) => <option key={option}>{option}</option>)}</select><input value={exam.result} onChange={(event) => update(exam.id, "result", event.target.value)} placeholder="Resultado u observación" /><button type="button" className="icon-button" aria-label="Eliminar examen" onClick={() => setExams((current) => current.filter((item) => item.id !== exam.id))}><Trash2 size={15} /></button></div>)}
    <button className="outline-action add-exam-button" type="button" onClick={add}><Plus size={15} /> Añadir examen</button>
  </div>;
}

function EyeRxCard({ eye, prefix, showDnp, showAv = true, defaults, onRxChange }: { eye: "OD" | "OI"; prefix: string; showDnp?: boolean; showAv?: boolean; defaults?: Record<string, string>; onRxChange?: (field: "esfera" | "cilindro" | "add", value: string) => void }) {
  const d = (key: string) => defaults?.[key] ?? "";
  const [rx, setRx] = useState({ esfera: d("esfera"), cilindro: d("cilindro"), eje: d("eje"), add: d("add") });
  const update = (field: keyof typeof rx, value: string) => {
    setRx((current) => ({ ...current, [field]: value }));
    if (field !== "eje") onRxChange?.(field, value);
  };
  return <div className={`eye-card ${rxStyles.card}`}>
    <div className="eye-card-header">{eye}</div>
    <div className={rxStyles.body}>
      <RxNumberField label="Esf" kind="esfera" name={`${prefix}_esfera`} value={rx.esfera} onChange={(v) => update("esfera", v)} />
      <RxNumberField label="Cil" kind="cilindro" name={`${prefix}_cilindro`} value={rx.cilindro} onChange={(v) => update("cilindro", v)} onTranspose={(cilindro) => {
        const next = { ...rx, ...transponer({ ...rx, cilindro }) }; setRx(next);
        onRxChange?.("esfera", next.esfera); onRxChange?.("cilindro", next.cilindro);
      }} />
      <RxNumberField label="Eje" kind="eje" name={`${prefix}_eje`} value={rx.eje} onChange={(v) => update("eje", v)} />
      {showAv && <label>Av lejos c/rx<input name={`${prefix}_av_lejos`} defaultValue={d("av_lejos")} placeholder="20/20" /></label>}
      <RxNumberField label="Add" kind="add" name={`${prefix}_add`} value={rx.add} onChange={(v) => update("add", v)} />
      {showAv && <label>Av cerca c/rx<input name={`${prefix}_av_cerca`} defaultValue={d("av_cerca")} placeholder="0.5M" /></label>}
      {showDnp && <label>DNP<input name={`${prefix}_dnp`} inputMode="decimal" defaultValue={d("dnp")} placeholder="mm" /></label>}
    </div>
  </div>;
}

export default function ConsultationModal({ pacienteId, optometrists, defaultOptometristId, initial, onClose, onSaved }: { pacienteId: string; optometrists: ClinicalOptometrist[]; defaultOptometristId?: string; initial?: Consultation; onClose: () => void; onSaved: (message: string) => void }) {
  const [pending, start] = useTransition();
  const [saveError, setSaveError] = useState("");
  const [k, setK] = useState({ odK1: initial?.queratometria?.od_k1 ?? "", odK2: initial?.queratometria?.od_k2 ?? "", oiK1: initial?.queratometria?.oi_k1 ?? "", oiK2: initial?.queratometria?.oi_k2 ?? "" });
  const [receta, setReceta] = useState({ lagrimas: initial?.receta?.lagrimas_artificiales ?? false, vitaminas: initial?.receta?.vitaminas ?? false, terapia: initial?.receta?.terapia_visual ?? false });
  const initialRxDiagnostico: RxDiagnosticValues = { od_esfera: initial?.refraccion?.od_esfera ?? "", od_cilindro: initial?.refraccion?.od_cilindro ?? "", od_add: initial?.refraccion?.od_add ?? "", oi_esfera: initial?.refraccion?.oi_esfera ?? "", oi_cilindro: initial?.refraccion?.oi_cilindro ?? "", oi_add: initial?.refraccion?.oi_add ?? "" };
  const [rxDiagnostico, setRxDiagnostico] = useState<RxDiagnosticValues>(initialRxDiagnostico);
  const [diagnostico, setDiagnostico] = useState(initial?.impresion_diagnostica ?? "");
  const [diagnosticoManual, setDiagnosticoManual] = useState(Boolean(initial));
  const updateFinalRx = (eye: "od" | "oi", field: "esfera" | "cilindro" | "add", value: string) => {
    setRxDiagnostico((current) => ({ ...current, [`${eye}_${field}`]: value }));
  };
  const submit = (form: HTMLFormElement) => {
    start(async () => {
      const data = new FormData(form); data.set("paciente_id", pacienteId);
      setSaveError("");
      try {
        if (initial) data.set("consulta_id", initial.id);
        const result = initial ? await actualizarConsulta(data) : await crearConsulta(data);
        if (!result.ok) { setSaveError(result.error); return; }
        onSaved(initial ? "Consulta actualizada en la historia clínica." : "Consulta registrada en la historia clínica.");
        onClose();
      } catch { setSaveError("No se pudo guardar la consulta. Revisa tu conexión e inténtalo de nuevo."); }
    });
  };
  const ante = initial?.antecedentes ?? {};
  const av = initial?.agudeza_visual ?? {};
  const bino = initial?.examen_binocular ?? {};
  const receta0 = initial?.receta;
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="new-consultation-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">{initial ? "EDITAR CONSULTA" : "NUEVA CONSULTA"}</p><h2 id="new-consultation-title">Consulta optométrica</h2><form onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
    <div className="new-patient-form"><label className="task-description">Motivo de consulta<input name="motivo_consulta" defaultValue={initial?.motivo_consulta ?? ""} placeholder="Ej.: Control anual, visión borrosa de lejos" /></label></div>

    <p className="section-label">ANTECEDENTES</p>
    <div className="new-patient-form">
      <label>Uso de dispositivos electrónicos<span className="radio-row"><label><input type="radio" name="ante_dispositivos" value="si" defaultChecked={ante.dispositivos_electronicos ? ante.dispositivos_electronicos === "si" : true} /> Sí</label><label><input type="radio" name="ante_dispositivos" value="no" defaultChecked={ante.dispositivos_electronicos === "no"} /> No</label></span></label>
      <label>¿Cuántas horas al día?<input name="ante_horas_dispositivos" defaultValue={ante.horas_dispositivos ?? ""} placeholder="Ej.: 6" /></label>
      <label>Hipersensibilidad<span className="radio-row"><label><input type="radio" name="ante_hipersensibilidad" value="si" defaultChecked={ante.hipersensibilidad === "si"} /> Sí</label><label><input type="radio" name="ante_hipersensibilidad" value="no" defaultChecked={ante.hipersensibilidad ? ante.hipersensibilidad === "no" : true} /> No</label></span></label>
      <label>Fotosensibilidad<span className="radio-row"><label><input type="radio" name="ante_fotosensibilidad" value="si" defaultChecked={ante.fotosensibilidad === "si"} /> Sí</label><label><input type="radio" name="ante_fotosensibilidad" value="no" defaultChecked={ante.fotosensibilidad ? ante.fotosensibilidad === "no" : true} /> No</label></span></label>
      <label>Último control<input name="ante_ultimo_control" defaultValue={ante.ultimo_control ?? ""} placeholder="Ej.: Hace 1 año, sin control previo" /></label>
      <label className="task-description">Enfermedades o condiciones<textarea name="ante_enfermedades" defaultValue={ante.enfermedades_condiciones ?? ""} placeholder="Antecedentes oculares o sistémicos relevantes" /></label>
    </div>

    <p className="section-label">AGUDEZA VISUAL SIN CORRECCIÓN</p>
    <div className="av-table">
      <span /><span className="av-head">OD</span><span className="av-head">OI</span>
      <span className="av-row-label">AV lejana sin RX</span><input name="av_sc_od" defaultValue={av.sc_od ?? ""} placeholder="20/20" /><input name="av_sc_oi" defaultValue={av.sc_oi ?? ""} placeholder="20/20" />
      <span className="av-row-label">AV próxima sin RX</span><input name="av_scp_od" defaultValue={av.scp_od ?? ""} placeholder="0.5M" /><input name="av_scp_oi" defaultValue={av.scp_oi ?? ""} placeholder="0.5M" />
    </div>

    <p className="section-label">CON CORRECCIÓN · RX ANTIGUA (LENSOMETRÍA)</p>
    <p className="field-hint">Mide la fórmula de los lentes que trae el paciente y su agudeza visual, lejos y cerca, con esa corrección.</p>
    <div className={rxStyles.cards}><EyeRxCard eye="OD" prefix="lens_od" defaults={initial?.lensometria ? { esfera: initial.lensometria.od_esfera, cilindro: initial.lensometria.od_cilindro, eje: initial.lensometria.od_eje, av_lejos: initial.lensometria.od_av_lejos, add: initial.lensometria.od_add, av_cerca: initial.lensometria.od_av_cerca } : undefined} /><EyeRxCard eye="OI" prefix="lens_oi" defaults={initial?.lensometria ? { esfera: initial.lensometria.oi_esfera, cilindro: initial.lensometria.oi_cilindro, eje: initial.lensometria.oi_eje, av_lejos: initial.lensometria.oi_av_lejos, add: initial.lensometria.oi_add, av_cerca: initial.lensometria.oi_av_cerca } : undefined} /></div>

    <p className="section-label">QUERATOMETRÍA</p>
    <div className="quera-entry-grid">
      <div className="quera-entry-row"><strong>OD</strong><label>K1<input name="quera_od_k1" value={k.odK1} onChange={(event) => setK({ ...k, odK1: event.target.value })} /></label><label>K2<input name="quera_od_k2" value={k.odK2} onChange={(event) => setK({ ...k, odK2: event.target.value })} /></label><label>Eje<input name="quera_od_eje" defaultValue={initial?.queratometria?.od_eje ?? ""} /></label></div>
      <div className="quera-entry-row"><strong>OI</strong><label>K1<input name="quera_oi_k1" value={k.oiK1} onChange={(event) => setK({ ...k, oiK1: event.target.value })} /></label><label>K2<input name="quera_oi_k2" value={k.oiK2} onChange={(event) => setK({ ...k, oiK2: event.target.value })} /></label><label>Eje<input name="quera_oi_eje" defaultValue={initial?.queratometria?.oi_eje ?? ""} /></label></div>
    </div>
    <p className="astig-value">Astigmatismo corneal estimado — OD: {astig(k.odK1, k.odK2) || "—"} · OI: {astig(k.oiK1, k.oiK2) || "—"}</p>

    <p className="section-label">AUTORREFRACTOR</p>
    <div className={rxStyles.cards}><EyeRxCard eye="OD" prefix="auto_od" showAv={false} defaults={initial?.autorefractor ? { esfera: initial.autorefractor.od_esfera, cilindro: initial.autorefractor.od_cilindro, eje: initial.autorefractor.od_eje, add: initial.autorefractor.od_add } : undefined} /><EyeRxCard eye="OI" prefix="auto_oi" showAv={false} defaults={initial?.autorefractor ? { esfera: initial.autorefractor.oi_esfera, cilindro: initial.autorefractor.oi_cilindro, eje: initial.autorefractor.oi_eje, add: initial.autorefractor.oi_add } : undefined} /></div>

    <p className="section-label">VISIÓN BINOCULAR</p>
    <div className="new-patient-form"><label>Cover test<input name="bino_cover_test" defaultValue={bino.cover_test ?? ""} /></label><label>Motilidad ocular<input name="bino_motilidad" defaultValue={bino.motilidad ?? ""} /></label><label>Estereopsis<input name="bino_estereopsis" defaultValue={bino.estereopsis ?? ""} /></label></div>

    <p className="section-label">BIOMICROSCOPÍA</p>
    <p className="field-hint">Las imágenes de lámpara de hendidura se adjuntan después de guardar, desde la pestaña “Fotos y documentos” vinculándolas a esta consulta.</p>
    <div className="biom-grid"><MultiFindingSelector eye="OD" name="biom_od" initialValue={initial?.biomicroscopia?.od} /><MultiFindingSelector eye="OI" name="biom_oi" initialValue={initial?.biomicroscopia?.oi} /></div>
    <div className="new-patient-form" style={{ marginTop: 10 }}><label className="task-description" style={{ gridColumn: "1 / -1" }}>Otros detalles<textarea name="biom_otros" defaultValue={initial?.biomicroscopia?.otros_detalles ?? ""} placeholder="Otros hallazgos de la biomicroscopía" /></label></div>

    <p className="section-label">EXÁMENES COMPLEMENTARIOS</p>
    <p className="field-hint">Añade tantos exámenes como necesites y registra el resultado de cada uno.</p>
    <ComplementaryExams initialValue={bino.complementarios} />

    <p className="section-label">RX FINAL</p>
    <p className="field-hint">Usa el botón de signo para la esfera y los botones −/+ para ajustar 0,25. El cilindro se registra negativo. La RX sugiere miopía, hipermetropía, astigmatismo y presbicia con su CIE-10; el profesional puede corregir el texto.</p>
    <div className={rxStyles.cards}><EyeRxCard eye="OD" prefix="ref_od" showDnp defaults={initial?.refraccion ? { esfera: initial.refraccion.od_esfera, cilindro: initial.refraccion.od_cilindro, eje: initial.refraccion.od_eje, av_lejos: initial.refraccion.od_av_lejos, add: initial.refraccion.od_add, av_cerca: initial.refraccion.od_av_cerca, dnp: initial.refraccion.od_dnp } : undefined} onRxChange={(field, value) => updateFinalRx("od", field, value)} /><EyeRxCard eye="OI" prefix="ref_oi" showDnp defaults={initial?.refraccion ? { esfera: initial.refraccion.oi_esfera, cilindro: initial.refraccion.oi_cilindro, eje: initial.refraccion.oi_eje, av_lejos: initial.refraccion.oi_av_lejos, add: initial.refraccion.oi_add, av_cerca: initial.refraccion.oi_av_cerca, dnp: initial.refraccion.oi_dnp } : undefined} onRxChange={(field, value) => updateFinalRx("oi", field, value)} /></div>

    <p className="section-label">DIAGNÓSTICO</p>
    <div className="new-patient-form"><label className="task-description"><textarea name="impresion_diagnostica" value={diagnosticoManual ? diagnostico : diagnosticoDesdeRx(rxDiagnostico)} onChange={(event) => { setDiagnostico(event.target.value); setDiagnosticoManual(true); }} placeholder="Se completa con la RX final y puedes editarlo" /></label></div>

    <p className="section-label">RECETA</p>
    <div className="receta-list">
      <div className="receta-option">
        <label className="receta-option-header"><input type="checkbox" name="receta_lagrimas" value="si" checked={receta.lagrimas} onChange={(event) => setReceta({ ...receta, lagrimas: event.target.checked })} /> Lágrimas artificiales</label>
        {receta.lagrimas && <div className="receta-option-body">
          <div className="product-list">{hyloSystaneProductos.map((producto) => <label key={producto}><input type="checkbox" name="lagrimas_producto" value={producto} defaultChecked={receta0?.lagrimas_productos?.includes(producto) ?? false} /> {producto}</label>)}</div>
          <label>Otro producto<input name="lagrimas_otro" defaultValue={receta0?.lagrimas_otro ?? ""} placeholder="Si no está en la lista" /></label>
          <label>Frecuencia de uso<input name="lagrimas_frecuencia" defaultValue={receta0?.lagrimas_frecuencia ?? ""} placeholder="Ej.: 1 gota cada 8 horas" /></label>
        </div>}
      </div>
      <div className="receta-option">
        <label className="receta-option-header"><input type="checkbox" name="receta_vitaminas" value="si" checked={receta.vitaminas} onChange={(event) => setReceta({ ...receta, vitaminas: event.target.checked })} /> Vitaminas</label>
        {receta.vitaminas && <div className="receta-option-body">
          <div className="product-list">{vitaminasProductos.map((producto) => <label key={producto}><input type="checkbox" name="vitaminas_producto" value={producto} defaultChecked={receta0?.vitaminas_productos?.includes(producto) ?? false} /> {producto}</label>)}</div>
          <label>Otro producto<input name="vitaminas_otro" defaultValue={receta0?.vitaminas_otro ?? ""} placeholder="Si no está en la lista" /></label>
          <label>Frecuencia de uso<input name="vitaminas_frecuencia" defaultValue={receta0?.vitaminas_frecuencia ?? ""} placeholder="Ej.: 1 tableta al día" /></label>
        </div>}
      </div>
      <div className="receta-option">
        <label className="receta-option-header"><input type="checkbox" name="receta_terapia_visual" value="si" checked={receta.terapia} onChange={(event) => setReceta({ ...receta, terapia: event.target.checked })} /> Terapia visual</label>
        {receta.terapia && <div className="receta-option-body"><label>Instrucciones<textarea name="terapia_instrucciones" defaultValue={receta0?.terapia_instrucciones ?? ""} placeholder="Ejercicios, frecuencia y duración de la terapia" /></label></div>}
      </div>
    </div>
    <div className="new-patient-form"><label className="task-description">Instrucciones adicionales<textarea name="plan_manejo" defaultValue={initial?.plan_manejo ?? ""} placeholder="Otras indicaciones para el paciente" /></label></div>
    <div className="new-patient-form" style={{ marginTop: 14 }}><label className="task-description">Observaciones<textarea name="observaciones" defaultValue={initial?.observaciones ?? ""} /></label></div>

    <p className="section-label">PROFESIONAL QUE ATENDIÓ</p>
    <div className="new-patient-form"><label className="task-description">Revisión realizada por<select name="optometrista_id" required defaultValue={optometrists.some((person) => person.id === (initial?.optometrista_id ?? defaultOptometristId)) ? (initial?.optometrista_id ?? defaultOptometristId) : (optometrists[0]?.id ?? "")}><option value="" disabled>Selecciona un optometrista</option>{optometrists.map((person) => <option key={person.id} value={person.id}>{person.nombre}</option>)}</select></label></div>
    {!optometrists.length && <p className="notice">No hay optometristas activos disponibles. Activa o registra uno desde Equipo antes de guardar la revisión.</p>}

    {!initial && <><p className="section-label">SIGUIENTE CONSULTA</p>
    <div className="new-patient-form"><label>Próximo control<select name="siguiente_control" defaultValue=""><option value="">Sin agendar</option><option value="3m">En 3 meses</option><option value="6m">En 6 meses</option><option value="1a">En 1 año</option></select></label></div>
    <p className="field-hint">Si eliges un plazo, se crea automáticamente una cita programada en la agenda.</p></>}

    {saveError && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{saveError}</p>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending || !optometrists.length} type="submit">{pending ? "Guardando…" : initial ? "Guardar cambios" : "Guardar consulta"}</button></div>
  </form></section></div>;
}
