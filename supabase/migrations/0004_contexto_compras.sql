-- Nenhum dado é reescrito. Snapshot e gravação contextual protegem saldos
-- compartilhados por SC, OC direta e famílias de cotações.
create or replace function public.compras_ler_contexto()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'hash', md5(coalesce(jsonb_agg(jsonb_build_array(colecao,id,registro) order by colecao,id)::text, '[]')),
    'registros', coalesce(jsonb_agg(registro || jsonb_build_object('_col',colecao) order by colecao,id), '[]'::jsonb)
  ) from public.compras_registros where colecao in ('sc','oc','cot');
$$;
create or replace function public.compras_gravar_contexto(
  p_colecao text, p_id text, p_esperado jsonb, p_novo jsonb, p_contexto_hash text
) returns boolean language plpgsql security invoker set search_path = public set lock_timeout = '5s' as $$
begin
  if p_colecao not in ('sc','oc','cot') or p_contexto_hash is null then
    raise exception 'Contexto de compra inválido';
  end if;
  -- Conflita também com INSERT/UPDATE/DELETE de clientes antigos e restauração.
  -- O lock dura somente esta RPC: validação e leitura anteriores ficam fora dele.
  lock table public.compras_registros in share row exclusive mode;
  if (public.compras_ler_contexto()->>'hash') is distinct from p_contexto_hash then return false; end if;
  return public.compras_gravar_se_atual(p_colecao,p_id,p_esperado,p_novo);
end;
$$;
revoke all on function public.compras_ler_contexto() from public, anon, authenticated;
revoke all on function public.compras_gravar_contexto(text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.compras_ler_contexto() to service_role;
grant execute on function public.compras_gravar_contexto(text,text,jsonb,jsonb,text) to service_role;
