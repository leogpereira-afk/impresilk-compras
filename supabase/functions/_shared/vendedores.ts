import { consultarMubi } from './mubisys.ts';
export function vendedoresAtivosPublicos(vendedores: any[], usuariosAtivos: any[]) {
  const id=(x:any)=>String(x?.id??x?.id_usuario??'').trim();
  if(usuariosAtivos.some(x=>!id(x))||vendedores.some(x=>!id(x)))throw new Error('Cadastro de vendedores com formato não reconhecido.');
  const ativos=new Set(usuariosAtivos.map(id)),mapa=new Map<string,{id:string;nome:string}>();
  for(const v of vendedores){if(!ativos.has(id(v)))continue;const nome=String(v.nome??v.name??v.nome_completo??'').trim();if(!nome)throw new Error('Nome do vendedor não informado pelo Mubisys.');mapa.set(id(v),{id:id(v),nome:nome.slice(0,80)});}
  return [...mapa.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
}
let cache: {em:string;vendedores:{id:string;nome:string}[]}|null=null;
let emCurso: Promise<{em:string;vendedores:{id:string;nome:string}[]}>|null=null;
export async function consultarVendedoresPublicos(){
  if(cache&&Date.now()-Date.parse(cache.em)<15*60*1000)return cache;
  if(emCurso)return emCurso;
  emCurso=(async()=>{
    const listar=async(recurso:string)=>{let todos:any[]=[];for(let p=1;p<=10;p++){const r=await consultarMubi(recurso,{page:String(p),per_page:'500'});todos=todos.concat(r.dados);if(!r.temMais)return todos;}throw new Error('Lista de vendedores excede o limite de consulta.');};
    // O endpoint vendedor inclui inativos. A lista de usuários ativos confirma a situação.
    const vendedores=await listar('usuario/vendedor'),ativos=await listar('usuario');
    const resultado={em:new Date().toISOString(),vendedores:vendedoresAtivosPublicos(vendedores,ativos)};cache=resultado;return resultado;
  })();
  try{return await emCurso;}finally{emCurso=null;}
}
