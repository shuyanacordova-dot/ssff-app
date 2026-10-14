import { getReferidosConfig } from "@/lib/referidos";
import ReferidosBoard from "./referidos-board";

export const dynamic = "force-dynamic";

export default async function ReferidosConfigPage() {
  return <ReferidosBoard {...await getReferidosConfig()} />;
}
