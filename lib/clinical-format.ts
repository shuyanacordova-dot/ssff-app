import type { Consultation } from "@/lib/clinical";

export type ComplementaryExam = { name: string; result: string };

export function complementaryExamsFrom(consultation: Consultation): ComplementaryExam[] {
  try {
    const parsed = JSON.parse(consultation.examen_binocular?.complementarios ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.name === "string" && typeof item.result === "string") : [];
  } catch { return []; }
}
