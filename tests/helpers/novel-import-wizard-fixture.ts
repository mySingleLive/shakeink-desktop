/* Shared synthetic fixture for the import wizard tests (07-test-cases §标准合成夹具). */
import assert from 'node:assert/strict'
import {mkdtemp,realpath,rm,stat,readFile,writeFile,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NovelImportController} from '../../desktop/main/novel-import'
import {importHash} from '../../desktop/core/novel-import'
import type {ImportAiRequest,ImportAiResult,ImportFile,ImportModel,ImportSession,ImportView,ImportPublishInput,ImportReceipt} from '../../desktop/shared/novel-import'
import {importStructureCandidateMetadata} from '../../desktop/core/novel-import-structure'
/** Accept every structure candidate as a chapter cut, as the model would for clean headings. */
export function allCuts(r:ImportAiRequest):ImportAiResult{return {chapterCuts:r.units.map(unit=>{const meta=importStructureCandidateMetadata(unit);return {start:unit.start,title:meta.chapterTitle??meta.title,candidateId:unit.id,...(meta.volume?{volume:meta.volume}:{})}}),ignoredStarts:[]}}

/* Synthetic fixture F (07-test-cases §标准合成夹具). No real novel text, no keys. */
export const volumesF:[string,string[]][]=[['甲卷',['第一章 起','第二章 承','第三章 转','第四章 终']],['乙卷',['第一章 再起','第二章 再承','第三章 再终']],['丙卷',['第一章 三起','第二章 三承','第三章 三终']]]
export const cast=['沈砚','林舟','顾三']
export function bodyF(){
 let text=''
 for(const [index,[volume,chapters]] of volumesF.entries())for(const [k,title] of chapters.entries()){text+=(k===0?`第${'一二三'[index]}部 ${volume}\n\n`:'')+title+'\n\n'+`${cast[(index+k)%3]}在北城南巷拾起青铜钥匙。${title.slice(4)}之夜。\n\n`}
 return text+'后记\n\n作者的话。\n'
}
export const settingsF='# 角色\n\n沈砚：渡口少年。\n\n林舟：沈砚的朋友。\n\n# 世界观\n\n## 社会制度\n\n三省六部。\n\n## 风俗\n\n上元灯会。\n'
/** Large-context models select the v2 budget policy, as current providers do. */
export const model:ImportModel={id:'text',name:'受控文本模型',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:1048576}
export const review:ImportModel={...model,id:'review',name:'受控审核模型'}
export function source(text:string,name:string,id:string,extra:Partial<ImportFile>={}):ImportFile{return {id,name,path:'/private/tmp/niw-synthetic/'+id,format:name.endsWith('.md')?'md':'txt',bytes:Buffer.byteLength(text),hash:importHash(text),text,included:true,encoding:'utf-8',...extra}}
export const filesF=()=>[source(bodyF(),'正文.txt','f-body',{encoding:'gb18030'}),source(settingsF,'资料.md','f-notes')]

