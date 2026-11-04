import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import {runImportAi,generateImportAiJson,type ImportAiDependencies} from '../../desktop/service/novel-import-ai'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {selectWizardWorld,wizardCandidateId,worldRosterTaken,WIZARD_MAIN_WORLD_ID,type WizardCandidate} from '../../desktop/core/novel-import-wizard'
import {buildWizardCandidates,type WizardRosterStashEntry} from '../../desktop/core/novel-import-wizard-roster'
import {emptyWizardState,validateImportWizardState} from '../../desktop/core/novel-import-wizard-state'
import type {ImportAiRequest,ImportArtifact,ImportModel} from '../../desktop/shared/novel-import'

/* docs/504. Synthetic names only; the blacklist below is the only place novel-specific words appear. */
const model:ImportModel={id:'text',name:'合成模型',modelId:'synthetic',endpoint:'https://world.invalid/v1',authRevision:1,contextWindow:1048576}
const text='合成原文首句。\n合成原文次句。'
const request=(intent:'roster'|'entity',kind:ImportAiRequest['kind'],units=[{id:'u1',fileId:'f',start:0,end:text.length,text,kind:'body' as const}]):ImportAiRequest=>({semanticVersion:1,operationId:'33333333-3333-4333-8333-333333333333',phase:'analyze',intent,kind,units,artifacts:[],entities:[],workingRevision:0,models:{text:model}} as ImportAiRequest)
const contract=(prompt:string)=>/<phase-output-contract>([\s\S]*?)<\/phase-output-contract>/u.exec(prompt)?.[1]??''
const sha=(value:string)=>createHash('sha256').update(value).digest('hex')

test('WR-P01: the world roster contract defines a world and its hierarchy',()=>{
 const c=contract(importAiPrompt(request('roster','world')))
 for(const words of ['共同遵守','法则','等级体系','历史','通常只有一个主世界','不是世界','人物不列','parent','parallel','子世界','平行世界','"主世界"','settings','FACTION','WORLD_HISTORY'])assert.ok(c.includes(words),words)
 for(const kind of ['国家','组织','势力','纪元','概念','人物','地点'])assert.ok(c.includes(kind),kind)
})
test('WR-P02: character and scene roster prompts keep the b26975f baseline; world and item moved',()=>{
 const baseline={character:'6ffb4c39c663af39b401d6c9265e372a0f8baf24995ca0eb88c6b4a9850894f7',scene:'14c60245232033c0c696c5364bf55638176dcfad4c3b3441661f1e6970c832aa',world:'40874cb4e655f1540076fed82ff6ccc69b5b099fb67f0d98fa8ded83c258e724',item:'5b85aa0fb6e7e13e4262f41c76d3e185c02be1e98dedf56809d782c5d1789fc5'}
 for(const [kind,hash] of Object.entries(baseline))assert.equal(sha(importAiPrompt(request('roster',kind as ImportAiRequest['kind']))),hash,kind)
 assert.notEqual(baseline.world,'c677627093af52e8245a3c4810c4e316a5afc8a7f1872db8127c5325563c7377')
})
// Words from the user's screenshots and one specific novel. They must never appear in a prompt.
const BLACKLIST=['封印物','途径','序列','魔药','非凡','值夜者','鲁恩','因蒂斯','第五纪','第四纪','第一纪','灵视','扮演','老尼尔','黑荆棘','密修会','灰雾','诡秘']
test('WR-P03: no import roster or entity prompt names a concrete novel setting',()=>{
 for(const kind of ['character','scene','item','world'] as const)for(const intent of ['roster','entity'] as const){
  const r=request(intent,kind);if(intent==='entity')Object.assign(r,{entityTarget:{id:'x-1',aliases:[],...(kind==='character'?{roleType:'SUPPORTING'}:{})},entities:[{id:'x-1',kind,name:'甲',...(kind==='scene'?{entityType:'PLACE'}:kind==='world'?{entityType:'WORLD'}:{})}]})
  const prompt=importAiPrompt(r);for(const word of BLACKLIST)assert.ok(!prompt.includes(word),`${intent} ${kind}: ${word}`)
 }
})
test('WR-P04: the item contract keeps its category definition',()=>{
 const c=contract(importAiPrompt(request('roster','item')))
 for(const words of ['category','可被持有','organization','concept','itemType'])assert.ok(c.includes(words),words)
})

