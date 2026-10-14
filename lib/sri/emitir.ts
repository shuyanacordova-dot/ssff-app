import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generarClaveAcceso } from "./clave-acceso";
import { construirFacturaXml, type DatosFactura, type ImpuestoFactura } from "./factura-xml";
import { firmarComprobanteXml, leerP12 } from "./firma-xades";
import { consultarAutorizacion, enviarComprobante, type AmbienteSri, type MensajeSri } from "./servicio-sri";

export type TarifaIva = 0 | 15;
export type DatosEmision = {
  ventaId: string; usuarioId: string; tarifaIva: TarifaIva;
  consumidorFinal: boolean; identificacion: string; email: string;
};
export type ResultadoEmision = { ok: true; estado: string; mensaje: string } | { ok: false; error: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const limpiar = (t: string, max: number) => t.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FORMA_PAGO: Record<string, "01" | "19" | "20"> = { efectivo: "01", tarjeta: "19", transferencia: "20", credito: "20", otro: "20" };

type Fila = { id: string; estado: string; secuencial: number; establecimiento: string; punto_emision: string; clave_acceso: string | null; xml_firmado: string | null };

function resumenMensajes(mensajes: MensajeSri[]): string {
  return mensajes.map((m) => `${m.identificador ? m.identificador + ": " : ""}${m.mensaje}${m.informacionAdicional ? " — " + m.informacionAdicional : ""}`).join(" | ");
}

export async function emitirFactura(d: DatosEmision): Promise<ResultadoEmision> {
  const admin = createSupabaseAdminClient();

  const { data: venta } = await admin.from("ventas")
    .select("id,estado,total,sucursal_id,paciente_id,cliente_nombre,venta_items(producto_id,descripcion,cantidad,precio_unitario,descuento,total_linea),pagos_venta(metodo,monto),pacientes_clinicos(nombres,apellidos,cedula,email)")
    .eq("id", d.ventaId).maybeSingle();
  if (!venta || venta.estado !== "completada") return { ok: false, error: "La venta no está disponible para facturar." };
  const total = Number(venta.total);
  if (!(total > 0)) return { ok: false, error: "La venta no tiene valor para facturar." };
  const items = venta.venta_items ?? [];
  if (!items.length) return { ok: false, error: "La venta no tiene productos." };

  const { data: emisor } = await admin.from("emisores_sri").select("*").eq("sucursal_id", venta.sucursal_id).maybeSingle();
  if (!emisor) return { ok: false, error: "Esta sucursal no tiene emisor SRI configurado." };
  if (!emisor.ruc_confirmado || !emisor.razon_social || !emisor.direccion_matriz || !emisor.direccion_establecimiento) return { ok: false, error: "Faltan datos del emisor (razón social o direcciones) en Configuración SRI." };
  if (!emisor.firma_cargada || !emisor.firma_ruta || !emisor.firma_clave_secret_id) return { ok: false, error: "Este emisor todavía no tiene firma electrónica cargada." };
  if (emisor.firma_vence && new Date(emisor.firma_vence) <= new Date()) return { ok: false, error: "La firma electrónica de este emisor está vencida." };
  if (emisor.regimen === "rimpe_negocio_popular") return { ok: false, error: "Los negocios populares RIMPE no emiten factura (usan nota de venta). Falta confirmar con el contador." };
  if (!["general", "rimpe_emprendedor"].includes(emisor.regimen ?? "")) return { ok: false, error: "Falta definir el régimen tributario del emisor." };
  const ambiente: AmbienteSri = emisor.ambiente === "produccion" ? "produccion" : "pruebas";

  // Comprador
  const paciente = Array.isArray(venta.pacientes_clinicos) ? venta.pacientes_clinicos[0] : venta.pacientes_clinicos;
  let tipoId: "04" | "05" | "07"; let identificacion: string; let nombreComprador: string;
  if (d.consumidorFinal) {
    if (total > 50) return { ok: false, error: "A consumidor final solo se puede facturar hasta $50. Indica cédula o RUC." };
    tipoId = "07"; identificacion = "9999999999999"; nombreComprador = "CONSUMIDOR FINAL";
  } else {
    identificacion = d.identificacion.trim();
    if (/^\d{10}$/.test(identificacion)) tipoId = "05"; else if (/^\d{13}$/.test(identificacion)) tipoId = "04";
    else return { ok: false, error: "La identificación debe ser una cédula de 10 dígitos o un RUC de 13." };
    nombreComprador = limpiar((paciente ? `${paciente.nombres} ${paciente.apellidos}` : venta.cliente_nombre || "").toUpperCase(), 300);
    if (!nombreComprador) return { ok: false, error: "Falta el nombre del comprador." };
  }
  const email = d.email.trim() || paciente?.email?.trim() || "";
  if (email && !/^[^\s@<>&]+@[^\s@<>&]+\.[^\s@<>&]+$/.test(email)) return { ok: false, error: "El correo del comprador no es válido." };

  // ¿Ya existe un comprobante vivo de esta venta? Se retoma en vez de gastar otro número.
  const { data: vivo } = await admin.from("comprobantes_sri").select("id,estado,secuencial,establecimiento,punto_emision,clave_acceso,xml_firmado")
    .eq("venta_id", venta.id).eq("ambiente", ambiente).in("estado", ["reservado", "firmada", "recibida", "autorizada"]).maybeSingle();
  if (vivo?.estado === "autorizada") return { ok: false, error: "Esta venta ya tiene una factura autorizada." };

  let fila: Fila;
  if (vivo) fila = vivo as Fila;
  else {
    const reserva = await admin.rpc("sri_reservar_comprobante", { p_venta: venta.id, p_emisor: emisor.id, p_ambiente: ambiente, p_usuario: d.usuarioId });
    const r = Array.isArray(reserva.data) ? reserva.data[0] : reserva.data;
    if (reserva.error || !r) return { ok: false, error: "No se pudo reservar el número de factura." };
    fila = { id: r.id, estado: "reservado", secuencial: r.secuencial, establecimiento: r.establecimiento, punto_emision: r.punto_emision, clave_acceso: null, xml_firmado: null };
  }
  const guardar = (cambios: Record<string, unknown>) => admin.from("comprobantes_sri").update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", fila.id);

  try {
    // 1) Construir y firmar (solo si todavía no está firmado)
    if (!fila.xml_firmado || !fila.clave_acceso) {
      const divisor = 1 + d.tarifaIva / 100;
      const objetivoBase = r2(total / divisor);
      const lineas = items.map((it, i) => {
        const bruto = Number(it.total_linea);
        return { it, i, base: r2(bruto / divisor), descuento: r2(Number(it.descuento) / divisor), cantidad: Number(it.cantidad) };
      });
      const dif = r2(objetivoBase - lineas.reduce((s, l) => s + l.base, 0));
      if (dif !== 0) { const mayor = lineas.reduce((a, b) => (b.base > a.base ? b : a)); mayor.base = r2(mayor.base + dif); }
      const ivaTotal = r2(objetivoBase * d.tarifaIva / 100);
      const ivaLineas = lineas.map((l) => r2(l.base * d.tarifaIva / 100));
      const difIva = r2(ivaTotal - ivaLineas.reduce((s, v) => s + v, 0));
      if (difIva !== 0) { const k = lineas.indexOf(lineas.reduce((a, b) => (b.base > a.base ? b : a))); ivaLineas[k] = r2(ivaLineas[k] + difIva); }
      const codigo = d.tarifaIva === 15 ? "4" : "0";
      const impuestoDe = (base: number, valor: number): ImpuestoFactura[] => [{ codigoPorcentaje: codigo, baseImponible: base, valor }];

      const fecha = new Date();
      const clave = generarClaveAcceso({ fecha, tipoComprobante: "01", ruc: emisor.ruc, ambiente: ambiente === "produccion" ? 2 : 1, establecimiento: fila.establecimiento, puntoEmision: fila.punto_emision, secuencial: fila.secuencial, codigoNumerico: String(Math.floor(Math.random() * 1e8)).padStart(8, "0"), tipoEmision: 1 });
      const pagosPorMetodo = new Map<string, number>();
      for (const p of venta.pagos_venta ?? []) pagosPorMetodo.set(p.metodo, (pagosPorMetodo.get(p.metodo) ?? 0) + Number(p.monto));
      const dominante = [...pagosPorMetodo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "otro";
      const importeTotal = r2(objetivoBase + ivaTotal);

      const datos: DatosFactura = {
        ambiente: ambiente === "produccion" ? 2 : 1, tipoEmision: 1, razonSocial: limpiar(emisor.razon_social, 300), nombreComercial: emisor.nombre_comercial ? limpiar(emisor.nombre_comercial, 300) : null,
        ruc: emisor.ruc, claveAcceso: clave, establecimiento: fila.establecimiento, puntoEmision: fila.punto_emision, secuencial: fila.secuencial,
        dirMatriz: limpiar(emisor.direccion_matriz, 300), regimen: emisor.regimen as DatosFactura["regimen"], fechaEmision: fecha, dirEstablecimiento: limpiar(emisor.direccion_establecimiento, 300),
        obligadoContabilidad: Boolean(emisor.obligado_contabilidad), tipoIdentificacionComprador: tipoId, razonSocialComprador: nombreComprador, identificacionComprador: identificacion,
        totalSinImpuestos: objetivoBase, totalDescuento: r2(lineas.reduce((s, l) => s + l.descuento, 0)), totalConImpuestos: impuestoDe(objetivoBase, ivaTotal), importeTotal,
        pagos: [{ formaPago: FORMA_PAGO[dominante] ?? "20", total: importeTotal }],
        detalles: lineas.map((l, k) => ({ codigoPrincipal: limpiar(l.it.producto_id ? String(l.it.producto_id).slice(0, 8) : `ITEM${l.i + 1}`, 25), descripcion: limpiar(l.it.descripcion || "Producto", 300), cantidad: l.cantidad, precioUnitario: l.cantidad > 0 ? (l.base + l.descuento) / l.cantidad : 0, descuento: l.descuento, precioTotalSinImpuesto: l.base, impuestos: impuestoDe(l.base, ivaLineas[k]) })),
        email: email || null,
      };
      const xml = construirFacturaXml(datos);

      const descarga = await admin.storage.from("firmas-sri").download(emisor.firma_ruta);
      const clavePlana = await admin.rpc("sri_clave_firma", { p_emisor: emisor.id });
      if (descarga.error || !descarga.data || clavePlana.error || !clavePlana.data) throw new Error("No se pudo leer la firma electrónica del emisor.");
      const material = leerP12(Buffer.from(await descarga.data.arrayBuffer()), clavePlana.data as string);
      const firmado = firmarComprobanteXml(xml, material);

      const g = await guardar({ clave_acceso: clave, xml_firmado: firmado, estado: "firmada", comprador_tipo_id: tipoId, comprador_identificacion: identificacion, comprador_nombre: nombreComprador, comprador_email: email || null, tarifa_iva: d.tarifaIva, subtotal: objetivoBase, iva: ivaTotal, total: importeTotal });
      if (g.error) throw new Error("No se pudo guardar el comprobante firmado.");
      fila = { ...fila, estado: "firmada", clave_acceso: clave, xml_firmado: firmado };
    }

    // 2) Enviar a recepción (si ya fue recibida, solo se consulta la autorización)
    let mensajes: MensajeSri[] = [];
    if (fila.estado !== "recibida") {
      const rec = await enviarComprobante(ambiente, fila.xml_firmado!);
      mensajes = rec.mensajes;
      const yaRegistrada = rec.mensajes.some((m) => ["43", "70"].includes(m.identificador));
      if (rec.estado === "DEVUELTA" && !yaRegistrada) {
        await guardar({ estado: "devuelta", mensajes: rec.mensajes });
        return { ok: false, error: `El SRI devolvió la factura: ${resumenMensajes(rec.mensajes) || "sin detalle"}` };
      }
      await guardar({ estado: "recibida", mensajes: rec.mensajes });
    }

    // 3) Consultar autorización (el SRI puede tardar unos segundos)
    for (let intento = 0; intento < 4; intento++) {
      await esperar(intento === 0 ? 2500 : 4000);
      const aut = await consultarAutorizacion(ambiente, fila.clave_acceso!);
      if (aut.estado === "AUTORIZADO") {
        await guardar({ estado: "autorizada", numero_autorizacion: aut.numeroAutorizacion, fecha_autorizacion: aut.fechaAutorizacion, mensajes: aut.mensajes });
        return { ok: true, estado: "autorizada", mensaje: `Factura ${fila.establecimiento}-${fila.punto_emision}-${String(fila.secuencial).padStart(9, "0")} autorizada por el SRI (${ambiente}).` };
      }
      if (aut.estado === "NO AUTORIZADO") {
        await guardar({ estado: "no_autorizada", mensajes: aut.mensajes });
        return { ok: false, error: `El SRI no autorizó la factura: ${resumenMensajes(aut.mensajes) || "sin detalle"}` };
      }
    }
    return { ok: true, estado: "recibida", mensaje: "El SRI recibió la factura pero aún no la autoriza. Vuelve a pulsar Emitir en unos minutos para consultar." };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido.";
    await admin.from("comprobantes_sri").update({ estado: fila.xml_firmado ? fila.estado : "error", mensajes: [{ identificador: "LUMOS", mensaje, informacionAdicional: "", tipo: "ERROR" }], actualizado_en: new Date().toISOString() }).eq("id", fila.id);
    return { ok: false, error: `No se pudo completar la emisión: ${mensaje}` };
  }
}
