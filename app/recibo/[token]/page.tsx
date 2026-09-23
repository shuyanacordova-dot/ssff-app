import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import Letterhead from "../../print-letterhead";
import PrintButton from "../print-button";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const formatDateOnly = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));

type Recibo = {
  paciente_nombre: string;
  paciente_telefono: string | null;
  empresa_nombre: string | null;
  empresa_direccion: string | null;
  empresa_telefono: string | null;
  empresa_email: string | null;
  empresa_logo_url: string | null;
  sucursal_nombre: string | null;
  folio: number | null;
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

  if (!hasSupabaseConfiguration()) return <main className="login-page"><section className="glass login-card"><p className="eyebrow">LUMOS</p><h1>Recibo no disponible</h1><p className="login-copy">Esta copia no tiene la conexión configurada.</p></section></main>;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("obtener_recibo_publico", { p_token: token });
  if (error || !data) return <main className="login-page"><section className="glass login-card"><p className="eyebrow">LUMOS</p><h1>Recibo no encontrado</h1><p className="login-copy">Este enlace no es válido. Pide a la óptica que te comparta el recibo nuevamente.</p></section></main>;

  const recibo = data as Recibo;
  const company = { nombre: recibo.empresa_nombre ?? "LUMOS", direccion: recibo.empresa_direccion, telefono: recibo.empresa_telefono, email: recibo.empresa_email, logo_url: recibo.empresa_logo_url };

  return <main className="login-page"><section className="glass login-card print-area print-ticket" style={{ width: "min(400px, 100%)" }}>
    <Letterhead company={company} subtitle={recibo.sucursal_nombre ?? undefined} />
    <p className="print-center" style={{ fontWeight: 800, fontSize: 15, margin: "6px 0" }}>Recibo virtual</p>
    <div className="print-dashed" />

    <p className="print-center" style={{ fontWeight: 800, margin: 0 }}>{recibo.paciente_nombre}</p>
    {recibo.paciente_telefono && <p className="print-center field-hint" style={{ margin: "2px 0" }}>{recibo.paciente_telefono}</p>}
    <p className="print-center field-hint" style={{ margin: "2px 0" }}>{formatDate(recibo.creado_en)}{recibo.estado === "anulada" && <span style={{ color: "#a24150", fontWeight: 800 }}> · Venta anulada</span>}</p>
    <div className="print-dashed" />

    <p className="section-label">DETALLE</p>
    {recibo.items.map((item, index) => <p key={index} style={{ margin: "4px 0", fontSize: 13 }}>{item.descripcion} (${item.precio_unitario.toFixed(2)} x{item.cantidad}) <strong style={{ float: "right" }}>{money(item.total_linea)}</strong></p>)}
    <div className="print-dashed" />

    <p style={{ margin: "3px 0" }}>Total <strong style={{ float: "right" }}>{money(recibo.total)}</strong></p>
    {recibo.descuento > 0 && <p style={{ margin: "3px 0" }}>Descuento <strong style={{ float: "right" }}>{money(recibo.descuento)}</strong></p>}
    <p style={{ margin: "3px 0" }}>A cuenta <strong style={{ float: "right" }}>{money(recibo.pagado)}</strong></p>
    <p style={{ margin: "3px 0" }}>Saldo actual <strong style={{ float: "right" }}>{money(recibo.saldo)}</strong></p>
    <div className="print-dashed" />

    <p className="section-label">DETALLE DE ABONOS</p>
    {recibo.abonos.length ? recibo.abonos.map((abono, index) => <p key={index} style={{ margin: "4px 0", fontSize: 13 }}>{formatDate(abono.fecha)} · {abono.metodo} <strong style={{ float: "right" }}>{money(abono.monto)}</strong></p>) : <p className="field-hint">Todavía no se han registrado abonos.</p>}
    <div className="print-dashed" />

    {recibo.fecha_entrega_estimada && <p style={{ margin: "3px 0" }}>Entrega tentativa <strong style={{ float: "right" }}>{formatDateOnly(recibo.fecha_entrega_estimada)}</strong></p>}
    {recibo.folio != null && <p style={{ margin: "3px 0" }}>Folio de la venta <strong style={{ float: "right" }}>#{recibo.folio}</strong></p>}
    <div className="print-dashed" />

    <p className="print-center field-hint" style={{ fontSize: 11, lineHeight: 1.5 }}>Cuidemos el medio ambiente. Este recibo siempre muestra el estado más reciente de tu compra; puedes volver a abrirlo cuando quieras.</p>
    <div className="modal-actions no-print" style={{ marginTop: 10, justifyContent: "center" }}><PrintButton /></div>
  </section></main>;
}
