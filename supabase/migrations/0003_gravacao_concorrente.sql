-- Aditiva: nenhuma linha é apagada, reescrita ou renumerada. Instalar antes
-- das funções compras-nucleo/compras-acervo desta versão.
-- SECURITY INVOKER: somente service_role executa, mantendo o bloqueio RLS
-- de anon/authenticated. JSONB compara a versão inteira, sem relógio cliente.
create or replace function public.compras_gravar_se_atual(
  p_colecao text, p_id text, p_esperado jsonb, p_novo jsonb
) returns boolean
language plpgsql security invoker set search_path = public
as $$
declare afetadas integer;
begin
  if p_novo is null or jsonb_typeof(p_novo) <> 'object'
     or p_novo->>'id' is distinct from p_id then
    raise exception 'Registro inválido';
  end if;
  if p_esperado is null then
    insert into public.compras_registros (colecao, id, registro, atualizado_em, apagado)
    values (p_colecao, p_id, p_novo, now(), coalesce(p_novo->>'apagadoEm', '') <> '')
    on conflict (colecao, id) do nothing;
  else
    update public.compras_registros
      set registro = p_novo, atualizado_em = now(), apagado = coalesce(p_novo->>'apagadoEm', '') <> ''
      where colecao = p_colecao and id = p_id and registro = p_esperado;
  end if;
  get diagnostics afetadas = row_count;
  return afetadas = 1;
end;
$$;
revoke all on function public.compras_gravar_se_atual(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.compras_gravar_se_atual(text, text, jsonb, jsonb) to service_role;
