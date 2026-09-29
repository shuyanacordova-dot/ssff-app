import { generarClaveAcceso, digitoVerificadorModulo11 } from "./clave-acceso";
import { construirFacturaXml } from "./factura-xml";

export function comprobarSri(): string {
  const clave = generarClaveAcceso({ fecha: "29/09/2026", tipoComprobante: "01", ruc: "1804006391001", ambiente: 1, establecimiento: "001", puntoEmision: "001", secuencial: 1, codigoNumerico: "12345678", tipoEmision: 1 });
  const assert = (ok: boolean) => { if (!ok) throw new Error("Falló la autocomprobación SRI."); };
  assert(/^\d{49}$/.test(clave));
  assert(Number(clave[48]) === digitoVerificadorModulo11(clave.slice(0, 48)));
  assert(digitoVerificadorModulo11("0".repeat(48)) === 0);
  assert(digitoVerificadorModulo11("0".repeat(47) + "6") === 1);
  const impuestos = [{ codigoPorcentaje: "4" as const, baseImponible: 10, valor: 1.5 }];
  const xml = construirFacturaXml({ ambiente: 1, tipoEmision: 1, razonSocial: "Óptica & Hijos", nombreComercial: "<Prueba>", ruc: "1804006391001", claveAcceso: clave, establecimiento: "001", puntoEmision: "001", secuencial: 1, dirMatriz: "Matriz", regimen: "rimpe_emprendedor", fechaEmision: "2026-09-29", dirEstablecimiento: "Sucursal", obligadoContabilidad: false, tipoIdentificacionComprador: "07", razonSocialComprador: "CONSUMIDOR FINAL", identificacionComprador: "9999999999999", totalSinImpuestos: 10, totalDescuento: 0, totalConImpuestos: impuestos, importeTotal: 11.5, pagos: [{ formaPago: "01", total: 11.5 }], detalles: [{ codigoPrincipal: "A1", descripcion: "Producto", cantidad: 1, precioUnitario: 10, descuento: 0, precioTotalSinImpuesto: 10, impuestos }], email: "a&b@example.com" });
  assert(xml.includes("Óptica &amp; Hijos") && xml.includes("&lt;Prueba&gt;") && xml.includes("<importeTotal>11.50</importeTotal>") && xml.includes("CONTRIBUYENTE RÉGIMEN RIMPE"));
  return "SRI OK: clave de 49 dígitos, módulo 11 y XML verificados.";
}
