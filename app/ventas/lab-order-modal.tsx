"use client";
import { Pencil, Printer, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import LunasStockAlert from "./lunas-stock-alert";
import type { Sale, SaleCompany, SaleItem, SaleProduct } from "@/lib/ventas";
import { calcularUso, emptyMedidas, emptyRx, estadoOrdenLabels, laboratorioLabels, rxFromRefraccion, tipoLenteLabels, tipoLenteSugerido, rxCerca, rxIntermedia, dnpCerca, transponer, normalizarRx, compensacionVertice, aplicarCompensacionVertice, editarRxLaboratorio, deshacerCompensacionVertice, diametroMinimoLuna, resumenDiametroMinimo, validarAlturaMontaje, avisoAnisometropia } from "@/lib/laboratorio";
import type { EstadoOrdenLaboratorio, LaboratorioProveedor, OrdenLaboratorioMedidas, OrdenLaboratorioRx, RefraccionOption, RxEye, TipoLente, UsoCalculado } from "@/lib/laboratorio";
import { actualizarOrdenLaboratorio, cambiarEstadoOrdenLaboratorio, crearOrdenLaboratorio, getOrdenLaboratorio, getRefraccionesPaciente } from "./lab-actions";
import LabOrderPrint from "../lab-order-print";
import RxNumberField from "../pacientes/rx-number-field";
import rxStyles from "../pacientes/rx-number-field.module.css";
import { parseRxNumber } from "@/lib/rx-number";
import { printDocumentById } from "@/lib/print-document";

const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const estadoOrder = Object.keys(estadoOrdenLabels) as EstadoOrdenLaboratorio[];
type UsoLente = UsoCalculado | "intermedio";
const distanciaUsoLabel: Record<UsoLente, string> = { lejos: "Lejos", cerca: "Cerca (lectura)", intermedio: "Intermedio/Ocupacional (computadora)", lejos_y_cerca: "Lejos y cerca (bifocal/progresivo)" };
const usoDb = (uso: UsoLente): UsoCalculado => uso === "intermedio" ? "cerca" : uso;
const calcularRx = (rx: OrdenLaboratorioRx, uso: UsoLente) => uso === "cerca" ? rxCerca(rx) : uso === "intermedio" ? rxIntermedia(rx) : { od: { ...rx.od }, oi: { ...rx.oi } };

function RxEyeCard({ eye, value, onChange, disabled, cerca = false }: { eye: "OD" | "OI"; value: RxEye; onChange: (v: RxEye) => void; disabled?: boolean; cerca?: boolean }) {
  const set = (k: keyof RxEye) => (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: event.target.value });
  const off = disabled || !value.procesar;
  return <div className={`eye-card ${rxStyles.card}`}>
    <div className="eye-card-header with-toggle"><span>{eye}</span><label className="eye-toggle"><input type="checkbox" checked={value.procesar} onChange={(event) => onChange({ ...value, procesar: event.target.checked })} disabled={disabled} /> Procesar</label></div>
    <div className={rxStyles.body}>
      <RxNumberField label="Esf" kind="esfera" value={value.esfera} onChange={(v) => onChange({ ...value, esfera: v })} disabled={off} />
      <RxNumberField label="Cil" kind="cilindro" value={value.cilindro} onChange={(v) => onChange({ ...value, cilindro: v })} disabled={off} onTranspose={(cilindro) => onChange({ ...value, ...transponer({ ...value, cilindro }) })} />
      <RxNumberField label="Eje" kind="eje" value={value.eje} onChange={(v) => onChange({ ...value, eje: v })} disabled={off} />
      <RxNumberField label="Add" kind="add" value={value.add} onChange={(v) => onChange({ ...value, add: v })} disabled={off} />
      <label>{cerca ? "DNP de cerca (sugerida)" : "DNP"}<input inputMode="decimal" value={value.dnp} onChange={set("dnp")} placeholder="mm" disabled={off} /></label>
    </div>
  </div>;
}

