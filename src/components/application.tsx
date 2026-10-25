"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  ClipboardList,
  Droplets,
  FileCheck2,
  Home,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { browserDB, configured } from "@/lib/supabase/client";
import { dictionaries } from "@/lib/i18n";
import type { Row } from "@/lib/domain";
import { JobDetail, NewJob } from "./workflow";

export async function command(
  action: string,
  payload: Row = {},
  job?: Row,
  key = crypto.randomUUID(),
) {
  const response = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      payload,
      jobId: job?.id,
      expectedVersion: job?.version,
      key,
    }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "Unable to save. Please retry.");
  return data.data;
}
export function Application() {
  const path = usePathname(),
    router = useRouter();
  const [profile, setProfile] = useState<Row | null>(null),
    [user, setUser] = useState<Row | null>(null),
    [loading, setLoading] = useState(configured),
    [error, setError] = useState(""),
    [locale, setLocale] = useState<"en" | "hi">("en"),
    [menu, setMenu] = useState(false),
    [notes, setNotes] = useState<Row[]>([]),
    [showNotes, setShowNotes] = useState(false);
  const t = dictionaries[locale];
  const refresh = useCallback(async () => {
    if (!configured) return;
    try {
      const db = browserDB();
      const {
        data: { user: u },
        error: e,
      } = await db.auth.getUser();
      if (e && u) throw e;
      setUser(u);
      if (u) {
        const { data, error } = await db
          .from("profiles")
          .select("*")
          .eq("id", u.id)
          .maybeSingle();
        if (error) throw error;
        setProfile(data);
        if (data?.locale) setLocale(data.locale);
        const n = await db
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30);
        if (n.error) throw n.error;
        setNotes(n.data || []);
      } else {
        setProfile(null);
        setNotes([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    if (!configured) return;
    const {
      data: { subscription },
    } = browserDB().auth.onAuthStateChange(() => {
      setTimeout(() => void refresh(), 0);
    });
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20000);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", focus);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!loading && user && !profile && path != "/onboarding")
      router.replace("/onboarding");
  }, [loading, user, profile, path, router]);
  const home = profile?.role === "worker" ? "/worker/jobs" : "/customer/jobs";
  return (
    <div className="app">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Wrench size={22} />
          </span>
          fixfirst<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">CLARITY BEFORE COST</div>
        <nav>
          <Link
            onClick={() => setMenu(false)}
            className={path === "/" ? "active" : ""}
            href="/"
          >
            <Home size={19} />
            {t.home}
          </Link>
          <Link
            onClick={() => setMenu(false)}
            className={path === home ? "active" : ""}
            href={home}
          >
            <ClipboardList size={19} />
            {t.jobs}
          </Link>
          {profile?.role !== "worker" && (
            <Link
              onClick={() => setMenu(false)}
              className={path.endsWith("/new") ? "active" : ""}
              href="/customer/jobs/new"
            >
              <Plus size={19} />
              {t.new}
            </Link>
          )}
          <Link href="/#how">
            <Sparkles size={19} />
            {t.how}
            <ArrowUpRight size={15} />
          </Link>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={26} />
          <strong>Your say. At every step.</strong>
          <p>No extra work becomes an extra charge without your approval.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">{profile?.name?.[0] || "F"}</span>
          <div>
            <strong>{profile?.name || "Welcome to FixFirst"}</strong>
            <small>{profile?.role || "Let’s get it fixed, clearly."}</small>
          </div>
          {user && (
            <button
              className="icon-button"
              title={t.signOut}
              onClick={async () => {
                await browserDB().auth.signOut();
                router.push("/");
              }}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="icon-button mobile"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <span className="breadcrumb">
            Your home, in good hands <span>/</span> <strong>Plumbing</strong>
          </span>
          <div className="top-actions">
            <button
              className="language"
              onClick={() => setLocale(locale === "en" ? "hi" : "en")}
            >
              {locale === "en" ? "हिन्दी" : "English"}
            </button>
            {user ? (
              <button
                className="icon-button notification"
                aria-label="Notifications"
                onClick={() => {
                  setShowNotes(!showNotes);
                  if (!showNotes)
                    void command("read_notifications")
                      .then(refresh)
                      .catch((e) => setError(e.message));
                }}
              >
                <Bell size={20} />
                {notes.some((n) => !n.read_at) && <i />}
              </button>
            ) : (
              <Link className="button small dark" href="/login">
                {t.signIn}
                <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        </header>
        {showNotes && (
          <div className="notifications">
            <h3>{t.notifications}</h3>
            {notes.length === 0 ? (
              <p>No updates yet.</p>
            ) : (
              notes.map((n) => (
                <Link
                  href={`/jobs/${n.job_id}`}
                  key={n.id}
                  onClick={() => setShowNotes(false)}
                >
                  {n.text}
                  <small>
                    {new Date(n.created_at).toLocaleString("en-IN")}
                  </small>
                </Link>
              ))
            )}
          </div>
        )}
        <main>
          {error && (
            <div role="alert" className="error">
              {error}
              <button
                onClick={() => {
                  setError("");
                  void refresh();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty">Loading your workspace…</div>
          ) : path === "/" ? (
            <Landing t={t} />
          ) : path === "/login" ? (
            <Auth onDone={refresh} />
          ) : path === "/onboarding" ? (
            <Onboard user={user} onDone={refresh} />
          ) : !configured ? (
            <Setup />
          ) : !user ? (
            <Auth onDone={refresh} />
          ) : !profile ? (
            <Onboard user={user} onDone={refresh} />
          ) : path.endsWith("/new") ? (
            <NewJob />
          ) : /\/jobs\/[0-9a-f-]{36}/.test(path) ? (
            <JobDetail
              id={path.match(/\/jobs\/([0-9a-f-]{36})/)![1]}
              profile={profile}
              path={path}
            />
          ) : (
            <Dashboard profile={profile} t={t} />
          )}
        </main>
        <footer>
          <span>© {new Date().getFullYear()} FixFirst</span>
          <span>Clear scope. Fair agreements. Better repairs.</span>
          <span>
            Made for peace of mind <ShieldCheck size={14} />
          </span>
        </footer>
      </div>
    </div>
  );
}
function Landing({ t }: { t: typeof dictionaries.en }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span /> A BETTER WAY TO GET IT FIXED
          </span>
          <h1>
            {t.welcome.split(",")[0]}
            {t.welcome.includes(",") && (
              <>
                ,<br />
                <em>{t.welcome.split(",")[1]}</em>
              </>
            )}
          </h1>
          <p>{t.description}</p>
          <Link className="button primary" href="/customer/jobs/new">
            {t.request}
            <ArrowUpRight size={19} />
          </Link>
          <div className="hero-assurance">
            <span>
              <Check size={15} /> No surprise charges
            </span>
            <span>
              <Check size={15} /> You stay in control
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="art-grid" />
          <div className="repair-card">
            <div className="repair-top">
              <span className="water-icon">
                <Droplets size={27} />
              </span>
              <span>
                YOUR REPAIR, SIMPLIFIED<small>Kitchen tap · Plumbing</small>
              </span>
              <span className="mini-check">
                <Check size={15} />
              </span>
            </div>
            <h3>
              A little leak.
              <br />A clear plan.
            </h3>
            <div className="pipe-art">
              <div className="pipe-main" />
              <div className="pipe-neck" />
              <div className="pipe-spout" />
              <div className="pipe-handle" />
              <div className="drop">
                <Droplets size={30} />
              </div>
              <div className="sink" />
            </div>
            <div className="repair-bottom">
              <span>Agreed before work begins</span>
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="floating-card">
            <span className="mini-check">
              <Check size={18} />
            </span>
            <div>
              <strong>Nothing extra. Unless you say so.</strong>
              <small>Every change needs your approval.</small>
            </div>
          </div>
          <span className="art-caption">
            LESS GUESSWORK. MORE PEACE OF MIND.
          </span>
        </div>
      </section>
      <section className="trust-strip">
        <div>
          <ShieldCheck />
          <span>
            <strong>Scope before cost</strong>
            <small>Know exactly what’s included</small>
          </span>
        </div>
        <div>
          <ClipboardList />
          <span>
            <strong>Quotes you can compare</strong>
            <small>Every rupee, item by item</small>
          </span>
        </div>
        <div>
          <FileCheck2 />
          <span>
            <strong>A record you can rely on</strong>
            <small>From first brief to final receipt</small>
          </span>
        </div>
      </section>
      <section id="how" className="how">
        <div className="section-title">
          <div>
            <span className="eyebrow">FROM “IT’S LEAKING” TO “IT’S FIXED”</span>
            <h2>One clear step at a time.</h2>
          </div>
          <span className="pill">You’re in the loop. Always.</span>
        </div>
        <div className="steps">
          {[
            {
              n: "01",
              icon: ClipboardList,
              title: "Tell us what’s wrong",
              text: "Add a few words, a photo, or a voice note. Guided questions turn the problem into a clear brief.",
            },
            {
              n: "02",
              icon: Wrench,
              title: "Agree on the details",
              text: "Invite plumbers, compare itemised quotes, and settle on the scope and maximum price together.",
            },
            {
              n: "03",
              icon: ShieldCheck,
              title: "Stay in control",
              text: "Something changes? Review the new scope and price before you approve any additional work.",
            },
            {
              n: "04",
              icon: FileCheck2,
              title: "Close with confidence",
              text: "Confirm the completed work and keep a receipt with every agreement and approval.",
            },
          ].map((s) => (
            <article key={s.n}>
              <div className="step-top">
                <s.icon size={24} />
                <span>{s.n}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="start-banner">
        <div>
          <span className="water-icon">
            <Droplets />
          </span>
          <div>
            <h3>Starting with the small things that matter.</h3>
            <p>
              Leaking taps. Clear expectations. Plumbing is our first chapter.
            </p>
          </div>
        </div>
        <Link href="/customer/jobs/new">
          Let’s fix it <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}
export function Setup() {
  return (
    <section className="panel setup">
      <ShieldCheck size={40} />
      <h1>Ready to connect.</h1>
      <p>
        The app needs its own Supabase project to securely store accounts, jobs,
        and agreements.
      </p>
      <ol>
        <li>Create a free Supabase project.</li>
        <li>
          Run the migration in <code>supabase/migrations</code> using its SQL
          editor.
        </li>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> and add the
          project URL and publishable key.
        </li>
        <li>
          Restart the development server, then create separate customer and
          worker accounts.
        </li>
      </ol>
      <p>No accounts or approvals are simulated here.</p>
      <Link className="button secondary" href="/">
        Back to overview
      </Link>
    </section>
  );
}
function Auth({ onDone }: { onDone: () => Promise<void> }) {
  const router = useRouter();
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  if (!configured) return <Setup />;
  return (
    <section className="auth-wrap">
      <div className="auth-intro">
        <span className="eyebrow">WELCOME TO FIXFIRST</span>
        <h1>
          Good repairs start
          <br />
          with clear agreements.
        </h1>
        <p>
          One account. Every brief, conversation, and approval in one place.
        </p>
        <ShieldCheck size={60} />
      </div>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          const f = new FormData(e.currentTarget);
          try {
            const credentials = {
              email: String(f.get("email")),
              password: String(f.get("password")),
            };
            const { data, error } = signup
              ? await browserDB().auth.signUp({
                  ...credentials,
                  options: {
                    emailRedirectTo: window.location.origin + "/auth/callback",
                  },
                })
              : await browserDB().auth.signInWithPassword(credentials);
            if (error) throw error;
            if (!data.session) {
              setNotice(
                "Check your email to confirm your account, then sign in.",
              );
            } else {
              await onDone();
              router.push("/customer/jobs");
            }
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{signup ? "Create your account" : "Welcome back"}</h2>
        <p>
          {signup
            ? "Choose your role after you sign in."
            : "Sign in to pick up where you left off."}
        </p>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete={signup ? "new-password" : "current-password"}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        <button disabled={busy} className="button primary full">
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
          <ArrowRight size={18} />
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setSignup(!signup)}
        >
          {signup
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </form>
    </section>
  );
}
function Onboard({
  user,
  onDone,
}: {
  user: Row | null;
  onDone: () => Promise<void>;
}) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!user) return <Auth onDone={onDone} />;
  return (
    <form
      className="panel narrow"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const f = Object.fromEntries(new FormData(e.currentTarget));
          await command("onboard", f);
          await onDone();
          router.push(f.role === "worker" ? "/worker/jobs" : "/customer/jobs");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="eyebrow">A QUICK INTRODUCTION</span>
      <h1>Make yourself at home.</h1>
      <label>
        Your name
        <input name="name" required minLength={2} maxLength={100} />
      </label>
      <label>
        I’m here to
        <select name="role">
          <option value="customer">Find help with a repair</option>
          <option value="worker">Offer plumbing services</option>
        </select>
      </label>
      <p className="hint">
        Your role is fixed for this account. Use a separate account for each
        person.
      </p>
      <label>
        Area / city
        <input name="area" placeholder="e.g. Indore" required />
      </label>
      <label>
        Preferred language
        <select name="locale">
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} className="button primary">
        {busy ? "Saving…" : "Open my workspace"}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
function Dashboard({
  profile,
  t,
}: {
  profile: Row;
  t: typeof dictionaries.en;
}) {
  const [jobs, setJobs] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    const { data, error } = await browserDB()
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) setError(error.message);
    else setJobs(data || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const channel = browserDB()
      .channel("dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        () => void load(),
      )
      .subscribe();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => {
      void browserDB().removeChannel(channel);
      clearInterval(timer);
    };
  }, [load]);
  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t.dashboard}</span>
          <h1>Hello, {profile.name.split(" ")[0]}.</h1>
          <p>
            {profile.role === "worker"
              ? "Clear briefs. Agreed prices. Work with confidence."
              : "Every repair, from first question to final receipt."}
          </p>
        </div>
        {profile.role === "customer" && (
          <Link className="button primary" href="/customer/jobs/new">
            <Plus size={18} />
            {t.new}
          </Link>
        )}
      </div>
      <div className="stats">
        {[
          ["All jobs", jobs.length],
          [
            "Waiting for agreement",
            jobs.filter((j) => ["draft", "open_for_quotes"].includes(j.status))
              .length,
          ],
          [
            "In progress",
            jobs.filter((j) =>
              [
                "agreed",
                "in_progress",
                "change_pending",
                "awaiting_completion",
              ].includes(j.status),
            ).length,
          ],
          ["Completed", jobs.filter((j) => j.status === "completed").length],
        ].map(([l, n]) => (
          <div key={l}>
            <small>{l}</small>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      <div className="section-title">
        <h2>{t.jobs}</h2>
        <select
          aria-label="Filter jobs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All jobs</option>
          <option value="open_for_quotes">Awaiting quotes</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      {error && (
        <p className="error">
          {error}
          <button onClick={load}>Retry</button>
        </p>
      )}
      {loading ? (
        <p>Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <div className="panel empty">
          <span className="water-icon">
            <Droplets size={30} />
          </span>
          <h2>{profile.role === "worker" ? t.workerEmpty : t.empty}</h2>
          <p>{profile.role === "worker" ? t.workerEmptyText : t.emptyText}</p>
          {profile.role === "customer" && (
            <Link className="button primary" href="/customer/jobs/new">
              {t.request}
              <ArrowRight size={17} />
            </Link>
          )}
        </div>
      ) : (
        <div className="job-list">
          {jobs
            .filter((j) => filter === "all" || j.status === filter)
            .map((j) => (
              <Link className="job-card" href={`/jobs/${j.id}`} key={j.id}>
                <span className="water-icon">
                  <Droplets />
                </span>
                <div>
                  <h3>{j.title}</h3>
                  <p>
                    {j.area} ·{" "}
                    {new Date(j.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <span className={`status ${j.status}`}>
                  {j.status.replaceAll("_", " ")}
                </span>
                <ChevronRight size={20} />
              </Link>
            ))}
        </div>
      )}
    </section>
  );
}
