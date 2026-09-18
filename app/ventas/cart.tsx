"use client";
import { useMemo, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { registrarVenta } from "./actions";
import { crearAcuerdoPago, crearEmpresaConvenio, type AcuerdoPago } from "./convenio-actions";
import AcuerdoPagoView from "./acuerdo-pago-view";
import type { EmpresaConvenio, PaymentMethod, SaleBranch, SaleCompany, SalePatient, SaleProduct, SaleStock } from "@/lib/ventas";

type CartItem = { producto_id: string; cantidad: number; descuento: number };
type CartPayment = { metodo: PaymentMethod; monto: string; referencia: string; banco: string };
type Modo = "" | "rapida" | "lentes";
const methods: { value: PaymentMethod; label: string }[] = [{ value: "efectivo", label: "Efectivo" }, { value: "transferencia", label: "Transferencia" }, { value: "tarjeta", label: "Tarjeta" }, { value: "credito", label: "Crédito" }, { value: "otro", label: "Otro" }];
const bancos = [{ value: "pichincha", label: "Banco Pichincha" }, { value: "guayaquil", label: "Banco Guayaquil" }, { value: "internacional", label: "Banco Internacional" }, { value: "otro", label: "Otro banco" }];
const money = (n: number) => `$${n.toFixed(2)}`;
const primeraCuotaFecha = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(1); return d; };
const formatFecha = (d: Date) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "long", year: "numeric" }).format(d);

