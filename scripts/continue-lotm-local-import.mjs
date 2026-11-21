import {_electron as electron} from 'playwright'
import {expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {mkdir,readFile,writeFile,appendFile,readdir,stat} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {workingImportUnits,importPlanHash,validateImportCoverage} from '../desktop/core/novel-import.ts'
import {importReviewTaskKeys} from '../desktop/core/novel-import-review-tasks.ts'
import {validateDetailedOutlines} from '../desktop/core/novel-import-outline.ts'
import {importNativeMappings,importSemanticDecisionHash,importSemanticInputHash,importSemanticResultHash,validateImportSemanticState} from '../desktop/core/novel-import-semantic-state.ts'

const repo=resolve('.'),root='/private/tmp/shakeink-lotm-local-20261028',appRoot='/private/tmp/shakeink-lotm-runtime-20261027/app-data',work=join(root,'works','LOTM-LOCAL-20261028'),controlled=process.env.LOTM_CONTROLLED_PICKER==='1'
const targets=['outline','theme','style','character','item','scene','world','foreshadow','trope','worldline','narrative'],evidence=join(root,(process.env.LOTM_EVIDENCE_LABEL??'ordered-analysis')+'-evidence');await mkdir(evidence,{recursive:true})
const run=JSON.parse(await readFile(process.env.LOTM_RUN_METADATA??join(root,'run.json'),'utf8')),readiness=JSON.parse(await readFile(process.env.LOTM_ANALYSIS_READINESS??join(root,'analysis-readiness.json'),'utf8')),expected=JSON.parse(await readFile(join(root,'expected-chapters.json'),'utf8')),expectedBody=await readFile(join(root,'expected-body.txt'),'utf8'),resume=process.env.LOTM_RESUME_SNAPSHOT?JSON.parse(await readFile(process.env.LOTM_RESUME_SNAPSHOT,'utf8')):await readFile(join(root,'ordered-session.json'),'utf8').then(JSON.parse).catch(()=>null)
const sha=value=>createHash('sha256').update(value).digest('hex'),save=async(name,value)=>writeFile(join(evidence,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'}),stage=async(name,details={})=>{await writeFile(join(root,'analysis-stage.json'),JSON.stringify({name,...details},null,2)+'\n');console.log(JSON.stringify({name,...details}))}
const publicModel=model=>Object.fromEntries(['id','name','modelId','provider','protocol','endpoint','contextWindow'].filter(key=>model[key]!==undefined).map(key=>[key,model[key]])),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),sorted=values=>[...values].sort()
let app,page,launch,detach=false
const current=()=>page.evaluate(()=>window.desktop.novelImport({type:'current'})),screenshot=name=>page.screenshot({path:join(evidence,name+'.png')})
function assertSession(s){
 assert.equal(s.id,resume?.sessionId??process.env.LOTM_SESSION_ID??'6d7b6180-7d01-4a0b-9e95-01104090bcce');assert.deepEqual(s.selected,['body']);assert.deepEqual(sorted(s.targets),sorted(targets));assert.equal(s.infer,true);assert.equal(s.files.length,1);assert.equal(s.files[0].path,run.sourcePath);assert.equal(s.files[0].hash,run.sourceSha256);assert.equal(s.files[0].text.length,run.utf16Characters)
 let at=0;for(const u of s.units){assert.equal(u.start,at);assert.equal(u.text,s.files[0].text.slice(u.start,u.end));at=u.end}assert.equal(at,run.utf16Characters);assert.ok(s.units.every(u=>u.kind!=='unknown'))
 const body=s.units.filter(u=>u.kind==='body').map(u=>u.text).join('');assert.equal(sha(body),run.expectedBodySha256);assert.equal(s.chapters.length,expected.length)
 for(const [index,c] of s.chapters.entries()){const e=expected[index];assert.equal(c.title,e.title);assert.equal(c.start,e.start);assert.equal(c.end,e.end);assert.equal(c.volume,e.volumeName);assert.equal(c.content,expectedBody.slice(e.start,e.end))}
}
function assertCompleted(s){
 assertSession(s);assert.equal(s.phase,'completed');assert.equal(s.originalProse,expectedBody);assert.equal(s.workingProse,expectedBody);assert.equal(s.workingRevision,0);assert.equal(s.patches.length,0);assert.ok(s.conflicts.every(c=>c.status==='resolved'));assert.deepEqual(s.notFound,[])
 validateImportCoverage(s);validateDetailedOutlines(s);assert.equal(Object.keys(s.detailedOutlineIds??{}).length,expected.length);assert.ok(s.chapters.every(c=>c.outline?.trim()));validateImportSemanticState(s);const units=workingImportUnits(s),ids=sorted(units.map(u=>u.id));for(const kind of targets)assert.deepEqual(sorted(s.coverage[kind]??[]),ids);assert.deepEqual(sorted(s.coverage.review??[]),ids);assert.deepEqual(sorted(s.coverage.reviewFacts??[]),sorted(importReviewTaskKeys(s)))
 const mapping=importNativeMappings(s);assert.ok(targets.every(kind=>s.artifacts.some(a=>a.kind===kind&&mapping.projectable.has(a.id))));assert.deepEqual(s.mappingWarnings??[],mapping.mappingWarnings)
 const state=s.semanticState;assert.equal(state.stage,'ready');assert.equal(state.inputHash,importSemanticInputHash(s));assert.equal(state.decisionHash,importSemanticDecisionHash(s));assert.equal(state.verifiedHash,importSemanticResultHash(s));assert.equal(state.workingRevision,0);assert.equal(state.persistentConflicts.length,0);assert.ok(state.repairs.every(r=>r.committed&&r.tasks.every(t=>t.done)));assert.ok(state.omissions.every(o=>o.done&&o.unitIds.every(id=>o.completedUnitIds?.includes(id))))
 assert.ok(s.publication?.workId&&s.publication?.novelId);assert.equal(s.publication.requestId,s.id);assert.equal(s.publication.hash,importPlanHash(s))
}
async function close(){if(!app)return;const exited=new Promise(resolveExit=>app.process().once('exit',(code,signal)=>resolveExit({code,signal})));await app.evaluate(({app})=>app.quit());const result=await exited;app=null;return{...launch,...result,exitedAt:new Date().toISOString(),normalExit:result.code===0}}
try{
 await mkdir(work);assert.deepEqual(await readdir(work),[])
}catch(error){if(error?.code!=='EEXIST')throw error;assert.deepEqual(await readdir(work),[])}
try{
 app=await electron.launch({executablePath:process.env.LOTM_ELECTRON_RUNTIME||undefined,args:[repo],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot},timeout:60000})
 launch={run:run.run,launchId:randomUUID(),appPid:app.process().pid,launchedAt:new Date().toISOString(),buildIdentitySha256:sha(await readFile(process.env.LOTM_BUILD_IDENTITY??join(root,'build-analysis-identity.json')))}
 app.process().stderr.on('data',bytes=>process.stderr.write(bytes))
 page=await app.firstWindow({timeout:60000});page.setDefaultTimeout(60000)
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message))
 await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].show();BrowserWindow.getAllWindows()[0].focus()})
 await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:60000})
 if(controlled)await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]})},work)
 let view=(await current()).view;assert.ok(view,'expected retained import session');launch.sessionId=view.id
 if(['running','recognizing','publishing'].includes(view.phase)){detach=true;throw Error('已有活动导入，拒绝接管或关闭')}
 assert.ok(['paused','failed','confirm'].includes(view.phase),`unexpected initial phase ${view.phase}`)
 await save('prelaunch.json',{...launch,phase:view.phase,revision:view.revision})
 if(process.env.LOTM_RESET_ANALYSIS==='1'){
  // Plan 23/B4: discard stale-rule analysis through formal product actions only.
  const journal=join(appRoot,'novel-imports',view.id,'session.json'),prior=JSON.parse(await readFile(journal,'utf8'))
  await writeFile(join(evidence,'pre-reset-session.json'),await readFile(journal),{flag:'wx'})
  const act=(action)=>page.evaluate(value=>window.desktop.novelImport(value),action)
  await act({type:'select',id:prior.id,revision:(await current()).view.revision,selected:prior.selected,targets:prior.targets,infer:prior.infer})
  await act({type:'set-title',id:prior.id,revision:(await current()).view.revision,title:prior.title})
  const reset=JSON.parse(await readFile(journal,'utf8'));assert.equal(reset.phase,'confirm');assert.equal(reset.conflicts.length,0);assert.equal(reset.artifacts.length,0);assert.deepEqual(reset.coverage,{});assertSession(reset)
  await save('reset.json',{sessionId:reset.id,revisionBefore:prior.revision,revisionAfter:reset.revision,conflictsBefore:prior.conflicts.length,artifactsBefore:prior.artifacts.length,chapters:reset.chapters.length})
  view=(await current()).view
 }
 await page.locator('.ni-task-button').click()
 for(let step=0;step<3;step++){
  const resumeButton=page.getByRole('button',{name:'继续导入',exact:true}),confirm=page.getByRole('heading',{name:'确认导入',exact:true})
  await expect.poll(async()=>await resumeButton.isVisible()&&await resumeButton.isEnabled()?'resume':await confirm.isVisible()?'confirm':'',{timeout:60000}).not.toBe('')
  if(await confirm.isVisible())break
  await resumeButton.click()
 }
 await page.getByRole('heading',{name:'确认导入',exact:true}).waitFor({timeout:60000});view=(await current()).view;assert.equal(view.phase,'confirm')
 const journalPath=join(appRoot,'novel-imports',view.id,'session.json'),before=JSON.parse(await readFile(journalPath,'utf8')),semanticStat=await stat(join(root,'semantic-minimum.json')),integrityRunPath=process.env.LOTM_INTEGRITY_RUN_METADATA??join(root,'run.json')
 assertSession(before);assert.ok(Date.parse(before.createdAt)>Date.parse(run.frozenAt));assert.ok(semanticStat.mtimeMs<=Date.parse(before.createdAt));assert.equal(sha(await readFile(integrityRunPath)),readiness.runSha256);assert.equal(sha(await readFile(join(root,'semantic-minimum.json'))),readiness.semanticMinimumSha256)
 assert.equal(before.publication,undefined);assert.equal(before.analysisGrant,undefined);assert.equal(before.patches.length,0);assert.ok(before.conflicts.every(c=>c.status==='resolved'))
 if(resume){assert.equal(before.artifacts.length,resume.artifactCount);assert.deepEqual(Object.fromEntries(Object.entries(before.coverage).map(([k,v])=>[k,v.length])),resume.coverage);if(before.workingProse)assert.equal(sha(before.workingProse),run.expectedBodySha256);else{assert.equal(before.originalProse,'');assert.equal(before.workingRevision,0)}}else{assert.equal(before.artifacts.length,0);assert.deepEqual(before.coverage,{})}
 if(!view.targetReady)await page.getByRole('button',{name:'选择目录',exact:true}).click();await expect.poll(async()=>((await current()).view?.targetReady),{timeout:60000}).toBe(true)
 view=(await current()).view;assert.equal(view.targetLabel,work);assert.ok(view.models.text&&view.models.review)
 const frozenModels=JSON.parse(await readFile(join(root,'analysis-evidence','before-analysis.json'),'utf8'));assert.deepEqual(publicModel(view.models.text),frozenModels.textModel);assert.deepEqual(publicModel(view.models.review),frozenModels.reviewModel)
 await save('before-analysis.json',{sessionId:view.id,createdAt:before.createdAt,revision:view.revision,selected:view.selected,targets:view.targets,textModel:publicModel(view.models.text),reviewModel:publicModel(view.models.review),target:view.targetLabel,sourceSha256:run.sourceSha256,expectedBodySha256:run.expectedBodySha256,runSha256:readiness.runSha256,semanticMinimumSha256:readiness.semanticMinimumSha256,resume,pickerMode:controlled?'controlled-fallback-native-blocked':'actual-native'})
 await screenshot('before-analysis');await stage('analysis-consent',{sessionId:view.id,target:view.targetLabel})
 await page.getByRole('button',{name:'允许分析并导入',exact:true}).click();await page.getByRole('heading',{name:'正在导入',exact:true}).waitFor({timeout:60000})
 await save('analysis-started.json',{sessionId:view.id,startedAt:new Date().toISOString(),...launch});await stage('analysis-running',{sessionId:view.id})
 let terminal=false,lastSignature='',lastChange=Date.now()
 while(!terminal){
  await page.waitForTimeout(15000)
  const s=JSON.parse(await readFile(journalPath,'utf8')),summary={observedAt:new Date().toISOString(),id:s.id,revision:s.revision,phase:s.phase,updatedAt:s.updatedAt,steps:s.steps,coverage:Object.fromEntries(Object.entries(s.coverage).map(([k,v])=>[k,v.length])),artifactCounts:Object.fromEntries(targets.map(k=>[k,s.artifacts.filter(a=>a.kind===k).length])),notFound:s.notFound,pendingConflicts:s.conflicts.filter(c=>c.status==='pending').length,workingRevision:s.workingRevision,workingBodyMatches:!!s.workingProse&&sha(s.workingProse)===run.expectedBodySha256,publication:s.publication,error:s.error,runtimeAiCall:s.runtimeAiCall?Object.fromEntries(['operationId','phase','kind','intent','startedAt','state','outcome'].filter(k=>s.runtimeAiCall[k]!==undefined).map(k=>[k,s.runtimeAiCall[k]])):undefined}
  await appendFile(join(evidence,'progress.jsonl'),JSON.stringify(summary)+'\n');await stage('analysis-progress',{revision:s.revision,phase:s.phase,coverage:summary.coverage,artifactCounts:summary.artifactCounts,error:s.error})
  const signature=JSON.stringify([s.phase,s.revision,summary.coverage,summary.artifactCounts,s.publication]);if(signature!==lastSignature){lastSignature=signature;lastChange=Date.now()}
  if(s.phase==='completed'){
   assertCompleted(s);await save('completed.json',summary);await screenshot('completed');await save('shutdown.json',await close());terminal=true
  }else if(s.phase==='failed'){
   await save('failed.json',summary);await screenshot('failed');await save('shutdown.json',await close());process.exitCode=1;terminal=true
  }else if(s.phase==='conflicts'){
   await save('conflicts.json',summary);await screenshot('conflicts');await save('shutdown.json',await close());process.exitCode=2;terminal=true
  }else if(s.phase==='paused'){
   await save('paused.json',summary);await save('shutdown.json',await close());process.exitCode=3;terminal=true
  }else if(['source','select','confirm','discarded'].includes(s.phase)){
   await save('action-required.json',summary);await save('shutdown.json',await close());process.exitCode=2;terminal=true
  }else if(Date.now()-lastChange>2*60*60*1000){
   await page.evaluate(({id,revision})=>window.desktop.novelImport({type:'pause',id,revision}),{id:s.id,revision:s.revision});await expect.poll(async()=>((await current()).view?.phase),{timeout:60000}).toBe('paused');await save('stalled.json',summary);await save('shutdown.json',await close());process.exitCode=4;terminal=true
  }
 }
 assert.deepEqual(pageErrors,[])
}catch(error){
 await stage('analysis-driver-failed',{error:String(error?.stack??error)})
 if(page)await screenshot('driver-failure').catch(()=>{})
 throw error
}finally{if(app&&!detach)await app.close().catch(()=>{})}
