"use client";
import { Pencil, Printer, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { Sale, SaleCompany, SaleItem, SaleProduct } from "@/lib/ventas";
import { calcularUso, emptyMedidas, emptyRx, estadoOrdenLabels, laboratorioLabels, rxFromRefraccion, tipoLenteDesdeDescripcion, tipoLenteLabels, tipoLenteSugerido, usoCalculadoLabels, usoDesdeTipoLente } from "@/lib/laboratorio";
import type { EstadoOrdenLaboratorio, LaboratorioProveedor, OrdenLaboratorioMedidas, OrdenLaboratorioRx, RefraccionOption, RxEye, TipoLente, UsoCalculado } from "@/lib/laboratorio";
import { actualizarOrdenLaboratorio, cambiarEstadoOrdenLaboratorio, crearOrdenLaboratorio, getOrdenLaboratorio, getRefraccionesPaciente } from "./lab-actions";
import LabOrderPrint from "../lab-order-print";
import { printCurrentDocument } from "@/lib/print-document";

const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const estadoOrder = Object.keys(estadoOrdenLabels) as EstadoOrdenLaboratorio[];
const distanciaUsoLabel: Record<UsoCalculado, string> = { lejos: "Lejos", cerca: "Cerca", lejos_y_cerca: "Todas" };

function RxEyeCard({ eye, value, onChange, disabled }: { eye: "OD" | "OI"; value: RxEye; onChange: (v: RxEye) => void; disabled?: boolean }) {
  const set = (k: keyof RxEye) => (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: event.target.value });
  const off = disabled || !value.procesar;
  return <div className="eye-card">
    <div className="eye-card-header with-toggle"><span>{eye}</span><label className="eye-toggle"><input type="checkbox" checked={value.procesar} onChange={(event) => onChange({ ...value, procesar: event.target.checked })} disabled={disabled} /> Procesar</label></div>
    <div className="eye-card-body">
      <label>Esf<input value={value.esfera} onChange={set("esfera")} placeholder="0.00" disabled={off} /></label>
      <label>Cil<input value={value.cilindro} onChange={set("cilindro")} placeholder="0.00" disabled={off} /></label>
      <label>Eje<input value={value.eje} onChange={set("eje")} disabled={off} /></label>
      <label>Add<input value={value.add} onChange={set("add")} placeholder="0.00" disabled={off} /></label>
      <label>DNP<input value={value.dnp} onChange={set("dnp")} placeholder="mm" disabled={off} /></label>
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
  const [medidas, setMedidas] = useState<OrdenLaboratorioMedidas>(emptyMedidas());
  const [tipoLente, setTipoLente] = useState<TipoLente>("monofocal_lejos");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getRefraccionesPaciente(sale.paciente_id ?? "").then((rows) => { if (active) setRefracciones(rows); }).finally(() => { if (active) setLoadingRx(false); });
    return () => { active = false; };
  }, [sale.paciente_id]);

  useEffect(() => {
    if (!existingOrderId) return;
    let active = true;
    getOrdenLaboratorio(existingOrderId).then((orden) => {
      if (!active || !orden) return;
      setEstado(orden.estado); setItemId(orden.venta_item_id ?? lensItems[0]?.id ?? ""); setLaboratorio(orden.laboratorio); setOrderCreatedAt(orden.creado_en);
      setConsultaId(orden.consulta_id ?? ""); setRx(orden.rx); setMedidas(orden.medidas); setTipoLente(orden.tipo_lente); setNotas(orden.notas ?? "");
    }).finally(() => { if (active) setLoadingExisting(false); });
    return () => { active = false; };
  }, [existingOrderId, lensItems]);

  const selectedItem = lensItems.find((item) => item.id === itemId);
  const tipoLenteDetectado = selectedItem ? tipoLenteDesdeDescripcion(selectedItem.descripcion) : null;
  const uso = useMemo(() => tipoLenteDetectado ? usoDesdeTipoLente(tipoLenteDetectado) : calcularUso(rx), [tipoLenteDetectado, rx]);
  useEffect(() => { if (!existingOrderId) setTipoLente(tipoLenteDetectado ?? tipoLenteSugerido(uso)); }, [tipoLenteDetectado, uso, existingOrderId]);

  const selectConsulta = (id: string) => {
    setConsultaId(id);
    const found = refracciones.find((r) => r.id === id);
    setRx(found ? rxFromRefraccion(found.refraccion) : emptyRx());
    const dnpTotal = found ? (Number(found.refraccion.od_dnp) || 0) + (Number(found.refraccion.oi_dnp) || 0) : 0;
    if (dnpTotal) setMedidas((m) => ({ ...m, dnp: String(dnpTotal) }));
  };

  const frameItems = productoById ? sale.venta_items.filter((item) => item.producto_id && productoById.get(item.producto_id)?.categoria === "montura") : [];
  const lensSaleItems = productoById ? sale.venta_items.filter((item) => item.producto_id && productoById.get(item.producto_id)?.categoria === "lente") : lensItems;

  const submit = () => {
    setError("");
    if (!orderId && !itemId) { setError("Elige el producto de esta venta."); return; }
    start(async () => {
      const data = new FormData();
      data.set("laboratorio", laboratorio);
      data.set("uso_calculado", uso);
      data.set("tipo_lente", tipoLente);
      data.set("rx", JSON.stringify(rx));
      data.set("medidas", JSON.stringify(medidas));
      data.set("notas", notas);
      try {
        if (orderId) { data.set("orden_id", orderId); await actualizarOrdenLaboratorio(data); onCreated("Orden de laboratorio actualizada."); }
        else {
          data.set("venta_id", sale.id); data.set("venta_item_id", itemId); data.set("consulta_id", consultaId);
          if (esGarantia) { data.set("es_garantia", "1"); if (ordenOriginalId) data.set("orden_original_id", ordenOriginalId); }
          const id = await crearOrdenLaboratorio(data); setOrderId(id); setOrderCreatedAt(new Date().toISOString()); onCreated("Orden de laboratorio creada.");
        }
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
  const selectedRefraction = refracciones.find((option) => option.id === consultaId);
  const productDescription = [selectedItem?.descripcion, ...frameItems.map((item) => item.descripcion)].filter(Boolean).join(" + ");

  if (loadingExisting) return <div className="modal-backdrop"><section className="new-patient-modal task-modal lab-modal" role="dialog" aria-modal="true"><p className="field-hint">Cargando orden…</p></section></div>;

  return <div className="modal-backdrop"><section className="new-patient-modal task-modal lab-modal" role="dialog" aria-modal="true" aria-labelledby="lab-order-title"><button className="modal-close no-print" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <div className={`print-area${step === "created" ? " print-a4" : ""}`}>
      {step === "form" && <><p className="section-label">{esGarantia ? "ORDEN DE LABORATORIO · GARANTÍA" : "ORDEN DE LABORATORIO"}</p><h2 id="lab-order-title">{patientName}</h2>{frameLensSummary}</>}

      {step === "form" ? <>
        {!orderId && <div className="new-patient-form">
          {lensItems.length > 1 && <label>Producto<select value={itemId} onChange={(event) => setItemId(event.target.value)}>{lensItems.map((item) => <option key={item.id} value={item.id}>{item.descripcion}</option>)}</select></label>}
          <label>Laboratorio<select value={laboratorio} onChange={(event) => setLaboratorio(event.target.value as LaboratorioProveedor)}>{Object.entries(laboratorioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>}
        {orderId && <div className="new-patient-form"><label>Laboratorio<select value={laboratorio} onChange={(event) => setLaboratorio(event.target.value as LaboratorioProveedor)}>{Object.entries(laboratorioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>}

        <p className="section-label" style={{ marginTop: 14 }}>ELEGIR REFRACCIÓN</p>
        {loadingRx ? <p className="field-hint">Cargando historial…</p> : refracciones.length ? <div className="new-patient-form"><label className="task-description">Refracción del historial (cualquier revisión)<select value={consultaId} onChange={(event) => selectConsulta(event.target.value)}><option value="">Ingresar manualmente</option>{refracciones.map((option) => <option key={option.id} value={option.id}>{formatDate(option.fecha_consulta)} · OD {option.refraccion.od_esfera || "—"} {option.refraccion.od_cilindro || ""} · OI {option.refraccion.oi_esfera || "—"} {option.refraccion.oi_cilindro || ""}</option>)}</select></label></div> : <p className="field-hint">No hay historial clínico disponible con tu perfil; ingresa la graduación manualmente.</p>}

        <div className="eye-grid" style={{ marginTop: 10 }}><RxEyeCard eye="OD" value={rx.od} onChange={(value) => setRx({ ...rx, od: value })} /><RxEyeCard eye="OI" value={rx.oi} onChange={(value) => setRx({ ...rx, oi: value })} /></div>

        <div className="new-patient-form" style={{ marginTop: 10 }}>
          <label>Uso calculado<input value={usoCalculadoLabels[uso]} disabled /></label>
          <label>Tipo de lente{tipoLenteDetectado ? <input value={`${tipoLenteLabels[tipoLente]} (según la venta)`} disabled /> : <select value={tipoLente} onChange={(event) => setTipoLente(event.target.value as TipoLente)}>{Object.entries(tipoLenteLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</label>
        </div>

        <p className="section-label" style={{ marginTop: 14 }}>PARÁMETROS DEL ARMAZÓN (MM)</p>
        <div className="new-patient-form">
          <label>Vertical<input value={medidas.vertical} onChange={(event) => setMedidas({ ...medidas, vertical: event.target.value })} /></label>
          <label>Horizontal mayor<input value={medidas.horizontal_mayor} onChange={(event) => setMedidas({ ...medidas, horizontal_mayor: event.target.value })} /></label>
          <label>Puente<input value={medidas.puente} onChange={(event) => setMedidas({ ...medidas, puente: event.target.value })} /></label>
          <label>Altura<input value={medidas.altura} onChange={(event) => setMedidas({ ...medidas, altura: event.target.value })} /></label>
          <label>DNP<input value={medidas.dnp} onChange={(event) => setMedidas({ ...medidas, dnp: event.target.value })} /></label>
        </div>

        <div className="new-patient-form" style={{ marginTop: 10 }}><label className="task-description">Observaciones<textarea value={notas} onChange={(event) => setNotas(event.target.value)} placeholder="Indicaciones para el laboratorio" /></label></div>

        {error && <p className="notice">{error}</p>}
        <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={() => (orderId ? setStep("created") : onClose())}>Cancelar</button><button className="new-consultation" disabled={pending || (!orderId && !itemId)} type="button" onClick={submit}>{pending ? "Guardando…" : orderId ? "Guardar cambios" : "Crear orden de laboratorio"}</button></div>
      </> : <>
        <LabOrderPrint orderId={orderId} createdAt={orderCreatedAt} branchName={branchName || "Sucursal"} patientName={patientName} patientPhone={patientPhone} productDescription={productDescription} rx={rx} medidas={medidas} reviewerName={selectedRefraction?.optometrista_nombre} useLabel={distanciaUsoLabel[uso]} notes={[`Laboratorio: ${laboratorioLabels[laboratorio]}`, `Tipo de lente: ${tipoLenteLabels[tipoLente]}`, notas].filter(Boolean).join(". ")} deliveryDate={sale.fecha_entrega_estimada} saleFolio={sale.folio} company={company} warranty={esGarantia} />

        {orderId && <div className="new-patient-form no-print" style={{ marginTop: 14, maxWidth: 280 }}><label>Estado de la orden<select value={estado} disabled={pending} onChange={(event) => changeEstado(event.target.value as EstadoOrdenLaboratorio)}>{estadoOrder.map((value) => <option key={value} value={value}>{estadoOrdenLabels[value]}</option>)}</select></label></div>}
        {error && <p className="notice no-print">{error}</p>}

        <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button><button className="outline-action" type="button" onClick={() => setStep("form")}><Pencil size={15} /> Editar</button><button className="new-consultation" type="button" onClick={printCurrentDocument}><Printer size={15} /> Imprimir</button></div>
      </>}
    </div>
  </section></div>;
}
