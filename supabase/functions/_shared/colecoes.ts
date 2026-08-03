// Lista ÚNICA das coleções do sistema, compartilhada pelas Edge Functions.
//
// Isso existe porque a lista já morou em três arquivos ao mesmo tempo e as
// coleções novas ficaram de fora do backup diário sem
// ninguém notar. Ao criar uma coleção nova, mexa AQUI e no COLECOES_APP do
// store.js — só nesses dois lugares.
//
// `pre` é o prefixo do número do documento (SC-0001). Vazio = sem numeração.
export const COLECOES: Record<string, { pre: string; nome: string }> = {
  sc:    { pre: "SC", nome: "Solicitação de compra" },
  cot:   { pre: "CT", nome: "Cotação" },
  oc:    { pre: "OC", nome: "Ordem de compra" },
  forn:  { pre: "",   nome: "Fornecedor" },
  // Quem pede material dentro da empresa. Existe para o WhatsApp de chegada não
  // depender de alguém digitar o número de novo a cada pedido.
  equipe: { pre: "",   nome: "Pessoa da equipe" },
  // Acervo. A CHAVE ficou como nasceu no porte da Domo; o RÓTULO é o da
  // comunicação visual. Renomear a chave obrigaria a migrar dado por estética.
  doc:   { pre: "",   nome: "Manual" },
  proj:  { pre: "",   nome: "Catálogo" },
  trein: { pre: "",   nome: "Treinamento" },
};

export const NOMES_COLECOES = Object.keys(COLECOES);
