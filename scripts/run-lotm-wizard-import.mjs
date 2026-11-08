// Real 《诡秘之主》 import through the 22-step wizard (docs/lotm-wizard-import/02-test-cases.md).
// Clicks only the wizard's own buttons. File and directory pickers are controlled (dialog.showOpenDialog
// returns fixed paths); this is recorded in the evidence. Re-run to resume after any stop.
// Exit codes: 0 completed, 2 needs a decision, 3 stalled, 4 performance budget exceeded, 1 driver error.
import {_electron as electron} from 'playwright'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,appendFile,readdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'

const repo=resolve('.'),root=process.env.LOTM_WIZARD_ROOT??'/private/tmp/shakeink-lotm-wizard-20261029',baseline='/private/tmp/shakeink-lotm-local-20261028'
const appRoot=process.env.LOTM_APP_ROOT??'/private/tmp/shakeink-lotm-runtime-20261027/app-data-wizard-20261029'
const source='/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt',target=join(root,'works',process.env.LOTM_WIZARD_WORK??'LOTM-WIZARD-20261029')
// LOTM_ROSTER_ONLY=1 measures step 9 (docs/239 RR): time, live count samples and screenshots, then stops.
const rosterOnly=process.env.LOTM_ROSTER_ONLY==='1'
// Scoped acceptance for docs/243: stop as soon as the full character import has passed.
const charactersOnly=process.env.LOTM_CHARACTERS_ONLY==='1'
const scenesOnly=process.env.LOTM_SCENES_ONLY==='1'
assert.ok([rosterOnly,charactersOnly,scenesOnly].filter(Boolean).length<=1,'choose only one scoped acceptance mode')
assert.ok(appRoot.startsWith('/private/tmp/'),'this driver requires an isolated test root')
const label=process.env.LOTM_EVIDENCE_LABEL;assert.ok(label,'LOTM_EVIDENCE_LABEL is required');const evidence=join(root,'evidence',label);await mkdir(join(root,'evidence'),{recursive:true});await mkdir(evidence,{recursive:false})
const run=JSON.parse(await readFile(join(baseline,'run.json'),'utf8')),expected=JSON.parse(await readFile(join(baseline,'expected-chapters.json'),'utf8'))
const TARGETS=scenesOnly?['scene']:['outline','theme','style','character','item','scene','world','foreshadow','trope','worldline','narrative'],LABELS={outline:'大纲',theme:'主题',style:'文风',character:'角色',item:'物品',scene:'场景',world:'世界观',foreshadow:'伏笔',goldenFinger:'金手指',trope:'爽点/泪点',worldline:'世界线',narrative:'叙事线'}
const sha=value=>createHash('sha256').update(value).digest('hex'),sorted=list=>[...list].sort()
const save=(name,value)=>writeFile(join(evidence,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'})
const log=async(event,details={})=>{const line=JSON.stringify({at:new Date().toISOString(),event,...details});console.log(line);await appendFile(join(evidence,'events.jsonl'),line+'\n')}
const sourceHash=sha(await readFile(source));assert.equal(sourceHash,run.sourceSha256,'source file changed')
await mkdir(target,{recursive:true})

const app=await electron.launch({executablePath:process.env.LOTM_ELECTRON_RUNTIME,args:[repo],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot,SHAKEINK_IMPORT_DEBUG:scenesOnly?'0':'1'},timeout:60000})
app.process().stderr.on('data',bytes=>void appendFile(join(evidence,'app-stderr.log'),bytes.toString().split(/\r?\n/u).filter(l=>l&&!/sandbox_extension|disk_cache|Shared Dictionary|Unable to create cache/u.test(l)).map(l=>l.slice(0,600)+'\n').join('')))
let page,exitCode=1,acted=0,rosterStart,lastShot=0,lastStash=[],isolatedConfirmed=false,roleStartedAt,roleStartedTick,entityStartedAt,entityStartedTick
let sceneStartedAt,sceneStartedTick,sceneEntityStartedAt,sceneEntityStartedTick,sceneSessionId,sceneCheckpointSaved=false
const sceneDeadlineMs=420000
// 识别场景 (step 11) alone must finish within 2 minutes, from entering the step to the waiting or failed state.
const sceneRecognitionDeadlineMs=120000
let sceneRecognitionStartedTick,sceneRecognitionResult
const samples=[]
const current=async()=>(await page.evaluate(()=>window.desktop.novelImport({type:'current'}))).view
const shot=async name=>page.screenshot({path:join(evidence,`${String(++acted).padStart(3,'0')}-${name}.png`)})
const journal=async id=>JSON.parse(await readFile(join(appRoot,'novel-imports',id,'session.json'),'utf8'))
async function preserveSceneCheckpoint(reason,id=sceneSessionId){
 if(!scenesOnly||!isolatedConfirmed||sceneCheckpointSaved)return
 id??=(await current())?.id
 if(!id)return
 assert.ok(resolve(evidence).startsWith('/private/tmp/'),'scene checkpoints require private evidence')
 const snapshot=await journal(id)
 await writeFile(join(evidence,`scene-${reason}-session-private.json`),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600})
 sceneCheckpointSaved=true
}
const brief=v=>({revision:v.revision,phase:v.phase,step:v.wizard?.step,state:v.wizard?.stepState?.[v.wizard?.step],error:v.error,stepError:v.wizard?.stepError,lineProgress:v.wizard?.lineProgress})
const button=name=>page.getByRole('button',{name,exact:true})
const click=async(name,why)=>{if(charactersOnly&&name==='允许分析并导入'&&roleStartedTick===undefined){roleStartedAt=new Date().toISOString();roleStartedTick=performance.now()}if(scenesOnly&&name==='允许分析并导入'&&sceneStartedTick===undefined){sceneStartedAt=new Date().toISOString();sceneStartedTick=performance.now()}await log('click',{button:name,why});await button(name).click()}
const until=async(test,timeout=120000)=>{const end=Date.now()+timeout;for(;;){const v=await current();if(await test(v))return v;if(Date.now()>end)throw Error('timed out waiting for wizard state');await page.waitForTimeout(1000)}}
async function close(){
 // 510: the stop-tasks question is a React prompt; the isolated run answers it when closing.
 if((charactersOnly||scenesOnly)&&isolatedConfirmed)void page.getByRole('dialog',{name:'仍有创作任务运行',exact:true}).getByRole('button',{name:'停止任务并继续',exact:true}).click({timeout:0}).catch(()=>undefined)
 const exited=new Promise(r=>app.process().once('exit',(code,signal)=>r({code,signal})));await app.evaluate(({app})=>app.quit());return exited
}
// Retry a failed entity task once through the wizard's own 重试 button; never skip.
const retried=new Set(),characterRetries=new Map(),observedCharacterCalls=new Map()
const transientCharacterError=error=>/^模型服务返回(?:请求频率限制|服务器错误|服务过载)提示，请稍后重试$/u.test(error??'')

