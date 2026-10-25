# Supabase and deployment

1. Create a Supabase project. Use the SQL editor to run `supabase/migrations/202610250001_fixfirst.sql` once against an empty application schema. It creates application tables, policies, transactional functions, the private `job-media` bucket and Realtime publication membership. Do not rerun the initial migration over existing application tables. Subsequent changes belong in new migrations.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the exact `NEXT_PUBLIC_APP_URL` in `.env.local` and your hosting environment. Restart/rebuild after public environment changes.
3. For media, set `SUPABASE_SERVICE_ROLE_KEY` directly in the server environment using an existing server secret or legacy service-role key. This key must never appear in browser code, public variables, Git history, screenshots or shared docs. The application uses it only after user-scoped media download/validation, for the restricted finalization function. Do not send it in chat.
4. Set Supabase Auth Site URL and allowed callback URLs to the local/deployed `/auth/callback`. Test confirmation email delivery; Supabase's default delivery is restricted. Use three separate, securely provisioned demo identities for the customer and two workers. Complete onboarding for all accounts with the same service city.
5. Run the local checks in README. Run the demo with three isolated browser contexts, verifying reload, rejected changes, competitor privacy, receipt printing and microphone-denial fallback.
6. Import the GitHub repository into a compatible Next.js hosting provider. Use `npm run build`; set environment values before building. A Vercel plan must be appropriate for the intended use. Do not enable paid services automatically.
7. Use the generated HTTPS domain. Set the exact app URL in the environment and Supabase callbacks, rebuild and verify again. Media recording on a phone requires HTTPS. No hosting deployment is included merely by pushing source.

## Verify the migration

```sql
select tablename, rowsecurity from pg_tables where schemaname='public';
select routine_name from information_schema.routines
where routine_schema='public' and routine_name in ('command','reserve_upload','finalize_upload');
select id, public from storage.buckets where id='job-media';
```

All application tables must have RLS enabled. The media bucket must be private. Never solve a permissions error by disabling RLS or granting direct writes to workflow tables.

## Operational follow-up

Before real customer intake, document retention/deletion, account deletion, backup/restore and complaint response, test database/media restoration, configure trusted email delivery, review current service quotas, and exercise true concurrent acceptance from separate database connections. Pause optional uploads at quota limits; do not silently upgrade plans. No automatic completion or extra-work approvals should be introduced.
