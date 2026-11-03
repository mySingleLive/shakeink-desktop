import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import {importAiPrompt,serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import {importNativeMappings} from '../../desktop/core/novel-import-semantic-state'
import {validateImportSemanticArtifact} from '../../desktop/core/novel-import-semantics'
import type {ImportAiRequest,ImportArtifact,ImportModel,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

/* docs/497–498. Synthetic names only. */
const model:ImportModel={id:'item-text',name:'合成模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:1048576}
const text='他从抽屉里取出合成铜币，铜币背面刻着一只眼睛。'
const unit:ImportUnit={id:'u-coin',fileId:'f',start:0,end:text.length,text,kind:'body'}
const request:ImportAiRequest={semanticVersion:1,operationId:'item-profile',phase:'analyze',intent:'entity',kind:'item',entityTarget:{id:'i-coin',aliases:[]},entities:[{id:'i-coin',kind:'item',name:'合成铜币'}],units:[unit],artifacts:[],workingRevision:0,models:{text:model,review:{...model,id:'item-review'}},instruction:'只导入id为i-coin的物品'}
const profile={appearance:'背面刻着一只眼睛的铜币',acquisition:'从抽屉里取出',effects:JSON.stringify([{name:'标记',description:'背面的眼睛图案'}]),aliases:JSON.stringify(['铜币']),tags:JSON.stringify(['货币']),reliability:'客观事实'}
const output=(facts:Record<string,string>):{artifacts:ImportArtifact[]}=>({artifacts:[{id:'i-coin',kind:'item',name:'合成铜币',text:'一枚铜币，背面刻着眼睛。',facts,evidence:[{unitId:'u-coin',quote:'合成铜币，铜币背面刻着一只眼睛'}],sourceUnitIds:['u-coin'],origin:'inferred'}]})
// Copied from desktop/service/novel-import-ai.ts IMPORT_ITEM_FACT_GUIDANCE (≤250 characters, not truncated).
const ITEM_GUIDANCE='物品facts仅允许reliability,attribution,temporalScope,characterId,sceneId,itemId,appearance,acquisition,effects,aliases,tags；每值为字符串；effects为[{name,description}]的JSON字符串且description非空，aliases与tags为字符串数组的JSON字符串；不写itemType等其它字段，未知省略，保留有据内容'
/** The real generation bridge with only generateText injected. */
function bridge(outputs:unknown[],r:ImportAiRequest=request){
 let calls=0;const prompts:string[]=[]
 const result=runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:'item-synthetic-user',resolvedModel:{} as ResolvedModel,maxNetworkRetries:0},signal,prompt,{generateText:async options=>{assert.ok('prompt' in options);prompts.push(options.prompt);const out=outputs[Math.min(calls++,outputs.length-1)];return {text:JSON.stringify(out),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})})
 return {result,calls:()=>calls,prompts}
}

test('IC-01: a complete item panel profile survives the real generation bridge unchanged and maps natively',async()=>{
 const b=bridge([output(profile)]),result=await b.result,a=result.artifacts![0];assert.equal(b.calls(),1)
 assert.deepEqual(a.facts,profile);assert.equal(a.text,'一枚铜币，背面刻着眼睛。');assert.ok(!Object.hasOwn(a,'schema'),'the service returns provider values without a schema tag')
 const stored={...a,schema:2 as const},mapped=importNativeMappings([stored]);assert.equal(mapped.projectableIds.length,1);assert.deepEqual(mapped.mappingWarnings,[])
 assert.deepEqual(validateImportSemanticArtifact(stored).profile,{kind:'item',value:{appearance:profile.appearance,acquisition:profile.acquisition,effects:[{name:'标记',description:'背面的眼睛图案'}],aliases:['铜币'],tags:['货币']}})
})
test('IC-02: an invalid effects structure gets one fixed correction; persistent invalid output fails after two generations',async()=>{
 const bad={...profile,effects:JSON.stringify({name:'标记'})}
 const recovered=bridge([output(bad),output(profile)]),result=await recovered.result;assert.equal(recovered.calls(),2);assert.deepEqual(result.artifacts![0].facts,profile)
 const added=recovered.prompts[1].slice(recovered.prompts[0].length),raw=JSON.stringify({name:'标记'})
 assert.ok(added.includes('artifacts.0.facts: '+ITEM_GUIDANCE),'the second generation carries the complete fixed item feedback');assert.ok(!added.includes(raw)&&!added.includes(JSON.stringify(raw).slice(1,-1)),'no provider value is echoed, raw or escaped')
 const persistent=bridge([output(bad)]);await assert.rejects(persistent.result,/模型返回结构不完整（artifacts\.0\.facts）/u);assert.equal(persistent.calls(),2)
})
test('IC-07: a non-panel field such as itemType is corrected in the next generation',async()=>{
 const b=bridge([output({...profile,itemType:'货币'}),output(profile)]),result=await b.result;assert.equal(b.calls(),2);assert.deepEqual(result.artifacts![0].facts,profile)
})
test('IC-03: unknown fields and empty effect descriptions stay rejected',async()=>{
 for(const facts of [{...profile,price:'一便士'},{...profile,effects:JSON.stringify([{name:'标记',description:''}])}])await assert.rejects(bridge([output(facts)]).result)
})
test('IC-04/IC-05: only item entity prompts gain the panel contract; other prompts keep their baseline bytes',()=>{
 const sha=(r:unknown)=>createHash('sha256').update(importAiPrompt(r as ImportAiRequest)).digest('hex'),units=[{id:'u1',fileId:'f',start:0,end:6,text:'合成正文内容',kind:'body'}],base={semanticVersion:1,phase:'analyze',units,artifacts:[],workingRevision:0}
 // Captured from the code before docs/497 (/private/tmp/shakeink-item-493/prompt-baseline.txt).
 assert.equal(sha({...base,intent:'entity',kind:'character',entityTarget:{id:'c-1',aliases:[],roleType:'SUPPORTING'},entities:[{id:'c-1',kind:'character',name:'甲'}]}),'6457fe3eac2a916a5f8b352a88b04420f71ab508cdf01dc79ff373f4115607c9')
 assert.equal(sha({...base,intent:'entity',kind:'scene',entityTarget:{id:'s-1',aliases:[]},entities:[{id:'s-1',kind:'scene',name:'乙',entityType:'PLACE'}]}),'34cc6a1a30a0cf37c5a0e44fdb9011a180f5e36f0c58390d018afbfa9d365fbd')
 assert.equal(sha({...base,intent:'entity',kind:'world',entityTarget:{id:'w-1',aliases:[]},entities:[{id:'w-1',kind:'world',name:'丙',entityType:'WORLD'}]}),'2b2fd225fe51f0999a30680c85081392b1f596a581ec8edc4c0be87d8e392576')
 assert.equal(sha({...base,kind:'item'}),'98ad4302db751c286985b39a46abac402b45d6102ff335125ba7f3aed0d7534b')
 assert.equal(sha({...base,intent:'roster',kind:'item'}),'4acdcea79d151ab8de6af1565b3c3dfc302527a60062b1ad9bc1c6aaf8ceb0e6')
 const prompt=importAiPrompt(request)
 for(const field of ['appearance','acquisition','effects','aliases','tags'])assert.ok(prompt.includes('"'+field+'"'),field);assert.ok(prompt.includes('<item-native-profile-contract>'))
 // docs/500 supersedes the 498 IC-05 negative: item prompts now use the indexed evidence contract (IE-05).
})
test('IC-04: ordinary item analysis keeps the v1 field table and rejects panel fields',async()=>{
 const {intent:_intent,entityTarget:_target,...ordinary}=request
 await assert.rejects(runImportAi({...ordinary,operationId:'item-ordinary'} as ImportAiRequest,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>output(profile)}))
})

