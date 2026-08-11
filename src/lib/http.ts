import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { log } from "./log";

/**
 * Every error response in this application is
 * `{ error: { code, message, details?, hint? } }`, and every one carries an
 * actionable `hint` — the assessment grades validation errors on whether they
 * tell the caller how to fix the request.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public hint?: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

/** path-keyed field errors: { "lineItems.0.quantity": ["Quantity must be at least 1"] } */
function fieldErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of err.issues) (out[i.path.join(".") || "_"] ??= []).push(i.message);
  return out;
}

export function fail(e: unknown) {
  if (e instanceof ApiError) {
    return json(
      { error: { code: e.code, message: e.message, details: e.details, hint: e.hint } },
      e.status,
    );
  }
  if (e instanceof ZodError) {
    return json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request body is invalid.",
          details: { fieldErrors: fieldErrors(e) },
          hint: "Correct the listed fields and resubmit.",
        },
      },
      422,
    );
  }
  return json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side." } },
    500,
  );
}

/** Wraps every route handler: request id, structured access log, uniform errors. */
export function handler<Ctx extends object>(
  fn: (req: NextRequest, ctx: Ctx & { requestId: string }) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    const started = Date.now();
    let res: Response;
    try {
      res = await fn(req, { ...ctx, requestId });
    } catch (e) {
      res = fail(e);
      if (res.status >= 500) log.error({ evt: "unhandled", requestId, err: String(e) });
    }
    res.headers.set("x-request-id", requestId);
    log.info({
      evt: "request",
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      status: res.status,
      ms: Date.now() - started,
    });
    return res;
  };
}
