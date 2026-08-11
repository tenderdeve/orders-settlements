import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { ApiError } from "./http";

export const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set — copy .env.example to .env");
  return new TextEncoder().encode(s);
};

export type SessionUser = { id: string; email: string };

// Cost 10 is a deliberate trade against serverless cold-start budget.
export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export const signSession = (u: SessionUser) =>
  new SignJWT({ email: u.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: payload.sub!, email: payload.email as string };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

/**
 * API routes: read the session off the request rather than from next/headers, so
 * integration tests can import a route handler and call it with a plain
 * NextRequest — no dev server, no supertest, no request-scope errors.
 */
export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySession(token) : null;
  if (!user) {
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "You must be signed in to do that.",
      undefined,
      "Sign in and retry the request.",
    );
  }
  return user;
}

/** Server Components only. */
export async function getPageUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? await verifySession(token) : null;
}
