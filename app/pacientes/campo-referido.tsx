"use client";

import { useEffect, useState } from "react";
import { buscarCodigoReferido } from "@/app/referidos/actions";

// Campo opcional de la ficha nueva: muestra el nombre de quien tiene el código para confirmarlo.
export default function CampoReferido({ empresaId }: { empresaId: string }) {
  const [codigo, setCodigo] = useState("");
  const [pista, setPista] = useState("");
  useEffect(() => {
    if (codigo.trim().length < 4) { setPista(""); return; }
    let vigente = true;
    const espera = setTimeout(() => {
      buscarCodigoReferido(empresaId, codigo)
        .then((r) => { if (vigente) setPista(r.encontrado ? `Código de ${r.nombre}. ¿Es esa persona?` : "No encontramos ese código (o el programa de referidos está apagado)."); })
        .catch(() => { if (vigente) setPista(""); });
    }, 400);
    return () => { vigente = false; clearTimeout(espera); };
  }, [codigo, empresaId]);
  return (
    <div className="new-patient-form" style={{ marginTop: 12 }}>
      <label className="task-description">¿Quién te refirió? (código, opcional)
        <input name="codigo_referido" value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase())} placeholder="Ej.: SHU-000458 o FOC-000235" autoComplete="off" />
      </label>
      {pista && <p className="field-hint">{pista}</p>}
    </div>
  );
}
