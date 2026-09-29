export type DatosClaveAcceso = {
  fecha: Date | string;
  tipoComprobante: "01" | "04" | "05" | "06" | "07";
  ruc: string;
  ambiente: 1 | 2;
  establecimiento: string;
  puntoEmision: string;
  secuencial: number;
  codigoNumerico: string;
  tipoEmision: 1;
};

/** Date representa un instante en Ecuador; las cadenas representan una fecha civil. */
export function fechaSri(fecha: Date | string): string {
  let civil: string;
  if (fecha instanceof Date) {
    if (!Number.isFinite(fecha.getTime())) throw new Error("Fecha inválida.");
    const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(fecha);
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
    civil = `${parte("year")}-${parte("month")}-${parte("day")}`;
  } else civil = fecha;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(civil);
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(civil);
  if (!iso && !local) throw new Error("Fecha inválida.");
  const [dia, mes, anio] = iso ? [iso[3], iso[2], iso[1]] : [local![1], local![2], local![3]];
  const check = new Date(`${anio}-${mes}-${dia}T12:00:00Z`);
  if (!Number.isFinite(check.getTime()) || check.getUTCFullYear() !== Number(anio) || check.getUTCMonth() + 1 !== Number(mes) || check.getUTCDate() !== Number(dia)) throw new Error("Fecha inválida.");
  return `${dia}/${mes}/${anio}`;
}

export function digitoVerificadorModulo11(cadena48: string): number {
  if (!/^\d{48}$/.test(cadena48)) throw new Error("La clave base debe contener 48 dígitos.");
  let suma = 0;
  for (let i = 47, peso = 2; i >= 0; i--, peso = peso === 7 ? 2 : peso + 1) suma += Number(cadena48[i]) * peso;
  const resultado = 11 - (suma % 11);
  return resultado === 11 ? 0 : resultado === 10 ? 1 : resultado;
}

export function generarClaveAcceso(datos: DatosClaveAcceso): string {
  if (!/^\d{13}$/.test(datos.ruc) || !/^\d{3}$/.test(datos.establecimiento) || !/^\d{3}$/.test(datos.puntoEmision) || !/^\d{8}$/.test(datos.codigoNumerico)) throw new Error("RUC, serie o código numérico inválido.");
  if (!["01", "04", "05", "06", "07"].includes(datos.tipoComprobante) || ![1, 2].includes(datos.ambiente) || datos.tipoEmision !== 1) throw new Error("Tipo de comprobante, ambiente o emisión inválido.");
  if (!Number.isInteger(datos.secuencial) || datos.secuencial < 1 || datos.secuencial > 999999999) throw new Error("Secuencial inválido.");
  const base = fechaSri(datos.fecha).replaceAll("/", "") + datos.tipoComprobante + datos.ruc + datos.ambiente + datos.establecimiento + datos.puntoEmision + String(datos.secuencial).padStart(9, "0") + datos.codigoNumerico + datos.tipoEmision;
  return base + digitoVerificadorModulo11(base);
}
