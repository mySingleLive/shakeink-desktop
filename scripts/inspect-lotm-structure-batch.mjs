import {_electron as electron} from 'playwright'
import {build} from 'esbuild'
import {randomUUID,createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {validateImportStructureDecisions} from '../desktop/core/novel-import-structure.ts'
import {importSessionBudget} from '../desktop/core/novel-import-budget-policy.ts'

const appRoot='/private/tmp/shakeink-lotm-runtime-20261027/app-data',id=process.env.LOTM_SESSION_ID??'7414fd07-904b-46c2-b0fc-0fce080d4666',journalPath=`${appRoot}/novel-imports/${id}/session.json`,statePath=`${appRoot}/state.json`,sha=value=>createHash('sha256').update(value).digest('hex'),beforeJournal=await readFile(journalPath),beforeState=await readFile(statePath),session=JSON.parse(beforeJournal.toString('utf8')),draft=session.structureDraft
assert.equal(session.phase,'paused');assert.ok(draft&&session.models?.text&&session.models?.review)
const done=new Set(draft.batches.flatMap(batch=>batch.unitIds)),units=draft.candidates.filter(unit=>!done.has(unit.id)).slice(0,300)
assert.ok(units.length)
const helper=resolve('dist/review/lotm-local-review-main.cjs')
await build({entryPoints:['scripts/lotm-local-review-main.ts'],outfile:helper,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external'})
const request={operationId:randomUUID(),semanticVersion:1,phase:'classify',intent:'structure',units,artifacts:[],models:{text:session.models.text,review:session.models.review},executionBudget:importSessionBudget(session,'text',session.models.text),workingRevision:session.workingRevision}
let app
try{
 app=await electron.launch({executablePath:process.env.LOTM_ELECTRON_RUNTIME,args:[resolve('.')],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot},timeout:60000})
 const page=await app.firstWindow({timeout:60000});await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:60000})
 const reviewJournal=await readFile(journalPath),reviewState=await readFile(statePath),startupJournalChanged=sha(reviewJournal)!==sha(beforeJournal)
 const result=await app.evaluate(async({app:electronApp},input)=>{const require=process.getBuiltinModule('module').createRequire(process.cwd()+'/dist/main/index.cjs');const {review}=require(input.helper);await electronApp.whenReady();return review(input)},{root:appRoot,request,helper})
 assert.equal(sha(await readFile(journalPath)),sha(reviewJournal));assert.equal(sha(await readFile(statePath)),sha(reviewState))
 const transitions=[];let previous
 for(const cut of result.chapterCuts??[])if(cut.volume!==previous){transitions.push({start:cut.start,volume:cut.volume});previous=cut.volume}
 let validationError
 try{validateImportStructureDecisions(draft.candidates,{chapterCuts:[...draft.chapterCuts,...result.chapterCuts??[]],ignoredStarts:[...draft.ignoredStarts,...result.ignoredStarts??[]]},true)}catch(error){validationError=error instanceof Error?error.message:String(error)}
 console.log(JSON.stringify({chapterCuts:result.chapterCuts?.length,ignoredStarts:result.ignoredStarts?.length,transitions,validationError,startupJournalChanged,journalUnchangedDuringReview:true,stateUnchangedDuringReview:true}))
 const exited=new Promise(resolveExit=>app.process().once('exit',(code,signal)=>resolveExit({code,signal})));await app.evaluate(({app})=>app.quit());const exit=await exited;app=null
 assert.equal(sha(await readFile(journalPath)),sha(reviewJournal));assert.equal(sha(await readFile(statePath)),sha(reviewState))
 console.log(JSON.stringify({normalExit:exit.code===0,journalUnchangedAfterClose:true,stateUnchangedAfterClose:true}))
}finally{if(app)await app.close().catch(()=>{})}
