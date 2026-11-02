import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import type {z} from 'zod'
import {generateJSON,StructuredGenerationError} from '../../src/lib/ai/generate'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import * as ai from '../../desktop/service/novel-import-ai'
import {NovelImportController} from '../../desktop/main/novel-import'
import {importAiPrompt,serializeImportAiPayload,assertImportFixedPromptReserve,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportAiResult,ImportArtifact,ImportModel} from '../../desktop/shared/novel-import'
// Synthetic values only. The real generateJSON is exercised with its existing
// generateText dependency injection; no quota, model, Key or DB call is made.
const currentId='unit-current-SYNTHETIC-SECRET',foreignId='MODEL-FOREIGN-SYNTHETIC-SECRET',sourceText='合成原文首句。\r\n这里是一处小室，仍保留完整尾句😀',model:ImportModel={id:'schema-text',name:'合成模型',modelId:'synthetic',endpoint:'https://schema.invalid/v1',authRevision:1,contextWindow:16000}
const scene:ImportArtifact={id:'model-artifact-SYNTHETIC-SECRET',kind:'scene',name:'模型名-SYNTHETIC-SECRET',text:'完整合成地点资料',facts:{entityType:'PLACE',coordinates:''},sourceUnitIds:[currentId],evidence:[{unitId:currentId,quote:'这里是一处小室'}],origin:'inferred'}
const existing:ImportArtifact={...scene,id:'existing-character',kind:'character',name:'已有合成人物',text:'已有资料不可改',facts:{roleType:'SUPPORTING',aliases:'[]',relationships:'[]'}}
const request=():ImportAiRequest=>({semanticVersion:1,operationId:'11111111-1111-4111-8111-111111111111',phase:'analyze',kind:'scene',units:[{id:currentId,fileId:'synthetic-source',start:0,end:sourceText.length,text:sourceText,kind:'body'}],artifacts:[structuredClone(existing)],workingRevision:0,models:{text:model,review:model},selectedTargets:['scene']})
const result={artifacts:[scene]},cases=[{name:'kind',field:'kind',artifact:{...scene,kind:'world' as const},value:'world'},{name:'origin',field:'origin',artifact:{...scene,origin:'confirmed' as const},value:'confirmed'},{name:'empty-source',field:'sourceUnitIds',artifact:{...scene,sourceUnitIds:[]},value:''},{name:'foreign-source',field:'sourceUnitIds',artifact:{...scene,sourceUnitIds:[foreignId]},value:foreignId},{name:'mixed-source',field:'sourceUnitIds',artifact:{...scene,sourceUnitIds:[currentId,foreignId]},value:foreignId}]
type Bridge=(request:ImportAiRequest,context:{userId:string;resolvedModel:ResolvedModel},signal:AbortSignal,prompt:string,deps?:Parameters<typeof generateJSON>[1])=>Promise<ImportAiResult>
type Factory=(request:ImportAiRequest)=>z.ZodType<ImportAiResult>
const api=ai as typeof ai&{generateImportAiJson?:Bridge;importAiResponseSchema?:Factory}
const reliabilityValues=['客观事实','角色有限事实','人物推测','可能不可靠'] as const
const knowledgeSecret='KNOWLEDGE-VALUE-SYNTHETIC-SECRET',attribution=' \t合成信息持有者😀\r\n',temporalScope='  仅合成早期阶段  '
function knowledgeRequest(kind:ImportArtifact['kind']):ImportAiRequest{return {...request(),kind,selectedTargets:[kind],...(kind==='narrative'?{chapters:[{id:'synthetic-chapter',title:'合成章',start:0,end:sourceText.length}]}:{})}}
function knowledgeArtifact(kind:ImportArtifact['kind'],facts:Record<string,string>):ImportArtifact{return {...scene,kind,text:'完整合成知识资料',facts:{...(kind==='worldline'?{lineId:'synthetic-line',lineName:'合成事件线',timeKind:'unknown',people:'[]'}:{}),...(kind==='narrative'?{chapterIndex:'0',order:'0',refs:'[]'}:{}),...facts}}}
const knowledgeBadCases:{name:string;kind:ImportArtifact['kind'];field:string;bad:Record<string,string>;good:Record<string,string>}[]=[
 {name:'unknown-reliability',kind:'theme' as const,field:'reliability',bad:{reliability:knowledgeSecret},good:{reliability:'客观事实',temporalScope}},
 {name:'empty-reliability',kind:'theme' as const,field:'reliability',bad:{reliability:''},good:{reliability:'客观事实',temporalScope}},
 {name:'missing-attribution',kind:'theme' as const,field:'attribution',bad:{reliability:'人物推测'},good:{reliability:'人物推测',attribution,temporalScope}},
 {name:'blank-attribution',kind:'theme' as const,field:'attribution',bad:{reliability:'角色有限事实',attribution:' \t\r\n'},good:{reliability:'角色有限事实',attribution,temporalScope}},
 {name:'worldline-required',kind:'worldline' as const,field:'reliability',bad:{},good:{reliability:'客观事实'}},
 {name:'narrative-required',kind:'narrative' as const,field:'reliability',bad:{},good:{reliability:'客观事实'}}
]
const knowledgeGoodFacts:Record<string,string>[]=[{}, {attribution:' \t',temporalScope}, {reliability:'客观事实'}, {reliability:'客观事实',attribution:' \t',temporalScope}, ...reliabilityValues.slice(1).map(reliability=>({reliability,attribution,temporalScope}))]