export type Ai=(r:ImportAiRequest)=>Promise<ImportAiResult>
/** Classify the settings file by its top-level heading, as a model would. */
export function classifyF(r:ImportAiRequest):ImportAiResult{
 const heads=[...settingsF.matchAll(/^# (角色|世界观|场景|物品)$/gmu)].map(m=>({start:m.index!,kind:({角色:'character',世界观:'world',场景:'scene',物品:'item'} as const)[m[1] as '角色']}))
 return {classifications:r.units.map(u=>({unitId:u.id,kind:u.fileId==='f-body'?'body' as const:[...heads].reverse().find(h=>h.start<=u.start)?.kind??'world'}))}
}
export async function fixture(files:ImportFile[]=filesF(),ai?:Ai,over:{models?:{text?:ImportModel;review?:ImportModel}}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'niw-engine-'))),target=await realpath(await mkdtemp(join(tmpdir(),'niw-target-'))),s=await stat(target,{bigint:true})
 const requests:ImportAiRequest[]=[];let published:ImportSession|undefined,models=over.models??{text:model,review},handler:Ai
 const fallback:Ai=async r=>r.intent==='structure'?allCuts(r):r.phase==='classify'?classifyF(r):r.phase==='review'?{conflicts:[]}:{notFound:true}
 handler=ai??fallback
 const options={wizard:true,root,choose:async()=>['/private/tmp/niw-synthetic'],chooseTarget:async()=>({path:target,device:String(s.dev),inode:String(s.ino)}),protectedDirectories:async()=>[],models:async()=>models,scan:async()=>structuredClone(files),verifySources:async()=>{},redecode:async(f:ImportFile)=>({...f,requiresEncodingConfirmation:false}),ai:async(r:ImportAiRequest)=>{requests.push(structuredClone(r));return handler(r)},cancelAi:async(_id:string)=>{},publish:async(input:ImportPublishInput):Promise<ImportReceipt>=>{published=structuredClone(input.session);return {requestId:input.session.publication!.requestId,workId:'work',novelId:'novel',importHash:input.importHash}}}
 const controller=new NovelImportController(options);await controller.initialize()
 const view=async()=>(await controller.act({type:'current'})).view!
 async function act(type:string,extra:Record<string,unknown>={}){const v=type==='choose'?undefined:await view();return controller.act({type,...(v?{id:v.id,revision:v.revision}:{}),...extra})}
 async function settle(){for(let i=0;i<3000&&controller.active;i++)await new Promise(r=>setTimeout(r,5));assert.equal(controller.active,0,'background work drained');return view()}
 const journal=async()=>{const v=await view();return JSON.parse(await readFile(join(root,'novel-imports',v.id,'session.json'),'utf8')) as ImportSession}
 return {controller,options,act,settle,view,journal,requests,root,target,setModels(m:typeof models){models=m},handler:()=>handler,setAi(next:Ai){handler=next},get published(){return published},async dispose(){await controller.close().catch(()=>undefined);await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true})}}
}
/** Explicit compatibility fixture for pre-identity scene controller tests.
 * Only the initial synthetic journal is made genuinely versionless. Fresh
 * fixture() and every production migration/validation rule remain unchanged.
 * This is a controlled old-contract fixture, not actual app restart evidence. */
