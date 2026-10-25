import { NextRequest, NextResponse } from "next/server";
import { serverDB } from "@/lib/supabase/server";
import { z } from "zod";
import { termsSchema } from "@/lib/domain";
export const dynamic = "force-dynamic";
const schema = z.object({
  action: z.enum([
    "onboard",
    "create",
    "brief",
    "invite",
    "quote",
    "counter",
    "accept",
    "start",
    "change",
    "decide_change",
    "complete",
    "confirm_completion",
    "message",
    "read_notifications",
    "cancel",
    "decide_cancel",
    "dispute",
  ]),
  jobId: z.uuid().nullable().optional(),
  expectedVersion: z.number().int().min(0).optional(),
  key: z.uuid(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export async function POST(request: NextRequest) {
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (
    request.headers.get("origin") !==
    (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin)
  )
    return reply(
      { error: { code: "FORBIDDEN", message: "Invalid request origin" } },
      403,
    );
  if (Number(request.headers.get("content-length") || 0) > 65536)
    return reply(
      { error: { code: "INVALID", message: "Request too large" } },
      413,
    );
  try {
    const body = schema.parse(await request.json());
    if (body.payload.terms)
      body.payload.terms = termsSchema.parse(body.payload.terms);
    const db = await serverDB();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return reply(
        { error: { code: "UNAUTHENTICATED", message: "Please sign in" } },
        401,
      );
    const { data, error } = await db.rpc("command", {
      p_action: body.action,
      p_job: body.jobId ?? null,
      p_expected: body.expectedVersion ?? 0,
      p_key: body.key,
      p_payload: body.payload,
    });
    if (error) {
      const status =
        error.code === "40001"
          ? 409
          : error.code === "42501"
            ? 403
            : error.code === "P0429"
              ? 429
              : 422;
      return reply(
        { error: { code: error.code, message: error.message } },
        status,
      );
    }
    return reply({ data });
  } catch (e) {
    return reply(
      {
        error: {
          code: "INVALID",
          message: e instanceof Error ? e.message : "Invalid request",
        },
      },
      422,
    );
  }
}
