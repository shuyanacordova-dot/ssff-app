export type LaboratorioProveedor = "provision" | "optec" | "indulentes" | "importlens" | "otro";
export type UsoCalculado = "lejos" | "cerca" | "lejos_y_cerca";
export type TipoLente = "monofocal_lejos" | "monofocal_cerca" | "bifocal" | "progresivo";
export type EstadoOrdenLaboratorio = "pendiente" | "enviado" | "en_proceso" | "recibido" | "control_calidad" | "listo_entrega" | "notificado" | "entregado" | "rechazado";

export type RxEye = { esfera: string; cilindro: string; eje: string; add: string; dnp: string };
export type OrdenLaboratorioRx = { od: RxEye; oi: RxEye };
export type OrdenLaboratorioMedidas = { vertical: string; horizontal_mayor: string; puente: string; altura: string; dnp: string };

export type OrdenLaboratorio = {
  id: string;
  venta_id: string;
  venta_item_id: string | null;
  estado: EstadoOrdenLaboratorio;
  laboratorio: LaboratorioProveedor;
};

export type RefraccionOption = { id: string; fecha_consulta: string; refraccion: Record<string, string> };

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

const necesita = (values: (string | undefined)[]) => values.some((v) => v && Number(v) !== 0);

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

export const emptyRxEye = (): RxEye => ({ esfera: "", cilindro: "", eje: "", add: "", dnp: "" });
export const emptyRx = (): OrdenLaboratorioRx => ({ od: emptyRxEye(), oi: emptyRxEye() });
export const emptyMedidas = (): OrdenLaboratorioMedidas => ({ vertical: "", horizontal_mayor: "", puente: "", altura: "", dnp: "" });

export function rxFromRefraccion(refraccion: Record<string, string>): OrdenLaboratorioRx {
  return {
    od: { esfera: refraccion.od_esfera || "", cilindro: refraccion.od_cilindro || "", eje: refraccion.od_eje || "", add: refraccion.od_add || "", dnp: refraccion.od_dnp || "" },
    oi: { esfera: refraccion.oi_esfera || "", cilindro: refraccion.oi_cilindro || "", eje: refraccion.oi_eje || "", add: refraccion.oi_add || "", dnp: refraccion.oi_dnp || "" },
  };
}
