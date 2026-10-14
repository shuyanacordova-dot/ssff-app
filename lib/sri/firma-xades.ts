import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { C14nCanonicalization } from "xml-crypto";

const NS_DS = "http://www.w3.org/2000/09/xmldsig#";
const NS_ETSI = "http://uri.etsi.org/01903/v1.3.2#";
const ALG_C14N = "http://www.w3.org/TR/2001-REC-xml-c14n-20010315";
const ALG_RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const ALG_SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const ALG_ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

const NS_DECL = ` xmlns:ds="${NS_DS}" xmlns:etsi="${NS_ETSI}"`;
const canonicalizador = new C14nCanonicalization();

/** Canonicaliza un fragmento XML autónomo (C14N 1.0 inclusivo, sin comentarios). */
export function canonicalizar(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (!doc.documentElement) throw new Error("XML inválido.");
  return canonicalizador.process(doc.documentElement as unknown as Node, { ancestorNamespaces: [] });
}

const sha1Base64 = (texto: string) => {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(texto));
  return forge.util.encode64(md.digest().getBytes());
};
const escapar = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const envolver64 = (b64: string) => b64.replace(/(.{76})/g, "$1\n").replace(/\n$/, "");
const aleatorio = () => Math.floor(Math.random() * 900000) + 100000;

export type MaterialFirma = { certificado: forge.pki.Certificate; llave: forge.pki.rsa.PrivateKey };

/** Extrae del .p12 el certificado que corresponde a la llave privada. Falla si la clave es incorrecta. */
export function leerP12(p12Der: Uint8Array | Buffer, clave: string): MaterialFirma {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(Buffer.from(p12Der).toString("binary")), false, clave);
  const certificados = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const llaves = [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag].flatMap((tipo) => p12.getBags({ bagType: tipo })[tipo] ?? []);
  for (const llave of llaves) {
    const privada = llave.key as forge.pki.rsa.PrivateKey | undefined;
    if (!privada?.n || !privada.e) continue;
    const bag = certificados.find((c) => {
      const publica = c.cert?.publicKey as forge.pki.rsa.PublicKey | undefined;
      return Boolean(publica?.n && publica.e && publica.n.equals(privada.n) && publica.e.equals(privada.e));
    });
    if (bag?.cert) return { certificado: bag.cert, llave: privada };
  }
  throw new Error("El .p12 no contiene una llave con su certificado.");
}

