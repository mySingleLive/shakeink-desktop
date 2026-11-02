import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import type {ImportAiRequest,ImportModel,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

// 487 §B2–B4/B7, C5b, C9, C10, D1–D3. Synthetic places only.
const core=()=>import('../../desktop/core/novel-import-scene-identity')
const unit=(id:string,text:string,start=0):ImportUnit=>({id,fileId:'working-0',start,end:start+text.length,text,kind:'body'})
const sources=(units:ImportUnit[])=>({workingRevision:0,workingUnits:units,sourceBlocks:[]})
const row=(u:ImportUnit,literal:string,quote:string,label?:string,links:{targetIndex:number;relation:'same-place'|'different-place'|'parent';evidence:{unitId:string;quote:string}[]}[]=[])=>({name:literal,aliases:[],mentions:[{literal,evidence:{unitId:u.id,quote}}],context:label?[{label,evidence:[{unitId:u.id,quote}]}]:[],links})
const model:ImportModel={id:'text',name:'受控文本模型',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:1048576}

test('D1: a new identity is named by its literal only; the context stays in the ledger and label can still combine it',async()=>{
 const api=await core(),u=unit('d1','北岸的青石镇有灯塔。'),s=sources([u]),l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[row(u,'青石镇',u.text,'北岸')],[u],s),c=api.buildSceneWizardCandidates(l)[0]
 assert.equal(c.name,'青石镇');assert.ok(!c.name.includes('·'));assert.equal(l.records[0].context[0].label,'北岸')
 const labelled=api.applySceneIdentityChange(l,{op:'label',identityId:c.id,expectedLedgerHash:l.ledgerHash,explanation:'采用原文限定',nameParts:[{kind:'context',key:l.records[0].context[0].key},{kind:'literal',key:l.members[0].key}]},s)
 assert.equal(api.buildSceneWizardCandidates(labelled)[0].name,'北岸·青石镇')
})

test('D2: an author label survives a regroup caused by an unrelated append; the new identity uses its literal',async()=>{
 const api=await core(),u=unit('d2a','北岸的青石镇有灯塔。'),v=unit('d2b','南岸的乙港有仓库。',100),s=sources([u,v])
 let l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[row(u,'青石镇',u.text,'北岸')],[u],s);const id=l.identities[0].id,parts=[{kind:'context' as const,key:l.records[0].context[0].key},{kind:'literal' as const,key:l.members[0].key}]
 l=api.applySceneIdentityChange(l,{op:'label',identityId:id,expectedLedgerHash:l.ledgerHash,explanation:'采用原文限定',nameParts:parts},s)
 const next=api.appendSceneRosterBatch(l,[row(v,'乙港',v.text,'南岸')],[v],s),list=api.buildSceneWizardCandidates(next)
 assert.notEqual(next.ledgerHash,l.ledgerHash,'the append really rebuilt the ledger');assert.deepEqual(next.identities.find(i=>i.id===id)!.nameParts,parts);assert.equal(list.find(c=>c.id===id)!.name,'北岸·青石镇');assert.equal(list.find(c=>c.id!==id)!.name,'乙港')
})

test('D3: sceneHint lists deduplicated context labels, truncates to 60 characters and is never part of the name',async()=>{
 const api=await core(),a=unit('h1','北岸的书房有灯。'),b=unit('h2','南岸的书房有窗。',100),c=unit('h3','北岸的书房又有灯。',200),long='甲'.repeat(70),d=unit('h4',long+'的书房很远。',300),e=unit('h5','无名的门厅很空。',500),s=sources([a,b,c,d,e])
 const rows=[{...row(a,'书房',a.text,'北岸'),links:[{targetIndex:2,relation:'same-place' as const,evidence:[{unitId:a.id,quote:a.text}]}]},row(b,'书房',b.text,'南岸'),{...row(c,'书房',c.text,'北岸'),context:[{label:'北岸',evidence:[{unitId:c.id,quote:c.text}]},{label:'又有灯',evidence:[{unitId:c.id,quote:c.text}]}]},row(d,'书房',d.text,long),row(e,'门厅',e.text)]
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),rows,[a,b,c,d,e],s),list=api.buildSceneWizardCandidates(l),by=(unitId:string)=>list.find(x=>x.evidenceUnitIds?.includes(unitId))!
 assert.equal(by('h1').sceneHint,'北岸、又有灯');assert.equal(by('h2').sceneHint,'南岸');assert.equal(by('h4').sceneHint,'甲'.repeat(60));assert.equal(by('h5').sceneHint,undefined)
 for(const x of list){assert.ok(!x.name.includes('、'));assert.ok(!x.sceneHint||!x.name.includes(x.sceneHint))}
})

