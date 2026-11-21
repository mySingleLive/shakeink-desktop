import assert from 'node:assert/strict'
import {test} from 'node:test'
import {importGenerationModel,normalizeReviewReply,runImportAi,wizardReviewLaneRequest} from '../../desktop/service/novel-import-ai'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportArtifact,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {model,review} from '../helpers/novel-import-wizard-fixture'

/* docs/539–540 VS-01..VS-09. Synthetic text and names only. */
const unit={id:'u1',fileId:'f',kind:'body',start:0,end:16,text:'沈砚在合成渡口旁停步，风声很大。'} as ImportUnit
const person:ImportArtifact={id:'c-0000000000000001',kind:'character',name:'沈砚',text:'沈砚是渡口的船夫。',facts:{},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1'],origin:'inferred',schema:2}
const reviewRequest=(over:Partial<ImportAiRequest>={}):ImportAiRequest=>({semanticVersion:1,phase:'review',units:[unit],artifacts:[person],executionLane:'wizard-review-v1',operationId:'op',models:{text:model,review},workingRevision:0,selectedTargets:['character','scene'],entities:[],...over}) as ImportAiRequest
const parse=<T,>(text:string)=>JSON.parse(text) as T
const conflict=(over:Record<string,unknown>={})=>({id:'x',type:'setting-body',kind:'character',entity:'沈砚',field:'text',source:{text:person.text,value:person.text,artifactId:person.id},candidate:{text:'沈砚是渡口的旅人。',value:'沈砚是渡口的旅人。'},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],status:'pending',hash:'h',...over})

