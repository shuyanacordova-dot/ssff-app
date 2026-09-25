import { normalizeRxNumber, parseRxNumber } from "./rx-number";

export type LaboratorioProveedor = "provision" | "optec" | "indulentes" | "importlens" | "otro";
export type UsoCalculado = "lejos" | "cerca" | "lejos_y_cerca";
export type TipoLente = "monofocal_lejos" | "monofocal_cerca" | "bifocal" | "progresivo";
export type EstadoOrdenLaboratorio = "pendiente" | "enviado" | "recibido" | "notificado" | "entregado" | "rechazado";

export type RxEye = { esfera: string; cilindro: string; eje: string; add: string; dnp: string; procesar: boolean };
export type RxExamen = { od: RxEye; oi: RxEye };
// Optional snapshot inside the existing Rx JSON; older orders still load unchanged.
export type OrdenLaboratorioRx = RxExamen & { examen_lejos?: RxExamen; dnp_lejos?: string };
export type OrdenLaboratorioMedidas = { vertical: string; horizontal_mayor: string; puente: string; altura: string; dnp: string };

export type OrdenLaboratorio = {
  id: string;
  venta_id: string;
  venta_item_id: string | null;
  consulta_id: string | null;
  estado: EstadoOrdenLaboratorio;
  laboratorio: LaboratorioProveedor;
  uso_calculado: UsoCalculado;
  tipo_lente: TipoLente;
  rx: OrdenLaboratorioRx;
  medidas: OrdenLaboratorioMedidas;
  notas: string | null;
  es_garantia: boolean;
  orden_original_id: string | null;
  creado_en: string;
};

export type RefraccionOption = { id: string; fecha_consulta: string; refraccion: Record<string, string>; optometrista_id?: string | null; optometrista_nombre?: string | null };

export const estadoOrdenLabels: Record<EstadoOrdenLaboratorio, string> = {
  pendiente: "Pendiente",
  enviado: "Enviado al laboratorio",
  recibido: "Recibido",
  notificado: "Paciente notificado",
  entregado: "Entregado",
  rechazado: "Rechazado",
};

// Convierte estados antiguos (de antes de simplificar el flujo) al paso equivalente más cercano.
const legacyEstadoMap: Record<string, EstadoOrdenLaboratorio> = { en_proceso: "enviado", control_calidad: "recibido", listo_entrega: "recibido" };
export function normalizarEstadoOrden(estado: string): EstadoOrdenLaboratorio {
  if (estado in estadoOrdenLabels) return estado as EstadoOrdenLaboratorio;
  return legacyEstadoMap[estado] ?? "pendiente";
}

export const laboratorioLabels: Record<LaboratorioProveedor, string> = {
  provision: "Provisión Laboratorio",
  optec: "OPTEC",
  indulentes: "Indulentes",
  importlens: "Importlens",
  otro: "Otro",
};

export const tipoLenteLabels: Record<TipoLente, string> = {
  monofocal_lejos: "Monofocal lejos",
  monofocal_cerca: "Monofocal cerca (lectura)",
  bifocal: "Bifocal",
  progresivo: "Progresivo",
};

export const usoCalculadoLabels: Record<UsoCalculado, string> = {
  lejos: "Solo lejos",
  cerca: "Solo cerca (lectura)",
  lejos_y_cerca: "Lejos y cerca",
};

const necesita = (values: (string | undefined)[]) => values.some((v) => v && (parseRxNumber(v) ?? 0) !== 0);

export function calcularUso(rx: OrdenLaboratorioRx): UsoCalculado {
  const necesitaLejos = necesita([rx.od.esfera, rx.od.cilindro, rx.oi.esfera, rx.oi.cilindro]);
  const necesitaCerca = necesita([rx.od.add, rx.oi.add]);
  if (necesitaLejos && necesitaCerca) return "lejos_y_cerca";
  if (necesitaCerca) return "cerca";
  return "lejos";
}

export function tipoLenteSugerido(uso: UsoCalculado): TipoLente {
  if (uso === "cerca") return "monofocal_cerca";
  if (uso === "lejos_y_cerca") return "progresivo";
  return "monofocal_lejos";
}