/* docs/500–501: items use verified quote options with index references. */
const options=[{unitId:'u-coin',quote:'取出合成铜币，铜币背面'},{unitId:'u-coin',quote:'合成铜币，铜币背面刻着一只眼睛'}]
const withOptions:ImportAiRequest={...request,operationId:'item-options',entityTarget:{id:'i-coin',aliases:[],evidenceOptions:options}}
const indexed=(evidence:unknown[])=>{const out=output(profile);(out.artifacts[0] as unknown as {evidence:unknown[]}).evidence=evidence;delete (out.artifacts[0] as {sourceUnitIds?:string[]}).sourceUnitIds;return out}
test('IE-02: an item optionIndex reference resolves to the verified option and the application derives source units',async()=>{
 const b=bridge([indexed([{optionIndex:1}])],withOptions),result=await b.result,a=result.artifacts![0];assert.equal(b.calls(),1)
 assert.deepEqual(a.evidence,[options[1]]);assert.deepEqual(a.sourceUnitIds,['u-coin']);assert.deepEqual(a.facts,profile);assert.equal(a.text,'一枚铜币，背面刻着眼睛。')
})
test('IE-04: out-of-range, fractional, string and mixed option references and invented quotes stay rejected',async()=>{
 for(const evidence of [[{optionIndex:2}],[{optionIndex:0.5}],[{optionIndex:'0'}],[{optionIndex:0,quote:options[0].quote}],[{unitId:'u-coin',quote:'模型虚构的不存在原文'}]])await assert.rejects(bridge([indexed(evidence)],withOptions).result,Error,JSON.stringify(evidence))
})
test('IE-05: the item entity prompt uses the indexed evidence contract without character-only text',()=>{
 const prompt=importAiPrompt(withOptions)
 assert.ok(prompt.includes('<entity-evidence-options-contract>'));assert.ok(prompt.includes('[{optionIndex}]'));assert.ok(prompt.includes('sourceUnitIds由应用'))
 assert.ok(!prompt.includes('<character-import-contract>'));assert.ok(!prompt.includes('<character-native-profile-contract>'));assert.ok(!prompt.includes('角色roleType必须等于entityTarget.roleType'));assert.ok(prompt.includes('<item-native-profile-contract>'))
 const plain=importAiPrompt(request);assert.ok(plain.includes('[{unitId,quote}]'));assert.ok(plain.includes('sourceUnitIds由应用'))
 assert.ok(prompt.includes('每项evidence优先引用提供的optionIndex'));assert.ok(prompt.includes('sourceUnitIds由应用从已核验evidence计算'));// The shared entity and semantic contracts that scene and world prompts also carry mention roleType; only the character output sentence is excluded above.
 // Prompts that already used options keep their bytes (/private/tmp/shakeink-item-493/prompt-baseline-500.txt).
 const sha=(r:unknown)=>createHash('sha256').update(importAiPrompt(r as ImportAiRequest)).digest('hex'),u=[{id:'u1',fileId:'f',start:0,end:6,text:'合成正文内容',kind:'body'}],opts=[{unitId:'u1',quote:'合成正文'}],b={semanticVersion:1,phase:'analyze',units:u,artifacts:[],workingRevision:0}
 assert.equal(sha({...b,intent:'entity',kind:'character',entityTarget:{id:'c-1',aliases:[],roleType:'SUPPORTING',evidenceOptions:opts},entities:[{id:'c-1',kind:'character',name:'甲'}]}),'e197874fe49c01372efb2c0058037628cd809669ce0f9ef5c74004b57f792476')
 assert.equal(sha({...b,intent:'entity',kind:'scene',entityTarget:{id:'s-1',aliases:[],evidenceOptions:opts},entities:[{id:'s-1',kind:'scene',name:'乙',entityType:'PLACE'}]}),'48468a945f52526b0f8cd158ceacf563c9e926776ad62a76a3053d9bf7a771ee')
})

test('IE-01: the payload numbers each item option with its 0-based optionIndex',()=>{
 const payload=JSON.parse(serializeImportAiPayload(withOptions)) as {entityTarget:{evidenceOptions:{optionIndex:number;unitId:string;quote:string}[]}}
 assert.deepEqual(payload.entityTarget.evidenceOptions,options.map((o,optionIndex)=>({...o,optionIndex})))
})
test('IE-08: item quote feedback names the item and asks for an option index',async()=>{
 const b=bridge([indexed([{unitId:'u-coin',quote:'模型虚构的不存在原文'}]),indexed([{optionIndex:0}])],withOptions);await b.result
 const added=b.prompts[1].slice(b.prompts[0].length);assert.ok(added.includes('本物品已有核验引用选项'));assert.ok(!added.includes('本角色'))
})
