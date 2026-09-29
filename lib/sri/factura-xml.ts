import { fechaSri, digitoVerificadorModulo11 } from "./clave-acceso";

export type ImpuestoFactura = { codigoPorcentaje: "0" | "4"; baseImponible: number; valor: number };
export type DatosFactura = {
  ambiente: 1 | 2; tipoEmision: 1; razonSocial: string; nombreComercial?: string | null;
  ruc: string; claveAcceso: string; establecimiento: string; puntoEmision: string; secuencial: number;
  dirMatriz: string; regimen: "general" | "rimpe_emprendedor" | "rimpe_negocio_popular";
  fechaEmision: Date | string; dirEstablecimiento: string; obligadoContabilidad: boolean;
  tipoIdentificacionComprador: "04" | "05" | "06" | "07";
  razonSocialComprador: string; identificacionComprador: string;
  totalSinImpuestos: number; totalDescuento: number; totalConImpuestos: ImpuestoFactura[];
  importeTotal: number;
  pagos: { formaPago: "01" | "19" | "20"; total: number }[];
  detalles: { codigoPrincipal: string; descripcion: string; cantidad: number; precioUnitario: number; descuento: number; precioTotalSinImpuesto: number; impuestos: ImpuestoFactura[] }[];
  email?: string | null; telefono?: string | null;
};

function escapar(valor: string): string {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(valor)) throw new Error("Texto con caracteres no válidos en XML.");
  return valor.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
const tag = (nombre: string, valor: string | number) => `<${nombre}>${escapar(String(valor))}</${nombre}>`;
function numero(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0 || valor >= 1e21) throw new Error("Importe o cantidad inválido.");
  return valor.toFixed(2);
}
function impuesto(imp: ImpuestoFactura, detalle: boolean): string {
  if (!["0", "4"].includes(imp.codigoPorcentaje)) throw new Error("IVA no soportado.");
  return tag("codigo", 2) + tag("codigoPorcentaje", imp.codigoPorcentaje) + (detalle ? tag("tarifa", imp.codigoPorcentaje === "4" ? "15.00" : "0.00") : "") + tag("baseImponible", numero(imp.baseImponible)) + tag("valor", numero(imp.valor));
}

/** Construye XML sin firma ni llamadas de red. Los totales e impuestos los proporciona el llamador. */
export function construirFacturaXml(d: DatosFactura): string {
  if (!/^\d{49}$/.test(d.claveAcceso) || digitoVerificadorModulo11(d.claveAcceso.slice(0, 48)) !== Number(d.claveAcceso[48])) throw new Error("Clave de acceso inválida.");
  if (!/^\d{13}$/.test(d.ruc) || !/^\d{3}$/.test(d.establecimiento) || !/^\d{3}$/.test(d.puntoEmision) || !Number.isInteger(d.secuencial) || d.secuencial < 1 || d.secuencial > 999999999) throw new Error("Datos tributarios inválidos.");
  if (![1, 2].includes(d.ambiente) || d.tipoEmision !== 1 || !["04", "05", "06", "07"].includes(d.tipoIdentificacionComprador)) throw new Error("Datos de emisión inválidos.");
  if (!d.detalles.length || !d.pagos.length || !d.totalConImpuestos.length) throw new Error("Faltan detalles, pagos o impuestos.");
  const secuencial = String(d.secuencial).padStart(9, "0");
  const fecha = fechaSri(d.fechaEmision);
  const prefijo = fecha.replaceAll("/", "") + "01" + d.ruc + d.ambiente + d.establecimiento + d.puntoEmision + secuencial;
  if (!d.claveAcceso.startsWith(prefijo) || d.claveAcceso[47] !== "1") throw new Error("La clave no coincide con la factura.");
  const leyenda = d.regimen === "rimpe_negocio_popular" ? "CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE" : d.regimen === "rimpe_emprendedor" ? "CONTRIBUYENTE RÉGIMEN RIMPE" : "";
  const tributaria = tag("ambiente", d.ambiente) + tag("tipoEmision", d.tipoEmision) + tag("razonSocial", d.razonSocial) + (d.nombreComercial ? tag("nombreComercial", d.nombreComercial) : "") + tag("ruc", d.ruc) + tag("claveAcceso", d.claveAcceso) + tag("codDoc", "01") + tag("estab", d.establecimiento) + tag("ptoEmi", d.puntoEmision) + tag("secuencial", secuencial) + tag("dirMatriz", d.dirMatriz) + (leyenda ? tag("contribuyenteRimpe", leyenda) : "");
  const pagos = d.pagos.map((p) => {
    if (!["01", "19", "20"].includes(p.formaPago)) throw new Error("Forma de pago no soportada.");
    return `<pago>${tag("formaPago", p.formaPago)}${tag("total", numero(p.total))}</pago>`;
  }).join("");
  const factura = tag("fechaEmision", fecha) + tag("dirEstablecimiento", d.dirEstablecimiento) + tag("obligadoContabilidad", d.obligadoContabilidad ? "SI" : "NO") + tag("tipoIdentificacionComprador", d.tipoIdentificacionComprador) + tag("razonSocialComprador", d.razonSocialComprador) + tag("identificacionComprador", d.tipoIdentificacionComprador === "07" ? "9999999999999" : d.identificacionComprador) + tag("totalSinImpuestos", numero(d.totalSinImpuestos)) + tag("totalDescuento", numero(d.totalDescuento)) + `<totalConImpuestos>${d.totalConImpuestos.map((i) => `<totalImpuesto>${impuesto(i, false)}</totalImpuesto>`).join("")}</totalConImpuestos>` + tag("propina", "0.00") + tag("importeTotal", numero(d.importeTotal)) + tag("moneda", "DOLAR") + `<pagos>${pagos}</pagos>`;
  const detalles = d.detalles.map((i) => {
    if (i.cantidad <= 0 || !i.impuestos.length) throw new Error("Detalle inválido.");
    return `<detalle>${tag("codigoPrincipal", i.codigoPrincipal)}${tag("descripcion", i.descripcion)}${tag("cantidad", numero(i.cantidad))}${tag("precioUnitario", numero(i.precioUnitario))}${tag("descuento", numero(i.descuento))}${tag("precioTotalSinImpuesto", numero(i.precioTotalSinImpuesto))}<impuestos>${i.impuestos.map((imp) => `<impuesto>${impuesto(imp, true)}</impuesto>`).join("")}</impuestos></detalle>`;
  }).join("");
  const adicionales = (d.email ? `<campoAdicional nombre="Email">${escapar(d.email)}</campoAdicional>` : "") + (d.telefono ? `<campoAdicional nombre="Teléfono">${escapar(d.telefono)}</campoAdicional>` : "");
  return `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0"><infoTributaria>${tributaria}</infoTributaria><infoFactura>${factura}</infoFactura><detalles>${detalles}</detalles>${adicionales ? `<infoAdicional>${adicionales}</infoAdicional>` : ""}</factura>`;
}
