-- Run in the Supabase SQL editor before enabling the Drive integration.
-- Tokens are encrypted by the application before insertion. Only server-side
-- service-role access is allowed; browser clients have no table privileges.
create table if not exists public.google_drive_sessions (
  id uuid primary key,
  email text not null,
  refresh_token_ciphertext text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists google_drive_sessions_expires_at
  on public.google_drive_sessions (expires_at);

alter table public.google_drive_sessions enable row level security;
revoke all on public.google_drive_sessions from anon, authenticated;