// Cleanup packets built by the planner itself; decisions are what a model would answer.
async function cleanupWorld(){
 const api=await core(),a=unit('c1','甲港的码头很宽。'),b=unit('c2','乙港的码头很窄。',100),c=unit('c3','丙港有座灯塔。',200),both=unit('c4','东宅的书房有灯，西宅的书房有窗。',300),s=sources([a,b,c,both])
 const rows=[row(a,'甲港',a.text),row(b,'乙港',b.text,undefined,[{targetIndex:0,relation:'different-place',evidence:[{unitId:b.id,quote:b.text}]}]),row(c,'丙港',c.text),row(both,'书房','东宅的书房有灯'),row(both,'书房','西宅的书房有窗')]
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),rows,[a,b,c,both],s),plan=api.planSceneCleanup(l,s,()=>true)
 return {api,s,l,plan,units:{a,b,c,both}}
}
test('C5b: a merge that bypasses the precheck and would make a place unresolved is reverted; the others apply; the debug log has no names',async()=>{
 const {api,s,l,plan}=await cleanupWorld(),packet=plan.packets[0],idOf=(name:string)=>l.identities.find(i=>api.buildSceneWizardCandidates(l).find(c=>c.id===i.id)!.name===name)!.id
 const keep=packet.context.focus.map(f=>({index:f.index,action:'keep' as const})),lines:string[]=[],original=console.error,env=process.env.SHAKEINK_IMPORT_DEBUG
 process.env.SHAKEINK_IMPORT_DEBUG='1';console.error=(...args:unknown[])=>{lines.push(args.map(String).join(' '))}
 try{const result=api.applySceneCleanup(l,[{packet,decisions:keep}],s,{testOnlyUnchecked:[{from:idOf('乙港'),to:idOf('甲港')},{from:idOf('丙港'),to:idOf('甲港')}]})
  assert.equal(result.reverted,1);assert.equal(result.ledger.identities.filter(i=>i.state==='unresolved').length,0);assert.ok(result.ledger.identities.some(i=>i.memberKeys.length===2),'the valid bypassing merge applied')
  const log=lines.filter(x=>x.includes('scene-cleanup'));assert.equal(log.length,1);for(const name of ['甲港','乙港','丙港','码头','灯塔'])assert.ok(!log[0].includes(name))
 }finally{console.error=original;if(env===undefined)delete process.env.SHAKEINK_IMPORT_DEBUG;else process.env.SHAKEINK_IMPORT_DEBUG=env}
})
test('B3: merge or drop evidence outside the item\'s own ranges is refused (another same-named place in the same unit)',async()=>{
 const {api,s,l,plan,units}=await cleanupWorld(),packet=plan.packets[0],ctx=packet.context,names=ctx.catalog.map(c=>c.name),studies=ctx.catalog.filter(c=>c.name==='书房').map(c=>c.index)
 assert.equal(studies.length,2);const [east,west]=studies,decisions=ctx.focus.map(f=>f.index===east?{index:east,action:'drop' as const,evidence:{unitId:units.both.id,quote:'西宅的书房有窗'}}:{index:f.index,action:'keep' as const})
 assert.throws(()=>api.applySceneCleanup(l,[{packet,decisions}],s),(error:Error)=>error instanceof api.SceneIdentityError&&error.reason==='anchor');void names;void west
 const own=ctx.focus.map(f=>f.index===east?{index:east,action:'drop' as const,evidence:{unitId:units.both.id,quote:'东宅的书房有灯'}}:{index:f.index,action:'keep' as const}),ok=api.applySceneCleanup(l,[{packet,decisions:own}],s);assert.equal(ok.excluded.length,1)
 for(const quote of ['书房','有灯，西宅'])assert.throws(()=>api.validateSceneCleanupDecisions(ctx,packet.units,ctx.focus.map(f=>f.index===east?{index:east,action:'drop',evidence:{unitId:f.unitIds[0],quote}}:{index:f.index,action:'keep'})),quote)
})

