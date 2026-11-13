-- Les notifications des classes reçues la nuit (22 h – 8 h) attendent ici le réveil de 8 h.
create table if not exists public.push_attente (
  id bigserial primary key,
  pseudos text[] not null,
  famille text not null,
  notif jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_attente enable row level security;
