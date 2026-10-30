import {z} from 'zod'
import {IMPORT_TARGETS,type ImportSession,type ImportGrant} from '../shared/novel-import'
export const IMPORT_RUNTIME_MAX_CALLS=32,IMPORT_RUNTIME_MAX_BYTES=32768
const integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true}).max(40).refine(s=>/^[\x00-\x7f]+$/.test(s)&&Number.isFinite(Date.parse(s)))
const identity={version:z.literal(1),processRunId:uuid,sessionId:uuid,operationId:uuid,epoch:integer,phase:z.enum(['classify','analyze','review','patch']),kind:z.enum(IMPORT_TARGETS).optional(),intent:z.enum(['reconcile','structure','roster','entity','touches']).optional(),workingRevision:integer,scopeHash:hash,payloadHash:hash,startedAt:time}
export const importRuntimeAiCallSchema=z.discriminatedUnion('state',[z.object({...identity,state:z.literal('pending')}).strict(),z.object({...identity,state:z.literal('settled'),outcome:z.enum(['fulfilled','rejected']),settledObservedAt:time}).strict(),z.object({...identity,state:z.literal('interrupted')}).strict()]).refine(c=>(!c.intent||(c.intent==='structure'?c.phase==='classify':c.phase==='analyze'))&&(c.state!=='settled'||Date.parse(c.settledObservedAt)>=Date.parse(c.startedAt)))
export type ImportRuntimeAiCall=z.infer<typeof importRuntimeAiCallSchema>
export type ImportRuntimeCallIdentity=Omit<Extract<ImportRuntimeAiCall,{state:'pending'}>,'state'>
// imageOperations is optional: journals written before wizard image generation have no such field.
const remaining=z.object({pendingCalls:integer,operations:integer,workflowJobs:integer,pdfActive:integer,pdfRequests:integer,imageOperations:integer.optional()}).strict()
export const importRuntimePauseProofSchema=z.object({version:z.literal(1),processRunId:uuid,sessionId:uuid,oldEpoch:integer,newEpoch:integer,capturedAt:time,barrierAt:time,state:z.enum(['drained','missed','unavailable']),calls:z.array(importRuntimeAiCallSchema).max(IMPORT_RUNTIME_MAX_CALLS),remaining}).strict().refine(p=>p.newEpoch===p.oldEpoch+1&&Number.isSafeInteger(p.newEpoch)&&Date.parse(p.barrierAt)>=Date.parse(p.capturedAt)&&new Set(p.calls.map(c=>c.operationId)).size===p.calls.length&&p.calls.every(c=>c.processRunId===p.processRunId&&c.sessionId===p.sessionId&&c.epoch===p.oldEpoch&&Date.parse(c.startedAt)<=Date.parse(p.capturedAt)&&(c.state!=='settled'||Date.parse(c.settledObservedAt)>=Date.parse(p.capturedAt)&&Date.parse(c.settledObservedAt)<=Date.parse(p.barrierAt)))&&(p.state==='unavailable'||Object.values(p.remaining).every(n=>n===0)&&(p.state==='missed'?p.calls.length===0:p.calls.length>0&&p.calls.every(c=>c.state==='settled'))))
export type ImportRuntimePauseProof=z.infer<typeof importRuntimePauseProofSchema>
export interface ImportRuntimeDiagnostics {runtimeAiCall?:ImportRuntimeAiCall;runtimePauseProof?:ImportRuntimePauseProof;runtimeDiagnosticsStatus?:'unavailable'}
export interface ImportRuntimeLimits {maxBytes?:number;maxCallBytes?:number;maxTokens?:number}
const limits=(value:ImportRuntimeLimits={})=>{const result={maxBytes:value.maxBytes??IMPORT_RUNTIME_MAX_BYTES,maxCallBytes:value.maxCallBytes??1024,maxTokens:value.maxTokens??IMPORT_RUNTIME_MAX_CALLS};if(!Object.values(result).every(Number.isSafeInteger)||result.maxBytes<1||result.maxBytes>IMPORT_RUNTIME_MAX_BYTES||result.maxCallBytes<1||result.maxCallBytes>1024||result.maxTokens<1||result.maxTokens>IMPORT_RUNTIME_MAX_CALLS)throw Error('运行时证据容量限制无效');return result}
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length
export function runtimeCallBytes(call:ImportRuntimeAiCall,max=1024){if(!Number.isSafeInteger(max)||max<1||max>1024||!importRuntimeAiCallSchema.safeParse(call).success||bytes(call)>max)throw Error('运行时调用证据超过容量或结构无效');return bytes(call)}
const diagnostics=z.object({runtimeAiCall:importRuntimeAiCallSchema.optional(),runtimePauseProof:importRuntimePauseProofSchema.optional(),runtimeDiagnosticsStatus:z.literal('unavailable').optional()}).strict().refine(d=>d.runtimeDiagnosticsStatus!=='unavailable'||d.runtimePauseProof?.state!=='drained')
export function parseImportRuntimeDiagnostics(sessionId:string,value:unknown,budget?:ImportRuntimeLimits):ImportRuntimeDiagnostics|null{try{const cap=limits(budget),parsed=diagnostics.safeParse(value);if(!parsed.success)return null;const d=parsed.data;if(d.runtimeAiCall&&(d.runtimeAiCall.sessionId!==sessionId||runtimeCallBytes(d.runtimeAiCall,cap.maxCallBytes)>cap.maxCallBytes)||d.runtimePauseProof&&(d.runtimePauseProof.sessionId!==sessionId||d.runtimePauseProof.calls.length>cap.maxTokens||d.runtimePauseProof.calls.some(c=>runtimeCallBytes(c,cap.maxCallBytes)>cap.maxCallBytes))||bytes(d)>cap.maxBytes)return null;return d}catch{return null}}
export function sanitizeImportRuntimeDiagnostics(s:ImportSession,recovering=false){const fields=['runtimeAiCall','runtimePauseProof','runtimeDiagnosticsStatus'] as const;if(!fields.some(key=>Object.hasOwn(s,key)))return;const value=Object.fromEntries(fields.filter(key=>s[key]!==undefined).map(key=>[key,s[key]])),parsed=parseImportRuntimeDiagnostics(s.id,value);for(const key of fields)delete s[key];if(s.semanticVersion!==1)return;if(!parsed||parsed.runtimePauseProof&&parsed.runtimePauseProof.newEpoch>s.epoch){s.runtimeDiagnosticsStatus='unavailable';return}if(recovering&&parsed.runtimeAiCall?.state==='pending')parsed.runtimeAiCall={...parsed.runtimeAiCall,state:'interrupted'};Object.assign(s,parsed)}
/** A fresh event-loop task, with capture executed synchronously in its callback.
 * A single Promise/queueMicrotask yield cannot flush resolver->observer races. */
