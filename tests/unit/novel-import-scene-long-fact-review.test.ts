// Compatibility: controller cases here use genuine versionless scene journals.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {importHash,workingImportUnits} from '../../desktop/core/novel-import'
import {createImportBudgetPolicy,type ImportBudgetState} from '../../desktop/core/novel-import-budget-policy'
import {importReviewGeometryForSession,importReviewTaskKeys,iterateImportReviewTasks} from '../../desktop/core/novel-import-review-tasks'
import {assertImportReviewProjection,createImportReviewProjection,validateImportSemanticArtifact} from '../../desktop/core/novel-import-semantics'
import {serializeImportAiPayload,assertImportPayloadBudget,assertImportFixedPromptReserve,importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportModel,ImportSession,ImportTarget} from '../../desktop/shared/novel-import'
import {legacySceneFixture,source,rosterAi,entityResult,toImportScene} from '../helpers/novel-import-wizard-fixture'

// Synthetic strings only. These four literals are independent expectations,
// not an import of the implementation's exception table.
const fields=['exteriorDescription','interiorDescription','backstory','entryMethod'] as const
const shortFacts={entityType:'PLACE',exteriorDescription:'短外观',interiorDescription:'短内观',backstory:'短历史',entryMethod:'短入口'}
const longFacts=Object.fromEntries(fields.map((field,index)=>[field,` \t首${index}-${field}😀\r\n`+'合成自由文本𠀀。\r\n'.repeat(2600)+`\r\n尾${index}-${field}  `]))
const auditModel:ImportModel={id:'lf-model',name:'合成模型',modelId:'synthetic',endpoint:'https://synthetic.invalid',authRevision:1,contextWindow:1048576}
function state(facts:Record<string,string>=shortFacts):ImportSession&ImportBudgetState{
 const texts=['甲'.repeat(23000),'乙'.repeat(23000)],prose=texts.join(''),units=texts.map((text,index)=>({id:'lf-u'+index,fileId:'lf-file',start:index*23000,end:(index+1)*23000,text,kind:'body' as const}))
 return {semanticVersion:1,version:1,id:'lf-state',revision:0,phase:'select',title:'合成长文本场景',files:[{id:'lf-file',name:'正文.txt',path:'/private/tmp/lf-synthetic',format:'txt',bytes:Buffer.byteLength(prose),hash:importHash(prose),text:prose,included:true}],units,selected:['body'],targets:['scene'],infer:true,artifacts:[{id:'lf-scene',kind:'scene',schema:2,name:'合成北城',text:'原文本首'+'合'.repeat(18000)+'原文本尾',facts:{...facts},evidence:units.map(u=>({unitId:u.id,quote:u.text.slice(0,8)})),sourceUnitIds:units.map(u=>u.id),origin:'inferred'}],conflicts:[],patches:[],originalProse:prose,workingProse:prose,workingUnits:units,workingRevision:0,chapters:[],steps:[],coverage:{},notFound:[],epoch:0,createdAt:'',updatedAt:'',decisions:[],models:{text:auditModel,review:auditModel},budgetPolicy:createImportBudgetPolicy({text:auditModel,review:auditModel})}
}
// Captured before product edits from review-tasks.ts SHA256
// 89e9c39e8a0c362d34baa5b393f44ca3dbfda1a52022ebc4ce66c9e6da566a82.
// This literal protects already-valid task keys, not two calls to new code.
const oldValidKeys=[
 'a1572dc318a523770c402fae69e601da25a726ac17aeae58ee185a939931106b','31312f97ba9549ba416b05423454a33bfcff03a396cb4b153148c66f9d0bae11',
 '9f7f001f852b4f580f6586fdd2574fb4cb104620738373b30856c7f63cf07337','caa3ce8e11bd49e7e4db596b25b174932f49e7ea3e7e9505828db213767e0b17',
 '011ef43c0d2083744c53da4d80713efb5072ece224e1346589530aa9e577c71a','d9e84ad6bf50b5ca042bfd0d939146f4d805825b5b8a2ce25ebdef61acc4349d',
 'f16751071d4da4281b71307bdfc1605a6ba55efcf0f4998829014fde321d5234','242fd9a193e57e8fb02c3d7b9cdf442beeb1771b81a73d59b0eb1ec1fb393919',
 'b4c00d91fd7de5bab67c506c2ae1d331391cf85e0afc55505ae5f5f970e50b9c','2ce0fed68bc2fe02aa1dbe2fc08b6560accb7c60c48aa4bd635ae8f6d9cc2db3',
 '31a14b20c83d6d37005de1a73026d56a5c4e099cc5b7fc6045c7b56df6f82921','cd607481361484c5a1c843559d55d005a2236b404e7fe69f94a0c0d86af80c48',
 'ea9be2bd154093acbb61534a2f79de53359d5ef9b3fdf0a1ded6789a0e508488','e98b5140d630d69eed2672217a118e7ba19567c3a6583d5e898008b828a67a7c'
]

