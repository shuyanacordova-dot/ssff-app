import { normalizeRxNumber, parseRxNumber } from "./rx-number";

export type LaboratorioProveedor = "provision" | "optec" | "indulentes" | "importlens" | "otro";
export type UsoCalculado = "lejos" | "cerca" | "lejos_y_cerca";
export type TipoLente = "monofocal_lejos" | "monofocal_cerca" | "bifocal" | "progresivo";
export type EstadoOrdenLaboratorio = "pendiente" | "enviado" | "recibido" | "notificado" | "entregado" | "rechazado";

export type RxEye = { esfera: string; cilindro: string; eje: string; add: string; dnp: string; procesar: boolean };
export type RxExamen = { od: RxEye; oi: RxEye };
// Optional snapshot inside the existing Rx JSON; older orders still load unchanged.
export type OrdenLaboratorioRx = RxExamen & { examen_lejos?: RxExamen; dnp_lejos?: string; compensacion_vertice?: Partial<Record<"od" | "oi", { original: RxEye; refraccion_mm: number; montaje_mm: number }>> };
export type OrdenLaboratorioMedidas = { vertical: string; horizontal_mayor: string; puente: string; altura: string; dnp: string; diagonal_efectiva?: string; altura_od?: string; altura_oi?: string; vertice_refraccion?: string; vertice_montaje?: string };

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
  return { ...rx, od: eye(rx.od), oi: eye(rx.oi) };
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


// Quarter-diopter ties round away from zero, symmetrically for plus/minus powers.
export function redondearPotencia(power: number): number {
  return Math.sign(power) * Math.round(Math.abs(power) * 4) / 4 || 0;
}

export function compensarPotencia(power: number, refraccionMm: number, montajeMm = 0): number | null {
  if (![power, refraccionMm, montajeMm].every(Number.isFinite) || refraccionMm < 0 || montajeMm < 0) return null;
  const denominator = 1 - (refraccionMm - montajeMm) / 1000 * power;
  return denominator <= 0 ? null : redondearPotencia(power / denominator);
}

function meridianos(eye: RxEye): [number, number] | null {
  const sphere = parseRxNumber(eye.esfera);
  const cylinder = eye.cilindro.trim() === "" ? 0 : parseRxNumber(eye.cilindro);
  return sphere === null || cylinder === null ? null : [sphere, sphere + cylinder];
}

export function compensacionVertice(eye: RxEye, refraccionMm: number, montajeMm: number) {
  const powers = meridianos(eye);
  if (!powers) return null;
  const revisar = powers.some((power) => Math.abs(power) >= 4);
  // Below the threshold keep each meridian unchanged.
  const cornea = powers.map((power) => Math.abs(power) >= 4 ? compensarPotencia(power, refraccionMm, 0) : power);
  const montaje = powers.map((power) => Math.abs(power) >= 4 ? compensarPotencia(power, refraccionMm, montajeMm) : power);
  if (cornea.some((p) => p === null) || montaje.some((p) => p === null)) return null;
  const [sphere, second] = montaje as number[];
  return { revisar, cornea: cornea as number[], montaje: montaje as number[],
    rx: { ...eye, esfera: normalizeRxNumber(String(sphere), "esfera"), cilindro: normalizeRxNumber(String(second - sphere), "esfera") } };
}

export function aplicarCompensacionVertice(rx: OrdenLaboratorioRx, eye: "od" | "oi", refraccionMm: number, montajeMm: number): OrdenLaboratorioRx {
  const original = rx.compensacion_vertice?.[eye]?.original ?? rx[eye];
  const result = compensacionVertice(original, refraccionMm, montajeMm);
  if (!rx[eye].procesar || !result?.revisar || refraccionMm === montajeMm) return rx;
  return { ...rx, [eye]: { ...rx[eye], esfera: result.rx.esfera, cilindro: result.rx.cilindro },
    compensacion_vertice: { ...rx.compensacion_vertice, [eye]: { original: { ...original }, refraccion_mm: refraccionMm, montaje_mm: montajeMm } } };
}

export function editarRxLaboratorio(rx: OrdenLaboratorioRx, eye: "od" | "oi", value: RxEye): OrdenLaboratorioRx {
  const changed = (["esfera", "cilindro", "eje"] as const).some((key) => rx[eye][key] !== value[key]);
  return { ...rx, [eye]: value, compensacion_vertice: changed ? { ...rx.compensacion_vertice, [eye]: undefined } : rx.compensacion_vertice };
}