export function freshImportRuntimeTask<T>(capture:()=>T):Promise<T>{return new Promise((resolve,reject)=>{setImmediate(()=>{try{resolve(capture())}catch(error){reject(error)}})})}
/** Only for a verified, immutable analysis scope. Callers still check source,
 * model authorization and each request's payload on every invocation. */
export class ImportRuntimeScopeCache {
 private scopes=new WeakMap<ImportSession,{id:string;epoch:number;workingRevision:number;grant:ImportGrant;grantHash:string;hash:string}>()
 resolve(s:ImportSession,grant:ImportGrant,compute:()=>string):string{
  const previous=this.scopes.get(s),id=s.id,epoch=s.epoch,workingRevision=s.workingRevision,grantHash=grant.hash
  if(s.analysisGrant!==grant)throw Error('请重新允许发送本次导入范围')
  if(previous&&previous.id===id&&previous.epoch===epoch&&previous.workingRevision===workingRevision&&previous.grant===grant&&previous.grantHash===grantHash)return previous.hash
  this.scopes.delete(s)
  const hash=compute()
  if(hash!==grantHash||s.id!==id||s.epoch!==epoch||s.workingRevision!==workingRevision||s.analysisGrant!==grant||grant.hash!==grantHash)throw Error('请重新允许发送本次导入范围')
  this.scopes.set(s,{id,epoch,workingRevision,grant,grantHash,hash});return hash
 }
}
/** No IO or business credit. Only actual native Promises enter the token set. */
export class ImportRuntimeProofTracker {
 private tokens=new Map<string,ImportRuntimeAiCall>();private reserved=0
 last:ImportRuntimeAiCall|undefined
 constructor(readonly processRunId:string,private budget:ImportRuntimeLimits={}){uuid.parse(processRunId);limits(budget)}
 pending(sessionId?:string,epoch?:number){return [...this.tokens.values()].filter(c=>c.state==='pending'&&(!sessionId||c.sessionId===sessionId)&&(epoch===undefined||c.epoch===epoch))}
 invoke<T>(id:ImportRuntimeCallIdentity,invoke:()=>Promise<T>):Promise<T>{const cap=limits(this.budget),call={...id,state:'pending' as const};runtimeCallBytes(call,cap.maxCallBytes);if(id.epoch>=Number.MAX_SAFE_INTEGER||id.processRunId!==this.processRunId||this.tokens.has(id.operationId)||this.pending().length+this.reserved>=cap.maxTokens)throw Error('运行时调用证据容量已满')
  const future=(c:ImportRuntimeAiCall)=>({...c,state:'settled' as const,outcome:'fulfilled' as const,settledObservedAt:'2099-12-31T23:59:59.'+'0'.repeat(19)+'Z'}),all=[...this.pending(),call].map(future);all.forEach(c=>runtimeCallBytes(c,cap.maxCallBytes));const proof={version:1,processRunId:id.processRunId,sessionId:id.sessionId,oldEpoch:id.epoch,newEpoch:id.epoch+1,capturedAt:all[0].settledObservedAt,barrierAt:all[0].settledObservedAt,state:'drained',calls:all,remaining:{pendingCalls:Number.MAX_SAFE_INTEGER,operations:Number.MAX_SAFE_INTEGER,workflowJobs:Number.MAX_SAFE_INTEGER,pdfActive:Number.MAX_SAFE_INTEGER,pdfRequests:Number.MAX_SAFE_INTEGER}};if(bytes({runtimeAiCall:future(call),runtimePauseProof:proof})>cap.maxBytes)throw Error('运行时调用证据超过整体容量')
  this.reserved++;let original:Promise<T>;try{original=invoke();if(!(original instanceof Promise))throw Error('AI调用未返回原生Promise')}finally{this.reserved--}
  this.tokens.set(id.operationId,call);this.last=call
  const settle=(outcome:'fulfilled'|'rejected')=>{Object.assign(call,{state:'settled',outcome,settledObservedAt:new Date().toISOString()});this.tokens.delete(id.operationId)}
  void original.then(()=>settle('fulfilled'),()=>settle('rejected'));return original
 }
}
