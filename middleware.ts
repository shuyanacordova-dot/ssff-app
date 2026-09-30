import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/privacidad" || request.nextUrl.pathname.startsWith("/privacidad/")) return (await import("next/server")).NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)"],
};
