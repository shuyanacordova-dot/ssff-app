import { getBillingData } from "@/lib/facturacion";
import BillingBoard from "./billing-board";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  return <BillingBoard {...await getBillingData()} />;
}
