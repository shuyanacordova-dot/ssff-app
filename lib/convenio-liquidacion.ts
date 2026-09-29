// Convenio del Sindicato de Trabajadores del Municipio, identificado en la importación original.
export const CONVENIO_SINDICATO_MUNICIPIO = "268ac214-830b-4b38-956c-8b13865fb676";

export function liquidarConvenio(convenioId: string, importes: number[]) {
  const brutoCentavos = importes.reduce((sum, importe) => sum + Math.round(importe * 100), 0);
  const porcentaje = convenioId === CONVENIO_SINDICATO_MUNICIPIO ? 5 : 0;
  const retencionCentavos = Math.round(brutoCentavos * porcentaje / 100);
  return { bruto: brutoCentavos / 100, porcentaje, retencion: retencionCentavos / 100, neto: (brutoCentavos - retencionCentavos) / 100 };
}
