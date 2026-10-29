import {_electron as electron} from 'playwright'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {workingImportUnits,importScopeHash,mergeImportArtifacts} from '../desktop/core/novel-import.ts'
import {serializeImportAiPayload} from '../desktop/core/novel-import-ai-payload.ts'
import {importSessionBudget} from '../desktop/core/novel-import-budget-policy.ts'
import {importNativeMappings} from '../desktop/core/novel-import-semantic-state.ts'

const appRoot='/private/tmp/shakeink-lotm-runtime-20261027/app-data',id=process.env.LOTM_SESSION_ID??'7414fd07-904b-46c2-b0fc-0fce080d4666',journalPath=`${appRoot}/novel-imports/${id}/session.json`,statePath=`${appRoot}/state.json`,sha=value=>createHash('sha256').update(value).digest('hex'),beforeJournal=await readFile(journalPath),beforeState=await readFile(statePath),session=JSON.parse(beforeJournal.toString('utf8')),runtime=session.runtimeAiCall,grant=session.analysisGrant??(session.models?{textModel:session.models.text,reviewModel:session.models.review}:undefined),frozen=JSON.parse(await readFile('/private/tmp/shakeink-lotm-local-20261028/ordered-analysis-r4-evidence/before-analysis.json','utf8')),publicModel=model=>Object.fromEntries(['id','name','modelId','provider','protocol','endpoint','contextWindow'].filter(key=>model?.[key]!==undefined).map(key=>[key,model[key]]))
assert.ok(runtime&&grant?.textModel&&grant.reviewModel);assert.deepEqual(publicModel(grant.textModel),frozen.textModel);assert.deepEqual(publicModel(grant.reviewModel),frozen.reviewModel)
const units=workingImportUnits(session),chapters=session.chapters.map(({id,title,start,end})=>({id,title,start,end})),executionBudget=importSessionBudget(session,'text',grant.textModel);let request
for(let n=1;n<=Math.min(300,units.length);n++){
 const candidate={operationId:runtime.operationId,semanticVersion:1,phase:'analyze',kind:runtime.kind,units:units.slice(0,n),artifacts:[],entities:[],chapters,selectedTargets:session.targets,semanticLocks:session.semanticState?.locks??[],workingRevision:session.workingRevision,executionBudget,models:{text:grant.textModel,review:grant.reviewModel}}
 if(sha(serializeImportAiPayload(candidate))===runtime.payloadHash){request=candidate;break}
}
assert.ok(request,'未找到与失败运行时完全一致的请求');assert.equal(importScopeHash(session,'analyze'),runtime.scopeHash)
const helper=resolve('dist/review/lotm-local-review-main.cjs');await build({entryPoints:['scripts/lotm-local-review-main.ts'],outfile:helper,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external'})
let app
try{
 app=await electron.launch({executablePath:process.env.LOTM_ELECTRON_RUNTIME,args:[resolve('.')],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot},timeout:60000})
 app.process().stderr.on('data',bytes=>{for(const line of bytes.toString().split(/\r?\n/u))if(line.startsWith('[novel-import-anchor-diagnostics] '))console.log(line)})
 const page=await app.firstWindow({timeout:60000});await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:60000})
 const reviewJournal=await readFile(journalPath),reviewState=await readFile(statePath)
 let result,error,mergeError
 try{result=await app.evaluate(async({app:electronApp},input)=>{const require=process.getBuiltinModule('module').createRequire(process.cwd()+'/dist/main/index.cjs');const {review}=require(input.helper);await electronApp.whenReady();return review(input)},{root:appRoot,request,helper})}catch(cause){error=cause instanceof Error?cause.message:String(cause)}
 if(result)try{const merged=mergeImportArtifacts([],result.artifacts??[],1);importNativeMappings(merged.artifacts)}catch(cause){mergeError=cause instanceof Error?cause.message:String(cause)}
 const exited=new Promise(resolveExit=>app.process().once('exit',(code,signal)=>resolveExit({code,signal})));await app.evaluate(({app})=>app.quit());const exit=await exited;app=null
 assert.equal(sha(await readFile(journalPath)),sha(reviewJournal));assert.equal(sha(await readFile(statePath)),sha(reviewState))
 console.log(JSON.stringify({kind:runtime.kind,unitCount:request.units.length,lastUnitId:request.units.at(-1).id,error,mergeError,artifactCount:result?.artifacts?.length,notFound:result?.notFound,journalUnchangedDuringReview:true,stateUnchangedDuringReview:true,normalExit:exit.code===0},null,2))
}finally{if(app)await app.close().catch(()=>{})}
