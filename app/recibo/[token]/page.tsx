import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import PrintButton from "../print-button";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const formatDateOnly = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));

type Recibo = {
  paciente_nombre: string;
  empresa_nombre: string | null;
  sucursal_nombre: string | null;
  estado: string;
  items: { descripcion: string; cantidad: number; precio_unitario: number; total_linea: number }[];
  abonos: { fecha: string; monto: number; metodo: string }[];
  subtotal: number;
  descuento: number;
  total: number;
  pagado: number;
  saldo: number;
  fecha_entrega_estimada: string | null;
  creado_en: string;
};

export default async function ReciboPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!hasSupabaseConfiguration()) return <main className="login-page"><section className="glass login-card"><p className="eyebrow">SHUVISION OS</p><h1>Recibo no disponible</h1><p className="login-copy">Esta copia no tiene la conexión configurada.</p></section></main>;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("obtener_recibo_publico", { p_token: token });
  if (error || !data) return <main className="login-page"><section className="glass login-card"><p className="eyebrow">SHUVISION OS</p><h1>Recibo no encontrado</h1><p className="login-copy">Este enlace no es válido. Pide a la óptica que te comparta el recibo nuevamente.</p></section></main>;

  const recibo = data as Recibo;

  return <main className="login-page"><section className="glass login-card print-area" style={{ width: "min(560px, 100%)" }}>
    <p className="eyebrow">{recibo.empresa_nombre ?? "SHUVISION OS"}{recibo.sucursal_nombre ? ` · ${recibo.sucursal_nombre}` : ""}</p>
    <h1>Recibo de compra</h1>
    <p className="login-copy">Para: <strong>{recibo.paciente_nombre}</strong> · {formatDate(recibo.creado_en)}{recibo.estado === "anulada" && <span style={{ color: "#a24150", fontWeight: 800 }}> · Venta anulada</span>}</p>

    <p className="section-label" style={{ marginTop: 16 }}>DETALLE</p>
    <div className="task-list">{recibo.items.map((item, index) => <article className="task-card" key={index}><div className="task-status" /><div className="task-main"><h2 style={{ fontSize: 15 }}>{item.descripcion}</h2><p>Cantidad: {item.cantidad} · {money(item.precio_unitario)} c/u</p></div><div className="task-actions"><strong>{money(item.total_linea)}</strong></div></article>)}</div>

    <div className="consultation-stats" style={{ marginTop: 12 }}>
      <span><strong>Subtotal</strong>{money(recibo.subtotal)}</span>
      {recibo.descuento > 0 && <span><strong>Descuento</strong>{money(recibo.descuento)}</span>}
      <span><strong>Total</strong>{money(recibo.total)}</span>
      <span><strong>Abonado</strong>{money(recibo.pagado)}</span>
      <span><strong>Saldo pendiente</strong>{money(recibo.saldo)}</span>
    </div>

    {recibo.fecha_entrega_estimada && <p className="notice" style={{ marginTop: 14 }}>Fecha tentativa de entrega: <strong>{formatDateOnly(recibo.fecha_entrega_estimada)}</strong></p>}

    <p className="section-label" style={{ marginTop: 16 }}>HISTORIAL DE ABONOS</p>
    {recibo.abonos.length ? <div className="task-list">{recibo.abonos.map((abono, index) => <article className="task-card" key={index}><div className="task-status" /><div className="task-main"><p style={{ margin: 0 }}>{formatDate(abono.fecha)} · {abono.metodo}</p></div><div className="task-actions"><strong>{money(abono.monto)}</strong></div></article>)}</div> : <p className="login-copy">Todavía no se han registrado abonos.</p>}

    <p className="login-copy" style={{ marginTop: 16, fontSize: 12 }}>Este enlace siempre muestra el estado más reciente de tu compra; puedes volver a abrirlo cuando quieras.</p>
    <div className="modal-actions no-print" style={{ marginTop: 10 }}><PrintButton /></div>
  </section></main>;
}