export function deshacerCompensacionVertice(rx: OrdenLaboratorioRx): OrdenLaboratorioRx {
  const eye = (key: "od" | "oi") => {
    const original = rx.compensacion_vertice?.[key]?.original;
    return original ? { ...rx[key], esfera: original.esfera, cilindro: original.cilindro, eje: original.eje } : rx[key];
  };
  return { ...rx, od: eye("od"), oi: eye("oi"), compensacion_vertice: undefined };
}

const positivo = (value?: string) => {
  const n = parseRxNumber(value ?? "");
  return n !== null && n > 0 ? n : null;
};
export const diametrosEstandar = [55, 60, 65, 70, 75, 80] as const;
export function diametroMinimoLuna(medidas: Partial<OrdenLaboratorioMedidas>, eye: RxEye) {
  if (!eye.procesar) return null;
  const a = positivo(medidas.horizontal_mayor); const bridge = positivo(medidas.puente);
  const ed = positivo(medidas.diagonal_efectiva);
  const mono = positivo(eye.dnp); const binocular = positivo(medidas.dnp);
  if (a === null || bridge === null || (mono === null && binocular === null)) return null;
  const descentramiento = Math.abs((a + bridge) / 2 - (mono ?? binocular! / 2));
  const minimo = Math.round(((ed ?? a) + 2 * descentramiento + 2) * 100) / 100;
  return { minimo, descentramiento, aproximado: ed === null, estandar: diametrosEstandar.find((size) => size >= minimo) ?? null };
}
export function resumenDiametroMinimo(medidas: Partial<OrdenLaboratorioMedidas>, rx: RxExamen): string {
  const values = (["od", "oi"] as const).flatMap((eye) => {
    const result = diametroMinimoLuna(medidas, rx[eye]);
    return result ? [`${eye.toUpperCase()} ${result.minimo} mm${result.aproximado ? " (aprox.)" : ""}`] : [];
  });
  return values.length ? `Diámetro mínimo de la luna: ${values.join(" · ")}` : "";
}
export function alturaMontaje(medidas: Partial<OrdenLaboratorioMedidas>, eye: "od" | "oi"): string {
  return medidas[`altura_${eye}`]?.trim() || medidas.altura?.trim() || "";
}
export const errorAlturaMontaje = "Ingresa la altura de montaje para lentes progresivos/bifocales";
export function validarAlturaMontaje(tipo: TipoLente, medidas: Partial<OrdenLaboratorioMedidas>, rx: RxExamen,
  anterior?: { tipo_lente: TipoLente; medidas: Partial<OrdenLaboratorioMedidas>; rx: RxExamen }): string | null {
  if (tipo !== "progresivo" && tipo !== "bifocal") return null;
  const missing = (["od", "oi"] as const).some((eye) => rx[eye].procesar && positivo(alturaMontaje(medidas, eye)) === null);
  if (!missing) return null;
  // Existing incomplete orders remain editable unless fitting requirements change.
  const legacyUnchanged = anterior && anterior.tipo_lente === tipo &&
    (["altura", "altura_od", "altura_oi"] as const).every((key) => (medidas[key] ?? "") === (anterior.medidas[key] ?? "")) &&
    (["od", "oi"] as const).every((eye) => rx[eye].procesar === anterior.rx[eye].procesar);
  return legacyUnchanged ? null : errorAlturaMontaje;
}
export function equivalenteEsferico(eye: RxEye): number | null {
  const powers = meridianos(eye);
  return powers ? (powers[0] + powers[1]) / 2 : null;
}
export function anisometropia(rx: RxExamen): number | null {
  const od = equivalenteEsferico(rx.od); const oi = equivalenteEsferico(rx.oi);
  if (od === null || oi === null) return null;
  const difference = Math.abs(od - oi);
  return difference >= 2 ? difference : null;
}
export function avisoAnisometropia(rx: RxExamen): string {
  const difference = anisometropia(rx);
  return difference === null ? "" : `Anisometropía de ${difference.toFixed(2)} D: considerar aniseiconia, tipo de lente/índice y adaptación`;
}
