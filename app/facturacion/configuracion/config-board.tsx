"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarConfiguracion, subirFirma } from "./actions";

export type EmisorSri = {
  id: string; sucursal: string; razon_social: string | null; ruc: string;
  regimen: string | null; obligado_contabilidad: boolean; nombre_comercial: string | null;
  direccion_matriz: string | null; direccion_establecimiento: string | null;
  codigo_establecimiento: string; punto_emision: string; ambiente: string; siguiente_secuencial: number;
  firma_cargada: boolean; firma_titular: string | null; firma_vence: string | null;
};
const regimenes: Record<string, string> = { general: "Régimen general", rimpe_emprendedor: "RIMPE emprendedor", rimpe_negocio_popular: "RIMPE negocio popular" };
const fecha = (valor: string | null) => valor ? valor.split("-").reverse().join("/") : "Sin fecha";

function EmisorCard({ emisor: e, hoy }: { emisor: EmisorSri; hoy: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ error: boolean; texto: string } | null>(null);
  const dias = e.firma_vence ? (Date.parse(`${e.firma_vence}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000 : null;
  function guardar(form: HTMLFormElement) {
    const datos = new FormData(form);
    start(async () => {
      setAviso(null);
      try {
        const result = await guardarConfiguracion(datos);
        setAviso({ error: !result.ok, texto: result.ok ? "Configuración guardada." : result.error });
        if (result.ok) router.refresh();
      } catch { setAviso({ error: true, texto: "No se pudo guardar la configuración." }); }
    });
  }
  function cargar(form: HTMLFormElement) {
    const datos = new FormData(form);
    const password = form.elements.namedItem("clave") as HTMLInputElement;
    password.value = "";
    const archivo = datos.get("firma");
    if (!(archivo instanceof File) || !/\.(p12|pfx)$/i.test(archivo.name) || archivo.size === 0 || archivo.size > 200 * 1024) {
      datos.delete("clave"); datos.delete("firma");
      setAviso({ error: true, texto: "Selecciona un archivo .p12 o .pfx de máximo 200 KB." });
      return;
    }
    start(async () => {
      setAviso(null);
      try {
        const result = await subirFirma(datos);
        setAviso({ error: !result.ok, texto: result.ok ? `Firma cargada · titular ${result.titular} · vence ${fecha(result.vence)}` : result.error });
        if (result.ok) { form.reset(); router.refresh(); }
      } catch { setAviso({ error: true, texto: "No se pudo completar la carga. Intenta nuevamente." }); }
      finally { password.value = ""; datos.delete("clave"); datos.delete("firma"); }
    });
  }
  return <section className="glass agenda-board" style={{ marginBottom: 20 }}>
    <p className="section-label">EMISOR</p><h2>{e.sucursal}</h2>
    <dl className="new-patient-form">
      <div><dt>Razón social</dt><dd>{e.razon_social || "Por confirmar"}</dd></div>
      <div><dt>RUC</dt><dd>{e.ruc}</dd></div>
      <div><dt>Régimen</dt><dd>{regimenes[e.regimen ?? ""] ?? "Por confirmar"}</dd></div>
      <div><dt>Obligado a contabilidad</dt><dd>{e.obligado_contabilidad ? "Sí" : "No"}</dd></div>
      <div><dt>Establecimiento y punto</dt><dd>{e.codigo_establecimiento}-{e.punto_emision}</dd></div>
      <div><dt>Dirección matriz</dt><dd>{e.direccion_matriz || "Por confirmar"}</dd></div>
      <div><dt>Ambiente</dt><dd><span className="state-pill">{e.ambiente === "produccion" ? "Producción" : "Pruebas"}</span></dd></div>
      <div><dt>Siguiente secuencial</dt><dd>{String(e.siguiente_secuencial).padStart(9, "0")}</dd></div>
    </dl>
    <p style={dias !== null && dias < 30 ? { color: "#b42318" } : undefined}>
      {e.firma_cargada ? `Firma cargada · titular ${e.firma_titular || "Sin titular"} · vence ${fecha(e.firma_vence)}` : "Sin firma"}
      {e.firma_cargada && dias !== null && dias < 30 && <strong> · {dias < 0 ? "Firma vencida" : "Vence en menos de 30 días"}</strong>}
    </p>
    <form onSubmit={(event) => { event.preventDefault(); guardar(event.currentTarget); }}>
      <input type="hidden" name="emisor_id" value={e.id} />
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0 }}><legend className="section-label">DATOS EDITABLES</legend>
        <div className="new-patient-form">
          <label>Nombre comercial<input name="nombre_comercial" defaultValue={e.nombre_comercial ?? ""} maxLength={300} /></label>
          <label>Dirección del establecimiento<input name="direccion_establecimiento" defaultValue={e.direccion_establecimiento ?? ""} maxLength={300} required /></label>
          <label>Código de establecimiento<input name="codigo_establecimiento" defaultValue={e.codigo_establecimiento} inputMode="numeric" pattern="[0-9]{3}" minLength={3} maxLength={3} required /></label>
          <label>Punto de emisión<input name="punto_emision" defaultValue={e.punto_emision} inputMode="numeric" pattern="[0-9]{3}" minLength={3} maxLength={3} required /></label>
        </div><div className="modal-actions"><button className="outline-action" type="submit">Guardar datos</button></div>
      </fieldset>
    </form>
    <form autoComplete="off" onSubmit={(event) => { event.preventDefault(); cargar(event.currentTarget); }}>
      <input type="hidden" name="emisor_id" value={e.id} />
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0 }}><legend className="section-label">FIRMA ELECTRÓNICA</legend>
        <div className="new-patient-form">
          <label>Archivo de firma (máximo 200 KB)<input name="firma" type="file" accept=".p12,.pfx" required /></label>
          <label>Clave de la firma<input name="clave" type="password" autoComplete="off" required /></label>
        </div><div className="modal-actions"><button className="new-consultation" type="submit">{pending ? "Guardando…" : "Subir firma electrónica (.p12)"}</button></div>
      </fieldset>
    </form>
    {aviso && <p role={aviso.error ? "alert" : "status"} className="notice" style={aviso.error ? { color: "#b42318" } : undefined}>{aviso.texto}</p>}
  </section>;
}

export default function ConfigBoard({ emisores, hoy }: { emisores: EmisorSri[]; hoy: string }) {
  return <>{emisores.length ? emisores.map((emisor) => <EmisorCard key={emisor.id} emisor={emisor} hoy={hoy} />) : <p className="notice">No hay emisores configurados.</p>}</>;
}