const units=[{id:'u1',fileId:'f',start:0,end:10,text:'甲会的人走进城。',kind:'body' as const},{id:'u2',fileId:'f',start:10,end:20,text:'乙界之门开了。',kind:'body' as const}]
const run=(raw:unknown)=>runImportAi(request('roster','world',units),new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)} as ImportAiDependencies)
test('WR-S01: a world named nowhere is located by one of its settings',async()=>{
 const out=await run({roster:[{name:'主世界',aliases:[],settings:[{settingType:'FACTION',name:'甲会'}]}]})
 assert.deepEqual(out.roster,[{name:'主世界',aliases:[],settings:[{settingType:'FACTION',name:'甲会'}],evidence:{unitId:'u1',quote:'甲会'}}])
})
test('WR-S02: a world whose name and settings are all absent is dropped',async()=>{
 assert.deepEqual((await run({roster:[{name:'主世界',aliases:[],settings:[{settingType:'FACTION',name:'无此会'}]}]})).roster,[])
})
test('WR-S03: parallel is an optional boolean',async()=>{
 assert.equal((await run({roster:[{name:'乙界',aliases:[],parallel:true,settings:[]}]})).roster![0].parallel,true)
 await assert.rejects(run({roster:[{name:'乙界',aliases:[],parallel:'yes',settings:[]}]}))
})
test('WR-S04: a located world name keeps its own evidence',async()=>{
 assert.deepEqual((await run({roster:[{name:'乙界',aliases:[],settings:[{settingType:'FACTION',name:'甲会'}]}]})).roster![0].evidence,{unitId:'u2',quote:'乙界'})
})

type Setting={settingType:NonNullable<WizardRosterStashEntry['settings']>[number]['settingType'];name:string}
const e=(name:string,settings:Setting[]=[],extra:Partial<WizardRosterStashEntry>={}):WizardRosterStashEntry=>({name,aliases:[],settings,...extra})
const f=(name:string):Setting=>({settingType:'FACTION',name}),h=(name:string):Setting=>({settingType:'WORLD_HISTORY',name}),k=(name:string):Setting=>({settingType:'CONCEPT',name})
const ch=[{content:'甲国乙会丙纪丁念'}]
const build=(entries:WizardRosterStashEntry[],sources:ImportArtifact[]=[],taken=new Set<string>())=>buildWizardCandidates('world',entries,sources,ch,taken)
const worldsOf=(list:WizardCandidate[])=>list.filter(c=>c.kind==='world')
const settingsOf=(list:WizardCandidate[],id:string)=>list.filter(c=>c.kind==='world-setting'&&c.parentId===id).map(c=>c.name).sort()

