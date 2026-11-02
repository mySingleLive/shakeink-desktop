import type {JSONSchema7} from '@ai-sdk/provider'
import {JSON_OUTPUT_INSTRUCTION} from '../../src/lib/ai/json-output-instruction'
import type {ImportAiRequest} from '../shared/novel-import'
import type {ImportExecutionBudget} from './novel-import-budget-policy'
import {assertImportPayloadBudget,assertImportFixedPromptReserve} from './novel-import-ai-payload'

export type NativeSceneJsonModel={provider?:unknown;protocol?:unknown;kind?:unknown;endpoint?:unknown;modelId?:unknown;contextWindow?:unknown}
export type SceneRosterNativeRequest=Pick<ImportAiRequest,'semanticVersion'|'phase'|'intent'|'kind'|'sceneIdentity'|'sceneParentTargets'>
export type SceneRosterNativePhase='first'|'repair'
/** The original entity capability whitelist, without a request-scope change. */
export function supportsNativeSceneJsonModel(model:NativeSceneJsonModel):boolean{return model.provider==='deepseek'&&model.protocol==='openai'&&(model.kind===undefined||model.kind==='TEXT')&&(model.modelId==='deepseek-flash'||model.modelId==='deepseek-v4-pro')&&(model.endpoint==='https://api.deepseek.com'||model.endpoint==='https://api.deepseek.com/')}
const string=(maxLength?:number):JSONSchema7=>({type:'string',minLength:1,pattern:'\\S',...(maxLength===undefined?{}:{maxLength})})
const integer:JSONSchema7={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}
const object=(properties:Record<string,JSONSchema7>):JSONSchema7=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const array=(items:JSONSchema7,maxItems:number,minItems=0):JSONSchema7=>({type:'array',items,minItems,maxItems})
const raw=object({unitId:string(512),quote:string()}),ef=object({ref:{type:'string',pattern:'^ef[0-9a-f]{16}$'}}),span=object({unitIndex:integer,fromFragment:integer,toFragment:integer}),cf=object({choiceRef:{type:'string',pattern:'^cf[0-9a-f]{16}$'}})
function record(anchor:JSONSchema7):JSONSchema7{return object({mentions:array(object({literal:string(300),evidence:anchor}),50000,1),context:array(object({label:string(300),evidence:array(anchor,50000,1)}),50000),links:array(object({targetIndex:integer,relation:{type:'string',enum:['same-place','different-place','parent']},evidence:array(anchor,50000,1)}),20000)})}
const firstSchema=object({roster:array(record({anyOf:[ef,raw,span]}),2000)})
const patchClaimRef={type:'string',pattern:'^pc[0-9a-f]{16}$'} as JSONSchema7
const patchClaim:JSONSchema7={anyOf:[object({claimRef:patchClaimRef,disposition:{type:'string',enum:['resolve']},choiceRefs:array({type:'string',pattern:'^cf[0-9a-f]{16}$'},50000,1)}),object({claimRef:patchClaimRef,disposition:{type:'string',enum:['reject']}})]}
const repairSchema=object({repairs:array({anyOf:[object({repairRef:{type:'string',pattern:'^rr[0-9a-f]{16}$'},disposition:{type:'string',enum:['replace']},replacement:record(cf)}),object({repairRef:{type:'string',pattern:'^rr[0-9a-f]{16}$'},disposition:{type:'string',enum:['reject']}}),object({repairRef:{type:'string',pattern:'^rr[0-9a-f]{16}$'},disposition:{type:'string',enum:['patch']},patch:object({claims:array(patchClaim,50000,1)})})]},2000,1)})
export function sceneRosterNativeSchema(request:SceneRosterNativeRequest,model:NativeSceneJsonModel,phase:SceneRosterNativePhase):JSONSchema7|undefined{
 if(request.semanticVersion!==1||request.phase!=='analyze'||request.intent!=='roster'||request.kind!=='scene'||request.sceneIdentity?.version!==1||request.sceneIdentity.mode!=='roster'||request.sceneParentTargets!==undefined||!supportsNativeSceneJsonModel(model))return undefined
 if(phase!=='first'&&phase!=='repair')throw Error('场景原生结构化输出阶段无效')
 // Each SDK call receives its own copy; callers cannot mutate the planner's
 // next schema or the schema used to account for another request.
 return structuredClone(phase==='first'?firstSchema:repairSchema)
}
export function assertSceneRosterNativeBudget(request:SceneRosterNativeRequest&Pick<ImportAiRequest,'units'>,model:NativeSceneJsonModel,budget:ImportExecutionBudget,payload:string,prompt:string,phase:SceneRosterNativePhase,actualSchema?:JSONSchema7):void{
 const supported=sceneRosterNativeSchema(request,model,phase);if(supported===undefined)return
 const schema=actualSchema??supported
 const schemaText=JSON.stringify(schema),schemaBytes=Buffer.byteLength(schemaText,'utf8'),actualPrompt=prompt+(phase==='first'?JSON_OUTPUT_INSTRUCTION:'')
 assertImportPayloadBudget(request,payload,budget.characters,budget.maxUnits)
 if(payload.length+schemaBytes>budget.characters*3)throw Error('导入请求超过模型预算，请继续分批')
 assertImportFixedPromptReserve(actualPrompt+schemaText,payload)
 const capacity=typeof model.contextWindow==='number'&&Number.isSafeInteger(model.contextWindow)&&model.contextWindow>0?model.contextWindow:16000
 if(budget.version===1&&Buffer.byteLength(actualPrompt+schemaText,'utf8')+6000>capacity)throw Error('场景原生结构化输入超过模型容量预算，请保留资料后重试')
}
export const SCENE_ROSTER_KEYED_SCHEMA_MAX_BYTES=65536
/** Only the trusted prepared/frozen keyed repair call site uses this larger,
 * explicitly separate control allowance. First/root and other scopes retain
 * assertSceneRosterNativeBudget and its original combined limits. */
export function assertSceneRosterKeyedInlineBudget(request:SceneRosterNativeRequest&Pick<ImportAiRequest,'units'>,model:NativeSceneJsonModel,budget:ImportExecutionBudget,payload:string,actualPrompt:string,schema:JSONSchema7):void{
 if(sceneRosterNativeSchema(request,model,'repair')===undefined)throw Error('当前请求不支持场景绑定修复预算')
 assertImportPayloadBudget(request,payload,budget.characters,budget.maxUnits)
 assertImportFixedPromptReserve(actualPrompt,payload)
 const schemaBytes=Buffer.byteLength(JSON.stringify(schema),'utf8')
 if(schemaBytes>SCENE_ROSTER_KEYED_SCHEMA_MAX_BYTES)throw Error('场景绑定修复结构超过模型预算，请保留资料后重试')
 const capacity=typeof model.contextWindow==='number'&&Number.isSafeInteger(model.contextWindow)&&model.contextWindow>0?model.contextWindow:16000
 if(Buffer.byteLength(actualPrompt,'utf8')+schemaBytes+6000>capacity)throw Error('场景绑定修复完整输入超过模型容量预算，请保留资料后重试')
}
