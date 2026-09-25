"use client";

import { useEffect, useState, useTransition } from "react";
import { PackageCheck } from "lucide-react";
import { buscarLunasStock, usarLunaStock, type LunaStockMatch } from "@/app/inventario/lunas-actions";
import { parseRxNumber } from "@/lib/rx-number";
import type { OrdenLaboratorioRx } from "@/lib/laboratorio";

type Coincidencias = { od: LunaStockMatch[]; oi: LunaStockMatch[] };
const fmt = (n: number | null) => n === null ? "" : `${n > 0 ? "+" : ""}${Number(n).toFixed(2)}`;

export default function LunasStockAlert({ empresaId, rx, orderId, patientName }: { empresaId: string; rx: OrdenLaboratorioRx; orderId: string | null; patientName: string }) {
  const [matches, setMatches] = useState<Coincidencias>({ od: [], oi: [] });
  const [usadas, setUsadas] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const key = JSON.stringify([rx.od.esfera, rx.od.cilindro, rx.od.eje, rx.od.add, rx.od.procesar, rx.oi.esfera, rx.oi.cilindro, rx.oi.eje, rx.oi.add, rx.oi.procesar]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      const buscar = async (eye: "od" | "oi") => {
        const v = rx[eye]; const esfera = parseRxNumber(v.esfera);
        if (!v.procesar || esfera === null) return [];
        return buscarLunasStock(empresaId, esfera, parseRxNumber(v.cilindro) ?? 0, parseRxNumber(v.eje), parseRxNumber(v.add));
      };
      const [od, oi] = await Promise.all([buscar("od"), buscar("oi")]);
      if (active) setMatches({ od, oi });
    }, 500);
    return () => { active = false; window.clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, key]);

  const total = matches.od.length + matches.oi.length;
  if (!total) return null;
  const usar = (luna: LunaStockMatch, eye: "od" | "oi") => startTransition(async () => {
    setError("");
    try {
      const restantes = await usarLunaStock(luna.id, orderId, `${eye.toUpperCase()} · ${patientName}`);
      setUsadas((prev) => ({ ...prev, [luna.id]: restantes }));
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo usar la luna."); }
  });

  return <div className="notice" style={{ display: "block", marginTop: 12 }}>
    <strong><PackageCheck size={16} style={{ verticalAlign: "-3px" }} /> Tienes lunas guardadas que coinciden con esta graduación</strong>
    {(["od", "oi"] as const).map((eye) => matches[eye].length ? <div key={eye} style={{ marginTop: 8 }}>
      <p className="section-label">{eye.toUpperCase()}</p>
      {matches[eye].map((luna) => <div key={luna.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
        <span className={`state-pill ${luna.origen === "garantia" ? "aprobada" : ""}`}>{luna.origen === "garantia" ? "De garantía" : "En bodega"}</span>
        <span>{fmt(luna.esfera)} {luna.cilindro ? `${fmt(luna.cilindro)}${luna.tallada && luna.eje !== null ? ` × ${luna.eje}°` : ""}` : "esf."}{luna.adicion ? ` · Add ${fmt(luna.adicion)}` : ""} · {[luna.tipo, luna.material, luna.indice, luna.tratamiento].filter(Boolean).join(" · ")} · {luna.sucursal} · {usadas[luna.id] ?? luna.cantidad} disp.</span>
        {usadas[luna.id] === undefined ? <button type="button" className="outline-action" disabled={pending} onClick={() => usar(luna, eye)}>Usar esta luna</button> : <span className="field-hint">Usada ✓</span>}
      </div>)}
    </div> : null)}
    {error && <p role="alert">{error}</p>}
  </div>;
}
