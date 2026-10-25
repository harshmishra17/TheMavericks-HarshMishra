"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  MapPin,
  Plus,
  Printer,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { browserDB } from "@/lib/supabase/client";
import {
  buildBrief,
  defaultTerms,
  money,
  questions,
  termsSchema,
  total,
  type Row,
  type Terms,
} from "@/lib/domain";
import { command } from "./application";
import { Media } from "./media";
const requestSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(4000),
  area: z.string().min(2).max(200),
  address: z.string().min(5).max(1000),
});
export function NewJob() {
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
  });
  const key = useRef(crypto.randomUUID());
  return (
    <section className="workspace">
      <Link className="back" href="/customer/jobs">
        <ArrowLeft size={16} />
        My jobs
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LET’S GET CLEAR ON THE PROBLEM</span>
          <h1>What needs fixing?</h1>
          <p>
            You don’t need to know the cause. Start with what you’ve noticed.
          </p>
        </div>
        <span className="pill">01 / 03 · Describe</span>
      </div>
      <div className="two-column">
        <form
          className="panel"
          onSubmit={handleSubmit(async (data) => {
            try {
              const r = await command("create", data, undefined, key.current);
              router.push(`/customer/jobs/${r.id}/clarify`);
            } catch (e) {
              setError((e as Error).message);
            }
          })}
        >
          <div className="form-section">
            <Wrench size={20} />
            <h3>Plumbing request</h3>
          </div>
          <label>
            Give your repair a name
            <input
              {...register("title")}
              placeholder="Kitchen tap keeps dripping"
            />
            {errors.title && (
              <small className="field-error">{errors.title.message}</small>
            )}
          </label>
          <label>
            What have you noticed?
            <textarea
              {...register("description")}
              rows={5}
              placeholder="The kitchen tap leaks even when it’s turned off. I first noticed it yesterday."
            />
            {errors.description && (
              <small className="field-error">
                {errors.description.message}
              </small>
            )}
          </label>
          <label>
            Area / city
            <input {...register("area")} placeholder="e.g. Indore" />
            {errors.area && (
              <small className="field-error">{errors.area.message}</small>
            )}
          </label>
          <label>
            Exact service address
            <textarea
              {...register("address")}
              rows={2}
              placeholder="House number, street, and nearby landmark"
            />
            {errors.address && (
              <small className="field-error">{errors.address.message}</small>
            )}
          </label>
          <p className="hint">
            <ShieldCheck size={15} />
            Only your assigned worker can see the exact address.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="button primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save & add details"}
            <ArrowRight size={18} />
          </button>
        </form>
        <aside>
          <div className="panel tinted">
            <h3>A good brief starts here.</h3>
            <p>
              Describe what you can see and hear. It’s okay to say “I don’t
              know”.
            </p>
            <ul className="check-list">
              <li>
                <Check />
                Keep the original problem in your own words
              </li>
              <li>
                <Check />
                Add photos or a voice note in the next step
              </li>
              <li>
                <Check />
                Review everything before inviting workers
              </li>
            </ul>
          </div>
          <p className="safety-note">
            If there is immediate danger, move away and contact appropriate
            local assistance. FixFirst is not an emergency service. Do not
            dismantle fittings to answer questions.
          </p>
        </aside>
      </div>
    </section>
  );
}
const date = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
export function JobDetail({
  id,
  profile,
  path,
}: {
  id: string;
  profile: Row;
  path: string;
}) {
  const [job, setJob] = useState<Row | null>(null),
    [records, setRecords] = useState<Record<string, Row[]>>({}),
    [workers, setWorkers] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("overview"),
    [editor, setEditor] = useState<{
      action: string;
      terms: Terms;
      proposalId?: string;
    } | null>(null),
    [reason, setReason] = useState("");
  const router = useRouter();
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const db = browserDB();
      const { data, error } = await db
        .from("jobs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This job is unavailable to your account.");
      const tables = [
        "brief_versions",
        "proposals",
        "agreements",
        "change_requests",
        "completion_requests",
        "receipts",
        "messages",
        "job_events",
        "attachments",
        "job_participants",
        "job_private_details",
        "cancellation_requests",
      ];
      const results = await Promise.all(
        tables.map((t) => db.from(t).select("*").eq("job_id", id).limit(100)),
      );
      const next: Record<string, Row[]> = {};
      results.forEach((r, i) => {
        if (r.error) throw r.error;
        next[tables[i]] = r.data || [];
      });
      const w = await db.from("profiles").select("*").eq("role", "worker");
      if (w.error) throw w.error;
      setWorkers(w.data || []);
      setRecords(next);
      setJob(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [id]);
  useEffect(() => {
    void load();
    const db = browserDB();
    const ch = db
      .channel(`job-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: `id=eq.${id}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `job_id=eq.${id}`,
        },
        () => void load(),
      )
      .subscribe();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => {
      void db.removeChannel(ch);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [id, load]);
  const act = async (action: string, payload: Row = {}) => {
    if (!job) return false;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify({
      action,
      payload,
      version: job.version,
    });
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await command(action, payload, job, retry.current.key);
      retry.current = null;
      await load();
      setNotice("Saved. Your latest agreement and activity are up to date.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!loaded) return <div className="empty">Loading job…</div>;
  if (!job)
    return (
      <div className="panel error" role="alert">
        {error}
        <button onClick={load}>Retry</button>
      </div>
    );
  const customer = profile.id === job.customer_id,
    assigned = profile.id === job.worker_id,
    brief = records.brief_versions?.find(
      (b) => b.version === job.brief_version,
    ),
    agreement = records.agreements?.find(
      (a) => a.version === job.agreement_version,
    ),
    pending = records.change_requests?.find((c) => c.status === "pending"),
    completion = [...(records.completion_requests || [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0],
    receipt = records.receipts?.[0];
  const currentQuotes =
    records.proposals?.filter((q) => q.status === "open") || [];
  const nextAction = (
    {
      draft: "Answer a few questions, then confirm your brief.",
      open_for_quotes: customer
        ? "Invite two plumbers and compare their proposals."
        : "Review the confirmed brief and send your itemised quote.",
      agreed: assigned
        ? "The agreement is confirmed. Start work when ready."
        : "Your worker can now start the agreed work.",
      in_progress: assigned
        ? "Work only within the approved scope. Propose any changes first."
        : "Your agreed scope and maximum price are protected.",
      change_pending: customer
        ? "Review the proposed change before any extra work begins."
        : "Wait for the customer’s explicit approval before additional work.",
      awaiting_completion: customer
        ? "Review the actual items and confirm the completed work."
        : "Completion requested. Waiting for the customer’s confirmation.",
      completed: "All done. Your final completion record is ready.",
      cancelled: "This job has been cancelled.",
    } as Record<string, string>
  )[job.status];
  if (path.endsWith("/receipt") && receipt)
    return <Receipt receipt={receipt} />;
  return (
    <section className="workspace">
      <Link
        className="back"
        href={customer ? "/customer/jobs" : "/worker/jobs"}
      >
        <ArrowLeft size={16} />
        All jobs
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            PLUMBING · {id.slice(0, 8).toUpperCase()}
          </span>
          <h1>{job.title}</h1>
          <p>
            <MapPin size={15} />
            {job.area}
            {records.job_private_details?.[0] &&
              ` · ${records.job_private_details[0].address}`}
          </p>
        </div>
        <span className={`status ${job.status}`}>
          {job.status.replaceAll("_", " ")}
        </span>
      </div>
      <div className="next-action">
        <span className="mini-check">
          <ShieldCheck size={22} />
        </span>
        <div>
          <strong>Your next step</strong>
          <p>{nextAction}</p>
        </div>
        {receipt && (
          <Link className="button primary" href={`/jobs/${id}/receipt`}>
            View receipt
            <FileText size={18} />
          </Link>
        )}
        {assigned && job.status === "agreed" && (
          <button
            disabled={busy}
            className="button primary"
            onClick={() => act("start")}
          >
            Start work
            <ArrowRight size={18} />
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
          <button
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Refresh
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <div className="tabs">
        {["overview", "quotes", "messages", "history"].map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={tab === x ? "active" : ""}
          >
            {x[0].toUpperCase() + x.slice(1)}
            {x === "quotes" && ` (${currentQuotes.length})`}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="two-column">
          <div className="stack">
            {customer && ["draft", "open_for_quotes"].includes(job.status) ? (
              <BriefForm
                job={job}
                brief={brief}
                busy={busy}
                save={async (text, answers) => {
                  if (await act("brief", { text, answers }))
                    router.replace(`/jobs/${id}`);
                }}
              />
            ) : (
              <section className="panel">
                <div className="section-title">
                  <h2>Confirmed brief</h2>
                  <span className="pill">Version {job.brief_version}</span>
                </div>
                <p className="preserve">{brief?.text || job.description}</p>
                <details>
                  <summary>Original description</summary>
                  <p>{job.description}</p>
                </details>
              </section>
            )}
            {agreement && (
              <section className="panel">
                <div className="section-title">
                  <h2>Our agreement</h2>
                  <span className="pill">Version {agreement.version}</span>
                </div>
                <TermsView terms={agreement.terms} />
                <p className="hint">
                  Accepted {date(agreement.accepted_at)} · Both parties’ consent
                  is recorded.
                </p>
              </section>
            )}
            {pending && (
              <section className="panel change-panel">
                <span className="eyebrow">YOUR APPROVAL IS REQUIRED</span>
                <h2>Proposed scope change</h2>
                <p>{pending.reason}</p>
                <div className="price-change">
                  <span>{money(agreement?.maximum || 0)}</span>
                  <ArrowRight />
                  <strong>{money(pending.maximum)}</strong>
                  <span className="pill">
                    {money(pending.maximum - (agreement?.maximum || 0))}{" "}
                    difference
                  </span>
                </div>
                <TermsView terms={pending.terms} />
                <p className="hint">
                  This replaces the entire agreement. Silence does not approve a
                  charge.
                </p>
                {customer && (
                  <div className="actions">
                    <button
                      disabled={busy}
                      className="button primary"
                      onClick={() =>
                        act("decide_change", {
                          changeId: pending.id,
                          decision: "approved",
                        })
                      }
                    >
                      Approve {money(pending.maximum)} maximum
                    </button>
                    <button
                      disabled={busy}
                      className="button secondary"
                      onClick={() =>
                        act("decide_change", {
                          changeId: pending.id,
                          decision: "rejected",
                        })
                      }
                    >
                      Reject change
                    </button>
                  </div>
                )}
              </section>
            )}
            {assigned && job.status === "in_progress" && agreement && (
              <section className="panel">
                <h2>Manage the work</h2>
                <p>
                  Additional work needs a new approval. Actual costs may be
                  lower than the agreed caps.
                </p>
                <div className="actions">
                  <button
                    className="button secondary"
                    onClick={() =>
                      setEditor({
                        action: "change",
                        terms: structuredClone(agreement.terms),
                      })
                    }
                  >
                    Propose scope change
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      setEditor({
                        action: "complete",
                        terms: structuredClone(agreement.terms),
                      })
                    }
                  >
                    Request completion
                    <Check size={18} />
                  </button>
                </div>
              </section>
            )}
            {job.status === "awaiting_completion" && completion && (
              <section className="panel">
                <h2>Review completed work</h2>
                <TermsView terms={completion.terms} />
                {customer ? (
                  <>
                    <p>
                      Confirm only if the agreed work has been completed. No
                      payment is collected here.
                    </p>
                    <button
                      disabled={busy}
                      className="button primary"
                      onClick={() => act("confirm_completion")}
                    >
                      Confirm completion · {money(completion.actual)}
                      <CheckCircle2 size={18} />
                    </button>
                  </>
                ) : (
                  <p>Waiting for the customer to confirm these actual costs.</p>
                )}
              </section>
            )}
            <Media
              job={job}
              profile={profile}
              attachments={records.attachments || []}
              refresh={load}
            />
          </div>
          <aside className="stack">
            {customer && job.status === "open_for_quotes" && (
              <section className="panel">
                <Users size={25} />
                <h3>Invite your plumbers</h3>
                <p>
                  Choose two workers in {job.area}. Each sees their own quote
                  and conversation.
                </p>
                {workers
                  .filter(
                    (w) => w.area.toLowerCase() === job.area.toLowerCase(),
                  )
                  .map((w) => {
                    const invited = records.job_participants?.some(
                      (p) => p.user_id === w.id,
                    );
                    return (
                      <div className="worker-row" key={w.id}>
                        <span className="avatar">{w.name[0]}</span>
                        <div>
                          <strong>{w.name}</strong>
                          <small>
                            {w.trade} · {w.area}
                          </small>
                        </div>
                        <button
                          disabled={busy || invited}
                          className="button secondary small"
                          onClick={() => act("invite", { workerId: w.id })}
                        >
                          {invited ? "Invited" : "Invite"}
                        </button>
                      </div>
                    );
                  })}
                {!workers.some(
                  (w) => w.area.toLowerCase() === job.area.toLowerCase(),
                ) && (
                  <p className="hint">
                    No registered plumbers in this area yet. Worker accounts
                    must complete onboarding with the same city.
                  </p>
                )}
              </section>
            )}
            {!customer && job.status === "open_for_quotes" && (
              <section className="panel tinted">
                <h3>A clear quote goes a long way.</h3>
                <p>
                  Quote against brief version {job.brief_version}. Include
                  exclusions, visit charges, and material allowances.
                </p>
                <button
                  className="button primary"
                  onClick={() => {
                    setTab("quotes");
                    if (!currentQuotes.length)
                      setEditor({
                        action: "quote",
                        terms: structuredClone(defaultTerms),
                      });
                  }}
                >
                  Prepare quote
                  <ArrowRight size={17} />
                </button>
              </section>
            )}
            <section className="panel tinted">
              <ShieldCheck size={26} />
              <h3>Your agreement comes first.</h3>
              <p>
                Messages are for discussion. They never approve additional
                charges. Use the approval buttons to change the agreement.
              </p>
              {agreement && (
                <>
                  <small>AUTHORISED MAXIMUM</small>
                  <div className="large-money">{money(agreement.maximum)}</div>
                </>
              )}
            </section>
            {(customer || assigned) &&
              !["completed", "cancelled"].includes(job.status) && (
                <details className="panel">
                  <summary>Cancellation & issues</summary>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (await act("dispute", { text: f.get("text") }))
                        e.currentTarget?.reset();
                    }}
                  >
                    <label>
                      Describe an issue
                      <textarea
                        name="text"
                        required
                        minLength={5}
                        maxLength={4000}
                      />
                    </label>
                    <button disabled={busy} className="button secondary">
                      Record issue
                    </button>
                    <p className="hint">
                      An issue is recorded for follow-up; no automatic
                      resolution or moderation is promised. Reporting incomplete
                      work returns it to the worker.
                    </p>
                  </form>
                  {[
                    "draft",
                    "open_for_quotes",
                    "agreed",
                    "in_progress",
                  ].includes(job.status) && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void act("cancel", {
                          reason: f.get("reason"),
                          amount: Math.round(
                            Number(f.get("amount") || 0) * 100,
                          ),
                        });
                      }}
                    >
                      <h3>Cancel this job</h3>
                      {agreement && (
                        <>
                          <label>
                            Settlement amount (₹)
                            <input
                              name="amount"
                              type="number"
                              min={0}
                              step="0.01"
                              max={agreement.maximum / 100}
                              defaultValue="0"
                              required
                            />
                          </label>
                          <label>
                            Reason
                            <textarea name="reason" required minLength={5} />
                          </label>
                          <p className="hint">
                            The other party must approve. No automatic
                            cancellation fee.
                          </p>
                        </>
                      )}
                      <button disabled={busy} className="button secondary">
                        {agreement
                          ? "Propose settlement"
                          : "Cancel without charge"}
                      </button>
                    </form>
                  )}
                </details>
              )}
            {records.cancellation_requests?.map((c) => (
              <section className="panel" key={c.id}>
                <h3>Cancellation settlement</h3>
                <p>
                  {c.reason} · {money(c.amount)}
                </p>
                <span className="pill">{c.status}</span>
                {c.status === "pending" && c.author_id !== profile.id && (
                  <div className="actions">
                    {["approved", "rejected"].map((decision) => (
                      <button
                        className="button secondary"
                        disabled={busy}
                        key={decision}
                        onClick={() =>
                          act("decide_cancel", {
                            cancellationId: c.id,
                            decision,
                          })
                        }
                      >
                        {decision === "approved" ? "Approve" : "Reject"}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </aside>
        </div>
      )}
      {tab === "quotes" && (
        <>
          <div className="section-title">
            <div>
              <h2>Clear quotes. Easy comparison.</h2>
              <p>
                All prices in INR. Material allowances are maximums, not
                open-ended estimates.
              </p>
            </div>
            {!customer &&
              job.status === "open_for_quotes" &&
              !currentQuotes.length && (
                <button
                  className="button primary"
                  onClick={() =>
                    setEditor({
                      action: "quote",
                      terms: structuredClone(defaultTerms),
                    })
                  }
                >
                  New quote
                  <Plus size={18} />
                </button>
              )}
          </div>
          <div className="quote-grid">
            {(records.proposals || [])
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((q) => (
                <section
                  className={`panel quote ${q.status !== "open" ? "archived" : ""}`}
                  key={q.id}
                >
                  <div className="section-title">
                    <h3>
                      {workers.find((w) => w.id === q.worker_id)?.name ||
                        "Plumber"}
                    </h3>
                    <span className="pill">{q.status}</span>
                  </div>
                  <small>
                    Brief v{q.brief_version} ·{" "}
                    {q.parent_id ? "Counteroffer" : "Original quote"} ·{" "}
                    {q.author_id === profile.id
                      ? "Submitted by you"
                      : "Awaiting your response"}
                  </small>
                  <TermsView terms={q.terms} />
                  <p className="hint">
                    <Clock size={14} />
                    Expires {date(q.expires_at)}
                  </p>
                  {q.status === "open" &&
                    job.status === "open_for_quotes" &&
                    new Date(q.expires_at) > new Date() && (
                      <div className="actions">
                        {q.author_id !== profile.id && (
                          <button
                            disabled={busy}
                            className="button primary"
                            onClick={() => act("accept", { proposalId: q.id })}
                          >
                            Accept exact terms
                            <Check size={17} />
                          </button>
                        )}
                        <button
                          className="button secondary"
                          onClick={() =>
                            setEditor({
                              action: "counter",
                              terms: structuredClone(q.terms),
                              proposalId: q.id,
                            })
                          }
                        >
                          Counteroffer
                        </button>
                      </div>
                    )}
                </section>
              ))}
          </div>
          {!records.proposals?.length && (
            <div className="empty panel">
              <FileText size={32} />
              <h3>No quotes yet</h3>
              <p>
                {customer
                  ? "Invite two workers from the overview tab."
                  : "Submit an itemised quote to begin the conversation."}
              </p>
            </div>
          )}
        </>
      )}
      {tab === "messages" && (
        <Chat
          profile={profile}
          job={job}
          workers={workers.filter((w) =>
            records.job_participants?.some((p) => p.user_id === w.id),
          )}
          messages={records.messages || []}
          busy={busy}
          act={act}
        />
      )}
      {tab === "history" && (
        <div className="two-column">
          <section className="panel">
            <h2>Every step, on record.</h2>
            <div className="timeline">
              {[...(records.job_events || [])]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((e) => (
                  <div key={e.id}>
                    <span className="timeline-dot" />
                    <strong>{e.event.replaceAll("_", " ")}</strong>
                    <p>
                      {date(e.created_at)} ·{" "}
                      {e.actor_id === profile.id ? "You" : "Other party"}
                    </p>
                  </div>
                ))}
            </div>
          </section>
          <div className="stack">
            {[...(records.agreements || [])]
              .sort((a, b) => b.version - a.version)
              .map((a) => (
                <section className="panel" key={a.id}>
                  <h3>Agreement version {a.version}</h3>
                  <TermsView terms={a.terms} />
                  <small>Accepted {date(a.accepted_at)}</small>
                </section>
              ))}
            {records.change_requests?.map((c) => (
              <section className="panel" key={c.id}>
                <h3>Scope change · {c.status}</h3>
                <p>{c.reason}</p>
                <strong>{money(c.maximum)}</strong>
              </section>
            ))}
          </div>
        </div>
      )}
      {editor && (
        <div className="modal-backdrop">
          <section
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-label="Proposal editor"
          >
            <div className="section-title">
              <h2>
                {editor.action === "complete"
                  ? "Final actual costs"
                  : editor.action === "change"
                    ? "Propose replacement terms"
                    : editor.action === "counter"
                      ? "Make a counteroffer"
                      : "Your itemised quote"}
              </h2>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Close
              </button>
            </div>
            {editor.action === "change" && (
              <label>
                Why is this change needed?
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={5}
                />
              </label>
            )}
            <TermsEditor
              initial={editor.terms}
              actual={editor.action === "complete"}
              busy={busy}
              onSave={async (terms) => {
                if (
                  await act(editor.action, {
                    terms,
                    reason,
                    proposalId: editor.proposalId,
                    agreementVersion: job.agreement_version,
                  })
                ) {
                  setEditor(null);
                  setReason("");
                }
              }}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
function BriefForm({
  job,
  brief,
  busy,
  save,
}: {
  job: Row;
  brief?: Row;
  busy: boolean;
  save: (text: string, answers: Record<string, string>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
      brief?.answers || {},
    ),
    [text, setText] = useState(brief?.text || ""),
    [editing, setEditing] = useState(!brief);
  return (
    <section className="panel">
      <div className="section-title">
        <h2>
          {brief
            ? "Your confirmed brief"
            : "A few details make all the difference."}
        </h2>
        {brief && (
          <button className="text-button" onClick={() => setEditing(!editing)}>
            {editing ? "Close editor" : "Revise brief"}
          </button>
        )}
      </div>
      {!editing ? (
        <p className="preserve">{brief?.text}</p>
      ) : (
        <>
          <p>Answer what you know. We won’t guess the diagnosis.</p>
          <div className="question-grid">
            {questions.map(([key, label, options]) => (
              <label key={key}>
                {label}
                <select
                  value={answers[key] || ""}
                  onChange={(e) =>
                    setAnswers({ ...answers, [key]: e.target.value })
                  }
                >
                  <option value="">Choose or leave unknown</option>
                  {options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label>
            Preferred appointment window
            <input
              value={answers.window || ""}
              placeholder="e.g. Tomorrow, 10 am to noon"
              onChange={(e) =>
                setAnswers({ ...answers, window: e.target.value })
              }
            />
          </label>
          <button
            className="button secondary"
            onClick={() => setText(buildBrief(job.description, answers))}
          >
            Build my guided brief
            <ChevronRight size={17} />
          </button>
          <label>
            Review and edit your brief
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Use the guided brief button, then review every detail."
            />
          </label>
          <p className="hint">
            Confirming a revision invalidates previous open quotes. Accepted
            agreements use the scope-change flow.
          </p>
          <button
            disabled={busy || text.trim().length < 10}
            className="button primary"
            onClick={async () => {
              await save(text, answers);
            }}
          >
            Confirm brief
            <Check size={18} />
          </button>
        </>
      )}
    </section>
  );
}
export function TermsView({ terms }: { terms: Terms }) {
  return (
    <div className="terms">
      <span className="service-type">
        {terms.mode === "inspection"
          ? "Inspection only — repair is not authorised"
          : "Repair as described"}
      </span>
      <p className="preserve">{terms.scope}</p>
      <div className="price-items">
        {terms.items.map((i) => (
          <div key={i.id}>
            <span>
              {i.description}
              <small>{i.estimated ? "Not-to-exceed allowance" : "Fixed"}</small>
            </span>
            <strong>{money(i.amount)}</strong>
          </div>
        ))}
        {terms.credit > 0 && (
          <div>
            <span>Explicit visit-fee credit</span>
            <strong>−{money(terms.credit)}</strong>
          </div>
        )}
      </div>
      <div className="price-total">
        <span>Maximum authorised</span>
        <strong>{money(total(terms))}</strong>
      </div>
      <dl>
        <dt>Visit window</dt>
        <dd>{terms.window}</dd>
        <dt>Exclusions</dt>
        <dd>{terms.exclusions || "None specified"}</dd>
        <dt>Assumptions</dt>
        <dd>{terms.assumptions || "None specified"}</dd>
      </dl>
    </div>
  );
}
function TermsEditor({
  initial,
  actual,
  busy,
  onSave,
}: {
  initial: Terms;
  actual?: boolean;
  busy: boolean;
  onSave: (t: Terms) => Promise<void>;
}) {
  const [t, setT] = useState<Terms>(structuredClone(initial)),
    [error, setError] = useState("");
  const put = (key: keyof Terms, value: unknown) =>
    setT({ ...t, [key]: value });
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = termsSchema.safeParse(t);
        if (!parsed.success) {
          setError(parsed.error.issues.map((i) => i.message).join(". "));
          return;
        }
        setError("");
        await onSave(parsed.data);
      }}
    >
      <label>
        Service type
        <select
          disabled={actual}
          value={t.mode}
          onChange={(e) => put("mode", e.target.value)}
        >
          <option value="repair">Repair as described</option>
          <option value="inspection">Inspection only</option>
        </select>
      </label>
      {(["scope", "exclusions", "assumptions", "window"] as const).map((k) => (
        <label key={k}>
          {k[0].toUpperCase() + k.slice(1)}
          <textarea
            disabled={actual}
            required={k === "scope" || k === "window"}
            value={t[k]}
            rows={k === "scope" ? 3 : 2}
            onChange={(e) => put(k, e.target.value)}
          />
        </label>
      ))}
      <h3>
        {actual
          ? "Actual item costs (within approved caps)"
          : "Itemised maximums"}
      </h3>
      {t.items.map((item, index) => (
        <div className="item-editor" key={item.id}>
          <label>
            Description
            <input
              disabled={actual}
              value={item.description}
              required
              onChange={(e) =>
                put(
                  "items",
                  t.items.map((v, i) =>
                    i === index ? { ...v, description: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Type
            <select
              disabled={actual}
              value={item.kind}
              onChange={(e) =>
                put(
                  "items",
                  t.items.map((v, i) =>
                    i === index ? { ...v, kind: e.target.value } : v,
                  ),
                )
              }
            >
              <option value="visit">Visit</option>
              <option value="labour">Labour</option>
              <option value="material">Material</option>
            </select>
          </label>
          <label>
            Amount (₹)
            <input
              type="number"
              required
              min={0}
              max={actual ? initial.items[index].amount / 100 : 100000}
              step="0.01"
              value={item.amount / 100}
              onChange={(e) =>
                put(
                  "items",
                  t.items.map((v, i) =>
                    i === index
                      ? {
                          ...v,
                          amount: Math.round(Number(e.target.value) * 100),
                        }
                      : v,
                  ),
                )
              }
            />
          </label>
          <label className="checkbox">
            <input
              disabled={actual}
              type="checkbox"
              checked={item.estimated}
              onChange={(e) =>
                put(
                  "items",
                  t.items.map((v, i) =>
                    i === index ? { ...v, estimated: e.target.checked } : v,
                  ),
                )
              }
            />
            Allowance
          </label>
          {!actual && (
            <button
              className="icon-button"
              type="button"
              aria-label={`Remove ${item.description}`}
              onClick={() =>
                put(
                  "items",
                  t.items.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
      ))}
      {!actual && (
        <button
          type="button"
          className="button secondary small"
          onClick={() =>
            put("items", [
              ...t.items,
              {
                id: crypto.randomUUID(),
                description: "",
                kind: "material",
                amount: 0,
                estimated: true,
              },
            ])
          }
        >
          <Plus size={16} />
          Add item
        </button>
      )}
      <label>
        Visit-fee credit (₹)
        <input
          disabled={actual}
          type="number"
          min={0}
          step="0.01"
          value={t.credit / 100}
          onChange={(e) =>
            put("credit", Math.round(Number(e.target.value) * 100))
          }
        />
      </label>
      <div className="price-total">
        <span>{actual ? "Actual total" : "Maximum authorisation"}</span>
        <strong>
          {money(t.items.reduce((n, i) => n + i.amount, 0) - t.credit)}
        </strong>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">
        {actual
          ? "Customer confirmation is required to complete the job."
          : "Submitting records your consent to these exact terms. The other party must explicitly accept."}
      </p>
      <button disabled={busy} className="button primary">
        {busy
          ? "Saving…"
          : actual
            ? "Submit completion request"
            : "Submit these terms"}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
function Chat({
  profile,
  job,
  workers,
  messages,
  busy,
  act,
}: {
  profile: Row;
  job: Row;
  workers: Row[];
  messages: Row[];
  busy: boolean;
  act: (a: string, p: Row) => Promise<boolean>;
}) {
  const [worker, setWorker] = useState(
      profile.role === "worker"
        ? profile.id
        : job.worker_id || workers[0]?.id || "",
    ),
    [text, setText] = useState("");
  return (
    <section className="panel chat">
      <div className="section-title">
        <div>
          <h2>Talk it through.</h2>
          <p>Only you and this worker can read this conversation.</p>
        </div>
        {profile.role === "customer" && (
          <select
            aria-label="Conversation with worker"
            value={worker}
            onChange={(e) => setWorker(e.target.value)}
          >
            <option value="">Choose a worker</option>
            {workers.map((w) => (
              <option value={w.id} key={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="chat-log" aria-live="polite">
        {messages
          .filter((m) => m.worker_id === worker)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((m) => (
            <div
              className={
                m.sender_id === profile.id
                  ? "chat-message mine"
                  : "chat-message"
              }
              key={m.id}
            >
              <p>{m.text}</p>
              <small>{date(m.created_at)}</small>
            </div>
          ))}
      </div>
      <form
        className="chat-compose"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act("message", { workerId: worker, text })) setText("");
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          Message
        </label>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          required
          placeholder="Write a message…"
        />
        <button
          className="button primary"
          disabled={busy || !worker || !text.trim()}
        >
          <Send size={18} />
          Send
        </button>
      </form>
      <p className="hint">
        <ShieldCheck size={15} />
        Chat never approves a charge. Use formal proposals and approvals.
      </p>
    </section>
  );
}
function Receipt({ receipt }: { receipt: Row }) {
  const s = receipt.snapshot;
  return (
    <section className="receipt panel">
      <div className="section-title no-print">
        <Link className="back" href={`/jobs/${receipt.job_id}`}>
          <ArrowLeft size={16} />
          Back to job
        </Link>
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={18} />
          Print / Save PDF
        </button>
      </div>
      <div className="receipt-brand">fixfirst.</div>
      <span className="eyebrow">COMPLETION RECORD</span>
      <h1>A repair, clearly recorded.</h1>
      <p>Receipt {receipt.id}</p>
      <div className="receipt-parties">
        <div>
          <small>CUSTOMER</small>
          <h3>{s.customer}</h3>
        </div>
        <div>
          <small>WORKER</small>
          <h3>{s.worker}</h3>
        </div>
        <div>
          <small>CONFIRMED</small>
          <h3>{date(s.confirmedAt)} IST</h3>
        </div>
      </div>
      <h2>Original confirmed brief</h2>
      <p className="preserve">{s.brief}</p>
      <h2>Final work and actual costs</h2>
      <TermsView terms={s.completion.terms} />
      <div className="price-total">
        <span>Actual final total</span>
        <strong>{money(s.completion.actual)}</strong>
      </div>
      <h2>Agreement history</h2>
      {s.agreements.map((a: Row) => (
        <div className="receipt-history" key={a.id}>
          <strong>
            Version {a.version} · {money(a.maximum)} maximum
          </strong>
          <p>{a.terms.scope}</p>
          <small>
            Proposed {date(a.proposed_at)} · Accepted {date(a.accepted_at)}
          </small>
        </div>
      ))}
      <h2>Recorded approvals</h2>
      {s.approvals?.map((a: Row) => (
        <p key={a.id}>
          {a.decision.replaceAll("_", " ")} · {date(a.created_at)} ·{" "}
          {a.actor_id === s.job.customer_id ? s.customer : s.worker}
        </p>
      ))}
      <h2>Evidence references</h2>
      <p>
        {s.evidence?.length
          ? s.evidence
              .map((e: Row) => `${e.stage} ${e.kind}: ${e.id}`)
              .join("; ")
          : "No attachments supplied."}
      </p>
      <div className="receipt-disclaimer">
        <ShieldCheck />
        <div>
          <strong>{s.payment}</strong>
          <p>
            This immutable completion record is not proof of payment or a tax
            invoice. Private to the customer and assigned worker.
          </p>
        </div>
      </div>
    </section>
  );
}
