import type { TipoPlantilla } from "@/lib/plantillas-mensajes";

// Textos de "Mensajes del día": los mismos que enviaba Make (plantillas aprobadas en Meta
// "feliz_cumpleanos" y "recordatorio_control_anual", idioma es_EC). Se usan para el envío con un toque
// (wa.me) y como referencia del envío automático.

const SHUVISION_ID = "51820b6b-9fc1-495c-b2ea-ab50547e2ce3";

export const opticaDeEmpresa = (empresaId?: string | null) => empresaId && empresaId !== SHUVISION_ID ? "Focus Óptica" : "ShuVisión";

// "MARIA ISABEL CAMPO VERDE" -> "Maria"
export const primerNombre = (nombre: string) => { const n = nombre.trim().split(/\s+/)[0] ?? ""; return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ""; };

export function mensajeCumpleanos(nombre: string, empresaId?: string | null) {
  const optica = opticaDeEmpresa(empresaId);
  return `¡Feliz cumpleaños, ${primerNombre(nombre) || "😊"}! ✨🎂\n\nDe parte de todo el equipo de *${optica}*, queremos desearte un día lleno de alegría, salud y momentos especiales. 🥳💙\n\n🎁 *Como regalo de cumpleaños tienes:*\n\n👓 *Ajuste de tus lentes GRATIS*\n\n🛍️ *15% de descuento* en cualquier compra en nuestra óptica.\n\n📅 Puedes disfrutar estos beneficios durante *1 mes a partir de la fecha en que recibes este mensaje*.\n\nAdemás, por ser paciente de ${optica}, podrás mantener el *precio de tus lentes* al renovar tu armazón y lunas, siempre que mantengas una calidad equivalente en lunas, filtros y armazón.\n\n¡Esperamos verte pronto! 👁️💙 *${optica} — cuidamos tu visión, celebramos contigo.*`;
}

// Control de 3 o 6 meses (o cualquier plazo menor a 10 meses): texto propio, sin plantilla de Meta.
export function mensajeControlPeriodico(nombre: string, meses: number, empresaId?: string | null) {
  const optica = opticaDeEmpresa(empresaId);
  return `👁️ *TU CONTROL VISUAL TE ESPERA*\n\nHola ${primerNombre(nombre) || "😊"}, te saludamos de *${optica}*. En tu última revisión te indicamos un control a los *${meses} meses* y ya es momento de hacerlo.\n\nRevisaremos cómo va tu visión y si tu graduación sigue siendo la adecuada.\n\n📅 *Agenda tu control respondiendo a este mensaje.*\n\n*${optica} — cuidamos tu visión. 💙*`;
}

// Elige el texto según el plazo: 10 meses o más = control anual (mismo texto de Make).
export const mensajeControl = (nombre: string, meses: number, empresaId?: string | null) => meses >= 10 ? mensajeControlAnual(nombre, empresaId) : mensajeControlPeriodico(nombre, meses, empresaId);

export function mensajeControlAnual(nombre: string, empresaId?: string | null) {
  const optica = opticaDeEmpresa(empresaId);
  return `👁️✨ *TU CONTROL VISUAL ANUAL TE ESTÁ ESPERANDO* ✨\n\nHola ${primerNombre(nombre) || "😊"}, ha pasado aproximadamente *un año desde tu último control visual* y queremos recordarte que ya es momento de revisar nuevamente tu visión.\n\n🎁 *Por ser paciente de ${optica}, tu examen visual es completamente GRATUITO.*\n\nDurante tu control podremos verificar tu agudeza visual, revisar si tu graduación continúa siendo adecuada y orientarte sobre cualquier cambio que necesites.\n\nAdemás, si necesitas renovar tus lentes, *mantenemos para nuestros pacientes el precio de sus lentes* siempre que se conserve una calidad equivalente en armazón, lunas y filtros.\n\n📅 *Agenda tu control respondiendo a este mensaje.*\n\nTu visión cambia. Nosotros queremos seguir cuidándola contigo. 💙\n\n*${optica} — cuidamos tu visión. 👁️*`;
}

// Plantillas de Meta (WhatsApp Cloud API) del envío automático. Shuvisión usa las aprobadas en tiempo de Make;
// Focus usa las suyas ("_focus") y el control de 3/6 meses usa "recordatorio_control_periodico" (creadas 2026-10-06).
export type PlantillaMeta = { nombre: string; idioma: string; imagen?: string };
const IMG_CUMPLE = "https://res.cloudinary.com/ip1jz9eg/image/upload/v1787675996/ChatGPT_Image_23_ago_2026_23_43_46.png";
const IMG_CONTROL = "https://res.cloudinary.com/ip1jz9eg/image/upload/v1787676005/ChatGPT_Image_23_ago_2026_23_53_31.png";
const plantillasShuvision: Record<TipoPlantilla, PlantillaMeta> = {
  cumpleanos: { nombre: "feliz_cumpleanos", idioma: "es_EC", imagen: IMG_CUMPLE },
  control_anual: { nombre: "recordatorio_control_anual", idioma: "es_EC", imagen: IMG_CONTROL },
  control_periodico: { nombre: "recordatorio_control_periodico", idioma: "es_EC" },
  cobro: { nombre: "recordatorio_cobro", idioma: "es_EC" },
  cobro_insistente: { nombre: "cobranza_insistente", idioma: "es_EC" },
  cobro_apartado: { nombre: "sistema_apartado_recordatorio", idioma: "es_EC" },
};
const plantillasFocus: Record<TipoPlantilla, PlantillaMeta> = {
  cumpleanos: { nombre: "feliz_cumpleanos_focus", idioma: "es_EC" },
  control_anual: { nombre: "recordatorio_control_anual_focus", idioma: "es_EC" },
  control_periodico: { nombre: "recordatorio_control_periodico", idioma: "es_EC" },
  cobro: { nombre: "recordatorio_cobro_focus", idioma: "es_EC" },
  cobro_insistente: { nombre: "cobranza_insistente_focus", idioma: "es_EC" },
  cobro_apartado: { nombre: "apartado_recordatorio_focus", idioma: "es_EC" },
};
export const plantillaMeta = (empresaId: string, tipo: TipoPlantilla) => (empresaId === SHUVISION_ID ? plantillasShuvision : plantillasFocus)[tipo];
export const nombreOpticaLargo = (empresaId?: string | null) => empresaId && empresaId !== SHUVISION_ID ? "Focus Óptica" : "ShuVision Óptica";

export type CumpleanosHoy = { paciente_id: string; nombre: string; nombres: string; telefono: string | null; fecha_nacimiento: string; edad: number | null; enviado_en: string | null; enviado_auto: boolean };
export type ControlPendiente = { paciente_id: string; nombre: string; nombres: string; telefono: string | null; consulta_id: string; ultima_revision: string; vence: string; programado: boolean; tipo: "programado" | "aniversario"; anios: number; meses: number; make_ya_envio: boolean; enviado_en: string | null; enviado_auto: boolean };
export type MensajesDia = { empresa_id: string; hoy: string; cumpleanos: CumpleanosHoy[]; controles: ControlPendiente[] };
export type ConfigMensajesAutomaticos = { activo: boolean; cumpleanos: boolean; control_anual: boolean; cobros: boolean; actualizado_en: string | null };
export type NumeroSucursal = { sucursal_id: string; nombre: string; numero: string | null; conectado: boolean };
