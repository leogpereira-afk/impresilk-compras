# Compras Impresilk — auditoria de melhorias

Data: 09/09/2026. Base: b77b9bf, repositório atual clonado diretamente do GitHub.
Status: alterações locais, sem publicação e sem alterações nos registros reais.

## Correções implementadas

- Prazo calculado por dia de calendário: hoje = 0, ontem = -1. A implementação anterior comparava meio-dia com meia-noite e arredondava hoje para 1. Datas impossíveis agora retornam ausência de prazo, não uma data normalizada silenciosamente.
- Data corrente local, inclusive depois das 21h de Brasília; antes a conversão UTC podia iniciar o dia seguinte.
- Sincronização manual informa a falha de leitura do servidor em vez de anunciar “Tudo em dia”. A leitura interna captura o erro; por isso o chamador precisa verificar `erroSync`.
- Perfil ausente/desconhecido deixa de assumir direção na interface. A autorização real continua no servidor.
- Indicador de situação mantém o período do painel ao abrir ordens e permite retirar o filtro explicitamente.
- Entregas ordenadas por prazo, com atrasadas primeiro; ausência de data não é tratada como “no prazo”.
- Alertas para entregas sem previsão válida e ordens emitidas aguardando envio.
- Cotação sem convidados não é apresentada como pronta para decidir.
- Rodapé distingue atualização confirmada e atualização ainda não realizada.
- Logo oficial existente no acervo Impresilk, azul institucional, prioridades em cartões, melhor aproveitamento de largura, foco de teclado e adaptação móvel.
- Cache e versão atualizados em conjunto; regressões adicionadas à verificação automática.

## Auditoria sistêmica e próximos investimentos

| Área | Evidência / oportunidade | Prioridade e proposta |
|---|---|---|
| Compra x caixa | O cartão usa valor da ordem, não baixa financeira | Alta: manter conceitos separados; cruzar contas a pagar e pagamentos apenas com vínculo confirmado |
| Recebimento parcial | Valor “a caminho” inclui valor integral de ordens parciais | Alta: informar valor total das ordens abertas; para saldo pendente, calcular itens restantes e definir rateio de frete/desconto antes de usar o valor como previsão |
| Fornecedor | Já existe desempenho por prazo, completude, resposta e avaliação | Alta: explicitar tamanho da amostra; evitar avaliar pontualidade por `atualizadoEm` quando não houver data real de recebimento |
| Cotação | Comparação e identificação de propostas incompletas já existem | Alta: custo total entregue, prazo e qualidade lado a lado; não escolher automaticamente só pelo menor preço |
| O.S. | Busca lê dados trazidos pelo PCP | Alta: mostrar origem e horário da importação e prever aviso de base antiga |
| Duplicidade | Importação de fornecedor já pede escolha | Alta: vínculo por ID/CNPJ e revisão humana quando houver divergência; nunca unir por semelhança de nome automaticamente |
| Recebimento | Há recebimento parcial, confirmação de excesso e indicação de foto pendente | Média: conciliar item/quantidade/unidade da nota com a ordem, mostrando divergências antes de confirmar |
| Segurança | Validação de revogação aceita o crachá se a consulta de revogação falhar | Alta: definir política de indisponibilidade com a gestão; não alterada nesta revisão, pois muda a disponibilidade operacional |
| Integração | Importações do ERP não apresentam timeout explícito no fetch do servidor | Alta: timeout, retentativa limitada, paginação e relatório de importação antes de ampliar uso |
| Experiência | Muitos cartões/linhas usam div clicável | Média: completar navegação por teclado e semântica de links em todas as telas |
| Acervo | Documentos têm alertas de validade | Média: categorias por processo/equipamento, responsável e revisão, com filtros consistentes |
| Desempenho | PDF já carrega sob demanda; sincronização evita redesenhar formulários | Preservar; medir volume e tempo real antes de paginação/virtualização |

## API Mubisys: verificação em fonte oficial

Documento consultado em 09/09/2026: https://api.mubisys.com/docs?api-docs.json
Interface: https://api.mubisys.com/api/documentation

| Consulta GET documentada | Aplicação sugerida | Estado |
|---|---|---|
| `/{publicKey}/fornecedor` | Cadastro e identificação por ID/CNPJ | Já há implementação no Compras; execução autenticada não validada nesta rodada |
| `/{publicKey}/produto` | Catálogo | Já há implementação; não confundir produto acabado com matéria-prima |
| `/{publicKey}/materia-prima` | Referência de insumos e unidades | Disponível na documentação; mapear campos e necessidade antes de importar |
| `/{publicKey}/ordem-servico` | Cliente, destino e vínculo com produção | Compras já reaproveita PCP; evitar consultas duplicadas |
| `/{publicKey}/nota-fiscal-recebida` | Conferência de compra e recebimento | Próxima integração recomendada, em modo de conferência |
| `/{publicKey}/contas-pagar` | Previsão financeira e conciliação | Próxima integração recomendada; não interpretar ordem emitida como conta paga |

Não foi encontrado endpoint documentado de criação de ordem de compra nesta especificação. Não foi criada integração fictícia nem sincronização automática de registros. Antes de conectar novos dados: conferir contrato dos campos, permissão do servidor, amostra autenticada, paginação e vínculo aprovado entre registros. Credenciais permanecem no servidor.

## Verificação e limites

- Teste reproduziu o erro de prazo antes da correção (1 em vez de 0).
- Testes cobrem hoje/ontem/amanhã, virada UTC, datas inválidas e falha de sincronização.
- Verificações de sintaxe, rotas e seletores do projeto.
- Prévia isolada, com fornecedores e ordens fictícios, sem envio ao backend. Inspeção de computador e celular; clique do indicador abre lista com período e situação corretos.
- Site público abre a tela de login. Não houve sessão autenticada de produção, validação de credenciais do ERP, conferência contábil dos dados reais, teste de pagamento, envio a fornecedor ou publicação.
- Esta é auditoria direcionada dos fluxos e pontos acima, não certificação de ausência de falhas nem revisão executada de cada linha de todas as dependências.
