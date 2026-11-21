import assert from 'node:assert/strict'
import {test} from 'node:test'
import {z} from 'zod'
import {generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import {NovelImportController} from '../../desktop/main/novel-import'
import {StructuredGenerationError,generateJSON,parseJsonOutput} from '../../src/lib/ai/generate'
import type {ImportAiRequest,ImportModel} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

const prefix='场景清单无法定位定点修复记录，请重新识别',secret='UD_PRIVATE_RAW_ONLY_KEY_AND_VALUE',model:ImportModel={id:'ud-model',name:'合成诊断模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',authRevision:1,contextWindow:1048576}
const code=/^场景清单无法定位定点修复记录，请重新识别 \[SRU1 native=(0|1) kind=(invalid_json|invalid_schema|incomplete) finish=(stop|length|content-filter|tool-calls|error|other|unknown) candidateRoot=(unparsed|null|array|string|number|boolean|object-no-roster|object-roster-nonarray|object-roster-extra|object-roster-only|roster-oversize)\]$/u
function request():ImportAiRequest{const text='东宅的书房有蓝墙。😀\r\n';return{semanticVersion:1,operationId:'ud-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:model,review:model},units:[{id:'UD_PRIVATE_UNIT',fileId:'UD_PRIVATE_FILE',start:0,end:text.length,text,kind:'body'}],artifacts:[],workingRevision:0}}
async function bridge(text:string,native:boolean,finishReason:string|null='stop',r=request()){
 const before=structuredClone(r),schemas:boolean[]=[];let calls=0,error:unknown,result:unknown
 try{result=await runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic-diagnostic',resolvedModel:{} as ResolvedModel,...(native?{structuredSceneRoster:true}:{})},signal,prompt,{generateText:async options=>{calls++;schemas.push(options.jsonOutputSchema!==undefined);return{text,promptTokens:1,completionTokens:1,cost:0,...(finishReason===null?{}:{finishReason})}}})})}catch(value){error=value}
 assert.deepEqual(r,before);return{error,result,calls,schemas}
}

test('UD01: only safe enums describe an unlocatable parser candidate and the original first failure kind',async t=>{
 const cases:[string,string,string][]=[
  ['unparsed','not-json '+secret,'invalid_json'],['null','null','invalid_schema'],['array','[]','invalid_schema'],['string',JSON.stringify(secret),'invalid_schema'],['number','42','invalid_schema'],['boolean','false','invalid_schema'],
  ['object-no-roster',JSON.stringify({[secret]:secret}),'invalid_schema'],['object-roster-nonarray',JSON.stringify({roster:null}),'invalid_schema'],['object-roster-extra',JSON.stringify({roster:[],[secret]:secret}),'invalid_schema'],['roster-oversize',JSON.stringify({roster:Array.from({length:2001},()=>({}))}),'invalid_schema'],
 ]
 for(const native of [false,true])for(const [root,text,kind]of cases)await t.test((native?'native ':'text ')+root,async()=>{
  const actual=await bridge(text,native)
  if(root==='unparsed'||root==='object-roster-extra'){assert.equal(actual.calls,4);assert.deepEqual(actual.schemas,[native,native,native,native]);assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,root==='unparsed'?'invalid_json':'invalid_schema');assert.equal(actual.error.finishReason,'stop');assert.ok(!actual.error.message.includes(secret));return}
  assert.equal(actual.calls,1);assert.deepEqual(actual.schemas,[native]);assert.ok(actual.error instanceof Error);const match=actual.error.message.match(code);assert.ok(match,'the original non-recoverable root failure must expose the fixed diagnostic code');assert.deepEqual(match.slice(1),[native?'1':'0',kind,'stop',root]);for(const value of [secret,model.id,model.endpoint,request().units[0].id,request().units[0].text])assert.ok(!actual.error.message.includes(value))
 })
 for(const native of [false,true])await t.test((native?'native ':'text ')+'incomplete first finish',async()=>{const actual=await bridge('[]',native,'length');assert.equal(actual.calls,1);assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,'incomplete');assert.equal(actual.error.finishReason,'length')})
})
test('UD02: fenced extraction reports the original parser candidate and the main UI message stays unchanged',async()=>{
 const actual=await bridge('UNTRUSTED '+secret+'\n```json\nnull\n```\ntrailing text',true);assert.ok(actual.error instanceof Error);assert.deepEqual(actual.error.message.match(code)?.slice(1),['1','invalid_schema','stop','null']);assert.ok(!actual.error.message.includes(secret))
 const controller=Object.create(NovelImportController.prototype) as {safeError(error:unknown):string};assert.equal(controller.safeError(actual.error),controller.safeError(new Error(prefix)));assert.equal(controller.safeError(actual.error),'场景清单无法定位定点修复记录，请重新识别','the scene reason is shown without its internal diagnostic suffix')
 for(const suffix of [' extra '+secret,'] '+secret,' [SRU1 native=2 kind=invalid_json candidateRoot=array]'])assert.equal(code.test(actual.error.message+suffix),false)
})
test('UD04: SDK finish is a closed diagnostic enum, while direct parser errors have no invented finish metadata',async t=>{
 for(const [raw,finish]of [['stop','stop'],['length','length'],['content-filter','content-filter'],['tool-calls','tool-calls'],['error','error'],['other','other'],['unknown','unknown'],[secret,'unknown'],[null,'unknown']] as const)await t.test(raw===secret?'unrecognized SDK finish':raw??'missing SDK finish',async()=>{
  const actual=await bridge('[]',true,raw);assert.equal(actual.calls,1);assert.ok(actual.error instanceof Error);if(raw==='stop')assert.deepEqual(actual.error.message.match(code)?.slice(1),['1','invalid_schema','stop','array']);else{assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,'incomplete');assert.equal(actual.error.finishReason,finish)}assert.ok(!actual.error.message.includes(secret))
 })
 const schema=z.strictObject({ok:z.boolean()});let direct:StructuredGenerationError|undefined
 try{parseJsonOutput('[]',schema)}catch(error){assert.ok(error instanceof StructuredGenerationError);direct=error}
 assert.ok(direct);assert.equal(Object.hasOwn(direct,'finishReason'),false);assert.equal(direct.finishReason,undefined)
 let original:StructuredGenerationError|undefined,calls=0
 await assert.rejects(generateJSON({userId:'synthetic',action:'ud-metadata',prompt:'original',schema,repair:({error})=>{original=error;throw error}},{generateText:async options=>{calls++;assert.ok(!Object.hasOwn(options,'finishReason'));return{text:'[]',promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),error=>error===original)
 assert.equal(calls,1);assert.ok(original);assert.equal(original.kind,direct.kind);assert.equal(original.message,direct.message);assert.equal(original.finishReason,'stop');assert.equal(Object.getOwnPropertyDescriptor(original,'finishReason')?.enumerable,false);assert.ok(!Object.keys(original).includes('finishReason'))
})
test('UD05: best-effort finish annotation never replaces an error and the final bounded failure also retains its safe finish',async()=>{
 const define=Object.defineProperty,schema=z.strictObject({ok:z.boolean()});let blocked=0,original:StructuredGenerationError|undefined
 Object.defineProperty=function(target,key,attributes){if(target instanceof StructuredGenerationError&&key==='finishReason'){blocked++;throw Error('synthetic diagnostic annotation failure')}return Reflect.apply(define,Object,[target,key,attributes])} as typeof Object.defineProperty
 try{await assert.rejects(generateJSON({userId:'synthetic',action:'ud-annotation',prompt:'original',schema,repair:({error})=>{original=error;throw error}},{generateText:async()=>({text:'[]',promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})}),error=>error===original);assert.equal(blocked,1);assert.ok(original instanceof StructuredGenerationError);assert.equal(original.finishReason,undefined)}finally{Object.defineProperty=define}
 assert.equal(Object.defineProperty,define);let calls=0
 await assert.rejects(generateJSON({userId:'synthetic',action:'ud-final',prompt:'original',schema},{generateText:async()=>{calls++;return{text:'[]',promptTokens:0,completionTokens:0,cost:0,finishReason:'content-filter'}}}),error=>error instanceof StructuredGenerationError&&error.kind==='incomplete'&&error.message==='模型输出未完整结束'&&error.finishReason==='content-filter'&&Object.getOwnPropertyDescriptor(error,'finishReason')?.enumerable===false);assert.equal(calls,2)
})
test('UD03: original budget, valid roster, and generic failure behavior are unchanged',async()=>{
 const budget=await bridge(secret.repeat(7000),true);assert.equal(budget.calls,1);assert.ok(budget.error instanceof Error);assert.equal(budget.error.message,'场景清单完整纠错资料超过模型预算，请保留资料后重试');assert.ok(!budget.error.message.includes('SRU1'))
 for(const native of [false,true]){const good=await bridge('{"roster":[]}',native);assert.equal(good.calls,1);assert.equal(good.error,undefined);assert.deepEqual(good.result,{roster:[],sceneRosterRecords:[]})}
 const r=request();r.kind='character';delete r.sceneIdentity;const generic=await bridge('not-json '+secret,false,'stop',r);assert.equal(generic.calls,2);assert.ok(generic.error instanceof StructuredGenerationError);assert.equal(generic.error.kind,'invalid_json');assert.ok(!generic.error.message.includes('SRU1'))
})
