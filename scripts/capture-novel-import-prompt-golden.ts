// docs/527 SS-01: freezes the import prompts produced by the synthetic wizard flows.
// Run before changing prompt layout: node --import tsx scripts/capture-novel-import-prompt-golden.ts [--check]
// Synthetic data only (tests/helpers/novel-import-wizard-fixture.ts); no model, Key or network.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fixture,legacySceneFixture,filesF,rosterAi,fullAi,toVerify,passCharacters} from '../tests/helpers/novel-import-wizard-fixture'
import {importAiPrompt,serializeImportAiPayload} from '../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest} from '../desktop/shared/novel-import'

const out='tests/fixtures/novel-import-prompt-golden.json'
// The golden is the old layout: sessions are created with the test-root-only legacy switch (docs/526 R-L4).
process.env.SHAKEINK_TEST_ROOT??='/private/tmp/novel-import-prompt-golden';process.env.SHAKEINK_PROMPT_LAYOUT='legacy'
const sha=(value:string)=>createHash('sha256').update(value).digest('hex')
// Volatile request identity (random ids and time-derived values) is not part of the layout.
const key=(r:ImportAiRequest)=>[r.phase,r.intent??'',r.kind??'',r.sceneIdentity?.mode??'',r.executionLane??'',r.sceneParentTargets?'parent':''].join('/')
const stable=(text:string)=>text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu,'<uuid>')

async function flow(name:string,make:typeof fixture,drive:(f:Awaited<ReturnType<typeof fixture>>)=>Promise<unknown>){
 const f=await make(filesF(),rosterAi());f.setAi(fullAi(f))
 try{await drive(f);return f.requests.map(r=>{const payload=serializeImportAiPayload(r),prompt=importAiPrompt(r,payload);return {flow:name,key:key(r),payload:sha(stable(payload)),prompt:sha(stable(prompt))}})}
 finally{await f.dispose()}
}
async function main(){
// Identity scene stages need a scene-specific mock and are unchanged by docs/526; that flow is frozen through characters.
 const rows=[...await flow('identity-characters',fixture,passCharacters),...await flow('legacy-scene',legacySceneFixture,toVerify)]
// Group by flow+key in request order so concurrent scheduling does not reorder the file.
const grouped:Record<string,{payload:string;prompt:string}[]>={}
for(const row of rows)(grouped[row.flow+':'+row.key]??=[]).push({payload:row.payload,prompt:row.prompt})
for(const list of Object.values(grouped))list.sort((a,b)=>a.prompt.localeCompare(b.prompt))
const text=JSON.stringify(Object.fromEntries(Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b))),null,1)+'\n'
if(process.argv.includes('--check')){const before=await readFile(out,'utf8');if(before!==text){console.error('prompt golden changed');process.exitCode=1}else console.log('prompt golden unchanged',Object.keys(grouped).length,'groups',rows.length,'requests')}
else{await writeFile(out,text,{flag:'wx'});console.log('wrote',out,Object.keys(grouped).length,'groups',rows.length,'requests')}
}
void main()
