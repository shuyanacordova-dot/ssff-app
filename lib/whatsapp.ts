export function numeroWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("593")) return digits;
  if (digits.startsWith("0")) return `593${digits.slice(1)}`;
  if (digits.startsWith("9")) return `593${digits}`;
  return digits;
}

// Algunos teléfonos muestran emojis como el carácter de sustitución (�) al abrir wa.me.
// Conservamos acentos, cifras y saltos de línea; quitamos solo pictogramas y marcas de emoji.
export function textoSeguroWhatsapp(mensaje: string): string {
  return mensaje
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\uFFFD]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,!?;:])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function enlaceWhatsapp(raw: string | null | undefined, mensaje: string): string | null {
  const numero = numeroWhatsapp(raw);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(textoSeguroWhatsapp(mensaje))}`;
}

// Enlace para que una persona elija a quién enviar el mensaje (sin número de destino).
export function enlaceCompartirWhatsapp(mensaje: string): string {
  return `https://wa.me/?text=${encodeURIComponent(textoSeguroWhatsapp(mensaje))}`;
}
