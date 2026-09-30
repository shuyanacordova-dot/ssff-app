import Image from "next/image";
import { OPTICA_FOCUS, OPTICA_SACHA, OPTICA_SHUVISION, textoAvisoPrivacidad } from "@/lib/privacidad";

export default function PrivacidadPage() {
  return <main className="priv-page"><div className="priv-container"><header className="priv-header"><Image src="/logos/lumos-logo.png" alt="LumOS" width={140} height={70} style={{ objectFit: "contain" }} /><div><p className="priv-kicker">PROTECCIÓN DE DATOS</p><h1>Aviso de privacidad</h1><p>Información para pacientes de nuestras ópticas</p></div></header><p className="priv-draft">Borrador pendiente de revisión legal</p>{[OPTICA_SHUVISION, OPTICA_SACHA, OPTICA_FOCUS].map((optica) => <section className="priv-card" key={optica.optica}><h2>{optica.optica}</h2>{textoAvisoPrivacidad(optica).split("\n").slice(1).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}</div></main>;
}
