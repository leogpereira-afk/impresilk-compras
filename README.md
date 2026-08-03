# Compras Impresilk

Pedidos de compra da Impresilk: solicitação → aprovação → cotação → ordem de
compra → WhatsApp ao fornecedor → a caminho → recebimento com foto e
transportadora → entregue.

- Fluxo herdado de um sistema de compras já lapidado em produção; a linguagem e
  o acervo (catálogos, manuais, treinamentos) são da comunicação visual.
- Vínculo com a O.S. do Mubisys: o pedido nasce sabendo cliente e materiais
  (lidos do PCP, que importa o ERP de hora em hora).
- Login pela Central de Acessos (`equipe-auth`, sistema `compras`).
- Backend: Supabase (projeto compartilhado) — functions `compras-nucleo` e
  `compras-acervo`, tabelas `compras_*`, bucket `compras-arquivos`.
- Publicação: GitHub Pages via Actions (sem build; app vanilla offline-first).
