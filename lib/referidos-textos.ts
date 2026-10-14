// Tipos y textos puros de referidos (sin dependencias del servidor: se importan también desde pantallas de cliente).

export type ProgramaReferidos = {
  id: string; empresa_id: string; nombre: string; prefijo: string; activo: boolean; recompensas_suspendidas: boolean;
  compra_minima: number; descuento_bienvenida: number; credito_por_referido: number; bono_3_referidos: number; bono_5_referidos: number;
  vigencia_credito_dias: number; tope_uso_porcentaje: number; presupuesto_mensual: number | null;
  campana_desde: string | null; campana_hasta: string | null; categorias_excluidas: string[];
};

export type MovimientoMonedero = { tipo: string; monto: number; vence_en: string | null; motivo: string | null; creado_en: string; referido: string | null };
export type ReferidoDeUnPaciente = { nombre: string; estado: string; creado_en: string; credito: number };
export type EstadoMonedero = {
  programa_activo: boolean; programa_id?: string; nombre?: string; prefijo?: string; descuento_bienvenida?: number; compra_minima?: number; vigencia_dias?: number;
  codigo?: string | null; disponible?: number; pendiente?: number; vencido?: number; generado?: number; usado?: number; exitosos?: number;
  referido_por?: { nombre: string; codigo: string; estado: string } | null; referidos?: ReferidoDeUnPaciente[]; movimientos?: MovimientoMonedero[];
};
export type PreviewReferido = {
  programa_activo: boolean; nombre?: string;
  codigo?: { ok: boolean; motivo?: string; descuento?: number; credito?: number; referidor_nombre?: string } | null;
  credito_disponible?: number; credito_maximo?: number;
};

export const dinero = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

// Mensaje que la persona envía por WhatsApp (sin asteriscos: LumOS los limpia en los mensajes manuales).
export function mensajeCompartirCodigo(programa: { prefijo: string; descuento_bienvenida: number }, codigo: string): string {
  const descuento = dinero(Number(programa.descuento_bienvenida));
  if (programa.prefijo === "FOC") {
    return `FOCUS FRIENDS\nVer bien es mejor entre amigos.\n\nUsa mi código ${codigo} y recibe ${descuento} de descuento en tu primera compra de lentes.\n\nAplican condiciones.`;
  }
  return `CÍRCULO SHU\nCompartir una buena visión tiene recompensa.\n\nUsa mi código ${codigo} y recibe ${descuento} de descuento en tu primera compra de lentes.\n\nAplican condiciones.`;
}

const estados: Record<string, string> = {
  registrado: "Registrado, aún no compra", en_pago: "Esperando el pago completo", recompensado: "Recompensado", rechazado: "Rechazado", revertido: "Revertido",
};
export const estadoReferidoLabel = (estado: string): string => estados[estado] ?? estado;

const tipos: Record<string, string> = {
  credito: "Crédito por referido", bono_hito: "Bono por referidos", ajuste: "Ajuste", devolucion: "Crédito devuelto",
  uso: "Crédito usado", vencimiento: "Crédito vencido", reversa: "Reversa",
};
export const tipoMovimientoLabel = (tipo: string): string => tipos[tipo] ?? tipo;