test('WR-B01: entries without parent merge into one fixed-id main world',()=>{
 const list=build([e('甲国',[f('乙会')]),e('丙纪',[h('丙纪')]),e('丁念',[k('丁念')])])
 assert.equal(worldsOf(list).length,1);assert.equal(worldsOf(list)[0].id,WIZARD_MAIN_WORLD_ID)
 assert.deepEqual(settingsOf(list,WIZARD_MAIN_WORLD_ID),['丁念','丙纪','乙会'])
})
test('WR-B02: the main world takes its most used name; 主世界 only when nothing else',()=>{
 const main=worldsOf(build([e('甲国'),e('戊界'),e('戊界'),e('主世界'),e('主世界'),e('主世界')]))[0]
 assert.equal(main.name,'戊界');assert.deepEqual(main.aliases.sort(),['甲国'])
 assert.equal(worldsOf(build([e('主世界',[f('乙会')])]))[0].name,'主世界')
})
test('WR-B03: character-named entries give settings but no name',()=>{
 const list=build([e('林舟',[f('乙会')],{aliases:['舟哥']}),e('戊界')],[],new Set(['林舟','舟哥']))
 const main=worldsOf(list)[0];assert.equal(worldsOf(list).length,1);assert.equal(main.name,'戊界');assert.deepEqual(main.aliases,[])
 assert.deepEqual(settingsOf(list,main.id),['乙会'])
})
test('WR-B04: a child world named like a setting stays a setting of the main world',()=>{
 const list=build([e('戊界',[f('甲国')]),e('甲国',[f('乙会')],{parent:'戊界'})])
 assert.equal(worldsOf(list).length,1);assert.deepEqual(settingsOf(list,WIZARD_MAIN_WORLD_ID),['乙会','甲国'])
})
test('WR-B05: child parents resolve through every main world name',()=>{
 const many=Array.from({length:60},(_,i)=>e('名'+i)),list=build([...many,e('名0'),e('子一',[],{parent:'主世界'}),e('子二',[],{parent:'名3'}),e('子三',[],{parent:'名58'})])
 for(const name of ['子一','子二','子三'])assert.equal(list.find(c=>c.name===name)!.parentId,WIZARD_MAIN_WORLD_ID,name)
})
test('WR-B06: a child world parent is decided by vote',()=>{
 const list=build([e('戊界'),e('子一',[],{parent:'甲梦',parallel:false}),e('甲梦',[],{parallel:true}),e('子一',[],{parent:'戊界'}),e('子一',[],{parent:'戊界'})])
 assert.equal(list.find(c=>c.name==='子一')!.parentId,WIZARD_MAIN_WORLD_ID)
})
test('WR-B07: a parent cycle is broken onto the main world',()=>{
 const list=build([e('戊界'),e('子一',[],{parent:'子二'}),e('子二',[],{parent:'子一'})])
 for(const name of ['子一','子二'])assert.equal(list.find(c=>c.name===name)!.parentId,WIZARD_MAIN_WORLD_ID,name)
 assert.doesNotThrow(()=>selectWizardWorld(list,WIZARD_MAIN_WORLD_ID,false))
})
test('WR-B08: parallel worlds stay top level unless they share a main world name',()=>{
 const list=build([e('戊界',[f('乙会')]),e('己界',[k('丁念')],{parallel:true}),e('戊界',[h('丙纪')],{parallel:true})])
 const ws=worldsOf(list);assert.equal(ws.length,2);assert.ok(ws.every(w=>!w.parentId))
 assert.deepEqual(settingsOf(list,WIZARD_MAIN_WORLD_ID),['丙纪','乙会'])
})
test('WR-B09: without main entries no main world is built',()=>{
 const list=build([e('子一',[f('乙会')],{parent:'无名'})])
 assert.deepEqual(worldsOf(list).map(w=>[w.name,w.parentId]),[['子一',undefined]])
})
test('WR-B10: one setting per world; its type is the majority vote',()=>{
 const list=build([e('戊界',[k('乙会')]),e('戊界',[f('乙会')]),e('甲国',[f('乙会')]),e('甲国',[{settingType:'SOCIETY',name:'丙纪'},h('丙纪')])])
 const s=list.filter(c=>c.kind==='world-setting');assert.deepEqual(s.map(c=>[c.name,c.settingType]).sort(),[['丙纪','SOCIETY'],['乙会','FACTION']])
})
test('WR-B11: main world and setting ids do not follow the winning name',()=>{
 const a=build([e('甲国',[f('乙会')])]),b=build([e('戊界',[f('乙会')]),e('戊界'),e('甲国')])
 assert.equal(worldsOf(a)[0].name,'甲国');assert.equal(worldsOf(b)[0].name,'戊界')
 assert.deepEqual(a.filter(c=>c.kind==='world-setting').map(c=>c.id),b.filter(c=>c.kind==='world-setting').map(c=>c.id))
})
const source=(text:string):ImportArtifact=>({id:'a-world',kind:'world',name:'世界观.md',text,facts:{},evidence:[],sourceUnitIds:[],origin:'source'} as unknown as ImportArtifact)
test('WR-B12: a single source world absorbs the body main world',()=>{
 const neutral=build([e('戊界',[f('乙会')])],[source('## 风俗\n上元灯会。\n')]),ws=worldsOf(neutral)
 assert.equal(ws.length,1);assert.equal(ws[0].name,'戊界');assert.deepEqual(ws[0].sourceArtifactIds,['a-world']);assert.deepEqual(settingsOf(neutral,ws[0].id),['乙会','风俗'])
 const named=build([e('戊界',[f('乙会')])],[source('# 庚界\n## 风俗\n上元灯会。\n')]),wn=worldsOf(named)
 assert.equal(wn.length,1);assert.equal(wn[0].name,'庚界');assert.deepEqual(settingsOf(named,wn[0].id),['乙会','风俗'])
})
test('WR-B13: old stash entries and drafts with parallel are read',()=>{
 assert.equal(worldsOf(build([{name:'戊界',aliases:[],settings:[f('乙会')]} as WizardRosterStashEntry])).length,1)
 const state=emptyWizardState();state.rosterStash={world:[{name:'戊界',aliases:[],parallel:true,settings:[]}]}
 assert.doesNotThrow(()=>validateImportWizardState({wizardVersion:1,wizard:state}))
})
test('WR-M01: the world taken set holds selected characters only',()=>{
 const base={chapterCount:0,sources:['body' as const],sourceArtifactIds:[]}
 const taken=worldRosterTaken({candidates:{character:[{...base,id:'c-1',kind:'character',name:'林舟',aliases:['舟哥'],selected:true},{...base,id:'c-2',kind:'character',name:'顾三',aliases:[],selected:false}],scene:[{...base,id:'s-1',kind:'scene',name:'北城',aliases:[],selected:true}]}})
 assert.deepEqual([...taken].sort(),['林舟','舟哥'].sort())
 assert.notEqual(WIZARD_MAIN_WORLD_ID,wizardCandidateId('world','主世界'))
})
test('WR-S05: a world setting with a wrong content shape gets one correction round',async()=>{
 const target={id:'ws-1',aliases:[]},entities=[{id:'w-1',kind:'world' as const,name:'戊界',entityType:'WORLD' as const},{id:'ws-1',kind:'world' as const,name:'乙会',entityType:'SETTING' as const,worldId:'w-1',settingType:'POWER_SYSTEM' as const}]
 const r={...request('entity','world',units),entityTarget:target,entities} as ImportAiRequest
 const artifact=(content:string)=>({artifacts:[{id:'ws-1',kind:'world',name:'乙会',text:'乙会的力量。',facts:{entityType:'SETTING',worldId:'w-1',settingType:'POWER_SYSTEM',content},evidence:[{unitId:'u1',quote:'甲会的人'}],sourceUnitIds:['u1'],origin:'inferred'}]})
 const replies=[artifact(JSON.stringify({text:'甲',levels:[]})),artifact(JSON.stringify({text:'乙会的力量。'}))];let calls=0
 const out=await runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:'world-synthetic-user',resolvedModel:{} as ResolvedModel,maxNetworkRetries:0},signal,prompt,{generateText:async()=>({text:JSON.stringify(replies[Math.min(calls++,1)]),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})} as ImportAiDependencies)
 assert.equal(calls,2);assert.equal(JSON.parse(out.artifacts![0].facts.content).text,'乙会的力量。')
})

