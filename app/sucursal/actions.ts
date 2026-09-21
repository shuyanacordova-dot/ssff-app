"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTIVE_BRANCH_COOKIE, getOperationalContext } from "@/lib/operational-context";

export async function seleccionarSucursalActiva(sucursalId: string) {
  const context = await getOperationalContext();
  if (!context) throw new Error("Tu sesión no está disponible.");
  if (!context.accessibleBranches.some((branch) => branch.id === sucursalId)) throw new Error("No tienes acceso a esa sucursal.");
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BRANCH_COOKIE, sucursalId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/");
  revalidatePath("/pacientes");
  revalidatePath("/ventas");
  revalidatePath("/agenda");
  revalidatePath("/inventario");
  revalidatePath("/caja");
}
