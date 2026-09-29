"use server";

import forge from "node-forge";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const denegado = "Solo la Superadministradora puede configurar la facturación";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function esSuperadmin() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("es_superadmin");
  return !error && data === true;
}

export async function guardarConfiguracion(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!await esSuperadmin()) return { ok: false, error: denegado };
    const id = String(form.get("emisor_id") ?? "");
    const nombre = String(form.get("nombre_comercial") ?? "").trim();
    const direccion = String(form.get("direccion_establecimiento") ?? "").trim();
    const establecimiento = String(form.get("codigo_establecimiento") ?? "");
    const punto = String(form.get("punto_emision") ?? "");
    if (!uuid.test(id) || !/^\d{3}$/.test(establecimiento) || !/^\d{3}$/.test(punto) || !direccion || nombre.length > 300 || direccion.length > 300) return { ok: false, error: "Revisa la dirección y los códigos de tres dígitos (máximo 300 caracteres por texto)." };
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("emisores_sri").update({ nombre_comercial: nombre || null, direccion_establecimiento: direccion, codigo_establecimiento: establecimiento, punto_emision: punto, actualizado_en: new Date().toISOString() }).eq("id", id).select("id").single();
    if (error || !data) return { ok: false, error: "No se pudo guardar la configuración." };
    revalidatePath("/facturacion/configuracion");
    return { ok: true };
  } catch { return { ok: false, error: "No se pudo guardar la configuración." }; }
}

type ResultadoFirma = { ok: true; titular: string; vence: string } | { ok: false; error: string };

export async function subirFirma(form: FormData): Promise<ResultadoFirma> {
  let buffer: Buffer | undefined;
  try {
    if (!await esSuperadmin()) return { ok: false, error: denegado };
    const id = String(form.get("emisor_id") ?? "");
    const archivo = form.get("firma");
    const clave = form.get("clave");
    if (!uuid.test(id)) return { ok: false, error: "Emisor inválido." };
    if (!(archivo instanceof File) || !/\.(p12|pfx)$/i.test(archivo.name) || archivo.size === 0 || archivo.size > 200 * 1024) return { ok: false, error: "Selecciona un archivo .p12 o .pfx de máximo 200 KB." };
    if (typeof clave !== "string" || !clave.length) return { ok: false, error: "Ingresa la clave de la firma." };
    const admin = createSupabaseAdminClient();
    const emisor = await admin.from("emisores_sri").select("id").eq("id", id).single();
    if (emisor.error || !emisor.data) return { ok: false, error: "Emisor no encontrado." };
    let titular: string;
    let vencimiento: Date;
    try {
      buffer = Buffer.from(await archivo.arrayBuffer());
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(buffer.toString("binary")), false, clave);
      const certificados = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
      const llaves = [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag].flatMap((tipo) => p12.getBags({ bagType: tipo })[tipo] ?? []);
      // Comparar la clave pública evita elegir el certificado de la CA o uno no relacionado.
      const certificado = certificados.find((bag: forge.pkcs12.Bag) => bag.cert && llaves.some((llave) => {
        const privada = llave.key as forge.pki.rsa.PrivateKey | undefined;
        if (!privada?.n || !privada.e) return false;
        const publica = bag.cert!.publicKey as forge.pki.rsa.PublicKey;
        return Boolean(publica.n && publica.e && publica.n.equals(privada.n) && publica.e.equals(privada.e));
      }))?.cert;
      if (!certificado) throw new Error();
      const cn = certificado.subject.getField("CN")?.value;
      if (typeof cn !== "string" || !cn.trim() || !Number.isFinite(certificado.validity.notAfter.getTime())) throw new Error();
      titular = cn.trim();
      vencimiento = certificado.validity.notAfter;
    } catch { return { ok: false, error: "La clave no corresponde a la firma o el archivo no es válido." }; }
    if (vencimiento.getTime() <= Date.now()) return { ok: false, error: "La firma electrónica está vencida." };
    const vence = vencimiento.toISOString().slice(0, 10);
    const ruta = `${id}.p12`;
    const upload = await admin.storage.from("firmas-sri").upload(ruta, buffer!, { upsert: true, contentType: "application/x-pkcs12" });
    if (upload.error) return { ok: false, error: "No se pudo guardar el archivo de firma. Intenta nuevamente." };
    const guardado = await admin.rpc("sri_guardar_firma", { p_emisor: id, p_ruta: ruta, p_clave: clave, p_titular: titular, p_vence: vence });
    if (guardado.error) return { ok: false, error: "El archivo se cargó, pero no se pudo completar el registro. Vuelve a subir la misma firma y su clave." };
    revalidatePath("/facturacion/configuracion");
    return { ok: true, titular, vence };
  } catch { return { ok: false, error: "No se pudo completar la carga de la firma. Intenta nuevamente." }; }
  finally {
    buffer?.fill(0);
    form.delete("clave");
    form.delete("firma");
  }
}