import {fixture,filesF,rosterAi,toTree,injectJournalEdit} from '../helpers/novel-import-wizard-fixture'
test('WR-M04: an unfinished roster reply is re-run on the same units and the step succeeds',async()=>{
 let fail=1
 const f=await fixture(filesF(),rosterAi({'roster:character':()=>{if(fail>0){fail--;throw Error('模型输出未完整结束')}return undefined}}));try{
  await toTree(f);await f.act('wizard-next',{consent:true});const v=await f.settle()
  assert.equal(v.wizard!.stepState['detect-char'],'waiting',v.wizard!.stepError);assert.equal(v.wizard!.candidates.character!.length,3)
 }finally{await f.dispose()}
})
test('WR-M05: a unit that keeps failing ends the step after bounded attempts',async()=>{
 let calls=0
 const f=await fixture(filesF(),rosterAi({'roster:character':()=>{calls++;throw Error('模型输出未完整结束')}}));try{
  await toTree(f);await f.act('wizard-next',{consent:true});const v=await f.settle()
  assert.equal(v.wizard!.stepState['detect-char'],'failed');assert.equal(v.wizard!.stepError,'模型输出未完整结束');assert.ok(calls>1&&calls<=f.requests.filter(r=>r.intent==='roster'&&r.kind==='character').length,String(calls))
 }finally{await f.dispose()}
})
test('WR-B14: country, era and concept names that are also settings never name the main world',()=>{
 const list=build([e('甲国',[f('甲国'),f('乙会')]),e('丙纪',[h('丙纪')]),e('甲国',[k('丁念')])]),main=worldsOf(list)[0]
 assert.equal(main.name,'主世界');assert.deepEqual(main.aliases,[])
 const demoted=build([e('戊界',[f('甲国')]),e('甲国',[f('乙会')],{parent:'戊界',aliases:['甲邦']})])
 assert.equal(worldsOf(demoted)[0].name,'戊界');assert.deepEqual(worldsOf(demoted)[0].aliases,[])
})
test('WR-B15: parent votes count different names of one world together',()=>{
 const list=build([e('戊界',[],{aliases:['戊']}),e('庚界',[],{parallel:true}),e('子一',[],{parent:'庚界'}),e('子一',[],{parent:'庚界'}),e('子一',[],{parent:'戊'}),e('子一',[],{parent:'戊界'}),e('子一',[],{parent:'主世界'})])
 assert.equal(list.find(c=>c.name==='子一')!.parentId,WIZARD_MAIN_WORLD_ID)
})
test('WR-B16: a single source world takes child worlds when the body has no main entries',()=>{
 const list=build([e('子一',[f('乙会')],{parent:'无名'})],[source('# 庚界\n## 风俗\n上元灯会。\n')]),top=worldsOf(list).find(w=>!w.parentId)!
 assert.equal(top.name,'庚界');assert.equal(list.find(c=>c.name==='子一')!.parentId,top.id)
 const renamed=build([e('戊界',[f('乙会')])],[source('## 风俗\n上元灯会。\n')]);assert.ok(worldsOf(renamed)[0].aliases.includes('世界'),'the source container name stays an alias')
})
test('WR-B17: parallel wins over a parent; unresolvable parent names do not vote',()=>{
 const p=build([e('戊界'),e('庚界',[],{parallel:true,parent:'戊界'})]);assert.equal(p.find(c=>c.name==='庚界')!.parentId,undefined)
 const v=build([e('戊界'),e('庚界',[],{parallel:true}),...['甲','乙','丙'].map(x=>e('子一',[],{parent:x+'无'})),e('子一',[],{parent:'庚界'}),e('子一',[],{parent:'庚界'})])
 assert.equal(v.find(c=>c.name==='子一')!.parentId,v.find(c=>c.name==='庚界')!.id)
})
test('WR-B18: a source setting type overrides the body vote; source world id is the candidate id',()=>{
 const list=build([e('戊界',[f('风俗')]),e('戊界',[f('风俗')])],[source('## 风俗\n上元灯会。\n')])
 assert.equal(list.find(c=>c.name==='风俗')!.settingType,'CULTURE');assert.equal(worldsOf(list)[0].id,wizardCandidateId('world','世界'))
})

