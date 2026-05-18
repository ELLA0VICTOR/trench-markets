create table if not exists public.reports (
  market_id text not null,
  report_hash text not null,
  version integer not null,
  is_current boolean not null default false,
  report jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (market_id, report_hash)
);

create unique index if not exists reports_current_market_idx
  on public.reports (market_id)
  where is_current;

create table if not exists public.report_entitlements (
  id text primary key,
  buyer_address text not null,
  market_id text not null,
  first_report_hash text not null,
  latest_report_hash text not null,
  mode text not null check (mode in ('gateway', 'sponsored')),
  amount text,
  network text,
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_address, market_id)
);

create table if not exists public.market_snapshots (
  id bigserial primary key,
  market_id text not null,
  market jsonb not null,
  captured_at timestamptz not null default now()
);

alter table public.reports enable row level security;
alter table public.report_entitlements enable row level security;
alter table public.market_snapshots enable row level security;
