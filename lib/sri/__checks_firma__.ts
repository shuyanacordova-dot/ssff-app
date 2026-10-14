import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { C14nCanonicalization, SignedXml } from "xml-crypto";
import { generarClaveAcceso } from "./clave-acceso";
import { construirFacturaXml } from "./factura-xml";
import { firmarComprobanteXml, leerP12 } from "./firma-xades";

/** Autocomprobación con una firma autogenerada (nunca la firma real de un emisor). */
export function comprobarFirma(): string {
  const llaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey; cert.serialNumber = "0a1b2c3d";
  cert.validity.notBefore = new Date(Date.now() - 86400000); cert.validity.notAfter = new Date(Date.now() + 86400000 * 365);
  const attrs = [{ name: "commonName", value: "PRUEBA, S.A." }, { name: "countryName", value: "EC" }];
  cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(llaves.privateKey, forge.md.sha1.create());
  const p12 = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(llaves.privateKey, [cert], "clave-prueba", { algorithm: "3des" })).getBytes();
  const material = leerP12(Buffer.from(p12, "binary"), "clave-prueba");

  const clave = generarClaveAcceso({ fecha: "29/09/2026", tipoComprobante: "01", ruc: "1804006391001", ambiente: 1, establecimiento: "001", puntoEmision: "001", secuencial: 1, codigoNumerico: "12345678", tipoEmision: 1 });
  const imp = [{ codigoPorcentaje: "4" as const, baseImponible: 10, valor: 1.5 }];
  const xml = construirFacturaXml({ ambiente: 1, tipoEmision: 1, razonSocial: "Óptica \"Ñandú\" & Hijos", ruc: "1804006391001", claveAcceso: clave, establecimiento: "001", puntoEmision: "001", secuencial: 1, dirMatriz: "Matriz", regimen: "general", fechaEmision: "2026-09-29", dirEstablecimiento: "Sucursal", obligadoContabilidad: false, tipoIdentificacionComprador: "07", razonSocialComprador: "CONSUMIDOR FINAL", identificacionComprador: "9999999999999", totalSinImpuestos: 10, totalDescuento: 0, totalConImpuestos: imp, importeTotal: 11.5, pagos: [{ formaPago: "01", total: 11.5 }], detalles: [{ codigoPrincipal: "A1", descripcion: "Producto 'x'", cantidad: 1, precioUnitario: 10, descuento: 0, precioTotalSinImpuesto: 10, impuestos: imp }], email: "a&b@example.com" });
  const firmado = firmarComprobanteXml(xml, material);

  const doc = new DOMParser().parseFromString(firmado, "text/xml");
  const firma = doc.getElementsByTagName("ds:Signature")[0];
  const nuevoVerificador = () => {
    const v = new SignedXml({ publicCert: forge.pki.certificateToPem(cert) });
    v.CanonicalizationAlgorithms["http://www.w3.org/TR/2001-REC-xml-c14n-20010315"] = C14nCanonicalization;
    return v;
  };
  const verificador = nuevoVerificador();
  verificador.loadSignature(firma as unknown as Node);
  if (!verificador.checkSignature(firmado)) throw new Error("La firma XAdES no se valida: " + verificador.getSignedReferences().length);
  const alterado = firmado.replace("<importeTotal>11.50", "<importeTotal>99.50");
  const v2 = nuevoVerificador();
  v2.loadSignature(new DOMParser().parseFromString(alterado, "text/xml").getElementsByTagName("ds:Signature")[0] as unknown as Node);
  let detectaAlteracion = false;
  try { detectaAlteracion = !v2.checkSignature(alterado); } catch { detectaAlteracion = true; }
  if (!detectaAlteracion) throw new Error("Una factura alterada no debería validar.");
  return "Firma XAdES-BES OK: se valida y detecta alteraciones.";
}
