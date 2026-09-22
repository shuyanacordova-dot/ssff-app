import { getPrivateAdminData } from "@/lib/mi-espacio";
import PrivateAdminBoard from "./private-admin-board";

export const dynamic = "force-dynamic";

export default async function PrivateAdminPage() {
  return <PrivateAdminBoard {...await getPrivateAdminData()} />;
}
