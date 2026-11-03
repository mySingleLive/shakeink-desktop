// Compatibility: controller cases here use genuine versionless scene journals.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {importGenerationModel,runImportAi} from '../../desktop/service/novel-import-ai'
import {importNativeMappings} from '../../desktop/core/novel-import-semantic-state'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportArtifact} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {legacySceneFixture,source,rosterAi,entityResult,toImportScene,model} from '../helpers/novel-import-wizard-fixture'

test('SP-01: scene extraction uses the light model policy without changing saved configuration or ordinary analysis',()=>{
 const resolved={model:{},modelRecord:{},providerOptions:{deepseek:{thinking:{type:'enabled'}},openai:{store:false},original:{kept:true}}} as unknown as ResolvedModel,saved={provider:'deepseek',protocol:'openai',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'},before=structuredClone(saved),options=structuredClone(resolved.providerOptions)
 const request={semanticVersion:1,phase:'analyze',intent:'entity',kind:'scene'} as ImportAiRequest,out=importGenerationModel(request,resolved,saved)
 assert.deepEqual(out.providerOptions,{...options,deepseek:{thinking:{type:'disabled'}}});assert.equal(out.model,resolved.model);assert.deepEqual(resolved.providerOptions,options);assert.deepEqual(saved,before)
 // Item entity extraction shares the light policy since docs/493; IP-03 covers it.
 for(const r of [{...request,intent:undefined},{...request,intent:'reconcile'},{...request,phase:'review'},{...request,kind:'world'},{...request,semanticVersion:undefined}])assert.equal(importGenerationModel(r as ImportAiRequest,resolved,saved),resolved)
})
test('SP-05: only absent scene control metadata is supplied from the trusted target; explicit wrong values stay rejected',async()=>{
 const text='合成房间有灯火。',own={id:'s-room',kind:'scene' as const,name:'合成房间',entityType:'PLACE' as const,parentId:'s-parent'},request:ImportAiRequest={semanticVersion:1,operationId:'sp-control',phase:'analyze',intent:'entity',kind:'scene',entityTarget:{id:own.id,aliases:[]},entities:[own,{id:'s-parent',kind:'scene',name:'父城',entityType:'PLACE'},{id:'s-other',kind:'scene',name:'另一父城',entityType:'PLACE'}],units:[{id:'u-room',fileId:'f',start:0,end:text.length,text,kind:'body'}],artifacts:[],workingRevision:0,models:{text:model}}
 const facts={exteriorDescription:'窗',interiorDescription:'灯',backstory:'旧屋',entryMethod:'门'},actor={id:own.id,kind:'scene',name:own.name,text:'合成房间有灯火。',facts,evidence:[{unitId:'u-room',quote:text}],origin:'inferred'}
 let calls=0;const run=(r:ImportAiRequest,value:unknown)=>runImportAi(r,new AbortController().signal,{resolve:async()=>{calls++;return model},assert:async()=>{},generate:async()=>structuredClone(value)})
 const prompt=importAiPrompt(request,'{}');assert.ok(!prompt.includes('characterId'));assert.ok(!prompt.includes('itemId'))
 const withCharacter={...request,entities:[...request.entities!,{id:'c-known',kind:'character' as const,name:'合成角色'}]};assert.ok(importAiPrompt(withCharacter,'{}').includes('characterId'))
 const contextCharacter:ImportArtifact={id:'c-context',kind:'character',name:'上下文角色',text:'合成记录',facts:{roleType:'SUPPORTING'},evidence:actor.evidence,sourceUnitIds:['u-room'],origin:'inferred'};assert.ok(importAiPrompt({...request,artifacts:[contextCharacter]},'{}').includes('characterId'))
 const result=await run(request,{artifacts:[actor]});assert.deepEqual(result.artifacts![0].facts,{entityType:'PLACE',parentId:'s-parent',...facts});assert.equal(result.artifacts![0].text,actor.text);assert.deepEqual(result.artifacts![0].evidence,actor.evidence)
 assert.equal((await run(withCharacter,{artifacts:[{...actor,facts:{...facts,characterId:'c-known'}}]})).artifacts![0].facts.characterId,'c-known')
 for(const patch of [{entityType:'WORLD'},{entityType:null},{entityType:''},{parentId:'s-other'},{parentId:'foreign'},{parentId:null},{parentId:''}])await assert.rejects(run(request,{artifacts:[{...actor,facts:{...facts,...patch}}]}))
 for(const malformed of [undefined,null,[],1,'bad'])await assert.rejects(run(request,{artifacts:[{...actor,facts:malformed}]}))
 const {parentId:_parent,...rootOwn}=own,root={...request,entities:[rootOwn,...request.entities!.slice(1)]}
 const top=await run(root,{artifacts:[actor]});assert.deepEqual(top.artifacts![0].facts,{entityType:'PLACE',...facts});assert.ok(!Object.hasOwn(top.artifacts![0].facts,'parentId'))
 await assert.rejects(run(root,{artifacts:[{...actor,facts:{...facts,parentId:'s-parent'}}]}))
 await assert.rejects(run({...request,intent:undefined,entityTarget:undefined},{artifacts:[{...actor,sourceUnitIds:['u-room']}]}))
 calls=0;await assert.rejects(run({...request,entities:[{...own,entityType:'WORLD'} as never,...request.entities!.slice(1)]},{artifacts:[actor]}));assert.equal(calls,0,'non-PLACE targets fail before model resolution')
 const {entityType:_type,...withoutType}=own;calls=0;await assert.rejects(run({...request,entities:[withoutType,...request.entities!.slice(1)]},{artifacts:[actor]}));assert.equal(calls,0,'missing target type fails before model resolution')
})
test('SP-02: scene prompts keep related aliases and all ancestors while validation keeps the complete catalog and material',async()=>{
 const names=Array.from({length:33},(_,i)=>'合成地点'+String.fromCharCode(0x7532+i)),aliases=names.map((_,i)=>'合成别称'+String.fromCharCode(0x7532+i)),body=names.map((name,i)=>`第${i+1}章 地点${i}\n\n${name}又称${aliases[i]}，有一扇门。${i===0?'听说'+aliases[20]+'。':''}${'风声。'.repeat(160)}\n\n`).join('')
 const f=await legacySceneFixture([source(body,'正文.txt','f-body')],rosterAi({'roster:scene':r=>({roster:r.units.flatMap(u=>names.filter(name=>u.text.includes(name)).map(name=>{const i=names.indexOf(name);return {name,aliases:[aliases[i]],...(i<32?{parent:names[i===31?32:31]}:{}),evidence:{unitId:u.id,quote:name}}}))})})),base=f.handler(),expected=new Map<string,ImportArtifact>()
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);const own=r.entities!.find(e=>e.id===r.entityTarget!.id)!,raw=entityResult(r,()=>({...own.parentId?{parentId:own.parentId}:{},exteriorDescription:'合成外观-'+own.id,interiorDescription:'合成室内-'+own.id,backstory:'合成背景-'+own.id,entryMethod:'合成入口-'+own.id}));expected.set(own.id,structuredClone(raw.artifacts![0]));return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})})
 try{await toImportScene(f);const v=await f.settle(),s=await f.journal(),list=s.wizard!.candidates.scene!;assert.equal(v.wizard!.step,'verify');assert.equal(list.length,33);let filtered=false,ancestorAdded=false,aliasOnlyKept=false
  for(const r of f.requests.filter(r=>r.intent==='entity')){
   assert.equal(r.entities!.length,33);assert.deepEqual(r.entities!.map(e=>e.id).sort(),list.map(c=>c.id).sort())
   const own=list.find(c=>c.id===r.entityTarget!.id)!,want=s.workingUnits!.filter(u=>[own.name,...own.aliases].some(n=>u.text.includes(n)))
   assert.deepEqual(r.units.map(u=>u.id),want.map(u=>u.id));for(const u of r.units)assert.equal(u.text,s.workingProse.slice(u.start,u.end))
   const prose=r.units.map(u=>u.text).join(''),ids=new Set(list.filter(c=>c.id===own.id||[c.name,...c.aliases].some(n=>prose.includes(n))).map(c=>c.id)),direct=ids.size
   let changed=true;while(changed){changed=false;for(const c of list)if(ids.has(c.id)&&c.parentId&&!ids.has(c.parentId)){ids.add(c.parentId);changed=true}}
   ancestorAdded||=ids.size>direct;const catalog=JSON.parse(r.instruction!.slice(r.instruction!.indexOf('['))) as {id:string}[];assert.deepEqual(catalog.map(c=>c.id).sort(),[...ids].sort());filtered||=catalog.length<list.length
   if(prose.includes(aliases[20])&&!prose.includes(names[20])){assert.ok(catalog.some(c=>c.id===list.find(c=>c.name===names[20])!.id));aliasOnlyKept=true}
   assert.ok(r.entityTarget!.evidenceOptions!.every(e=>r.units.some(u=>u.id===e.unitId&&u.text.includes(e.quote))))
  }
  assert.ok(filtered);assert.ok(ancestorAdded);assert.ok(aliasOnlyKept);assert.equal(importNativeMappings(s).projectableIds.length,33);assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));assert.deepEqual(s.wizard!.dropped,[]);assert.deepEqual(s.wizard!.skipped,[])
  for(const a of s.artifacts){const original=expected.get(a.id)!;assert.deepEqual(a.facts,original.facts);assert.equal(a.text,original.text);assert.deepEqual(a.evidence,original.evidence);assert.deepEqual(a.sourceUnitIds,original.sourceUnitIds)}
 }finally{await f.dispose()}
})
