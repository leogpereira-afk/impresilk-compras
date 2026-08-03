# Compras Impresilk

Pedidos de compra da Impresilk: solicitação → aprovação → cotação → ordem de
compra → WhatsApp ao fornecedor → a caminho → recebimento com foto e
transportadora → entregue.

- Fluxo herdado do sistema da Domo Construtora (mesmo motor, lapidado em produção).
- Vínculo com a O.S. do Mubisys: o pedido nasce sabendo cliente e materiais
  (lidos do PCP, que importa o ERP de hora em hora).
- Login pela Central de Acessos (`equipe-auth`, sistema `compras`).
- Backend: Supabase (projeto compartilhado) — functions `compras-nucleo` e
  `compras-acervo`, tabelas `compras_*`, bucket `compras-arquivos`.
- Publicação: GitHub Pages via Actions (sem build; app vanilla offline-first).
