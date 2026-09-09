# Compras: conferência ERP e inteligência

Implementação verificada em 09/09/2026. Servidor publicado: compras-nucleo v51 e compras-acervo v35, com código ativo conferido. Interface v13 preparada para publicação no GitHub Pages. Não houve mudança de esquema ou escrita de dados de teste em produção.

## Como usar

1. Entre com o perfil da direção e abra **Conferência ERP**.
2. Escolha notas recebidas ou contas a pagar. Consulte até 7 dias por vez: entrada da nota ou vencimento do título.
3. Abra **Conferir**. Veja os campos de origem e escolha a ordem de compra. O sistema compara ID/CNPJ e valores sem presumir correspondência.
4. Marque a confirmação apenas após conferir. **Guardar referência** associa a identificação à ordem, sem quitar conta, receber material ou escrever no Mubisys.
5. Na ordem, **Desvincular** corrige associações. O histórico permanece guardado. Notas que abrangem várias ordens exigem conferência individual e não entram em soma automática.

## Melhorias implementadas

- Consulta GET de notas recebidas e contas a pagar, atrás da autorização da direção no servidor. A consulta financeira exige confirmação atual de revogação; falha de consulta de acesso bloqueia esta ação. A política de disponibilidade do restante do sistema foi preservada.
- Páginas explícitas, horário da consulta, máximo de 7 dias, limite de resposta e uma retentativa para indisponibilidade transitória. Falha e resposta fora do formato esperado não viram “nenhum registro”. Página cheia sem metadados exige consultar a próxima.
- Credenciais ficam no servidor. Documentos retornados ficam em memória da tela; a ordem guarda somente identificação, origem, data e responsável pela conferência. O comprador e o solicitante não alteram esses vínculos.
- Matérias-primas passam a alimentar a atualização do catálogo, sem usar preço de venda como referência de compra. O catálogo anterior permanece até a carga inteira terminar.
- Fornecedores são conferidos por ID do ERP ou CNPJ, inclusive durante a importação. Os itens começam desmarcados. A busca tem limite de páginas e não grava cadastros durante a consulta.
- O painel mostra o valor dos **itens pendentes**, descontando recebimentos parciais. Frete, impostos, seguro e desconto não são rateados nesse indicador. Não é saldo financeiro a pagar.
- Compras por O.S. do período, com grupo separado para ordens sem vínculo. O cartão mostra até os cinco maiores grupos.
- Comparação de cotações apresenta cobertura dos itens, total com frete informado, prazo e histórico. Propostas parciais não são tratadas como todos os preços recebidos.
- Pontualidade usa a data real de recebimento. Menos de três entregas com prazo verificável mantém a classificação provisória, fora dos contadores de preferenciais/evitar. É um critério de cautela da interface, não garantia estatística.
- Busca de O.S. informa origem PCP e data de atualização do registro; não confunde essa data com o horário de importação do ERP, que a base consultada não informa.

## Verificação realizada

- 16 verificações de datas e sincronização, mais testes de consulta, paginação, timeout, permissões, valores ausentes/zero, duplicidades e recebimentos parciais.
- Sintaxe dos arquivos JS e TS, navegação e seletores.
- Prévia isolada com dados fictícios: bloquear associação sem confirmação, guardar e desfazer referência, verificar lista de fornecedores desmarcada e sem duplicidade, painel e cotação, computador e celular de 390 px.
- Consulta somente de leitura à estrutura e volumes da base Compras: 48 fornecedores, 19 solicitações, 27 cotações e 30 ordens ativas no momento da inspeção. Esse volume não justifica virtualização de tabelas nesta etapa.

## Pendências concretas para colocar em uso

- A publicação do servidor foi conferida. A disponibilidade da interface é verificada separadamente no GitHub Pages.
- Verificar amostras autenticadas de notas recebidas, contas a pagar e matérias-primas na credencial usada pelo servidor. A especificação oficial não documenta os corpos de resposta; o adaptador conserva ausências e permite conferir os campos de origem, mas precisa ser confrontado com essa amostra antes de declarar a integração validada em produção.
- 404 é exibido como consulta não concluída. Se a amostra autenticada confirmar o formato de período vazio do ERP, tratar somente esse formato conhecido como vazio; nunca qualquer 404.
- A política de revogação do restante do sistema, acervo por equipamento e conciliação automática de unidade/quantidade não foram ampliadas. O fluxo atual conserva revisão humana; não há promessa de estoque, pagamento ou equivalência automática.

Fontes: [Mubisys OpenAPI](https://api.mubisys.com/api/documentation), [contrato JSON](https://api.mubisys.com/docs?api-docs.json), [segurança de Edge Functions](https://supabase.com/docs/guides/functions/auth).
