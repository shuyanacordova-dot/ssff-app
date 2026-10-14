import { getBillingData } from "@/lib/facturacion";
import BillingBoard from "./billing-board";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function BillingPage() {
  return <BillingBoard {...await getBillingData()} />;
}
