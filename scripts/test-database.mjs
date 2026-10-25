import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;create publication supabase_realtime;`,
);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/202610250001_fixfirst.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`PASS ${name}`);
};
const c = randomUUID(),
  other = randomUUID(),
  w1 = randomUUID(),
  w2 = randomUUID();
async function as(actor, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
  await db.exec("set role authenticated");
  return fn();
}
async function cmd(
  actor,
  action,
  job,
  payload = {},
  expected,
  key = randomUUID(),
) {
  return as(actor, async () => {
    let v = expected;
    if (v === undefined)
      v = job
        ? (await db.query("select version from jobs where id=$1", [job]))
            .rows[0]?.version || 0
        : 0;
    const r = await db.query("select command($1,$2,$3,$4,$5) as result", [
      action,
      job,
      v,
      key,
      JSON.stringify(payload),
    ]);
    return r.rows[0].result;
  });
}
async function rows(actor, table, job) {
  return as(
    actor,
    async () =>
      (await db.query(`select * from ${table} where job_id=$1`, [job])).rows,
  );
}
async function rejected(fn, match) {
  await assert.rejects(fn, match);
}
for (const [id, name, role] of [
  [c, "Customer", "customer"],
  [other, "Other customer", "customer"],
  [w1, "Asha Plumbing", "worker"],
  [w2, "Dev Plumbing", "worker"],
]) {
  await db.exec("reset role");
  await db.query("insert into auth.users values($1)", [id]);
  await cmd(id, "onboard", null, { name, role, area: "Indore" });
}
await rejected(
  () => cmd(w1, "onboard", null, { name: "Changed", role: "customer" }),
  /already set/,
);
ok("roles cannot be changed after onboarding");
const terms = {
  mode: "repair",
  scope: "Inspect and repair the leaking tap.",
  window: "Tomorrow morning",
  exclusions: "Hidden pipes",
  assumptions: "Accessible fitting",
  credit: 0,
  items: [
    {
      id: "visit",
      description: "Visit",
      kind: "visit",
      amount: 10000,
      estimated: false,
    },
    {
      id: "labour",
      description: "Labour",
      kind: "labour",
      amount: 25000,
      estimated: false,
    },
    {
      id: "material",
      description: "Washer allowance",
      kind: "material",
      amount: 10000,
      estimated: true,
    },
  ],
};
const make = async () => {
  const j = (
    await cmd(c, "create", null, {
      title: "Kitchen tap",
      description: "Kitchen tap drips continuously",
      area: "Indore",
      address: "10 Fictional Street",
    })
  ).id;
  await cmd(c, "brief", j, {
    text: "Inspect kitchen tap. Cause unknown. Hidden pipes excluded.",
    answers: {},
  });
  await cmd(c, "invite", j, { workerId: w1 });
  await cmd(c, "invite", j, { workerId: w2 });
  return j;
};
const j = await make();
assert.equal(
  (await as(other, () => db.query("select * from jobs"))).rows.length,
  0,
);
await rejected(
  () => cmd(other, "brief", j, { text: "Forged brief" }, 5),
  /not available/,
);
ok("other customers cannot read or mutate jobs");
assert.equal((await rows(w1, "job_private_details", j)).length, 0);
ok("precise address hidden before assignment");
await cmd(w1, "quote", j, { terms, maximum: 1 });
let q1 = (await rows(w1, "proposals", j))[0];
assert.equal(Number(q1.maximum), 45000);
ok("database ignores forged browser total");
await cmd(w2, "quote", j, {
  terms: {
    ...terms,
    items: terms.items.map((i) =>
      i.id === "material" ? { ...i, amount: 15000 } : i,
    ),
  },
});
let q2 = (await rows(w2, "proposals", j))[0];
assert.equal((await rows(w1, "proposals", j)).length, 1);
assert.equal((await rows(c, "proposals", j)).length, 2);
ok("competitor quotes are private");
await cmd(w1, "message", j, { workerId: w1, text: "Private details" });
assert.equal((await rows(w2, "messages", j)).length, 0);
await rejected(
  () => cmd(w2, "message", j, { workerId: w1, text: "Intruder" }),
  /not available/,
);
ok("conversation privacy enforced");
await rejected(
  () => cmd(w1, "accept", j, { proposalId: q1.id }),
  /counterparty/,
);
ok("author cannot accept their own proposal");
const counter = structuredClone(terms);
counter.items[1].amount = 20000;
await cmd(c, "counter", j, { proposalId: q1.id, terms: counter });
const all = await rows(c, "proposals", j);
assert.equal(all.find((q) => q.id === q1.id).status, "superseded");
q1 = all.find((q) => q.parent_id === q1.id);
ok("counteroffer preserves prior revision");
const version = (
  await as(c, () => db.query("select version from jobs where id=$1", [j]))
).rows[0].version;
await cmd(w1, "accept", j, { proposalId: q1.id }, version);
await rejected(
  () => cmd(c, "accept", j, { proposalId: q2.id }, version),
  /changed/,
);
assert.equal((await rows(c, "agreements", j)).length, 1);
ok("competing acceptance at same version yields one assignment");
assert.equal((await rows(w1, "job_private_details", j)).length, 1);
assert.equal((await rows(w2, "job_private_details", j)).length, 0);
ok("only assigned worker gains precise address");
await rejected(
  () =>
    as(w1, () =>
      db.query("update jobs set status='completed' where id=$1", [j]),
    ),
  /permission denied/,
);
await rejected(() => cmd(w2, "start", j), /assigned worker/);
ok("direct writes and unassigned transitions blocked");
await cmd(w1, "start", j);
const changed = structuredClone(counter);
changed.items.push({
  id: "extra",
  description: "Connector replacement",
  kind: "material",
  amount: 25000,
  estimated: true,
});
await cmd(w1, "change", j, {
  terms: changed,
  reason: "Connector also damaged",
});
let ch = (await rows(c, "change_requests", j))[0];
assert.equal(Number((await rows(c, "agreements", j))[0].maximum), 40000);
await rejected(
  () => cmd(w1, "complete", j, { terms: counter, agreementVersion: 1 }),
  /pending change/,
);
await rejected(
  () => cmd(w1, "decide_change", j, { changeId: ch.id, decision: "approved" }),
  /Only customer/,
);
ok("pending changes neither authorise charges nor allow completion");
await cmd(c, "decide_change", j, { changeId: ch.id, decision: "rejected" });
assert.equal((await rows(c, "agreements", j)).length, 1);
ok("rejected changes do not increase authorisation");
await cmd(w1, "change", j, {
  terms: changed,
  reason: "Revised connector proposal",
});
ch = (await rows(c, "change_requests", j)).find((c) => c.status === "pending");
const approvalVersion = (
  await as(c, () => db.query("select version from jobs where id=$1", [j]))
).rows[0].version;
const key = randomUUID();
const r = await cmd(
  c,
  "decide_change",
  j,
  { changeId: ch.id, decision: "approved" },
  approvalVersion,
  key,
);
assert.deepEqual(
  await cmd(
    c,
    "decide_change",
    j,
    { changeId: ch.id, decision: "approved" },
    approvalVersion,
    key,
  ),
  r,
);
assert.equal((await rows(c, "agreements", j)).length, 2);
await rejected(
  () =>
    cmd(
      c,
      "decide_change",
      j,
      { changeId: ch.id, decision: "rejected" },
      approvalVersion,
      key,
    ),
  /Idempotency/,
);
ok("duplicate approvals are idempotent and key reuse fails");
await rejected(
  () => cmd(w1, "complete", j, { terms: changed, agreementVersion: 1 }),
  /Agreement changed/,
);
ok("stale agreement version rejected");
const over = structuredClone(changed);
over.items[0].amount = 0;
over.items[2].amount = 15000;
await rejected(
  () => cmd(w1, "complete", j, { terms: over, agreementVersion: 2 }),
  /cap/,
);
ok("per-item material cap enforced even below total cap");
await cmd(w1, "complete", j, { terms: changed, agreementVersion: 2 });
await rejected(() => cmd(w1, "confirm_completion", j), /Customer/);
const cv = (
  await as(c, () => db.query("select version from jobs where id=$1", [j]))
).rows[0].version;
const ck = randomUUID();
await cmd(c, "confirm_completion", j, {}, cv, ck);
await cmd(c, "confirm_completion", j, {}, cv, ck);
const receipts = await rows(c, "receipts", j);
assert.equal(receipts.length, 1);
assert.equal(receipts[0].snapshot.completion.actual, 65000);
assert.equal(
  receipts[0].snapshot.payment,
  "Payment not collected through FixFirst",
);
assert.equal((await rows(other, "receipts", j)).length, 0);
ok("customer confirmation creates one private accurate receipt");
await rejected(
  () =>
    as(c, () =>
      db.query("update receipts set snapshot='{}' where job_id=$1", [j]),
    ),
  /permission denied/,
);
ok("receipt immutable through ordinary access");
const j2 = await make();
await cmd(w1, "quote", j2, { terms });
const stale = (await rows(w1, "proposals", j2))[0];
await cmd(c, "brief", j2, {
  text: "New brief changes the requested work.",
  answers: {},
});
await rejected(() => cmd(c, "accept", j2, { proposalId: stale.id }), /stale/);
ok("brief revision invalidates open quotes");
await cmd(w1, "quote", j2, { terms: { ...terms, mode: "inspection" } });
const inspect = (await rows(w1, "proposals", j2)).find(
  (q) => q.status === "open",
);
await cmd(c, "accept", j2, { proposalId: inspect.id });
await cmd(w1, "start", j2);
await rejected(
  () => cmd(w1, "complete", j2, { terms, agreementVersion: 1 }),
  /approved terms/,
);
ok("inspection acceptance cannot become repair during completion");
await rejected(
  () =>
    as(c, () =>
      db.query("select reserve_upload($1,$2,$3,$4,$5,$6)", [
        j2,
        "audio",
        "before",
        "audio/webm",
        200,
        61,
      ]),
    ),
  /60 seconds/,
);
await rejected(
  () =>
    as(w2, () =>
      db.query("select reserve_upload($1,$2,$3,$4,$5,$6)", [
        j2,
        "photo",
        "before",
        "image/jpeg",
        200,
        null,
      ]),
    ),
  /not permitted/,
);
ok("media membership, size and duration reservation limits");
await rejected(
  () =>
    as(c, () =>
      db.query("select finalize_upload($1,$2,$3,$4)", [
        randomUUID(),
        c,
        "fake",
        "audio",
      ]),
    ),
  /permission denied/,
);
ok("unverified media cannot be finalized directly by browser");
await cmd(w1, "cancel", j2, {
  reason: "Unable to continue safely",
  amount: 10000,
});
const cancellation = (await rows(c, "cancellation_requests", j2))[0];
await rejected(
  () =>
    cmd(w1, "decide_cancel", j2, {
      cancellationId: cancellation.id,
      decision: "approved",
    }),
  /cannot be decided/,
);
await cmd(c, "decide_cancel", j2, {
  cancellationId: cancellation.id,
  decision: "approved",
});
assert.equal(
  (await as(c, () => db.query("select status from jobs where id=$1", [j2])))
    .rows[0].status,
  "cancelled",
);
ok("cancellation settlement requires the other party");
await db.close();
console.log(
  `\n${checks} database integration checks passed (PostgreSQL via PGlite).`,
);