test('LF01: four schema2 scene text facts stay whole in every evidence batch with truthful projections',()=>{
 const s=state({...shortFacts,...longFacts}),before=structuredClone(s),tasks=[...iterateImportReviewTasks(s)]
 assert.equal(importReviewGeometryForSession(s).pieceCharacters,16384);assert.equal(tasks.length,14)
 for(const field of fields){
  const value=longFacts[field];assert.ok(value.length>27529&&value.includes('\r\n')&&value.includes('𠀀'))
  const pieces=tasks.filter(task=>Object.hasOwn(task.artifact.facts,field));assert.equal(pieces.length,2)
  assert.deepEqual(pieces.map(task=>task.units.map(unit=>unit.id)),[['lf-u0'],['lf-u1']])
  for(const task of pieces){assert.deepEqual(task.artifact.facts,{[field]:value});assert.equal(task.artifact.text,'');assert.ok(!Object.hasOwn(task.projection!,'textRange'));assert.ok(!Object.hasOwn(task.projection!,'factRange'));assert.deepEqual(task.projection,createImportReviewProjection(s.artifacts[0],task.artifact));assert.deepEqual(task.projection!.fullFactKeys,Object.keys(s.artifacts[0].facts));assert.deepEqual(task.projection!.fields,[field]);assert.deepEqual(task.artifact.evidence,s.artifacts[0].evidence.filter(entry=>entry.unitId===task.units[0].id))}
 }
 assertImportReviewProjection(tasks.map(task=>task.artifact),tasks.map(task=>task.projection));assert.deepEqual(s,before)
})

test('LF01: already-valid scene task keys and text/evidence geometry retain the pre-change golden',()=>{
 const s=state(),before=structuredClone(s),tasks=[...iterateImportReviewTasks(s)]
 assert.deepEqual(importReviewTaskKeys(s),oldValidKeys)
 const pieces=[{field:null,length:16384,range:{start:0,end:16384}},{field:null,length:1624,range:{start:16384,end:18008}},...Object.keys(shortFacts).map(field=>({field,length:0,range:undefined}))]
 assert.deepEqual(tasks.map(task=>({field:Object.keys(task.artifact.facts)[0]??null,length:task.artifact.text.length,range:task.projection!.textRange,units:task.units.map(unit=>unit.id)})),pieces.flatMap(piece=>['lf-u0','lf-u1'].map(id=>({...piece,units:[id]}))))
 assert.deepEqual(s,before)
})

const factRequest=(request:ImportAiRequest)=>request.phase==='review'&&request.instruction?.startsWith('这是设定完整文本/事实的确定性分片')
async function wizard(facts:Record<string,string>){
 const base=rosterAi(),f=await legacySceneFixture([source('第一章 合成\n\n北城。'+'合成原文。'.repeat(60),'正文.txt','f-body')],async request=>request.intent==='entity'&&request.kind==='scene'?entityResult(request,()=>facts):base(request))
 await toImportScene(f);return f
}

