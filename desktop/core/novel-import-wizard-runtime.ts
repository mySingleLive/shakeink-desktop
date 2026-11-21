import {z} from 'zod'
import {importRuntimeAiCallSchema,type ImportRuntimeAiCall} from './novel-import-runtime-proof'

/** Wizard sessions keep in-flight call evidence in `runtime.json` next to the journal, so concurrent
 * requests do not rewrite the whole journal (05 §8.1 N3). */
export const WIZARD_RUNTIME_FILE='runtime.json'
export const WIZARD_RUNTIME_LIMITS={calls:64,bytes:65536} as const
export const WIZARD_RUNTIME_TEMP=/^\.runtime-[0-9a-f-]{36}\.tmp$/u
const schema=z.object({version:z.literal(1),sessionId:z.uuid(),processRunId:z.uuid(),updatedAt:z.iso.datetime({offset:true}).max(40),calls:z.array(importRuntimeAiCallSchema).max(WIZARD_RUNTIME_LIMITS.calls)}).strict()
export type WizardRuntimeFile=z.infer<typeof schema>

export function encodeWizardRuntime(value:WizardRuntimeFile):string{
 const parsed=schema.safeParse(value);if(!parsed.success||parsed.data.calls.some(c=>c.sessionId!==value.sessionId))throw Error('运行时证据结构无效')
 const text=JSON.stringify(parsed.data);if(new TextEncoder().encode(text).length>WIZARD_RUNTIME_LIMITS.bytes)throw Error('运行时证据超过容量')
 return text
}
export function parseWizardRuntime(sessionId:string,text:string):WizardRuntimeFile|null{
 if(new TextEncoder().encode(text).length>WIZARD_RUNTIME_LIMITS.bytes)return null
 try{const parsed=schema.safeParse(JSON.parse(text));return parsed.success&&parsed.data.sessionId===sessionId&&parsed.data.calls.every(c=>c.sessionId===sessionId)?parsed.data:null}catch{return null}
}
/** Newest calls win; pending calls are never dropped while settled ones remain. */
export function trimWizardRuntimeCalls(calls:readonly ImportRuntimeAiCall[]):ImportRuntimeAiCall[]{
 const list=[...calls];while(list.length>WIZARD_RUNTIME_LIMITS.calls){const i=list.findIndex(c=>c.state!=='pending');list.splice(i<0?0:i,1)}
 return list
}