try{
 page=await app.firstWindow({timeout:60000});page.setDefaultTimeout(60000)
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await button('导入作品').waitFor({timeout:60000})
 const boot=await page.evaluate(()=>window.desktop.bootstrap());assert.equal(boot.dataRoot,appRoot);isolatedConfirmed=true
 await app.evaluate(({dialog},paths)=>{dialog.showOpenDialog=async(...args)=>{const options=args.at(-1);return {canceled:false,filePaths:[options?.properties?.includes('openFile')?paths.source:paths.target]}}},{source,target})
 await save('launch.json',{launchedAt:new Date().toISOString(),pid:app.process().pid,picker:'controlled (dialog.showOpenDialog replaced), not the native dialog',shutdownConfirmation:charactersOnly||scenesOnly?'controlled stop prompt after evidence is preserved':'native',models:boot.models.map(m=>({name:m.name,modelId:m.modelId,provider:m.provider}))})
 let v=await current()
 if(scenesOnly)assert.ok(!v,'scene performance acceptance requires a fresh session; existing progress cannot receive a new clock')
 if(!v){await log('new-session');await click('导入作品','start a new import');v=await until(v=>v?.wizard?.step==='files',180000);await save('session.json',{id:v.id,createdAt:(await journal(v.id)).createdAt,wizardVersion:(await journal(v.id)).wizardVersion})}
 else{assert.ok(v.wizard,'existing session is not a wizard session');await log('resume-session',{id:v.id,...brief(v)});if(!await page.locator('.ni-dialog').isVisible())await page.locator('.ni-task-button').click()}
 const id=v.id;sceneSessionId=id;let lastSignature='',lastChange=Date.now()
 for(;;){
  v=await current();const w=v.wizard,step=w.step,state=w.stepState[step]
  if(scenesOnly&&step==='detect-scene'&&sceneRecognitionStartedTick===undefined)sceneRecognitionStartedTick=performance.now()
  if(scenesOnly&&sceneRecognitionStartedTick!==undefined&&!sceneRecognitionResult&&(step!=='detect-scene'||state==='waiting'||state==='failed')){
   const durationMs=Math.round(performance.now()-sceneRecognitionStartedTick);sceneRecognitionResult={durationMs,deadlineMs:sceneRecognitionDeadlineMs,state,stepError:w.stepError??null,performancePassed:state!=='failed'&&durationMs<=sceneRecognitionDeadlineMs}
   await save('scene-recognition-timing.json',sceneRecognitionResult);await log('scene-recognition-timing',sceneRecognitionResult)
  }
  if(scenesOnly&&sceneRecognitionStartedTick!==undefined&&!sceneRecognitionResult&&performance.now()-sceneRecognitionStartedTick>sceneRecognitionDeadlineMs){
   sceneRecognitionResult={durationMs:Math.round(performance.now()-sceneRecognitionStartedTick),deadlineMs:sceneRecognitionDeadlineMs,state,performancePassed:false};await save('scene-recognition-timing.json',sceneRecognitionResult);await log('scene-recognition-timeout',sceneRecognitionResult);exitCode=4;break
  }
  if(scenesOnly&&sceneStartedTick!==undefined&&['detect-scene','import-scene'].includes(step)&&performance.now()-sceneStartedTick>sceneDeadlineMs){
   const s=await journal(id);await save('scenes-timeout.json',{...brief(v),sceneStartedAt,sceneEntityStartedAt,durationMs:Math.round(performance.now()-sceneStartedTick),deadlineMs:sceneDeadlineMs,performancePassed:false,candidates:s.wizard.candidates.scene?.length??0,done:s.wizard.tasks.filter(t=>t.state==='done').length,failed:s.wizard.tasks.filter(t=>t.state==='failed').length});await save('scenes-timeout-session-private.json',s);await shot('scenes-timeout');exitCode=4;break
  }
  if(charactersOnly){const runtime=await readFile(join(appRoot,'novel-imports',id,'runtime.json'),'utf8').then(JSON.parse).catch(()=>null);for(const call of runtime?.calls??[])if(call.intent==='entity'&&call.kind==='character')observedCharacterCalls.set(call.operationId,{operationId:call.operationId,state:call.state,outcome:call.outcome,startedAt:call.startedAt,settledObservedAt:call.settledObservedAt})}
  const signature=JSON.stringify([v.revision,v.phase,step,state]);if(signature!==lastSignature){lastSignature=signature;lastChange=Date.now();await log('state',brief(v))}
  if(charactersOnly&&step==='detect-scene'){
   const completedAt=new Date().toISOString(),completedTick=performance.now(),roleDurationMs=roleStartedTick===undefined?null:Math.round(completedTick-roleStartedTick),entityDurationMs=entityStartedTick===undefined?null:Math.round(completedTick-entityStartedTick),performancePassed=roleDurationMs!==null&&roleDurationMs<=300000
   const s=await journal(id),list=s.wizard.candidates.character,tasks=s.wizard.tasks.filter(t=>t.kind==='entity'&&list.some(c=>c.id===t.candidateId)),artifacts=s.artifacts.filter(a=>a.kind==='character')
   assert.ok(list.length>0&&list.every(c=>c.selected));assert.equal(tasks.length,list.length);assert.deepEqual(sorted(tasks.map(t=>t.candidateId)),sorted(list.map(c=>c.id)));assert.ok(tasks.every(t=>t.state==='done'));assert.deepEqual(s.wizard.skipped,[]);assert.deepEqual(s.wizard.dropped,[])
   assert.deepEqual(sorted(artifacts.map(a=>a.id)),sorted(list.map(c=>c.id)))
   const {importNativeMappings}=await import('../desktop/core/novel-import-semantic-state.ts'),mapping=importNativeMappings(artifacts),ids=new Set(artifacts.map(a=>a.id))
   assert.equal(mapping.projectableIds.length,list.length);assert.equal(mapping.mappingWarnings.length,0)
   let relationships=0,linkedRelationships=0
   for(const a of artifacts)for(const relation of JSON.parse(a.facts.relationships??'[]')){relationships++;if(relation.characterId){linkedRelationships++;assert.ok(ids.has(relation.characterId))}}
   assert.equal(sha(await readFile(source)),sourceHash);assert.equal(s.chapters.length,expected.length);assert.equal(sha(s.workingProse),run.expectedBodySha256);assert.equal(s.workingRevision,0);assert.deepEqual(errors,[])
   await save('characters-completed.json',{sessionId:id,sourceSha256:sourceHash,chapters:s.chapters.length,characters:list.length,done:tasks.length,failed:0,skipped:0,dropped:0,relationships,linkedRelationships,mappingWarnings:mapping.mappingWarnings.length,bodyUnchanged:true,pageErrors:errors,nextStep:step,retries:Object.fromEntries(characterRetries),observedEntityCalls:[...observedCharacterCalls.values()],roleStartedAt,entityStartedAt,completedAt,roleDurationMs,entityDurationMs,deadlineMs:300000,performancePassed})
   // Raw material stays only in the isolated /private/tmp run, never in repository evidence.
   await save('characters-session-private.json',s);exitCode=performancePassed?0:4
   // All character assertions and the fixed timing are already preserved. The
   // next recognition may finish before its pause button renders; closing the
   // isolated app below also drains it through the declared stop confirmation.
   try{const latest=await current();if(latest.phase==='running'&&await button('暂停').isVisible()){await log('click',{button:'暂停',why:'character evidence saved; stop the next recognition'});await button('暂停').click({timeout:5000})}await shot('characters-completed')}catch(error){await log('post-character-cleanup',{message:String(error?.message??error).slice(0,300)})}
   break
  }
  if(charactersOnly&&step==='import-char'&&(v.error&&!/重新允许/u.test(v.error)||w.tasks.some(t=>t.state==='failed'&&!transientCharacterError(t.error)))){
   await save(`characters-failed-r${v.revision}.json`,{...brief(v),roleDurationMs:roleStartedTick===undefined?null:Math.round(performance.now()-roleStartedTick),entityDurationMs:entityStartedTick===undefined?null:Math.round(performance.now()-entityStartedTick),observedEntityCalls:[...observedCharacterCalls.values()],failed:w.tasks.filter(t=>t.state==='failed').map(t=>({id:t.id,error:t.error,attempts:t.attempts}))});await shot('characters-failed');await save('characters-failed-session-private.json',await journal(id))
   if(v.phase==='running')await click('暂停','preserve a non-transient failure for repair and stop new requests')
   exitCode=2;break
  }
  if(charactersOnly&&step==='import-char')await log('character-progress',{tasks:w.tasks.length,done:w.tasks.filter(t=>t.state==='done').length,failed:w.tasks.filter(t=>t.state==='failed').length,running:w.tasks.filter(t=>t.state==='running').length})
  if(scenesOnly&&step==='verify'&&!retried.has('scene-evidence')){
   const completedAt=new Date().toISOString(),completedTick=performance.now(),durationMs=sceneStartedTick===undefined?null:completedTick-sceneStartedTick,entityDurationMs=sceneEntityStartedTick===undefined?null:completedTick-sceneEntityStartedTick,performancePassed=durationMs!==null&&entityDurationMs!==null&&durationMs<=sceneDeadlineMs
   const s=await journal(id),list=s.wizard.candidates.scene??[],tasks=s.wizard.tasks.filter(t=>t.kind==='entity'&&list.some(c=>c.id===t.candidateId)),artifacts=s.artifacts.filter(a=>a.kind==='scene')
   assert.ok(list.length>0&&list.every(c=>c.selected));assert.equal(tasks.length,list.length);assert.deepEqual(sorted(tasks.map(t=>t.candidateId)),sorted(list.map(c=>c.id)));assert.ok(tasks.every(t=>t.state==='done'));assert.deepEqual(sorted(artifacts.map(a=>a.id)),sorted(list.map(c=>c.id)))
   assert.deepEqual(s.wizard.skipped,[]);assert.deepEqual(s.wizard.dropped,[]);assert.deepEqual(sorted(s.coverage['roster:scene']),sorted(s.workingUnits.map(u=>u.id)));assert.ok(artifacts.every(a=>list.find(c=>c.id===a.id)?.name===a.name))
   const {importNativeMappings}=await import('../desktop/core/novel-import-semantic-state.ts'),mapping=importNativeMappings(artifacts),ids=new Set(artifacts.map(a=>a.id));assert.equal(mapping.projectableIds.length,list.length);assert.equal(mapping.mappingWarnings.length,0)
   for(const a of artifacts)if(a.facts.parentId)assert.ok(ids.has(a.facts.parentId))
   assert.equal(s.chapters.length,expected.length);for(const [i,c] of s.chapters.entries()){assert.equal(c.title,expected[i].title);assert.equal(c.volume,expected[i].volumeName);assert.equal(c.start,expected[i].start);assert.equal(c.end,expected[i].end)}
   assert.equal(sha(s.workingProse),run.expectedBodySha256);assert.equal(sha(await readFile(source)),sourceHash);assert.equal(s.workingRevision,0);assert.deepEqual(errors,[])
   await save('scenes-completed.json',{sessionId:id,sourceSha256:sourceHash,chapters:s.chapters.length,units:s.workingUnits.length,covered:s.coverage['roster:scene'].length,scenes:list.length,states:tasks.reduce((o,t)=>(o[t.state]=(o[t.state]??0)+1,o),{}),artifacts:artifacts.length,parents:artifacts.filter(a=>a.facts.parentId).length,dropped:s.wizard.dropped.length,skipped:s.wizard.skipped.length,mappingWarnings:mapping.mappingWarnings.length,bodyUnchanged:true,pageErrors:errors,selected:s.selected,targets:s.targets,sceneStartedAt,sceneEntityStartedAt,completedAt,durationMs,entityDurationMs,deadlineMs:sceneDeadlineMs,performancePassed})
   await save('scenes-session-private.json',s);await shot('scenes-completed');retried.add('scene-evidence')
   if(!performancePassed){exitCode=4;break}
  }
  if(scenesOnly&&step==='import-scene'&&(v.error&&!/重新允许/u.test(v.error)||w.tasks.some(t=>t.state==='failed'))){await save(`scene-failed-r${v.revision}.json`,{...brief(v),failed:w.tasks.filter(t=>t.state==='failed').map(t=>({id:t.id,error:t.error}))});await save('scene-failed-session-private.json',await journal(id));await shot('scene-failed');exitCode=2;break}
  if(v.phase==='completed'){const s=await journal(id);if(scenesOnly){assert.ok(retried.has('scene-evidence'));assert.equal(sha(await readFile(source)),sourceHash);assert.deepEqual(errors,[]);await save('published-session-private.json',s)}await save('completed.json',{publication:v.publication,summary:v.summary,notFound:v.notFound,checks:w.checks});await shot('completed');exitCode=0;break}
  if(v.phase==='conflicts'){await preserveSceneCheckpoint('conflicts',id);await save(`conflicts-r${v.revision}.json`,{conflicts:v.conflicts.filter(c=>c.status==='pending').map(c=>({id:c.id,kind:c.kind,field:c.field,artifactName:c.artifactName}))});await shot('conflicts');exitCode=2;break}
  if(state==='failed'){
   await save(`failed-${step}-r${v.revision}.json`,{...brief(v),tasks:w.tasks?.filter(t=>t.state==='failed').map(t=>({id:t.id,kind:t.kind,error:t.error,attempts:t.attempts}))});await shot(`failed-${step}`)
   // A failed recognition or line step gets one 重新识别/重试 through the real UI per driver run; never 跳过.
   if(scenesOnly){await save('scene-failed-session-private.json',await journal(id));exitCode=2;break}
   const again=[button('重新识别'),button('重试')];let clicked=false
   if(!retried.has('step:'+step))for(const b of again)if(await b.first().isVisible()){retried.add('step:'+step);await log('click',{button:await b.first().innerText(),why:'retry a failed step once',error:w.stepError});await b.first().click();clicked=true;break}
   if(!clicked){exitCode=2;break}
   await page.waitForTimeout(3000);continue
  }
  // After a restart every grant is gone. The wizard shows 允许并继续(导入) whenever it needs permission again;
  // a paused step that waits for the author continues with its own buttons below.
  if(v.phase==='paused'||v.error&&/重新允许/u.test(v.error)){
   const resume=[button('允许并继续导入'),button('允许并继续')];let clicked=false
   for(const b of resume)if(await b.first().isVisible()){await shot('resume-consent');await log('click',{button:await b.first().innerText(),why:'resume after restart; the user approved the full run'});await b.first().click();clicked=true;break}
   if(clicked){await page.waitForTimeout(3000);continue}
   if(state!=='waiting'){await save(`paused-no-resume-r${v.revision}.json`,brief(v));await shot('paused-no-resume');exitCode=2;break}
  }
  if(rosterOnly&&step==='detect-char'&&state==='running'){
   const n=w.rosterFound??0;if(samples.at(-1)?.n!==n){samples.push({ms:Date.now()-rosterStart,n,revision:v.revision});await log('roster-count',{ms:Date.now()-rosterStart,n});if(process.env.LOTM_ROSTER_STASH)try{lastStash=(await journal(id)).wizard.rosterStash?.character??lastStash}catch{}}
   if(Date.now()-lastShot>=8000){lastShot=Date.now();await shot(`detect-char-running-${n}`)}
   await page.waitForTimeout(250);continue
  }
  if(v.phase==='running'||v.phase==='recognizing'||v.phase==='publishing'||state==='running'){
   if(Date.now()-lastChange>2*60*60*1000){await save(`stalled-r${v.revision}.json`,brief(v));exitCode=3;break}
   await page.waitForTimeout(charactersOnly||scenesOnly?500:15000);continue
  }
  if(state!=='waiting'){await page.waitForTimeout(3000);continue}
  switch(step){
   case 'files':{const f=v.files;assert.equal(f.length,1);assert.equal(f[0].hash,run.sourceSha256);assert.equal(f[0].characters,run.utf16Characters);assert.equal(f[0].encoding,'gb18030');assert.equal(f[0].requiresEncodingConfirmation,false)
    await save('step02-files.json',{files:f.map(({name,characters,encoding,requiresEncodingConfirmation,unitCount,unknownCount,hash})=>({name,characters,encoding,requiresEncodingConfirmation,unitCount,unknownCount,hash}))});await shot('files');await click('继续','files confirmed');break}
   case 'work':{if(!v.targetLabel){await click('选择目录','choose the empty target directory');await until(v=>!!v.targetLabel)}await save('step03-work.json',{title:(await current()).title,targetLabel:(await current()).targetLabel});await shot('work');await click('继续','work title and directory set');break}
   case 'kinds':{
    // Body only from the file; infer exactly the 11 target kinds (golden finger is not part of this task).
    // The body's chapter headings are the file outline and are imported with it.
    for(const kind of v.selected.filter(k=>k!=='body'&&k!=='outline')){const name={outline:'大纲',theme:'主题',style:'文风',world:'世界观',character:'角色',scene:'场景',item:'物品',foreshadow:'伏笔',goldenFinger:'金手指',trope:'爽点/泪点',worldline:'世界线',narrative:'叙事线'}[kind];await log('uncheck-source',{kind});await page.locator('.ni-direct-option',{hasText:name}).locator('input').click();await until(v=>!v.selected.includes(kind),60000)}
    // Controlled checkboxes change only after the IPC round trip, so click and wait for the session.
    v=await current();for(const kind of v.targets.filter(k=>!TARGETS.includes(k))){await log('uncheck-target',{kind});await page.locator('.ni-target-card',{hasText:LABELS[kind]}).locator('input').click();v=await until(v=>!v.targets.includes(kind),60000)}
    assert.deepEqual(sorted(v.selected),['body','outline']);assert.deepEqual(sorted(v.targets),sorted(TARGETS));assert.equal(v.infer,true)
    // Local rules must classify every unit; an unclassified notice is a failure, not something to send to the model.
    if(!v.sourceReady){await save(`step04-unclassified-r${v.revision}.json`,{found:v.found,unknown:v.files[0].unknownCount,error:v.error});await shot('kinds-unclassified');exitCode=2;break}
    const s=await journal(id),counts={};for(const u of s.units)counts[u.kind]=(counts[u.kind]??0)+1
    await save(`step04-kinds-r${v.revision}.json`,{found:v.found,selected:v.selected,targets:v.targets,infer:v.infer,unitKinds:counts,excluded:s.units.filter(u=>u.kind==='excluded').map(u=>[u.start,u.end])});await shot('kinds')
    await click('识别卷章','start chapter structure recognition');break}
   case 'tree':{
    const s=await journal(id),structure=s.wizard.structure,got=structure.map((c,i)=>({i,title:c.title,volume:c.volume??null,start:c.start,end:c.end})),body=s.files[0]?undefined:undefined
    const want=expected.map((c,i)=>({i,title:c.title,volume:c.volumeName,start:c.start,end:c.end}))
    const diff=[];for(let i=0;i<Math.max(got.length,want.length);i++){const a=got[i],b=want[i];if(!a||!b||a.title!==b.title||a.volume!==b.volume||a.start!==b.start||a.end!==b.end)diff.push({i,got:a??null,want:b??null})}
    const volumes={};for(const c of got)volumes[c.volume??'(未分卷)']=(volumes[c.volume??'(未分卷)']??0)+1
    await save(`step06-tree-r${v.revision}.json`,{chapters:got.length,volumes,diffCount:diff.length,firstDiffs:diff.slice(0,20),selected:w.chapterSelection.length});await shot('tree')
    if(diff.length){await log('structure-mismatch',{diffCount:diff.length});exitCode=2;break}
    assert.equal(w.chapterSelection.length,expected.length);await click('允许分析并导入','structure matches the frozen baseline; all chapters selected');rosterStart=Date.now();break}
   case 'detect-char':if(rosterOnly){
    const list=w.candidates.character??[],elapsed=rosterStart?Date.now()-rosterStart:null,j=await journal(id),call=JSON.parse(await readFile(join(appRoot,'novel-imports',id,'runtime.json'),'utf8')).calls.filter(c=>c.intent==='roster')
    const started=call.map(c=>Date.parse(c.startedAt)),settled=call.filter(c=>c.settledObservedAt).map(c=>Date.parse(c.settledObservedAt))
    await save('roster-timing.json',{driverElapsedMs:elapsed,callWindowMs:started.length&&settled.length?Math.max(...settled)-Math.min(...started):null,calls:call.length,outcomes:call.map(c=>c.outcome),samples,candidates:list.length,covered:(j.coverage['roster:character']??[]).length,units:(j.workingUnits??[]).length,top:[...list].sort((a,b)=>b.chapterCount-a.chapterCount).slice(0,40).map(c=>({name:c.name,aliases:c.aliases,roleType:c.roleType,chapterCount:c.chapterCount}))})
    // Diagnostic only: names and role votes, no text, kept outside the repository.
    if(process.env.LOTM_ROSTER_STASH)await writeFile(process.env.LOTM_ROSTER_STASH,JSON.stringify(lastStash.map(({unitId,name,aliases,roleType})=>({unitId,name,aliases,roleType}))),{flag:'wx'})
    await shot('detect-char-done');exitCode=elapsed!==null&&elapsed<=60000?0:4;break
   }
   case 'detect-char':case 'detect-scene':case 'detect-item':case 'detect-world':{
    const kind={'detect-char':'character','detect-scene':'scene','detect-item':'item','detect-world':'world'}[step],list=w.candidates[kind]??[]
    await save(`step-${step}-r${v.revision}.json`,{count:list.length,selected:list.filter(c=>c.selected).length,candidates:list.map(c=>({id:c.id,kind:c.kind,name:c.name,aliases:c.aliases,roleType:c.roleType,settingType:c.settingType,parentId:c.parentId,chapterCount:c.chapterCount,selected:c.selected}))});await shot(step)
    if(!list.length){await log('empty-roster',{step});exitCode=2;break}
    assert.ok(list.every(c=>c.selected),'roster defaults must stay all selected');assert.ok(Object.values(w.images).every(x=>!x),'image generation is not part of this task')
    const go=page.locator('.ni-footer button').filter({hasText:/^导入 \d+ /u});if(charactersOnly&&kind==='character'&&entityStartedTick===undefined){entityStartedAt=new Date().toISOString();entityStartedTick=performance.now()}if(scenesOnly&&kind==='scene'&&sceneEntityStartedTick===undefined){sceneEntityStartedAt=new Date().toISOString();sceneEntityStartedTick=performance.now()}await log('click',{button:await go.innerText(),why:'keep the default full roster'});await go.click();break}
   case 'import-char':case 'import-scene':case 'import-item':case 'import-world':{
    const failed=w.tasks.filter(t=>t.state==='failed'),fresh=failed.filter(t=>charactersOnly?transientCharacterError(t.error)&&(characterRetries.get(t.id)??0)<3:!retried.has(t.id))
    await save(`step-${step}-wait-r${v.revision}.json`,{tasks:w.tasks.length,done:w.tasks.filter(t=>t.state==='done').length,skipped:w.tasks.filter(t=>t.state==='skipped').length,failed:failed.map(t=>({id:t.id,candidateId:t.candidateId,settingsKind:t.settingsKind,error:t.error,attempts:t.attempts}))})
    if(!fresh.length){await shot(`${step}-failed`);exitCode=2;break}
    // Task cards carry no id; click 重试 on failed cards one at a time through the real UI.
    for(const t of fresh){retried.add(t.id);if(charactersOnly)characterRetries.set(t.id,(characterRetries.get(t.id)??0)+1);await log('retry-task',{id:t.id,error:t.error});const before=(await current()).revision;const cards=page.locator('.ni-w-ent[data-s="failed"]'),candidate=w.candidates.character?.find(c=>c.id===t.candidateId);await (charactersOnly&&candidate?cards.filter({has:page.getByText(candidate.name,{exact:true})}):cards).first().getByRole('button',{name:'重试',exact:true}).click();await until(v=>v.revision>before,60000)}
    break}
   case 'verify':{
    await save(`step21-verify-r${v.revision}.json`,{checks:w.checks,notFound:v.notFound,pendingConflicts:v.conflicts.filter(c=>c.status==='pending').length,dropped:w.dropped,skipped:w.skipped});await shot('verify')
    if(!w.checks?.every(c=>c.ok)||v.conflicts.some(c=>c.status==='pending')||TARGETS.some(k=>v.notFound.includes(k))){await preserveSceneCheckpoint('verify-failed',id);exitCode=2;break}
    await click('保存作品','all checks passed');break}
   default:await save(`unexpected-${step}-r${v.revision}.json`,brief(v));exitCode=2
  }
  if(exitCode===2||rosterOnly&&exitCode!==1)break
  await page.waitForTimeout(rosterOnly||charactersOnly?250:3000)
 }
 await save('page-errors.json',errors)
}catch(error){if(scenesOnly&&isolatedConfirmed)try{await preserveSceneCheckpoint('driver-error')}catch{await log('scene-checkpoint-save-failed')};if(charactersOnly&&isolatedConfirmed)try{const v=await current();if(v)await save('driver-error-session-private.json',await journal(v.id));await save('driver-error-calls.json',{roleDurationMs:roleStartedTick===undefined?null:Math.round(performance.now()-roleStartedTick),observedEntityCalls:[...observedCharacterCalls.values()]})}catch{}await log('driver-error',{message:String(error?.message??error).slice(0,800)});await shot('driver-error').catch(()=>undefined);exitCode=1}
finally{
 let canClose=true
 if(scenesOnly&&isolatedConfirmed&&exitCode!==0)try{await preserveSceneCheckpoint('before-close')}catch{canClose=false;exitCode=1;await log('scene-checkpoint-save-failed',{keptOpen:true})}
 const exit=canClose?await close().catch(()=>null):null;await log('shutdown',{exit,exitCode,...(!canClose?{keptOpenForCheckpoint:true}:{})});process.exitCode=exitCode
}
