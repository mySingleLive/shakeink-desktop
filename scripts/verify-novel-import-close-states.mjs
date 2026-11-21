import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {mkdtemp,mkdir,readFile,readdir,realpath,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

const source='/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt'
const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-abandon-')))
const dataRoot=join(directory,'data'),target=join(directory,'target'),imports=join(dataRoot,'novel-imports')
await mkdir(target)
execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-abandon.ts'),directory],{stdio:'pipe'})

const released=new Set(),gates=new Map(),counts=new Map(),pending=new Map(),results=[]
const stageOf= request=>{const kind={character:'char',scene:'scene',item:'item',world:'world'}[request.kind];return request.intent==='roster'?`detect-${kind}`:request.intent==='entity'?`import-${kind}`:request.phase}
const release=stage=>{released.add(stage);for(const resolve of gates.get(stage)??[])resolve();gates.delete(stage)}
const releaseAll=()=>{for(const stage of ['detect-char','import-char','detect-scene','import-scene','detect-item','import-item','detect-world','import-world'])release(stage)}
const occurrences=(text,value)=>text.split(value).length-1
const sceneRecord=(name,units)=>{
 for(const unit of units){const text=unit.fragments?unit.fragments.map(fragment=>fragment.text).join(''):unit.text
  if(occurrences(text,name)===1)return {name,aliases:[],mentions:[{literal:name,evidence:{unitId:unit.id,quote:name}}],context:[],links:[]}
  for(const fragment of unit.fragments??[])if(occurrences(fragment.text,name)===1&&occurrences(text,fragment.text)===1)return {name,aliases:[],mentions:[{literal:name,evidence:{ref:fragment.ref}}],context:[],links:[]}
 }
 throw Error('controlled scene evidence unavailable')
}
const roster=(kind,units)=>{
 if(kind==='character')return {roster:[{name:'克莱恩',aliases:[],roleType:'PROTAGONIST'},{name:'班森',aliases:[],roleType:'SUPPORTING'}]}
 if(kind==='scene'){const records=[];for(const name of ['廷根','佐特兰街','黑荆棘安保公司','水仙花街','莫雷蒂家'])try{records.push(sceneRecord(name,units));if(records.length===2)break}catch{}return {roster:records}}
 if(kind==='item')return {roster:[{name:'笔记本',aliases:[],category:'item',itemType:'笔记',important:true},{name:'左轮手枪',aliases:[],category:'item',itemType:'武器',important:true}]}
 return {roster:[{name:'主世界',aliases:[],settings:[{settingType:'POWER_SYSTEM',name:'序列'}]}]}
}
const entity=request=>{
 const target=request.entityTarget,own=request.entities.find(item=>item.id===target.id),kind=request.kind,unit=request.units.find(item=>item.text.includes(own.name))??request.units[0]
 const quote=unit.text.includes(own.name)?own.name:unit.text.slice(0,Math.min(12,unit.text.length))
 const facts=kind==='character'?{roleType:target.roleType}:kind==='scene'?{entityType:'PLACE',...(own.parentId?{parentId:own.parentId}:{})}:kind==='world'?(own.entityType==='SETTING'?{entityType:'SETTING',worldId:own.worldId,settingType:own.settingType,content:JSON.stringify({text:own.name+'设定'})}:{entityType:'WORLD',...(own.parentId?{parentId:own.parentId}:{})}):{}
 return {artifacts:[{id:own.id,kind,name:own.name,text:own.name+'资料',facts,evidence:target.evidenceOptions?.length?[{optionIndex:0}]:[{unitId:unit.id,quote}],sourceUnitIds:[unit.id],origin:'inferred'}]}
}
const server=createServer((req,res)=>void (async()=>{
 let text=''
 for await(const chunk of req)text+=chunk
 const body=JSON.parse(text),prompt=body.messages.map(message=>typeof message.content==='string'?message.content:(message.content??[]).map(part=>part.text??'').join('')).join('\n')
 const marker=prompt.includes('<novel-import-data>')?['<novel-import-data>','</novel-import-data>']:['<novel-import-structure-data>','</novel-import-structure-data>']
 // docs/526: the shared layout nests the old payload in `task` and its units in sharedSource/extra.
 const raw=JSON.parse(prompt.split(marker[0])[1].split(marker[1])[0]),request=raw.task?{...raw.task,units:[...raw.sharedSource.flatMap(w=>w.units),...raw.extra]}:raw,stage=stageOf(request),count=(counts.get(stage)??0)+1
 counts.set(stage,count);pending.set(stage,(pending.get(stage)??0)+1);console.log(JSON.stringify({modelRequest:stage,count}))
 const skipHold=process.env.DEBUG_NO_HOLD==='1'||process.env.DEBUG_NO_HOLD==='import'&&stage.startsWith('import-')
 if(!skipHold&&!released.has(stage)&&(stage.startsWith('detect-')||stage.startsWith('import-')&&count>1))await new Promise(resolve=>{const stageGates=gates.get(stage)??new Set();stageGates.add(resolve);gates.set(stage,stageGates)})
 const identity=request.sceneIdentity
 const output=identity?.mode==='cleanup'?{sceneCleanup:identity.focus.map(item=>({index:item.index,action:'keep'}))}:identity?.mode==='links'?{sceneIdentityDecisions:identity.tasks.map((_,taskIndex)=>({taskIndex,result:'unknown',evidence:[]}))}:request.intent==='roster'?roster(request.kind,request.units):request.intent==='entity'?entity(request):request.phase==='review'?{conflicts:[]}:{notFound:true}
 if(process.env.DEBUG_SCENE==='1'&&stage==='detect-scene'){const {sceneRosterGenerationSchema}=await import('../desktop/service/novel-import-ai.ts'),model={id:'debug',authRevision:1,provider:'custom',protocol:'openai',kind:'TEXT',endpoint,modelId:'debug',contextWindow:1048576},parsed=sceneRosterGenerationSchema({...request,units:request.units.map(unit=>({...unit,text:unit.fragments.map(fragment=>fragment.text).join('')})),operationId:'debug',models:{text:model,review:model}}).safeParse(output);console.log(JSON.stringify({sceneValidation:parsed.success,issues:parsed.success?[]:parsed.error.issues.slice(0,3).map(issue=>({path:issue.path,message:issue.message}))}))}
 const content=JSON.stringify(output),chunk=(delta,finish_reason=null,usage)=>({id:'chatcmpl-controlled',object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'controlled',choices:[{index:0,delta,finish_reason}],...(usage?{usage}:{})})
 res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache',connection:'keep-alive'})
 res.write(`data: ${JSON.stringify(chunk({role:'assistant',content}))}\n\n`)
 res.write(`data: ${JSON.stringify(chunk({},'stop',{prompt_tokens:1,completion_tokens:1,total_tokens:2}))}\n\n`)
 res.write('data: [DONE]\n\n');res.end();pending.set(stage,Math.max(0,(pending.get(stage)??1)-1))
})().catch(error=>{if(!res.headersSent)res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'controlled model error'}}));console.error('controlled-model',error.message)}))
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const address=server.address(),endpoint=`http://127.0.0.1:${address.port}/v1`
const drafts=async()=>{try{return (await readdir(imports)).filter(name=>/^[0-9a-f-]{36}$/u.test(name))}catch(error){if(error.code==='ENOENT')return [];throw error}}
const env={...process.env,SHAKEINK_TEST_ROOT:dataRoot};delete env.ELECTRON_RUN_AS_NODE
let app
try{
 app=await _electron.launch({args:[resolve('.')],env,timeout:90000})
 const page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(120000)
 assert.equal(await app.evaluate(()=>process.env.SHAKEINK_TEST_ROOT),dataRoot)
 await app.evaluate(({dialog},paths)=>{globalThis.__importMessageBoxes=0;const showMessageBox=dialog.showMessageBox.bind(dialog);dialog.showMessageBox=async(...args)=>{globalThis.__importMessageBoxes++;return showMessageBox(...args)};dialog.showOpenDialog=async(...args)=>{const options=args.at(-1);return {canceled:false,filePaths:[options?.properties?.includes('openFile')?paths.source:paths.target]}}},{source,target})
 const later=page.getByRole('button',{name:'暂不配置',exact:true});await later.waitFor({timeout:15000}).then(()=>later.click(),()=>undefined)
 await page.getByRole('button',{name:'导入作品',exact:true}).waitFor()
 const current=async()=>(await page.evaluate(()=>window.desktop.novelImport({type:'current'}))).view
 const until=async(test,timeout=30000)=>{const end=Date.now()+timeout;let last='';for(;;){const view=await current(),brief=view?{revision:view.revision,phase:view.phase,step:view.wizard?.step,state:view.wizard?.stepState?.[view.wizard.step],error:view.error,stepError:view.wizard?.stepError,tasks:view.wizard?.tasks?.map(task=>({kind:task.kind,state:task.state,error:task.error}))}:null,signature=JSON.stringify(brief);if(signature!==last){last=signature;console.log(JSON.stringify({state:brief}))}if(view?.wizard?.stepState[view.wizard.step]==='failed'||view?.wizard?.tasks.some(task=>task.state==='failed'))throw Error('import failed: '+signature);if(await test(view))return view;if(Date.now()>end)throw Error('timed out: '+signature);await page.waitForTimeout(100)}}
 const modelIds={}
 for(const [key,name] of [['text','隔离文本模型'],['review','隔离审核模型']])modelIds[key]=await page.evaluate(async({name,endpoint})=>{const boot=await window.desktop.bootstrap(),saved=await window.desktop.settings({type:'save-model',revision:boot.revision,model:{name,provider:'custom',protocol:'openai',modelId:name,endpoint,kind:'TEXT',contextWindow:1048576,enabled:true,thinkingLevels:[],defaultThinking:'default',apiKey:'controlled-test-key'}});return saved.models.find(model=>model.name===name).id},{name,endpoint})
 await page.evaluate(async({textId,reviewId})=>{const boot=await window.desktop.bootstrap(),settings=structuredClone(boot.settings);settings.agent.textModelId=textId;settings.agent.reviewModelId=reviewId;await window.desktop.settings({type:'update',revision:boot.revision,settings})},{textId:modelIds.text,reviewId:modelIds.review})
 await page.getByRole('button',{name:'导入作品',exact:true}).click()
 const main=page.locator('.ni-dialog'),confirm=page.getByRole('dialog',{name:'关闭导入？',exact:true})
 await main.getByText('诡秘之主-原始文本.txt',{exact:true}).waitFor()
 await main.getByRole('button',{name:'继续',exact:true}).click()
 await main.getByRole('button',{name:'选择目录',exact:true}).click()
 await main.getByRole('button',{name:'继续',exact:true}).click()
 await page.evaluate(async()=>{const view=(await window.desktop.novelImport({type:'current'})).view;await window.desktop.novelImport({type:'select',id:view.id,revision:view.revision,selected:['body','outline'],targets:['character','scene','item','world'],infer:true})})
 await until(view=>!!view&&view.infer&&view.targets.length===4)
 await main.getByRole('button',{name:'识别卷章',exact:true}).click()
 const tree=await until(view=>view?.wizard?.step==='tree'&&view.wizard.stepState.tree==='waiting')
 const structure=tree.wizard.structure
 assert.ok(structure.length>=10&&structure.slice(0,10).every(chapter=>chapter.volume===structure[0].volume))
 await main.getByRole('button',{name:'全不选',exact:true}).click()
 await until(view=>view?.wizard?.chapterSelection?.length===0)
 const chapters=main.locator('.ni-w-ch input')
 for(let i=0;i<10;i++){await chapters.nth(i).click();await until(view=>view?.wizard?.chapterSelection?.length===i+1)}
 await main.getByRole('button',{name:'允许分析并导入',exact:true}).click()
 await until(view=>view?.wizard?.step==='detect-char'&&view.wizard.stepState['detect-char']==='running')
 let session=await current(),sessionId=session.id
 const journal=JSON.parse(await readFile(join(imports,sessionId,'session.json'),'utf8'))
 assert.equal(journal.chapters.length,10);assert.deepEqual(journal.wizard.grantedChapters,Array.from({length:10},(_,i)=>i))

 const checkWarning=async step=>{
 await until(view=>view?.wizard?.step===step&&view.wizard.stepState[step]==='running')
 if(step.startsWith('import-'))await until(view=>{const w=view?.wizard;if(!w)return false;const kind={char:'character',scene:'scene',item:'item',world:'world'}[step.slice(7)],ids=new Set((w.candidates[kind]??[]).map(candidate=>candidate.id)),tasks=w.tasks.filter(task=>ids.has(task.candidateId));return tasks.some(task=>task.state==='done')&&tasks.some(task=>task.state==='running')})
 await until(()=>(pending.get(step)??0)>0)
 const before=await current()
 await main.getByRole('button',{name:'关闭导入窗口',exact:true}).click();await confirm.waitFor()
 assert.equal(await confirm.evaluate(node=>node instanceof HTMLElement&&node.getAttribute('data-slot')==='dialog-content'),true)
 assert.equal(await page.locator('.desktop-prompt').count(),0,'import close uses its own confirmation, not an app prompt')
 assert.match(await confirm.innerText(),/已导入的内容会被删除/);assert.match(await confirm.innerText(),/原始文件不会更改/)
 assert.deepEqual(await drafts(),[before.id]);assert.ok((pending.get(step)??0)>0)
 await confirm.getByRole('button',{name:'继续导入',exact:true}).click();await confirm.waitFor({state:'hidden'})
 const after=await current();assert.equal(after.id,before.id);assert.equal(after.wizard.step,step);assert.deepEqual(await drafts(),[before.id])
 results.push({step,warning:true,htmlModal:true,continuedSameDraft:true});console.log(JSON.stringify(results.at(-1)))
 release(step)
 }
 await checkWarning('detect-char')
 await until(view=>view?.wizard?.step==='detect-char'&&view.wizard.stepState['detect-char']==='waiting')
 await main.locator('.ni-footer button').filter({hasText:/^导入 \d+ 个角色/}).click()
 await checkWarning('import-char')
 await checkWarning('detect-scene')
 await until(view=>view?.wizard?.step==='detect-scene'&&view.wizard.stepState['detect-scene']==='waiting')
 await main.locator('.ni-footer button').filter({hasText:/^导入 \d+ 个场景/}).click()
 await checkWarning('import-scene')
 await checkWarning('detect-item')
 await until(view=>view?.wizard?.step==='detect-item'&&view.wizard.stepState['detect-item']==='waiting')
 await main.locator('.ni-footer button').filter({hasText:/^导入 \d+ 个物品/}).click()
 await checkWarning('import-item')
 await checkWarning('detect-world')
 await until(view=>view?.wizard?.step==='detect-world'&&view.wizard.stepState['detect-world']==='waiting')
 await main.locator('.ni-footer button').filter({hasText:/^导入 \d+ 项世界观/}).click()
 await checkWarning('import-world')
 const done=await until(view=>view?.wizard?.step==='verify'&&view.wizard.stepState.verify==='waiting'&&view.wizard.checks?.length===8)
 assert.ok(done.wizard.checks.every(check=>check.ok),JSON.stringify(done.wizard.checks))
 assert.equal(results.length,8)
 const nativeMessageBoxes=await app.evaluate(()=>globalThis.__importMessageBoxes);assert.equal(nativeMessageBoxes,0)
 console.log(JSON.stringify({result:'PASS',chapters:10,checks:results,finalChecks:done.wizard.checks.length,nativeMessageBoxes,isolatedRoot:true,controlledLocalModel:true}))
}finally{
 releaseAll();app?.process().kill("SIGKILL");server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true})
}
