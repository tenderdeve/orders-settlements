import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { handler } from "@/lib/http";

export const POST = handler(async () => {
  // A 204 must have no body, so this cannot go through json().
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
