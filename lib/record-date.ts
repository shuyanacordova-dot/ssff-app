/** Date-only fields retain their calendar day; timestamps use Ecuador local time. */
export function formatRecordDate(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-05:00` : value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric",
  }).format(date);
}

export function fechaGuayaquil(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