export function tipoLenteDesdeDescripcion(descripcion: string): TipoLente | null {
  const d = descripcion.toLowerCase();
  if (d.includes("progresivo")) return "progresivo";
  if (d.includes("bifocal")) return "bifocal";
  if (d.includes("monofocal")) return (d.includes("cerca") || d.includes("lectura")) ? "monofocal_cerca" : "monofocal_lejos";
  return null;
}

export function usoDesdeTipoLente(tipo: TipoLente): UsoCalculado {
  if (tipo === "monofocal_cerca") return "cerca";
  if (tipo === "bifocal" || tipo === "progresivo") return "lejos_y_cerca";
  return "lejos";
}

export const emptyRxEye = (): RxEye => ({ esfera: "", cilindro: "", eje: "", add: "", dnp: "", procesar: true });
export const emptyRx = (): OrdenLaboratorioRx => ({ od: emptyRxEye(), oi: emptyRxEye() });
export const emptyMedidas = (): OrdenLaboratorioMedidas => ({ vertical: "", horizontal_mayor: "", puente: "", altura: "", dnp: "" });

export function rxFromRefraccion(refraccion: Record<string, string>): OrdenLaboratorioRx {
  return {
    od: { esfera: refraccion.od_esfera || "", cilindro: refraccion.od_cilindro || "", eje: refraccion.od_eje || "", add: refraccion.od_add || "", dnp: refraccion.od_dnp || "", procesar: true },
    oi: { esfera: refraccion.oi_esfera || "", cilindro: refraccion.oi_cilindro || "", eje: refraccion.oi_eje || "", add: refraccion.oi_add || "", dnp: refraccion.oi_dnp || "", procesar: true },
  };
}

// These helpers never mutate the exam prescription.
export function transponer(eye: Pick<RxEye, "esfera" | "cilindro" | "eje">): Pick<RxEye, "esfera" | "cilindro" | "eje"> {
  const sphere = parseRxNumber(eye.esfera) ?? 0;
  const cylinder = parseRxNumber(eye.cilindro) ?? 0;
  const axis = parseRxNumber(eye.eje) ?? 0;
  const rotated = ((axis + 90 - 1) % 180 + 180) % 180 + 1;
  return { esfera: normalizeRxNumber(String(sphere + cylinder), "esfera"), cilindro: normalizeRxNumber(String(-cylinder), "esfera"), eje: String(rotated) };
}

export function normalizarRx(rx: OrdenLaboratorioRx): OrdenLaboratorioRx {
  const eye = (v: RxEye): RxEye => ({ ...v, esfera: normalizeRxNumber(v.esfera, "esfera"), cilindro: normalizeRxNumber(v.cilindro, "cilindro"), eje: normalizeRxNumber(v.eje, "eje"), add: normalizeRxNumber(v.add, "add"), dnp: v.dnp.replace(/,/g, ".") });
  return { od: eye(rx.od), oi: eye(rx.oi) };
}

export function dnpCerca(value: string, binocular = false): string {
  const n = parseRxNumber(value);
  return n === null ? "" : String(Math.max(0, n - (binocular ? 3 : 1.5)));
}

function rxConAdicion(rx: OrdenLaboratorioRx, factor: number): OrdenLaboratorioRx {
  const eye = (v: RxEye): RxEye => {
    const add = parseRxNumber(normalizeRxNumber(v.add, "add"));
    const sphere = parseRxNumber(v.esfera) ?? (v.esfera.trim() === "" ? 0 : null);
    return { ...v, esfera: add && sphere !== null ? normalizeRxNumber(String(factor === 1 ? sphere + add : Math.round((sphere + add * factor) * 4) / 4), "esfera") : v.esfera, add: "0.00", dnp: factor === 1 ? dnpCerca(v.dnp) : v.dnp };
  };
  return { od: eye(rx.od), oi: eye(rx.oi) };
}
export const rxCerca = (rx: OrdenLaboratorioRx) => rxConAdicion(rx, 1);
export const rxIntermedia = (rx: OrdenLaboratorioRx) => rxConAdicion(rx, .5);
