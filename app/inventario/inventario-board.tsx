"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Calculator, Glasses, Package, Plus, ShoppingBag, Upload, X } from "lucide-react";
import { useState, useTransition } from "react";
import type { InventarioData, MovimientoInventario, Producto } from "@/lib/inventario";
import { actualizarProductoInventario, actualizarStockMinimo, crearArmazonesMasivo, crearMovimientoInventario, crearProductoInventario, transferirInventario, type ArmazonMasivo } from "./actions";

const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const money = (n: number) => `$${Number(n).toFixed(2)}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const categorias = ["montura", "gafas_sol", "lente", "accesorio", "servicio", "tratamiento", "otro"];
const categoriaLabel: Record<string, string> = { montura: "Monturas", gafas_sol: "Gafas de sol", lente: "Lunas", accesorio: "Accesorios", servicio: "Servicios", tratamiento: "Tratamientos", otro: "Otros" };
const tipoLabel: Record<string, string> = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste", transferencia_salida: "Transferencia (salida)", transferencia_entrada: "Transferencia (entrada)" };
const gruposMonturas: Record<string, string[]> = { monturas_gafas: ["montura", "gafas_sol"], accesorios: ["accesorio", "servicio", "tratamiento", "otro"] };

export default function InventarioBoard(props: InventarioData & { grupoInicial?: "monturas" | "lunas" }) {
  const grupo = props.grupoInicial ?? "monturas";
  const [notice, setNotice] = useState(props.message ?? "");
  const [empresaId, setEmpresaId] = useState(props.profile?.empresa_id ?? props.companies[0]?.id ?? "");
  const [subgrupo, setSubgrupo] = useState<"" | "monturas_gafas" | "accesorios">("");
  const [categoriaActiva, setCategoriaActiva] = useState<string>(() => grupo === "lunas" ? "lente" : "montura");
  const [busqueda, setBusqueda] = useState("");
  const [marcaActiva, setMarcaActiva] = useState("");
  const [clasificacionActiva, setClasificacionActiva] = useState("");
  const [rxEsfera, setRxEsfera] = useState("");
  const [rxCilindro, setRxCilindro] = useState("");
  const [rxAdicion, setRxAdicion] = useState("");
  const [showProducto, setShowProducto] = useState(false);
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null);
  const [mostrar, setMostrar] = useState<"basico" | "detallado">("basico");
  const [showMovimiento, setShowMovimiento] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMasivo, setShowMasivo] = useState(false);
  const [pending, startTransition] = useTransition();
  const role = props.profile?.rol;
  const canEdit = role === "superadmin" || role === "admin_sucursal";

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN</p><h1>Inventario</h1><p className="subtitle">{props.message ?? "No se pudo abrir inventario."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/inventario">Iniciar sesión</Link>}</header></div></main>;

  const categoriasVisibles = grupo === "lunas" ? ["lente"] : gruposMonturas[subgrupo] ?? [];
  const branches = props.branches.filter((b) => b.empresa_id === empresaId);
  const productos = props.productos.filter((p) => p.empresa_id === empresaId);
  const productosGrupo = productos.filter((p) => categoriasVisibles.includes(p.categoria));
  const productosCategoriaSinFiltrar = productosGrupo.filter((p) => p.categoria === categoriaActiva);
  const clasificacionesVisibles = Array.from(new Set(productosCategoriaSinFiltrar.map((p) => p.clasificacion).filter((c): c is string => !!c))).sort();
  const marcas = Array.from(new Set(productosCategoriaSinFiltrar.map((p) => p.marca?.trim()).filter((marca): marca is string => !!marca))).sort((a, b) => a.localeCompare(b, "es"));
  const palabras = normalizeSearch(busqueda).split(/\s+/).filter(Boolean);
  const productosCategoria = productosCategoriaSinFiltrar.filter((p) => {
    const texto = normalizeSearch([p.marca, p.modelo, p.codigo, p.codigo_barra, p.nombre, p.color].filter(Boolean).join(" "));
    return (!clasificacionActiva || p.clasificacion === clasificacionActiva)
      && (!marcaActiva || p.marca?.trim() === marcaActiva)
      && palabras.every((palabra) => texto.includes(palabra));
  });
  const productoIds = new Set(productosGrupo.map((p) => p.id));
  const stock = props.stock.filter((s) => productoIds.has(s.producto_id));
  const movimientos = props.movimientos.filter((m) => productoIds.has(m.producto_id));
  const productoById = new Map(productosGrupo.map((p) => [p.id, p]));
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const stockFor = (productoId: string, sucursalId: string) => stock.find((s) => s.producto_id === productoId && s.sucursal_id === sucursalId);
  const alertas = stock.filter((s) => s.stock_minimo > 0 && s.cantidad <= s.stock_minimo);

  const enRango = (valor: number | null, pos: number | null, neg: number | null) => {
    if (valor === null) return true;
    if (pos === null || neg === null) return true;
    const lo = Math.min(pos, neg); const hi = Math.max(pos, neg);
    return valor >= lo && valor <= hi;
  };
  const parseRx = (value: string) => value.trim() === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const esferaVal = parseRx(rxEsfera); const cilindroVal = parseRx(rxCilindro); const adicionVal = parseRx(rxAdicion);
  const rxActiva = grupo === "lunas" && (rxEsfera.trim() !== "" || rxCilindro.trim() !== "" || rxAdicion.trim() !== "");
  const resultadosCalculadora = rxActiva ? productosCategoria.filter((p) => enRango(esferaVal, p.rango_esf_pos, p.rango_esf_neg) && enRango(cilindroVal, p.rango_cil_pos, p.rango_cil_neg) && enRango(adicionVal, p.rango_add_pos, p.rango_add_neg)).sort((a, b) => a.precio_venta - b.precio_venta) : [];

  const runAction = (action: () => Promise<unknown>, onOk: string) => startTransition(async () => {
    try { await action(); setNotice(onOk); setShowProducto(false); setShowMovimiento(false); setShowTransfer(false); setShowMasivo(false); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo completar la acción."); }
  });
  const saveMinimo = (productoId: string, sucursalId: string, minimo: number) => runAction(() => { const data = new FormData(); data.set("producto_id", productoId); data.set("sucursal_id", sucursalId); data.set("stock_minimo", String(minimo)); return actualizarStockMinimo(data); }, "Mínimo actualizado.");

  const titulo = grupo === "lunas" ? "Inventario de lunas" : "Inventario de monturas y accesorios";
  const subtitulo = grupo === "lunas" ? "Existencias de lunas por sucursal." : "Monturas, gafas de sol y accesorios, separados por espacio.";

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN</p><h1>{titulo}</h1><p className="subtitle">{subtitulo}</p><Link className="outline-action" href="/inventario/lunas" style={{ marginTop: 8, display: "inline-flex" }}>Banco de lunas (bodega y garantías)</Link></div><div className="tabs">{props.companies.map((c) => <button key={c.id} className={c.id === empresaId ? "active" : ""} onClick={() => { setEmpresaId(c.id); setMarcaActiva(""); }}>{c.nombre}</button>)}</div></header>
    <div className="notice"><AlertTriangle size={18} /><span>{notice || "El stock se descuenta solo al cerrar una venta con sucursal asignada."}</span></div>

    {grupo === "monturas" && !subgrupo ? <section className="glass agenda-board">
      <p className="section-label">ELIGE EL ESPACIO</p><h2>¿Qué inventario quieres ver?</h2>
      <div className="mode-select" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <button type="button" className="outline-action" style={{ padding: 22, display: "grid", justifyItems: "center", gap: 8 }} onClick={() => { setSubgrupo("monturas_gafas"); setCategoriaActiva("montura"); setMarcaActiva(""); }}><Glasses size={26} /><strong>Monturas y gafas de sol</strong><span>{productos.filter((p) => p.categoria === "montura" || p.categoria === "gafas_sol").length} productos</span></button>
        <button type="button" className="outline-action" style={{ padding: 22, display: "grid", justifyItems: "center", gap: 8 }} onClick={() => { setSubgrupo("accesorios"); setCategoriaActiva("accesorio"); setMarcaActiva(""); }}><ShoppingBag size={26} /><strong>Accesorios</strong><span>{productos.filter((p) => ["accesorio", "servicio", "tratamiento", "otro"].includes(p.categoria)).length} productos</span></button>
      </div>
    </section> : <>

    {grupo === "monturas" && <button type="button" className="text-action" style={{ marginBottom: 10 }} onClick={() => setSubgrupo("")}>← Cambiar de espacio</button>}

    <section className="agenda-summary"><article><Package size={21} /><strong>{productosGrupo.length}</strong><span>productos activos</span></article><article><AlertTriangle size={21} /><strong>{alertas.length}</strong><span>alertas de stock bajo</span></article><article><ArrowLeftRight size={21} /><strong>{movimientos.length}</strong><span>movimientos recientes</span></article></section>

    {alertas.length > 0 && <section className="glass agenda-board" style={{ marginBottom: 18 }}><p className="section-label">ALERTAS DE STOCK BAJO</p><h2>Revisa estas existencias</h2><div className="task-list">{alertas.map((row) => <article className="task-card" key={row.id}><div className="task-status" /><div className="task-main"><h2>{productoById.get(row.producto_id)?.nombre ?? "Producto"}</h2><p>{branchById.get(row.sucursal_id)?.nombre ?? "Sucursal"} · quedan {row.cantidad} (mínimo {row.stock_minimo})</p></div><div className="task-actions"><span className="check-badge fail">Bajo mínimo</span></div></article>)}</div></section>}

    {grupo === "lunas" && <section className="glass agenda-board" style={{ marginBottom: 18 }}>
      <div className="agenda-toolbar"><div><p className="section-label">CALCULADORA</p><h2><Calculator size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />Buscar luna por fórmula</h2></div></div>
      <p className="field-hint">Ingresa la fórmula del paciente para ver qué lunas del catálogo la cubren y a qué precio. Deja en blanco lo que no aplique (ej.: adición solo en bifocales/progresivos).</p>
      <div className="new-patient-form" style={{ marginTop: 10 }}>
        <label>Esfera<input type="number" step="0.25" value={rxEsfera} onChange={(event) => setRxEsfera(event.target.value)} placeholder="Ej.: -2.50" /></label>
        <label>Cilindro<input type="number" step="0.25" value={rxCilindro} onChange={(event) => setRxCilindro(event.target.value)} placeholder="Ej.: -0.75" /></label>
        <label>Adición<input type="number" step="0.25" value={rxAdicion} onChange={(event) => setRxAdicion(event.target.value)} placeholder="Ej.: +2.00" /></label>
      </div>
      {rxActiva && <>
        <p className="field-hint" style={{ marginTop: 10 }}>{resultadosCalculadora.length} opción(es) de <strong>{categoriaLabel[categoriaActiva]?.toLowerCase()}{clasificacionActiva ? ` · ${clasificacionActiva}` : ""}</strong> cubren esta fórmula.</p>
        {resultadosCalculadora.length ? <div className="task-list" style={{ marginTop: 8 }}>{resultadosCalculadora.map((producto) => <article className="task-card" key={producto.id}><div className="task-status" /><div className="task-main"><div className="task-meta">{producto.clasificacion && <span>{producto.clasificacion}</span>}{producto.material && <span>{producto.material}</span>}{producto.indice != null && <span>Índice {producto.indice}</span>}{producto.tecnologia && <span>{producto.tecnologia}</span>}</div><h2>{producto.nombre}</h2><p>Precio: {money(producto.precio_venta)}{producto.costo_referencial != null ? ` · Costo: ${money(producto.costo_referencial)}` : ""}</p></div><div className="task-actions" /></article>)}</div> : <p className="field-hint">Ninguna luna de esta pestaña cubre esa fórmula; prueba otra clasificación o revisa los valores.</p>}
      </>}
    </section>}

    <section className="glass agenda-board" style={{ marginBottom: 18 }}><div className="agenda-toolbar"><div><p className="section-label">CATÁLOGO</p><h2>Productos y existencias</h2></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#5d7086" }}>Mostrar<select value={mostrar} onChange={(event) => setMostrar(event.target.value as "basico" | "detallado")} style={{ border: "1px solid #d4e0ea", borderRadius: 9, padding: "8px 10px" }}><option value="basico">Básico</option><option value="detallado">Detallado (con stock y ficha)</option></select></label>{canEdit && subgrupo === "monturas_gafas" && <button className="outline-action" type="button" onClick={() => setShowMasivo(true)}><Upload size={15} /> Subida masiva</button>}{canEdit && <button className="new-task" type="button" onClick={() => setShowProducto(true)}><Plus size={18} /> Nuevo producto</button>}</div></div>
    <section aria-label="Buscar productos" style={{ marginBottom: 16 }}>
      <div className="new-patient-form">
        <label>Buscar por marca, modelo o código<input type="search" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por marca, modelo o código" /></label>
        <label>Marca<select value={marcaActiva} onChange={(event) => setMarcaActiva(event.target.value)}><option value="">Todas las marcas</option>{marcas.map((marca) => <option key={marca} value={marca}>{marca}</option>)}</select></label>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}><span role="status">{productosCategoria.length} de {productosCategoriaSinFiltrar.length} productos</span><button type="button" className="outline-action" onClick={() => { setBusqueda(""); setMarcaActiva(""); setClasificacionActiva(""); }}>Limpiar</button></div>
    </section>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
      {categoriasVisibles.length > 1 && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#5d7086" }}>Categoría<select value={categoriaActiva} onChange={(event) => { setCategoriaActiva(event.target.value); setClasificacionActiva(""); setMarcaActiva(""); }} style={{ border: "1px solid #d4e0ea", borderRadius: 9, padding: "8px 10px" }}>{categoriasVisibles.map((cat) => <option key={cat} value={cat}>{categoriaLabel[cat]} ({productos.filter((p) => p.categoria === cat).length})</option>)}</select></label>}
      {clasificacionesVisibles.length > 1 && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#5d7086" }}>Tipo<select value={clasificacionActiva} onChange={(event) => setClasificacionActiva(event.target.value)} style={{ border: "1px solid #d4e0ea", borderRadius: 9, padding: "8px 10px" }}><option value="">Todas ({productosCategoriaSinFiltrar.length})</option>{clasificacionesVisibles.map((clas) => <option key={clas} value={clas}>{clas} ({productosCategoriaSinFiltrar.filter((p) => p.clasificacion === clas).length})</option>)}</select></label>}
    </div>
    {productosCategoria.length ? <div className="task-list">{productosCategoria.map((producto) => { const detalle = mostrar === "detallado"; const resumenExtra = [producto.marca, producto.modelo, producto.color].filter(Boolean).join(" · "); return <article className="task-card" key={producto.id} style={canEdit ? { cursor: "pointer" } : undefined} onClick={() => canEdit && setEditingProducto(producto)}><div className="task-status" /><div className="task-main">{detalle && <div className="task-meta"><span>{categoriaLabel[producto.categoria] ?? producto.categoria}</span>{producto.clasificacion && <span>{producto.clasificacion}</span>}{producto.material && <span>{producto.material}</span>}{producto.indice != null && <span>Índice {producto.indice}</span>}{producto.tecnologia && <span>{producto.tecnologia}</span>}{producto.proveedor && <span>{producto.proveedor}</span>}{producto.consignacion && <span>Consignación</span>}{!producto.controla_inventario && <span>No controla stock</span>}</div>}<h2>{producto.nombre}{canEdit && <span className="text-action" style={{ marginLeft: 8 }}>Editar</span>}</h2><p>{resumenExtra && `${resumenExtra} · `}Precio: {money(producto.precio_venta)}{detalle && producto.costo_referencial != null ? ` · Costo: ${money(producto.costo_referencial)}` : ""}{detalle && producto.codigo ? ` · Código: ${producto.codigo}` : ""}{detalle && producto.codigo_barra ? ` · Varilla: ${producto.codigo_barra}` : ""}{detalle && producto.rango_esf_pos != null && producto.rango_esf_neg != null ? ` · Esfera ${producto.rango_esf_neg} a ${producto.rango_esf_pos}` : ""}{detalle && producto.rango_cil_pos != null && producto.rango_cil_neg != null ? ` · Cilindro ${producto.rango_cil_neg} a ${producto.rango_cil_pos}` : ""}</p>{detalle && producto.controla_inventario && <div className="stock-rows" onClick={(event) => event.stopPropagation()}>{branches.map((branch) => { const row = stockFor(producto.id, branch.id); const cantidad = row?.cantidad ?? 0; const minimo = row?.stock_minimo ?? 0; const low = minimo > 0 && cantidad <= minimo; return <StockPill key={branch.id} nombre={branch.nombre} cantidad={cantidad} minimo={minimo} low={low} canEdit={canEdit} onSaveMinimo={(value) => saveMinimo(producto.id, branch.id, value)} />; })}</div>}</div><div className="task-actions" /></article>; })}</div> : <section className="empty-state"><Package size={27} /><h3>{productosCategoriaSinFiltrar.length ? "No hay productos que coincidan" : `Aún no hay productos en ${categoriaLabel[categoriaActiva]?.toLowerCase()}`}</h3><p>{productosCategoriaSinFiltrar.length ? "Prueba otra búsqueda o limpia los filtros." : "Crea el primer producto de esta categoría."}</p></section>}</section>

    {canEdit && <section className="glass agenda-board"><div className="agenda-toolbar"><div><p className="section-label">MOVIMIENTOS</p><h2>Entradas, salidas y transferencias</h2></div><div style={{ display: "flex", gap: 8 }}><button className="outline-action" type="button" onClick={() => setShowTransfer(true)}><ArrowLeftRight size={15} /> Transferencia</button><button className="new-task" type="button" onClick={() => setShowMovimiento(true)}><Plus size={18} /> Nuevo movimiento</button></div></div>{movimientos.length ? <div className="task-list">{movimientos.slice(0, 20).map((mov) => <MovimientoCard key={mov.id} mov={mov} productoNombre={productoById.get(mov.producto_id)?.nombre ?? "Producto"} sucursalNombre={branchById.get(mov.sucursal_id)?.nombre ?? "Sucursal"} />)}</div> : <section className="empty-state"><ArrowLeftRight size={27} /><h3>Sin movimientos</h3><p>Las entradas, salidas y transferencias aparecerán aquí.</p></section>}</section>}

    {showProducto && <ProductoModal empresaId={empresaId} categoriaInicial={categoriaActiva} companies={props.companies} branches={branches} pending={pending} onClose={() => setShowProducto(false)} onSubmit={(form) => runAction(() => crearProductoInventario(form), "Producto creado.")} />}
    {editingProducto && <ProductoModal empresaId={empresaId} categoriaInicial={editingProducto.categoria} companies={props.companies} branches={branches} producto={editingProducto} pending={pending} onClose={() => setEditingProducto(null)} onSubmit={(form) => startTransition(async () => { try { await actualizarProductoInventario(form); setNotice("Producto actualizado."); setEditingProducto(null); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo actualizar el producto."); } })} />}
    {showMovimiento && <MovimientoModal productos={productosGrupo.filter((p) => p.controla_inventario)} branches={branches} pending={pending} onClose={() => setShowMovimiento(false)} onSubmit={(form) => runAction(() => crearMovimientoInventario(form), "Movimiento registrado.")} />}
    {showTransfer && <TransferModal productos={productosGrupo.filter((p) => p.controla_inventario)} branches={branches} pending={pending} onClose={() => setShowTransfer(false)} onSubmit={(form) => runAction(() => transferirInventario(form), "Transferencia registrada.")} />}
    {showMasivo && <MasivoModal empresaId={empresaId} branches={branches} pending={pending} onClose={() => setShowMasivo(false)} onSubmit={(sucursalId, items) => runAction(() => crearArmazonesMasivo(empresaId, sucursalId, items), "Armazones creados.")} />}
    </>}
  </div></main>;
}

function StockPill({ nombre, cantidad, minimo, low, canEdit, onSaveMinimo }: { nombre: string; cantidad: number; minimo: number; low: boolean; canEdit: boolean; onSaveMinimo: (value: number) => void }) {
  const [editing, setEditing] = useState(false); const [value, setValue] = useState(String(minimo));
  if (editing) return <span className="stock-row"><span>{nombre} mín.</span><input type="number" min={0} step={1} value={value} onChange={(e) => setValue(e.target.value)} autoFocus onBlur={() => { setEditing(false); const n = Number(value); if (Number.isFinite(n) && n !== minimo) onSaveMinimo(n); }} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} /></span>;
  return <span className={`stock-row ${low ? "low" : ""}`} onClick={() => canEdit && setEditing(true)} style={canEdit ? { cursor: "pointer" } : undefined} title={canEdit ? "Click para cambiar el mínimo" : undefined}>{nombre}: <strong>{cantidad}</strong>{minimo > 0 ? ` (mín ${minimo})` : ""}</span>;
}

function MovimientoCard({ mov, productoNombre, sucursalNombre }: { mov: MovimientoInventario; productoNombre: string; sucursalNombre: string }) {
  const positivo = mov.tipo === "entrada" || mov.tipo === "transferencia_entrada";
  return <article className="task-card"><div className="task-status" /><div className="task-main"><div className="task-meta"><span>{tipoLabel[mov.tipo]}</span><span>{sucursalNombre}</span><span>{formatDate(mov.creado_en)}</span></div><h2>{productoNombre}</h2>{mov.motivo && <p>{mov.motivo}</p>}</div><div className="task-actions"><strong style={{ color: positivo ? "#247658" : "#a24150" }}>{positivo ? "+" : "−"}{Math.abs(mov.cantidad)}</strong></div></article>;
}

function ProductoModal({ empresaId, categoriaInicial, companies, branches, producto, pending, onClose, onSubmit }: { empresaId: string; categoriaInicial: string; companies: InventarioData["companies"]; branches: InventarioData["branches"]; producto?: Producto; pending: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) {
  const [categoria, setCategoria] = useState(producto?.categoria ?? categoriaInicial);
  const esMontura = categoria === "montura" || categoria === "gafas_sol";
  const editando = !!producto;
  const [marca, setMarca] = useState(producto?.marca ?? "");
  const [modelo, setModelo] = useState(producto?.modelo ?? "");
  const [color, setColor] = useState(producto?.color ?? "");
  const nombreAuto = [marca, modelo, color].filter((v) => v.trim()).join(" ") || (producto?.nombre ?? "");
  return <div className="modal-backdrop"><section className="new-patient-modal sale-modal-shell" role="dialog" aria-modal="true" aria-labelledby="new-prod-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">{editando ? "EDITAR PRODUCTO" : "NUEVO PRODUCTO"}</p><h2 id="new-prod-title">{editando ? producto.nombre : "Agregar al catálogo"}</h2><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}>
    {editando && <input type="hidden" name="producto_id" value={producto.id} />}
    {esMontura && <input type="hidden" name="nombre" value={nombreAuto} />}
    <div className="new-patient-form">
      {!esMontura && <label>Nombre<input name="nombre" defaultValue={producto?.nombre} required /></label>}
      <label>Categoría<select name="categoria" value={categoria} onChange={(event) => setCategoria(event.target.value)}>{categorias.map((c) => <option key={c} value={c}>{categoriaLabel[c]}</option>)}</select></label>
      <label>Empresa<select name="empresa_id" defaultValue={producto?.empresa_id ?? empresaId}>{companies.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <label>Proveedor<input name="proveedor" defaultValue={producto?.proveedor ?? ""} placeholder="Ej.: OPTEC, Provisión, Indulentes" /></label>
    </div>

    {esMontura ? <>
      <div className="new-patient-form" style={{ marginTop: 10 }}>
        <label>Marca<input value={marca} onChange={(event) => setMarca(event.target.value)} /></label>
        <label>Modelo<input value={modelo} onChange={(event) => setModelo(event.target.value)} /></label>
        <label>Color<input value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <label>Material<input name="material" defaultValue={producto?.material ?? ""} placeholder="Ej.: Acetato, Metal, TR90" /></label>
        <label>Tipo<input name="clasificacion" defaultValue={producto?.clasificacion ?? ""} placeholder="Ej.: Oftálmico, Sol" /></label>
        <label>Barcode<input name="codigo_barra" defaultValue={producto?.codigo_barra ?? ""} placeholder="Dejar en blanco para crear uno automático" /></label>
        <label>Código<input name="codigo" defaultValue={producto?.codigo ?? ""} /></label>
        <label className="receta-option-header" style={{ padding: "8px 0" }}><input type="checkbox" name="consignacion" value="si" defaultChecked={producto?.consignacion ?? false} /> Consignación</label>
      </div>
      <p className="section-label" style={{ marginTop: 14 }}>PRECIOS</p>
      <div className="new-patient-form">
        <label>Costo proveedor predeterminado<input name="costo_referencial" defaultValue={producto?.costo_referencial ?? ""} type="number" min="0" step="0.01" /></label>
        <label>Precio al público<input name="precio_venta" defaultValue={producto?.precio_venta} required type="number" min="0" step="0.01" /></label>
        <label>Precio al público 2<input name="precio_venta_2" defaultValue={producto?.precio_venta_2 ?? ""} type="number" min="0" step="0.01" /></label>
        <label>Precio al público 3<input name="precio_venta_3" defaultValue={producto?.precio_venta_3 ?? ""} type="number" min="0" step="0.01" /></label>
      </div>
      <p className="section-label" style={{ marginTop: 14 }}>MEDIDAS Y COMPRA</p>
      <div className="new-patient-form">
        <label>Puente<input name="medida_puente" defaultValue={producto?.medida_puente ?? ""} type="number" min="0" step="0.1" /></label>
        <label>Fecha de compra<input name="fecha_compra" defaultValue={producto?.fecha_compra ?? ""} type="date" /></label>
        {!editando && <label>Sucursal para el stock inicial<select name="sucursal_id" defaultValue=""><option value="">Sin cargar stock (solo crear catálogo)</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>}
        {!editando && <label>Cantidad inicial<input name="cantidad_inicial" type="number" min="0" step="1" placeholder="0" /></label>}
      </div>
      <input type="hidden" name="controla_inventario" value="si" />
    </> : <div className="new-patient-form" style={{ marginTop: 10 }}>
      <label>Clasificación<input name="clasificacion" defaultValue={producto?.clasificacion ?? ""} placeholder="Ej.: Fino, Fino con estuche, Exclusivo" /></label>
      <label>Código<input name="codigo" defaultValue={producto?.codigo ?? ""} /></label>
      <label>Código de la varilla<input name="codigo_barra" defaultValue={producto?.codigo_barra ?? ""} /></label>
      <label>Precio de venta<input name="precio_venta" defaultValue={producto?.precio_venta} required type="number" min="0" step="0.01" /></label>
      <label>Costo referencial<input name="costo_referencial" defaultValue={producto?.costo_referencial ?? ""} type="number" min="0" step="0.01" /></label>
      <label>¿Controla stock?<select name="controla_inventario" defaultValue={producto ? (producto.controla_inventario ? "si" : "no") : "si"}><option value="si">Sí, es un producto físico</option><option value="no">No, es un servicio</option></select></label>
    </div>}
  {esMontura && !nombreAuto.trim() && <p className="field-hint">Completa al menos marca, modelo o color para identificar este armazón.</p>}
  <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending || (esMontura && !nombreAuto.trim())} type="submit">{pending ? "Guardando…" : editando ? "Guardar cambios" : "Guardar producto"}</button></div></form></section></div>;
}

function MovimientoModal({ productos, branches, pending, onClose, onSubmit }: { productos: Producto[]; branches: InventarioData["branches"]; pending: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) {
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-mov-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVO MOVIMIENTO</p><h2 id="new-mov-title">Entrada, salida o ajuste</h2><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><div className="new-patient-form">
    <label>Producto<select name="producto_id" required defaultValue=""><option value="" disabled>Selecciona un producto</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
    <label>Sucursal<select name="sucursal_id" required defaultValue=""><option value="" disabled>Selecciona la sucursal</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
    <label>Tipo<select name="tipo" defaultValue="entrada"><option value="entrada">Entrada</option><option value="salida">Salida</option><option value="ajuste">Ajuste (puede ser negativo)</option></select></label>
    <label>Cantidad<input name="cantidad" type="number" step="1" required /></label>
    <label className="task-description">Motivo<input name="motivo" placeholder="Ej.: Compra a proveedor, rotura, conteo físico" /></label>
  </div><div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : "Registrar movimiento"}</button></div></form></section></div>;
}

function TransferModal({ productos, branches, pending, onClose, onSubmit }: { productos: Producto[]; branches: InventarioData["branches"]; pending: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) {
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-transfer-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">TRANSFERENCIA</p><h2 id="new-transfer-title">Mover entre sucursales</h2><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><div className="new-patient-form">
    <label>Producto<select name="producto_id" required defaultValue=""><option value="" disabled>Selecciona un producto</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
    <label>De<select name="sucursal_origen" required defaultValue=""><option value="" disabled>Sucursal de origen</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
    <label>A<select name="sucursal_destino" required defaultValue=""><option value="" disabled>Sucursal de destino</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
    <label>Cantidad<input name="cantidad" type="number" min="1" step="1" required /></label>
    <label className="task-description">Motivo<input name="motivo" placeholder="Opcional" /></label>
  </div><div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : "Registrar transferencia"}</button></div></form></section></div>;
}

const filaVacia = (): ArmazonMasivo => ({ nombre: "", categoria: "montura", clasificacion: "", codigo: "", codigo_barra: "", proveedor: "", precio_venta: "", costo_referencial: "", cantidad_inicial: "" });

function MasivoModal({ empresaId, branches, pending, onClose, onSubmit }: { empresaId: string; branches: InventarioData["branches"]; pending: boolean; onClose: () => void; onSubmit: (sucursalId: string, items: ArmazonMasivo[]) => void }) {
  const [sucursalId, setSucursalId] = useState("");
  const [filas, setFilas] = useState<ArmazonMasivo[]>([filaVacia(), filaVacia(), filaVacia()]);
  const update = (index: number, patch: Partial<ArmazonMasivo>) => setFilas(filas.map((f, i) => i === index ? { ...f, ...patch } : f));
  const validas = filas.filter((f) => f.nombre.trim()).length;
  return <div className="modal-backdrop"><section className="new-patient-modal sale-modal-shell" role="dialog" aria-modal="true" aria-labelledby="masivo-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">SUBIDA MASIVA</p><h2 id="masivo-title">Añadir varios armazones</h2><p>Completa las filas que necesites; las vacías se ignoran. La cantidad inicial se carga en la sucursal elegida abajo.</p>
    <div className="new-patient-form" style={{ marginBottom: 12 }}><label>Sucursal para el stock inicial<select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}><option value="">Sin cargar stock (solo crear catálogo)</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label></div>
    <div style={{ display: "grid", gap: 10 }}>
      {filas.map((fila, index) => <div key={index} className="glass clinical-card" style={{ minHeight: "auto", padding: 12 }}>
        <div className="new-patient-form">
          <label>Nombre<input value={fila.nombre} onChange={(event) => update(index, { nombre: event.target.value })} placeholder="Ej.: Ray-Ban RB2140" /></label>
          <label>Tipo<select value={fila.categoria} onChange={(event) => update(index, { categoria: event.target.value })}><option value="montura">Montura</option><option value="gafas_sol">Gafas de sol</option></select></label>
          <label>Clasificación<input value={fila.clasificacion} onChange={(event) => update(index, { clasificacion: event.target.value })} placeholder="Ej.: Fino, Exclusivo" /></label>
          <label>Proveedor<input value={fila.proveedor} onChange={(event) => update(index, { proveedor: event.target.value })} /></label>
          <label>Código<input value={fila.codigo} onChange={(event) => update(index, { codigo: event.target.value })} /></label>
          <label>Código de la varilla<input value={fila.codigo_barra} onChange={(event) => update(index, { codigo_barra: event.target.value })} /></label>
          <label>Precio de venta<input type="number" min="0" step="0.01" value={fila.precio_venta} onChange={(event) => update(index, { precio_venta: event.target.value })} /></label>
          <label>Costo referencial<input type="number" min="0" step="0.01" value={fila.costo_referencial} onChange={(event) => update(index, { costo_referencial: event.target.value })} /></label>
          <label>Cantidad inicial<input type="number" min="0" step="1" value={fila.cantidad_inicial} onChange={(event) => update(index, { cantidad_inicial: event.target.value })} disabled={!sucursalId} placeholder={sucursalId ? "0" : "Elige sucursal"} /></label>
        </div>
        {filas.length > 1 && <button type="button" className="text-action" style={{ marginTop: 8 }} onClick={() => setFilas(filas.filter((_, i) => i !== index))}>Quitar fila</button>}
      </div>)}
    </div>
    <div className="modal-actions" style={{ justifyContent: "space-between", marginTop: 14 }}>
      <button type="button" className="outline-action" onClick={() => setFilas([...filas, filaVacia()])}><Plus size={15} /> Agregar fila</button>
      <div style={{ display: "flex", gap: 8 }}><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending || validas === 0} type="button" onClick={() => onSubmit(sucursalId, filas)}>{pending ? "Guardando…" : `Crear ${validas || ""} armazón(es)`}</button></div>
    </div>
  </section></div>;
}