test('LF02: real controller review and normal wizard checks publish every complete long value to the mock',async t=>{
 const f=await wizard(longFacts)
 try{
  const view=await f.settle(),s=await f.journal();t.diagnostic(JSON.stringify({step:view.wizard!.step,state:view.wizard!.stepState.verify,error:view.wizard!.stepError,factCalls:f.requests.filter(factRequest).length}))
  assert.equal(view.wizard!.step,'verify');assert.equal(s.artifacts.filter(a=>a.kind==='scene').length,1);assert.equal(s.artifacts.find(a=>a.kind==='scene')!.schema,2)
  assert.equal(view.wizard!.stepState.verify,'waiting',view.wizard!.stepError);assert.ok(view.wizard!.checks?.every(check=>check.ok));assert.equal(s.conflicts.length,0)
  const scene=s.artifacts.find(a=>a.kind==='scene')!;validateImportSemanticArtifact(scene)
  const requests=f.requests.filter(factRequest);assert.ok(requests.length>0)
  for(const field of fields){assert.equal(scene.facts[field],longFacts[field]);const seen=requests.flatMap(request=>request.artifacts.flatMap((artifact,index)=>Object.hasOwn(artifact.facts,field)?[{request,artifact,projection:request.reviewProjection![index]}]:[]));assert.ok(seen.length>0);for(const {artifact,projection}of seen){assert.equal(artifact.facts[field],longFacts[field]);assert.deepEqual(projection,createImportReviewProjection(scene,artifact));assert.deepEqual(projection.fullFactKeys,Object.keys(scene.facts))}}
  for(const request of requests){const budget=request.executionBudget!;assert.equal(budget.contextWindow,1048576);assert.equal(budget.characters,81920);assert.equal(request.models.review!.id,'review');assert.ok(JSON.stringify({units:request.units,artifacts:request.artifacts}).length<=budget.characters*2);const payload=serializeImportAiPayload(request);assertImportPayloadBudget(request,payload,budget.characters,budget.maxUnits);assertImportFixedPromptReserve(importAiPrompt(request,payload),payload)}
  assert.deepEqual(s.coverage.review,workingImportUnits(s).map(unit=>unit.id));assert.deepEqual(s.coverage.reviewFacts,importReviewTaskKeys(s))
  await f.act('wizard-next');assert.equal((await f.settle()).phase,'completed');assert.ok(f.published)
  assert.deepEqual(f.published.artifacts,s.artifacts);assert.equal(f.published.originalProse,s.originalProse);assert.equal(f.published.workingProse,s.workingProse);assert.deepEqual(f.published.decisions,s.decisions);assert.deepEqual(f.published.semanticState?.locks,s.semanticState?.locks);assert.deepEqual(f.published.coverage.reviewFacts,importReviewTaskKeys(f.published))
 }finally{await f.dispose()}
})

test('LF03: a truly oversized atomic field fails full request fits before the first fact dispatch and keeps body credit',async t=>{
 const value='巨大字段首😀\r\n'+'合'.repeat(200000)+'\r\n巨大字段尾  ',f=await wizard({exteriorDescription:value})
 try{
  const view=await f.settle(),s=await f.journal();t.diagnostic(JSON.stringify({state:view.wizard!.stepState.verify,error:view.wizard!.stepError,factCalls:f.requests.filter(factRequest).length}))
  assert.equal(view.wizard!.step,'verify');assert.equal(view.wizard!.stepState.verify,'failed');assert.match(view.wizard!.stepError!,/单个设定复核分片及完整元数据超过模型预算/)
  const artifact=s.artifacts.find(a=>a.kind==='scene')!;validateImportSemanticArtifact(artifact);assert.equal(artifact.facts.exteriorDescription,value);assert.ok(f.requests.some(request=>request.phase==='review'&&!factRequest(request)));assert.deepEqual(s.coverage.review,workingImportUnits(s).map(unit=>unit.id));assert.equal(s.coverage.reviewFacts?.length??0,0);assert.equal(f.requests.filter(factRequest).length,0);assert.equal(f.published,undefined)
  const before=structuredClone(s.artifacts);await assert.rejects(f.act('wizard-next'),/校验/);assert.deepEqual((await f.journal()).artifacts,before);assert.equal(f.published,undefined)
 }finally{await f.dispose()}
})

test('LF03: every other kind, field and legacy schema retains the exact original piece boundary',async t=>{
 // Pure iterator scope cases: this is not a claim that legacy backstory or
 // arbitrary strings in structured fields pass their native semantic schema.
 const cases:[ImportTarget,2|undefined,string][]=[['scene',2,'coordinates'],['scene',2,'attribution'],['scene',2,'parentId'],['character',2,'backstory'],['item',2,'appearance'],['world',undefined,'content'],['scene',undefined,'coordinates'],['scene',undefined,'backstory']]
 for(const [kind,schema,field]of cases)await t.test(`${kind}/${schema??'legacy'}/${field}`,()=>{const s=state(),piece=importReviewGeometryForSession(s).pieceCharacters,artifact=s.artifacts[0];artifact.kind=kind;if(schema===undefined)delete artifact.schema;else artifact.schema=schema;artifact.facts={[field]:'x'.repeat(piece-field.length)};assert.doesNotThrow(()=>[...iterateImportReviewTasks(s)]);artifact.facts[field]+='x';assert.throws(()=>[...iterateImportReviewTasks(s)],/模型结构事实超过复核分片预算/)} )
})
