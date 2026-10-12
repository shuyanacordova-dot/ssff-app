import { diasCalendarioGuayaquil } from "@/lib/record-date";
export type PlantillaContactoId = "listo_retiro" | "cobro_insistente" | "cobro_mensual" | "cobro_apartado" | "lentes_rezagados";

export type ContextoMensaje = {
  nombre: string;
  empresa: string;
  saldo?: number;
  ticketUrl?: string | null;
  fechaCompra?: string | null;
  // Fecha límite del apartado (AAAA-MM-DD).
  apartadoHasta?: string | null;
  // Frecuencia del recordatorio: cambia "este mes" por "esta semana" / "esta quincena".
  frecuencia?: "diaria" | "semanal" | "quincenal" | "mensual" | null;
  sucursal?: string | null;
};

export const plantillasContacto: Array<{ id: PlantillaContactoId; nombre: string; descripcion: string }> = [
  { id: "cobro_mensual", nombre: "Recordatorio de pago", descripcion: "Tono amable: solo recordar el abono (mensual, quincenal, semanal o diario)." },
  { id: "cobro_insistente", nombre: "Cobro insistente", descripcion: "Tono firme para saldos vencidos." },
  { id: "cobro_apartado", nombre: "Apartado (6 meses)", descripcion: "Recuerda el saldo y la fecha límite del apartado." },
  { id: "lentes_rezagados", nombre: "Lentes rezagados", descripcion: "Lentes listos que el paciente no ha retirado." },
  { id: "listo_retiro", nombre: "Pedido listo", descripcion: "Avisa que sus lentes están listos para retirar." },
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
  if (optica === "Focus Óptica") return `*FOCUS ÓPTICA | Tu compra*\n\n${saludo || "Hola"}, gracias por visitarnos. Guarda este enlace para consultar el detalle de tu compra, tus pagos y el saldo actualizado:\n${ticketUrl ?? ""}\n\nDesde allí también puedes decidir si autorizas el uso de tus datos y si deseas recibir novedades.\n\nSi necesitas ayuda con tu pedido, responde a este chat.\nFocus Óptica`;
  return `Hola ${saludo || "😊"} 👋, te saludamos de ${optica}. ¡Gracias por confiar en nosotros!\n\n🌿 Cuidemos el medio ambiente: en lugar de un recibo impreso, aquí tienes tu ticket virtual. Ahí puedes ver el detalle de tu compra, tus abonos y tu saldo, siempre actualizado:\n${ticketUrl ?? ""}\n\n🔒 En el mismo enlace puedes autorizar el uso de tus datos y, si deseas, recibir nuestras promociones.\n\nCualquier duda, escríbenos por aquí. ¡Que tengas un lindo día!`;
}

const formatFecha = (iso: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));

const diasVencidos = (iso?: string | null) => {
  if (!iso) return null;
  const dias = diasCalendarioGuayaquil(iso);
  return dias > 0 ? dias : 0;
};

// Nombre comercial y ciudad a partir del nombre de empresa o sucursal ("Shuvisión", "Shuvision Sacha", "Focus").
const opticaDesdeNombre = (nombre?: string | null) => /focus/i.test(nombre ?? "") ? "Focus Óptica" : "ShuVision Óptica";
const lugarDesdeSucursal = (sucursal?: string | null) => !sucursal || /focus/i.test(sucursal) ? "" : /sacha/i.test(sucursal) ? " en nuestra sucursal de Sacha" : " en nuestra sucursal de Shushufindi";

