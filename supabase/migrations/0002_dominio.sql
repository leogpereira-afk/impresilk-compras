-- Peças específicas do fluxo de compras (mesmo desenho da Domo, prefixado):
-- cfg de linha única, log, backup diário, numeração atômica por coleção.
create table if not exists public.compras_cfg (
  id            boolean primary key default true check (id),
  config        jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.compras_cfg enable row level security;

create table if not exists public.compras_log (
  em      timestamptz not null default now(),
  entrada jsonb not null
);
create index if not exists compras_log_em_idx on public.compras_log (em desc);
alter table public.compras_log enable row level security;

create table if not exists public.compras_backup (
  dia      text primary key,
  conteudo jsonb not null,
  em       timestamptz not null default now()
);
alter table public.compras_backup enable row level security;

-- Numeração atômica por coleção (SC-0001, CT-0001, OC-0001…): um único
-- INSERT ON CONFLICT dentro de função do Postgres — dois aparelhos criando
-- documento ao mesmo tempo saem com números diferentes, sem laço de tentativa.
create table if not exists public.compras_seq (
  colecao text primary key,
  n       bigint not null default 0
);
alter table public.compras_seq enable row level security;

create table if not exists public.compras_seq_idx (
  colecao text not null,
  numero  bigint not null,
  reg_id  text not null,
  primary key (colecao, numero)
);
alter table public.compras_seq_idx enable row level security;

create or replace function public.compras_proximo_numero(p_colecao text)
returns bigint language sql security definer as $$
  insert into public.compras_seq (colecao, n) values (p_colecao, 1)
  on conflict (colecao) do update set n = compras_seq.n + 1
  returning n;
$$;
revoke all on function public.compras_proximo_numero(text) from anon, authenticated;
