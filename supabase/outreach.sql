-- DM 아웃리치(탐색 → 승인 → 발송 → 답장) 스키마.
-- 전부 서버(API 라우트)에서 service role/secret 키로만 접근한다.
-- RLS를 켜고 anon·authenticated 권한을 회수해서, 공개 키로는 아무것도 못 읽게 한다.

create extension if not exists pgcrypto;

-- 발송에 쓰는 인스타 계정. 계정별 하루 상한과 발송 간격을 서버가 강제한다.
create table public.outreach_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  handle text unique,
  daily_cap int not null default 15 check (daily_cap >= 0),
  min_interval_sec int not null default 180 check (min_interval_sec >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 탐색으로 찾은 인플루언서 후보.
create table public.outreach_targets (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram',
  handle text not null,
  display_name text,
  profile_url text,
  followers int,
  category text,
  source text,
  notes text,
  status text not null default 'candidate'
    check (status in ('candidate', 'approved', 'excluded', 'contacted', 'replied', 'closed')),
  created_at timestamptz not null default now(),
  unique (platform, handle)
);

-- 보낼 DM. approved 가 되어야만 발송 대상이 된다.
create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  account_id uuid not null references public.outreach_accounts (id),
  body text not null,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sending', 'sent', 'failed', 'cancelled')),
  approved_at timestamptz,
  claimed_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

-- 같은 대상에게 여러 계정이 중복 발송하지 않게 막는다.
create unique index outreach_messages_one_active_per_target
  on public.outreach_messages (target_id)
  where status in ('approved', 'sending', 'sent');

create index outreach_messages_queue on public.outreach_messages (account_id, status, approved_at);

-- 받은 답장.
create table public.outreach_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.outreach_messages (id) on delete set null,
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  account_id uuid not null references public.outreach_accounts (id),
  body text not null,
  received_at timestamptz not null default now(),
  handled boolean not null default false
);

-- 승인된 다음 DM 한 건을 원자적으로 집어서 sending 으로 바꾼다.
-- 하루 상한과 최소 간격을 넘으면 아무것도 돌려주지 않는다.
create or replace function public.claim_next_outreach_message(p_account uuid)
returns setof public.outreach_messages
language plpgsql
as $$
declare
  acct public.outreach_accounts;
  sent_today int;
  last_at timestamptz;
  picked public.outreach_messages;
begin
  select * into acct from public.outreach_accounts where id = p_account and active;
  if not found then
    return;
  end if;

  -- 같은 계정의 동시 호출을 한 줄로 세운다. 상한·간격 검사와 선택·갱신 사이에 다른 호출이 끼어들지 못하게 한다.
  perform pg_advisory_xact_lock(hashtext(p_account::text));

  -- 에이전트가 가져간 뒤 30분이 지나도 결과 보고가 없는 건은 실패로 돌린다. 실제로 보냈을 수도 있어서
  -- 자동으로 다시 보내지 않고, 사람이 확인한 뒤 새 초안을 만들게 한다(실패 건은 대상에 대한 중복 방지 인덱스에서 빠진다).
  update public.outreach_messages
     set status = 'failed', error = '발송 결과 보고가 없어 자동 정리됨(30분 초과)'
   where account_id = p_account and status = 'sending' and claimed_at < now() - interval '30 minutes';

  -- 시도한 건수는 실패 건도 센다(보냈는지 확실하지 않은 건이 상한을 넘기지 않게).
  select count(*), max(coalesce(sent_at, claimed_at))
    into sent_today, last_at
    from public.outreach_messages
   where account_id = p_account
     and (status in ('sending', 'sent') or (status = 'failed' and claimed_at is not null))
     and coalesce(sent_at, claimed_at) >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';

  if sent_today >= acct.daily_cap then
    return;
  end if;
  if last_at is not null and now() < last_at + make_interval(secs => acct.min_interval_sec) then
    return;
  end if;

  select * into picked
    from public.outreach_messages
   where account_id = p_account and status = 'approved'
   order by approved_at
   for update skip locked
   limit 1;
  if not found then
    return;
  end if;

  update public.outreach_messages
     set status = 'sending', claimed_at = now()
   where id = picked.id
   returning * into picked;
  return next picked;
end;
$$;

-- 모든 테이블 RLS 켜고 공개 역할 권한 회수 (정책을 만들지 않으므로 API 공개 키로는 접근 불가).
alter table public.outreach_accounts enable row level security;
alter table public.outreach_targets enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_replies enable row level security;

revoke all on table public.outreach_accounts from anon, authenticated;
revoke all on table public.outreach_targets from anon, authenticated;
revoke all on table public.outreach_messages from anon, authenticated;
revoke all on table public.outreach_replies from anon, authenticated;
revoke execute on function public.claim_next_outreach_message(uuid) from public, anon, authenticated;
