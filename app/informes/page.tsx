import { getInformesData } from "@/lib/informes";
import InformesBoard from "./informes-board";

export const dynamic = "force-dynamic";

export default async function InformesPage() {
  return <InformesBoard {...await getInformesData()} />;
}