export async function legacySceneFixture(...args:Parameters<typeof fixture>){
 const f=await fixture(...args),act=f.act;let adopted=false
 f.act=async(type,extra={})=>{
  const response=await act(type,extra)
  if(type!=='choose'||adopted||!response.view)return response
  assert.equal(f.controller.active,0,'legacy fixture adoption precedes all background work')
  const session=await f.journal();assert.ok(session.wizard);assert.equal(session.artifacts.length,0);assert.equal(session.wizard.sceneIdentity,undefined)
  assert.ok(Object.values(session.wizard.candidates).every(entries=>!entries?.length),'legacy fixture adoption precedes every recognized candidate')
  assert.ok(Object.values(session.wizard.rosterStash??{}).every(entries=>!entries?.length),'legacy fixture adoption cannot erase recognized material')
  delete session.wizard.sceneIdentityVersion;delete session.wizard.sceneIdentity
  const c=f.controller as unknown as {session:ImportSession;validJournal(j:unknown,id:string):boolean}
  assert.ok(c.validJournal(structuredClone(session),session.id),'the original controller accepts a genuine legacy journal')
  await writeFile(join(f.root,'novel-imports',session.id,'session.json'),JSON.stringify(session));c.session=session;adopted=true
  const stored=await f.journal();assert.ok(!Object.hasOwn(stored.wizard!,'sceneIdentityVersion'));assert.ok(!Object.hasOwn(stored.wizard!,'sceneIdentity'))
  return{...response,view:await f.view()}
 }
 return f
}
/** Drive steps 1–5: choose sources, confirm files, name and folder, content kinds, local structure. */
export async function toTree(f:Awaited<ReturnType<typeof fixture>>,kinds={selected:['body','character','world'],infer:true}){
 await f.act('choose',{mode:'files'})
 await f.act('wizard-next')
 await f.act('set-title',{title:'合成作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle()
 const v=await f.view();await f.act('select',{selected:kinds.selected.filter(k=>v.found[k as keyof typeof v.found]),targets:v.targets,infer:kinds.infer})
 await f.act('wizard-next',{consent:true});return f.settle()
}


export const indexOfTitle=(v:ImportView,title:string)=>v.wizard!.structure!.findIndex(c=>c.title===title)


/** Fake model: roster lists cast names found in each unit, with exact evidence. */
export function rosterAi(over:Partial<Record<string,(r:ImportAiRequest)=>ImportAiResult|undefined>>={}):Ai{
 return async r=>{
  const custom=over[(r.intent??r.phase)+':'+(r.kind??'')]?.(r);if(custom)return custom
  if(r.intent==='structure')return allCuts(r)
  if(r.phase==='classify')return classifyF(r)
  if(r.intent==='roster'){
   const roles:Record<string,'PROTAGONIST'|'SUPPORTING'|'ANTAGONIST'>={沈砚:'PROTAGONIST',林舟:'SUPPORTING',顾三:'ANTAGONIST'}
   const hits=(names:string[])=>r.units.flatMap(u=>names.filter(n=>u.text.includes(n)).map(n=>({name:n,unit:u})))
   if(r.kind==='character')return {roster:hits(Object.keys(roles)).map(({name,unit})=>({name,aliases:[],roleType:roles[name],evidence:{unitId:unit.id,quote:name}}))}
   if(r.kind==='scene')return {roster:hits(['北城','南巷']).map(({name,unit})=>({name,aliases:[],...(name==='南巷'?{parent:'北城'}:{}),evidence:{unitId:unit.id,quote:name}}))}
   if(r.kind==='item')return {roster:hits(['青铜钥匙']).map(({name,unit})=>({name,aliases:[],itemType:'信物',important:true,evidence:{unitId:unit.id,quote:name}}))}
   if(r.kind==='world')return {roster:hits(['北城']).slice(0,1).map(({unit})=>({name:'北城世界',aliases:[],settings:[{settingType:'SOCIETY' as const,name:'城制'}],evidence:{unitId:unit.id,quote:'北城'}}))}
  }
  if(r.phase==='review')return {conflicts:[]}
  if(r.intent==='reconcile')return {artifactEdits:[],conflicts:[]}
  return {notFound:true}
 }
}
export async function toRoster(f:Awaited<ReturnType<typeof fixture>>){const v=await toTree(f);await f.act('wizard-next',{consent:true});const done=await f.settle();void v;return done}


/** Entity results built from the request's own units, so evidence always locates. */
/** The candidate an entity request is for: the id right after 只导入id为. */
export const entityTarget=(r:ImportAiRequest)=>r.instruction!.match(/只导入id为([a-z]{1,2}-[0-9a-f]{16})/u)![1]
export const entityName=(r:ImportAiRequest)=>r.entities!.find(e=>e.id===entityTarget(r))!.name
export function entityResult(r:ImportAiRequest,facts:(id:string,name:string)=>Record<string,string>=()=>({})):ImportAiResult{
 const id=entityTarget(r),name=r.entities!.find(e=>e.id===id)!.name
 const unit=r.units.find(u=>u.text.includes(name))??r.units[0],quote=unit.text.includes(name)?name:unit.text.slice(0,Math.min(12,unit.text.length))
 const own=r.entities!.find(e=>e.id===id)!
 const base:Record<string,string>=r.kind==='character'?{roleType:'SUPPORTING'}:r.kind==='scene'?{entityType:'PLACE'}:r.kind==='world'?(own.entityType==='SETTING'?{entityType:'SETTING',worldId:own.worldId!,settingType:own.settingType!,content:JSON.stringify({text:name+'的设定。'})}:{entityType:'WORLD',...(own.parentId?{parentId:own.parentId}:{})}):{}
 return {artifacts:[{id,kind:r.kind!,name,text:name+'的资料。',facts:{...base,...facts(id,name)},evidence:[{unitId:unit.id,quote}],sourceUnitIds:[unit.id],origin:'inferred'}]}
}
export const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
export async function toImportChar(f:Awaited<ReturnType<typeof fixture>>){await toRoster(f);await f.act('wizard-next')}
/** Scene-only extraction through the same content and consent actions as the UI. */
export async function toSceneRoster(f:Awaited<ReturnType<typeof fixture>>){
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成场景作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle();await f.act('select',{selected:['body'],targets:['scene'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 await f.act('wizard-next',{consent:true});return f.settle()
}
export async function toImportScene(f:Awaited<ReturnType<typeof fixture>>){await toSceneRoster(f);await f.act('wizard-next')}


/** Drive past the character step with every candidate imported. */
export async function passCharacters(f:Awaited<ReturnType<typeof fixture>>){await toImportChar(f);return f.settle()}
export function relatingAi(base:Ai,relations:Record<string,string>={}):Ai{
 return async r=>{
  if(r.intent!=='entity')return base(r)
  const name=entityName(r)
  if(r.kind==='character')return entityResult(r,():Record<string,string>=>relations[name]?{relationships:JSON.stringify([{target:relations[name],description:'旧识',characterId:r.entities!.find(e=>e.name===relations[name])!.id}])}:{})
  if(r.kind==='scene'){const own=r.entities!.find(e=>e.id===entityTarget(r))!;return entityResult(r,():Record<string,string>=>own.parentId?{parentId:own.parentId}:{})}
  return entityResult(r)
 }
}


/** Two worlds, the second nested, each with settings; plus copied source settings. */
export function worldsAi(base:Ai):Ai{return async r=>{
 if(r.intent==='roster'&&r.kind==='world'){const u=r.units.find(u=>u.text.includes('北城'));return u?{roster:[{name:'北城世界',aliases:[],settings:[{settingType:'SOCIETY',name:'城制'},{settingType:'GEOGRAPHY',name:'山川'}],evidence:{unitId:u.id,quote:'北城'}},{name:'南巷梦境',aliases:[],parent:'北城世界',settings:[{settingType:'CULTURE',name:'梦俗'}],evidence:{unitId:u.id,quote:'北城'}}]}:{roster:[]}}
 if(r.intent==='entity')return entityResult(r)
 return base(r)
}}
export async function toWorldImport(f:Awaited<ReturnType<typeof fixture>>){
 for(let i=0;i<12;i++){const v=await f.settle();if(v.wizard!.step==='detect-world')return v;if(v.wizard!.stepState[v.wizard!.step]==='waiting')await f.act('wizard-next')}
 throw Error('未到达识别世界观')
}


/** Valid worldline / narrative / outline results over the request's units. */
export function linesAi(base:Ai):Ai{return async r=>{
 if(r.phase==='analyze'&&!r.intent&&r.kind==='worldline'){const u=r.units[0];return {artifacts:[{id:'ev-'+u.id.replace(/[^0-9a-z]/giu,''),kind:'worldline',name:'事件'+u.start,text:'发生了一件事。',facts:{lineId:'main',lineName:'主线',timeKind:'unknown',people:'[]',reliability:'客观事实'},evidence:[{unitId:u.id,quote:u.text.slice(0,8)}],sourceUnitIds:[u.id],origin:'inferred'}]}}
 if(r.phase==='analyze'&&!r.intent&&r.kind==='narrative'){const u=r.units[0],event=r.entities?.find(e=>e.kind==='worldline'),chapter=r.chapters!.findIndex(c=>u.start>=c.start&&u.start<c.end);if(!event)return {notFound:true};return {artifacts:[{id:'nar-'+u.id.replace(/[^0-9a-z]/giu,''),kind:'narrative',name:'讲述'+u.start,text:'讲述。',facts:{chapterIndex:String(chapter),order:'0',refs:JSON.stringify([{eventId:event.id,reliability:'客观事实'}]),reliability:'客观事实'},evidence:[{unitId:u.id,quote:u.text.slice(0,8)}],sourceUnitIds:[u.id],origin:'inferred'}]}}
 if(r.phase==='analyze'&&!r.intent&&r.kind==='outline'){const indices=[...new Set(r.chapters!.map((c,i)=>r.units.some(u=>u.start<c.end&&u.end>c.start)?i:-1).filter(i=>i>=0))],u=r.units[0];return {artifacts:indices.map(i=>({id:'detailed-'+i,kind:'outline' as const,name:'章级细纲'+i,text:'第'+i+'章细纲',facts:{chapterIndex:String(i)},evidence:[{unitId:u.id,quote:u.text.slice(0,8)}],sourceUnitIds:[u.id],origin:'inferred' as const}))}}
 return base(r)
}}
export async function toStep(f:Awaited<ReturnType<typeof fixture>>,target:string){
 for(let i=0;i<30;i++){const v=await f.settle();if(v.wizard!.step===target)return v;if(v.wizard!.stepState[v.wizard!.step]==='waiting'&&!v.wizard!.tasks.some(t=>t.state==='failed'))await f.act('wizard-next');else throw Error('卡在 '+v.wizard!.step+' '+(v.wizard!.stepError??v.error??''))}
 throw Error('未到达 '+target)
}


/** Touches: one PLANT in chapter 0 linked to the first event and its narrative, one unlocatable. */
export function touchesAi(base:Ai):Ai{return async r=>{
 if(r.intent!=='touches')return base(r)
 const events=r.entities?.filter(e=>e.kind==='worldline')??[],u=r.units.find(u=>u.text.includes('青铜钥匙'))
 if(!u||!events.length)return {touches:[]}
 const chapter=r.chapters!.findIndex(c=>u.start>=c.start&&u.start<c.end)
 const narrative=JSON.parse(r.instruction!.slice(r.instruction!.indexOf('[')) ) as {id:string;chapterIndex:number;eventIds:string[]}[]
 const nar=narrative.find(n=>n.chapterIndex===chapter&&n.eventIds.includes(events[0].id))
 return {touches:[
  {foreshadowKey:'青铜钥匙',title:'青铜钥匙',content:'钥匙的来历',touch:{kind:'PLANT',chapterIndex:chapter,summary:'拾起青铜钥匙',quote:'拾起青铜钥匙',eventId:events[0].id,...(nar?{narrativeId:nar.id}:{})},evidence:{unitId:u.id,quote:'青铜钥匙'}},
  {foreshadowKey:'青铜钥匙',title:'青铜钥匙',content:'',touch:{kind:'MENTION',chapterIndex:chapter,summary:'不存在',quote:'这句话不在原文里',eventId:'missing'},evidence:{unitId:u.id,quote:'青铜钥匙'}},
 ]}
}}


export const fullAi=(f:Awaited<ReturnType<typeof fixture>>)=>touchesAi(linesAi(worldsAi(f.handler())))
export async function toVerify(f:Awaited<ReturnType<typeof fixture>>){await toTree(f);await f.act('wizard-next',{consent:true});return toStep(f,'verify').then(()=>f.settle())}

/** Inject a fault into the live draft. An unsaved draft is deleted on restart, so instead of restarting on an
 * edited journal: pause it in place as closing used to, edit session.json, check the controller would accept it, and adopt it in place. */
export async function injectJournalEdit(f:Awaited<ReturnType<typeof fixture>>,edit:(j:ImportSession)=>void){
 await f.controller.pauseAll();const v=await f.view(),path=join(f.root,'novel-imports',v.id,'session.json')
 const j=JSON.parse(await readFile(path,'utf8')) as ImportSession;edit(j);await writeFile(path,JSON.stringify(j))
 const c=f.controller as unknown as {session:ImportSession;validJournal(j:unknown,id:string):boolean}
 assert.ok(c.validJournal(structuredClone(j),v.id),'edited journal must still be one the controller accepts');c.session=j;return f.controller
}
export async function verifyAgain(c:NovelImportController){let v=(await c.act({type:'current'})).view!;if(v.phase==='paused'){await c.act({type:'resume',id:v.id,revision:v.revision,consent:true});for(let i=0;i<2000&&c.active;i++)await sleep(5);v=(await c.act({type:'current'})).view!}return v}

/** A minimal valid PNG (1×1) and a fake image generator that records prompts. */
export const PNG=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000'+'1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082','hex')
export const imageModel:ImportModel={id:'image',name:'受控图像模型',modelId:'synthetic-image',endpoint:'https://image.invalid/v1',authRevision:1,contextWindow:0}
export function imageFake(over:Partial<{fail:(prompt:string)=>Error|undefined;bytes:Buffer;mime:string;delay:number}>={}){
 const calls:{prompt:string;sizes?:readonly string[]}[]=[];let running=0,max=0
 return {calls,get max(){return max},generate:async(_m:ImportModel,prompt:string,sizes:readonly string[]|undefined,signal:AbortSignal)=>{calls.push({prompt,sizes});running++;max=Math.max(max,running);try{await new Promise<void>((r,j)=>{const timer=setTimeout(r,over.delay??10);signal.addEventListener('abort',()=>{clearTimeout(timer);j(signal.reason)},{once:true})});signal.throwIfAborted();const error=over.fail?.(prompt);if(error)throw error;return {bytes:new Uint8Array(over.bytes??PNG),mime:over.mime??'image/png'}}finally{running--}}}
}
