import {_electron as electron} from 'playwright'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {build} from 'esbuild'
import {workingImportUnits,importPlanHash} from '../desktop/core/novel-import.ts'
import {iterateImportReviewTasks} from '../desktop/core/novel-import-review-tasks.ts'
import {importSessionBudget} from '../desktop/core/novel-import-budget-policy.ts'
import {serializeImportAiPayload,importAiPrompt,assertImportFixedPromptReserve,assertImportPayloadBudget} from '../desktop/core/novel-import-ai-payload.ts'
import {captureLocalAuditTree} from './audit-lotm-local-import.ts'

const root='/private/tmp/shakeink-lotm-local-20261028',appRoot='/private/tmp/shakeink-lotm-runtime-20261027/app-data',work=join(root,'works','LOTM-LOCAL-20261028'),output=join(root,process.env.LOTM_REVIEW_LABEL??'ordered-literary-v2'),ordered=JSON.parse(await readFile(join(root,'ordered-session.json'),'utf8')),journalPath=join(appRoot,'novel-imports',ordered.sessionId,'session.json'),statePath=join(appRoot,'state.json'),sha=value=>createHash('sha256').update(value).digest('hex'),session=JSON.parse(await readFile(journalPath,'utf8')),minimumBytes=await readFile(join(root,'semantic-minimum.json')),minimum=JSON.parse(minimumBytes.toString('utf8')),budget=importSessionBudget(session,'review',session.models.review),helper=resolve('dist/review/lotm-local-review-main.cjs'),scriptPath=resolve('scripts/review-lotm-local-book.mjs')
assert.equal(session.phase,'completed');assert.equal(session.chapters.length,1402);assert.equal(session.publication?.hash,importPlanHash(session));assert.deepEqual(session.selected,['body']);assert.ok(session.artifacts.every(artifact=>artifact.origin!=='source'));assert.ok(session.models?.text&&session.models?.review)
assert.equal(minimum.minimumChecks.length,45);assert.equal(new Set(minimum.minimumChecks.map(check=>check.id)).size,45);assert.ok(minimum.minimumChecks.every(check=>/^LOT-MIN-\d{2}$/u.test(check.id)&&Number.isSafeInteger(check.globalChapterIndex)&&check.globalChapterIndex>=1&&check.globalChapterIndex<=1402&&typeof check.expected==='string'&&check.expected.length>0))
const chapters=session.chapters,working=workingImportUnits(session),workingById=new Map(working.map(unit=>[unit.id,unit])),groups=chapters.map(()=>new Map())
for(const task of iterateImportReviewTasks(session)){
 const indices=new Set()
 for(const unit of task.units){
  const actual=workingById.get(unit.id);assert.ok(actual&&actual.kind==='body'&&actual.fileId===unit.fileId&&actual.start===unit.start&&actual.end===unit.end&&actual.text===unit.text,'非正文资料必须走独立审核，不能按正文坐标归类')
  for(const [index,chapter]of chapters.entries())if(unit.start<chapter.end&&unit.end>chapter.start)indices.add(index)
 }
 if(task.artifact.facts.chapterIndex!==undefined){const index=Number(task.artifact.facts.chapterIndex);assert.ok(Number.isSafeInteger(index)&&index>=0&&index<chapters.length);indices.add(index)}
 assert.ok(indices.size>0,'审核证据没有明确章节归属');for(const index of indices)groups[index].set(task.key,task)
}
const entities=session.artifacts.map(artifact=>({id:artifact.id,kind:artifact.kind,name:artifact.name,unitIds:artifact.evidence.map(entry=>entry.unitId),...(artifact.facts.parentId?{parentId:artifact.facts.parentId}:{}),...(artifact.facts.entityType?{entityType:artifact.facts.entityType}:{}),...(artifact.facts.worldId?{worldId:artifact.facts.worldId}:{}),...(artifact.facts.settingType?{settingType:artifact.facts.settingType}:{})}))
const promptContractHash=sha(JSON.stringify({review:importAiPrompt({semanticVersion:1,phase:'review',units:[],artifacts:[]},''),analyze:importAiPrompt({semanticVersion:1,phase:'analyze',kind:'outline',units:[],artifacts:[]},'')}))
function fits(tasks,index,check){
 const unitMap=new Map(),artifacts=[],projection=[]
 for(const task of tasks){for(const unit of task.units)unitMap.set(unit.id,unit);artifacts.push(task.artifact);if(task.projection)projection.push(task.projection)}
 for(const unit of working)if(unit.start<chapters[index].end&&unit.end>chapters[index].start)unitMap.set(unit.id,unit)
 const units=[...unitMap.values()].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));if(!units.length)return
 const instruction=check?'独立最低语义验收，不是生成细纲，不修改任何数据。返回且仅返回一项kind=outline的判定材料：id=minimum-'+check.id+'，name='+check.id+'，text只能是PASS或FAIL，facts.chapterIndex='+index+'。只有给定预期在提供的原文与现有产物中均得到支持时才可PASS，并必须给出真实原文evidence；否则FAIL。不得用空结果、主题口号或其他章节代替判定。检查ID：'+check.id+'。待核预期：'+check.expected:undefined
 const request={operationId:randomUUID(),semanticVersion:1,phase:check?'analyze':'review',...(check?{kind:'outline'}:{}),units,artifacts,entities,chapters:[{id:chapters[index].id,title:chapters[index].title,start:chapters[index].start,end:chapters[index].end}],selectedTargets:check?check.targets:session.targets,reviewProjection:projection,semanticLocks:session.semanticState?.locks??[],workingRevision:session.workingRevision,models:{text:session.models.text,review:session.models.review},executionBudget:budget,...(instruction?{instruction}:{})}
 const payload=serializeImportAiPayload(request)
 try{assertImportPayloadBudget(request,payload,budget.characters,budget.maxUnits);assertImportFixedPromptReserve(importAiPrompt(request,payload),payload);return{request,units,artifacts,role:check?'review':undefined,chapterIndex:index,checkId:check?.id,expected:check?.expected,expectedHash:check?sha(check.expected):undefined}}catch{return}
}
function chapterRequests(index,check){
 const requests=[];let pack=[]
 const flush=()=>{if(!pack.length)return;const value=fits(pack,index,check);assert.ok(value,'单章审核任务超过冻结预算');requests.push(value);pack=[]}
 for(const task of groups[index].values()){const combined=[...pack,task];if(!pack.length||fits(combined,index,check)){pack=combined;continue}flush();pack=[task]}
 flush();return requests
}
await mkdir(join(output,'chapters'),{recursive:true});await mkdir(join(output,'minimum'),{recursive:true});await mkdir(join(output,'results'),{recursive:true})
const save=async(name,value)=>{const path=join(output,name),temporary=path+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temporary,path)},hashFile=async path=>sha(await readFile(path))
let app,page,completed=0
try{
 await build({entryPoints:['scripts/lotm-local-review-main.ts'],outfile:helper,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external'})
 const binding={schemaVersion:1,reviewContractVersion:1,sessionId:session.id,importHash:session.publication.hash,minimumSha256:sha(minimumBytes),reviewModel:{id:session.models.review.id,modelId:session.models.review.modelId,authRevision:session.models.review.authRevision,contextWindow:session.models.review.contextWindow},reviewBudget:budget,promptContractHash,scriptSha256:await hashFile(scriptPath),helperSha256:await hashFile(helper)}
 const beforeWork=await captureLocalAuditTree(work)
 app=await electron.launch({executablePath:process.env.LOTM_ELECTRON_RUNTIME,args:[resolve('.')],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot},timeout:60000})
 page=await app.firstWindow({timeout:60000});await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:60000})
 const journalBaseline=await hashFile(journalPath),stateBaseline=await hashFile(statePath)
 const invoke=async(value,kind,part)=>{
  const result=await app.evaluate(async({app:electronApp},input)=>{const require=process.getBuiltinModule('module').createRequire(process.cwd()+'/dist/main/index.cjs');const {review}=require(input.helper);await electronApp.whenReady();return review(input)},{root:appRoot,request:value.request,helper,role:value.role})
  assert.equal(await hashFile(journalPath),journalBaseline,'审核改变了导入记录');assert.equal(await hashFile(statePath),stateBaseline,'审核改变了模型配置')
  const conflicts=result.conflicts??[],missingTargets=result.missingTargets??[];assert.ok(Array.isArray(conflicts)&&Array.isArray(missingTargets));assert.ok(!result.patches?.length&&!result.classifications?.length)
  let status,issueCount
  if(value.checkId){
   const verdicts=result.artifacts??[],verdict=verdicts.length===1?verdicts[0]:undefined,valid=!!verdict&&verdict.id==='minimum-'+value.checkId&&verdict.name===value.checkId&&verdict.kind==='outline'&&verdict.facts.chapterIndex===String(value.chapterIndex)&&['PASS','FAIL'].includes(verdict.text)&&verdict.evidence.length>0&&verdict.sourceUnitIds.length>0
   status=result.notFound!==true&&valid&&verdict.text==='PASS'&&!conflicts.length&&!missingTargets.length?'PASS':'FAIL';issueCount=conflicts.length+missingTargets.length+(status==='PASS'?0:1)
  }else{
   assert.ok(!result.artifacts?.length);const issues=[...conflicts,...missingTargets];status=issues.length?'FAIL':'PASS';issueCount=issues.length
  }
  const record={kind,part,chapterIndex:value.chapterIndex,checkId:value.checkId,expectedHash:value.expectedHash,status,issueCount,unitIds:value.units.map(unit=>unit.id),artifactIds:value.artifacts.map(artifact=>artifact.id),requestHash:sha(JSON.stringify(value.request)),contentHash:sha(JSON.stringify({...value.request,operationId:''})),resultHash:sha(JSON.stringify(result)),reviewedAt:new Date().toISOString()}
  await save(`results/${kind}-${String(part+1).padStart(4,'0')}.json`,{...record,expected:value.expected,result})
  return record
 }
 const verifyResume=async(record,kind,requests,check)=>{
  if(record.status!=='PASS')return false
  if(check){assert.equal(record.id,check.id);assert.equal(record.expectedHash,sha(check.expected))}
  assert.equal(record.parts.length,requests.length)
  for(const [part,value]of requests.entries()){
   const previous=record.parts[part],contentHash=sha(JSON.stringify({...value.request,operationId:''})),saved=JSON.parse(await readFile(join(output,'results',`${kind}-${String(part+1).padStart(4,'0')}.json`),'utf8'))
   assert.equal(previous.contentHash,contentHash);assert.equal(saved.contentHash,contentHash);assert.equal(saved.resultHash,previous.resultHash);assert.equal(saved.resultHash,sha(JSON.stringify(saved.result)));assert.equal(saved.status,'PASS');assert.equal(saved.issueCount,0);assert.equal(saved.chapterIndex,value.chapterIndex)
   if(check){assert.equal(saved.expectedHash,sha(check.expected));assert.equal(saved.expected,check.expected);assert.equal(saved.checkId,check.id)}
  }
  return true
 }
 let ledger
 try{ledger=JSON.parse(await readFile(join(output,'ledger.json'),'utf8'))}catch(error){if(error?.code!=='ENOENT')throw error}
 if(ledger)for(const [key,value]of Object.entries(binding))assert.deepEqual(ledger[key],value,'审核恢复绑定变化：'+key)
 else ledger={...binding,chapterResults:[],minimumResults:[],status:'IN_PROGRESS'}
 Object.assign(ledger,binding);assert.equal(new Set(ledger.chapterResults.map(row=>row.index)).size,ledger.chapterResults.length);assert.equal(new Set(ledger.minimumResults.map(row=>row.id)).size,ledger.minimumResults.length)
 for(const [index,chapter]of chapters.entries()){
  const requests=chapterRequests(index);assert.ok(requests.length,'章节没有审核请求')
  const at=ledger.chapterResults.findIndex(row=>row.index===index),prior=at>=0?ledger.chapterResults[at]:undefined
  if(prior&&await verifyResume(prior,`chapter-${index+1}-part`,requests))continue
  const results=[];for(const request of requests)results.push(await invoke(request,`chapter-${index+1}-part`,results.length))
  const record={kind:'chapter',index,title:chapter.title,unitIds:working.filter(unit=>unit.start<chapter.end&&unit.end>chapter.start).map(unit=>unit.id),parts:results,status:results.some(result=>result.status==='FAIL')?'FAIL':'PASS',reviewedAt:new Date().toISOString()}
  if(at<0)ledger.chapterResults.push(record);else ledger.chapterResults[at]=record
  await save('ledger.json',ledger);await save(`chapters/${String(index+1).padStart(4,'0')}.json`,record)
  if(++completed%10===0||record.status==='FAIL')console.log(JSON.stringify({chapters:completed,minimum:ledger.minimumResults.length,status:record.status==='FAIL'?'FAIL':'IN_PROGRESS'}))
 }
 for(const check of minimum.minimumChecks){
  const index=check.globalChapterIndex-1,requests=chapterRequests(index,check),at=ledger.minimumResults.findIndex(row=>row.id===check.id),prior=at>=0?ledger.minimumResults[at]:undefined
  if(prior&&await verifyResume(prior,`minimum-${check.id}-part`,requests,check))continue
  const results=[];for(const request of requests)results.push(await invoke(request,`minimum-${check.id}-part`,results.length))
  const record={kind:'minimum',id:check.id,index,expected:check.expected,expectedHash:sha(check.expected),parts:results,status:results.some(result=>result.status==='FAIL')?'FAIL':'PASS',reviewedAt:new Date().toISOString()}
  if(at<0)ledger.minimumResults.push(record);else ledger.minimumResults[at]=record
  await save('ledger.json',ledger);await save(`minimum/${check.id}.json`,record)
 }
 assert.deepEqual(ledger.chapterResults.map(row=>row.index).sort((a,b)=>a-b),Array.from({length:1402},(_,index)=>index));assert.deepEqual(ledger.minimumResults.map(row=>row.id).sort(),minimum.minimumChecks.map(check=>check.id).sort())
 const failed=[...ledger.chapterResults,...ledger.minimumResults].filter(row=>row.status!=='PASS');ledger.status=failed.length?'FAIL':'REVIEWED';ledger.failedCount=failed.length;await save('ledger.json',ledger)
 const exited=new Promise(resolveExit=>app.process().once('exit',(code,signal)=>resolveExit({code,signal})));await app.evaluate(({app})=>app.quit());const exit=await exited;app=null;assert.equal(exit.code,0)
 assert.equal(await hashFile(journalPath),journalBaseline);assert.equal(await hashFile(statePath),stateBaseline);assert.deepEqual(await captureLocalAuditTree(work),beforeWork,'审核或关闭改变了作品数据库')
 ledger.status=failed.length?'FAIL':'PASS';ledger.normalExit=true;ledger.databaseUnchanged=true;ledger.journalUnchangedDuringReview=true;ledger.completedAt=new Date().toISOString();await save('ledger.json',ledger)
 console.log(JSON.stringify({status:ledger.status,chapters:ledger.chapterResults.length,minimum:ledger.minimumResults.length,failed:failed.length,databaseUnchanged:true,journalUnchangedDuringReview:true,normalExit:true}))
 if(failed.length)process.exitCode=1
}finally{if(app)await app.close().catch(()=>{})}
