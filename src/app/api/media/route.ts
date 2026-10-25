import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { parseBuffer } from "music-metadata";
import { serverDB } from "@/lib/supabase/server";
import { mediaVerifier } from "@/lib/supabase/media-admin";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reserve"),
    jobId: z.uuid(),
    kind: z.enum(["photo", "audio"]),
    stage: z.enum(["before", "after"]),
    mime: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
    ]),
    bytes: z.number().int().positive().max(5242880),
    duration: z.number().positive().max(60).nullable(),
  }),
  z.object({
    action: z.literal("finalize"),
    id: z.uuid(),
    path: z.string().max(200),
    kind: z.enum(["photo", "audio"]),
  }),
]);
export async function POST(req: NextRequest) {
  const reply = (data: unknown, status = 200) =>
    NextResponse.json(data, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (
    req.headers.get("origin") !==
    (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin)
  )
    return reply({ error: "Invalid request origin" }, 403);
  try {
    const p = schema.parse(await req.json());
    const db = await serverDB();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return reply({ error: "Sign in required" }, 401);
    if (p.action === "reserve") {
      const { data, error } = await db.rpc("reserve_upload", {
        p_job: p.jobId,
        p_kind: p.kind,
        p_stage: p.stage,
        p_mime: p.mime,
        p_bytes: p.bytes,
        p_duration: p.duration,
      });
      if (error) throw error;
      return reply(data);
    }
    const { data, error } = await db.storage.from("job-media").download(p.path);
    if (error) throw error;
    const bytes = Buffer.from(await data.arrayBuffer());
    if (p.kind === "photo") {
      const meta = await sharp(bytes, {
        limitInputPixels: 40000000,
      }).metadata();
      if (
        !["jpeg", "png", "webp"].includes(meta.format || "") ||
        bytes.length > 2097152
      )
        throw new Error("Unsupported photo or photo exceeds 2 MB");
    } else {
      const meta = await parseBuffer(bytes, undefined, { duration: true });
      if (!meta.format.duration || meta.format.duration > 60)
        throw new Error(
          "Audio duration could not be verified or exceeds 60 seconds",
        );
    }
    const finish = await mediaVerifier().rpc("finalize_upload", {
      p_id: p.id,
      p_actor: user.id,
      p_path: p.path,
      p_kind: p.kind,
    });
    if (finish.error) throw finish.error;
    return reply({ ok: true });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof Error
            ? e.message
            : (e as { message?: string }).message || "Upload failed",
      },
      422,
    );
  }
}
