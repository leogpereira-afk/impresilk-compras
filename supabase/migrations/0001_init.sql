-- ============================================================================
-- Schema do COMPRAS Impresilk. PROJETO COMPARTILHADO (heveemylixartyijxewh):
-- o RH usa nomes crus; tudo aqui leva compras_/compras-. Molde: Domo (que
-- roda o mesmo desenho em outro projeto) + template do /novo-sistema.
-- RLS ligado SEM policy: só a Edge Function (service_role) toca no banco.
-- ============================================================================
create table if not exists public.compras_registros (
  colecao       text not null,
  id            text not null,
  registro      jsonb not null,
  atualizado_em timestamptz not null default now(),
  apagado       boolean not null default false,
  primary key (colecao, id)
);
create index if not exists compras_registros_colecao_idx on public.compras_registros (colecao);
create index if not exists compras_registros_atualizado_idx on public.compras_registros (colecao, atualizado_em);
alter table public.compras_registros enable row level security;

create table if not exists public.compras_config_global (
  id            boolean primary key default true check (id),
  config        jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.compras_config_global enable row level security;

create table if not exists public.compras_meta (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.compras_meta enable row level security;

insert into storage.buckets (id, name, public)
values ('compras-arquivos', 'compras-arquivos', false)
on conflict (id) do nothing;
