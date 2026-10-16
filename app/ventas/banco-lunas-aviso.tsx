"use client";

import { useEffect, useState } from "react";
import { PackageCheck } from "lucide-react";
import { buscarLunasStock, type LunaStockMatch } from "@/app/inventario/lunas-actions";
import { parseRxNumber } from "@/lib/rx-number";

export type RxOjo = { esfera: string; cilindro: string; eje: string; add: string };
export type RxBanco = { od: RxOjo; oi: RxOjo };

const fmt = (n: number | null) => n === null ? "" : `${n > 0 ? "+" : ""}${Number(n).toFixed(2)}`;
const medida = (v: RxOjo) => `${fmt(parseRxNumber(v.esfera))}${parseRxNumber(v.cilindro) ? ` ${fmt(-Math.abs(parseRxNumber(v.cilindro)!))}` : ""}`;

/** Lunas del banco que coinciden con la receta final. Solo informa: la luna se descarga al crear la orden de laboratorio. */
export default function BancoLunasAviso({ empresaId, rx, pista, ventana }: { empresaId: string; rx: RxBanco; pista?: string; ventana?: { titulo: string; subtitulo: string; onClose: () => void } }) {
  const [matches, setMatches] = useState<{ od: LunaStockMatch[]; oi: LunaStockMatch[] } | null>(null);
  const key = JSON.stringify(rx);

  useEffect(() => {
    let active = true;
    (async () => {
      const buscar = async (v: RxOjo) => {
        const esfera = parseRxNumber(v.esfera);
        if (esfera === null) return [];
        const add = parseRxNumber(v.add);
        const lista = await buscarLunasStock(empresaId, esfera, parseRxNumber(v.cilindro) ?? 0, parseRxNumber(v.eje), null);
        // Las lunas del banco sin adición (monofocales) sirven siempre; las que traen adición solo si coincide.
        return lista.filter((l) => !l.adicion || l.adicion === add);
      };
      const [od, oi] = await Promise.all([buscar(rx.od), buscar(rx.oi)]);
      if (active) setMatches({ od, oi });
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, key]);

  if (!matches || (!matches.od.length && !matches.oi.length)) return null;
  const tieneAdd = Boolean(parseRxNumber(rx.od.add) || parseRxNumber(rx.oi.add));
  const tarjeta = <div className="notice" style={{ display: "block", marginTop: 12 }}>
    <strong><PackageCheck size={16} style={{ verticalAlign: "-3px" }} /> Tienes esta medida en el banco de lunas</strong>
    {(["od", "oi"] as const).map((eye) => <div key={eye} style={{ marginTop: 8 }}>
      <p className="section-label">{eye.toUpperCase()} · {medida(rx[eye]) || "sin medida"}</p>
      {matches[eye].length ? matches[eye].map((l) => <p key={l.id} style={{ margin: "3px 0" }}>
        <span className={`state-pill ${l.origen === "garantia" ? "aprobada" : ""}`}>{l.origen === "garantia" ? "De garantía" : "En bodega"}</span>{" "}
        {[l.material, l.indice, l.tratamiento].filter(Boolean).join(" · ")} · <strong>{l.cantidad} disponible{l.cantidad === 1 ? "" : "s"}</strong> · {l.sucursal}
      </p>) : <p className="field-hint" style={{ margin: "3px 0" }}>No hay en el banco.</p>}
    </div>)}
    <p className="field-hint" style={{ marginTop: 8 }}>{pista ?? "Si haces la venta con esta medida, al crear la orden de laboratorio verás el botón “Descargar del banco”."}{tieneAdd ? " Ojo: son lunas sin adición (monofocales)." : ""}</p>
  </div>;
  if (!ventana) return tarjeta;
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-label={ventana.titulo}>
    <p className="section-label">{ventana.titulo}</p><h2>{ventana.subtitulo}</h2>{tarjeta}
    <div className="modal-actions"><button className="new-consultation" type="button" onClick={ventana.onClose}>Entendido</button></div>
  </section></div>;
}
