// Cálculos de "Mis deudas" (sin código de servidor: se usan en la pantalla).
export type TipoDeuda = "proveedor" | "prestamo_banco" | "tarjeta" | "prestamo_personal" | "gasto_fijo";
export type ModalidadDeuda = "cuotas" | "libre" | "mensual";
export type DebtPayment = { id: string; monto: number; fecha_pago: string; metodo: string; referencia: string | null; notas: string | null; periodo: string | null };
export type BusinessDebt = {
  id: string; empresa_id: string | null; sucursal_id: string | null; proveedor: string; concepto: string;
  monto_original: number; saldo: number; fecha_deuda: string; fecha_vencimiento: string | null;
  estado: "pendiente" | "pagada" | "anulada"; notas: string | null;
  tipo: TipoDeuda; modalidad: ModalidadDeuda; cuotas_total: number | null; cuotas_previas: number; monto_cuota: number | null;
  dia_pago: number | null; fecha_inicio: string | null; ambito: string;
  pagos_deuda_negocio: DebtPayment[];
};

export const tipos: Record<TipoDeuda, { label: string; plural: string; color: string; fondo: string; modalidad: ModalidadDeuda; ayuda: string }> = {
  proveedor: { label: "Proveedor", plural: "Proveedores", color: "#1f7a70", fondo: "#e2f4f1", modalidad: "libre", ayuda: "Laboratorios, armazones, lunas, mercadería a crédito." },
  prestamo_banco: { label: "Préstamo bancario", plural: "Préstamos", color: "#274c77", fondo: "#e6eef8", modalidad: "cuotas", ayuda: "Préstamos con cuota mensual fija." },
  tarjeta: { label: "Tarjeta de crédito", plural: "Tarjetas", color: "#7a3fa0", fondo: "#f1e8f8", modalidad: "cuotas", ayuda: "Compras diferidas o saldo de tarjeta." },
  prestamo_personal: { label: "Préstamo personal", plural: "Personales", color: "#b5651d", fondo: "#fbeee2", modalidad: "libre", ayuda: "Dinero prestado por familia o personas." },
  gasto_fijo: { label: "Gasto fijo", plural: "Gastos fijos", color: "#a24150", fondo: "#fbe7ea", modalidad: "mensual", ayuda: "Arriendo, internet, luz, agua: se pagan cada mes." },
};
export const modalidades: Record<ModalidadDeuda, string> = { cuotas: "Cuotas fijas", libre: "Abonos libres", mensual: "Pago mensual fijo" };