// Service bridge with a scripted reply per generation round (generateJSON allows one correction).
async function serve(request:ImportAiRequest,replies:unknown[]){
 const {runImportAi,generateImportAiJson}=await import('../../desktop/service/novel-import-ai');let round=0
 return runImportAi(request,new AbortController().signal,{resolve:async role=>request.models[role]!,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic-cleanup-core',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>({text:JSON.stringify(replies[Math.min(round++,replies.length-1)]),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})})
}
async function cleanupRequest(){const w=await cleanupWorld(),packet=w.plan.packets[0];return {...w,packet,request:{operationId:'cleanup-core',semanticVersion:1,phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:packet.context,units:packet.units,artifacts:[],workingRevision:0,models:{text:model,review:model}} as unknown as ImportAiRequest}}
test('B2: the strict cleanup schema rejects every malformed shape; one correction round recovers, two invalid rounds fail',async t=>{
 const {packet,request}=await cleanupRequest(),ctx=packet.context,index=(name:string)=>ctx.catalog.find(c=>c.name===name)!.index,a=index('甲港'),c=index('丙港'),ev=(name:string,quote:string)=>({unitId:ctx.focus.find(f=>f.index===index(name))!.unitIds[0],quote})
 const keep=ctx.focus.map(f=>({index:f.index,action:'keep'})),valid={sceneCleanup:keep.map(k=>k.index===c?{index:c,action:'merge',target:a,name:'甲港',evidence:ev('丙港','丙港有座灯塔')}:k)}
 const outside=ctx.catalog.length
 const bad:Record<string,unknown>={missing:{sceneCleanup:keep.slice(1)},duplicate:{sceneCleanup:[...keep,keep[0]]},extraKey:{sceneCleanup:keep.map((k,i)=>i?k:{...k,note:'x'})},rootKey:{...valid,roster:[]},targetOutside:{sceneCleanup:keep.map(k=>k.index===c?{index:c,action:'merge',target:outside,evidence:ev('丙港','丙港有座灯塔')}:k)},targetSelf:{sceneCleanup:keep.map(k=>k.index===c?{index:c,action:'merge',target:c,evidence:ev('丙港','丙港有座灯塔')}:k)},indexOutsideFocus:{sceneCleanup:[...keep.slice(1),{index:outside,action:'keep'}]},action:{sceneCleanup:keep.map((k,i)=>i?k:{...k,action:'rename'})},name:{sceneCleanup:keep.map(k=>k.index===c?{index:c,action:'merge',target:a,name:'丁港',evidence:ev('丙港','丙港有座灯塔')}:k)},mergeNoEvidence:{sceneCleanup:keep.map(k=>k.index===c?{index:c,action:'merge',target:a}:k)},dropNoEvidence:{sceneCleanup:keep.map(k=>k.index===c?{index:c,action:'drop'}:k)}}
 for(const [label,reply]of Object.entries(bad))await t.test(label,async()=>{assert.deepEqual((await serve(request,[reply,valid])).sceneCleanup,valid.sceneCleanup);await assert.rejects(serve(request,[reply,reply]))})
})
test('C10: a merge target that is not in the catalog (source-only or unresolved places never are) is refused',async()=>{
 const {packet,request}=await cleanupRequest(),ctx=packet.context,c=ctx.catalog.find(x=>x.name==='丙港')!.index,ev={unitId:ctx.focus.find(f=>f.index===c)!.unitIds[0],quote:'丙港有座灯塔'}
 const reply={sceneCleanup:ctx.focus.map(f=>f.index===c?{index:c,action:'merge',target:ctx.catalog.length+3,evidence:ev}:{index:f.index,action:'keep'})};await assert.rejects(serve(request,[reply,reply]))
})
test('B4: other stages cannot return sceneCleanup and cleanup cannot return other stage keys',async t=>{
 const {request}=await cleanupRequest(),keep={sceneCleanup:(request.sceneIdentity as {focus:{index:number}[]}).focus.map(f=>({index:f.index,action:'keep'}))}
 for(const key of ['roster','sceneIdentityDecisions','artifacts'])await t.test('cleanup + '+key,async()=>{const reply={...keep,[key]:[]};await assert.rejects(serve(request,[reply,reply]))})
 // 489 M2: real planned requests whose plain reply is accepted, so only the added key can cause the rejection.
 const api=await core(),ru=unit('r-1','北岸的甲港很宽。'),rs=sources([ru]),record={name:'甲港',aliases:[],mentions:[{literal:'甲港',evidence:{unitId:ru.id,quote:'北岸的甲港很宽。'}}],context:[{label:'北岸',evidence:[{unitId:ru.id,quote:'北岸的甲港很宽。'}]}],links:[]}
 const roster={operationId:'b4-roster',semanticVersion:1,phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},units:[ru],artifacts:[],workingRevision:0,models:{text:model,review:model}} as unknown as ImportAiRequest
 await t.test('roster + sceneCleanup',async()=>{assert.equal((await serve(roster,[{roster:[record]}])).sceneRosterRecords!.length,1,'the plain roster reply is accepted');await assert.rejects(serve(roster,[{roster:[record],sceneCleanup:[]},{roster:[record],sceneCleanup:[]}]))})
 const la=unit('l-1','北岸的甲港很宽。'),lb=unit('l-2','北岸的乙港很窄。',100),ls=sources([la,lb]),lledger=api.appendSceneRosterBatch(api.createSceneIdentityLedger(ls),[row(la,'甲港',la.text,'北岸'),row(lb,'乙港',lb.text,'北岸')],[la,lb],ls),lpacket=api.planSceneIdentityLinkWave(lledger,ls,()=>true,15).packets[0]
 assert.ok(lpacket,'a real links packet was planned')
 const links={operationId:'b4-links',semanticVersion:1,phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:lpacket.context,units:lpacket.units,artifacts:[],workingRevision:0,models:{text:model,review:model}} as unknown as ImportAiRequest,decisions=lpacket.context.tasks.map(x=>({taskIndex:x.taskIndex,result:'unknown',evidence:[]}))
 await t.test('links + sceneCleanup',async()=>{assert.equal((await serve(links,[{sceneIdentityDecisions:decisions}])).sceneIdentityDecisions!.length,decisions.length,'the plain links reply is accepted');await assert.rejects(serve(links,[{sceneIdentityDecisions:decisions,sceneCleanup:[]},{sceneIdentityDecisions:decisions,sceneCleanup:[]}]))})
 const u=request.units[0]
 await t.test('entity + sceneCleanup',async()=>{const entity={...request,intent:'entity',sceneIdentity:undefined,entityTarget:{id:'s-0000000000000001',aliases:[]},entities:[{id:'s-0000000000000001',kind:'scene',name:'甲港',entityType:'PLACE'}]} as unknown as ImportAiRequest,reply={artifacts:[{id:'s-0000000000000001',kind:'scene',name:'甲港',text:'合成',facts:{entityType:'PLACE'},evidence:[{unitId:u.id,quote:u.text}],sourceUnitIds:[u.id],origin:'inferred'}],sceneCleanup:[]};await assert.rejects(serve(entity,[reply,reply]))})
})
/** sha256 of each stage prompt at HEAD b7f090a, before 486 (recorded by the pre-change script; 489 M3 keeps it in the repo). */
const PROMPT_BASELINE:Record<string,string>={roster:'e0ccfee8d6446461e6fd5eb360386c24fb097517ff630270bd69cb9ebbb11218',links:'4e6b6954a5a714349c0210bbcb39c35814d0f829b470d3793ce279e299879495',parent:'c0fe5b88541d94b1ea46c5d2f5416cf719e7d8d60551829f4b5d2e293e96bf36',entity:'a64835b2348c0732a39d4eba0dca790bf50b3aa29cb70a82a5b28822e024bed8',ownershipEntity:'6a02785d22e6327dacd2f5f2849e9c5ee218d361b90d3526aa715c9c838625f6',review:'492e83b1ddd5a3f2f050889c3a461b6d3b61c39472cb31415398e218a1e15f86'}
test('B7: the cleanup prompt states the five rules; every other stage prompt is byte-identical to the pre-change baseline',async()=>{
 const {importAiPrompt}=await import('../../desktop/core/novel-import-ai-payload'),{request}=await cleanupRequest(),prompt=importAiPrompt(request)
 for(const phrase of ['简称','全称','异写','只共享','上级与下级','非具体地点','原文','不可信','ownQuotes'])assert.ok(prompt.includes(phrase),phrase)
 const baseline=PROMPT_BASELINE
 const u={id:'u-1',fileId:'f-1',start:0,end:12,text:'青石镇的北岸有一座旧仓库。',kind:'body'},base={units:[u],artifacts:[],workingRevision:0,semanticVersion:1,phase:'analyze',kind:'scene'},key='a'.repeat(64)
 const cases:Record<string,unknown>={roster:{...base,intent:'roster',sceneIdentity:{version:1,mode:'roster'}},links:{...base,intent:'roster',sceneIdentity:{version:1,mode:'links',ledgerHash:key,identityRevision:0,records:[],tasks:[]}},parent:{...base,intent:'roster',sceneParentTargets:['s-0000000000000001'],entities:[{id:'s-0000000000000001',kind:'scene',name:'青石镇',entityType:'PLACE'}]},entity:{...base,intent:'entity',entityTarget:{id:'s-0000000000000001',aliases:[]},entities:[{id:'s-0000000000000001',kind:'scene',name:'青石镇',entityType:'PLACE'}]},ownershipEntity:{...base,intent:'entity',entityTarget:{id:'s-0000000000000001',aliases:[]},entities:[{id:'s-0000000000000001',kind:'scene',name:'青石镇',entityType:'PLACE'}],sceneIdentity:{version:1,mode:'ownership',ledgerHash:key,identityRevision:0,memberships:[]}},review:{...base,phase:'review',kind:undefined,selectedTargets:['scene']}}
 for(const [name,input]of Object.entries(cases))assert.equal(createHash('sha256').update(importAiPrompt(input as never)).digest('hex'),baseline[name],name)
})
test('C9: the wizard state accepts only a strict sceneCleanup record',async()=>{
 const state=await import('../../desktop/core/novel-import-wizard-state'),hash='a'.repeat(64),range={unitId:'u',unitHash:hash,start:0,end:2},w=state.emptyWizardState()
 Object.assign(w,{sceneCleanup:{inputHash:hash,cleanedHash:hash,excluded:[{id:'s-0000000000000001',evidence:range}],authorKept:['s-0000000000000001']}});state.validateImportWizardState({wizardVersion:1,wizard:w})
 for(const bad of [{inputHash:hash,cleanedHash:hash,excluded:[],authorKept:[],extra:1},{inputHash:'bad',cleanedHash:hash,excluded:[],authorKept:[]},{inputHash:hash,cleanedHash:hash,excluded:[{id:'s-0000000000000001',evidence:{...range,end:0}}],authorKept:[]},{inputHash:hash,cleanedHash:hash,excluded:[{id:'s-0000000000000001',evidence:range},{id:'s-0000000000000001',evidence:range}],authorKept:[]}])assert.throws(()=>state.validateImportWizardState({wizardVersion:1,wizard:{...w,sceneCleanup:bad}}),JSON.stringify(bad))
})

test('H1: evidence running past the item\'s own mention window is refused by the service; the corrected reply succeeds and applies',async()=>{
 const api=await core(),bell=unit('o-1','铜铃挂在门口，风一吹就响。'),town=unit('o-2','青石镇的码头有灯塔。',100),s=sources([bell,town])
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[row(bell,'铜铃','铜铃挂在门口'),row(town,'青石镇',town.text)],[bell,town],s),packet=api.planSceneCleanup(l,s,()=>true).packets[0],ctx=packet.context,index=ctx.catalog.find(c=>c.name==='铜铃')!.index
 assert.deepEqual(ctx.focus.find(f=>f.index===index)!.ownQuotes,['铜铃挂在门口'],'the request carries the item\'s own mention window')
 const request={operationId:'h1',semanticVersion:1,phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:ctx,units:packet.units,artifacts:[],workingRevision:0,models:{text:model,review:model}} as unknown as ImportAiRequest
 const reply=(quote:string)=>({sceneCleanup:ctx.focus.map(f=>f.index===index?{index,action:'drop',evidence:{unitId:bell.id,quote}}:{index:f.index,action:'keep'})}),wide=reply('铜铃挂在门口，风一吹就响'),good=reply('铜铃挂在门')
 assert.throws(()=>api.validateSceneCleanupDecisions(ctx,packet.units,wide.sceneCleanup as never),(e:Error)=>e instanceof api.SceneIdentityError&&e.reason==='anchor','the wide quote is unique and names the item, yet lies outside its window')
 await assert.rejects(serve(request,[wide,wide]),'two wide rounds fail in the service, not at apply')
 const result=await serve(request,[wide,good]);assert.deepEqual(result.sceneCleanup,good.sceneCleanup,'one correction round recovers')
 const applied=api.applySceneCleanup(l,[{packet,decisions:result.sceneCleanup!}],s);assert.equal(applied.excluded.length,1)
})
