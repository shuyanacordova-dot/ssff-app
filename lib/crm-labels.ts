export type CrmMotivo = "control" | "examen_sin_compra" | "lentes_listos" | "postventa" | "cumpleanos" | "inactivo";
export type CrmItem = {
  motivo: CrmMotivo; paciente_id: string; nombre: string; telefono: string | null; detalle: string;
  fecha_referencia: string | null; referencia_id: string | null; sucursal_id: string | null; ultimo_contacto: string | null;
};
export type CrmBranch = { id: string; nombre: string; empresa_id: string };
export type CrmData = {
  status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string;
  empresaId?: string; empresaNombre?: string; sucursalId?: string; branches: CrmBranch[]; items: CrmItem[];
};

export const motivoLabels: Record<CrmMotivo, string> = {
  control: "Controles",
  examen_sin_compra: "Examen sin compra",
  lentes_listos: "Lentes listos",
  postventa: "Postventa",
  cumpleanos: "Cumpleaños",
  inactivo: "Inactivos",
};