/** Nombre del emisor en el orden y formato que espera XAdES (RFC 2253, del último atributo al primero). */
function nombreEmisor(cert: forge.pki.Certificate): string {
  return [...cert.issuer.attributes].reverse().map((a) => {
    const nombre = a.shortName ?? a.name ?? a.type;
    const valor = String(a.value).replace(/([,+"\\<>;])/g, "\\$1");
    return `${nombre}=${valor}`;
  }).join(",");
}

function horaEcuador(ahora: Date): string {
  return new Date(ahora.getTime() - 5 * 3600_000).toISOString().slice(0, 19) + "-05:00";
}

/**
 * Firma una factura (sin firmar, con `id="comprobante"`) en formato XAdES-BES envuelto, como exige el SRI.
 * No hace llamadas de red. La llave privada solo se usa en memoria.
 */
export function firmarComprobanteXml(xml: string, material: MaterialFirma, ahora: Date = new Date()): string {
  const limpio = xml.replace(/^<\?xml[^>]*\?>\s*/, "");
  if (!/^<(factura|notaCredito)\b[^>]*\bid="comprobante"/.test(limpio) || !limpio.endsWith("</factura>") && !limpio.endsWith("</notaCredito>")) throw new Error("El comprobante no tiene la forma esperada.");
  const cierre = limpio.lastIndexOf("</");
  const { certificado, llave } = material;

  const idFirma = `Signature${aleatorio()}`;
  const idSignedInfo = `Signature-SignedInfo${aleatorio()}`;
  const idValor = `SignatureValue${aleatorio()}`;
  const idCert = `Certificate${aleatorio()}`;
  const idProps = `${idFirma}-SignedProperties${aleatorio()}`;
  const idRefComprobante = `Reference-ID-${aleatorio()}`;
  const idRefProps = `SignedPropertiesID${aleatorio()}`;

  const derCert = forge.asn1.toDer(forge.pki.certificateToAsn1(certificado)).getBytes();
  const certB64 = forge.util.encode64(derCert);
  const digestCert = (() => { const md = forge.md.sha1.create(); md.update(derCert); return forge.util.encode64(md.digest().getBytes()); })();
  const serie = BigInt("0x" + certificado.serialNumber).toString();
  const publica = certificado.publicKey as forge.pki.rsa.PublicKey;
  const b64Entero = (n: forge.jsbn.BigInteger) => { let hex = n.toString(16); if (hex.length % 2) hex = "0" + hex; return forge.util.encode64(forge.util.hexToBytes(hex)); };

  const propiedades = (ns: string) =>
    `<etsi:SignedProperties${ns} Id="${idProps}"><etsi:SignedSignatureProperties><etsi:SigningTime>${horaEcuador(ahora)}</etsi:SigningTime>` +
    `<etsi:SigningCertificate><etsi:Cert><etsi:CertDigest><ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod><ds:DigestValue>${digestCert}</ds:DigestValue></etsi:CertDigest>` +
    `<etsi:IssuerSerial><ds:X509IssuerName>${escapar(nombreEmisor(certificado))}</ds:X509IssuerName><ds:X509SerialNumber>${serie}</ds:X509SerialNumber></etsi:IssuerSerial></etsi:Cert></etsi:SigningCertificate></etsi:SignedSignatureProperties>` +
    `<etsi:SignedDataObjectProperties><etsi:DataObjectFormat ObjectReference="#${idRefComprobante}"><etsi:Description>contenido comprobante</etsi:Description><etsi:MimeType>text/xml</etsi:MimeType></etsi:DataObjectFormat></etsi:SignedDataObjectProperties></etsi:SignedProperties>`;

  const infoClave = (ns: string) =>
    `<ds:KeyInfo${ns} Id="${idCert}"><ds:X509Data><ds:X509Certificate>${envolver64(certB64)}</ds:X509Certificate></ds:X509Data>` +
    `<ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${envolver64(b64Entero(publica.n))}</ds:Modulus><ds:Exponent>${b64Entero(publica.e)}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue></ds:KeyInfo>`;

  const digestComprobante = sha1Base64(canonicalizar(limpio));
  const digestProps = sha1Base64(canonicalizar(propiedades(NS_DECL)));
  const digestClave = sha1Base64(canonicalizar(infoClave(NS_DECL)));

  const infoFirmada = (ns: string) =>
    `<ds:SignedInfo${ns} Id="${idSignedInfo}"><ds:CanonicalizationMethod Algorithm="${ALG_C14N}"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="${ALG_RSA_SHA1}"></ds:SignatureMethod>` +
    `<ds:Reference Id="${idRefProps}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#${idProps}"><ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod><ds:DigestValue>${digestProps}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference URI="#${idCert}"><ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod><ds:DigestValue>${digestClave}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference Id="${idRefComprobante}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="${ALG_ENVELOPED}"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod><ds:DigestValue>${digestComprobante}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(canonicalizar(infoFirmada(NS_DECL))));
  const valorFirma = forge.util.encode64(llave.sign(md));

  const firma =
    `<ds:Signature${NS_DECL} Id="${idFirma}">${infoFirmada("")}<ds:SignatureValue Id="${idValor}">${envolver64(valorFirma)}</ds:SignatureValue>${infoClave("")}` +
    `<ds:Object Id="${idFirma}-Object${aleatorio()}"><etsi:QualifyingProperties Target="#${idFirma}">${propiedades("")}</etsi:QualifyingProperties></ds:Object></ds:Signature>`;

  return `<?xml version="1.0" encoding="UTF-8"?>` + limpio.slice(0, cierre) + firma + limpio.slice(cierre);
}