// Aviso de lentes listos para retirar (Ventas, Laboratorio, Cuentas por cobrar y CRM usan el mismo texto).
export function mensajeLentesListos({ nombre, empresa, sucursal, saldo, ticketUrl }: { nombre: string; empresa?: string | null; sucursal?: string | null; saldo?: number | null; ticketUrl?: string | null }) {
  const saludo = primerNombre(nombre);
  const optica = opticaDesdeNombre(sucursal || empresa);
  const saldoLine = saldo && saldo > 0 ? `\n\nPara tu comodidad, te recordamos que el saldo pendiente es de $${Number(saldo).toFixed(2)}.` : "";
  if (optica === "Focus Óptica") return `*FOCUS ÓPTICA | Tus lentes están listos*\n\n${saludo || "Hola"}, ya puedes pasar a retirarlos en Focus Óptica, Shushufindi. Al entregártelos revisaremos el ajuste para que te queden cómodos.${saldo && saldo > 0 ? `\n\nSaldo pendiente: $${Number(saldo).toFixed(2)}.` : ""}\n\nDinos qué día te viene bien y los tendremos preparados.${ticketUrl ? `\n\nConsulta tu compra: ${ticketUrl}` : ""}`;
  return `Hola ${saludo || "😊"} 👋, te saludamos de ${optica}.\n\n✨ ¡Tenemos buenas noticias! Tus lentes ya están listos y te esperan${lugarDesdeSucursal(sucursal)}. Cuando vengas a retirarlos, con gusto te los ajustamos para que te queden perfectos. 👓${saldoLine}\n\n¡Te esperamos con mucho cariño! 💙${ticketLine(ticketUrl)}`;
}

