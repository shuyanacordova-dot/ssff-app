export type PlantillaContactoId = "listo_retiro" | "cobro_insistente" | "cobro_mensual";

export type ContextoMensaje = {
  nombre: string;
  empresa: string;
  saldo?: number;
  ticketUrl?: string | null;
};

export const plantillasContacto: Array<{ id: PlantillaContactoId; nombre: string; descripcion: string }> = [
  { id: "listo_retiro", nombre: "Pedido listo", descripcion: "Avisa que sus lentes están listos para retirar." },
  { id: "cobro_insistente", nombre: "Cobro insistente", descripcion: "Recordatorio firme para saldos vencidos." },
  { id: "cobro_mensual", nombre: "Cobro mensual", descripcion: "Recordatorio amable para la cuota del mes." },
];

const ticketLine = (ticketUrl?: string | null) => ticketUrl
  ? `\n\n🌿 Cuidemos el medio ambiente. Consulta tu ticket virtual desde el siguiente enlace: ${ticketUrl}`
  : "";

export function mensajeTicketVirtual({ nombre, ticketUrl }: Pick<ContextoMensaje, "nombre" | "ticketUrl">) {
  return `Hola ${nombre}.\n\n🌿 Cuidemos el medio ambiente. Consulta tu ticket virtual desde el siguiente enlace: ${ticketUrl ?? ""}`;
}

export function construirMensajeContacto(plantilla: PlantillaContactoId, contexto: ContextoMensaje) {
  const saldo = `$${Number(contexto.saldo ?? 0).toFixed(2)}`;
  if (plantilla === "listo_retiro") {
    return `Hola ${contexto.nombre}. Tus lentes ya están listos para retirar en ${contexto.empresa}. ¡Te esperamos!${ticketLine(contexto.ticketUrl)}`;
  }
  if (plantilla === "cobro_mensual") {
    return `Hola ${contexto.nombre}. Te enviamos tu recordatorio mensual de ${contexto.empresa}. Mantienes un saldo pendiente de ${saldo}. Por favor, indícanos cuándo podemos coordinar tu pago. Gracias.${ticketLine(contexto.ticketUrl)}`;
  }
  return `Hola ${contexto.nombre}. Te recordamos que mantienes un saldo pendiente de ${saldo} en ${contexto.empresa}. Necesitamos coordinar tu pago lo antes posible. Por favor, respóndenos para confirmar la fecha de pago.${ticketLine(contexto.ticketUrl)}`;
}
