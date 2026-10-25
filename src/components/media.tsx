"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Mic, Square, Upload, X } from "lucide-react";
import { browserDB } from "@/lib/supabase/client";
import type { Row } from "@/lib/domain";
async function compress(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Unable to prepare photo"))),
      "image/jpeg",
      0.82,
    ),
  );
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
async function audioDuration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => {
        if (Number.isFinite(a.duration)) resolve(a.duration);
        else {
          a.currentTime = 1e10;
          a.ontimeupdate = () => {
            resolve(a.currentTime);
            a.ontimeupdate = null;
          };
        }
      };
      a.onerror = () =>
        reject(
          new Error(
            "This audio format cannot be previewed. Try another recording.",
          ),
        );
      a.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function Media({
  job,
  profile,
  attachments,
  refresh,
}: {
  job: Row;
  profile: Row;
  attachments: Row[];
  refresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<{
      file: File;
      duration: number | null;
      url: string;
    } | null>(null),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [urls, setUrls] = useState<Record<string, string>>({});
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    reservation = useRef<Row | null>(null),
    selectedRef = useRef(selected);
  const canUpload =
    (profile.id === job.customer_id || profile.id === job.worker_id) &&
    !["completed", "cancelled"].includes(job.status);
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      attachments.map(async (a) => {
        const r = await browserDB()
          .storage.from("job-media")
          .createSignedUrl(a.path, 300);
        return [a.id, r.data?.signedUrl || ""];
      }),
    ).then((entries) => {
      if (!cancelled) setUrls(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [attachments]);
  useEffect(() => {
    selectedRef.current = selected;
    return () => {
      if (selected) URL.revokeObjectURL(selected.url);
    };
  }, [selected]);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state !== "inactive") recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const pick = async (file: File, duration?: number) => {
    setError("");
    reservation.current = null;
    try {
      if (file.type.startsWith("image/")) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw new Error("Choose a JPEG, PNG, or WebP photo.");
        if (file.size > 20000000)
          throw new Error("Choose a source photo smaller than 20 MB.");
        file = await compress(file);
        if (file.size > 2097152)
          throw new Error("Photo exceeds 2 MB. Choose a smaller photo.");
        setSelected({ file, duration: null, url: URL.createObjectURL(file) });
      } else {
        if (
          !["audio/webm", "audio/mp4", "audio/ogg"].includes(
            file.type.split(";")[0],
          )
        )
          throw new Error("Choose a WebM, MP4, or Ogg voice recording.");
        const d = duration ?? (await audioDuration(file));
        if (d > 60 || d <= 0 || file.size > 5242880)
          throw new Error("Voice notes must be within 60 seconds and 5 MB.");
        file = new File([file], file.name, { type: file.type.split(";")[0] });
        setSelected({ file, duration: d, url: URL.createObjectURL(file) });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const record = async () => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Recording is unavailable in this browser. Upload a voice file or type the description.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      if (!type)
        throw new Error(
          "No supported recording format. Upload a file instead.",
        );
      const r = new MediaRecorder(stream.current, { mimeType: type });
      recorder.current = r;
      const chunks: Blob[] = [];
      const started = Date.now();
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setRecording(false);
        const duration = Math.min(60, (Date.now() - started) / 1000);
        void pick(new File(chunks, "voice-note", { type }), duration);
      };
      r.start(250);
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 59 && r.state === "recording") r.stop();
      }, 250);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        `${(e as Error).message} You can still upload a file or continue with text.`,
      );
    }
  };
  const upload = async () => {
    if (!selected) return;
    setError("");
    const kind = selected.duration === null ? "photo" : "audio";
    try {
      setProgress("Preparing secure upload…");
      if (!reservation.current) {
        const r = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reserve",
            jobId: job.id,
            kind,
            stage: profile.id === job.worker_id ? "after" : "before",
            mime: selected.file.type,
            bytes: selected.file.size,
            duration: selected.duration,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        reservation.current = data;
      }
      const reserve = reservation.current!;
      setProgress("Uploading file…");
      if (!reserve.uploaded) {
        const { error } = await browserDB()
          .storage.from("job-media")
          .upload(reserve.path, selected.file, {
            contentType: selected.file.type,
            upsert: false,
          });
        if (error) throw error;
        reserve.uploaded = true;
      }
      setProgress("Verifying attachment…");
      const r = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          id: reserve.id,
          path: reserve.path,
          kind,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSelected(null);
      reservation.current = null;
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress("");
    }
  };
  return (
    <section className="panel">
      <h2>Photos & voice notes</h2>
      <p>
        Attachments are shared with invited workers. Avoid including personal
        documents or contact details.
      </p>
      <div className="media-grid">
        {attachments.map((a) => (
          <figure key={a.id}>
            {urls[a.id] ? (
              a.kind === "photo" ? (
                <a href={urls[a.id]} target="_blank" rel="noreferrer">
                  <img src={urls[a.id]} alt={`${a.stage} repair evidence`} />
                </a>
              ) : (
                <audio controls src={urls[a.id]} />
              )
            ) : (
              <p>Loading private media…</p>
            )}
            <figcaption>
              {a.stage} · {a.kind}
            </figcaption>
          </figure>
        ))}
      </div>
      {canUpload && (
        <>
          <div className="actions">
            <label className="button secondary file-button">
              <ImagePlus size={18} />
              Choose photo / audio
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,audio/webm,audio/mp4,audio/ogg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void pick(f);
                  e.target.value = "";
                }}
                disabled={!!progress || recording}
              />
            </label>
            <button
              className="button secondary"
              disabled={!!progress}
              onClick={() =>
                recording ? recorder.current?.stop() : void record()
              }
            >
              {recording ? <Square size={17} /> : <Mic size={17} />}{" "}
              {recording ? `Stop · ${seconds}s` : "Record voice note"}
            </button>
          </div>
          <p className="hint">
            4 photos per stage (2 MB each) · 1 voice note (60 seconds / 5 MB).
            Photos are resized and metadata removed.
          </p>
          {selected && (
            <div className="media-preview">
              {selected.duration === null ? (
                <img src={selected.url} alt="Selected photo preview" />
              ) : (
                <audio controls src={selected.url} />
              )}
              <div className="actions">
                <button
                  className="button primary"
                  disabled={!!progress}
                  onClick={upload}
                >
                  <Upload size={17} />
                  {progress || "Upload attachment"}
                </button>
                <button
                  className="button secondary"
                  disabled={!!progress}
                  onClick={() => {
                    setSelected(null);
                    reservation.current = null;
                  }}
                >
                  <X size={17} />
                  Remove
                </button>
              </div>
            </div>
          )}
          {progress && <p role="status">{progress}</p>}
          {error && (
            <p role="alert" className="error">
              {error}{" "}
              {selected && (
                <button disabled={!!progress} onClick={upload}>
                  Retry upload
                </button>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
