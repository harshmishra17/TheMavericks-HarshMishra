# FixFirst

**Agree on the job before agreeing on the price.**

FixFirst is a mobile-friendly plumbing marketplace built for the leaking-tap journey. Customers confirm an editable guided brief, invite workers, compare itemised quotes, negotiate revisions, and explicitly approve any changed scope before additional charges are authorised. Customer-confirmed completion creates an immutable printable receipt.

## Run locally

Use Node.js 22.12+ and npm. The lockfile is committed.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**. Set `NEXT_PUBLIC_APP_URL` to the exact URL used in the browser. Requests from other origins are rejected. For `http://127.0.0.1:3000`, change that setting accordingly.

Create a Supabase project and apply `supabase/migrations/202610250001_fixfirst.sql` once using the SQL editor, or apply migrations through a linked Supabase CLI project. Add its URL and publishable key to `.env.local`. Never commit real environment files.

Media finalization additionally needs `SUPABASE_SERVICE_ROLE_KEY` (a server secret key or legacy service-role key) in the local/server environment. Enter it directly on your computer or hosting provider; never paste it in chat or expose it through `NEXT_PUBLIC_`. The privileged client is restricted in application code to verified media finalization. Ordinary workflow commands use the signed-in user's client and database authorization.

Configure Supabase Auth Site URL and allowed redirect URLs, including `http://localhost:3000/auth/callback` and the deployed HTTPS callback. Email signup uses confirmation; configure your own tested email delivery for public signup. For a private demo, provision separate customer and worker users through the Supabase dashboard and give each person their own credentials securely. Complete onboarding separately for each account. Choose the same city/service-area text for customers and workers (matching ignores case).

## Implemented

- Email/password authentication, immutable customer/worker role, onboarding, and session-backed APIs.
- Requests with private exact addresses; guided questions with unknown answers; original descriptions and immutable confirmed brief versions.
- Worker directory and invitations filtered by plumbing and city; each worker submits their own quote from a separate account.
- Itemised fixed/allowance prices in integer INR paise, visit-fee credit, inspection/repair distinction, explicit exclusions, assumptions, visit window, and 48-hour proposal expiry.
- Revision-based counters, bilateral acceptance, atomic assignment, server-computed totals, stale-version rejection, durable idempotency, and transactional approvals/events/notifications.
- Worker start, full-replacement scope changes, customer approval/rejection, per-item actual-cost caps, worker completion request, customer confirmation, and immutable private receipt with agreement/approval history.
- Cancellation before agreement; mutually approved cancellation settlement within the approved maximum afterwards. Issues can be recorded; incomplete work can be returned to the worker.
- Separate customer/worker chat rooms, in-app notifications, Realtime subscriptions, focus refresh and polling recovery.
- Private before/after photos, image recompression, voice recording/file upload, preview, removal before submission, upload stage feedback and retry. Limits: four photos per stage at 2 MB each; one voice note per job at 60 seconds/5 MB. Server checks actual media before finalization. Microphone denial preserves text/file input.
- Responsive desktop/mobile layout, keyboard-accessible forms, labels, errors, print styles, and initial English/Hindi navigation and landing-page dictionaries.

Routes are handled through the App Router; role-aware job screens use `/jobs/[id]` with request/clarification aliases from the blueprint. Mutations are consolidated under `POST /api/command`; media reservation/finalization uses `POST /api/media`. See [architecture](docs/architecture.md).

## Validation

```sh
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```

The database test runs the actual migration and functions in PostgreSQL via PGlite with separate authenticated roles and RLS. It checks 23 workflow/security invariants. It supplies minimal Auth/Storage system-table fixtures, so it does not replace verification against hosted Supabase. The same-version acceptance test verifies exactly one assignment after competing commands; a true multi-connection concurrency test remains a hosted/local PostgreSQL check.

Eight unit tests cover integer pricing, caps, inspection scope and guided briefs. Six Playwright tests cover public desktop/mobile rendering, sign-in gates, language switching, overflow, and API origin/session rejection. The full authenticated multi-user browser journey and real-phone recording must still be run against a configured Supabase project. No live deployment is claimed by a successful local build.

The build explicitly uses webpack because Turbopack worker startup failed on the development Windows machine. Both are supported Next.js build paths.

## Release status and scope

Source implementation and local tests are available. Applying migration files to the new hosted Supabase project, configuring server-only media verification, provisioning demo users, and verifying the hosted flow are separate setup steps. Check [deployment](docs/deployment.md) and the [demo script](docs/demo.md).

Deferred: additional trades, video, AI/transcription, phone calls, payment collection, maps/routing, automatic scheduling/conflict prevention, reviews, admin moderation, push notifications, full Hindi translation of workflow forms, automatic data retention/deletion, and a polished complaint-resolution workflow. There are no paid API dependencies and no automatic service upgrades. Define retention, account deletion, backups and operating responsibilities before admitting real customers.

Receipts explicitly say **“Payment not collected through FixFirst”**. They are completion records, not payment evidence or tax invoices. Example prices and test people are fictional.

## Repository

[harshmishra17/TheMavericks-HarshMishra](https://github.com/harshmishra17/TheMavericks-HarshMishra)

Original repository history is retained. Local reference PDFs, recordings, generated test output, `.env.local`, dependencies, and build output are excluded from app commits.