export default function Cart({ products, stock, companies, branches, patients, empresasConvenio, defaultCompany, defaultBranch, defaultPacienteId, lockPatient, onDone }: { products: SaleProduct[]; stock: SaleStock[]; companies: SaleCompany[]; branches: SaleBranch[]; patients: SalePatient[]; empresasConvenio: EmpresaConvenio[]; defaultCompany: string; defaultBranch: string; defaultPacienteId?: string; lockPatient?: boolean; onDone: (message: string) => void }) {
  const [modo, setModo] = useState<Modo>("");
  const [company, setCompany] = useState(defaultCompany); const [branch, setBranch] = useState(defaultBranch); const [cliente, setCliente] = useState(""); const [pacienteId, setPacienteId] = useState(defaultPacienteId ?? "");
  const [items, setItems] = useState<CartItem[]>([]); const [payments, setPayments] = useState<CartPayment[]>([]);
  const [notice, setNotice] = useState(""); const [pending, start] = useTransition();
  const [convenioActivo, setConvenioActivo] = useState(false);
  const [convenios, setConvenios] = useState(empresasConvenio);
  const [empresaConvenioId, setEmpresaConvenioId] = useState("");
  const [cuotas, setCuotas] = useState("3");
  const [showNuevaConvenio, setShowNuevaConvenio] = useState(false);
  const [nuevaConvenioNombre, setNuevaConvenioNombre] = useState("");
  const [acuerdo, setAcuerdo] = useState<AcuerdoPago | null>(null);
  const [buscando, setBuscando] = useState<"" | "montura" | "lunas">("");

  const stockFor = (productoId: string, sucursalId: string) => stock.find((s) => s.producto_id === productoId && s.sucursal_id === sucursalId)?.cantidad ?? 0;
  const branchesForCompany = branches.filter((b) => b.empresa_id === company);
  const empresaProducts = products.filter((p) => p.empresa_id === company);
  const stockOk = (p: SaleProduct) => { if ((p.categoria !== "montura" && p.categoria !== "gafas_sol") || !p.controla_inventario || !branch) return true; return stockFor(p.id, branch) > 0; };
  const availableRapida = empresaProducts.filter((p) => p.categoria !== "montura" && p.categoria !== "lente").filter(stockOk);
  const availableArmazon = empresaProducts.filter((p) => p.categoria === "montura").filter(stockOk);
  const availableLunas = empresaProducts.filter((p) => p.categoria === "lente");
  const available = modo === "lentes" ? [...availableArmazon, ...availableLunas] : availableRapida;

  const lineTotal = (item: CartItem) => Math.max(0, item.cantidad * Number(available.find((p) => p.id === item.producto_id)?.precio_venta || 0) - item.descuento);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + lineTotal(item), 0), [items, available]);
  const paidTotal = useMemo(() => payments.reduce((sum, payment) => sum + (Number(payment.monto) || 0), 0), [payments]);
  const saldo = Math.max(0, subtotal - paidTotal);

  const elegirModo = (value: Modo) => { setModo(value); setItems([]); };
  const resetCompany = (value: string) => { setCompany(value); setBranch(""); setItems([]); };
  const addProduct = (id: string) => { if (id && !items.some((item) => item.producto_id === id)) setItems([...items, { producto_id: id, cantidad: 1, descuento: 0 }]); };
  const updateItem = (id: string, patch: Partial<CartItem>) => setItems(items.map((item) => item.producto_id === id ? { ...item, ...patch } : item));
  const addPayment = () => setPayments([...payments, { metodo: "efectivo", monto: "", referencia: "", banco: "" }]);
  const updatePayment = (index: number, patch: Partial<CartPayment>) => setPayments(payments.map((payment, i) => i === index ? { ...payment, ...patch } : payment));
  const removePayment = (index: number) => setPayments(payments.filter((_, i) => i !== index));

  const resetAll = () => { setItems([]); setPayments([]); setCliente(""); setPacienteId(defaultPacienteId ?? ""); setConvenioActivo(false); setEmpresaConvenioId(""); setCuotas("3"); setModo(""); };

  const crearConvenio = () => start(async () => {
    try { const id = await crearEmpresaConvenio(nuevaConvenioNombre); setConvenios((list) => [...list, { id, nombre: nuevaConvenioNombre.trim() }]); setEmpresaConvenioId(id); setShowNuevaConvenio(false); setNuevaConvenioNombre(""); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo crear la empresa."); }
  });

  const submit = (form: HTMLFormElement) => {
    if (paidTotal > subtotal + 0.0001) { setNotice("Los abonos no pueden superar el total de la venta."); return; }
    if (convenioActivo && (!empresaConvenioId || !Number(cuotas))) { setNotice("Elige la empresa del convenio y el número de cuotas."); return; }
    start(async () => {
      const data = new FormData(form);
      data.set("items", JSON.stringify(items.map((item) => ({ producto_id: item.producto_id, cantidad: item.cantidad, descuento: item.descuento }))));
      data.set("pagos", JSON.stringify(payments.filter((p) => Number(p.monto) > 0).map((p) => ({ metodo: p.metodo, monto: Number(p.monto), referencia: p.referencia || null, banco: p.banco || null }))));
      try {
        const ventaId = await registrarVenta(data);
        if (convenioActivo) {
          const result = await crearAcuerdoPago(ventaId, empresaConvenioId, Number(cuotas));
          setAcuerdo(result); setNotice(""); onDone("Venta registrada y acuerdo de pago firmado.");
        } else {
          const message = paidTotal + 0.0001 < subtotal ? `Venta registrada con saldo pendiente de ${money(subtotal - paidTotal)}.` : "Venta registrada y cobrada.";
          setNotice(message); onDone(message); resetAll();
        }
      } catch (err) { const message = err instanceof Error ? err.message : "No se pudo registrar la venta."; setNotice(message); }
    });
  };

  if (acuerdo) return <AcuerdoPagoView acuerdo={acuerdo} onClose={() => { setAcuerdo(null); resetAll(); }} />;

  if (!modo) return <section className="glass agenda-board" style={{ marginBottom: 18 }}><p className="section-label">NUEVA VENTA</p><h2>¿Qué tipo de venta es?</h2>
    <div className="sale-mode-grid">
      <button type="button" className="sale-mode-card" onClick={() => elegirModo("rapida")}><strong>Venta rápida</strong><span>Accesorios, gafas de sol y exámenes</span></button>
      <button type="button" className="sale-mode-card" onClick={() => elegirModo("lentes")}><strong>Lentes</strong><span>Armazón y lunas para una fórmula</span></button>
    </div>
  </section>;

  return <section className="glass agenda-board" style={{ marginBottom: 18 }}><p className="section-label">NUEVA VENTA · {modo === "rapida" ? "VENTA RÁPIDA" : "LENTES"}</p><h2>Carrito y cobro</h2>
    <button type="button" className="text-action" onClick={() => elegirModo("")}>← Cambiar tipo de venta</button>
    <form onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
      <div className="new-patient-form" style={{ marginTop: 10 }}>
        <label>Empresa<select name="empresa_id" value={company} onChange={(event) => resetCompany(event.target.value)}>{companies.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Sucursal<select key={company} name="sucursal_id" value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">Sin sucursal específica</option>{branchesForCompany.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        {lockPatient ? <label>Paciente<input value={patients[0] ? `${patients[0].apellidos}, ${patients[0].nombres}` : ""} disabled /><input type="hidden" name="paciente_id" value={pacienteId} /></label> : <label>Paciente<select name="paciente_id" value={pacienteId} onChange={(event) => setPacienteId(event.target.value)}><option value="">Sin paciente (cliente ocasional)</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.apellidos}, {patient.nombres}{patient.cedula ? ` · ${patient.cedula}` : ""}</option>)}</select></label>}
        <label>Cliente<input name="cliente_nombre" placeholder="Opcional" value={pacienteId ? "" : cliente} disabled={!!pacienteId} onChange={(event) => setCliente(event.target.value)} /></label>
        {modo === "rapida" && <label>Agregar producto<select defaultValue="" onChange={(event) => { addProduct(event.target.value); event.currentTarget.value = ""; }}><option value="">Selecciona un producto</option>{availableRapida.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {money(Number(p.precio_venta))}</option>)}</select></label>}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button type="button" className="outline-action" onClick={() => setBuscando("montura")}><Search size={15} /> Buscar montura</button>
        <button type="button" className="outline-action" onClick={() => setBuscando("lunas")}><Search size={15} /> Buscar lunas</button>
      </div>
      <div className="task-list">{items.map((item) => { const product = available.find((p) => p.id === item.producto_id); if (!product) return null; return <article className="task-card" key={item.producto_id}><div className="task-status" /><div className="task-main"><h2>{product.nombre}</h2><div className="task-meta"><span>{money(Number(product.precio_venta))} c/u</span><label>Cant. <input type="number" min={1} step={1} value={item.cantidad} onChange={(event) => updateItem(item.producto_id, { cantidad: Math.max(1, Number(event.target.value) || 1) })} style={{ width: 52 }} /></label><label>Desc. $<input type="number" min={0} step={0.01} value={item.descuento} onChange={(event) => updateItem(item.producto_id, { descuento: Math.max(0, Number(event.target.value) || 0) })} style={{ width: 68 }} /></label></div><p>Subtotal línea: {money(lineTotal(item))}</p></div><div className="task-actions"><button type="button" className="outline-action" onClick={() => setItems(items.filter((x) => x.producto_id !== item.producto_id))}>Quitar</button></div></article>; })}</div>
      <p className="subtitle">Total: <strong>{money(subtotal)}</strong></p>
      <div className="notice"><span>Abonos ({money(paidTotal)}) — saldo que quedará pendiente: <strong>{money(saldo)}</strong></span><button type="button" className="outline-action" onClick={addPayment} disabled={!items.length}>Agregar abono</button></div>
      {payments.map((payment, index) => <div className="new-patient-form" key={index}><label>Método<select value={payment.metodo} onChange={(event) => updatePayment(index, { metodo: event.target.value as PaymentMethod, banco: event.target.value === "transferencia" ? payment.banco : "" })}>{methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label><label>Monto<input type="number" min={0} step={0.01} value={payment.monto} onChange={(event) => updatePayment(index, { monto: event.target.value })} /></label><label>Referencia<input value={payment.referencia} onChange={(event) => updatePayment(index, { referencia: event.target.value })} placeholder="Opcional" /></label>{payment.metodo === "transferencia" && <label>Banco<select value={payment.banco} onChange={(event) => updatePayment(index, { banco: event.target.value })}><option value="">Selecciona el banco</option>{bancos.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</select></label>}<button type="button" className="outline-action" onClick={() => removePayment(index)}>Quitar abono</button></div>)}

      <div className="receta-option" style={{ marginTop: 12 }}>
        <label className="receta-option-header"><input type="checkbox" checked={convenioActivo} onChange={(event) => setConvenioActivo(event.target.checked)} /> Convenio por descuento a rol de pagos</label>
        {convenioActivo && <div className="receta-option-body">
          <div className="new-patient-form">
            <label>Empresa<span style={{ display: "flex", gap: 6 }}><select value={empresaConvenioId} onChange={(event) => setEmpresaConvenioId(event.target.value)} style={{ flex: 1 }}><option value="">Selecciona la empresa</option>{convenios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select><button type="button" className="outline-action" onClick={() => setShowNuevaConvenio(true)}>+</button></span></label>
            <label>Cantidad de cuotas<input type="number" min={1} step={1} value={cuotas} onChange={(event) => setCuotas(event.target.value)} /></label>
          </div>
          <p className="field-hint">Primera cuota posible: <strong>{formatFecha(primeraCuotaFecha())}</strong> (primer día del mes siguiente).</p>
        </div>}
      </div>

      <p className="notice">{notice || (convenioActivo ? "Al firmar se genera el acuerdo de pago con el descuento por rol de pagos." : (payments.length ? "Si los abonos no cubren el total, la venta queda con saldo pendiente para abonar después." : "Sin abonos registrados, la venta se cerrará con saldo pendiente por el total."))}</p>
      <button disabled={!items.length || pending} className="new-consultation" type="submit">{pending ? "Guardando…" : convenioActivo ? "Firmar acuerdo de pago" : "Cerrar venta"}</button>
    </form>
    {showNuevaConvenio && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true"><p className="section-label">NUEVA EMPRESA DE CONVENIO</p><h2>Agregar empresa</h2><div className="new-patient-form"><label className="task-description">Nombre<input value={nuevaConvenioNombre} onChange={(event) => setNuevaConvenioNombre(event.target.value)} placeholder="Ej.: Municipio de Shushufindi" /></label></div><div className="modal-actions"><button className="outline-action" type="button" onClick={() => setShowNuevaConvenio(false)}>Cancelar</button><button className="new-consultation" type="button" disabled={pending || !nuevaConvenioNombre.trim()} onClick={crearConvenio}>{pending ? "Guardando…" : "Guardar empresa"}</button></div></section></div>}
    {buscando && <ProductSearchModal title={buscando === "montura" ? "BUSCAR MONTURA" : "BUSCAR LUNAS"} products={buscando === "montura" ? availableArmazon : availableLunas} branch={branch} stockFor={stockFor} onSelect={addProduct} onClose={() => setBuscando("")} />}
  </section>;
}

function ProductSearchModal({ title, products, branch, stockFor, onSelect, onClose }: { title: string; products: SaleProduct[]; branch: string; stockFor: (productoId: string, sucursalId: string) => number; onSelect: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const visible = products.filter((p) => p.nombre.toLowerCase().includes(query.toLowerCase()));
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="product-search-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">{title}</p><h2 id="product-search-title">Buscar producto</h2>
    <label className="patient-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre del producto" autoFocus /></label>
    <div className="patient-list">{visible.map((p) => <button key={p.id} type="button" className="patient-row" onClick={() => { onSelect(p.id); onClose(); }}><span className="patient-row-text"><strong>{p.nombre}</strong><small>{money(Number(p.precio_venta))}{p.controla_inventario && branch ? ` · ${stockFor(p.id, branch)} disponibles` : ""}</small></span></button>)}
    {visible.length === 0 && <p className="empty-patients">No se encontraron productos.</p>}</div>
  </section></div>;
}
