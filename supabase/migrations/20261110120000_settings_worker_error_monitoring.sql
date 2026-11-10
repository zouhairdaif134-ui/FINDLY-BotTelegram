-- Record sanitized FINDLY Worker 5xx failures for the admin security dashboard.
create table if not exists public.worker_error_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  request_path text not null,
  request_method text not null,
  response_status integer not null check (response_status between 500 and 599),
  error_code text,
  error_type text
);

create index if not exists worker_error_events_occurred_at_idx
  on public.worker_error_events (occurred_at desc);

alter table public.worker_error_events enable row level security;
revoke all on table public.worker_error_events from public, anon, authenticated;
grant select, insert on table public.worker_error_events to service_role;
grant usage, select on sequence public.worker_error_events_id_seq to service_role;

comment on table public.worker_error_events is
  'Sanitized server-side Worker API 5xx events. No request bodies, credentials, IP addresses or raw exception messages are stored.';
