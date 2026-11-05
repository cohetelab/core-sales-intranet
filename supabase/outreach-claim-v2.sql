-- 이미 outreach.sql을 실행한 DB에 적용하는 갱신본(Supabase SQL 편집기에서 한 번 실행).
-- 1) 같은 계정의 동시 호출을 advisory lock으로 직렬화 — 상한·간격 검사가 동시에 통과하던 틈을 막는다.
-- 2) 30분 넘게 sending 에 머문 건을 failed 로 정리 — 에이전트가 죽어도 대상이 영원히 막히지 않는다.
-- 3) 상한 계산에 시도한 실패 건도 포함.
-- 새로 설치하는 경우에는 outreach.sql 에 이미 같은 내용이 들어 있으니 이 파일은 필요 없다.

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

revoke execute on function public.claim_next_outreach_message(uuid) from public, anon, authenticated;