const fechaLarga = (ymd: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${ymd.slice(0, 10)}T12:00:00-05:00`));
const periodoLabel = { diaria: "hoy", semanal: "esta semana", quincenal: "esta quincena", mensual: "este mes" } as const;

// Plantilla sugerida según el tipo de cobro (Cobros de hoy y Cuentas por cobrar usan la misma regla):
// insistente = tono firme; apartado = plazo de 6 meses; rezagados = lentes sin retirar; con frecuencia (mensual,
// quincenal, semanal) = recordatorio amable; sin plan y con más de 90 días = firme; el resto = recordatorio.
export function plantillaSugerida(c: { insistente?: boolean; apartado?: boolean; rezagado?: boolean; frecuencia?: string | null; dias?: number | null }): PlantillaContactoId {
  if (c.rezagado) return "lentes_rezagados";
  if (c.insistente) return "cobro_insistente";
  if (c.apartado) return "cobro_apartado";
  if (c.frecuencia) return "cobro_mensual";
  return (c.dias ?? 0) > 90 ? "cobro_insistente" : "cobro_mensual";
}

export function construirMensajeContacto(plantilla: PlantillaContactoId, contexto: ContextoMensaje) {
  const saldoNum = Number(contexto.saldo ?? 0);
  const saldo = `$${saldoNum.toFixed(2)}`;
  const saludo = primerNombre(contexto.nombre) || "😊";
  const optica = opticaDesdeNombre(contexto.sucursal || contexto.empresa);
  const focus = optica === "Focus Óptica";
  if (plantilla === "listo_retiro") {
    return mensajeLentesListos({ nombre: contexto.nombre, empresa: contexto.empresa, sucursal: contexto.sucursal ?? contexto.empresa, saldo: contexto.saldo, ticketUrl: contexto.ticketUrl });
  }
  if (plantilla === "cobro_mensual") {
    const periodo = contexto.frecuencia ? periodoLabel[contexto.frecuencia] : null;
    if (focus) return `*FOCUS ÓPTICA | Estado de tu cuenta*\n\n${saludo}, ${periodo ? `${periodo} corresponde un abono de tu compra` : "te escribimos por el saldo de tu compra"}. El valor pendiente es *${saldo}*.\n\nPuedes pagar en la óptica o por transferencia. Envíanos el comprobante por este chat para actualizar tu cuenta. Si ya pagaste, compártelo para verificarlo.${contexto.ticketUrl ? `\n\nDetalle de tu compra: ${contexto.ticketUrl}` : ""}`;
    return `Hola ${saludo} 👋, te saludamos de ${optica}.\n\nSolo pasamos a recordarte, con cariño, ${periodo ? `que ${periodo} corresponde tu abono` : "tu abono pendiente"}. Tu saldo actual es de ${saldo}.\n\nPuedes acercarte a la óptica o hacer una transferencia y enviarnos el comprobante por aquí. Si ya realizaste tu pago, ¡muchas gracias! Envíanos el comprobante para registrarlo. 💙${ticketLine(contexto.ticketUrl)}`;
  }
  if (plantilla === "cobro_apartado") {
    const hasta = contexto.apartadoHasta ? ` hasta el ${fechaLarga(contexto.apartadoHasta)}` : " durante 6 meses desde tu compra";
    if (focus) return `*FOCUS ÓPTICA | Tu apartado*\n\n${saludo}, tus lentes siguen reservados. Queda un saldo de *${saldo}* y puedes completar el pago${hasta}.\n\nSi necesitas revisar el plazo o coordinar un abono, responde a este mensaje.${contexto.ticketUrl ? `\n\nDetalle: ${contexto.ticketUrl}` : ""}`;
    return `Hola ${saludo} 👋, te saludamos de ${optica}.\n\nTe recordamos que tienes tus lentes separados en nuestro sistema de apartado. El saldo pendiente es de ${saldo} y tienes plazo${hasta} para completar el pago y retirarlos. 👓\n\nPuedes abonar cuando gustes en la óptica o por transferencia. Pasada esa fecha el apartado vence, así que si necesitas más tiempo escríbenos antes para ayudarte.${ticketLine(contexto.ticketUrl)}`;
  }
  if (plantilla === "lentes_rezagados") {
    const saldoLine = saldoNum > 0.004 ? ` Para retirarlos, el saldo pendiente es de ${saldo}.` : "";
    if (focus) return `*FOCUS ÓPTICA | Retiro pendiente*\n\n${saludo}, tus lentes están listos para retirar en Shushufindi.${saldoNum > 0.004 ? ` El saldo pendiente es *${saldo}*.` : ""}\n\nIndícanos cuándo puedes pasar y prepararemos tu entrega.${contexto.ticketUrl ? `\n\nDetalle: ${contexto.ticketUrl}` : ""}`;
    return `Hola ${saludo} 👋, te saludamos de ${optica}.\n\nTus lentes están listos desde hace un tiempo y todavía te esperan${lugarDesdeSucursal(contexto.sucursal)}. 👓 Queremos que empieces a disfrutarlos y a ver mejor cuanto antes.${saldoLine}\n\nCuéntanos qué día puedes pasar por ellos y te los ajustamos al momento. ¡Te esperamos!${ticketLine(contexto.ticketUrl)}`;
  }
  // Cobro insistente: tono firme y respetuoso.
  const dias = diasVencidos(contexto.fechaCompra);
  const vencidoLine = contexto.fechaCompra && dias !== null
    ? ` desde tu compra del ${formatFecha(contexto.fechaCompra)} (hace ${dias} día${dias === 1 ? "" : "s"})`
    : "";
  if (focus) return `*FOCUS ÓPTICA | Saldo vencido*\n\n${saludo}, registramos un saldo pendiente de *${saldo}*${vencidoLine}. Necesitamos acordar contigo la fecha de pago.\n\nResponde a este mensaje o envíanos el comprobante si ya realizaste la transferencia. Quedamos atentos para actualizar tu cuenta.${contexto.ticketUrl ? `\n\nDetalle: ${contexto.ticketUrl}` : ""}`;
  return `Hola ${saludo}, te escribimos de ${optica}.\n\nTu cuenta mantiene un saldo vencido de ${saldo}${vencidoLine}. Necesitamos que regularices este pago a la brevedad.\n\nPor favor, acércate a la óptica o realiza hoy tu transferencia y envíanos el comprobante por este medio. Si ya pagaste, envíanos el comprobante para actualizar tu cuenta. Quedamos atentos a tu respuesta.${ticketLine(contexto.ticketUrl)}`;
}