test('VS-01/VS-02: the wizard review lane is light and only valid for wizard review requests',()=>{
 const resolved={model:{},modelRecord:{},providerOptions:{openai:{store:false}}} as unknown as ResolvedModel
 const deepseek={provider:'deepseek',protocol:'openai',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'}
 assert.equal(wizardReviewLaneRequest(reviewRequest()),true)
 assert.deepEqual(importGenerationModel(reviewRequest(),resolved,deepseek).providerOptions,{openai:{store:false},deepseek:{thinking:{type:'disabled'}}})
 for(const r of [reviewRequest({executionLane:undefined}),reviewRequest({phase:'analyze',kind:'character'}),reviewRequest({intent:'reconcile'})]){assert.equal(wizardReviewLaneRequest(r),false);assert.equal(importGenerationModel(r,resolved,deepseek),resolved)}
})
test('VS-02: the review lane is refused on other phases',async()=>{
 const deps={resolve:async()=>model,assert:async()=>undefined,generate:async()=>({artifacts:[],notFound:true})} as never
 await assert.rejects(runImportAi(reviewRequest({phase:'analyze',kind:'character'}),new AbortController().signal,deps),/导入调度通道无效/)
})
test('VS-03: an invented conflict kind takes the kind of the cited artifact (screenshot conflicts.0.kind)',()=>{
 const out=normalizeReviewReply(reviewRequest(),JSON.stringify({conflicts:[conflict({kind:'设定'})]}),parse)!
 assert.equal(JSON.parse(out.text).conflicts[0].kind,'character');assert.equal(out.counts,undefined)
})
test('VS-04/VS-06: unusable conflicts are dropped and counted, usable ones stay',()=>{
 const reply={conflicts:[conflict({kind:'设定',source:{text:'x',value:'x',artifactId:'c-ffffffffffffffff'}}),conflict({evidence:[{unitId:'u1',quote:'虚构引文'}]}),conflict({evidence:[{unitId:'u1',quote:'虚构引文'},{unitId:'u1',quote:'风声很大'}]})]}
 const out=normalizeReviewReply(reviewRequest(),JSON.stringify(reply),parse)!,list=JSON.parse(out.text).conflicts
 assert.equal(list.length,1);assert.deepEqual(list[0].evidence,[{unitId:'u1',quote:'风声很大'}]);assert.deepEqual(out.counts,{droppedConflicts:2})
})
test('VS-05/VS-07: shape fixes fill missing fields and remove foreign keys',()=>{
 const raw=conflict({type:'矛盾',candidate:{value:'沈砚是渡口的旅人。'},extra:1});delete (raw as Record<string,unknown>).field;delete (raw as Record<string,unknown>).id;delete (raw as Record<string,unknown>).hash;delete (raw as Record<string,unknown>).status
 const out=normalizeReviewReply(reviewRequest(),JSON.stringify({conflicts:[raw],missingTargets:[{kind:'scene'}],artifacts:[]}),parse)!,root=JSON.parse(out.text),c=root.conflicts[0]
 assert.deepEqual(Object.keys(root),['conflicts']);assert.equal(c.type,'setting-body');assert.equal(c.field,'text');assert.equal(c.candidate.text,'沈砚是渡口的旅人。');assert.equal(c.status,'pending');assert.equal(typeof c.id,'string');assert.equal(typeof c.hash,'string');assert.equal('extra' in c,false)
 assert.equal(normalizeReviewReply(reviewRequest(),JSON.stringify({conflicts:[conflict()]}),parse),undefined,'a valid reply passes unchanged')
 assert.equal(normalizeReviewReply(reviewRequest(),'not json',parse),undefined)
})
test('VS-08: review repairs from another lane are refused',async()=>{
 const deps=(_lane:boolean)=>({resolve:async()=>review,assert:async()=>undefined,generate:async()=>({conflicts:[],reviewRepairs:{droppedConflicts:1}})}) as never
 await assert.rejects(runImportAi(reviewRequest({executionLane:undefined}),new AbortController().signal,deps(false)),/越权/)
 const result=await runImportAi(reviewRequest(),new AbortController().signal,deps(true));assert.deepEqual(result.reviewRepairs,{droppedConflicts:1})
})
test('VS-09: the lane adds its contract; other review prompts are unchanged',()=>{
 const lane=importAiPrompt(reviewRequest()),plain=importAiPrompt(reviewRequest({executionLane:undefined}))
 assert.match(lane,/<wizard-review-contract>/);assert.doesNotMatch(plain,/<wizard-review-contract>/);assert.equal(lane.replace(/<wizard-review-contract>[^]*?<\/wizard-review-contract>\n/u,''),plain)
})
test('541-4: a reply without a conflicts array is not read as "no conflicts"; layout-tolerant quotes are kept',()=>{
 assert.equal(normalizeReviewReply(reviewRequest(),JSON.stringify({}),parse),undefined)
 assert.equal(normalizeReviewReply(reviewRequest(),JSON.stringify({missingTargets:[]}),parse),undefined)
 assert.equal(normalizeReviewReply(reviewRequest(),JSON.stringify({conflicts:'none'}),parse),undefined)
 // A quote that differs from the unit only in whitespace is located by the adapter, so it is kept here too.
 const spaced=conflict({kind:'设定',evidence:[{unitId:'u1',quote:'沈砚在合成 渡口旁停步'}]})
 const out=normalizeReviewReply(reviewRequest(),JSON.stringify({conflicts:[spaced]}),parse)!
 assert.equal(JSON.parse(out.text).conflicts.length,1);assert.equal(out.counts,undefined)
})
/* docs/558 CC-21..CC-24: conflict reason and v2-field locks on the wizard review lane. */
test('CC-21: reason is kept as text and dropped when it is not a string',()=>{
 const kept=JSON.parse(normalizeReviewReply(reviewRequest(),JSON.stringify({conflicts:[conflict({kind:'设定',reason:'资料写船夫，原文写旅人'})]}),parse)!.text).conflicts[0]
 assert.equal(kept.reason,'资料写船夫，原文写旅人')
 const dropped=JSON.parse(normalizeReviewReply(reviewRequest(),JSON.stringify({conflicts:[conflict({kind:'设定',reason:{x:1}})]}),parse)!.text).conflicts[0]
 assert.equal('reason' in dropped,false)
})
test('CC-22/CC-23: a lock on a v2 field is accepted when it matches and refused when it does not',async()=>{
 const withBackstory={...person,facts:{backstory:'旧背景'}}
 const deps={resolve:async()=>review,assert:async()=>undefined,generate:async()=>({conflicts:[]})} as never
 const ok=reviewRequest({artifacts:[withBackstory],semanticLocks:[{artifactId:person.id,field:'backstory',value:'旧背景'}]} as Partial<ImportAiRequest>)
 const result=await runImportAi(ok,new AbortController().signal,deps);assert.deepEqual(result.conflicts,[])
 const bad=reviewRequest({artifacts:[withBackstory],semanticLocks:[{artifactId:person.id,field:'backstory',value:'别的背景'}]} as Partial<ImportAiRequest>)
 await assert.rejects(runImportAi(bad,new AbortController().signal,deps),/语义锁定字段或基础版本无效/)
})
test('CC-24: the lane contract asks for a one-sentence reason',()=>{
 assert.match(importAiPrompt(reviewRequest()),/reason用一句中文说明资料与本段原文哪里不一致/)
})
