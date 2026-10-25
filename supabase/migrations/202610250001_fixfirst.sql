-- Authoritative workflow. All writes use authenticated, atomic functions.
create table public.profiles(id uuid primary key references auth.users, name text not null check(length(name) between 2 and 100),role text not null check(role in ('customer','worker')),locale text not null default 'en' check(locale in ('en','hi')),area text not null default '',trade text not null default 'Plumbing');
create table public.jobs(id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.profiles,worker_id uuid references public.profiles,title text not null,description text not null,area text not null,status text not null default 'draft' check(status in ('draft','open_for_quotes','agreed','in_progress','change_pending','awaiting_completion','completed','cancelled')),version int not null default 1,brief_version int not null default 0,agreement_version int not null default 0,created_at timestamptz not null default now());
create table public.job_private_details(job_id uuid primary key references public.jobs,address text not null);
create table public.job_participants(job_id uuid references public.jobs,user_id uuid references public.profiles,primary key(job_id,user_id));
create table public.brief_versions(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,version int not null,text text not null,answers jsonb not null,created_at timestamptz not null default now(),unique(job_id,version));
create table public.proposals(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,worker_id uuid not null references public.profiles,author_id uuid not null references public.profiles,parent_id uuid references public.proposals,brief_version int not null,terms jsonb not null,maximum bigint not null check(maximum>=0),status text not null default 'open' check(status in ('open','accepted','superseded')),expires_at timestamptz not null,created_at timestamptz not null default now());
create table public.agreements(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,version int not null,terms jsonb not null,maximum bigint not null,source_id uuid not null,proposer_id uuid not null references public.profiles,accepter_id uuid not null references public.profiles,proposed_at timestamptz not null,accepted_at timestamptz not null default now(),unique(job_id,version));
create table public.change_requests(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,base_version int not null,terms jsonb not null,maximum bigint not null,reason text not null,status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now());
create unique index one_pending_change on public.change_requests(job_id) where status='pending';
create table public.completion_requests(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,agreement_version int not null,terms jsonb not null,actual bigint not null,created_at timestamptz not null default now());
create table public.receipts(id uuid primary key default gen_random_uuid(),job_id uuid unique not null references public.jobs,snapshot jsonb not null,created_at timestamptz not null default now());
create table public.messages(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,worker_id uuid not null references public.profiles,sender_id uuid not null references public.profiles,text text not null check(length(text) between 1 and 2000),created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles,job_id uuid references public.jobs,text text not null,read_at timestamptz,created_at timestamptz not null default now());
create table public.job_events(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,actor_id uuid not null references public.profiles,event text not null,created_at timestamptz not null default now());
create table public.approvals(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,entity_id uuid not null,actor_id uuid not null references public.profiles,decision text not null,consent_version text not null default '1',created_at timestamptz not null default now());
create table public.cancellation_requests(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,author_id uuid not null references public.profiles,amount bigint not null check(amount>=0),reason text not null,status text not null default 'pending',created_at timestamptz not null default now());
create unique index one_pending_cancellation on public.cancellation_requests(job_id) where status='pending';
create table public.complaints(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,reporter_id uuid not null references public.profiles,text text not null,created_at timestamptz not null default now());
create table public.command_results(actor_id uuid not null references auth.users,key uuid not null,fingerprint jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,key));
create table public.attachments(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs,uploader_id uuid not null references public.profiles,path text unique not null,kind text not null check(kind in ('photo','audio')),stage text not null check(stage in ('before','after')),mime text not null,bytes int not null check(bytes>0 and bytes<=5242880),duration numeric,finalized boolean not null default false,created_at timestamptz not null default now());
create index jobs_customer on public.jobs(customer_id,created_at desc);
create index jobs_worker on public.jobs(worker_id,status);
create index participants_user on public.job_participants(user_id);
create index proposals_job on public.proposals(job_id);
create index messages_room on public.messages(job_id,worker_id,created_at);
create index notifications_user on public.notifications(user_id,created_at desc);

