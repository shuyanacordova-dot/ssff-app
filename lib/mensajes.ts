import { diasCalendarioGuayaquil } from "@/lib/record-date";
export type PlantillaContactoId = "listo_retiro" | "cobro_insistente" | "cobro_mensual";

export type ContextoMensaje = {
  nombre: string;
  empresa: string;
  saldo?: number;
  ticketUrl?: string | null;
  fechaCompra?: string | null;
};

export const plantillasContacto: Array<{ id: PlantillaContactoId; nombre: string; descripcion: string }> = [
  { id: "listo_retiro", nombre: "Pedido listo", descripcion: "Avisa que sus lentes están listos para retirar." },
  { id: "cobro_insistente", nombre: "Cobro insistente", descripcion: "Recordatorio firme para saldos vencidos." },
  { id: "cobro_mensual", nombre: "Cobro mensual", descripcion: "Recordatorio amable para la cuota del mes." },
];

const ticketLine = (ticketUrl?: string | null) => ticketUrl
  ? `\n\n🌿 Cuidemos el medio ambiente. Consulta tu ticket virtual desde el siguiente enlace: ${ticketUrl}`
  : "";

// Nombre comercial de cada empresa para los mensajes al paciente.
const nombreOptica: Record<string, string> = {
  "51820b6b-9fc1-495c-b2ea-ab50547e2ce3": "ShuVision Óptica",
  "be1dc246-219a-40a2-9e92-707e5845d295": "Focus Óptica",
};
// "MARIA ISABEL CAMPO VERDE" -> "Maria": el saludo usa solo el primer nombre.
const primerNombre = (nombre: string) => { const n = nombre.trim().split(/\s+/)[0] ?? ""; return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ""; };

export function mensajeTicketVirtual({ nombre, ticketUrl, empresaId }: Pick<ContextoMensaje, "nombre" | "ticketUrl"> & { empresaId?: string | null }) {
  const optica = (empresaId && nombreOptica[empresaId]) || "ShuVision Óptica";
  const saludo = primerNombre(nombre);
  return `Hola ${saludo || "😊"} 👋, te saludamos de ${optica}. ¡Gracias por confiar en nosotros!\n\n🌿 Cuidemos el medio ambiente: en lugar de un recibo impreso, aquí tienes tu ticket virtual. Ahí puedes ver el detalle de tu compra, tus abonos y tu saldo, siempre actualizado:\n${ticketUrl ?? ""}\n\nCualquier duda, escríbenos por aquí. ¡Que tengas un lindo día!`;
}

const formatFecha = (iso: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));

const diasVencidos = (iso?: string | null) => {
  if (!iso) return null;
  const dias = diasCalendarioGuayaquil(iso);
  return dias > 0 ? dias : 0;
};

export function construirMensajeContacto(plantilla: PlantillaContactoId, contexto: ContextoMensaje) {
  const saldo = `$${Number(contexto.saldo ?? 0).toFixed(2)}`;
  if (plantilla === "listo_retiro") {
    return `Hola ${contexto.nombre}. Tus lentes ya están listos para retirar en ${contexto.empresa}. ¡Te esperamos!${ticketLine(contexto.ticketUrl)}`;
  }
  if (plantilla === "cobro_mensual") {
    return `Hola ${contexto.nombre}. Te enviamos tu recordatorio mensual de ${contexto.empresa}. Mantienes un saldo pendiente de ${saldo}. Por favor, indícanos cuándo podemos coordinar tu pago. Gracias.${ticketLine(contexto.ticketUrl)}`;
  }
  const dias = diasVencidos(contexto.fechaCompra);
  const vencidoLine = contexto.fechaCompra && dias !== null
    ? ` Tu compra fue el ${formatFecha(contexto.fechaCompra)}, hace ${dias} día${dias === 1 ? "" : "s"} sin registrar el pago completo.`
    : "";
  return `Hola ${contexto.nombre}. Te recordamos que mantienes un saldo pendiente de ${saldo} en ${contexto.empresa}.${vencidoLine} Necesitamos coordinar tu pago lo antes posible. Por favor, respóndenos para confirmar la fecha de pago.${ticketLine(contexto.ticketUrl)}`;
}
