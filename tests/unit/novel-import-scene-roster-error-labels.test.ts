import assert from 'node:assert/strict'
import {test} from 'node:test'
import {runImportAi,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import {NovelImportController} from '../../desktop/main/novel-import'
import {explicitTargetedRosterReply} from '../helpers/novel-import-targeted-repair-fixture'
import type {ImportAiRequest,ImportModel} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

const a='东宅的甲室门打开。',alias='又称阅览间。',b='西宅的乙室门已关闭。',secret='EL_PRIVATE_RAW_ONLY_VALUE',model:ImportModel={id:'el-model',name:'合成标签模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:1048576}
const contextGuidance='context.label必须为原文具体限定词或值，并逐字连续出现在该项每条evidence.quote中；不用类别标签或自造组合词，保留全部有据限定。'
const quoteGuidance='quote必须逐字连续、唯一地匹配声明的本包unit原文，不能改字、改绑或取首项。优先逐字复制显示的{ref}；单片quote重复时须显式用原[fromFragment,toFragment)扩大至唯一且literal恰一次，或用原raw窄引文；ref不会自动拼邻片。'
function request():ImportAiRequest{return{semanticVersion:1,operationId:'el-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:model,review:model},units:[a+'\r\n'+alias,b].map((text,i)=>({id:'el-'+i,fileId:'synthetic',start:i*1000,end:i*1000+text.length,text,kind:'body'})),artifacts:[],workingRevision:0}}
const anchor=(i:number,quote:string)=>({unitId:'el-'+i,quote})
function good(){return{roster:[{mentions:[{literal:'甲室',evidence:anchor(0,request().units[0].text)},{literal:'阅览间',evidence:anchor(0,alias)}],context:[{label:'东宅',evidence:[anchor(0,a)]}],links:[{targetIndex:1,relation:'different-place',evidence:[anchor(0,a),anchor(1,b)]}]},{mentions:[{literal:'乙室',evidence:anchor(1,b)}],context:[],links:[]}]}}
async function rejected(change:(row:any)=>void){const r=request(),before=structuredClone(r),draft=good();draft.roster[0].mentions[1].evidence.quote='EL_BAD_QUOTE';const draftBefore=structuredClone(draft);let calls=0,error:unknown
 try{await runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic-labels',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async options=>{calls++;let value:unknown=draft;if(calls>1){const reply=explicitTargetedRosterReply('prompt'in options?options.prompt:'',good(),r.units) as any;change(reply.repairs[0].replacement);value=reply}return{text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})})}catch(value){error=value}
 assert.equal(calls,4);assert.ok(error instanceof StructuredGenerationError);assert.equal(error.kind,'invalid_schema');assert.equal(error.finishReason,'stop');assert.deepEqual(error.invalidFields,['repairs']);assert.ok(error.feedback.every(line=>line.startsWith('repairs: ')));assert.deepEqual(r,before);assert.deepEqual(draft,draftBefore);return error
}
function visible(error:Error,label:string){assert.equal(error.message,'模型返回的场景清单结构无效（'+label+'），请重新识别');const main=Object.create(NovelImportController.prototype) as {safeError(error:unknown):string};assert.equal(main.safeError(error),error.message);for(const value of [secret,request().units[0].id,request().units[0].text,a,model.endpoint])assert.ok(!error.message.includes(value))}

test('EL01: a real four-generation JSON repair with an ungrounded context label retains all rejection metadata and gets a fixed useful label',async()=>{
 const error=await rejected(row=>{row.context[0].label=secret});assert.ok(error.feedback.includes('repairs: '+contextGuidance));visible(error,'原文限定')
})
test('EL02: literal, retained facts and merged CF failures remain rejected and never claim a more specific merged cause',async t=>{
 for(const [label,change]of [['称呼来源',(row:any)=>{row.name='甲室';row.aliases=[]}],['资料保留',(row:any)=>{row.context=[]}],['修复事务',(row:any)=>{row.mentions[0].evidence={choiceRef:'cf'+'0'.repeat(16)}}]] as const)await t.test(label,async()=>visible(await rejected(change),label))
})
async function mapped(path:string,feedback:string,r=request()){
 const error=new StructuredGenerationError('invalid_schema',[path],[feedback]),fields=error.invalidFields,lines=error.feedback;Object.defineProperty(error,'finishReason',{value:'stop',enumerable:false});let calls=0
 await assert.rejects(generateImportAiJson(r,{userId:'synthetic-labels',resolvedModel:{} as ResolvedModel},new AbortController().signal,'controlled error boundary',{generateText:async()=>{calls++;throw error}}),value=>value===error)
 assert.equal(calls,1);assert.equal(error.kind,'invalid_schema');assert.equal(error.finishReason,'stop');assert.equal(error.invalidFields,fields);assert.equal(error.feedback,lines);return error
}
test('EL02: an existing uncollapsed fixed quote diagnostic maps without exposing its text or changing the error object',async()=>visible(await mapped('repairs','repairs: '+quoteGuidance),'证据窗口'))
test('EL03: unknown feedback, unknown paths and arbitrary keyword guesses keep the static response fallback',async()=>{
 for(const [path,line]of [['repairs','repairs: '+secret+' context.label quote literal'],['repairs.'+secret,'repairs.'+secret+': '+contextGuidance],['repairs','repairs: context.label '+secret],['repairs','arbitrary: '+contextGuidance]])visible(await mapped(path,line),'响应结构')
 visible(await mapped('roster.0.name','roster.0.name: '+secret),'场景名称')
 const other={...request(),kind:'item' as const};delete other.sceneIdentity;const error=await mapped('repairs','repairs: '+contextGuidance,other);assert.equal(error.message,'模型返回结构不完整（repairs）')
})