create function public.is_customer(j uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from jobs where id=j and customer_id=auth.uid())$$;
create function public.is_assigned(j uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from jobs where id=j and auth.uid() in (customer_id,worker_id))$$;
create function public.is_member(j uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from job_participants where job_id=j and user_id=auth.uid())$$;
do $$declare t text;begin foreach t in array array['profiles','jobs','job_private_details','job_participants','brief_versions','proposals','agreements','change_requests','completion_requests','receipts','messages','notifications','job_events','approvals','cancellation_requests','complaints','command_results','attachments'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);execute format('grant select on public.%I to authenticated',t);end loop;end$$;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or role='worker' or exists(select 1 from public.jobs j where j.customer_id=profiles.id and public.is_member(j.id)));
create policy job_read on public.jobs for select to authenticated using(public.is_member(id));
create policy private_read on public.job_private_details for select to authenticated using(public.is_assigned(job_id));
create policy participants_read on public.job_participants for select to authenticated using(user_id=auth.uid() or public.is_customer(job_id));
create policy brief_read on public.brief_versions for select to authenticated using(public.is_member(job_id));
create policy proposal_read on public.proposals for select to authenticated using(public.is_customer(job_id) or worker_id=auth.uid());
create policy agreement_read on public.agreements for select to authenticated using(public.is_assigned(job_id));
create policy change_read on public.change_requests for select to authenticated using(public.is_assigned(job_id));
create policy completion_read on public.completion_requests for select to authenticated using(public.is_assigned(job_id));
create policy receipt_read on public.receipts for select to authenticated using(public.is_assigned(job_id));
create policy message_read on public.messages for select to authenticated using(public.is_customer(job_id) or worker_id=auth.uid());
create policy notification_read on public.notifications for select to authenticated using(user_id=auth.uid());
create policy event_read on public.job_events for select to authenticated using(public.is_assigned(job_id));
create policy approval_read on public.approvals for select to authenticated using(public.is_assigned(job_id));
create policy cancellation_read on public.cancellation_requests for select to authenticated using(public.is_assigned(job_id));
create policy complaint_read on public.complaints for select to authenticated using(reporter_id=auth.uid());
create policy attachment_read on public.attachments for select to authenticated using(finalized and public.is_member(job_id));

create function public.price(t jsonb) returns bigint language plpgsql immutable set search_path=public,pg_temp as $$
declare x jsonb;n bigint:=0;c bigint;ids text[]:='{}';begin
 if coalesce(t->>'mode','') not in ('inspection','repair') or length(coalesce(t->>'scope','')) not between 5 and 4000 or length(coalesce(t->>'window','')) not between 3 and 200 then raise exception 'Invalid service terms';end if;
 if jsonb_typeof(t->'items') is distinct from 'array' then raise exception 'Items required';end if;
 if jsonb_array_length(t->'items') not between 1 and 20 then raise exception 'Use 1 to 20 items';end if;
 for x in select * from jsonb_array_elements(t->'items') loop
 if coalesce(x->>'amount','') !~ '^[0-9]+$' or (x->>'amount')::bigint>10000000 or length(coalesce(x->>'id','')) not between 1 and 80 or x->>'id'=any(ids) or length(coalesce(x->>'description','')) not between 1 and 200 or coalesce(x->>'kind','') not in ('visit','labour','material') then raise exception 'Invalid item';end if;
 ids:=array_append(ids,x->>'id');n:=n+(x->>'amount')::bigint;end loop;
 if coalesce(t->>'credit','') !~ '^[0-9]+$' then raise exception 'Invalid credit';end if;c:=(t->>'credit')::bigint;if c>n then raise exception 'Credit exceeds total';end if;return n-c;end$$;

