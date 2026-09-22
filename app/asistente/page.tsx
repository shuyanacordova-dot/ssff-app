import Link from "next/link";
import AssistantBoard from "./assistant-board";
import { getOperationalContext } from "@/lib/operational-context";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const context = await getOperationalContext();
  if (!context) return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">ASISTENTE</p><h1>Asistente Shu</h1><p className="subtitle">Inicia sesión con un usuario activo para utilizar esta función.</p></div><Link className="primary-link" href="/login?next=/asistente">Iniciar sesión</Link></header></div></main>;
  const configured = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  return <AssistantBoard configured={configured} />;
}
