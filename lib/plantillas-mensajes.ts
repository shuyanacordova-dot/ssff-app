// Plantillas de WhatsApp configurables por Shuyana. El texto usa marcadores legibles ({{nombre}}, {{saldo}}…);
// Meta exige {{1}}, {{2}}…, así que al enviar se convierten y "variables" guarda el orden.

export type TipoPlantilla = "cumpleanos" | "control_anual" | "control_periodico" | "cobro" | "cobro_insistente" | "cobro_apartado";
export type PlantillaMensaje = { id: string; empresa_id: string; tipo: TipoPlantilla; nombre_meta: string; categoria: "MARKETING" | "UTILITY"; texto: string; variables: string[]; imagen: string | null; estado: string; motivo_rechazo: string | null; activa: boolean; creado_en: string };

export const SHUVISION_ID = "51820b6b-9fc1-495c-b2ea-ab50547e2ce3";
export const FOCUS_ID = "be1dc246-219a-40a2-9e92-707e5845d295";

export const tiposPlantilla: Array<{ tipo: TipoPlantilla; nombre: string; marcadores: string[]; categoria: "MARKETING" | "UTILITY" }> = [
  { tipo: "cumpleanos", nombre: "Cumpleaños", marcadores: ["nombre", "optica"], categoria: "MARKETING" },
  { tipo: "control_anual", nombre: "Control anual", marcadores: ["nombre", "optica"], categoria: "MARKETING" },
  { tipo: "control_periodico", nombre: "Control de 3 / 6 meses", marcadores: ["nombre", "optica", "meses"], categoria: "UTILITY" },
  { tipo: "cobro", nombre: "Recordatorio de cobro", marcadores: ["nombre", "optica", "saldo", "fecha"], categoria: "UTILITY" },
  { tipo: "cobro_insistente", nombre: "Cobro insistente", marcadores: ["nombre", "optica", "saldo"], categoria: "UTILITY" },
  { tipo: "cobro_apartado", nombre: "Apartado", marcadores: ["nombre", "optica", "saldo"], categoria: "UTILITY" },
];

export const marcadorLabel: Record<string, string> = { nombre: "Primer nombre", optica: "Nombre de la óptica", meses: "Meses del control", saldo: "Saldo (solo el número)", fecha: "Fecha de pago" };
export const ejemploValores: Record<string, string> = { nombre: "María", optica: "ShuVision Óptica", meses: "6", saldo: "45.00", fecha: "15/10/2026" };

const RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

// Reemplaza {{nombre}}, {{saldo}}… con los valores reales (para el envío con un toque y la vista previa).
export const renderPlantilla = (texto: string, valores: Record<string, string>) => texto.replace(RE, (_, k: string) => valores[k] ?? "");

// Convierte al formato de Meta: {{nombre}} -> {{1}}; un marcador repetido usa el mismo número.
export function aFormatoMeta(texto: string) {
  const variables: string[] = [];
  const text = texto.replace(RE, (_, k: string) => { let i = variables.indexOf(k); if (i < 0) { variables.push(k); i = variables.length - 1; } return `{{${i + 1}}}`; });
  return { text, variables };
}

export function validarPlantilla(texto: string, tipo: TipoPlantilla): string | null {
  const permitidos = tiposPlantilla.find((t) => t.tipo === tipo)?.marcadores ?? [];
  const t = texto.trim();
  if (t.length < 20) return "El mensaje es muy corto.";
  if (t.length > 1000) return "El mensaje no puede pasar de 1000 caracteres.";
  for (const m of t.matchAll(RE)) if (!permitidos.includes(m[1])) return `El marcador {{${m[1]}}} no se puede usar en este tipo de mensaje. Usa: ${permitidos.map((p) => `{{${p}}}`).join(", ")}.`;
  if (/^\{\{/.test(t) || /\}\}$/.test(t)) return "Meta no acepta mensajes que empiecen o terminen con un marcador. Agrega texto antes o después.";
  if (/\}\}\s*\{\{/.test(t)) return "Meta no acepta dos marcadores seguidos. Separa con texto.";
  return null;
}

// Plantillas que ya existían en Meta (de la época de Make y las creadas por Claude), para importarlas.
export const plantillasConocidas: Array<{ nombre: string; empresas: string[]; tipo: TipoPlantilla; variables: string[]; imagen?: string }> = [
  { nombre: "feliz_cumpleanos", empresas: [SHUVISION_ID], tipo: "cumpleanos", variables: ["nombre"], imagen: "https://res.cloudinary.com/ip1jz9eg/image/upload/v1787675996/ChatGPT_Image_23_ago_2026_23_43_46.png" },
  { nombre: "recordatorio_control_anual", empresas: [SHUVISION_ID], tipo: "control_anual", variables: ["nombre"], imagen: "https://res.cloudinary.com/ip1jz9eg/image/upload/v1787676005/ChatGPT_Image_23_ago_2026_23_53_31.png" },
  { nombre: "recordatorio_control_periodico", empresas: [SHUVISION_ID, FOCUS_ID], tipo: "control_periodico", variables: ["nombre", "optica", "meses"] },
  { nombre: "recordatorio_cobro", empresas: [SHUVISION_ID], tipo: "cobro", variables: ["nombre", "saldo", "fecha"] },
  { nombre: "cobranza_insistente", empresas: [SHUVISION_ID], tipo: "cobro_insistente", variables: ["nombre"] },
  { nombre: "sistema_apartado_recordatorio", empresas: [SHUVISION_ID], tipo: "cobro_apartado", variables: ["nombre"] },
  { nombre: "feliz_cumpleanos_focus2", empresas: [FOCUS_ID], tipo: "cumpleanos", variables: ["nombre"] },
  { nombre: "recordatorio_control_anual_focus2", empresas: [FOCUS_ID], tipo: "control_anual", variables: ["nombre"] },
  { nombre: "recordatorio_cobro_focus", empresas: [FOCUS_ID], tipo: "cobro", variables: ["nombre", "saldo", "fecha"] },
  { nombre: "cobranza_insistente_focus", empresas: [FOCUS_ID], tipo: "cobro_insistente", variables: ["nombre"] },
  { nombre: "apartado_recordatorio_focus", empresas: [FOCUS_ID], tipo: "cobro_apartado", variables: ["nombre"] },
];

// Texto de Meta ({{1}}…) a texto legible ({{nombre}}…).
export const desdeFormatoMeta = (texto: string, variables: string[]) => texto.replace(/\{\{(\d+)\}\}/g, (_, n: string) => `{{${variables[Number(n) - 1] ?? n}}}`);
