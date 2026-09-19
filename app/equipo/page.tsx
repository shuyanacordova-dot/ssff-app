import { getEquipoData } from "@/lib/equipo";
import EquipoBoard from "./equipo-board";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  return <EquipoBoard {...await getEquipoData()} />;
}
