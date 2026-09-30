export const CONSENTIMIENTO_VERSION = "v1-2026-09";

export type DatosOpticaPrivacidad = { optica: string; responsable: string; ruc: string; direccion: string; contacto: string };

export const OPTICA_SHUVISION: DatosOpticaPrivacidad = {
  optica: "Shuvisión", responsable: "ELISA SHUYANA CÓRDOVA CAJAS", ruc: "1804006391001",
  direccion: "Av. Napo y Siona, Shushufindi", contacto: "0979408384 · shuvisionoptica@gmail.com",
};
export const OPTICA_SACHA: DatosOpticaPrivacidad = {
  optica: "Shuvisión Sacha", responsable: "CAJAS RODAS JASSYRA ELIZABETH", ruc: "2100060470001",
  direccion: "Av. de los Fundadores N3A-21 y Cristóbal Colón, La Joya de los Sachas", contacto: "En la óptica o por medio de Shuvisión: 0979408384 · shuvisionoptica@gmail.com",
};
export const OPTICA_FOCUS: DatosOpticaPrivacidad = {
  optica: "Focus Óptica", responsable: "BALSECA TIPÁN ERICK ANDRÉS", ruc: "1722305412001",
  direccion: "Av. 11 de Julio y Napo, Shushufindi", contacto: "En la óptica; o por teléfono/correo facilitados por Focus al paciente",
};

const encabezado = ({ optica, responsable, ruc, direccion, contacto }: DatosOpticaPrivacidad) =>
  `${optica}. Responsable del tratamiento: ${responsable}, RUC ${ruc}. Dirección: ${direccion}. Contacto: ${contacto}.`;

const contenido = `Tratamos datos de identificación y contacto, historia clínica y optométrica, fotografías, ventas y pagos. Los usamos para la atención optométrica y la historia clínica; pedidos de lentes a laboratorios externos; ventas, facturación y cobro; y recordatorios y seguimiento por WhatsApp o teléfono. Los datos de salud son sensibles y solo los tratamos con el consentimiento explícito del paciente o de su representante legal si es menor de edad.
Podemos comunicar los datos necesarios a laboratorios ópticos para preparar los lentes, al SRI para facturación electrónica y a proveedores tecnológicos que alojan el sistema en la nube. Algunos proveedores pueden estar fuera de Ecuador; aplicamos medidas de seguridad para proteger los datos. La historia clínica se conserva durante el tiempo exigido por las normas sanitarias; los demás datos, mientras exista una relación con la óptica o una obligación legal.
Puede solicitar acceso, rectificación, eliminación, oposición, portabilidad o suspensión del tratamiento en la óptica o por el correo o teléfono indicado arriba. Puede revocar su consentimiento en cualquier momento por esos canales; la revocación no afecta tratamientos anteriores ni obligaciones legales de conservación. Si considera que sus derechos fueron vulnerados, puede reclamar ante la Superintendencia de Protección de Datos Personales.`;

export const textoAvisoPrivacidad = (opts: DatosOpticaPrivacidad) =>
  `Borrador pendiente de revisión legal\n${encabezado(opts)}\n${contenido}`;

export const textoConsentimiento = (opts: DatosOpticaPrivacidad) =>
  `Borrador pendiente de revisión legal\n${encabezado(opts)}\n${contenido}\nDeclaro que recibí y comprendí esta información y autorizo expresamente el tratamiento de mis datos personales, incluidos los datos de salud, para las finalidades indicadas. Si el paciente es menor de edad, esta autorización la otorga su representante legal. Aviso completo: https://ssff-app.vercel.app/privacidad`;
