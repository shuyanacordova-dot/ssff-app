export type RxNumberKind = "esfera" | "cilindro" | "add" | "eje";

export function parseRxNumber(value: string): number | null {
  const text = value.trim().replace(/−/g, "-").replace(/,/g, ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function normalizeRxNumber(value: string, kind: RxNumberKind): string {
  const number = parseRxNumber(value);
  if (number === null) return "";
  if (kind === "eje") return String(Math.max(0, Math.min(180, Math.round(number))));
  const n = kind === "cilindro" ? -Math.abs(number) : kind === "add" ? (number === 0 ? 0 : Math.max(.75, Math.min(4, Math.abs(number)))) : number;
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
}

export function stepRxNumber(value: string, kind: RxNumberKind, direction: -1 | 1): string {
  const number = parseRxNumber(normalizeRxNumber(value, kind)) ?? 0;
  if (kind === "eje") return String((number + direction + 181) % 181);
  if (kind === "add") return normalizeRxNumber(String(Math.max(.75, Math.min(4, number + direction * .25))), kind);
  return normalizeRxNumber(String(kind === "cilindro" ? Math.min(0, number + direction * .25) : number + direction * .25), kind);
}
