type Ler = (col: string, id: string) => Promise<any>;
export class ErroRede extends Error {}
function exigir(ok: unknown, mensagem: string): asserts ok { if (!ok) throw new ErroRede(mensagem); }
function texto(v: unknown) { return typeof v === 'string' ? v.trim() : ''; }
function dataValida(v: unknown) { const s=String(v||''); return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(new Date(s+'T12:00:00Z').getTime()) && new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s; }
export function chaveRecebimento(ocId: string, recId: string) { return 'rec-'+encodeURIComponent(ocId)+'|'+encodeURIComponent(recId); }
export async function validarRede(col: string, novo: any, antigo: any, ler: Ler) {
  if (col==='transp'||col==='mat') {
    exigir(texto(novo.nome).length>0 && texto(novo.nome).length<=300,'Informe um nome de até 300 caracteres.');
    if(col==='mat'){
      exigir(texto(novo.unidade),'Informe a unidade do material padrão.');
      // Identidade e unidade são estáveis: outro tamanho/unidade exige outro cadastro.
      exigir(!antigo || antigo.unidade===novo.unidade,'Crie outro material para uma unidade diferente.');
    }
    if(col==='transp'){
      if(novo.ufs!==undefined)exigir(Array.isArray(novo.ufs)&&novo.ufs.every((s:unknown)=>typeof s==='string'&&'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(s)),'Estados de cobertura inválidos.');
      if(novo.tiposCarga!==undefined)exigir(Array.isArray(novo.tiposCarga)&&novo.tiposCarga.length<=30&&novo.tiposCarga.every((s:unknown)=>typeof s==='string'&&s.length<=150),'Tipos de carga inválidos.');
      exigir(novo.comprimentoMax==null||(typeof novo.comprimentoMax==='number'&&Number.isFinite(novo.comprimentoMax)&&novo.comprimentoMax>0),'Comprimento máximo inválido.');
      if(novo.agendamento)exigir(['nao_informado','sim','nao'].includes(novo.agendamento),'Disponibilidade de agendamento inválida.');
      if(novo.rastreamentoUrl){let u;try{u=new URL(novo.rastreamentoUrl);}catch{throw new ErroRede('Link de rastreamento inválido.');}exigir(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password,'Use um link de rastreamento http ou https sem credenciais.');}
    }
  }
  if(col==='oferta'){
    const [f,m]=await Promise.all([ler('forn',novo.fornecedorId),ler('mat',novo.materialId)]);
    exigir(f&&!f.apagadoEm&&m&&!m.apagadoEm,'Fornecedor ou material não encontrado.');
    exigir(novo.ativo===false||m.ativo!==false,'O material padrão está arquivado.');
    exigir(texto(novo.nomeFornecedor),'Informe o nome comercial no fornecedor.');
    if(novo.catalogoId){const p=await ler('proj',novo.catalogoId);exigir(p&&!p.apagadoEm&&p.fornecedorId===novo.fornecedorId,'O catálogo precisa pertencer ao mesmo fornecedor.');}
    exigir(novo.unidade===m.unidade,'A unidade do fornecedor precisa ser a mesma do material padrão.');
  }
  if(col==='proj'&&novo.fornecedorId){const f=await ler('forn',novo.fornecedorId);exigir(f&&!f.apagadoEm,'Fornecedor do catálogo não encontrado.');}
  if(col==='proj'&&novo.url){let u;try{u=new URL(novo.url);}catch{throw new ErroRede('Link do catálogo inválido.');}exigir(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password,'Use um link http ou https sem credenciais.');}
  if(col==='frete'){
    const t=await ler('transp',novo.transportadoraId);exigir(t&&!t.apagadoEm,'Transportadora não encontrada.');
    exigir(['a_definir','empresa','incluso','terceiro'].includes(novo.custeio),'Informe o responsável pelo frete.');
    exigir(novo.valor==null || (typeof novo.valor==='number' && Number.isFinite(novo.valor) && novo.valor>=0),'Valor do frete inválido.');
    if(novo.custeio!=='empresa')novo.valor=null;
    exigir(Boolean(novo.ocId)===Boolean(novo.recebimentoId),'Vínculo incompleto com o recebimento.');
    exigir(!antigo || (antigo.ocId||'')===(novo.ocId||'') && (antigo.recebimentoId||'')===(novo.recebimentoId||''),'O vínculo de uma entrega existente não pode ser trocado.');
    if(novo.ocId){
      const o=await ler('oc',novo.ocId),r=o?.recebimentos?.find((r:any)=>r.id===novo.recebimentoId);
      exigir(o&&!o.apagadoEm&&r,'Recebimento não encontrado.');
      exigir(novo.id===chaveRecebimento(novo.ocId,novo.recebimentoId),'Use um único registro de frete para cada recebimento.');
      exigir(texto(r.em),'Data do recebimento não informada.');
      const d=new Date(r.em);exigir(Number.isFinite(d.getTime()),'Data do recebimento inválida.');
      novo.dataEntrega=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
      novo.fornecedorId=o.fornecedorId||'';
    }
    exigir(dataValida(novo.dataEntrega),'Informe uma data de entrega válida.');
    if(novo.dataPrevista)exigir(dataValida(novo.dataPrevista),'Data prometida inválida.');
    if(novo.ocorrencia)exigir(['nenhuma','avaria','falta','atraso','outro'].includes(novo.ocorrencia),'Ocorrência inválida.');
    if(novo.ocorrenciaStatus)exigir(['aberta','resolvida'].includes(novo.ocorrenciaStatus),'Tratamento da ocorrência inválido.');
    exigir(texto(novo.conteudo),'Descreva o que foi entregue.');
  }
}
