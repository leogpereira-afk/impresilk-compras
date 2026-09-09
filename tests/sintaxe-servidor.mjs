import {readFileSync,readdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {spawnSync} from 'node:child_process';
const files=readdirSync('supabase/functions',{recursive:true}).filter(f=>f.endsWith('.ts'));
for(const f of files){
  const code=stripTypeScriptTypes(readFileSync('supabase/functions/'+f,'utf8'));
  const r=spawnSync(process.execPath,['--check','--input-type=module'],{input:code,encoding:'utf8'});
  if(r.status!==0){console.error(f,r.stderr);process.exit(1);}
}
console.log(`${files.length} arquivos do servidor com sintaxe válida`);
