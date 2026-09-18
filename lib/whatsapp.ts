export function numeroWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("593")) return digits;
  if (digits.startsWith("0")) return `593${digits.slice(1)}`;
  if (digits.startsWith("9")) return `593${digits}`;
  return digits;
}

export function enlaceWhatsapp(raw: string | null | undefined, mensaje: string): string | null {
  const numero = numeroWhatsapp(raw);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
