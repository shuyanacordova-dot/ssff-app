import type { TipoPlantilla } from "@/lib/plantillas-mensajes";

// Textos de "Mensajes del día": los mismos que enviaba Make (plantillas aprobadas en Meta
// "feliz_cumpleanos" y "recordatorio_control_anual", idioma es_EC). Se usan para el envío con un toque
// (wa.me) y como referencia del envío automático.

const SHUVISION_ID = "51820b6b-9fc1-495c-b2ea-ab50547e2ce3";

const esFocus = (empresaId?: string | null) => !!empresaId && empresaId !== SHUVISION_ID;
export const opticaDeEmpresa = (empresaId?: string | null) => empresaId && empresaId !== SHUVISION_ID ? "Focus Óptica" : "ShuVisión";

// "MARIA ISABEL CAMPO VERDE" -> "Maria"
export const primerNombre = (nombre: string) => { const n = nombre.trim().split(/\s+/)[0] ?? ""; return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ""; };

export function mensajeCumpleanos(nombre: string, empresaId?: string | null) {
  if (esFocus(empresaId)) return `*FOCUS ÓPTICA | Un detalle para ti*\n\n${primerNombre(nombre) || "Hola"}, feliz cumpleaños. Que este nuevo año te traiga momentos que valga la pena mirar de cerca.\n\nTienes *15% de descuento* en tu próxima compra y *limpieza y ajuste sin costo* para tus lentes. Puedes usar estos beneficios durante los próximos 30 días en Focus Óptica, Shushufindi.\n\nSi quieres venir, responde aquí y coordinamos tu visita.\n\nFocus Óptica`;
  const optica = opticaDeEmpresa(empresaId);
  return `¡Feliz cumpleaños, ${primerNombre(nombre) || "querido paciente"}! 🎂💙\n\nTodo el equipo de ${optica} te desea un día lleno de alegría. Nos encanta acompañarte y hoy queremos celebrarte.\n\n🎁 Tu regalo de cumpleaños:\n👓 Ajuste de lentes sin costo.\n✨ 15 % de descuento en cualquier compra en nuestra óptica.\n\nPuedes disfrutar estos beneficios durante un mes desde hoy. Si renuevas armazón y lunas con calidad equivalente, mantendremos el precio de tus lentes como beneficio de paciente. Escríbenos y te ayudamos a elegirlos.\n\n¡Un abrazo de parte de ${optica}!`;
}

// Control de 3 o 6 meses (o cualquier plazo menor a 10 meses): texto propio, sin plantilla de Meta.
export function mensajeControlPeriodico(nombre: string, meses: number, empresaId?: string | null) {
  if (esFocus(empresaId)) return `*FOCUS ÓPTICA | Revisión visual*\n\n${primerNombre(nombre) || "Hola"}, se cumple el plazo de *${meses} meses* indicado para tu control. Podemos revisar tu visión y cómo te estás adaptando a tus lentes.\n\n¿Te reservamos una cita? Responde con el día que te conviene.\n\nFocus Óptica · Shushufindi`;
  const optica = opticaDeEmpresa(empresaId);
  return `Hola, ${primerNombre(nombre) || "querido paciente"} 👋💙\n\nEn ${optica} seguimos pendientes de tu salud visual. Ya llegó el momento del control de ${meses} meses que te recomendamos en tu última visita.\n\n👓 Nos gustaría saber cómo te sientes con tus lentes y comprobar que tu visión esté bien.\n\n📅 Responde a este mensaje y buscamos juntos un horario para ti.\n\nCon cariño, el equipo de ${optica}.`;
}

// Elige el texto según el plazo: 10 meses o más = control anual (mismo texto de Make).
export const mensajeControl = (nombre: string, meses: number, empresaId?: string | null) => meses >= 10 ? mensajeControlAnual(nombre, empresaId) : mensajeControlPeriodico(nombre, meses, empresaId);

