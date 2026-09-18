import { getConveniosData } from "@/lib/convenios";
import ConveniosBoard from "./convenios-board";

export const dynamic = "force-dynamic";

export default async function ConveniosPage() {
  return <ConveniosBoard {...await getConveniosData()} />;
}
