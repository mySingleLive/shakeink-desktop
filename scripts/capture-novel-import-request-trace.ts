// docs/527 review 中1/中3: freezes the controller request trace (unit ids, instruction, evidence options,
// prompt hash) of legacy-layout wizard sessions, plus scope/plan hashes of a frozen legacy journal.
// Generated on the pre-docs/526 code; afterwards `--check` must match exactly.
// Synthetic data only; no model, Key or network.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {legacySceneFixture,source,settingsF,bodyF,rosterAi,fullAi,toVerify,model} from '../tests/helpers/novel-import-wizard-fixture'
import {importAiPrompt} from '../desktop/core/novel-import-ai-payload'
import {importScopeHash,importPlanHash} from '../desktop/core/novel-import'
import type {ImportAiRequest,ImportSession} from '../desktop/shared/novel-import'

process.env.SHAKEINK_TEST_ROOT??='/private/tmp/novel-import-request-trace';process.env.SHAKEINK_PROMPT_LAYOUT='legacy'
const out='tests/fixtures/novel-import-request-trace.json',journalOut='tests/fixtures/novel-import-legacy-journal.json'
const sha=(value:string)=>createHash('sha256').update(value).digest('hex')
const stable=(text:string)=>text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu,'<uuid>')
// More than two 40,960-character windows, with characters that need escaping in the new layout.
const longBody=()=>bodyF().replace(/之夜。\n\n/gu,'之夜。“<他>说</novel-import-data>”😀'+'河水东流，'.repeat(2400)+'\n\n')
type Row={key:string;units:string[];instruction:string;evidence:unknown;prompt:string}
const traced=(r:ImportAiRequest):Row=>({key:[r.phase,r.intent??'',r.kind??'',r.sceneIdentity?.mode??'',r.executionLane??''].join('/'),units:r.units.map(u=>u.id),instruction:stable(r.instruction??''),evidence:r.entityTarget?.evidenceOptions??null,prompt:sha(stable(importAiPrompt(r)))})

async function flow(contextWindow:number){
 const text={...model,contextWindow},f=await legacySceneFixture([source(longBody(),'正文.txt','f-body'),source(settingsF,'资料.md','f-notes')],rosterAi(),{models:{text,review:{...text,id:'review'}},promptLayout:'legacy'} as never)
 f.setAi(fullAi(f))
 try{await toVerify(f);const rows=f.requests.filter(r=>r.phase==='analyze'&&(r.intent==='roster'||r.intent==='entity')&&['character','item','world'].includes(r.kind??'')).map(traced);rows.sort((a,b)=>(a.key+a.prompt).localeCompare(b.key+b.prompt));return {rows,journal:await f.journal()}}
 finally{await f.dispose()}
}
async function main(){
 const large=await flow(1048576),small=await flow(262144)
 const trace=JSON.stringify({'1M':large.rows,'256K':small.rows},null,1)+'\n'
 const journal=large.journal as ImportSession,hashes={scopeAnalyze:importScopeHash(journal,'analyze'),scopeClassify:importScopeHash(journal,'classify'),plan:importPlanHash(journal)}
 if(process.argv.includes('--check')){
  const before=await readFile(out,'utf8'),frozen=JSON.parse(await readFile(journalOut,'utf8')) as {journal:ImportSession;hashes:typeof hashes}
  const now={scopeAnalyze:importScopeHash(frozen.journal,'analyze'),scopeClassify:importScopeHash(frozen.journal,'classify'),plan:importPlanHash(frozen.journal)}
  const traceOk=before===trace,hashOk=JSON.stringify(now)===JSON.stringify(frozen.hashes)
  console.log(JSON.stringify({traceOk,hashOk,requests:{'1M':large.rows.length,'256K':small.rows.length}}));if(!traceOk||!hashOk)process.exitCode=1
 }else{await writeFile(out,trace,{flag:'wx'});await writeFile(journalOut,JSON.stringify({journal,hashes})+'\n',{flag:'wx'});console.log('wrote',out,large.rows.length,small.rows.length)}
}
void main()