export function mensajeControlAnual(nombre: string, empresaId?: string | null) {
  if (esFocus(empresaId)) return `*FOCUS ÓPTICA | Es momento de revisar tu visión*\n\n${primerNombre(nombre) || "Hola"}, ha pasado aproximadamente un año desde tu última revisión. Un control nos permite comprobar si tu graduación sigue siendo adecuada.\n\nEl *examen de control no tiene costo* para nuestros pacientes.\n\n¿Quieres agendarlo? Indícanos qué día te viene bien y te confirmamos un turno.\n\nFocus Óptica · Shushufindi`;
  const optica = opticaDeEmpresa(empresaId);
  return `Hola, ${primerNombre(nombre) || "querido paciente"} 👋💙\n\nEn ${optica} nos acordamos de ti. Ha pasado aproximadamente un año desde tu última revisión y queremos invitarte a cuidar nuevamente tu visión.\n\n👓 En este control revisaremos cómo ves y si tu graduación necesita algún cambio. El examen visual es gratuito para nuestros pacientes.\n\n📅 ¿Te ayudamos a reservar un horario? Solo responde a este mensaje.\n\nTe esperamos con el cariño de siempre,\nEquipo ${optica}`;
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
  cumpleanos: { nombre: "feliz_cumpleanos_focus2", idioma: "es_EC" },
  control_anual: { nombre: "recordatorio_control_anual_focus2", idioma: "es_EC" },
  control_periodico: { nombre: "recordatorio_control_periodico", idioma: "es_EC" },
  cobro: { nombre: "recordatorio_cobro_focus", idioma: "es_EC" },
  cobro_insistente: { nombre: "cobranza_insistente_focus", idioma: "es_EC" },
  cobro_apartado: { nombre: "apartado_recordatorio_focus", idioma: "es_EC" },
};
export const plantillaMeta = (empresaId: string, tipo: TipoPlantilla) => (empresaId === SHUVISION_ID ? plantillasShuvision : plantillasFocus)[tipo];
export const nombreOpticaLargo = (empresaId?: string | null) => empresaId && empresaId !== SHUVISION_ID ? "Focus Óptica" : "ShuVision Óptica";

export function mensajePostventa(nombre: string, empresaId?: string | null) {
  if (esFocus(empresaId)) return `*FOCUS ÓPTICA | ¿Cómo van tus lentes?*\n\n${primerNombre(nombre) || "Hola"}, queremos saber cómo te ha ido desde que los recibiste. ¿Te resultan cómodos y ves bien en tus actividades diarias?\n\nSi notas alguna molestia, cuéntanos por aquí. Podemos revisarlos y ajustarlos sin costo.\n\nFocus Óptica`;
  return `Hola ${primerNombre(nombre)} 👋, te saludamos de ${opticaDeEmpresa(empresaId)}. Hace unos días retiraste tus lentes y queremos saber cómo te sientes con ellos. 👓\n\n¿Ves bien de lejos y de cerca? ¿Sientes alguna molestia, mareo o que se te resbalan? Cuéntanos y con gusto te ayudamos; el ajuste es gratis. 💙`;
}

export function mensajeResena(nombre: string, empresaId: string | null | undefined, url: string) {
  if (esFocus(empresaId)) return `${primerNombre(nombre) || "Hola"}, gracias por contarnos cómo te fue.\n\nSi te gustó la atención en *Focus Óptica*, puedes dejar tu opinión en Google aquí:\n${url}\n\nTu comentario ayuda a otras personas a conocernos. ¡Gracias!`;
  return `¡Qué gusto saber que estás feliz con tus lentes, ${primerNombre(nombre)}! 😊\n\nNos ayudarías muchísimo dejándonos tu opinión en Google, solo toma un minuto: ${url}\n\n¡Gracias por confiar en ${opticaDeEmpresa(empresaId)}! 💙`;
}

export type CumpleanosHoy = { paciente_id: string; nombre: string; nombres: string; telefono: string | null; fecha_nacimiento: string; edad: number | null; enviado_en: string | null; enviado_auto: boolean };
export type ControlPendiente = { paciente_id: string; nombre: string; nombres: string; telefono: string | null; consulta_id: string; ultima_revision: string; vence: string; programado: boolean; tipo: "programado" | "aniversario"; anios: number; meses: number; make_ya_envio: boolean; enviado_en: string | null; enviado_auto: boolean };
export type EntregaPendiente = { orden_id: string; paciente_id: string; nombre: string; nombres: string; telefono: string | null; entregado: string; postventa_en: string | null; resena_en: string | null };
export type MensajesDia = { empresa_id: string; hoy: string; cumpleanos: CumpleanosHoy[]; controles: ControlPendiente[] };
export type ConfigMensajesAutomaticos = { activo: boolean; cumpleanos: boolean; control_anual: boolean; cobros: boolean; actualizado_en: string | null };
export type NumeroSucursal = { sucursal_id: string; nombre: string; numero: string | null; conectado: boolean };

// Evita símbolos poco compatibles y marcas de negrita visibles en WhatsApp.
// Se conserva el selector de presentación de los demás emojis para que se muestren correctamente.
export const limpiarWhatsapp = (texto: string) => texto.replace(/👁️|👁/gu, "👓").replace(/🛍️|🛍/gu, "🎁").replace(/\*/g, "");

// Tarjeta con imagen: WhatsApp muestra la imagen como vista previa del enlace al final del mensaje.
const SITIO = "https://ssff-app.vercel.app";
export const tarjetaUrl = (tipo: "cumple" | "control", empresaId?: string | null) => `${SITIO}/tarjeta/${tipo}-${esFocus(empresaId) ? "focus" : "shuvision"}`;
export const conTarjeta = (texto: string, tipo: "cumple" | "control", empresaId?: string | null) => `${limpiarWhatsapp(texto)}\n\n${tarjetaUrl(tipo, empresaId)}`;
