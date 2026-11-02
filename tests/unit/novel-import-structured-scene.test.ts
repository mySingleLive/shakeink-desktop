import assert from 'node:assert/strict'
import {test} from 'node:test'
import {z} from 'zod'
import {MockLanguageModelV4} from 'ai/test'
import type {JSONSchema7,LanguageModelV4StreamPart} from '@ai-sdk/provider'
import * as imports from '../../desktop/service/novel-import-ai'
import {generateText,generateJSON,StructuredGenerationError} from '../../src/lib/ai/generate'
import {runInsideLongTask} from '../../src/lib/long-task'
import {localModelRecord,configureModelTransport} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {ModelGateway} from '../../desktop/core/model-authorization'
import {ModelService} from '../../desktop/main/model-service'
import type {ModelRepository} from '../../desktop/main/model-repository'
import type {PublicModel} from '../../desktop/core/settings'
import type {ImportAiRequest,ImportAiResult} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {legacySceneFixture,rosterAi,toImportScene} from '../helpers/novel-import-wizard-fixture'
import {serializeImportAiPayload,assertImportPayloadBudget,assertImportFixedPromptReserve,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {importRequestBudget} from '../../desktop/core/novel-import-budget-policy'

type Contract={jsonSchema:JSONSchema7;prompt:string;payload:string;wireSchema:z.ZodType<ImportAiResult>}
const api=imports as typeof imports&{supportsStructuredScene?:(r:ImportAiRequest,m:PublicModel)=>boolean;createStructuredSceneContract?:(r:ImportAiRequest)=>Contract;structuredSceneModel?:(r:ImportAiRequest,resolved:ResolvedModel,m:PublicModel)=>ResolvedModel}
const pub={id:'00000000-0000-4000-8000-000000000001',name:'合成结构模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,thinkingLevels:['low','high'],defaultThinking:'high',inputCostPer1k:0,outputCostPer1k:0} as PublicModel
const t1='北城的长街有门，长街邻居也在这里。',t2='上下文角色手持钥匙走进长街。'
const request:ImportAiRequest={semanticVersion:1,operationId:'structured-scene',phase:'analyze',intent:'entity',kind:'scene',entityTarget:{id:'s-child',aliases:['长街'],evidenceOptions:[{unitId:'u-one',quote:'北城的长街有门'},{unitId:'u-two',quote:'上下文角色手持钥匙走进长街'}]},entities:[{id:'c-hidden',kind:'character',name:'未提及人物'},{id:'s-parent',kind:'scene',name:'北城',entityType:'PLACE'},{id:'s-child',kind:'scene',name:'南巷',entityType:'PLACE',parentId:'s-parent'},{id:'s-alias',kind:'scene',name:'远处',entityType:'PLACE'},{id:'i-zero',kind:'item',name:'钥匙'}],artifacts:[{id:'c-context',kind:'character',name:'上下文角色',text:'合成上下文人物',facts:{},origin:'source',evidence:[{unitId:'u-two',quote:t2}],sourceUnitIds:['u-two']}],units:[{id:'u-one',fileId:'f',start:0,end:t1.length,text:t1,kind:'body'},{id:'u-two',fileId:'f',start:t1.length,end:t1.length+t2.length,text:t2,kind:'body'}],workingRevision:0,instruction:JSON.stringify([{id:'s-alias',name:'远处',aliases:['长街邻居']},{id:'outside',aliases:['诱导线索']}]),models:{text:pub}}
const facts={coordinates:'城内',reliability:'人物推测',attribution:'合成叙述者',temporalScope:'当前片段',exteriorDescription:'完整外观',interiorDescription:'完整内观',backstory:'完整背景',entryMethod:'完整进入方式'}
const dto={text:'这是由原文合成的完整场景正文。',facts,references:{characterIndex:1,sceneIndex:0,itemIndex:0},primaryEvidence:{optionIndex:0},additionalEvidence:[{optionIndex:1}]}
const contract=(r:ImportAiRequest=request)=>{assert.equal(typeof api.createStructuredSceneContract,'function');return api.createStructuredSceneContract!(r)}
const resolved=(model:ResolvedModel['model'])=>({model,modelRecord:localModelRecord(pub),providerOptions:{deepseek:{thinking:{type:'disabled'}},openai:{store:true,user:'synthetic'},other:{kept:true}}} as unknown as ResolvedModel)
const mock=()=>new MockLanguageModelV4({doStream:async()=>({stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){const parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'0'},{type:'text-delta',id:'0',delta:'{"result":"ready"}'},{type:'text-end',id:'0'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}}}];for(const part of parts)c.enqueue(part);c.close()}})})})
test('SO-01: optional JSON schema reaches the real SDK call while ordinary generation retains text output',async()=>{
 const model=mock(),m=resolved(model),schema:JSONSchema7={type:'object',properties:{result:{type:'string'}},required:['result'],additionalProperties:false},base={userId:LOCAL_AUTHOR_ID,action:'synthetic',resolvedModel:m,usage:imports.readOnlyImportUsage,maxNetworkRetries:0,prompt:'Return JSON'}
 await runInsideLongTask(()=>generateText({...base,jsonOutputSchema:schema,maxOutputTokens:32768} as Parameters<typeof generateText>[0]));assert.equal(model.doStreamCalls[0].responseFormat?.type,'json');assert.deepEqual(model.doStreamCalls[0].responseFormat?.type==='json'?model.doStreamCalls[0].responseFormat.schema:undefined,schema);assert.equal(model.doStreamCalls[0].maxOutputTokens,32768)
 await runInsideLongTask(()=>generateText(base));assert.ok(model.doStreamCalls[1].responseFormat?.type!=='json');assert.equal(model.doStreamCalls[1].maxOutputTokens,undefined)
 const parsed=await runInsideLongTask(()=>generateJSON({...base,jsonOutputSchema:schema,maxOutputTokens:32768,schema:z.object({result:z.string()})} as Parameters<typeof generateJSON>[0]));assert.deepEqual(parsed.data,{result:'ready'});assert.equal(model.doStreamCalls[2].responseFormat?.type,'json');assert.equal(model.doStreamCalls[2].maxOutputTokens,32768)
})
test('SO-02: complete immutable typed catalogs restore index zero, aliases, context artifacts and all business fields',()=>{
 const before=structuredClone(request),c=contract(),payload=JSON.parse(c.payload),result=c.wireSchema.parse(dto),a=result.artifacts![0]
 assert.deepEqual(request,before);assert.deepEqual(payload.units,request.units);assert.deepEqual(payload.entityTarget.evidenceOptions,request.entityTarget!.evidenceOptions!.map((v,optionIndex)=>({...v,optionIndex})))
 for(const [id,index] of [['s-parent',0],['s-child',1],['s-alias',2],['i-zero',0],['c-context',1]] as const){const e=payload.entities.find((e:{id:string})=>e.id===id);assert.ok(e,id);assert.equal(e.referenceIndex,index);assert.ok(c.prompt.includes(id))}assert.ok(!payload.entities.some((e:{id:string})=>e.id==='outside'));assert.ok(c.prompt.includes('长街邻居'))
 assert.equal(a.id,'s-child');assert.equal(a.name,'南巷');assert.equal(a.kind,'scene');assert.equal(a.origin,'inferred');assert.equal(a.text,dto.text);assert.deepEqual(a.facts,{entityType:'PLACE',parentId:'s-parent',...facts,characterId:'c-context',sceneId:'s-parent',itemId:'i-zero'});assert.deepEqual(a.evidence,request.entityTarget!.evidenceOptions);assert.deepEqual(a.sourceUnitIds,['u-one','u-two'])
 const unknown=structuredClone(dto);unknown.facts.reliability='';unknown.references={characterIndex:-1,sceneIndex:-1,itemIndex:-1};const empty=c.wireSchema.parse(unknown).artifacts![0];assert.ok(!Object.hasOwn(empty.facts,'reliability'));assert.ok(!Object.hasOwn(empty.facts,'characterId'));assert.equal(empty.facts.backstory,facts.backstory)
 const zero=c.wireSchema.parse({...dto,references:{characterIndex:0,sceneIndex:0,itemIndex:0}}).artifacts![0];assert.equal(zero.facts.characterId,'c-hidden');assert.equal(zero.facts.sceneId,'s-parent')
 const large={...request,entities:[...request.entities!,...Array.from({length:1500},(_,i)=>({id:'s-extra-'+i,kind:'scene' as const,name:'其它地点'+i,entityType:'PLACE' as const}))]};assert.ok(JSON.stringify(contract(large).jsonSchema).length<JSON.stringify(c.jsonSchema).length+500)
 const mutable=structuredClone(request),frozen=contract(mutable);mutable.entities!.reverse();mutable.entities!.find(e=>e.id==='s-child')!.name='后续变更';mutable.entityTarget!.evidenceOptions![0].quote='后续变更';assert.deepEqual(frozen.wireSchema.parse(dto),result)
 assert.throws(()=>contract({...request,entities:[...request.entities!,{id:'c-context',kind:'item',name:'上下文冲突'}]}))
 const linked={id:'s-linked',kind:'scene' as const,name:'合成关联地点',entityType:'PLACE' as const,parentId:'s-parent'},extra={id:'s-other-parent',kind:'scene' as const,name:'另一个上级',entityType:'PLACE' as const}
 const conflicting={...request,entities:[...request.entities!,linked,extra],artifacts:[...request.artifacts,{id:linked.id,kind:'scene' as const,name:linked.name,text:'合成关联地点资料',facts:{entityType:'PLACE',parentId:extra.id},origin:'inferred' as const,evidence:[{unitId:'u-one',quote:t1}],sourceUnitIds:['u-one']}]}
 const conflictBefore=structuredClone(conflicting);assert.throws(()=>contract(conflicting));assert.deepEqual(conflicting,conflictBefore)
 assert.throws(()=>contract({...request,entities:[...request.entities!,linked,{...linked,parentId:extra.id},extra]}))
 assert.throws(()=>contract({...request,entities:[...request.entities!,linked,{...linked,entityType:'WORLD'}]}))
 assert.throws(()=>contract({...request,entityTarget:{...request.entityTarget!,evidenceOptions:[{unitId:'u-one',quote:'材料中不存在的独立句子'}]}}))
})
test('SO-03: malformed wire controls, fields, typed indexes and every bad evidence entry fail without dropping data',()=>{
 const c=contract(),variants:unknown[]=[]
 variants.push(new Date(0),new Map(),new Set(),{...dto,references:new Map()},{...dto,primaryEvidence:new Date(0)},{...dto,additionalEvidence:[{optionIndex:1,unknown:undefined}]})
 for(const key of ['id','name','kind','origin','parentId','entityType'])variants.push({...dto,[key]:'SYNTHETIC-PRIVATE'})
 for(const key of ['parentId','entityType','unknown'])variants.push({...dto,facts:{...facts,[key]:undefined}})
 const {backstory:_backstory,...missing}=facts
 variants.push({...dto,facts:missing},{...dto,facts:new Date(0)},{...dto,facts:new Map()},{...dto,facts:{...facts,backstory:null}},{...dto,facts:{...facts,backstory:1}},{...dto,text:' \n '},{...dto,text:'\ud800'},{...dto,facts:{...facts,reliability:'未知类型'}},{...dto,facts:{...facts,attribution:' \n '}})
 for(const value of [-2,3,0.5,'0'])variants.push({...dto,references:{...dto.references,sceneIndex:value}})
 variants.push({...dto,references:{...dto.references,sceneId:'c-context'}},{...dto,primaryEvidence:{optionIndex:2}},{...dto,primaryEvidence:{optionIndex:0,quote:'SYNTHETIC-PRIVATE'}},{...dto,additionalEvidence:[{optionIndex:0},{optionIndex:2},{optionIndex:1}]})
 for(const value of variants){const before=structuredClone(value);assert.equal(c.wireSchema.safeParse(value).success,false);assert.deepEqual(value,before)}
 assert.throws(()=>contract({...request,entityTarget:{...request.entityTarget!,evidenceOptions:[]}}))
})
function sse(value:unknown){const text=JSON.stringify(value),item={type:'message',id:'msg-synthetic',status:'completed',role:'assistant',content:[{type:'output_text',text,annotations:[]}]},response={id:'resp-synthetic',object:'response',created_at:0,status:'completed',model:pub.modelId,output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}};return [{type:'response.created',response:{...response,status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:text},{type:'response.output_text.done',item_id:item.id,output_index:0,content_index:0,text},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response}].map((v,sequence_number)=>'data: '+JSON.stringify({...v,sequence_number})+'\n\n').join('')}
test('SO-04: actual Responses SDK uses the authorized gateway, strict format, reasoning none and no legacy fallback',async()=>{
 assert.equal(typeof api.structuredSceneModel,'function');assert.equal(typeof api.supportsStructuredScene,'function')
 let network=0,sdk=0,fail=false,nonScope=false;const key='SYNTHETIC_MAIN_VAULT_KEY',gateway=new ModelGateway({keyFor:async()=>key,fetch:async(url,init)=>{network++;assert.equal(new URL(String(url)).origin,'https://api.deepseek.com');assert.equal(new URL(String(url)).pathname,'/responses');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+key);const body=JSON.parse(init!.body as string);assert.equal(body.model,pub.modelId);assert.equal(body.store,false);assert.equal(body.reasoning?.effort,'none');if(nonScope){assert.equal(body.max_output_tokens,undefined);assert.equal(body.text?.format,undefined)}else{assert.equal(body.max_output_tokens,32768);assert.equal(body.text?.format?.type,'json_schema');assert.equal(body.text?.format?.strict,true);assert.deepEqual(body.text.format.schema,contract().jsonSchema)}return fail?Response.json({error:{message:'synthetic'}},{status:400}):new Response(sse(network===1?{...dto,'SYNTHETIC-PRIVATE-KEY':'SYNTHETIC-PRIVATE-VALUE'}:dto),{headers:{'content-type':'text/event-stream'}})}})
 gateway.replace(pub);const repository={read:async()=>({revision:1,models:[pub],settings:{agent:{textModelId:pub.id,reviewModelId:pub.id}}}),keyFor:async()=>key} as unknown as ModelRepository,main=new ModelService(repository,gateway)
 configureModelTransport(((method:string,value:any)=>{if(method==='model.start'){sdk++;assert.ok(!JSON.stringify(value.headers).includes(key));return main.start(value)}if(method==='model.read')return main.read(value);if(method==='model.cancel')return main.cancel(value);throw Error('unexpected transport')}) as Parameters<typeof configureModelTransport>[0])
 const original=resolved(mock()),before=structuredClone(original.providerOptions),next=api.structuredSceneModel!(request,original,pub)
 try{assert.equal(next.modelRecord,original.modelRecord);assert.deepEqual(original.providerOptions,before);assert.equal(api.supportsStructuredScene!(request,pub),true)
  for(const r of [{...request,phase:'review'},{...request,intent:undefined,entityTarget:undefined},{...request,kind:'character'},{...request,entityTarget:{...request.entityTarget!,evidenceOptions:[]}}] as ImportAiRequest[])assert.equal(api.structuredSceneModel!(r,original,pub),original)
  for(const m of [{...pub,provider:'custom'},{...pub,modelId:'other'},{...pub,endpoint:'https://model.invalid'},{...pub,endpoint:'https://api.deepseek.com/v1'},{...pub,endpoint:'https://api.deepseek.com?other=1'},{...pub,endpoint:'https://user:pass@api.deepseek.com'},{...pub,protocol:'anthropic'}] as PublicModel[])assert.equal(api.structuredSceneModel!(request,original,m),original)
  const run=()=>imports.runImportAi(request,new AbortController().signal,{resolve:async()=>pub,assert:async m=>{main.assertAuthorization({modelId:m.id,authRevision:m.authRevision,kind:'TEXT'})},generate:async(r,_m,signal,prompt)=>imports.generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,resolvedModel:next,usage:imports.readOnlyImportUsage,maxNetworkRetries:0,structuredScene:true} as Parameters<typeof imports.generateImportAiJson>[1],signal,prompt)})
  const actual=await runInsideLongTask(run);assert.deepEqual(actual,contract().wireSchema.parse(dto));assert.equal(network,2,'both bounded schema generations use the same real SDK output cap');assert.equal(sdk,2)
  nonScope=true;await runInsideLongTask(()=>generateText({userId:LOCAL_AUTHOR_ID,action:'synthetic-ordinary',resolvedModel:next,usage:imports.readOnlyImportUsage,maxNetworkRetries:0,prompt:'Return synthetic text'}));assert.equal(network,3);assert.equal(sdk,3);nonScope=false
  fail=true;await assert.rejects(runInsideLongTask(run));assert.equal(network,4);assert.equal(sdk,4)
 }finally{await main.close();configureModelTransport(async()=>{throw Error('synthetic transport closed')})}
})
test('SO-05: controller scene imports decode structured wire through the original complete canonical gates',async()=>{
 const f=await legacySceneFixture(undefined,rosterAi(),{models:{text:pub,review:{...pub,id:'00000000-0000-4000-8000-000000000002'}}}),base=f.handler()
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);const value={text:'完整合成资料正文',facts:{...facts,reliability:'客观事实',attribution:''},references:{characterIndex:-1,sceneIndex:-1,itemIndex:-1},primaryEvidence:{optionIndex:0},additionalEvidence:[]};return imports.runImportAi(r,new AbortController().signal,{resolve:async()=>pub,assert:async()=>{},generate:async(_r,_m,signal,prompt)=>imports.generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,resolvedModel:{} as ResolvedModel,structuredScene:true} as Parameters<typeof imports.generateImportAiJson>[1],signal,prompt,{generateText:async()=>({text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})})})
 try{await toImportScene(f);const v=await f.settle(),s=await f.journal();assert.equal(v.wizard!.step,'verify');assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));assert.deepEqual(s.wizard!.dropped,[]);assert.deepEqual(s.wizard!.skipped,[]);for(const a of s.artifacts){assert.equal(a.schema,2);assert.equal(a.facts.backstory,facts.backstory);assert.equal(a.facts.parentId,s.wizard!.candidates.scene!.find(c=>c.id===a.id)!.parentId)}}finally{await f.dispose()}
})
test('SO-06: schema and added index metadata count toward the original budget before any generation',async()=>{
 const r=structuredClone(request),budget=importRequestBudget(r,pub)
 const initial=serializeImportAiPayload(r);r.instruction+='x'.repeat(budget.characters*3-initial.length-100)
 assertImportPayloadBudget(r,serializeImportAiPayload(r),budget.characters,budget.maxUnits)
 const before=structuredClone(r);let generations=0
 await assert.rejects(imports.generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved(mock()),structuredScene:true} as Parameters<typeof imports.generateImportAiJson>[1],new AbortController().signal,'unused',{generateText:async()=>{generations++;return {text:JSON.stringify(dto),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),/预算/u)
 assert.equal(generations,0);assert.deepEqual(r,before)
})
for(const permanent of [false,true])test('SO-07: structured scene '+(permanent?'stops after four generations':'recovers on generation three')+' without leaking provider keys',async()=>{
 const f=await legacySceneFixture(undefined,rosterAi(),{models:{text:pub,review:{...pub,id:'00000000-0000-4000-8000-000000000002'}}}),base=f.handler(),generations=new Map<string,number>(),requests=new Map<string,number>();let target:string|undefined
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);const id=r.entityTarget!.id;target??=id;requests.set(id,(requests.get(id)??0)+1)
  return imports.runImportAi(r,new AbortController().signal,{resolve:async()=>pub,assert:async()=>{},generate:async(_r,_m,signal,prompt)=>imports.generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved(mock()),structuredScene:true} as Parameters<typeof imports.generateImportAiJson>[1],signal,prompt,{generateText:async opts=>{
   const count=(generations.get(id)??0)+1;generations.set(id,count);assert.ok(opts.jsonOutputSchema);const prompt='prompt' in opts?opts.prompt:'';if(prompt.includes('上一次输出未通过结构校验'))assert.ok(!prompt.slice(prompt.indexOf('上一次输出未通过结构校验')).includes('SYNTHETIC-PRIVATE'))
   const value={...dto,facts:{...facts,reliability:'客观事实',attribution:''},references:{characterIndex:-1,sceneIndex:-1,itemIndex:-1},primaryEvidence:{optionIndex:0},additionalEvidence:[]};if(id===target&&(permanent||count<=2))Object.assign(value,{'SYNTHETIC-PRIVATE-KEY':'SYNTHETIC-PRIVATE-VALUE'})
   return {text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}
  }})})
 })
 try{await toImportScene(f);const view=await f.settle(),s=await f.journal();assert.ok(target);assert.equal(requests.get(target),2);assert.equal(generations.get(target),permanent?4:3)
  if(permanent){assert.equal(view.wizard!.tasks.find(t=>t.candidateId===target)!.state,'failed');assert.ok(!s.artifacts.some(a=>a.id===target))}else{assert.equal(view.wizard!.step,'verify');assert.ok(view.wizard!.tasks.every(t=>t.state==='done'))}
 }finally{await f.dispose()}
})
test('SO-08: successful wire cannot bypass the final authorization, snapshot or cancellation gates',async()=>{
 for(const mode of ['authorization','snapshot','cancel'] as const){let assertions=0,resolves=0,generations=0;const abort=new AbortController()
  await assert.rejects(imports.runImportAi(request,abort.signal,{resolve:async()=>{resolves++;return mode==='snapshot'&&resolves===2?{...pub,authRevision:2}:pub},assert:async()=>{assertions++;if(mode==='authorization'&&assertions===2)throw Error('模型配置或授权已变化，未采用返回结果')},generate:async(r,_m,signal,prompt)=>{
   const result=await imports.generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved(mock()),structuredScene:true} as Parameters<typeof imports.generateImportAiJson>[1],signal,prompt,{generateText:async()=>{generations++;return {text:JSON.stringify(dto),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}});if(mode==='cancel')abort.abort();return result
  }}));assert.equal(generations,1);assert.equal(assertions,mode==='cancel'?1:2)
 }
})
test('SO-09: explicit review generation uses its own eligibility and schema budget',async()=>{
 const review={...pub,id:'00000000-0000-4000-8000-000000000002',contextWindow:16000},r=structuredClone(request);r.models.review=review
 const budget=importRequestBudget(r,review),initial=serializeImportAiPayload(r);r.instruction+='x'.repeat(budget.characters*3-initial.length-100)
 assertImportPayloadBudget(r,serializeImportAiPayload(r),budget.characters,budget.maxUnits);let calls=0
 const context={userId:LOCAL_AUTHOR_ID,resolvedModel:{...resolved(mock()),modelRecord:localModelRecord(review)},role:'review' as const,structuredScene:true}
 await assert.rejects(imports.generateImportAiJson(r,context,new AbortController().signal,'unused',{generateText:async()=>{calls++;return {text:JSON.stringify(dto),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),/预算/u);assert.equal(calls,0)
 const different=structuredClone(request);different.models.text={...pub,provider:'custom',modelId:'synthetic-other',endpoint:'https://model.invalid'};different.models.review=review
 const actual=await imports.generateImportAiJson(different,context,new AbortController().signal,'unused',{generateText:async opts=>{calls++;assert.equal(opts.role,'review');assert.ok(opts.jsonOutputSchema);return {text:JSON.stringify(dto),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}});assert.equal(calls,1);assert.deepEqual(actual,contract(different).wireSchema.parse(dto))
})

test('OC-03: output headroom includes complete prompt/schema UTF8 bytes, wrapper reserve and the actual role pin',async t=>{
 const expanded=structuredClone(request);expanded.instruction+='中文𠀀'.repeat(2000)
 const initialContract=contract(expanded),schemaText=JSON.stringify(initialContract.jsonSchema),required=Buffer.byteLength(initialContract.prompt+schemaText,'utf8')+IMPORT_JSON_WRAPPER_RESERVE_BYTES+32768
 assert.ok(required>initialContract.prompt.length+schemaText.length+IMPORT_JSON_WRAPPER_RESERVE_BYTES+32768,'UTF16 character count is insufficient for Chinese and non-BMP metadata')
 async function check(r:ImportAiRequest,role:'text'|'review',wanted:number|undefined){
  const before=structuredClone(r),pinned=r.models[role]! as PublicModel,c=contract(r),budget=importRequestBudget(r,pinned)
  assertImportPayloadBudget(r,c.payload+JSON.stringify(c.jsonSchema),budget.characters,budget.maxUnits);assertImportFixedPromptReserve(c.prompt+JSON.stringify(c.jsonSchema),c.payload)
  let calls=0;const result=await imports.generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,role,resolvedModel:{...resolved(mock()),modelRecord:localModelRecord(pinned)},structuredScene:true},new AbortController().signal,'unused',{generateText:async opts=>{
   calls++;assert.equal((opts as typeof opts&{maxOutputTokens?:number}).maxOutputTokens,wanted);assert.equal(opts.role,role);assert.deepEqual(opts.jsonOutputSchema,c.jsonSchema);assert.ok('prompt'in opts&&opts.prompt.startsWith(c.prompt),'actual complete structured prompt is unchanged')
   const payload=JSON.parse(c.payload);assert.deepEqual(payload.units,r.units);assert.deepEqual(payload.entityTarget.evidenceOptions,r.entityTarget!.evidenceOptions!.map((entry,optionIndex)=>({...entry,optionIndex})))
   return {text:JSON.stringify(dto),promptTokens:1,completionTokens:1,cost:0,finishReason:'stop'}
  }})
  assert.equal(calls,1,'insufficient output headroom still generates with the existing default');assert.deepEqual(result,c.wireSchema.parse(dto));assert.deepEqual(r,before,'source units, catalog, aliases and all options stay intact')
 }
 for(const offset of [-1,0,1])await t.test('complete-byte boundary '+offset,async()=>{const r=structuredClone(expanded);r.models.text={...pub,contextWindow:required+offset};await check(r,'text',offset<0?undefined:32768)})
 await t.test('review capacity cannot borrow a larger text window',async()=>{const r=structuredClone(expanded);r.models.text={...pub,contextWindow:1048576};r.models.review={...pub,id:'00000000-0000-4000-8000-000000000002',contextWindow:required-1};await check(r,'review',undefined)})
 await t.test('eligible review capacity is used when text is unrelated and small',async()=>{const r=structuredClone(expanded);r.models.text={...pub,provider:'custom',endpoint:'https://synthetic.invalid',modelId:'unrelated',contextWindow:16000};r.models.review={...pub,id:'00000000-0000-4000-8000-000000000002',contextWindow:required};await check(r,'review',32768)})
 for(const capacity of [undefined,0,-1,NaN,Infinity,1048576.5])await t.test('invalid or unavailable capacity '+String(capacity),async()=>{const r=structuredClone(request);r.models.text={...pub,contextWindow:capacity} as PublicModel;await check(r,'text',undefined)})
})

function wireModel(value:unknown,finish:'stop'|'length',outputTokens=1){return new MockLanguageModelV4({doStream:async()=>({stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){const parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'0'},{type:'text-delta',id:'0',delta:JSON.stringify(value)},{type:'text-end',id:'0'},{type:'finish',finishReason:{unified:finish,raw:finish==='length'?'max_output_tokens':'stop'},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:outputTokens,text:outputTokens,reasoning:0}}}];for(const part of parts)c.enqueue(part);c.close()}})})})}
test('OC-04: complete large synthetic wire is preserved, while parsable length-finished output remains a bounded failure',async t=>{
 const large={...dto,text:'完整首段😀'+ '场景正文资料'.repeat(1800)+'完整尾段𠀀',facts:{...facts,exteriorDescription:'外观首'+ '有据外部资料'.repeat(1000)+'外观尾',interiorDescription:'内观首'+ '有据内部资料'.repeat(1000)+'内观尾',backstory:'背景首'+ '有据背景资料'.repeat(1000)+'背景尾',entryMethod:'进入首'+ '有据进入资料'.repeat(1000)+'进入尾'}}
 assert.ok(JSON.stringify(large).length>8192,'large character payload only proves local preservation; synthetic usage is not actual provider token measurement')
 for(const finish of ['stop','length'] as const)await t.test(finish,async()=>{
  const input=structuredClone(request),before=structuredClone(input),wireBefore=structuredClone(large),model=wireModel(large,finish,10000),m=resolved(model)
  const run=()=>imports.runImportAi(input,new AbortController().signal,{resolve:async()=>pub,assert:async()=>{},generate:async(r,_m,signal,prompt)=>imports.generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,resolvedModel:m,usage:imports.readOnlyImportUsage,maxNetworkRetries:0,structuredScene:true},signal,prompt)})
  if(finish==='stop'){const actual=await runInsideLongTask(run);assert.deepEqual(actual,contract(input).wireSchema.parse(large));assert.equal(model.doStreamCalls.length,1);assert.equal(actual.artifacts![0].text,large.text);for(const [field,value]of Object.entries(large.facts))assert.equal(actual.artifacts![0].facts[field],value)}
  else{assert.equal(contract(input).wireSchema.safeParse(large).success,true,'complete business-valid JSON cannot override a length finish');await assert.rejects(runInsideLongTask(run),error=>error instanceof StructuredGenerationError&&error.kind==='incomplete');assert.equal(model.doStreamCalls.length,2,'no third generation or new outer request')}
  for(const call of model.doStreamCalls){assert.equal(call.maxOutputTokens,32768);assert.equal(call.responseFormat?.type,'json')}
  assert.deepEqual(input,before);assert.deepEqual(large,wireBefore)
 })
})
