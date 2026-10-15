// Tipos y funciones puras del panel de referidos (sin dependencias del servidor: se importan también desde pantallas de cliente).

export type IndicadoresPanel = {
  codigos: number; registrados: number; compraron: number; conversion: number | null;
  ventas_n: number; ventas_total: number; ticket: number | null; descuentos: number; pendientes: number;
  creditos_generados: number; creditos_usados: number; creditos_vencidos: number; bonos_n: number; bonos_monto: number;
  costo: number; resultado: number; costo_pct: number | null;
};
export type FilaRanking = { paciente_id: string; nombre: string; codigo: string | null; exitosos: number; ventas: number; credito_ganado: number; disponible: number };
export type PanelReferidos = {
  programa_activo: boolean; nombre: string | null; periodo: { desde: string; hasta: string }; sucursal: string | null;
  sucursales: { id: string; nombre: string }[]; indicadores: IndicadoresPanel; ranking: FilaRanking[]; ranking_total: number;
};
export type DetalleReferidor = {
  referidor: { paciente_id: string; nombre: string; codigo: string | null };
  resumen: { exitosos: number; en_espera: number; ventas: number; credito_ganado: number; credito_usado: number; credito_vencido: number; disponible: number };
  referidos: { nombre: string; estado: string; creado_en: string; aplicado_en: string | null; venta_total: number | null; folio: number | null; sucursal: string | null; descuento: number; credito: number }[];
  movimientos: { tipo: string; monto: number; vence_en: string | null; motivo: string | null; creado_en: string; referido: string | null }[];
};

export type Periodo = { desde: string; hasta: string };
export type AtajoPeriodo = "este_mes" | "mes_pasado" | "ultimos_30";

const MS_DIA = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const aTexto = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const aFecha = (texto: string) => new Date(`${texto}T00:00:00Z`);

// Fecha de hoy en Ecuador (UTC-5), no la de UTC.
export function hoyEcuador(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

export function atajoPeriodo(clave: AtajoPeriodo, ahora: Date = new Date()): Periodo {
  const hoy = aFecha(hoyEcuador(ahora));
  const primero = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 1));
  if (clave === "este_mes") return { desde: aTexto(primero(hoy.getUTCFullYear(), hoy.getUTCMonth())), hasta: aTexto(hoy) };
  if (clave === "mes_pasado") {
    const inicio = primero(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1);
    const fin = new Date(primero(hoy.getUTCFullYear(), hoy.getUTCMonth()).getTime() - MS_DIA);
    return { desde: aTexto(inicio), hasta: aTexto(fin) };
  }
  return { desde: aTexto(new Date(hoy.getTime() - 29 * MS_DIA)), hasta: aTexto(hoy) };
}

export const periodoPorDefecto = (ahora: Date = new Date()): Periodo => atajoPeriodo("este_mes", ahora);

// Acepta solo fechas reales AAAA-MM-DD, con desde <= hasta y un máximo de 366 días.
export function periodoValido(desde?: string | null, hasta?: string | null): Periodo | null {
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  if (!desde || !hasta || !formato.test(desde) || !formato.test(hasta)) return null;
  const a = aFecha(desde); const b = aFecha(hasta);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || aTexto(a) !== desde || aTexto(b) !== hasta) return null;
  const dias = (b.getTime() - a.getTime()) / MS_DIA;
  if (dias < 0 || dias > 365) return null;
  return { desde, hasta };
}

export const porcentaje = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(1).replace(".", ",")} %`;

export const dineroPanel = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `$${Number(n).toFixed(2)}`;

export type OrdenRanking = "exitosos" | "ventas" | "credito_ganado" | "disponible";

const numero = (valor: unknown): number => { const n = Number(valor); return Number.isFinite(n) ? n : 0; };

// Mayor primero por la columna elegida; en empate se mantiene el criterio del servidor (exitosos, luego ventas) y por último el nombre.
export function ordenarRanking(filas: FilaRanking[], orden: OrdenRanking): FilaRanking[] {
  return [...filas].sort((a, b) =>
    numero(b[orden]) - numero(a[orden]) ||
    numero(b.exitosos) - numero(a.exitosos) ||
    numero(b.ventas) - numero(a.ventas) ||
    a.nombre.localeCompare(b.nombre, "es"));
}

export const esUuid = (valor: unknown): valor is string =>
  typeof valor === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
