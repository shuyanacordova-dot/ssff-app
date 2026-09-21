"use client";
import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { crearConsulta } from "./actions";

const astig = (k1: string, k2: string) => { const a = Number(k1); const b = Number(k2); return k1 !== "" && k2 !== "" && Number.isFinite(a) && Number.isFinite(b) ? `${Math.abs(a - b).toFixed(2)} D estimado` : ""; };
const hyloSystaneProductos = ["Hylo-Comod", "Hylo-Gel", "Hylo-Forte", "Hylo-Fresh", "Hylo Dual", "Hylo Care", "Systane Ultra", "Systane Balance", "Systane Complete", "Systane Gel", "Systane Hydration", "Systane Ultra PF"];
const vitaminasProductos = ["Luteína", "Zeaxantina", "Omega-3", "Vitamina C", "Vitamina E", "Zinc", "Multivitamínico ocular (AREDS2)"];

function EyeRxCard({ eye, prefix, showDnp, showAv = true }: { eye: "OD" | "OI"; prefix: string; showDnp?: boolean; showAv?: boolean }) {
  return <div className="eye-card">
    <div className="eye-card-header">{eye}</div>
    <div className="eye-card-body">
      <label>Esf<input name={`${prefix}_esfera`} placeholder="0.00" /></label>
      <label>Cil<input name={`${prefix}_cilindro`} placeholder="0.00" /></label>
      <label>Eje<input name={`${prefix}_eje`} /></label>
      {showAv && <label>Av lejos c/rx<input name={`${prefix}_av_lejos`} placeholder="20/20" /></label>}
      <label>Add<input name={`${prefix}_add`} placeholder="0.00" /></label>
      {showAv && <label>Av cerca c/rx<input name={`${prefix}_av_cerca`} placeholder="0.5M" /></label>}
      {showDnp && <label>DNP<input name={`${prefix}_dnp`} placeholder="mm" /></label>}
    </div>
  </div>;
}

export default function ConsultationModal({ pacienteId, onClose, onSaved }: { pacienteId: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [pending, start] = useTransition();
  const [k, setK] = useState({ odK1: "", odK2: "", oiK1: "", oiK2: "" });
  const [receta, setReceta] = useState({ lagrimas: false, vitaminas: false, terapia: false });
  const submit = (form: HTMLFormElement) => start(async () => {
    const data = new FormData(form); data.set("paciente_id", pacienteId);
    try { await crearConsulta(data); onSaved("Consulta registrada en la historia clínica."); onClose(); }
    catch (err) { onSaved(err instanceof Error ? err.message : "No se pudo guardar la consulta."); }
  });
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
    <div className="new-patient-form"><label>Ojo derecho<input name="biom_od" placeholder="Párpados, conjuntiva, córnea, cámara anterior" /></label><label>Ojo izquierdo<input name="biom_oi" placeholder="Párpados, conjuntiva, córnea, cámara anterior" /></label></div>

    <p className="section-label">DIAGNÓSTICO</p>
    <div className="new-patient-form"><label className="task-description"><textarea name="impresion_diagnostica" /></label></div>

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
    <p className="field-hint" style={{ marginTop: 10 }}>Rx final</p>
    <div className="eye-grid"><EyeRxCard eye="OD" prefix="ref_od" showDnp /><EyeRxCard eye="OI" prefix="ref_oi" showDnp /></div>

    <div className="new-patient-form" style={{ marginTop: 14 }}><label className="task-description">Observaciones<textarea name="observaciones" /></label></div>

    <p className="section-label">SIGUIENTE CONSULTA</p>
    <div className="new-patient-form"><label>Próximo control<select name="siguiente_control" defaultValue=""><option value="">Sin agendar</option><option value="3m">En 3 meses</option><option value="6m">En 6 meses</option><option value="1a">En 1 año</option></select></label></div>
    <p className="field-hint">Si eliges un plazo, se crea automáticamente una cita programada en la agenda.</p>

    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar consulta"}</button></div>
  </form></section></div>;
}