create function public.command(p_action text,p_job uuid,p_expected int,p_key uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid();me profiles;j jobs;q proposals;a agreements;ch change_requests;co completion_requests;ca cancellation_requests;old command_results;result jsonb;fingerprint jsonb;terms jsonb;mx bigint;entity uuid;target uuid;item jsonb;cap jsonb;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_key is null or octet_length(p_payload::text)>60000 then raise exception 'Invalid command';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 fingerprint:=jsonb_build_object('action',p_action,'job',p_job,'expected',p_expected,'payload',p_payload);
 select * into old from command_results where actor_id=actor and key=p_key;
 if found then if old.fingerprint<>fingerprint then raise exception 'Idempotency key already used for another request' using errcode='40001';end if;return old.result;end if;
 if (select count(*) from command_results where actor_id=actor and created_at>now()-interval '1 minute')>=60 then raise exception 'Too many requests. Try again in a minute.' using errcode='P0429';end if;
 select * into me from profiles where id=actor;
 if p_action='onboard' then
 if me.id is not null then raise exception 'Profile and role already set';end if;
 insert into profiles(id,name,role,locale,area) values(actor,p_payload->>'name',p_payload->>'role',coalesce(p_payload->>'locale','en'),left(coalesce(p_payload->>'area',''),200));result:=jsonb_build_object('id',actor);
 elsif me.id is null then raise exception 'Complete your profile first' using errcode='42501';
 elsif p_action='read_notifications' then update notifications set read_at=now() where user_id=actor and read_at is null;result:='{}';
 elsif p_action='create' then
 if me.role<>'customer' then raise exception 'Only customers create jobs' using errcode='42501';end if;
 if length(coalesce(p_payload->>'description','')) not between 5 and 4000 or length(coalesce(p_payload->>'area','')) not between 2 and 200 or length(coalesce(p_payload->>'address','')) not between 5 and 1000 then raise exception 'Description, area, and address required';end if;
 insert into jobs(customer_id,title,description,area) values(actor,left(coalesce(p_payload->>'title','Leaking tap'),120),p_payload->>'description',p_payload->>'area') returning * into j;
 insert into job_private_details values(j.id,p_payload->>'address');insert into job_participants values(j.id,actor);result:=jsonb_build_object('id',j.id);
 else
 select * into j from jobs where id=p_job for update;
 if j.id is null or not is_member(j.id) then raise exception 'Job not available' using errcode='42501';end if;
 if j.version<>p_expected then raise exception 'This job changed. Refresh and review the latest version.' using errcode='40001';end if;
 if p_action='brief' then
 if actor<>j.customer_id or j.status not in ('draft','open_for_quotes') then raise exception 'Brief is locked' using errcode='42501';end if;
 if length(coalesce(p_payload->>'text','')) not between 10 and 6000 then raise exception 'Provide a clear brief';end if;
 insert into brief_versions(job_id,version,text,answers) values(j.id,j.brief_version+1,p_payload->>'text',coalesce(p_payload->'answers','{}'));
 update proposals set status='superseded' where job_id=j.id and status='open';update jobs set brief_version=brief_version+1,status='open_for_quotes' where id=j.id;
 elsif p_action='invite' then
 if actor<>j.customer_id or j.status<>'open_for_quotes' then raise exception 'Confirm your brief first' using errcode='42501';end if;
 target:=(p_payload->>'workerId')::uuid;if not exists(select 1 from profiles where id=target and role='worker' and trade='Plumbing' and lower(area)=lower(j.area)) then raise exception 'Worker does not serve this area';end if;
 insert into job_participants values(j.id,target) on conflict do nothing;insert into notifications(user_id,job_id,text) values(target,j.id,'You have a new plumbing invitation');
 elsif p_action in ('quote','counter') then
 if j.status<>'open_for_quotes' then raise exception 'Quotes are closed' using errcode='40001';end if;terms:=p_payload->'terms';mx:=price(terms);
 if p_action='quote' then
 if me.role<>'worker' then raise exception 'Only invited workers quote' using errcode='42501';end if;target:=actor;
 if exists(select 1 from proposals where job_id=j.id and worker_id=actor and status='open') then raise exception 'Counter the current proposal';end if;
 else
 select * into q from proposals where id=(p_payload->>'proposalId')::uuid and job_id=j.id;
 if q.id is null or actor not in (j.customer_id,q.worker_id) then raise exception 'Proposal not available' using errcode='42501';end if;
 if q.status<>'open' or q.expires_at<=now() or q.brief_version<>j.brief_version then raise exception 'Proposal is stale' using errcode='40001';end if;target:=q.worker_id;update proposals set status='superseded' where id=q.id;end if;
 insert into proposals(job_id,worker_id,author_id,parent_id,brief_version,terms,maximum,expires_at) values(j.id,target,actor,q.id,j.brief_version,terms,mx,now()+interval '48 hours') returning id into entity;
 insert into approvals(job_id,entity_id,actor_id,decision) values(j.id,entity,actor,'proposed');insert into notifications(user_id,job_id,text) values(case when actor=j.customer_id then target else j.customer_id end,j.id,'A quote or counteroffer is ready to review');
 elsif p_action='accept' then
 select * into q from proposals where id=(p_payload->>'proposalId')::uuid and job_id=j.id for update;
 if q.id is null or actor not in (j.customer_id,q.worker_id) or actor=q.author_id then raise exception 'Only the counterparty may accept' using errcode='42501';end if;
 if j.status<>'open_for_quotes' or q.status<>'open' or q.expires_at<=now() or q.brief_version<>j.brief_version then raise exception 'Proposal is stale or already accepted' using errcode='40001';end if;
 mx:=price(q.terms);insert into agreements(job_id,version,terms,maximum,source_id,proposer_id,accepter_id,proposed_at) values(j.id,1,q.terms,mx,q.id,q.author_id,actor,q.created_at);
 update proposals set status=case when id=q.id then 'accepted' else 'superseded' end where job_id=j.id and status='open';update jobs set worker_id=q.worker_id,agreement_version=1,status='agreed' where id=j.id;insert into approvals(job_id,entity_id,actor_id,decision) values(j.id,q.id,actor,'accepted');
 elsif p_action='start' then
 if actor is distinct from j.worker_id or j.status<>'agreed' then raise exception 'Only assigned worker can start an agreed job' using errcode='42501';end if;update jobs set status='in_progress' where id=j.id;
 elsif p_action='change' then
 if actor is distinct from j.worker_id or j.status<>'in_progress' then raise exception 'Only assigned worker can propose a change during work' using errcode='42501';end if;
 if length(coalesce(p_payload->>'reason','')) not between 5 and 2000 then raise exception 'Explain the change';end if;
 terms:=p_payload->'terms';mx:=price(terms);insert into change_requests(job_id,base_version,terms,maximum,reason) values(j.id,j.agreement_version,terms,mx,p_payload->>'reason');update jobs set status='change_pending' where id=j.id;
 elsif p_action='decide_change' then
 if actor<>j.customer_id or j.status<>'change_pending' then raise exception 'Only customer may decide a pending change' using errcode='42501';end if;
 select * into ch from change_requests where id=(p_payload->>'changeId')::uuid and job_id=j.id and status='pending';if ch.id is null or ch.base_version<>j.agreement_version then raise exception 'Change is stale' using errcode='40001';end if;
 if coalesce(p_payload->>'decision','') not in ('approved','rejected') then raise exception 'Explicit decision required';end if;
 if p_payload->>'decision'='approved' then insert into agreements(job_id,version,terms,maximum,source_id,proposer_id,accepter_id,proposed_at) values(j.id,j.agreement_version+1,ch.terms,price(ch.terms),ch.id,j.worker_id,actor,ch.created_at);update jobs set agreement_version=agreement_version+1 where id=j.id;end if;
 update change_requests set status=p_payload->>'decision' where id=ch.id;insert into approvals(job_id,entity_id,actor_id,decision) values(j.id,ch.id,actor,p_payload->>'decision');update jobs set status='in_progress' where id=j.id;
 elsif p_action='complete' then
 if actor is distinct from j.worker_id or j.status<>'in_progress' then raise exception 'Only assigned worker can request completion with no pending change' using errcode='42501';end if;
 select * into a from agreements where job_id=j.id and version=j.agreement_version;if (p_payload->>'agreementVersion')::int is distinct from a.version then raise exception 'Agreement changed' using errcode='40001';end if;
 terms:=p_payload->'terms';mx:=price(terms);
 if mx>a.maximum or terms->>'mode' is distinct from a.terms->>'mode' or terms->>'scope' is distinct from a.terms->>'scope' or terms->>'credit' is distinct from a.terms->>'credit' or jsonb_array_length(terms->'items')<>jsonb_array_length(a.terms->'items') then raise exception 'Actual items must match approved terms and caps';end if;
 for item in select * from jsonb_array_elements(terms->'items') loop select value into cap from jsonb_array_elements(a.terms->'items') where value->>'id'=item->>'id';if cap is null or (item->>'amount')::bigint>(cap->>'amount')::bigint or item->>'description' is distinct from cap->>'description' or item->>'kind' is distinct from cap->>'kind' then raise exception 'Actual item exceeds or changes its approved cap';end if;end loop;
 insert into completion_requests(job_id,agreement_version,terms,actual) values(j.id,a.version,terms,mx);update jobs set status='awaiting_completion' where id=j.id;
 elsif p_action='confirm_completion' then
 if actor<>j.customer_id or j.status<>'awaiting_completion' then raise exception 'Customer must confirm completion' using errcode='42501';end if;
 select * into co from completion_requests where job_id=j.id order by created_at desc limit 1;if co.agreement_version<>j.agreement_version then raise exception 'Agreement changed' using errcode='40001';end if;
 insert into approvals(job_id,entity_id,actor_id,decision) values(j.id,co.id,actor,'completion_confirmed');
 insert into receipts(job_id,snapshot) values(j.id,jsonb_build_object('job',to_jsonb(j),'customer',(select name from profiles where id=j.customer_id),'worker',(select name from profiles where id=j.worker_id),'brief',(select text from brief_versions where job_id=j.id and version=j.brief_version),'agreements',(select jsonb_agg(to_jsonb(g) order by version) from agreements g where job_id=j.id),'approvals',(select jsonb_agg(to_jsonb(ap) order by created_at) from approvals ap where job_id=j.id),'completion',to_jsonb(co),'evidence',(select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'stage',stage)) from attachments where job_id=j.id and finalized),'confirmedAt',now(),'payment','Payment not collected through FixFirst'));update jobs set status='completed' where id=j.id;
 elsif p_action='message' then
 target:=(p_payload->>'workerId')::uuid;if not exists(select 1 from job_participants where job_id=j.id and user_id=target) or not exists(select 1 from profiles where id=target and role='worker') or (actor<>j.customer_id and actor<>target) then raise exception 'Conversation not available' using errcode='42501';end if;
 insert into messages(job_id,worker_id,sender_id,text) values(j.id,target,actor,p_payload->>'text');insert into notifications(user_id,job_id,text) values(case when actor=target then j.customer_id else target end,j.id,'New message in your private job conversation');
 elsif p_action='cancel' then
 if not is_assigned(j.id) or j.status in ('completed','cancelled','change_pending','awaiting_completion') then raise exception 'Cannot cancel in this state' using errcode='42501';end if;
 if j.status in ('draft','open_for_quotes') then if actor<>j.customer_id then raise exception 'Only customer may cancel before acceptance' using errcode='42501';end if;update jobs set status='cancelled' where id=j.id;update proposals set status='superseded' where job_id=j.id and status='open';
 else select * into a from agreements where job_id=j.id and version=j.agreement_version;mx:=(p_payload->>'amount')::bigint;if mx is null or mx<0 or mx>a.maximum or length(coalesce(p_payload->>'reason',''))<5 then raise exception 'Settlement must be within the authorised maximum with a reason';end if;insert into cancellation_requests(job_id,author_id,amount,reason) values(j.id,actor,mx,p_payload->>'reason');end if;
 elsif p_action='decide_cancel' then
 select * into ca from cancellation_requests where id=(p_payload->>'cancellationId')::uuid and job_id=j.id and status='pending';if ca.id is null or not is_assigned(j.id) or ca.author_id=actor or j.status not in ('agreed','in_progress') then raise exception 'Settlement cannot be decided' using errcode='42501';end if;
 if coalesce(p_payload->>'decision','') not in ('approved','rejected') then raise exception 'Explicit decision required';end if;update cancellation_requests set status=p_payload->>'decision' where id=ca.id;insert into approvals(job_id,entity_id,actor_id,decision) values(j.id,ca.id,actor,p_payload->>'decision');if p_payload->>'decision'='approved' then update jobs set status='cancelled' where id=j.id;end if;
 elsif p_action='dispute' then
 if not is_assigned(j.id) or length(coalesce(p_payload->>'text','')) not between 5 and 4000 then raise exception 'Describe the issue for your assigned job' using errcode='42501';end if;insert into complaints(job_id,reporter_id,text) values(j.id,actor,p_payload->>'text');if actor=j.customer_id and j.status='awaiting_completion' then update jobs set status='in_progress' where id=j.id;end if;
 else raise exception 'Unknown command';end if;
 if p_action<>'message' then update jobs set version=version+1 where id=j.id;insert into job_events(job_id,actor_id,event) values(j.id,actor,p_action);end if;
 if p_action in ('accept','start','change','decide_change','complete','confirm_completion','cancel','decide_cancel','dispute') then insert into notifications(user_id,job_id,text) select x,j.id,replace(p_action,'_',' ')||': '||j.title from jobs cross join lateral unnest(array[customer_id,worker_id]) x where id=j.id and x is not null and x<>actor;end if;
 result:=jsonb_build_object('id',j.id,'version',(select version from jobs where id=j.id));end if;
 insert into command_results(actor_id,key,fingerprint,result) values(actor,p_key,fingerprint,result);return result;end$$;
