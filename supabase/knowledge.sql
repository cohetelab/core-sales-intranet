-- Run once in the existing Supabase project's SQL editor.
-- Only explicitly invited staff in knowledge_members may use this workspace.
create table if not exists public.knowledge_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.knowledge_folders(id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.knowledge_folders(id) on delete set null,
  title text not null default '제목 없음' check (length(title) between 1 and 200),
  body jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  body_text text not null default '',
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists knowledge_folders_parent_idx on public.knowledge_folders(parent_id);
create index if not exists knowledge_documents_folder_idx on public.knowledge_documents(folder_id);
create index if not exists knowledge_documents_updated_idx on public.knowledge_documents(updated_at desc);

create or replace function public.is_knowledge_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.knowledge_members
    where user_id = (select auth.uid()) and active = true
  );
$$;

revoke all on function public.is_knowledge_member() from public;
grant execute on function public.is_knowledge_member() to authenticated;

alter table public.knowledge_members enable row level security;
alter table public.knowledge_folders enable row level security;
alter table public.knowledge_documents enable row level security;

create policy "members see own membership" on public.knowledge_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy "staff see folders" on public.knowledge_folders
  for select to authenticated using ((select public.is_knowledge_member()));
create policy "staff create folders" on public.knowledge_folders
  for insert to authenticated with check ((select public.is_knowledge_member()) and created_by = (select auth.uid()));
create policy "staff change folders" on public.knowledge_folders
  for update to authenticated using ((select public.is_knowledge_member()))
  with check ((select public.is_knowledge_member()));

create policy "staff see documents" on public.knowledge_documents
  for select to authenticated using ((select public.is_knowledge_member()));
create policy "staff create documents" on public.knowledge_documents
  for insert to authenticated with check ((select public.is_knowledge_member()) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "staff change documents" on public.knowledge_documents
  for update to authenticated using ((select public.is_knowledge_member()))
  with check ((select public.is_knowledge_member()) and updated_by = (select auth.uid()));

create or replace function public.protect_knowledge_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Creation audit fields cannot be changed';
  end if;
  return new;
end;
$$;

create trigger knowledge_folders_audit before update on public.knowledge_folders
  for each row execute function public.protect_knowledge_audit_fields();
create trigger knowledge_documents_audit before update on public.knowledge_documents
  for each row execute function public.protect_knowledge_audit_fields();

-- Atomic optimistic update: a stale editor receives no row and cannot overwrite.
create or replace function public.save_knowledge_document(
  p_id uuid, p_expected_version integer, p_title text, p_body jsonb, p_body_text text
) returns public.knowledge_documents
language plpgsql security invoker set search_path = '' as $$
declare saved public.knowledge_documents;
begin
  update public.knowledge_documents
  set title = p_title, body = p_body, body_text = p_body_text,
      version = version + 1, updated_by = auth.uid(), updated_at = now()
  where id = p_id and version = p_expected_version and deleted_at is null
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.save_knowledge_document(uuid, integer, text, jsonb, text) from public;
grant execute on function public.save_knowledge_document(uuid, integer, text, jsonb, text) to authenticated;
