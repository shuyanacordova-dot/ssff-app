import { DOMParser } from "@xmldom/xmldom";

export type AmbienteSri = "pruebas" | "produccion";
export type MensajeSri = { identificador: string; mensaje: string; informacionAdicional: string; tipo: string };
export type RespuestaRecepcion = { estado: "RECIBIDA" | "DEVUELTA"; mensajes: MensajeSri[] };
export type RespuestaAutorizacion =
  | { estado: "AUTORIZADO"; numeroAutorizacion: string; fechaAutorizacion: string; mensajes: MensajeSri[] }
  | { estado: "NO AUTORIZADO" | "EN PROCESO" | "SIN RESPUESTA"; mensajes: MensajeSri[] };

const base: Record<AmbienteSri, string> = {
  pruebas: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws",
  produccion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws",
};

/** Solo estas dos direcciones del SRI reciben comprobantes; no se acepta ninguna otra. */
const url = (ambiente: AmbienteSri, servicio: "RecepcionComprobantesOffline" | "AutorizacionComprobantesOffline") => `${base[ambiente]}/${servicio}`;

async function llamar(direccion: string, cuerpo: string): Promise<Document> {
  const respuesta = await fetch(direccion, {
    method: "POST",
    headers: { "Content-Type": "text/xml;charset=UTF-8", SOAPAction: "" },
    body: cuerpo,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const texto = await respuesta.text();
  if (!texto.trim().startsWith("<")) throw new Error(`El SRI respondió con un formato inesperado (HTTP ${respuesta.status}).`);
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(texto, "text/xml") as unknown as Document;
  const falla = doc.getElementsByTagName("faultstring")[0]?.textContent;
  if (falla) throw new Error(`El SRI rechazó la solicitud: ${falla}`);
  return doc;
}

const texto = (nodo: Element | Document | undefined, etiqueta: string) => (nodo?.getElementsByTagName(etiqueta)[0]?.textContent ?? "").trim();

function mensajes(nodo: Element | Document | undefined): MensajeSri[] {
  if (!nodo) return [];
  return Array.from(nodo.getElementsByTagName("mensaje"))
    .filter((m) => m.getElementsByTagName("identificador").length > 0)
    .map((m) => ({ identificador: texto(m, "identificador"), mensaje: texto(m, "mensaje"), informacionAdicional: texto(m, "informacionAdicional"), tipo: texto(m, "tipo") }));
}

/** Envía el XML firmado al SRI. RECIBIDA no significa aprobada: hay que consultar la autorización. */
export async function enviarComprobante(ambiente: AmbienteSri, xmlFirmado: string): Promise<RespuestaRecepcion> {
  const b64 = Buffer.from(xmlFirmado, "utf8").toString("base64");
  const sobre = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion"><soapenv:Header/><soapenv:Body><ec:validarComprobante><xml>${b64}</xml></ec:validarComprobante></soapenv:Body></soapenv:Envelope>`;
  const doc = await llamar(url(ambiente, "RecepcionComprobantesOffline"), sobre);
  const estado = texto(doc, "estado");
  if (estado !== "RECIBIDA" && estado !== "DEVUELTA") throw new Error("El SRI no devolvió un estado de recepción reconocible.");
  return { estado, mensajes: mensajes(doc) };
}

/** Consulta si el SRI ya autorizó el comprobante identificado por su clave de acceso. */
export async function consultarAutorizacion(ambiente: AmbienteSri, claveAcceso: string): Promise<RespuestaAutorizacion> {
  if (!/^\d{49}$/.test(claveAcceso)) throw new Error("Clave de acceso inválida.");
  const sobre = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion"><soapenv:Header/><soapenv:Body><ec:autorizacionComprobante><claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante></ec:autorizacionComprobante></soapenv:Body></soapenv:Envelope>`;
  const doc = await llamar(url(ambiente, "AutorizacionComprobantesOffline"), sobre);
  const autorizacion = doc.getElementsByTagName("autorizacion")[0];
  if (!autorizacion) return { estado: "SIN RESPUESTA", mensajes: [] };
  const estado = texto(autorizacion, "estado");
  if (estado === "AUTORIZADO") return { estado, numeroAutorizacion: texto(autorizacion, "numeroAutorizacion"), fechaAutorizacion: texto(autorizacion, "fechaAutorizacion"), mensajes: mensajes(autorizacion) };
  return { estado: estado === "EN PROCESO" ? "EN PROCESO" : "NO AUTORIZADO", mensajes: mensajes(autorizacion) };
}
