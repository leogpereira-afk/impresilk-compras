// Configuração do COMPRAS Impresilk.
//
// TOKEN — gate LEVE (barra robô e curioso): a MESMA string precisa estar no
// segredo COMPRAS_TOKEN do Supabase (Edge Functions → Secrets). Ele viaja no
// navegador de propósito; quem protege os dados de verdade é o CRACHÁ da
// Central de Acessos, conferido no servidor a cada chamada.
const TOKEN = 'compras-r1t0m4d8k2p9x5w7q3v6z8b1n4c7';

// Projeto Supabase COMPARTILHADO da Impresilk (o mesmo do RH/Brief/PCP/DRE/Painel).
const SUPABASE_URL = 'https://heveemylixartyijxewh.supabase.co';
const API = SUPABASE_URL + '/functions/v1/compras-nucleo';
const API_ARQ = SUPABASE_URL + '/functions/v1/compras-acervo';
const API_AUTH = SUPABASE_URL + '/functions/v1/equipe-auth';

// Versão exibida no rodapé (subir junto com o CACHE do sw.js a cada deploy).
const VERSAO = 'v5';
