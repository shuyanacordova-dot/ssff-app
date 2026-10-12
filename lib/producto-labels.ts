// Etiquetas para mostrar lunas y armazones de forma legible (sin código de servidor: se usa en pantallas).
type ProductoDetalle = { categoria: string; diseno?: string | null; linea?: string | null; material?: string | null; indice?: number | string | null; tecnologia?: string | null; marca?: string | null; modelo?: string | null; color?: string | null; codigo_barra?: string | null; clasificacion?: string | null };

const capitalizar = (value?: string | null) => { const v = value?.trim(); if (!v) return ""; const l = v.toLowerCase(); return l.charAt(0).toUpperCase() + l.slice(1); };
const indiceTexto = (indice?: number | string | null) => { if (indice === null || indice === undefined || indice === "") return ""; const n = Number(indice); return Number.isFinite(n) ? n.toFixed(2) : String(indice); };

// Material con su índice: "CR39 1.49", "Policarbonato 1.59", "Reducción 1.67".
export const materialConIndice = (p: ProductoDetalle) => [p.material?.trim(), indiceTexto(p.indice)].filter(Boolean).join(" ");

// Pastillas de detalle: luna = tipo · línea · material e índice; armazón = marca · modelo · color · código.
export const detallesProducto = (p: ProductoDetalle): string[] => {
  if (p.categoria === "lente") return [capitalizar(p.diseno), capitalizar(p.linea), materialConIndice(p)].filter(Boolean);
  if (p.categoria === "montura" || p.categoria === "gafas_sol") return [p.marca?.trim(), capitalizar(p.modelo), p.color?.trim(), p.codigo_barra ? `Código ${p.codigo_barra}` : ""].filter((v): v is string => !!v);
  return [];
};

// Texto extra para buscar (tipo, línea, material, índice, tecnología, marca, modelo, color, código).
export const textoBusquedaProducto = (p: ProductoDetalle) => [p.diseno, p.linea, p.material, indiceTexto(p.indice), p.tecnologia, p.marca, p.modelo, p.color, p.codigo_barra, p.clasificacion].filter(Boolean).join(" ");