export const money = (n: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(n) || 0);
export const hoyEcuador = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const mesDe = (fecha: string) => fecha.slice(0, 7); // "YYYY-MM"
export const sumarMeses = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
export const mesesEntre = (desde: string, hasta: string) => { const [a, b] = desde.split("-").map(Number); const [c, d] = hasta.split("-").map(Number); return (c - a) * 12 + (d - b); };
export const nombreMes = (ym: string) => new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T12:00:00Z`));
export const fechaCorta = (fecha: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${fecha}T12:00:00Z`));
export const diaDelMes = (ym: string, dia: number) => { const [y, m] = ym.split("-").map(Number); const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${ym}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`; };

const periodosPagados = (d: BusinessDebt) => new Set(d.pagos_deuda_negocio.map((p) => (p.periodo ?? p.fecha_pago).slice(0, 7)));
export const pagadoEnMes = (d: BusinessDebt, ym: string) => periodosPagados(d).has(ym);
export const pagosDelMes = (d: BusinessDebt, ym: string) => d.pagos_deuda_negocio.filter((p) => (p.periodo ?? p.fecha_pago).slice(0, 7) === ym);

export function cuotasPagadas(d: BusinessDebt) {
  if (d.modalidad !== "cuotas") return 0;
  const total = d.cuotas_total ?? 0;
  return Math.min(total, d.cuotas_previas + periodosPagados(d).size);
}

// Avance de 0 a 1 para la barra de progreso.
export function avance(d: BusinessDebt) {
  if (d.modalidad === "cuotas" && d.cuotas_total) return cuotasPagadas(d) / d.cuotas_total;
  if (d.modalidad === "libre" && d.monto_original > 0) return Math.max(0, Math.min(1, (d.monto_original - d.saldo) / d.monto_original));
  return 0;
}

export type EstadoItem = "pagado" | "vencido" | "hoy" | "proximo";
export type ItemMes = { deuda: BusinessDebt; fecha: string; monto: number; etiqueta: string; estado: EstadoItem; periodo: string };

const estadoPara = (fecha: string, pagado: boolean, hoy: string): EstadoItem => pagado ? "pagado" : fecha < hoy ? "vencido" : fecha === hoy ? "hoy" : "proximo";

// Pagos que tocan en el mes elegido (cuotas, gastos fijos y abonos libres con fecha límite en ese mes).
export function itemsDelMes(deudas: BusinessDebt[], ym: string, hoy = hoyEcuador()): ItemMes[] {
  const items: ItemMes[] = [];
  for (const d of deudas) {
    if (d.estado === "anulada") continue;
    if (d.modalidad === "cuotas" && d.fecha_inicio && d.cuotas_total && d.monto_cuota) {
      const idx = mesesEntre(mesDe(d.fecha_inicio), ym);
      if (idx < 0 || idx >= d.cuotas_total) continue;
      const pagada = idx < d.cuotas_previas || pagadoEnMes(d, ym);
      if (d.estado === "pagada" && !pagada) continue;
      const fecha = diaDelMes(ym, d.dia_pago ?? Number(d.fecha_inicio.slice(8, 10)));
      items.push({ deuda: d, fecha, monto: Number(d.monto_cuota), etiqueta: `Cuota ${idx + 1} de ${d.cuotas_total}`, estado: estadoPara(fecha, pagada, hoy), periodo: ym });
    } else if (d.modalidad === "mensual" && d.monto_cuota) {
      if (d.fecha_inicio && mesDe(d.fecha_inicio) > ym) continue;
      const fecha = diaDelMes(ym, d.dia_pago ?? 1);
      items.push({ deuda: d, fecha, monto: Number(d.monto_cuota), etiqueta: "Pago mensual", estado: estadoPara(fecha, pagadoEnMes(d, ym), hoy), periodo: ym });
    } else if (d.modalidad === "libre" && d.fecha_vencimiento && mesDe(d.fecha_vencimiento) === ym) {
      const pagada = d.estado === "pagada";
      items.push({ deuda: d, fecha: d.fecha_vencimiento, monto: pagada ? d.monto_original : Number(d.saldo), etiqueta: pagada ? "Pagada" : "Fecha límite", estado: estadoPara(d.fecha_vencimiento, pagada, hoy), periodo: ym });
    }
  }
  return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Lo que quedó sin pagar de meses anteriores al elegido (cuotas y gastos fijos atrasados, abonos libres vencidos).
export function atrasadas(deudas: BusinessDebt[], ym: string, hoy = hoyEcuador()): ItemMes[] {
  // Meses anteriores al que se está viendo cuya fecha de pago ya pasó (respecto de hoy) y siguen sin pagar.
  const items: ItemMes[] = [];
  for (const d of deudas) {
    if (d.estado !== "pendiente") continue;
    if (d.modalidad === "cuotas" && d.fecha_inicio && d.cuotas_total && d.monto_cuota) {
      const inicio = mesDe(d.fecha_inicio);
      for (let i = Math.max(0, d.cuotas_previas); i < d.cuotas_total; i++) {
        const mes = sumarMeses(inicio, i);
        if (mes >= ym) break;
        if (diaDelMes(mes, d.dia_pago ?? 1) < hoy && !pagadoEnMes(d, mes)) items.push({ deuda: d, fecha: diaDelMes(mes, d.dia_pago ?? 1), monto: Number(d.monto_cuota), etiqueta: `Cuota ${i + 1} de ${d.cuotas_total}`, estado: "vencido", periodo: mes });
      }
    } else if (d.modalidad === "mensual" && d.monto_cuota && d.fecha_inicio) {
      for (let mes = mesDe(d.fecha_inicio); mes < ym; mes = sumarMeses(mes, 1)) {
        if (diaDelMes(mes, d.dia_pago ?? 1) < hoy && !pagadoEnMes(d, mes)) items.push({ deuda: d, fecha: diaDelMes(mes, d.dia_pago ?? 1), monto: Number(d.monto_cuota), etiqueta: "Pago mensual", estado: "vencido", periodo: mes });
      }
    } else if (d.modalidad === "libre" && d.fecha_vencimiento && mesDe(d.fecha_vencimiento) < ym && d.fecha_vencimiento < hoy) {
      items.push({ deuda: d, fecha: d.fecha_vencimiento, monto: Number(d.saldo), etiqueta: "Fecha límite vencida", estado: "vencido", periodo: mesDe(d.fecha_vencimiento) });
    }
  }
  return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function proximoPago(d: BusinessDebt, hoy = hoyEcuador()): { fecha: string; monto: number } | null {
  if (d.estado !== "pendiente") return null;
  if (d.modalidad === "libre") return d.fecha_vencimiento ? { fecha: d.fecha_vencimiento, monto: Number(d.saldo) } : null;
  if (!d.monto_cuota) return null;
  let mes = d.modalidad === "cuotas" && d.fecha_inicio ? mesDe(d.fecha_inicio) : mesDe(hoy);
  for (let i = 0; i < 600; i++, mes = sumarMeses(mes, 1)) {
    if (d.modalidad === "cuotas" && d.fecha_inicio && d.cuotas_total) {
      const idx = mesesEntre(mesDe(d.fecha_inicio), mes);
      if (idx >= d.cuotas_total) return null;
      if (idx < d.cuotas_previas) continue;
    }
    if (!pagadoEnMes(d, mes)) return { fecha: diaDelMes(mes, d.dia_pago ?? 1), monto: Number(d.monto_cuota) };
  }
  return null;
}