import {entityResult,entityName} from '../helpers/novel-import-wizard-fixture'
type Fx=Awaited<ReturnType<typeof fixture>>
/** Body only, world target only: the wizard goes tree → detect-world. */
async function toWorldRoster(f:Fx){
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成世界作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle();await f.act('select',{selected:['body'],targets:['world'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 await f.act('wizard-next',{consent:true});return f.settle()
}
// An unnamed main world, named only through its settings 城制 and 山川; the body names 北城.
const unnamed=(over:(r:ImportAiRequest)=>import('../../desktop/shared/novel-import').ImportAiResult|undefined=()=>undefined)=>rosterAi({'roster:world':r=>over(r)??(()=>{const u=r.units.find(u=>u.text.includes('北城'));return u?{roster:[{name:'主世界',aliases:[],settings:[{settingType:'SOCIETY' as const,name:'城制'},{settingType:'GEOGRAPHY' as const,name:'山川'}],evidence:{unitId:u.id,quote:'北城'}}]}:{roster:[]}})()})
const withEntities=(f:Fx,seen:string[]=[])=>{const base=f.handler();f.setAi(async r=>{if(r.intent==='entity'){if(r.kind==='world')seen.push(entityName(r));return entityResult(r)}return base(r)});return seen}
test('WR-M02: a main world named 主世界 imports from its cited units',async()=>{
 const f=await fixture(filesF(),unnamed());const seen=withEntities(f)
 try{
  let v=await toWorldRoster(f);assert.equal(v.wizard!.step,'detect-world',v.wizard!.stepError)
  const main=v.wizard!.candidates.world!.find(c=>c.kind==='world')!;assert.equal(main.name,'主世界');assert.ok(main.evidenceUnitIds?.length,'cited units recorded')
  await f.act('wizard-next');v=await f.settle()
  assert.ok(seen.includes('主世界'),seen.join(','));const task=v.wizard!.tasks.find(t=>t.candidateId===main.id)!;assert.equal(task.state,'done',task.error)
 }finally{await f.dispose()}
})
test('WR-M03: unchecked main world settings stay unchecked after redetect',async()=>{
 const f=await fixture(filesF(),unnamed());withEntities(f)
 try{
  let v=await toWorldRoster(f);const off=v.wizard!.candidates.world!.find(c=>c.name==='山川')!
  await f.act('wizard-select-candidates',{kind:'world',ids:[off.id],selected:false})
  const j=await f.journal();delete j.coverage['roster:world'];await injectJournalEdit(f,x=>{delete x.coverage['roster:world']})
  await f.act('wizard-redetect');v=await f.settle()
  const again=v.wizard!.candidates.world!.find(c=>c.name==='山川')!;assert.equal(again.id,off.id);assert.equal(again.selected,false)
 }finally{await f.dispose()}
})
test('WR-M06: a non-retryable roster error ends the step at once',async()=>{
 let calls=0
 const f=await fixture(filesF(),unnamed(()=>{calls++;throw Error('模型接口请求失败（HTTP 400）')}));try{
  const v=await toWorldRoster(f)
  assert.equal(v.wizard!.stepState['detect-world'],'failed');assert.equal(calls,f.requests.filter(r=>r.intent==='roster'&&r.kind==='world').length)
 }finally{await f.dispose()}
})
test('WR-M07: a malformed world reply is re-sent; every unit ends covered and the step succeeds',async()=>{
 let first=true
 const f=await fixture(filesF(),unnamed(()=>{if(first){first=false;throw Error('模型返回结构不完整（roster.0.settings）')}return undefined}));try{
  const v=await toWorldRoster(f);assert.equal(v.wizard!.stepState['detect-world'],'waiting',v.wizard!.stepError)
  const covered=new Set((await f.journal()).coverage['roster:world']),sent=f.requests.filter(r=>r.intent==='roster'&&r.kind==='world')
  assert.ok(sent.length>=2,'re-sent');assert.ok(sent.every(r=>r.units.every(u=>covered.has(u.id))))
 }finally{await f.dispose()}
})
