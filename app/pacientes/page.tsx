import { getClinicalData } from "@/lib/clinical";
import PatientClinicalClient from "./patient-clinical-client";

export const dynamic = "force-dynamic";

export default async function PacientesPage({ searchParams }: { searchParams: Promise<{ new?: string; buscar?: string }> }) {
  const query = await searchParams;
  return <PatientClinicalClient {...await getClinicalData()} autoCreate={query.new === "1"} initialSearch={query.buscar} />;
}
