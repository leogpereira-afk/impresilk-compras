# Rede de suprimentos — uso e verificação

## Fluxo da equipe

1. **Materiais padrão → Novo material:** cadastre o nome que a Impresilk usa, unidade, categoria e especificações. Espessuras, medidas ou unidades distintas precisam de cadastros próprios.
2. **Fornecedores → abrir fornecedor → Vincular material:** escolha o padrão, informe o nome comercial, código e embalagem. Opcionalmente selecione um catálogo desse mesmo fornecedor.
3. **Catálogos do fornecedor:** envie arquivos, adicione links ou vincule catálogos já existentes. Os arquivos continuam usando o acervo e suas revisões.
4. **Cotações:** selecione o material padrão. O convite guarda uma cópia do nome comercial correspondente. A resposta pública só recebe os nomes do fornecedor daquele link; a comparação mantém quantidade e unidade comuns. O PDF da ordem inclui o nome comercial disponível.
5. **Transportadoras → Nova transportadora:** registre regiões, rotas, cargas, contato, prazo, frequência e cuidados. Há pesquisa por região e tipo de material.
6. **Recebimento:** informe a transportadora que entregou. A transportadora prevista na OC é apenas uma sugestão, copiada no momento do recebimento.
7. **Transportadoras → Conferir entrega:** registre quem arca com o frete e o valor. Também é possível registrar uma entrega avulsa. Filtre o mês para consultar cargas e gastos.

## Regras de integridade

- Sem associação automática por semelhança de nomes. Materiais só são equivalentes por vínculo explícito e unidade igual.
- Os convites e as ordens guardam os nomes comerciais da época. Editar o catálogo não reescreve o histórico.
- Alterar manualmente a descrição ou a unidade retira o vínculo do item para evitar um agrupamento incorreto.
- Cada recebimento tem uma chave estável para seu frete. O registro de custo complementa a entrega e não cria outra entrega na soma.
- O mês usa a data efetiva do recebimento, em São Paulo. O dia informado na conferência não desloca um recebimento para outro mês.
- Valor ausente fica pendente. Frete incluso na compra e frete pago por terceiro não entram no gasto cobrado separadamente da Impresilk.
- Gasto registrado não representa pagamento confirmado; não altera o valor da OC e não é somado novamente à compra.
- Solicitante consulta material e transportadora no fluxo de pedidos/recebimentos, mas não lê a coleção de fretes nem os vínculos comerciais internos. Compras e direção gerenciam o diretório.
- As novas coleções usam a tabela JSONB existente e entram no registro central de coleções e backup. Não foi necessária migração de esquema.

## Verificação

- Testes automatizados de nomes por fornecedor, unidades, preservação de histórico, URLs de catálogo, datas, valores, deduplicação de frete, validação no servidor e permissões.
- Prévia isolada: cadastro de transportadora, material, vínculo, catálogo por link, entrega avulsa, vínculo com recebimento existente e criação de cotação.
- Caso de controle: frete avulso de R$ 280,50 mais R$ 125,00 ligado a um recebimento → duas entregas e R$ 405,50, sem duplicar o recebimento.
- Responsividade a 390 px e 1366 px. Corrigida a largura mínima da grade antiga na ficha do fornecedor e repetida a medição.
- Dados da prévia são fictícios e não foram enviados à produção.

## Limites operacionais

- Não foram inventadas regiões atendidas, contratos, valores históricos ou equivalências. A equipe precisa preencher/conferir esses dados.
- A consulta Mubisys depende das credenciais já configuradas no servidor; amostras reais autenticadas de cada recurso ainda precisam ser confrontadas com o adaptador. Ver `INTEGRACOES-2026-09-09.md`.
- Anexos usam o fluxo existente de upload; os testes desta entrega não enviaram arquivo ao armazenamento de produção.
