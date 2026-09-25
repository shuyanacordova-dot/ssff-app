"use client";

import { useId, useState } from "react";
import { normalizeRxNumber, parseRxNumber, stepRxNumber, type RxNumberKind } from "@/lib/rx-number";
import styles from "./rx-number-field.module.css";

type Props = {
  label: string; kind: RxNumberKind; name?: string; value: string;
  onChange: (value: string) => void; disabled?: boolean;
  onTranspose?: (positiveCylinder: string) => void;
};

export default function RxNumberField({ label, kind, name, value, onChange, disabled, onTranspose }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [negative, setNegative] = useState(false);
  const [positiveCylinder, setPositiveCylinder] = useState<string | null>(null);
  const normalized = normalizeRxNumber(value, kind);
  const number = parseRxNumber(value);
  const isNegative = (number ?? 0) < 0 || (!number && negative);
  const positive = positiveCylinder ?? (kind === "cilindro" && (parseRxNumber(value) ?? 0) > 0 ? value : null);
  const commit = (next: string) => { setDraft(null); onChange(normalizeRxNumber(next, kind)); };
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.value}>
      {kind === "esfera" && <button type="button" disabled={disabled} aria-label={`Cambiar signo de ${label}`} aria-pressed={isNegative} onClick={() => {
        const minus = !isNegative;
        setNegative(minus);
        commit(String(Math.abs(parseRxNumber(value) ?? 0) * (minus ? -1 : 1)));
      }}>{isNegative ? "−" : "+"}</button>}
      <input id={id} inputMode={kind === "eje" ? "numeric" : "decimal"} disabled={disabled} value={draft ?? normalized} placeholder={kind === "eje" ? "0–180" : "0.00"} aria-describedby={positive ? `${id}-hint` : undefined}
        onFocus={() => { const n = parseRxNumber(value); if (n) setNegative(n < 0); setDraft(kind === "esfera" && n !== null ? String(Math.abs(n)) : normalized); }}
        onChange={(event) => {
          const raw = event.target.value.replace(/−/g, "-").replace(/,/g, ".");
          if (!/^[+-]?\d*(?:\.\d*)?$/.test(raw)) return;
          setDraft(raw);
          const n = parseRxNumber(raw);
          if (kind === "cilindro") setPositiveCylinder(n !== null && n > 0 ? raw : null);
          if (kind === "esfera" && /^[+-]/.test(raw)) setNegative(raw.startsWith("-"));
          onChange(normalizeRxNumber(kind === "esfera" && negative && !/^[+-]/.test(raw) && n !== null ? String(-Math.abs(n)) : raw, kind));
        }} onBlur={() => setDraft(null)} />
    </div>
    {name && <input type="hidden" name={name} value={normalized} disabled={disabled} />}
    <div className={styles.steps}>
      <button type="button" disabled={disabled} aria-label={`Disminuir ${label}`} onClick={() => { setNegative(false); setPositiveCylinder(null); commit(stepRxNumber(value, kind, -1)); }}>−</button>
      <button type="button" disabled={disabled} aria-label={`Aumentar ${label}`} onClick={() => { setNegative(false); setPositiveCylinder(null); commit(stepRxNumber(value, kind, 1)); }}>+</button>
    </div>
    {positive && <small id={`${id}-hint`}>Se usa cilindro negativo{onTranspose && <>. <button className={styles.link} type="button" disabled={disabled} onClick={() => { onTranspose(positive); setPositiveCylinder(null); setDraft(null); }}>Transponer</button></>}</small>}
  </div>;
}
