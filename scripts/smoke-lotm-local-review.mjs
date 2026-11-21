import {_electron as electron} from 'playwright'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {build} from 'esbuild'
import {workingImportUnits,sourceBody} from '../desktop/core/novel-import.ts'

const root='/private/tmp/shakeink-lotm-local-20261028',appRoot='/private/tmp/shakeink-lotm-runtime-20261027/app-data',label=process.env.LOTM_REVIEW_EVIDENCE??'readonly-smoke',evidence=join(root,label+'-evidence'),helper=resolve('dist/review/lotm-local-review-main.cjs'),ordered=JSON.parse(await readFile(join(root,'ordered-session.json'),'utf8')),journalPath=join(appRoot,'novel-imports',ordered.sessionId,'session.json'),statePath=join(appRoot,'state.json'),sha=value=>createHash('sha256').update(value).digest('hex')
await mkdir(evidence,{recursive:true})
const beforeJournal=await readFile(journalPath),beforeState=await readFile(statePath),session=JSON.parse(beforeJournal.toString('utf8'))
assert.ok(['paused','select','confirm'].includes(session.phase),'只读烟测要求没有活动导入')
assert.equal(session.chapters.length,1402)
assert.ok(session.models?.text&&session.models?.review)
const body=sourceBody(session),chapter=session.chapters[0],units=workingImportUnits({...session,originalProse:body,workingProse:body}).filter(unit=>unit.start<chapter.end&&unit.end>chapter.start)
assert.ok(units.length&&units.every(unit=>unit.kind==='body'))
const request={operationId:randomUUID(),semanticVersion:1,phase:'review',units,artifacts:[],entities:[],chapters:[{id:chapter.id,title:chapter.title,start:chapter.start,end:chapter.end}],selectedTargets:[],reviewProjection:[],models:{text:session.models.text,review:session.models.review}}
let app
try{
 await build({entryPoints:['scripts/lotm-local-review-main.ts'],outfile:helper,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external'})
 app=await electron.launch({executablePath:process.env.LOTM_ELECTRON_RUNTIME,args:[resolve('.')],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot},timeout:60000})
 const page=await app.firstWindow({timeout:60000});await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:60000})
 const reviewJournal=await readFile(journalPath),reviewState=await readFile(statePath),startupJournalChanged=sha(reviewJournal)!==sha(beforeJournal)
 const result=await app.evaluate(async({app:electronApp},input)=>{const require=process.getBuiltinModule('module').createRequire(process.cwd()+'/dist/main/index.cjs');const {review}=require(input.helper);await electronApp.whenReady();return review(input)},{root:appRoot,request,helper})
 assert.equal(sha(await readFile(journalPath)),sha(reviewJournal));assert.equal(sha(await readFile(statePath)),sha(reviewState))
 assert.ok(Array.isArray(result.conflicts));assert.ok(!result.artifacts?.length&&!result.patches?.length&&!result.classifications?.length)
 const exited=new Promise(resolveExit=>app.process().once('exit',(code,signal)=>resolveExit({code,signal})));await app.evaluate(({app})=>app.quit());const exit=await exited;app=null
 assert.equal(exit.code,0);assert.equal(sha(await readFile(journalPath)),sha(reviewJournal));assert.equal(sha(await readFile(statePath)),sha(reviewState))
 await writeFile(join(evidence,'smoke.json'),JSON.stringify({schemaVersion:1,status:'capability-only',sessionId:session.id,unitIds:units.map(unit=>unit.id),result,exit,startupJournalChanged,journalUnchangedDuringReview:true,modelMetadataUnchanged:true},null,2)+'\n',{flag:'wx'})
 console.log(JSON.stringify({status:'capability-smoke-passed',conflicts:result.conflicts?.length??0,startupJournalChanged,journalUnchangedDuringReview:true,modelMetadataUnchanged:true}))
}finally{if(app)await app.close().catch(()=>{})}