export default function LabOrderModal({ sale, lensItems, productoById, patientName, patientPhone, company, branchName, existingOrderId, esGarantia, ordenOriginalId, onClose, onCreated }: {
  sale: Sale; lensItems: SaleItem[]; productoById?: Map<string, SaleProduct>; patientName: string; patientPhone?: string | null; company?: SaleCompany;
  branchName?: string;
  existingOrderId?: string; esGarantia?: boolean; ordenOriginalId?: string | null;
  onClose: () => void; onCreated: (message: string) => void;
}) {
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"form" | "created">(existingOrderId ? "created" : "form");
  const [loadingExisting, setLoadingExisting] = useState(!!existingOrderId);
  const [orderId, setOrderId] = useState(existingOrderId ?? "");
  const [orderCreatedAt, setOrderCreatedAt] = useState(sale.creado_en);
  const [estado, setEstado] = useState<EstadoOrdenLaboratorio>("pendiente");
  const [itemId, setItemId] = useState(lensItems[0]?.id ?? "");
  const [laboratorio, setLaboratorio] = useState<LaboratorioProveedor>("provision");
  const [refracciones, setRefracciones] = useState<RefraccionOption[]>([]);
  const [loadingRx, setLoadingRx] = useState(true);
  const [consultaId, setConsultaId] = useState("");
  const [rx, setRx] = useState<OrdenLaboratorioRx>(emptyRx());
  const [examenManual, setExamenManual] = useState<OrdenLaboratorioRx | null>(existingOrderId ? null : emptyRx());
  const [uso, setUso] = useState<UsoLente>("lejos");
  const [usoElegido, setUsoElegido] = useState(false);
  const [dnpLejos, setDnpLejos] = useState("");
  const [medidas, setMedidas] = useState<OrdenLaboratorioMedidas>(emptyMedidas());
  const [tipoLente, setTipoLente] = useState<TipoLente>("monofocal_lejos");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");
  const [anterior, setAnterior] = useState<Parameters<typeof validarAlturaMontaje>[3]>();

  useEffect(() => {
    let active = true;
    getRefraccionesPaciente(sale.paciente_id ?? "").then((rows) => { if (active) setRefracciones(rows); }).catch(() => { if (active) setError("No se pudo cargar el historial; puedes ingresar la Rx manualmente."); }).finally(() => { if (active) setLoadingRx(false); });
    return () => { active = false; };
  }, [sale.paciente_id]);

  useEffect(() => {
    if (!existingOrderId) return;
    let active = true;
    getOrdenLaboratorio(existingOrderId).then((orden) => {
      if (!active || !orden) return;
      setEstado(orden.estado); setItemId(orden.venta_item_id ?? lensItems[0]?.id ?? ""); setLaboratorio(orden.laboratorio); setOrderCreatedAt(orden.creado_en);
      setAnterior(orden);
      setConsultaId(orden.consulta_id ?? ""); setRx(orden.rx); setMedidas({ ...emptyMedidas(), ...orden.medidas }); setTipoLente(orden.tipo_lente); setNotas((orden.notas ?? "").replace(/^Intermedio\s*[:·—-]?\s*/i, ""));
      setUso(/^Intermedio\b/i.test(orden.notas ?? "") ? "intermedio" : orden.uso_calculado);
      setUsoElegido(true);
      if (orden.rx.examen_lejos) { setExamenManual(orden.rx.examen_lejos); setDnpLejos(orden.rx.dnp_lejos ?? ""); }
      else if (!orden.consulta_id && orden.uso_calculado !== "cerca") { setExamenManual(orden.rx); setDnpLejos(orden.medidas.dnp); }
    }).catch(() => { if (active) setError("No se pudo cargar la orden."); }).finally(() => { if (active) setLoadingExisting(false); });
    return () => { active = false; };
  }, [existingOrderId, lensItems]);

  const selectedItem = lensItems.find((item) => item.id === itemId);
  const selectedRefraction = refracciones.find((option) => option.id === consultaId);
  const examen = examenManual ?? (selectedRefraction ? rxFromRefraccion(selectedRefraction.refraccion) : null);
  const dnpExamen = (source: OrdenLaboratorioRx, fallback = dnpLejos) => {
    const od = parseRxNumber(source.od.dnp); const oi = parseRxNumber(source.oi.dnp);
    return od !== null && oi !== null ? String(od + oi) : fallback;
  };
  const aplicarUso = (next: UsoLente, source: OrdenLaboratorioRx, resetDnp = false) => {
    setUso(next); setTipoLente((current) => next === "lejos_y_cerca" && current === "bifocal" ? current : tipoLenteSugerido(usoDb(next)));
    setRx(calcularRx(source, next));
    const total = dnpExamen(source, resetDnp ? "" : dnpLejos);
    setMedidas((m) => ({ ...m, dnp: next === "cerca" ? dnpCerca(total, true) : total }));
  };
  const updateExamen = (source: OrdenLaboratorioRx) => {
    setExamenManual(source);
    if (!examen) setConsultaId("");
    aplicarUso(usoElegido ? uso : calcularUso(source), source);
  };
  const selectConsulta = (id: string) => {
    setConsultaId(id);
    const found = refracciones.find((r) => r.id === id);
    const source = found ? rxFromRefraccion(found.refraccion) : emptyRx();
    setExamenManual(source); setDnpLejos("");
    aplicarUso(usoElegido ? uso : calcularUso(source), source, true);
  };
  const notasGuardadas = [uso === "intermedio" ? "Intermedio" : "", notas.trim()].filter(Boolean).join(": ");

  const frameItems = productoById ? sale.venta_items.filter((item) => item.producto_id && productoById.get(item.producto_id)?.categoria === "montura") : [];
  const lensSaleItems = productoById ? sale.venta_items.filter((item) => item.producto_id && productoById.get(item.producto_id)?.categoria === "lente") : lensItems;

  const verticeRefraccion = parseRxNumber(medidas.vertice_refraccion ?? "12");
  const verticeMontaje = parseRxNumber(medidas.vertice_montaje ?? "12");
  const cambiarVertice = (key: "vertice_refraccion" | "vertice_montaje", value: string) => {
    setRx(deshacerCompensacionVertice(rx));
    setMedidas({ ...medidas, [key]: value });
  };
  const diametroResumen = resumenDiametroMinimo(medidas, rx);
  const anisometropiaAviso = avisoAnisometropia(rx);

  const submit = () => {
    setError("");
    const alturaError = validarAlturaMontaje(tipoLente, medidas, rx, anterior);
    if (alturaError) { setError(alturaError); return; }
    if (!orderId && !itemId) { setError("Elige el producto de esta venta."); return; }
    start(async () => {
      const data = new FormData();
      data.set("laboratorio", laboratorio);
      data.set("uso_calculado", usoDb(uso));
      data.set("tipo_lente", tipoLente);
      const normalizedRx: OrdenLaboratorioRx = {
        ...normalizarRx(rx),
        ...(examen ? { examen_lejos: { od: { ...examen.od }, oi: { ...examen.oi } }, dnp_lejos: dnpExamen(examen) } : {}),
      };
      data.set("rx", JSON.stringify(normalizedRx));
      data.set("medidas", JSON.stringify(medidas));
      data.set("notas", notasGuardadas);
      try {
        if (orderId) { data.set("orden_id", orderId); await actualizarOrdenLaboratorio(data); onCreated("Orden de laboratorio actualizada."); }
        else {
          data.set("venta_id", sale.id); data.set("venta_item_id", itemId); data.set("consulta_id", consultaId);
          if (esGarantia) { data.set("es_garantia", "1"); if (ordenOriginalId) data.set("orden_original_id", ordenOriginalId); }
          const id = await crearOrdenLaboratorio(data); setOrderId(id); setOrderCreatedAt(new Date().toISOString()); onCreated("Orden de laboratorio creada.");
        }
        setRx(normalizedRx);
        setStep("created");
      } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la orden de laboratorio."); }
    });
  };

  const changeEstado = (value: EstadoOrdenLaboratorio) => start(async () => {
    setError("");
    try { await cambiarEstadoOrdenLaboratorio(orderId, value); setEstado(value); onCreated("Estado de la orden actualizado."); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo actualizar el estado."); }
  });

  const frameLensSummary = <>
    {(frameItems.length > 0 || lensSaleItems.length > 0) && <div className="consultation-stats" style={{ marginBottom: 12 }}>
      {frameItems.map((item) => <span key={item.id}><strong>Armazón</strong>{item.descripcion}</span>)}
      {lensSaleItems.map((item) => <span key={item.id}><strong>Luna</strong>{item.descripcion}</span>)}
    </div>}
  </>;
  const productDescription = [selectedItem?.descripcion, ...frameItems.map((item) => item.descripcion)].filter(Boolean).join(" + ");

  if (loadingExisting) return <div className="modal-backdrop"><section className="new-patient-modal task-modal lab-modal" role="dialog" aria-modal="true"><p className="field-hint">Cargando orden…</p></section></div>;

  return <div className="modal-backdrop"><section className="new-patient-modal task-modal lab-modal" role="dialog" aria-modal="true" aria-labelledby="lab-order-title"><button className="modal-close no-print" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <div id="lab-order-print" className={`print-area${step === "created" ? " print-a4" : ""}`}>
      {step === "form" && <><p className="section-label">{esGarantia ? "ORDEN DE LABORATORIO · GARANTÍA" : "ORDEN DE LABORATORIO"}</p><h2 id="lab-order-title">{patientName}</h2>{frameLensSummary}</>}

      {step === "form" ? <>
        {!orderId && <div className="new-patient-form">
          {lensItems.length > 1 && <label>Producto<select value={itemId} onChange={(event) => setItemId(event.target.value)}>{lensItems.map((item) => <option key={item.id} value={item.id}>{item.descripcion}</option>)}</select></label>}
          <label>Laboratorio<select value={laboratorio} onChange={(event) => setLaboratorio(event.target.value as LaboratorioProveedor)}>{Object.entries(laboratorioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>}
        {orderId && <div className="new-patient-form"><label>Laboratorio<select value={laboratorio} onChange={(event) => setLaboratorio(event.target.value as LaboratorioProveedor)}>{Object.entries(laboratorioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>}

        <p className="section-label" style={{ marginTop: 14 }}>ELEGIR REFRACCIÓN</p>
        {loadingRx ? <p className="field-hint">Cargando historial…</p> : refracciones.length ? <div className="new-patient-form"><label className="task-description">Refracción del historial (cualquier revisión)<select value={consultaId} onChange={(event) => selectConsulta(event.target.value)}><option value="">Ingresar manualmente</option>{refracciones.map((option) => <option key={option.id} value={option.id}>{formatDate(option.fecha_consulta)} · OD {option.refraccion.od_esfera || "—"} {option.refraccion.od_cilindro || ""} · OI {option.refraccion.oi_esfera || "—"} {option.refraccion.oi_cilindro || ""}</option>)}</select></label></div> : <p className="field-hint">No hay historial clínico disponible con tu perfil; ingresa la graduación manualmente.</p>}

        <div className="new-patient-form" style={{ marginTop: 10 }}>
          <label>Uso del lente<select value={uso} disabled={!examen} onChange={(event) => { setUsoElegido(true); if (examen) aplicarUso(event.target.value as UsoLente, examen); }}>{Object.entries(distanciaUsoLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Tipo de lente<select value={tipoLente} onChange={(event) => setTipoLente(event.target.value as TipoLente)}>{Object.entries(tipoLenteLabels).filter(([value]) => uso === "lejos_y_cerca" ? value === "bifocal" || value === "progresivo" : value === tipoLenteSugerido(usoDb(uso))).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <p className="section-label" style={{ marginTop: 14 }}>Rx de lejos (examen)</p>
        {examen ? <div className="consultation-stats">{(["od", "oi"] as const).map((eye) => <span key={eye}><strong>{eye.toUpperCase()}</strong> Esf {examen[eye].esfera || "—"} · Cil {examen[eye].cilindro || "—"} · Eje {examen[eye].eje || "—"} · Add {examen[eye].add || "—"} · DNP {examen[eye].dnp || "—"}</span>)}</div> : <p className="field-hint">No está disponible la Rx del examen. La Rx guardada del laboratorio se conserva; selecciona una revisión o ingresa el examen para recalcular.</p>}
        {(!consultaId || !examen) && <details open={!orderId && !consultaId ? true : undefined}><summary>Ingresar o corregir Rx de lejos manualmente</summary><p className="field-hint">Estos cambios recalculan la Rx del laboratorio y reemplazan sus ajustes manuales.</p><div className={rxStyles.cards}>
          <RxEyeCard eye="OD" value={examen?.od ?? emptyRx().od} onChange={(value) => updateExamen({ ...(examen ?? emptyRx()), od: value })} />
          <RxEyeCard eye="OI" value={examen?.oi ?? emptyRx().oi} onChange={(value) => updateExamen({ ...(examen ?? emptyRx()), oi: value })} />
        </div><label>DNP de lejos binocular (mm)<input inputMode="decimal" value={dnpLejos} onChange={(event) => { const value = event.target.value; setDnpLejos(value); setMedidas((m) => ({ ...m, dnp: uso === "cerca" ? dnpCerca(value, true) : value })); }} /></label></details>}
        {(uso === "cerca" || uso === "intermedio") && examen && (["od", "oi"] as const).some((eye) => rx[eye].procesar && !(parseRxNumber(examen[eye].add) ?? 0)) && <p className="notice" role="status">Falta la adición para calcular la visión de cerca</p>}
        <p className="section-label" style={{ marginTop: 14 }}>Rx calculada para el laboratorio</p>
        <p className="field-hint">Puedes ajustar la receta calculada. Cambiar el uso o el examen vuelve a calcularla.{uso === "intermedio" ? " Intermedio: se aplica la mitad de la adición, redondeada a 0,25 D." : ""}</p>
        <div className={rxStyles.cards} style={{ marginTop: 10 }} key={`${consultaId}-${uso}`}><RxEyeCard eye="OD" value={rx.od} cerca={uso === "cerca"} onChange={(value) => setRx(editarRxLaboratorio(rx, "od", value))} /><RxEyeCard eye="OI" value={rx.oi} cerca={uso === "cerca"} onChange={(value) => setRx(editarRxLaboratorio(rx, "oi", value))} /></div>
        <LunasStockAlert empresaId={sale.empresa_id} rx={rx} orderId={orderId || null} patientName={patientName} />

        {anisometropiaAviso && <div className="glass notice" role="status">{anisometropiaAviso}</div>}
        <section className="glass" style={{ padding: 14, marginTop: 14 }} aria-label="Distancia al vértice">
          <p className="section-label">Distancia al vértice</p>
          <div className="new-patient-form">
            <label>Distancia de refracción (mm)<input inputMode="decimal" value={medidas.vertice_refraccion ?? "12"} onChange={(event) => cambiarVertice("vertice_refraccion", event.target.value)} /></label>
            <label>Distancia de montaje de la montura (mm)<input inputMode="decimal" value={medidas.vertice_montaje ?? "12"} onChange={(event) => cambiarVertice("vertice_montaje", event.target.value)} /></label>
          </div>
          <p className="field-hint">Cambiar las distancias restaura la potencia anterior a la compensación. Potencias redondeadas a 0,25 D; montaje 0 mm = plano corneal.</p>
          {(["od", "oi"] as const).map((eye) => {
            const original = rx.compensacion_vertice?.[eye]?.original ?? rx[eye];
            const result = compensacionVertice(original, verticeRefraccion ?? NaN, verticeMontaje ?? NaN);
            const revisar = compensacionVertice(original, 12, 12)?.revisar;
            if (!rx[eye].procesar || !revisar) return null;
            return <div key={eye} className="notice" role="status">
              <strong>{eye.toUpperCase()} · Revisar distancia al vértice</strong>
              {!result && <p>Ingresa distancias válidas para calcular la compensación.</p>}
              {result && verticeRefraccion !== verticeMontaje && <>
                <p>Potencia compensada (Esf · Esf + Cil): {result.montaje.map((p) => p.toFixed(2)).join(" D · ")} D</p>
                <p className="field-hint">Plano corneal: {result.cornea.map((p) => p.toFixed(2)).join(" D · ")} D</p>
                <button type="button" className="outline-action" disabled={!!rx.compensacion_vertice?.[eye]} onClick={() => setRx(aplicarCompensacionVertice(rx, eye, verticeRefraccion!, verticeMontaje!))}>Usar compensada</button>
              </>}
              {rx.compensacion_vertice?.[eye] && <p>Potencia compensada por distancia al vértice</p>}
            </div>;
          })}
        </section>

        <p className="section-label" style={{ marginTop: 14 }}>PARÁMETROS DEL ARMAZÓN (MM)</p>
        <div className="new-patient-form">
          <label>Vertical<input value={medidas.vertical} onChange={(event) => setMedidas({ ...medidas, vertical: event.target.value })} /></label>
          <label>Horizontal mayor<input value={medidas.horizontal_mayor} onChange={(event) => setMedidas({ ...medidas, horizontal_mayor: event.target.value })} /></label>
          <label>Puente<input value={medidas.puente} onChange={(event) => setMedidas({ ...medidas, puente: event.target.value })} /></label>
          <label>Altura común<input value={medidas.altura} onChange={(event) => setMedidas({ ...medidas, altura: event.target.value })} /></label>
          <label>Altura OD<input inputMode="decimal" value={medidas.altura_od ?? ""} onChange={(event) => setMedidas({ ...medidas, altura_od: event.target.value })} placeholder="Usa altura común si está vacía" /></label>
          <label>Altura OI<input inputMode="decimal" value={medidas.altura_oi ?? ""} onChange={(event) => setMedidas({ ...medidas, altura_oi: event.target.value })} placeholder="Usa altura común si está vacía" /></label>
          <label>Diagonal efectiva (ED)<input inputMode="decimal" value={medidas.diagonal_efectiva ?? ""} onChange={(event) => setMedidas({ ...medidas, diagonal_efectiva: event.target.value })} placeholder="Diagonal mayor, opcional" /></label>
          <label>{uso === "cerca" ? "DNP de cerca (sugerida, binocular)" : "DNP binocular"}<input inputMode="decimal" value={medidas.dnp} onChange={(event) => setMedidas({ ...medidas, dnp: event.target.value })} /></label>
        </div>

        {(tipoLente === "progresivo" || tipoLente === "bifocal") && <p className="field-hint">Altura de montaje obligatoria: ingresa la altura común o una altura para cada ojo a procesar.</p>}
        {diametroResumen && <div className="glass" style={{ padding: 14, marginTop: 10 }} role="status">
          <p>{diametroResumen}</p>
          {(["od", "oi"] as const).map((eye) => {
            const result = diametroMinimoLuna(medidas, rx[eye]);
            return result && <p className="field-hint" key={eye}>{eye.toUpperCase()} · Diámetro estándar sugerido: {result.estandar === null ? "supera 80 mm; consultar laboratorio" : `${result.estandar} mm`}</p>;
          })}
        </div>}

        <div className="new-patient-form" style={{ marginTop: 10 }}><label className="task-description">Observaciones<textarea value={notas} onChange={(event) => setNotas(event.target.value)} placeholder="Indicaciones para el laboratorio" /></label></div>

        {error && <p className="notice">{error}</p>}
        <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={() => (orderId ? setStep("created") : onClose())}>Cancelar</button><button className="new-consultation" disabled={pending || (!orderId && !itemId)} type="button" onClick={submit}>{pending ? "Guardando…" : orderId ? "Guardar cambios" : "Crear orden de laboratorio"}</button></div>
      </> : <>
        <LabOrderPrint orderId={orderId} createdAt={orderCreatedAt} branchName={branchName || "Sucursal"} patientName={patientName} patientPhone={patientPhone} productDescription={productDescription} rx={rx} medidas={medidas} reviewerName={selectedRefraction?.optometrista_nombre} useLabel={distanciaUsoLabel[uso]} notes={[`Laboratorio: ${laboratorioLabels[laboratorio]}`, `Tipo de lente: ${tipoLenteLabels[tipoLente]}`, notasGuardadas].filter(Boolean).join(". ")} deliveryDate={sale.fecha_entrega_estimada} saleFolio={sale.folio} company={company} warranty={esGarantia} />

        {orderId && <div className="new-patient-form no-print" style={{ marginTop: 14, maxWidth: 280 }}><label>Estado de la orden<select value={estado} disabled={pending} onChange={(event) => changeEstado(event.target.value as EstadoOrdenLaboratorio)}>{estadoOrder.map((value) => <option key={value} value={value}>{estadoOrdenLabels[value]}</option>)}</select></label></div>}
        {error && <p className="notice no-print">{error}</p>}

        <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button><button className="outline-action" type="button" onClick={() => setStep("form")}><Pencil size={15} /> Editar</button><button className="new-consultation" type="button" onClick={() => printDocumentById("lab-order-print")}><Printer size={15} /> Imprimir</button></div>
      </>}
    </div>
  </section></div>;
}
