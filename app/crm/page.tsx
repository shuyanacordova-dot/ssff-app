import { getCrmData } from "@/lib/crm";
import CrmBoard from "./crm-board";

export const dynamic = "force-dynamic";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ sucursal?: string }> }) {
  const query = await searchParams;
  return <CrmBoard {...await getCrmData(query.sucursal)} />;
}