test('NI-J01: request-bound import schema reuses the bounded JSON correction bridge',async()=>{
 const bridge=api.generateImportAiJson;assert.ok(bridge,'defaults and tests need the same production bridge')
 // Check the actual defaults.generate terminal return, not an independently
 // constructed factory->generateJSON test path that production never calls.
 const source=await readFile('desktop/service/novel-import-ai.ts','utf8'),tree=ts.createSourceFile('import.ts',source,ts.ScriptTarget.Latest,true);let defaults:ts.ObjectLiteralExpression|undefined,bridgeNode:ts.FunctionDeclaration|undefined;function visit(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='defaults'&&n.initializer&&ts.isObjectLiteralExpression(n.initializer))defaults=n.initializer;if(ts.isFunctionDeclaration(n)&&n.name?.text==='generateImportAiJson')bridgeNode=n;ts.forEachChild(n,visit)}visit(tree);const generate=defaults!.properties.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(tree)==='generate') as ts.MethodDeclaration,last=generate.body!.statements.at(-1)!;assert.ok(ts.isReturnStatement(last)&&last.expression&&ts.isCallExpression(last.expression));assert.equal(last.expression.expression.getText(tree),'generateImportAiJson');assert.equal(last.expression.arguments[0].getText(tree),'request');assert.ok(bridgeNode!.getText(tree).includes('generateJSON('));assert.ok(bridgeNode!.getText(tree).includes('const base=importAiResponseSchema(request)'));let jsonCall:ts.CallExpression|undefined;function findJson(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='generateJSON')jsonCall=n;ts.forEachChild(n,findJson)}findJson(bridgeNode!);const args=jsonCall!.arguments[0];assert.ok(ts.isObjectLiteralExpression(args));for(const name of ['schema','resolvedModel'])assert.ok(args.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree)===name||ts.isShorthandPropertyAssignment(p)&&p.name.text===name))
 const r=request(),before=structuredClone(r),prompt=importAiPrompt(r),context={userId:'synthetic-user',resolvedModel:{} as ResolvedModel}
 for(const item of cases){const prompts:string[]=[],signals:AbortSignal[]=[],controller=new AbortController(),raw={artifacts:[item.artifact]};const output=await bridge(r,context,controller.signal,prompt,{generateText:async opts=>{assert.equal(Object.hasOwn(opts,'schema'),false,'schema remains local, never serialized to the provider');assert.equal(Object.hasOwn(opts,'response_format'),false);assert.equal(opts.resolvedModel,context.resolvedModel);assert.equal(opts.userId,context.userId);assert.equal(opts.action,'novel.import.analyze');assert.equal(opts.role,'text');signals.push(opts.abortSignal!);prompts.push('prompt'in opts?opts.prompt:'');return {text:JSON.stringify(prompts.length===1?raw:result),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}});assert.deepEqual(output,result,item.name);assert.equal(prompts.length,2,item.name+' gets exactly one existing correction');assert.ok(prompts[1].startsWith(prompts[0]));const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes('artifacts.0.'+item.field));for(const forbidden of [currentId,foreignId,scene.id,scene.name,scene.text,sourceText,model.endpoint,...(item.value?[item.value]:[])])assert.ok(!feedback.includes(forbidden),item.name+' correction does not echo values or IDs');assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(prompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);assert.ok(signals.every(s=>s===controller.signal));assertImportFixedPromptReserve(prompt,serializeImportAiPayload(r));assert.deepEqual(r,before)
  const failed:string[]=[];await assert.rejects(bridge(r,context,controller.signal,prompt,{generateText:async opts=>{failed.push('prompt'in opts?opts.prompt:'');return {text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(failed.length,2,item.name+' stops after the existing second attempt')
 }
 const world:ImportArtifact={...scene,kind:'world',text:'',facts:{entityType:'WORLD'}},worldRequest={...request(),kind:'world' as const,selectedTargets:['world' as const]},worldBefore=structuredClone(worldRequest),worldGood={artifacts:[world]},worldPrompt=importAiPrompt(worldRequest),worldCases=[{name:'kind-outside-enum',artifact:{...world,kind:'MODEL-KIND-SYNTHETIC-SECRET' as any},kind:true,origin:false,source:false},{name:'kind-inside-enum',artifact:{...world,kind:'scene' as const},kind:true,origin:false,source:false},{name:'origin-outside-enum',artifact:{...world,origin:'MODEL-ORIGIN-SYNTHETIC-SECRET' as any},kind:false,origin:true,source:false},{name:'kind-and-mixed-source',artifact:{...world,kind:'MODEL-KIND-SYNTHETIC-SECRET' as any,sourceUnitIds:[currentId,foreignId]},kind:true,origin:false,source:true}];for(const item of worldCases){const prompts:string[]=[];const raw={artifacts:[item.artifact]},output=await bridge(worldRequest,context,new AbortController().signal,worldPrompt,{generateText:async opts=>{prompts.push('prompt'in opts?opts.prompt:'');return {text:JSON.stringify(prompts.length===1?raw:worldGood),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}});assert.deepEqual(output,worldGood);assert.equal(prompts.length,2);const feedback=prompts[1].slice(prompts[0].length);if(item.kind){assert.ok(feedback.includes('artifacts.0.kind'));assert.ok(feedback.includes('kind必须为本次唯一目标 world'),'enum-inside/outside both identify the single allowed world target');for(const other of ['outline','theme','style','character','scene','item','foreshadow','goldenFinger','trope','worldline','narrative'])assert.ok(!feedback.includes(other),'no full target enum in correction')}if(item.origin){assert.ok(feedback.includes('artifacts.0.origin'));assert.ok(feedback.includes('inferred'));for(const other of ['"source"','"confirmed"'])assert.ok(!feedback.includes(other),'origin correction accepts only inferred')}if(item.source)assert.ok(feedback.includes('artifacts.0.sourceUnitIds'),'a bad kind cannot hide independent source membership failure');for(const forbidden of ['MODEL-KIND-SYNTHETIC-SECRET','MODEL-ORIGIN-SYNTHETIC-SECRET',currentId,foreignId,world.id,world.name,sourceText,model.endpoint])assert.ok(!feedback.includes(forbidden));assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(worldPrompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);let failed=0;await assert.rejects(bridge(worldRequest,context,new AbortController().signal,worldPrompt,{generateText:async()=>{failed++;return {text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(failed,2);assert.deepEqual(worldRequest,worldBefore)}let worldFirstGood=0;assert.deepEqual(await bridge(worldRequest,context,new AbortController().signal,worldPrompt,{generateText:async()=>{worldFirstGood++;return {text:JSON.stringify(worldGood),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),worldGood);assert.equal(worldFirstGood,1)
 let good=0;assert.deepEqual(await bridge(r,context,new AbortController().signal,prompt,{generateText:async()=>{good++;return {text:JSON.stringify(result),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),result);assert.equal(good,1);assert.deepEqual(r,before)
 for(const item of knowledgeBadCases){
  const input=knowledgeRequest(item.kind),snapshot=structuredClone(input),inputPrompt=importAiPrompt(input),raw={artifacts:[knowledgeArtifact(item.kind,item.bad)]},valid={artifacts:[knowledgeArtifact(item.kind,item.good)]},prompts:string[]=[]
  const output=await bridge(input,context,new AbortController().signal,inputPrompt,{generateText:async opts=>{assert.equal(Object.hasOwn(opts,'schema'),false);prompts.push('prompt'in opts?opts.prompt:'');return {text:JSON.stringify(prompts.length===1?raw:valid),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})
  assert.deepEqual(output,valid,item.name+' uses the same correction bridge');assert.equal(prompts.length,2,item.name+' gets one correction')
  const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes('artifacts.0.facts.'+item.field),item.name+' has a fixed facts field path')
  if(item.field==='reliability')for(const value of reliabilityValues)assert.ok(feedback.includes(value),'fixed four-value guidance')
  else {assert.ok(feedback.includes('attribution'));assert.ok(/非空|归属/.test(feedback))}
  for(const secret of [knowledgeSecret,currentId,foreignId,scene.id,scene.name,scene.text,sourceText,model.endpoint,attribution,temporalScope])assert.ok(!feedback.includes(secret),item.name+' feedback never echoes source or values')
  assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(inputPrompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);assertImportFixedPromptReserve(inputPrompt,serializeImportAiPayload(input))
  let failed=0;await assert.rejects(bridge(input,context,new AbortController().signal,inputPrompt,{generateText:async()=>{failed++;return {text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(failed,2,item.name+' cannot add a third attempt')
  let firstGood=0;assert.deepEqual(await bridge(input,context,new AbortController().signal,inputPrompt,{generateText:async()=>{firstGood++;return {text:JSON.stringify(valid),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),valid);assert.equal(firstGood,1);assert.deepEqual(input,snapshot)
 }
 for(const facts of knowledgeGoodFacts){const input=knowledgeRequest('theme'),snapshot=structuredClone(input),valid={artifacts:[knowledgeArtifact('theme',facts)]};let calls=0;assert.deepEqual(await bridge(input,context,new AbortController().signal,importAiPrompt(input),{generateText:async()=>{calls++;return {text:JSON.stringify(valid),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),valid,'legal omission/raw strings have no default or trim');assert.equal(calls,1);assert.deepEqual(input,snapshot)}
})

test('NI-J02: request-bound import schema preserves strict validation and compatibility',async()=>{
 const factory=api.importAiResponseSchema;assert.ok(factory);const r=request(),before=structuredClone(r),call=async(raw:unknown,input:ImportAiRequest=r,options:{signal?:AbortSignal;assert?:()=>Promise<void>;resolve?:(role:'text'|'review',id:string)=>Promise<ImportModel>}={})=>ai.runImportAi(input,options.signal??new AbortController().signal,{resolve:options.resolve??(async()=>model),assert:options.assert??(async()=>{}),generate:async()=>structuredClone(raw)})
 // Invoke the actual production method on an uninitialized prototype. No
 // constructor, worker, initialize, IO dependency or product test hook is used.
 const isolated=Object.create(NovelImportController.prototype) as {safeError(error:unknown):string},generic='导入处理失败，请核对来源、模型配置后重试',safeKnowledge=[['事实可靠性类型无效','推断结果的可靠性类型无效，请核对后重试'],['非客观事实缺少知识归属说明','推断结果缺少非客观信息的归属说明，请核对后重试'],['事件或叙事必须明确可靠性','事件或叙事结果缺少明确可靠性，请核对后重试']]
 assert.deepEqual(Object.getOwnPropertyNames(isolated),[])
 for(const [message,expected] of safeKnowledge){assert.equal(isolated.safeError(new Error(message)),expected);for(const unsafe of [message+' '+knowledgeSecret,message+'近似',message+'\n',message.slice(0,-1), ' '+message])assert.equal(isolated.safeError(new Error(unsafe)),generic);assert.equal(isolated.safeError({message}),generic);assert.equal(isolated.safeError(message),generic)}
 assert.equal(isolated.safeError(new Error('UNKNOWN-'+knowledgeSecret)),generic);assert.equal(isolated.safeError(new Error('受控合成失败')),'受控合成失败');assert.equal(isolated.safeError(new Error('模型证据无法定位（unknown-unit）')),'模型证据无法定位（unknown-unit）');assert.equal(isolated.safeError(null),generic);assert.deepEqual(Object.getOwnPropertyNames(isolated),[])
 for(const item of knowledgeBadCases){const input=knowledgeRequest(item.kind),snapshot=structuredClone(input),raw={artifacts:[knowledgeArtifact(item.kind,item.bad)]},checked=factory(input).safeParse(raw);assert.equal(checked.success,false,item.name+' is rejected before native validation');if(!checked.success){assert.ok(checked.error.issues.some(issue=>issue.path.join('.')==='artifacts.0.facts.'+item.field));for(const issue of checked.error.issues)for(const secret of [knowledgeSecret,currentId,foreignId,scene.id])assert.ok(!issue.message.includes(secret))}await assert.rejects(call(raw,input),/结构|类别/);assert.deepEqual(input,snapshot);assert.equal(factory({...input,semanticVersion:undefined,selectedTargets:undefined}).safeParse(raw).success,true,'legacy facts schema remains unchanged')}
 for(const facts of knowledgeGoodFacts){const input=knowledgeRequest('theme'),valid={artifacts:[knowledgeArtifact('theme',facts)]};assert.deepEqual(await call(valid,input),valid,'final parsing/core gates preserve optional/raw knowledge strings');assert.deepEqual(valid.artifacts[0].facts,facts)}
 const multipleInput=knowledgeRequest('theme'),multipleBad={artifacts:[{...knowledgeArtifact('theme',{reliability:knowledgeSecret}),kind:'MODEL-KIND-SYNTHETIC-SECRET',sourceUnitIds:[currentId,foreignId]}]},multiple=factory(multipleInput).safeParse(multipleBad);assert.equal(multiple.success,false);if(!multiple.success){const paths=multiple.error.issues.map(issue=>issue.path.join('.'));for(const path of ['artifacts.0.kind','artifacts.0.sourceUnitIds','artifacts.0.facts.reliability'])assert.ok(paths.includes(path));for(const issue of multiple.error.issues)for(const secret of [knowledgeSecret,'MODEL-KIND-SYNTHETIC-SECRET',currentId,foreignId])assert.ok(!issue.message.includes(secret))}await assert.rejects(call(multipleBad,multipleInput),/结构|类别/)
 for(const kind of [undefined,'MODEL-REQUEST-KIND-SYNTHETIC-SECRET','body','WORLD',null,{}]){const invalid={...request(),kind} as unknown as ImportAiRequest,beforeInvalid=structuredClone(invalid);let generated=0,resolved=0,requestError:unknown;try{await ai.runImportAi(invalid,new AbortController().signal,{resolve:async()=>{resolved++;return model},assert:async()=>{},generate:async()=>{generated++;return {notFound:true}}})}catch(error){requestError=error}assert.equal(generated,0,'invalid/missing target never enters generation');assert.equal(resolved,0,'request schema validation precedes model resolution');assert.ok(requestError instanceof Error);assert.equal(requestError.message,'当前分析目标类别无效');assert.ok(!requestError.message.includes('MODEL-REQUEST-KIND-SYNTHETIC-SECRET'));assert.throws(()=>factory(invalid),error=>error instanceof Error&&error.message==='当前分析目标类别无效');let textCalls=0;await assert.rejects(api.generateImportAiJson!(invalid,{userId:'synthetic',resolvedModel:{} as ResolvedModel},new AbortController().signal,'fixed',{generateText:async()=>{textCalls++;return {text:'{"notFound":true}',promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),error=>error instanceof Error&&error.message==='当前分析目标类别无效');assert.equal(textCalls,0);assert.deepEqual(invalid,beforeInvalid)}
 const worldRequest={...request(),kind:'world' as const,selectedTargets:['world' as const]},world={...scene,kind:'world' as const,text:'',facts:{entityType:'WORLD'}},simultaneous={artifacts:[{...world,kind:'MODEL-KIND-SYNTHETIC-SECRET' as any,sourceUnitIds:[currentId,foreignId]}]},parsed=factory(worldRequest).safeParse(simultaneous);assert.equal(parsed.success,false);if(!parsed.success){const paths=parsed.error.issues.map(i=>i.path.join('.'));assert.ok(paths.includes('artifacts.0.kind'));assert.ok(paths.includes('artifacts.0.sourceUnitIds'));for(const issue of parsed.error.issues)for(const secret of ['MODEL-KIND-SYNTHETIC-SECRET',currentId,foreignId])assert.ok(!issue.message.includes(secret))}await assert.rejects(call(simultaneous,worldRequest),/结构|类别/);assert.deepEqual(await call({artifacts:[world]},worldRequest),{artifacts:[world]},'neutral WORLD text may remain empty; no kind/text coercion')
 for(const item of cases){assert.equal(factory(r).safeParse({artifacts:[item.artifact]}).success,false,item.name+' is a request schema error');await assert.rejects(call({artifacts:[item.artifact]}),/结构|类别/);assert.deepEqual(r,before)}
 const duplicate={artifacts:[{...scene,sourceUnitIds:[currentId,currentId]}]};assert.deepEqual(await call(duplicate),duplicate,'valid IDs/text remain exact, with no new deduplication or repair');assert.deepEqual(r,before)
 for(const artifact of [{...scene,facts:{entityType:'EVENT'}},{...scene,facts:{...scene.facts,parentId:'unknown-parent'}}]){assert.equal(factory(r).safeParse({artifacts:[artifact]}).success,true,'native/link validation stays at its existing later gate');await assert.rejects(call({artifacts:[artifact]}),/地点|类型|证据|引用|实体/);assert.deepEqual(r,before)}
 const unanchored={artifacts:[{...scene,evidence:[{unitId:currentId,quote:'不存在于合成原文的引句'}]}]};assert.equal(factory(r).safeParse(unanchored).success,false,'evidence location now participates in the existing correction schema');await assert.rejects(call(unanchored),/结构|类别/);assert.deepEqual(r,before)
 const legacy={...r,semanticVersion:undefined,selectedTargets:undefined};for(const item of cases){assert.equal(factory(legacy).safeParse({artifacts:[item.artifact]}).success,true,'legacy base schema stays unchanged');await assert.rejects(call({artifacts:[item.artifact]},legacy),/无效实体|来源单元/)}
 const classify={...r,phase:'classify' as const,kind:undefined,artifacts:[]},review={...r,phase:'review' as const,kind:undefined},conflict={id:'synthetic-conflict',hash:'fixed',type:'body-body' as const,kind:'body' as const,entity:'陈述',field:'状态',source:{text:'原值',value:'原值',unitId:currentId},candidate:{text:'新值',value:'新值',unitId:currentId},evidence:scene.evidence,status:'pending' as const},patch={...r,phase:'patch' as const,kind:undefined,conflict},reconcile={...r,kind:'character' as const,intent:'reconcile' as const,reconcile:{targetIds:[existing.id],locks:[],decisionHash:'c'.repeat(64),workingRevision:0}}
 const compatible=[{request:classify,result:{classifications:[{unitId:currentId,kind:'body'}]}},{request:review,result:{conflicts:[]}},{request:patch,result:{patches:[{id:'patch',start:0,end:2,before:sourceText.slice(0,2),after:'新文',reason:'合成逐处提案',workingRevision:0,conflictId:conflict.id}]}},{request:reconcile,result:{artifactEdits:[],conflicts:[]}}]
 for(const item of compatible){if(!['classify','review'].includes(item.request.phase))assert.equal(factory(item.request),factory({...review,selectedTargets:undefined}),'other semantic phases share the original schema object');assert.equal(factory(item.request).safeParse({artifacts:[cases[4].artifact]}).success,item.request.phase!=='classify','classify validates required coverage; other stages are not widened');assert.deepEqual(await call(item.result,item.request),item.result);await assert.rejects(call({...item.result,artifacts:[scene]},item.request),/阶段|越权|不能/)}
 const aborted=new AbortController();aborted.abort(Error('synthetic canceled'));await assert.rejects(call(result,r,{signal:aborted.signal}),/canceled/);const late=new AbortController();await assert.rejects(ai.runImportAi(r,late.signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>{late.abort(Error('synthetic canceled'));return structuredClone(result)}}),/canceled/)
 let assertions=0;await assert.rejects(call(result,r,{assert:async()=>{if(++assertions===2)throw Error('合成授权已撤销')}}),/授权/);assert.equal(assertions,2);let resolutions=0;await assert.rejects(call(result,r,{resolve:async()=>++resolutions===1?model:{...model,authRevision:2}}),/模型配置|授权/);assert.equal(resolutions,2);assert.deepEqual(r,before)
})

test('NI-J03: evidence location uses the existing bounded correction without transforming quotes',async t=>{
 const bridge=api.generateImportAiJson,factory=api.importAiResponseSchema;assert.ok(bridge);assert.ok(factory)
 const context={userId:'synthetic-evidence-user',resolvedModel:{} as ResolvedModel},quoteSecret='EVIDENCE-QUOTE-SYNTHETIC-SECRET',guidance='证据必须引用本次unitId中的原文连续片段，不可概述、拼接或补字'
 const messages:Record<string,string>={
  'unknown-unit':guidance+'；unitId必须逐字取自本次输入单元；quote只能复制该单元text，不得借其它单元',
  'too-short':guidance+'；此非精确引文非空白字符不足8，不能恢复排版；从声明单元text复制原文，保留空白与标点；精确短引文仍允许',
  ambiguous:guidance+'；排版恢复出现多个命中；从声明单元text复制含必要上下文的连续原文并保留原排版，不得任选位置',
  'no-match':guidance+'；声明单元内未找到引文；核对unitId与quote配对，从该单元text原样复制，不跨单元、不改字标点'
 }
 const r=request(),before=structuredClone(r),prompt=importAiPrompt(r),bad={artifacts:[{...scene,evidence:[{unitId:currentId,quote:quoteSecret}]}]},badBefore=structuredClone(bad),good=structuredClone(result)
 const generated=(raw:unknown)=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})
 const late=(input:ImportAiRequest,raw:unknown)=>ai.runImportAi(input,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
 await t.test('production bridge corrects a bad location exactly once with safe bounded feedback',async()=>{
  const controller=new AbortController(),prompts:string[]=[]
  const output=await bridge(r,context,controller.signal,prompt,{generateText:async opts=>{
   assert.equal(Object.hasOwn(opts,'schema'),false);assert.equal(Object.hasOwn(opts,'response_format'),false)
   assert.equal(opts.resolvedModel,context.resolvedModel);assert.equal(opts.userId,context.userId);assert.equal(opts.abortSignal,controller.signal);assert.equal(opts.role,'text');assert.equal(opts.action,'novel.import.analyze')
   prompts.push('prompt'in opts?opts.prompt:'');return generated(prompts.length===1?bad:good)
  }})
  assert.deepEqual(output,good);assert.equal(prompts.length,2);assert.ok(prompts[1].startsWith(prompts[0]))
  const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes('artifacts.0.evidence.0'));assert.ok(feedback.includes(guidance))
  for(const secret of [quoteSecret,currentId,foreignId,scene.id,scene.name,scene.text,sourceText,model.endpoint,'no-match','unknown-unit','too-short','ambiguous'])assert.ok(!feedback.includes(secret),'fixed correction must not echo source, IDs or caught errors')
  assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(prompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);assertImportFixedPromptReserve(prompt,serializeImportAiPayload(r))
  assert.deepEqual(await late(r,output),good);assert.deepEqual(r,before);assert.deepEqual(bad,badBefore)
 })
 await t.test('two invalid attempts stop and a first valid answer needs only one generation',async()=>{
  let calls=0;await assert.rejects(bridge(r,context,new AbortController().signal,prompt,{generateText:async()=>{calls++;return generated(bad)}}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes('artifacts.0.evidence.0'));assert.equal(calls,2)
  let firstGood=0;assert.deepEqual(await bridge(r,context,new AbortController().signal,prompt,{generateText:async()=>{firstGood++;return generated(good)}}),good);assert.equal(firstGood,1);assert.deepEqual(r,before);assert.deepEqual(bad,badBefore)
 })
 await t.test('literal acceptance cases agree with the unchanged legacy late matcher',async()=>{
  const cases:{name:string;text:string;quote:string;exact?:string;error?:string;unitId?:string;second?:string}[]=[
   {name:'precise-short',text:'回声。回声。',quote:'回',exact:'回'},
   {name:'precise-repeated',text:'回声。回声。',quote:'回声',exact:'回声'},
   {name:'Han-layout-and-UTF16',text:'😀首。甲𠀀\r\n丙丁戊己庚辛。尾😀',quote:'甲𠀀丙丁戊己庚辛',exact:'甲𠀀\r\n丙丁戊己庚辛'},
   {name:'Latin-whitespace-preserved',text:'abcdefgh\r\nijklmnop',quote:'abcdefgh ijklmnop',exact:'abcdefgh\r\nijklmnop'},
   {name:'no-match',text:'甲乙丙丁戊己庚辛',quote:quoteSecret,error:'no-match'},
   {name:'unknown-unit',text:'甲乙丙丁戊己庚辛',quote:'甲乙丙丁戊己庚辛',unitId:foreignId,error:'unknown-unit'},
   {name:'layout-too-short',text:'甲乙\r\n丙丁',quote:'甲乙丙丁',error:'too-short'},
   {name:'layout-ambiguous',text:'甲乙\r\n丙丁戊己庚辛。甲乙\t丙丁戊己庚辛',quote:'甲乙丙丁戊己庚辛',error:'ambiguous'},
   {name:'Latin-word-boundary',text:'abcdefgh ijklmnop',quote:'abcdefghijklmnop',error:'no-match'},
   {name:'digit-word-boundary',text:'1234 5678',quote:'12345678',error:'no-match'},
   {name:'cross-unit-join',text:'甲乙丙丁',second:'戊己庚辛',quote:'甲乙丙丁戊己庚辛',error:'no-match'},
   {name:'noncontiguous-join',text:'甲乙丙丁隔戊己庚辛',quote:'甲乙丙丁戊己庚辛',error:'no-match'}
  ]
  for(const item of cases){
   const units=[{...r.units[0],text:item.text,end:item.text.length},...(item.second?[{...r.units[0],id:'second-synthetic-unit',text:item.second,start:item.text.length,end:item.text.length+item.second.length}]:[])],input={...request(),units},snapshot=structuredClone(input),raw={artifacts:[{...scene,evidence:[{unitId:item.unitId??currentId,quote:item.quote}]}]},rawBefore=structuredClone(raw),legacy={...input,semanticVersion:undefined,selectedTargets:undefined},checked=factory(input).safeParse(raw)
   assert.equal(checked.success,!item.error,item.name+' early schema has the original acceptance set');assert.equal(factory(legacy).safeParse(raw).success,true,item.name+' does not alter the legacy schema')
   if(item.error){
    assert.equal(checked.success,false);if(!checked.success){assert.deepEqual(checked.error.issues.map(issue=>issue.path),[['artifacts',0,'evidence',0]]);assert.deepEqual(checked.error.issues.map(issue=>issue.message),[messages[item.error]])}
    await assert.rejects(late(input,raw),/结构|类别/,item.name);await assert.rejects(late(legacy,raw),error=>error instanceof Error&&error.message==='模型证据无法定位（'+item.error+'）',item.name+' original late matcher still rejects')
   }else{
    assert.ok(checked.success);assert.deepEqual(checked.data,raw,item.name+' schema only checks; no quote transformation')
    const expected={artifacts:[{...raw.artifacts[0],evidence:[{unitId:currentId,quote:item.exact!}]}]}
    assert.deepEqual(await late(input,raw),expected,item.name+' semantic late gate restores exact source');assert.deepEqual(await late(legacy,raw),expected,item.name+' original late gate agrees');assert.ok(item.exact!.isWellFormed());assert.ok(item.text.includes(item.exact!))
    if(item.exact!==item.quote){let calls=0;assert.deepEqual(await bridge(input,context,new AbortController().signal,importAiPrompt(input),{generateText:async()=>{calls++;return generated(raw)}}),raw,'the real bridge preserves raw layout and UTF16 quotes until the late gate');assert.equal(calls,1)}
   }
   assert.deepEqual(input,snapshot);assert.deepEqual(raw,rawBefore)
  }
 })
 await t.test('each entry has its own safe path and other stages keep their original schema',async()=>{
  const raw={artifacts:[structuredClone(scene),{...scene,id:'second-synthetic-artifact',evidence:[...scene.evidence,{unitId:foreignId,quote:quoteSecret}]}]},rawBefore=structuredClone(raw),checked=factory(r).safeParse(raw)
  assert.equal(checked.success,false);if(!checked.success){assert.deepEqual(checked.error.issues.map(issue=>issue.path),[['artifacts',1,'evidence',1]]);assert.deepEqual(checked.error.issues.map(issue=>issue.message),[messages['unknown-unit']])}
  const simultaneous={artifacts:[{...bad.artifacts[0],kind:'MODEL-KIND-SYNTHETIC-SECRET',sourceUnitIds:[currentId,foreignId]}]},multiple=factory(r).safeParse(simultaneous);assert.equal(multiple.success,false);if(!multiple.success){assert.deepEqual(multiple.error.issues.map(issue=>issue.path.join('.')).sort(),['artifacts.0.evidence.0','artifacts.0.kind','artifacts.0.sourceUnitIds']);for(const issue of multiple.error.issues)for(const secret of [quoteSecret,currentId,foreignId,'MODEL-KIND-SYNTHETIC-SECRET'])assert.ok(!issue.message.includes(secret))}
  const stages=[{...r,phase:'classify' as const},{...r,phase:'review' as const},{...r,phase:'patch' as const},{...r,intent:'reconcile' as const}]
  for(const input of stages){if(!['classify','review'].includes(input.phase))assert.equal(factory(input),factory({...stages[1],selectedTargets:undefined}));const accepted=input.phase==='classify'?{...bad,classifications:input.units.map(unit=>({unitId:unit.id,kind:'body' as const}))}:bad;assert.deepEqual(factory(input).parse(accepted),accepted,'evidence schema is not widened to other phases or reconcile')}
  const review={...r,phase:'review' as const,kind:undefined},conflict={id:'synthetic-evidence-conflict',hash:'fixed',type:'body-body' as const,kind:'body' as const,entity:'合成陈述',field:'状态',source:{text:'原值',value:'原值',unitId:currentId},candidate:{text:'新值',value:'新值',unitId:currentId},evidence:bad.artifacts[0].evidence,status:'pending' as const}
  assert.equal(factory(review).safeParse({conflicts:[conflict]}).success,false,'scene-only review now checks anchors before bounded correction');await assert.rejects(late(review,{conflicts:[conflict]}),/结构|类别/);const otherReview={...review,selectedTargets:['scene','world'] as const};assert.equal(factory({...otherReview,selectedTargets:[...otherReview.selectedTargets]}).safeParse({conflicts:[conflict]}).success,true);await assert.rejects(late({...otherReview,selectedTargets:[...otherReview.selectedTargets]},{conflicts:[conflict]}),error=>error instanceof Error&&error.message==='模型证据无法定位（no-match）','other review retains its unchanged late gate')
  assert.deepEqual(raw,rawBefore);assert.deepEqual(r,before)
 })
})

test('NI-J04: worldline native validation uses bounded correction and exact safe diagnostics',async t=>{
 const h=await import('../../desktop/core/novel-import-semantics'),factory=api.importAiResponseSchema,bridge=api.generateImportAiJson;assert.ok(factory);assert.ok(bridge)
 const r=knowledgeRequest('worldline'),before=structuredClone(r),secret='WORLDLINE-NATIVE-SYNTHETIC-SECRET',facts:Record<string,string>={lineId:' synthetic-line ',lineName:' 合成主线 ',timeKind:'unknown',people:'[]',reliability:'客观事实'},event:ImportArtifact={...scene,id:'event-'+secret,kind:'worldline',text:'完整合成事件资料',facts}
 const good={artifacts:[event]},context={userId:'synthetic-worldline-user',resolvedModel:{} as ResolvedModel},prompt=importAiPrompt(r),guidance='worldline必须提供非空lineId、lineName、timeKind(unknown/exact/window)及people(JSON字符串数组)；eventId若提供须等于artifact.id；unknown不带timeValue/timeEnd，exact需有限timeValue且无timeEnd，window需有限timeValue/timeEnd且timeEnd不小于timeValue'
 const cases:{name:string;valid:boolean;facts:Record<string,string>}[]=[
  {name:'unknown',valid:true,facts},
  {name:'empty-people-and-time-text',valid:true,facts:{...facts,people:' [ ] ',time:' 原时间资料 '}},
  {name:'exact-raw-number',valid:true,facts:{...facts,eventId:event.id,timeKind:'exact',timeValue:' \t-2.5 \r\n'}},
  {name:'window-equal-boundary',valid:true,facts:{...facts,timeKind:'window',timeValue:'1e2',timeEnd:' 100 '}},
  {name:'people-raw-strings',valid:true,facts:{...facts,people:' [ " '+existing.name+' " ] '}},
  {name:'missing-line-id',valid:false,facts:Object.fromEntries(Object.entries(facts).filter(([key])=>key!=='lineId'))},
  {name:'blank-line-name',valid:false,facts:{...facts,lineName:' \t\r\n'}},
  {name:'missing-time-kind',valid:false,facts:Object.fromEntries(Object.entries(facts).filter(([key])=>key!=='timeKind'))},
  {name:'unknown-time-kind',valid:false,facts:{...facts,timeKind:secret}},
  {name:'missing-people',valid:false,facts:Object.fromEntries(Object.entries(facts).filter(([key])=>key!=='people'))},
  {name:'people-invalid-json',valid:false,facts:{...facts,people:secret}},
  {name:'people-object',valid:false,facts:{...facts,people:'{"private":"'+secret+'"}'}},
  {name:'people-number',valid:false,facts:{...facts,people:'[1]'}},
  {name:'people-empty-string',valid:false,facts:{...facts,people:'[""]'}},
  {name:'people-blank-string',valid:false,facts:{...facts,people:'[" "]'}},
  {name:'people-invalid-character',valid:false,facts:{...facts,people:'["\\ud800"]'}},
  {name:'event-id-mismatch',valid:false,facts:{...facts,eventId:secret}},
  {name:'unknown-time-value',valid:false,facts:{...facts,timeValue:''}},
  {name:'unknown-time-end',valid:false,facts:{...facts,timeEnd:'0'}},
  {name:'exact-missing-number',valid:false,facts:{...facts,timeKind:'exact'}},
  {name:'exact-blank-number',valid:false,facts:{...facts,timeKind:'exact',timeValue:' \t'}},
  {name:'exact-infinite-number',valid:false,facts:{...facts,timeKind:'exact',timeValue:'Infinity'}},
  {name:'exact-nonnumeric-value',valid:false,facts:{...facts,timeKind:'exact',timeValue:secret}},
  {name:'exact-window-property',valid:false,facts:{...facts,timeKind:'exact',timeValue:'0',timeEnd:''}},
  {name:'window-missing-end',valid:false,facts:{...facts,timeKind:'window',timeValue:'1'}},
  {name:'window-invalid-end',valid:false,facts:{...facts,timeKind:'window',timeValue:'1',timeEnd:secret}},
  {name:'window-reversed',valid:false,facts:{...facts,timeKind:'window',timeValue:'2',timeEnd:'1'}},
  {name:'unsupported-secret-field',valid:false,facts:{...facts,[secret]:secret}}
 ]
 const call=(raw:unknown,input:ImportAiRequest=r)=>ai.runImportAi(input,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
 await t.test('complete artifacts have the original pure-helper acceptance set and preserve raw values',async()=>{
  for(const item of cases){const a={...event,facts:item.facts},snapshot=structuredClone(a),raw={artifacts:[a]},input:ImportAiRequest=item.name==='people-raw-strings'?{...r,entities:[...(r.entities??r.artifacts.map(a=>({id:a.id,kind:a.kind,name:a.name}))),{id:'j04-space-name-character',kind:'character',name:' '+existing.name+' '}]}:r;let accepted=true;try{h.validateImportSemanticArtifact(a)}catch{accepted=false}assert.equal(accepted,item.valid,item.name+' independent literal expectation');const checked=factory(input).safeParse(raw);assert.equal(checked.success,item.valid,item.name+' schema reuses the strict helper');if(checked.success)assert.deepEqual(checked.data,raw,'native precheck must not trim, normalize or replace values');else {assert.deepEqual(checked.error.issues.map(issue=>issue.path),[['artifacts',0,'facts']]);assert.deepEqual(checked.error.issues.map(issue=>issue.message),[guidance])}assert.deepEqual(a,snapshot);assert.deepEqual(r,before)}
 })
 await t.test('production bridge gives native failures exactly one safe bounded correction',async()=>{
  assert.ok(guidance.length<=250,'the fixed native contract fits the existing feedback message limit')
  for(const item of cases.filter(item=>!item.valid)){
   const raw={artifacts:[{...event,facts:item.facts}]},snapshot=structuredClone(raw),prompts:string[]=[],controller=new AbortController()
   const output=await bridge(r,context,controller.signal,prompt,{generateText:async opts=>{assert.equal(Object.hasOwn(opts,'schema'),false);assert.equal(Object.hasOwn(opts,'response_format'),false);assert.equal(opts.abortSignal,controller.signal);assert.equal(opts.role,'text');assert.equal(opts.action,'novel.import.analyze');assert.equal(opts.resolvedModel,context.resolvedModel);assert.equal(opts.userId,context.userId);prompts.push('prompt'in opts?opts.prompt:'');return {text:JSON.stringify(prompts.length===1?raw:good),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})
   assert.deepEqual(output,good,item.name);assert.equal(prompts.length,2);assert.ok(prompts[1].startsWith(prompts[0]));const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes('artifacts.0.facts'));assert.ok(feedback.includes(guidance));for(const value of [secret,currentId,foreignId,event.id,event.name,event.text,sourceText,model.endpoint,'世界事件角色引用结构无效','未知事件时间不得制造数值'])assert.ok(!feedback.includes(value),item.name+' fixed feedback does not echo input or caught errors');assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(prompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);assertImportFixedPromptReserve(prompt,serializeImportAiPayload(r))
   let failed=0;await assert.rejects(bridge(r,context,controller.signal,prompt,{generateText:async()=>{failed++;return {text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes('artifacts.0.facts'));assert.equal(failed,2,item.name+' has no third generation');assert.deepEqual(raw,snapshot);assert.deepEqual(r,before)
  }
  let firstGood=0;assert.deepEqual(await bridge(r,context,new AbortController().signal,prompt,{generateText:async()=>{firstGood++;return {text:JSON.stringify(good),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),good);assert.equal(firstGood,1);assert.deepEqual(await call(good),good)
 })
 await t.test('formatted unknown worldline references fail early while native and other-phase gates remain',async()=>{
  const unknownReferences:Record<string,string>[]=[{people:'["unknown-character"]'},{parentId:'unknown-parent'}]
  for(const patch of unknownReferences){const raw={artifacts:[{...event,facts:{...facts,...patch}}]};h.validateImportSemanticArtifact(raw.artifacts[0]);assert.equal(factory(r).safeParse(raw).success,false);await assert.rejects(call(raw),/结构|类别/)}
  const invalid={artifacts:[{...event,facts:cases.find(item=>item.name==='missing-line-id')!.facts}]},legacy={...r,semanticVersion:undefined,selectedTargets:undefined};assert.equal(factory(legacy).safeParse(invalid).success,true)
  const stageInputs=[{...r,phase:'classify' as const},{...r,phase:'review' as const},{...r,phase:'patch' as const},{...r,intent:'reconcile' as const}];for(const input of stageInputs){if(input.phase!=='classify')assert.equal(factory(input),factory(stageInputs[1]));assert.equal(factory(input).safeParse(invalid).success,input.phase!=='classify')}
  const narrative=knowledgeRequest('narrative'),badNarrative={artifacts:[{...event,kind:'narrative' as const,facts:{reliability:'客观事实'}}]};assert.throws(()=>h.validateImportSemanticArtifact(badNarrative.artifacts[0]),/叙事/);assert.equal(factory(narrative).safeParse(badNarrative).success,false,'narrative native validation now also participates in bounded correction');await assert.rejects(call(badNarrative,narrative),/结构|类别/)
  const other={artifacts:[{...scene,facts:{entityType:'EVENT'}}]};assert.equal(factory(request()).safeParse(other).success,true);await assert.rejects(call(other,request()),/地点/);assert.deepEqual(r,before)
 })
 const isolated=Object.create(NovelImportController.prototype) as {safeError(error:unknown):string},generic='导入处理失败，请核对来源、模型配置后重试',mappings=[
  ['世界事件缺少类型、时间或角色结构','世界线结果缺少事件线、时间类型或角色结构，请核对后重试'],
  ['世界事件角色引用结构无效','世界线结果的角色引用结构无效，请核对后重试'],
  ['世界事件角色引用结构、字符或字段类型无效','世界线结果的角色引用结构无效，请核对后重试'],
  ['世界事件ID引用不一致','世界线结果的事件标识不一致，请核对后重试'],
  ['事件时间类型无效','世界线结果的时间类型无效，请核对后重试'],
  ['未知事件时间不得制造数值','世界线结果将未知时间填写为数值，请核对后重试'],
  ['事件时间数值无效','世界线结果的时间数值无效，请核对后重试'],
  ['事件时间范围无效','世界线结果的时间范围无效，请核对后重试'],
  ['确定事件时间不能混入候选窗口','世界线结果混用了确定时间与候选窗口，请核对后重试']
 ] as const
 await t.test('actual prototype maps only fixed worldline literals and retains old safe behavior',()=>{
  assert.deepEqual(Object.getOwnPropertyNames(isolated),[])
  for(const [message,expected] of mappings){assert.equal(isolated.safeError(new Error(message)),expected);for(const variant of [message+' '+secret,message+'\n',message.slice(0,-1),' '+message])assert.equal(isolated.safeError(new Error(variant)),generic);assert.equal(isolated.safeError({message}),generic);assert.equal(isolated.safeError(message),generic)}
  for(const [message,expected] of [['事实可靠性类型无效','推断结果的可靠性类型无效，请核对后重试'],['非客观事实缺少知识归属说明','推断结果缺少非客观信息的归属说明，请核对后重试'],['事件或叙事必须明确可靠性','事件或叙事结果缺少明确可靠性，请核对后重试']])assert.equal(isolated.safeError(new Error(message)),expected)
  for(const message of ['受控合成失败','模型证据无法定位（unknown-unit）','未知来源 '+secret,'未明事件时间 '+secret])assert.equal(isolated.safeError(new Error(message)),message,'unrelated old short fallback behavior is unchanged')
  for(const value of [new Error('UNKNOWN-'+secret),new Error('toString'),null,{message:secret},secret])assert.equal(isolated.safeError(value),generic);assert.deepEqual(Object.getOwnPropertyNames(isolated),[])
 })
 await t.test('unknown-event-time suffix and newline are redacted within the explicitly approved family',()=>{
  const message='未知事件时间不得制造数值',variants=[message+' '+secret,message+'\n'+secret,message+'\n',message.slice(0,-1),'未知事件时间'+secret]
  // The original main echoes these strings via its short /^未/ fallback.
  // Keep the actual baseline RED; do not claim they were already generic.
  const observed=variants.map(value=>isolated.safeError(new Error(value)));assert.deepEqual(observed,variants.map(()=>generic))
 })
 await t.test('long schema lists use a fixed structural message at the exact length boundary',()=>{
  const prefix='模型返回结构不完整（',suffix='）',make=(length:number)=>prefix+secret+'x'.repeat(length-prefix.length-secret.length-suffix.length)+suffix
  const short=make(179);assert.equal(short.length,179);assert.equal(isolated.safeError(new Error(short)),short,'short lists retain the original behavior')
  for(const length of [180,181,320]){const message=make(length);assert.equal(message.length,length);const output=isolated.safeError(new Error(message));assert.equal(output,'模型返回结构不完整，请核对后重试');assert.ok(!output.includes(secret));for(const near of [message+'\n',message+' '+secret,message.replace('完整（','完整('),' '+message])assert.equal(isolated.safeError(new Error(near)),generic);assert.equal(isolated.safeError({message}),generic)}
 })
})

test('NI-J05: hidden reference and standard service errors use exact fixed safe diagnostics',async t=>{
 const h=await import('../../desktop/core/novel-import-semantics'),factory=api.importAiResponseSchema;assert.ok(factory)
 const isolated=Object.create(NovelImportController.prototype) as {safeError(error:unknown):string},generic='导入处理失败，请核对来源、模型配置后重试',secret='HIDDEN-ERROR-SYNTHETIC-SECRET',mappings=[
  ['语义实体目录类型无效','导入实体目录的类型无效，请核对资料后重试'],
  ['角色引用类型无效','导入结果将非角色实体用作角色引用，请核对后重试'],
  ['角色引用不存在或同名不明确','导入结果引用的角色不存在或同名不明确，请核对角色资料后重试'],
  ['地点父引用必须为PLACE','地点结果的父级必须是地点，请核对后重试'],
  ['世界父引用必须为WORLD','世界结果的父级必须是世界，请核对后重试'],
  ['世界设定归属引用无效','世界设定结果的归属引用无效，请核对后重试'],
  ['MAP父引用必须属于同世界MAP','地图结果的父级必须是同一世界的地图，请核对后重试'],
  ['语义父级引用形成循环','导入结果的父级引用形成循环，请核对后重试'],
  ['叙事章节引用无效','叙事结果引用的章节无效，请核对后重试'],
  ['Invalid Format','模型服务返回请求格式无效提示，请核对配置后重试'],
  ['Authentication Fails','模型服务返回身份验证失败提示，请核对供应商授权'],
  ['Insufficient Balance','模型服务返回余额不足提示，请核对供应商账户'],
  ['Invalid Parameters','模型服务返回参数无效提示，请核对配置后重试'],
  ['Rate Limit Reached','模型服务返回请求频率限制提示，请稍后重试'],
  ['Server Error','模型服务返回服务器错误提示，请稍后重试'],
  ['Server Overloaded','模型服务返回服务过载提示，请稍后重试']
 ] as const
 await t.test('the original worldline fixtures now reject early after native format validation',async()=>{
  for(const item of [{people:foreignId,context:[]},{people:scene.id,context:[scene]}]){
   const input={...knowledgeRequest('worldline'),artifacts:[structuredClone(existing),...structuredClone(item.context)]},before=structuredClone(input),a={...knowledgeArtifact('worldline',{reliability:'客观事实',people:JSON.stringify([item.people])}),id:'j05-worldline-event'},raw={artifacts:[a]},snapshot=structuredClone(raw);let generated=0
   h.validateImportSemanticArtifact(a);assert.equal(factory(input).safeParse(raw).success,false);await assert.rejects(ai.runImportAi(input,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>{generated++;return raw}}),error=>error instanceof Error&&error.message==='模型返回结构或类别无效，请重试');assert.equal(generated,1);assert.deepEqual(input,before);assert.deepEqual(raw,snapshot)
  }
 })
 await t.test('ordinary narrative fixtures now reject early after native format validation',async()=>{
  for(const item of [{people:foreignId,context:[]},{people:scene.id,context:[scene]}]){
   const input={...knowledgeRequest('narrative'),artifacts:[structuredClone(existing),...structuredClone(item.context)]},before=structuredClone(input),a={...knowledgeArtifact('narrative',{reliability:'客观事实',narrator:item.people}),id:'j05-narrative-point'},raw={artifacts:[a]},snapshot=structuredClone(raw);let generated=0
   h.validateImportSemanticArtifact(a);assert.equal(factory(input).safeParse(raw).success,false);await assert.rejects(ai.runImportAi(input,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>{generated++;return raw}}),error=>error instanceof Error&&error.message==='模型返回结构或类别无效，请重试');assert.equal(generated,1);assert.deepEqual(input,before);assert.deepEqual(raw,snapshot)
  }
 })
 await t.test('actual reconcile field edits reach both distinct character-reference late failures',async()=>{
  const observations:{message:string;safe:string}[]=[]
  for(const item of [{people:foreignId,expected:'角色引用不存在或同名不明确',context:[]},{people:scene.id,expected:'角色引用类型无效',context:[scene]}]){
   const a={...knowledgeArtifact('narrative',{reliability:'客观事实',narrator:existing.id}),id:'j05-reconcile-target'},input:ImportAiRequest={...knowledgeRequest('narrative'),artifacts:[structuredClone(existing),...structuredClone(item.context),a],intent:'reconcile',reconcile:{targetIds:[a.id],locks:[],decisionHash:'d'.repeat(64),workingRevision:0}},before=structuredClone(input),raw={artifactEdits:[{artifactId:a.id,baseHash:h.importArtifactSemanticHash(a),setFacts:{narrator:item.people},reason:'合成真实引用晚门',evidence:a.evidence}],conflicts:[]},rawBefore=structuredClone(raw),controller=new AbortController(),roles:string[]=[];let generated=0,asserted=0,output:unknown,error:unknown
   h.validateImportSemanticArtifact({...a,facts:{...a.facts,narrator:item.people}})
   h.validateImportSemanticArtifact(a);assert.deepEqual(factory(input).parse(raw),raw,'complete native format must pass before the graph gate')
   try{output=await ai.runImportAi(input,controller.signal,{resolve:async(role,id)=>{roles.push(role);assert.equal(id,model.id);return model},assert:async()=>{asserted++},generate:async(actual,pinned,signal)=>{generated++;assert.equal(actual,input);assert.equal(pinned,model);assert.equal(signal,controller.signal);return raw}})}catch(caught){error=caught}
   assert.ok(error instanceof Error,'the actual graph gate rejects instead of producing an accepted result');assert.equal(error.message,item.expected,'no earlier schema/native/authorization failure may stand in for the graph error');assert.equal(output,undefined);assert.equal(generated,1);assert.equal(asserted,1);assert.deepEqual(roles,['text']);assert.deepEqual(input,before);assert.deepEqual(raw,rawBefore)
   const safe=isolated.safeError(error);for(const value of [secret,item.people,foreignId,scene.id,sourceText,a.name,a.text,model.endpoint])assert.ok(!safe.includes(value));observations.push({message:error.message,safe})
  }
  assert.deepEqual(observations.map(item=>item.message),['角色引用不存在或同名不明确','角色引用类型无效'])
  // The original main returns generic for these two actual late-gate Errors.
  // Keep that clean baseline RED; no hand-created replacement Error is used.
  assert.deepEqual(observations.map(item=>item.safe),[mappings[2][1],mappings[1][1]])
 })
 await t.test('only the sixteen approved complete strings map and every variant stays generic',()=>{
  assert.equal(mappings.length,16);assert.deepEqual(Object.getOwnPropertyNames(isolated),[])
  assert.deepEqual(mappings.map(([message])=>isolated.safeError(new Error(message))),mappings.map(([,expected])=>expected))
  for(const [message,expected] of mappings){
   assert.ok(expected.length<180);for(const value of [secret,foreignId,scene.id,sourceText,model.endpoint])assert.ok(!expected.includes(value))
   const variants=new Set([message.toLowerCase(),message.toUpperCase(),message.replace(' ','  '),message.slice(0,-1),' '+message,'\t'+message,message+' ',message+'\n',message+'\r\n',message+' '+secret,message+' https://redaction.invalid/'+secret,message+' model-'+secret,'API error: '+message])
   for(const variant of variants)if(variant!==message)assert.equal(isolated.safeError(new Error(variant)),generic,'nonexact variants never enter the new dictionary')
   assert.equal(isolated.safeError({message}),generic);assert.equal(isolated.safeError(message),generic)
  }
  for(const message of ['UNKNOWN-'+secret,'toString','constructor','__proto__'])assert.equal(isolated.safeError(new Error(message)),generic)
  const lookalike=Object.create(null,{message:{get(){throw Error('non-Error message must not be read')}}});assert.equal(isolated.safeError(lookalike),generic);assert.equal(isolated.safeError(null),generic);assert.deepEqual(Object.getOwnPropertyNames(isolated),[])
 })
})

test('NI-J06: worldline reference checks use the trusted full catalog within bounded correction',async t=>{
 const h=await import('../../desktop/core/novel-import-semantics'),factory=api.importAiResponseSchema,bridge=api.generateImportAiJson;assert.ok(factory);assert.ok(bridge)
 const secret='REFERENCE-NAME-SYNTHETIC-SECRET',distant='local-only-character',base=knowledgeRequest('worldline'),r:ImportAiRequest={...base,entities:[{id:existing.id,kind:'character',name:existing.name},{id:'ambiguous-a',kind:'character',name:secret},{id:'ambiguous-b',kind:'character',name:secret},{id:'catalog-place',kind:'scene',name:'合成目录地点',entityType:'PLACE'},{id:'catalog-item',kind:'item',name:'合成目录物品'},{id:'catalog-event',kind:'worldline',name:'合成目录父事件'},{id:distant,kind:'character',name:'目录外合成人物',unitIds:['outside-synthetic-unit']}]},before=structuredClone(r)
 const event:ImportArtifact={...knowledgeArtifact('worldline',{reliability:'客观事实',people:JSON.stringify([existing.id])}),id:'j06-event',text:'合成全文中有据的事件与原称谓保留'},good={artifacts:[event]},context={userId:'synthetic-reference-user',resolvedModel:{} as ResolvedModel},prompt=importAiPrompt(r),guidance='people只能引用已提供角色id或唯一name；父级只能为同类既有或本批真实节点，ID身份不可混用。缺可引用角色时保留有据事件及人物原称谓、认知归属在text/attribution，people只填已存在可引用部分；不造外键、不删改正文、不丢有据事件；空people不证明角色或两线完整，仍须完整性审核补齐'
 const candidate=(facts:Record<string,string>,id=event.id):ImportArtifact=>({...event,id,facts:{...event.facts,...facts}}),badCases=[
  {name:'unknown-character',artifacts:[candidate({people:JSON.stringify([foreignId])})]},
  {name:'ambiguous-name',artifacts:[candidate({people:JSON.stringify([secret])})]},
  {name:'non-character-id',artifacts:[candidate({people:'["catalog-place"]'})]},
  {name:'wrong-parent-type',artifacts:[candidate({parentId:existing.id})]},
  {name:'unknown-parent',artifacts:[candidate({parentId:'unknown-parent'})]},
  {name:'batch-cycle',artifacts:[candidate({parentId:'cycle-b'},'cycle-a'),candidate({parentId:'cycle-a'},'cycle-b')]},
  {name:'identity-kind-collision',artifacts:[candidate({},'catalog-item')]},
  {name:'identity-name-collision',artifacts:[candidate({},'catalog-event')]}
 ]
 const generated=(raw:unknown)=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}),call=(input:ImportAiRequest,raw:unknown)=>ai.runImportAi(input,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
 await t.test('real bridge corrects graph-invalid complete responses only once with fixed safe feedback',async()=>{
  assert.ok(guidance.length<=250)
  for(const item of badCases){
   const raw={artifacts:item.artifacts},snapshot=structuredClone(raw),prompts:string[]=[],controller=new AbortController();for(const a of item.artifacts)h.validateImportSemanticArtifact(a)
   const output=await bridge(r,context,controller.signal,prompt,{generateText:async opts=>{assert.equal(Object.hasOwn(opts,'schema'),false);assert.equal(Object.hasOwn(opts,'response_format'),false);assert.equal(opts.abortSignal,controller.signal);assert.equal(opts.role,'text');assert.equal(opts.action,'novel.import.analyze');assert.equal(opts.userId,context.userId);assert.equal(opts.resolvedModel,context.resolvedModel);prompts.push('prompt'in opts?opts.prompt:'');return generated(prompts.length===1?raw:good)}})
   assert.deepEqual(output,good,item.name);assert.equal(prompts.length,2,item.name+' has one existing correction');assert.ok(prompts[1].startsWith(prompts[0]));const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes('artifacts'));assert.ok(feedback.includes(guidance));for(const value of [secret,currentId,foreignId,existing.id,existing.name,distant,event.id,event.name,event.text,sourceText,model.endpoint,'角色引用不存在或同名不明确','模型实体标识与原类型或父级身份冲突'])assert.ok(!feedback.includes(value),item.name+' does not echo any raw identifier, name, source or caught error');assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(prompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);assertImportFixedPromptReserve(prompt,serializeImportAiPayload(r))
   const checked=factory(r).safeParse(raw);assert.equal(checked.success,false);if(!checked.success){assert.deepEqual(checked.error.issues.map(issue=>issue.path),[['artifacts']]);assert.deepEqual(checked.error.issues.map(issue=>issue.message),[guidance])}await assert.rejects(call(r,raw),/结构|类别/)
   let failed=0;await assert.rejects(bridge(r,context,controller.signal,prompt,{generateText:async()=>{failed++;return generated(raw)}}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes('artifacts'));assert.equal(failed,2,item.name+' has no third attempt');assert.deepEqual(raw,snapshot);assert.deepEqual(r,before)
  }
 })
 await t.test('valid ids, unique names and batch parents preserve complete raw responses and local-only catalog entries',async()=>{
  const variants=[good,{artifacts:[candidate({people:' [ "'+existing.name+'" ] '})]},{artifacts:[candidate({people:JSON.stringify([distant])})]},{artifacts:[candidate({parentId:'batch-parent'}),candidate({people:'[]'},'batch-parent')]},{artifacts:[candidate({parentId:'catalog-event'})]},{artifacts:[candidate({people:'[]',attribution:'合成原称谓与认知归属保留'})]}]
  const provider=JSON.parse(serializeImportAiPayload(r));assert.ok(!provider.entities.some((e:{id:string})=>e.id===distant),'provider receives a filtered catalog, not the full private validation catalog');assert.ok(r.entities!.some(e=>e.id===distant))
  for(const raw of variants){const snapshot=structuredClone(raw);assert.deepEqual(factory(r).parse(raw),raw);let calls=0;const output=await bridge(r,context,new AbortController().signal,prompt,{generateText:async()=>{calls++;return generated(raw)}});assert.equal(calls,1);assert.deepEqual(output,raw);assert.deepEqual(await call(r,output),raw);assert.ok(output.artifacts!.every(a=>a.kind==='worldline'),'catalog-only characters never become invented output artifacts');assert.deepEqual(raw,snapshot);assert.deepEqual(r,before)}
 })
 await t.test('empty results retain the late gate while narrative references reject early and reconcile still rejects late',async()=>{
  const malformed={...r,entities:[{id:'bad-catalog',kind:'invalid-kind',name:'合成错误目录'}]} as unknown as ImportAiRequest,empty={artifacts:[],notFound:true};assert.deepEqual(factory(malformed).parse(empty),empty,'empty responses must not invoke or swallow the graph precheck');await assert.rejects(call(malformed,empty),error=>error instanceof Error&&error.message==='语义实体目录类型无效')
  const narrative=knowledgeRequest('narrative'),raw={artifacts:[{...knowledgeArtifact('narrative',{reliability:'客观事实',narrator:foreignId}),id:'j06-narrative'}]};h.validateImportSemanticArtifact(raw.artifacts[0]);assert.equal(factory(narrative).safeParse(raw).success,false);await assert.rejects(call(narrative,raw),/结构|类别/)
  const target={...raw.artifacts[0],facts:{...raw.artifacts[0].facts,narrator:existing.id}},reconcile:ImportAiRequest={...narrative,artifacts:[...narrative.artifacts,target],intent:'reconcile',reconcile:{targetIds:[target.id],locks:[],decisionHash:'d'.repeat(64),workingRevision:0}},edit={artifactEdits:[{artifactId:target.id,baseHash:h.importArtifactSemanticHash(target),setFacts:{narrator:foreignId},reason:'合成真实角色晚门',evidence:target.evidence}],conflicts:[]};h.validateImportSemanticArtifact(target);assert.deepEqual(factory(reconcile).parse(edit),edit);await assert.rejects(call(reconcile,edit),error=>error instanceof Error&&error.message==='角色引用不存在或同名不明确');assert.deepEqual(r,before)
 })
})

test('NI-J07: narrative native and reference checks reuse bounded correction and preserve real late gates',async t=>{
 const h=await import('../../desktop/core/novel-import-semantics'),factory=api.importAiResponseSchema,bridge=api.generateImportAiJson;assert.ok(factory);assert.ok(bridge)
 const secret='NARRATIVE-SYNTHETIC-SECRET',eventId='j07-known-event',distant='j07-distant-character',r:ImportAiRequest={...knowledgeRequest('narrative'),units:[{...request().units[0],start:90,end:90+sourceText.length}],chapters:Array.from({length:10},(_,index)=>({id:'j07-chapter-'+index,title:'合成章节'+index,start:index*10,end:index===9?90+sourceText.length:(index+1)*10})),entities:[{id:existing.id,kind:'character',name:existing.name},{id:scene.id,kind:'scene',name:scene.name,entityType:'PLACE'},{id:eventId,kind:'worldline',name:'合成可信事件',unitIds:['other-synthetic-unit']},{id:distant,kind:'character',name:'合成可信转述者',unitIds:['other-synthetic-unit']},{id:'j07-ambiguous-a',kind:'character',name:secret},{id:'j07-ambiguous-b',kind:'character',name:secret}]},before=structuredClone(r)
 const ref={eventId,kind:'mention',reliability:'角色有限事实',character:existing.id,attribution:' 合成转述归属 ',temporalScope:' 仅该段 '},refs=(values:unknown[])=>' '+JSON.stringify(values)+' ',a:ImportArtifact={...knowledgeArtifact('narrative',{chapterIndex:'09',order:'00',narrator:existing.id,refs:refs([ref]),reliability:'人物推测',attribution:' 合成叙述归属 ',temporalScope:' 合成披露阶段 '}),id:'j07-narrative-point',text:'合成叙事资料的完整首中尾😀'},good={artifacts:[a]},context={userId:'synthetic-narrative-user',resolvedModel:{} as ResolvedModel},prompt=importAiPrompt(r)
 const nativeGuidance='narrative的chapterIndex/order须为非负安全整数字符串；refs须为严格JSON数组，eventId非空，kind只用happen/mention/recall或省略；每项ref须明确reliability(客观事实/角色有限事实/人物推测/可能不可靠)，非客观ref须非空attribution；保留原文、归属和时间范围，不制造字段或默认值',linkGuidance='narrator只用已提供角色id或唯一name；refs.eventId只引用可信worldline事件，refs.character只用角色id，chapterIndex沿用全书索引；ID身份不可混用。无法链接框架叙述者时保留原称谓及讲述/转述归属在text/attribution，不冒用角色、不造外键、不丢叙事点、不改正文；空refs不证明叙事或角色完整，仍须完整性审核'
 const drop=(...keys:string[])=>Object.fromEntries(Object.entries(a.facts).filter(([key])=>!keys.includes(key))),candidate=(facts:Record<string,string>,id=a.id):ImportArtifact=>({...a,id,facts:{...a.facts,...facts}}),generated=(raw:unknown)=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}),call=(input:ImportAiRequest,raw:unknown)=>ai.runImportAi(input,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
 const badNative:{name:string;artifact:ImportArtifact}[]=[
  {name:'missing-chapter',artifact:{...a,facts:drop('chapterIndex')}},{name:'missing-order',artifact:{...a,facts:drop('order')}},{name:'missing-refs',artifact:{...a,facts:drop('refs')}},
  ...['-1','9.0','9007199254740992'].map(chapterIndex=>({name:'bad-chapter-'+chapterIndex,artifact:candidate({chapterIndex})})),...['-1','1e2'].map(order=>({name:'bad-order-'+order,artifact:candidate({order})})),
  ...[secret,'{}','[1]',refs([{...ref,eventId:''}]),refs([{...ref,kind:secret}]),refs([{eventId}]),refs([{...ref,reliability:secret}]),refs([{eventId,reliability:'人物推测'}]),refs([{...ref,attribution:' \t'}]),refs([{...ref,character:String.fromCharCode(0xd800)}])].map((value,index)=>({name:'bad-refs-'+index,artifact:candidate({refs:value})}))
 ]
 const badLinks:{name:string;artifact:ImportArtifact}[]=[{name:'unknown-narrator',artifact:candidate({narrator:foreignId})},{name:'ambiguous-narrator',artifact:candidate({narrator:secret})},{name:'non-character-narrator',artifact:candidate({narrator:scene.id})},{name:'unknown-event',artifact:candidate({refs:refs([{...ref,eventId:foreignId}])})},{name:'non-event-id',artifact:candidate({refs:refs([{...ref,eventId:existing.id}])})},{name:'unknown-ref-character',artifact:candidate({refs:refs([{...ref,character:foreignId}])})},{name:'non-character-ref',artifact:candidate({refs:refs([{...ref,character:scene.id}])})},{name:'ref-character-name-is-not-id',artifact:candidate({refs:refs([{...ref,character:existing.name}])})},{name:'global-chapter-boundary',artifact:candidate({chapterIndex:'10'})},{name:'identity-collision',artifact:candidate({},existing.id)}]
 const exercise=async(items:{name:string;artifact:ImportArtifact}[],guidance:string,path:(string|number)[])=>{
  assert.ok(guidance.length<=250)
  for(const item of items){const raw={artifacts:[item.artifact]},snapshot=structuredClone(raw),prompts:string[]=[],controller=new AbortController()
   const output=await bridge(r,context,controller.signal,prompt,{generateText:async opts=>{assert.equal(Object.hasOwn(opts,'schema'),false);assert.equal(Object.hasOwn(opts,'response_format'),false);assert.equal(opts.abortSignal,controller.signal);assert.equal(opts.role,'text');assert.equal(opts.action,'novel.import.analyze');assert.equal(opts.userId,context.userId);assert.equal(opts.resolvedModel,context.resolvedModel);prompts.push('prompt'in opts?opts.prompt:'');return generated(prompts.length===1?raw:good)}})
   assert.deepEqual(output,good,item.name);assert.equal(prompts.length,2);assert.ok(prompts[1].startsWith(prompts[0]));const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes(path.join('.')));assert.ok(feedback.includes(guidance));for(const value of [secret,currentId,foreignId,existing.id,existing.name,scene.id,eventId,distant,a.id,a.name,a.text,sourceText,model.endpoint,'角色引用不存在或同名不明确','叙事引用结构无效'])assert.ok(!feedback.includes(value),item.name+' fixed feedback never echoes raw data or caught errors');assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(prompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);assertImportFixedPromptReserve(prompt,serializeImportAiPayload(r))
   const checked=factory(r).safeParse(raw);assert.equal(checked.success,false);if(!checked.success){assert.deepEqual(checked.error.issues.map(issue=>issue.path),[path]);assert.deepEqual(checked.error.issues.map(issue=>issue.message),[guidance])}await assert.rejects(call(r,raw),/结构|类别/)
   let failed=0;await assert.rejects(bridge(r,context,controller.signal,prompt,{generateText:async()=>{failed++;return generated(raw)}}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes(path.join('.')));assert.equal(failed,2);assert.deepEqual(raw,snapshot);assert.deepEqual(r,before)
  }
 }
 await t.test('original native constraints enter the real bridge correction without transforming values',async()=>{for(const item of badNative)assert.throws(()=>h.validateImportSemanticArtifact(item.artifact));await exercise(badNative,nativeGuidance,['artifacts',0,'facts'])})
 await t.test('strict catalog and global chapter constraints enter the same bounded correction',async()=>{for(const item of badLinks)h.validateImportSemanticArtifact(item.artifact);await exercise(badLinks,linkGuidance,['artifacts'])})
 await t.test('legal refs, raw strings, global indexes and unresolved frame materials preserve original acceptance',async()=>{
  const payload=JSON.parse(serializeImportAiPayload(r));assert.deepEqual(payload.chapters.map((chapter:{index:number})=>chapter.index),[9]);for(const id of [eventId,distant])assert.ok(!payload.entities.some((entry:{id:string})=>entry.id===id))
  const noKind={...ref};delete (noKind as Partial<typeof ref>).kind
  const variants=[a,candidate({narrator:existing.name}),candidate({narrator:distant}),...['happen','mention','recall'].map(kind=>candidate({refs:refs([{...ref,kind}])})),candidate({refs:refs([noKind])}),candidate({order:String(Number.MAX_SAFE_INTEGER)}),{...a,text:'合成未链接框架称谓与原叙述材料完整保留',facts:{...drop('narrator'),refs:'[]',attribution:' 合成未链接框架称谓及转述归属 '}}]
  for(const artifact of variants){h.validateImportSemanticArtifact(artifact);const raw={artifacts:[artifact]},snapshot=structuredClone(raw);assert.deepEqual(factory(r).parse(raw),raw);let calls=0;const output=await bridge(r,context,new AbortController().signal,prompt,{generateText:async()=>{calls++;return generated(raw)}});assert.equal(calls,1);assert.deepEqual(output,raw);assert.deepEqual(await call(r,output),raw);assert.ok(output.artifacts!.every(item=>item.kind==='narrative'));assert.deepEqual(raw,snapshot);assert.deepEqual(r,before)}
  const malformed={...r,entities:[{id:'bad-narrative-catalog',kind:'invalid-kind',name:'合成坏目录'}]} as unknown as ImportAiRequest,empty={artifacts:[],notFound:true};assert.deepEqual(factory(malformed).parse(empty),empty);await assert.rejects(call(malformed,empty),error=>error instanceof Error&&error.message==='语义实体目录类型无效')
 })
 await t.test('real reconcile field edits retain the untouched native and exact role-reference late gates',async()=>{
  const target={...a,id:'j07-reconcile-target'},input:ImportAiRequest={...r,artifacts:[...r.artifacts,target],intent:'reconcile',reconcile:{targetIds:[target.id],locks:[],decisionHash:'d'.repeat(64),workingRevision:0}},snapshot=structuredClone(input)
  const cases=[{edit:{setFacts:{narrator:foreignId}},message:'角色引用不存在或同名不明确'},{edit:{setFacts:{narrator:scene.id}},message:'角色引用类型无效'},{edit:{unsetFacts:['order']},message:'叙事缺少章节或顺序结构'}]
  for(const item of cases){const raw={artifactEdits:[{artifactId:target.id,baseHash:h.importArtifactSemanticHash(target),...item.edit,reason:'合成真实晚门回归',evidence:target.evidence}],conflicts:[]};assert.deepEqual(factory(input).parse(raw),raw);let calls=0,error:unknown,output:unknown;try{output=await ai.runImportAi(input,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>{calls++;return structuredClone(raw)}})}catch(caught){error=caught}assert.ok(error instanceof Error);assert.equal(error.message,item.message);assert.equal(calls,1);assert.equal(output,undefined);assert.deepEqual(input,snapshot)}
 })
})

test('NI-J08: final character schema errors expose only bounded static business labels',async t=>{
 const bridge=api.generateImportAiJson!;assert.ok(bridge)
 const r:ImportAiRequest={...knowledgeRequest('character'),kind:'character',selectedTargets:['character']},before=structuredClone(r),context={userId:'j08-synthetic-user',resolvedModel:{} as ResolvedModel},controller=new AbortController(),prompt=importAiPrompt(r),secret='J08-SYNTHETIC-SECRET',isolated=Object.create(NovelImportController.prototype) as {safeError(error:unknown):string}
 const person:ImportArtifact={...existing,id:'j08-person-'+secret,name:'人物名-'+secret,text:'完整合成人物资料，首中尾均保留😀',facts:{roleType:'SUPPORTING',aliases:'["合成别称"]',relationships:'[]',occupation:' 原职业 ',clothing:' 原服饰 ',catchphrase:' 原口头禅 ',growthArc:' 原成长轨迹 ',reliability:'角色有限事实',attribution:' 合成转述来源 ',temporalScope:' 仅合成时段 '}}
 const good={artifacts:[person]},emit=(raw:unknown,finishReason='stop')=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason}),capture=async(run:()=>Promise<unknown>)=>{try{await run()}catch(error){return error}assert.fail('expected generation rejection')},safe=(error:unknown)=>isolated.safeError(error)
 const fallback='模型返回的角色结构无效，请核对后重试',labeled=(labels:string[])=>'模型返回的角色字段结构无效（'+labels.join('、')+'），请核对后重试'
 const execute=async(input:ImportAiRequest,sequence:unknown[])=>{const prompts:string[]=[],signals:AbortSignal[]=[],assertions:{count:number}={count:0};let calls=0;const output=await ai.runImportAi(input,controller.signal,{resolve:async()=>model,assert:async()=>{assertions.count++},generate:async(request,_model,signal,actualPrompt)=>bridge(request,context,signal,actualPrompt,{generateText:async opts=>{assert.equal(Object.hasOwn(opts,'schema'),false);assert.equal(Object.hasOwn(opts,'response_format'),false);assert.equal(opts.userId,context.userId);assert.equal(opts.resolvedModel,context.resolvedModel);assert.equal(opts.role,'text');assert.equal(opts.action,'novel.import.analyze');assert.equal(opts.abortSignal,controller.signal);prompts.push('prompt'in opts?opts.prompt:'');signals.push(opts.abortSignal!);return emit(sequence[Math.min(calls++,sequence.length-1)])}})});return {output,prompts,signals,calls,assertions}}
 await t.test('actual bridge generateJSON Zod runImportAi and main safeError preserve final bounded diagnostics',async()=>{
  const raw={artifacts:Array.from({length:3},(_,i)=>({...person,id:person.id+'-'+i,facts:{...person.facts,aliases:['别名值-'+secret],relationships:[{target:'关系值-'+secret,description:secret}]}}))},snapshot=structuredClone(raw);let calls=0;const prompts:string[]=[]
  const error=await capture(()=>ai.runImportAi(r,controller.signal,{resolve:async()=>model,assert:async()=>{},generate:async(request,_model,signal,actualPrompt)=>bridge(request,context,signal,actualPrompt,{generateText:async opts=>{calls++;assert.equal(opts.abortSignal,controller.signal);assert.equal(opts.role,'text');assert.equal(opts.action,'novel.import.analyze');assert.equal(opts.userId,context.userId);assert.equal(opts.resolvedModel,context.resolvedModel);assert.equal(Object.hasOwn(opts,'schema'),false);assert.equal(Object.hasOwn(opts,'response_format'),false);prompts.push('prompt'in opts?opts.prompt:'');return emit(raw)}})}))
  assert.equal(calls,2);assert.ok(error instanceof Error);assert.equal(error.message,labeled(['别名','人物关系']));assert.equal(safe(error),labeled(['别名','人物关系']));assert.ok(error.message.length<180);assert.equal(Object.hasOwn(error,'cause'),false);assert.equal(error instanceof StructuredGenerationError,false)
  const direct=await capture(()=>generateJSON({userId:context.userId,role:'text',action:'novel.import.analyze',prompt,schema:ai.importAiResponseSchema(r),resolvedModel:context.resolvedModel,abortSignal:controller.signal},{generateText:async()=>emit(raw)}));assert.ok(direct instanceof StructuredGenerationError);assert.equal(direct.kind,'invalid_schema');assert.deepEqual(direct.invalidFields,['artifacts.0.facts.aliases','artifacts.0.facts.relationships','artifacts.1.facts.aliases','artifacts.1.facts.relationships','artifacts.2.facts.aliases','artifacts.2.facts.relationships']);assert.equal(prompts.length,2);assert.ok(prompts[1].startsWith(prompts[0]));for(const path of direct.invalidFields)assert.ok(prompts[1].includes(path),'existing correction keeps its original typed feedback');assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(prompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES)
  for(const value of [secret,currentId,foreignId,person.id,person.name,sourceText,model.endpoint,'artifacts.','facts.'])assert.ok(!safe(error).includes(value));assert.deepEqual(raw,snapshot);assert.deepEqual(r,before)
 })
 await t.test('first bad then good and first good remain exact successes with two or one calls',async()=>{
  const bad={artifacts:[{...person,facts:{...person.facts,aliases:[secret]}}]},badBefore=structuredClone(bad),goodBefore=structuredClone(good)
  const corrected=await execute(r,[bad,good]);assert.equal(corrected.calls,2);assert.deepEqual(corrected.output,good);assert.ok(corrected.signals.every(signal=>signal===controller.signal));assert.equal(corrected.assertions.count,2)
  const first=await execute(r,[good]);assert.equal(first.calls,1);assert.deepEqual(first.output,good);assert.equal(first.assertions.count,2);assert.deepEqual(good,goodBefore);assert.deepEqual(bad,badBefore);assert.deepEqual(r,before)
 })
 await t.test('actual Zod unknown and truncated paths cannot echo or falsely identify known fields',async()=>{
  const keys=['unknown-'+secret,'aliases.'+secret,'aliases\n','aliasesPrefix'+secret,'relationships\n'+secret,'角色资料-'+secret,'constructor','clothing'+'x'.repeat(120)+secret]
  for(const key of keys){const raw={artifacts:[{...person,facts:{...person.facts,[key]:[secret]}}]},snapshot=structuredClone(raw);assert.equal(ai.importAiResponseSchema(r).safeParse(raw).success,false,key+' must reach a real Zod failure');let calls=0;const error=await capture(()=>bridge(r,context,controller.signal,prompt,{generateText:async()=>{calls++;return emit(raw)}}));assert.equal(calls,2);assert.ok(error instanceof Error);assert.equal(error.message,fallback,key);assert.equal(safe(error),fallback);assert.ok(error.message.length<180);for(const value of [secret,key,currentId,person.name,sourceText,model.endpoint])assert.ok(!error.message.includes(value));assert.deepEqual(raw,snapshot)}
  const raw={artifacts:[{...person,unexpectedKey:secret}]};let count=0;const error=await capture(()=>bridge(r,context,controller.signal,prompt,{generateText:async()=>{count++;return emit(raw)}}));assert.equal(count,2);assert.equal(safe(error),labeled(['角色资料']));assert.deepEqual(r,before)
 })
 await t.test('synthetic typed metadata covers full-path allowlist and first-six bounds only',async()=>{
  const cases:[unknown[],string[]][]=[
   [['artifacts','artifacts.0','artifacts.0.facts'],['角色资料']],
   [['artifacts.0.id','artifacts.0.kind','artifacts.0.name','artifacts.0.text','artifacts.0.origin','artifacts.0.evidence'],['角色标识','资料类别','角色名称','角色正文','来源类型','来源证据']],
   [['artifacts.0.facts.roleType','artifacts.0.facts.occupation','artifacts.0.facts.clothing','artifacts.0.facts.catchphrase','artifacts.0.facts.growthArc','artifacts.0.facts.relationships'],['角色类型','职业','服饰','口头禅','成长轨迹','人物关系']],
   [['artifacts.0.sourceUnitIds','artifacts.0.sourceUnitIds.1','artifacts.0.evidence.0.unitId','artifacts.0.evidence.0.quote'],['来源单元','原文引文']],
   [['artifacts.9007199254740991.facts.aliases'],['别名']],
   [[...Array(6).fill('artifacts.0.facts.aliases'),'artifacts.0.facts.relationships'],['别名']],
   [['artifacts.0.facts.age','artifacts.0.facts.gender','artifacts.0.facts.personality','artifacts.0.facts.appearance','artifacts.0.facts.reliability','artifacts.0.facts.attribution'],['年龄','性别','性格','外貌','可靠性','信息归属']],
   [['artifacts.0.facts.temporalScope','artifacts.0.facts.characterId','artifacts.0.facts.sceneId','artifacts.0.facts.itemId'],['适用时段','关联角色','关联地点','关联物品']],
   [['artifacts.9007199254740992.facts.aliases','artifacts.-1.facts.aliases','artifacts.00.facts.aliases','artifacts.1e2.facts.aliases','artifacts.0.facts.aliases.0','artifacts.0.facts.aliases\n'],[]],
   [[...Array(6).fill('unknown-'+secret),'artifacts.0.facts.aliases'],[]],
   [['artifacts.0.evidence.0','artifacts.0.facts.__proto__','artifacts.0.toString','artifacts.0.facts.aliases'+'x'.repeat(101),null,{}],[]],
  ]
  for(const [paths,labels]of cases){const original=new StructuredGenerationError('invalid_schema',paths as string[],['feedback-'+secret]);let calls=0;const error=await capture(()=>bridge(r,context,controller.signal,prompt,{generateText:async()=>{calls++;throw original}}));assert.equal(calls,1,'synthetic typed metadata is not a parse correction run');assert.ok(error instanceof Error);assert.equal(error.message,labels.length?labeled(labels):fallback);assert.equal(safe(error),error.message);assert.ok(error.message.length<180);assert.equal(Object.hasOwn(error,'cause'),false);assert.ok(!error.message.includes(secret));assert.ok(!error.message.includes('artifacts'));assert.ok(!error.message.includes('facts.'))}
  for(const invalid of [null,secret,{value:secret}]){const original=new StructuredGenerationError('invalid_schema');Object.assign(original,{invalidFields:invalid});const error=await capture(()=>bridge(r,context,controller.signal,prompt,{generateText:async()=>{throw original}}));assert.equal(safe(error),fallback)}assert.deepEqual(r,before)
 })
 await t.test('all unrelated phases kinds legacy and original error identities pass through',async()=>{
  const reconcile:ImportAiRequest={...r,intent:'reconcile',artifacts:[...r.artifacts,person],reconcile:{targetIds:[person.id],locks:[],decisionHash:'d'.repeat(64),workingRevision:0}},otherRequests:ImportAiRequest[]=[{...r,semanticVersion:undefined,selectedTargets:undefined},...(['world','scene','worldline','narrative'] as const).map(kind=>({...knowledgeRequest(kind),kind})),...(['review','classify','patch'] as const).map(phase=>({...r,phase,kind:undefined})),reconcile]
  for(const input of otherRequests){const snapshot=structuredClone(input),error=new StructuredGenerationError('invalid_schema',['artifacts.0.facts.aliases'],[secret]);const observed=await capture(()=>bridge(input,context,controller.signal,importAiPrompt(input),{generateText:async()=>{throw error}}));assert.equal(observed,error);assert.ok(observed instanceof StructuredGenerationError);assert.equal(observed.message,error.message);assert.deepEqual(input,snapshot)}
  const errors=[new DOMException('controlled abort','AbortError'),new Error('controlled provider '+secret),Object.freeze({name:'StructuredGenerationError',kind:'invalid_schema',invalidFields:['artifacts.0.facts.aliases'],message:secret})]
  for(const original of errors){let count=0;const observed=await capture(()=>bridge(r,context,controller.signal,prompt,{generateText:async()=>{count++;throw original}}));assert.equal(count,1);assert.equal(observed,original)}
  for(const type of ['invalid_json','incomplete'] as const){let count=0;const error=await capture(()=>bridge(r,context,controller.signal,prompt,{generateText:async()=>{count++;return type==='invalid_json'?{...emit(null),text:'not JSON '+secret}:emit(good,'length')}}));assert.equal(count,2);assert.ok(error instanceof StructuredGenerationError);assert.equal(error.kind,type);assert.equal(error.message,type==='invalid_json'?'模型未返回可解析的 JSON':'模型输出未完整结束')}
  const stopped=new AbortController(),reason=new Error('abort reason remains private'),original=new StructuredGenerationError('invalid_schema',['artifacts.0.facts.aliases']);let calls=0;const error=await capture(()=>bridge(r,context,stopped.signal,prompt,{generateText:async()=>{calls++;stopped.abort(reason);throw original}}));assert.equal(calls,1);assert.equal(error,original);assert.equal(stopped.signal.reason,reason);assert.deepEqual(r,before);assert.deepEqual(Object.getOwnPropertyNames(isolated),[])
 })
})

test('NI-J09: ordinary character facts string errors clarify nested JSON without changing acceptance',async t=>{
 const {z}=await import('zod'),r:ImportAiRequest={...knowledgeRequest('character'),kind:'character',selectedTargets:['character']},before=structuredClone(r),bridge=api.generateImportAiJson!,context={userId:'j09-synthetic-user',resolvedModel:{} as ResolvedModel},controller=new AbortController(),secret='J09-SYNTHETIC-SECRET'
 const guidance='角色facts每个值必须是字符串；数组/对象先编码为JSON字符串并转义引号，不能直接返回数组、对象、数字、布尔或null；保留有据内容，不以删除人物或清空资料通过'
 const a:ImportArtifact={...existing,id:'j09-person-'+secret,name:'合成人名-'+secret,text:'完整有据合成人物文本，保留首尾😀',facts:{roleType:'SUPPORTING',aliases:' ["合成别称"] ',relationships:' [{"target":"已有合成人物","description":" 有据合成关系 ","characterId":"existing-character"}] ',age:' 约三十 ',occupation:' 原职业 ',clothing:' 原服饰 ',reliability:'角色有限事实',attribution:' 合成归属 ',temporalScope:' 合成早期 '}}
 const good={artifacts:[a]},factory=ai.importAiResponseSchema,isolated=Object.create(NovelImportController.prototype) as {safeError(error:unknown):string},emit=(raw:unknown)=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})
 const invoke=async(input:ImportAiRequest,sequence:unknown[])=>{let calls=0,checks=0,output:ImportAiResult|undefined,error:unknown;const prompts:string[]=[];try{output=await ai.runImportAi(input,controller.signal,{resolve:async()=>model,assert:async()=>{checks++},generate:async(request,_model,signal,prompt)=>bridge(request,context,signal,prompt,{generateText:async opts=>{assert.equal(opts.abortSignal,controller.signal);assert.equal(opts.role,'text');assert.equal(opts.action,'novel.import.analyze');assert.equal(opts.userId,context.userId);assert.equal(opts.resolvedModel,context.resolvedModel);assert.equal(Object.hasOwn(opts,'schema'),false);assert.equal(Object.hasOwn(opts,'response_format'),false);prompts.push('prompt'in opts?opts.prompt:'');return emit(sequence[Math.min(calls++,sequence.length-1)])}})})}catch(caught){error=caught}return {calls,checks,output,error,prompts}}
 const badCases=[{name:'array aliases',field:'aliases',value:['模型别名-'+secret],label:'别名'},{name:'object relationships',field:'relationships',value:{characterId:'模型引用-'+secret,description:secret},label:'人物关系'},{name:'numeric age',field:'age',value:738491,label:'年龄'},{name:'boolean occupation',field:'occupation',value:false,label:'职业'},{name:'null clothing',field:'clothing',value:null,label:'服饰'}]
 for(const item of badCases)await t.test(item.name+' uses the actual bounded correction',async()=>{
  const raw={artifacts:[{...a,facts:{...a.facts,[item.field]:item.value}}]},snapshot=structuredClone(raw),goodBefore=structuredClone(good),parsed=factory(r).safeParse(raw);assert.equal(parsed.success,false);if(!parsed.success){assert.deepEqual(parsed.error.issues.map(issue=>issue.path),[['artifacts',0,'facts',item.field]]);}
  const corrected=await invoke(r,[raw,good]);assert.equal(corrected.error,undefined);assert.equal(corrected.calls,2);assert.equal(corrected.checks,2);assert.deepEqual(corrected.output,good);assert.ok(corrected.prompts[1].startsWith(corrected.prompts[0]));const feedback=corrected.prompts[1].slice(corrected.prompts[0].length);assert.ok(feedback.includes(guidance),'real second prompt must explain nested JSON encoding');if(!parsed.success)assert.deepEqual(parsed.error.issues.map(issue=>issue.message),[guidance]);assert.ok(feedback.includes('artifacts.0.facts.'+item.field));assert.ok(Buffer.byteLength(corrected.prompts[1])-Buffer.byteLength(corrected.prompts[0])<=IMPORT_JSON_WRAPPER_RESERVE_BYTES)
  for(const value of [secret,currentId,foreignId,a.id,a.name,a.text,sourceText,model.endpoint,existing.id,String(item.value)])if(value&&!['false','null','[object Object]'].includes(value))assert.ok(!feedback.includes(value),'no model value, identity or source in correction')
  const failed=await invoke(r,[raw]);assert.equal(failed.calls,2);assert.equal(failed.output,undefined);assert.ok(failed.error instanceof Error);assert.equal(failed.error.message,'模型返回的角色字段结构无效（'+item.label+'），请核对后重试');assert.equal(isolated.safeError(failed.error),failed.error.message);assert.ok(failed.error.message.length<180);assert.deepEqual(raw,snapshot);assert.deepEqual(good,goodBefore);assert.deepEqual(r,before)
 })
 await t.test('literal old acceptance cases for strings nonstrings optional shape and prototype keys remain unchanged',async()=>{
  for(const value of ['', ' \t\r\n ', '😀', '[]', '{"kept":"引号\\\"与换行\\n"}', 'not JSON']){const raw={artifacts:[{...a,facts:{...a.facts,occupation:value}}]},snapshot=structuredClone(raw);assert.equal(factory(r).safeParse(raw).success,true);assert.deepEqual(factory(r).parse(raw),raw);assert.deepEqual(raw,snapshot)}
  for(const value of [[],{},0,42,true,false,null,undefined]){const raw={artifacts:[{...a,facts:{...a.facts,occupation:value}}]};assert.equal(factory(r).safeParse(raw).success,false)}
  for(const value of [{artifacts:[{...a,facts:{roleType:'SUPPORTING',aliases:'[]',relationships:'[]'}}]},{artifacts:[{...a,text:''}]},{artifacts:[]},{notFound:true},{classifications:[],conflicts:[],patches:[],artifactEdits:[],missingTargets:[]}])assert.equal(factory(r).safeParse(value).success,true,'original optional fields and semantic empty text remain legal at schema boundary')
  for(const raw of [{...good,unknownTop:'unchanged'},{artifacts:[{...a,unknownArtifact:'unchanged'}]},{artifacts:[{...a,sourceUnitIds:[currentId,foreignId]}]},{artifacts:[{...a,origin:'source'}]},{artifacts:[{...a,kind:'scene'}]}])assert.equal(factory(r).safeParse(raw).success,false)
  const unknown={artifacts:[{...a,facts:{...a.facts,opaqueCustomField:' original value '}}]};assert.deepEqual(factory(r).parse(unknown),unknown,'string dictionary key acceptance is unchanged; native whitelist is a later gate')
  const proto={artifacts:[{...a,facts:{...a.facts,['__proto__']:[secret]}}]},snapshot=structuredClone(proto),parsed=factory(r).parse(proto);assert.equal(Object.hasOwn(parsed.artifacts![0].facts,'__proto__'),false,'original Zod record behavior is retained');assert.deepEqual(parsed,good);assert.deepEqual(proto,snapshot)
  const first=await invoke(r,[good]);assert.equal(first.calls,1);assert.equal(first.error,undefined);assert.deepEqual(first.output,good);assert.deepEqual(r,before)
 })
 await t.test('other kind phase reconcile and legacy string validation retains the original error',async()=>{
  const reconcile:ImportAiRequest={...r,intent:'reconcile',artifacts:[...r.artifacts,a],reconcile:{targetIds:[a.id],locks:[],decisionHash:'d'.repeat(64),workingRevision:0}},others:ImportAiRequest[]=[{...r,semanticVersion:undefined,selectedTargets:undefined},...(['scene','world','worldline','narrative','item'] as const).map(kind=>knowledgeRequest(kind)),...(['classify','review','patch'] as const).map(phase=>({...r,phase,kind:undefined})),reconcile]
  const reference=z.string().safeParse([]);assert.equal(reference.success,false);const oldMessage=!reference.success?reference.error.issues[0].message:'';assert.equal(oldMessage,'Invalid input: expected string, received array')
  for(const input of others){const raw={artifacts:[{...a,kind:input.kind??'character',facts:{...a.facts,aliases:[]}}]},snapshot=structuredClone(input),parsed=factory(input).safeParse(raw);assert.equal(parsed.success,false);if(!parsed.success){const issue=parsed.error.issues.find(issue=>issue.path.join('.')==='artifacts.0.facts.aliases');assert.ok(issue);assert.equal(issue.message,oldMessage);assert.ok(parsed.error.issues.every(issue=>!issue.message.includes(guidance)))}assert.deepEqual(input,snapshot)}
 })
 await t.test('string encoding does not bypass original knowledge source native and link gates',async()=>{
  const late=[{raw:{artifacts:[{...a,facts:{...a.facts,aliases:'not JSON'}}]},calls:1},{raw:{artifacts:[{...a,facts:{...a.facts,roleType:secret}}]},calls:1},{raw:{artifacts:[{...a,facts:{...a.facts,opaqueCustomField:'retained'}}]},calls:1},{raw:{artifacts:[{...a,facts:{...a.facts,relationships:JSON.stringify([{target:'未提供人物',description:'合成关系',characterId:foreignId}])}}]},calls:2}]
  for(const {raw,calls}of late){assert.equal(factory(r).safeParse(raw).success,true);const result=await invoke(r,[raw]);assert.equal(result.calls,calls,String(result.error));assert.equal(result.output,undefined);assert.ok(result.error instanceof Error);assert.ok(!result.error.message.includes(guidance),'late rejection is not transformed by this schema change')}
  for(const raw of [{artifacts:[{...a,evidence:[{unitId:currentId,quote:'无此原文-'+secret}]}]},{artifacts:[{...a,facts:{...a.facts,reliability:secret}}]}]){const checked=factory(r).safeParse(raw);assert.equal(checked.success,false);if(!checked.success)assert.ok(checked.error.issues.every(issue=>issue.message!==guidance));const result=await invoke(r,[raw]);assert.equal(result.calls,2);assert.equal(result.output,undefined);assert.ok(result.error instanceof Error);assert.ok(!result.prompts[1].slice(result.prompts[0].length).includes(guidance))}assert.deepEqual(r,before)
 })
})

test('NI-J10: evidence correction identifies fixed anchor reasons without changing source authority',async t=>{
 const bridge=api.generateImportAiJson,factory=api.importAiResponseSchema;assert.ok(bridge);assert.ok(factory)
 const prefix='证据必须引用本次unitId中的原文连续片段，不可概述、拼接或补字'
 const messages:Record<string,string>={
  'unknown-unit':prefix+'；unitId必须逐字取自本次输入单元；quote只能复制该单元text，不得借其它单元',
  'too-short':prefix+'；此非精确引文非空白字符不足8，不能恢复排版；从声明单元text复制原文，保留空白与标点；精确短引文仍允许',
  ambiguous:prefix+'；排版恢复出现多个命中；从声明单元text复制含必要上下文的连续原文并保留原排版，不得任选位置',
  'no-match':prefix+'；声明单元内未找到引文；核对unitId与quote配对，从该单元text原样复制，不跨单元、不改字标点'
 }
 const cases=[
  {reason:'unknown-unit',text:'甲乙丙丁戊己庚辛。',quote:'甲乙丙丁戊己庚辛',id:foreignId},
  {reason:'too-short',text:'甲乙\r\n丙丁。',quote:'甲乙丙丁',id:currentId},
  {reason:'ambiguous',text:'甲乙\r\n丙丁戊己庚辛。甲乙\t丙丁戊己庚辛',quote:'甲乙丙丁戊己庚辛',id:currentId},
  {reason:'no-match',text:sourceText,quote:'UNKNOWN-QUOTE-SECRET\n"https://private.invalid"',id:currentId}
 ]
 const context={userId:'evidence-feedback-synthetic',resolvedModel:{} as ResolvedModel}
 const generated=(raw:unknown)=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})
 for(const item of cases)await t.test(item.reason+' uses the production bridge and preserves exact late-gate evidence',async()=>{
  const r={...request(),units:[{...request().units[0],text:item.text,end:item.text.length}]},before=structuredClone(r),prompt=importAiPrompt(r)
  const bad={artifacts:[{...scene,evidence:[{unitId:item.id,quote:item.quote}]}]},badBefore=structuredClone(bad)
  const good={artifacts:[{...scene,evidence:[{unitId:currentId,quote:item.text.slice(0,1)}]}]},goodBefore=structuredClone(good),prompts:string[]=[],controller=new AbortController()
  const invoke=(persistBad=false)=>ai.runImportAi(r,controller.signal,{resolve:async()=>model,assert:async()=>{},generate:async(input,_model,signal,fixed)=>bridge(input,context,signal,fixed,{generateText:async opts=>{
   assert.equal(opts.abortSignal,controller.signal);assert.equal(opts.resolvedModel,context.resolvedModel);assert.equal(opts.role,'text');assert.equal(opts.action,'novel.import.analyze');assert.equal(Object.hasOwn(opts,'schema'),false)
   prompts.push('prompt'in opts?opts.prompt:'');return generated(persistBad||prompts.length===1?bad:good)
  }})})
  const output=await invoke();assert.deepEqual(output,good);assert.equal(prompts.length,2);assert.ok(prompts[1].startsWith(prompts[0]));assert.equal(prompts[0].startsWith(prompt),true)
  const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes('artifacts.0.evidence.0'));assert.ok(feedback.includes(messages[item.reason]));assert.ok(messages[item.reason].length<=160)
  for(const secret of [item.quote,item.text,currentId,foreignId,scene.id,scene.name,scene.text,model.endpoint,'https://private.invalid',item.reason])assert.ok(!feedback.includes(secret),'fixed feedback does not echo data or internal reason')
  assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(prompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);assertImportFixedPromptReserve(prompt,serializeImportAiPayload(r))
  assert.equal(output.artifacts![0].evidence[0].unitId,currentId);assert.ok(item.text.includes(output.artifacts![0].evidence[0].quote))
  prompts.length=0;await assert.rejects(invoke(true),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes('artifacts.0.evidence.0'));assert.equal(prompts.length,2,'no third generation')
  assert.deepEqual(r,before);assert.deepEqual(bad,badBefore);assert.deepEqual(good,goodBefore)
 })
 await t.test('all twelve ordinary target schemas reject the same four reasons without transforming input',async()=>{
  const {IMPORT_TARGETS}=await import('../../desktop/shared/novel-import')
  for(const kind of IMPORT_TARGETS)for(const item of cases){
   const r={...request(),kind,selectedTargets:[kind],units:[{...request().units[0],text:item.text,end:item.text.length}]},before=structuredClone(r),raw={artifacts:[{...knowledgeArtifact(kind,{}),evidence:[{unitId:item.id,quote:item.quote}]}]},snapshot=structuredClone(raw),parsed=factory(r).safeParse(raw)
   assert.equal(parsed.success,false);if(!parsed.success){const issues=parsed.error.issues.filter(issue=>issue.path.join('.')==='artifacts.0.evidence.0');assert.equal(issues.length,1);assert.equal(issues[0].message,messages[item.reason])}
   for(const other of [{...r,semanticVersion:undefined,selectedTargets:undefined},{...r,phase:'classify' as const},{...r,phase:'review' as const},{...r,phase:'patch' as const},{...r,intent:'reconcile' as const}]){
    const accepted=other.phase==='classify'?{...raw,classifications:other.units.map(unit=>({unitId:unit.id,kind:'body' as const}))}:raw
    assert.deepEqual(factory(other).parse(accepted),accepted,'other schemas retain the previous acceptance and raw values')
   }
   assert.deepEqual(r,before);assert.deepEqual(raw,snapshot)
  }
 })
 await t.test('a quote verbatim-unique in one other supplied unit is rebound; two owners are not',async()=>{
  // Rule changed by docs/lotm-local-import/20-evidence-rebind-plan.md.
  const quote='这条合成引文仅存在于另一个单元',r=request(),raw={artifacts:[{...scene,evidence:[{unitId:currentId,quote}]}]}
  r.units.push({...r.units[0],id:'other-input-unit',text:quote,end:quote.length})
  const before=structuredClone(r),snapshot=structuredClone(raw);assert.equal(factory(r).safeParse(raw).success,true)
  const out=await ai.runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>raw})
  assert.deepEqual(out.artifacts![0].evidence,[{unitId:'other-input-unit',quote}]);assert.deepEqual(out.artifacts![0].sourceUnitIds,[...scene.sourceUnitIds,'other-input-unit'])
  assert.deepEqual(r,before);assert.deepEqual(raw,snapshot)
  const twice=request();twice.units.push({...twice.units[0],id:'other-a',text:quote,end:quote.length},{...twice.units[0],id:'other-b',text:quote,end:quote.length})
  const parsed=factory(twice).safeParse(raw);assert.equal(parsed.success,false);if(!parsed.success)assert.deepEqual(parsed.error.issues.map(issue=>issue.message),[messages['no-match']])
  await assert.rejects(ai.runImportAi(twice,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>raw}),/结构|类别/)
 })
 await t.test('Abort identity remains unchanged through the real correction bridge',async()=>{
  const r=request(),controller=new AbortController(),abort=Object.assign(new Error('SYNTHETIC-ABORT'),{name:'AbortError'});let calls=0
  await assert.rejects(bridge(r,context,controller.signal,importAiPrompt(r),{generateText:async()=>{calls++;controller.abort(abort);throw abort}}),error=>error===abort);assert.equal(calls,1)
 })
})