revoke all on function public.command(text,uuid,int,uuid,jsonb),public.price(jsonb) from public;
grant execute on function public.command(text,uuid,int,uuid,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('job-media','job-media',false,5242880,array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg']) on conflict(id) do nothing;
create function public.reserve_upload(p_job uuid,p_kind text,p_stage text,p_mime text,p_bytes int,p_duration numeric) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j jobs;aid uuid:=gen_random_uuid();object_path text;begin
 select * into j from jobs where id=p_job for update;if not is_assigned(p_job) or j.status in ('completed','cancelled') then raise exception 'Upload not permitted' using errcode='42501';end if;
 if p_stage not in ('before','after') or (p_stage='after' and j.worker_id is distinct from auth.uid()) then raise exception 'Invalid evidence stage';end if;
 if (select count(*) from attachments where job_id=p_job and created_at>now()-interval '1 minute')>=8 then raise exception 'Upload rate limit' using errcode='P0429';end if;
 delete from attachments where job_id=p_job and not finalized and created_at<now()-interval '1 hour';
 if p_kind='photo' then if p_bytes>2097152 or p_mime not in ('image/jpeg','image/png','image/webp') or (select count(*) from attachments where job_id=p_job and kind='photo' and stage=p_stage)>=4 then raise exception 'Maximum four photos per stage, 2 MB each';end if;
 elsif p_kind='audio' then if p_bytes>5242880 or p_duration is null or p_duration<=0 or p_duration>60 or p_mime not in ('audio/webm','audio/mp4','audio/ogg') or exists(select 1 from attachments where job_id=p_job and kind='audio') then raise exception 'One voice note, up to 60 seconds and 5 MB';end if;
 else raise exception 'Unsupported media';end if;
 object_path:=p_job::text||'/'||auth.uid()::text||'/'||aid::text;insert into attachments(id,job_id,uploader_id,path,kind,stage,mime,bytes,duration) values(aid,p_job,auth.uid(),object_path,p_kind,p_stage,p_mime,p_bytes,p_duration);return jsonb_build_object('id',aid,'path',object_path);end$$;
create function public.finalize_upload(p_id uuid,p_actor uuid,p_path text,p_kind text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a attachments;meta jsonb;begin select * into a from attachments where id=p_id for update;if a.uploader_id is distinct from p_actor or a.path is distinct from p_path or a.kind is distinct from p_kind or not exists(select 1 from jobs where id=a.job_id and p_actor in (customer_id,worker_id) and status not in ('completed','cancelled')) then raise exception 'Upload not available' using errcode='42501';end if;select metadata into meta from storage.objects where bucket_id='job-media' and name=a.path;if meta is null or (meta->>'size')::bigint is distinct from a.bytes or meta->>'mimetype' is distinct from a.mime then raise exception 'Stored file metadata did not match';end if;update attachments set finalized=true where id=p_id;end$$;
create function public.can_upload(p_path text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from attachments where path=p_path and uploader_id=auth.uid() and not finalized and created_at>now()-interval '1 hour')$$;
revoke all on function public.reserve_upload(uuid,text,text,text,int,numeric),public.finalize_upload(uuid,uuid,text,text) from public;
grant execute on function public.reserve_upload(uuid,text,text,text,int,numeric) to authenticated;
grant execute on function public.finalize_upload(uuid,uuid,text,text) to service_role;
create policy media_insert on storage.objects for insert to authenticated with check(bucket_id='job-media' and public.can_upload(name));
create policy media_read on storage.objects for select to authenticated using(bucket_id='job-media' and exists(select 1 from public.attachments a where a.path=name and a.finalized and public.is_member(a.job_id)));
create policy pending_media_owner on storage.objects for select to authenticated using(bucket_id='job-media' and public.can_upload(name));
alter publication supabase_realtime add table public.jobs,public.messages,public.notifications;
