import {z} from 'zod'
import type {Workspaces} from './workspaces'

const inputSchema=z.object({requestId:z.uuid(),title:z.string().max(200),importHash:z.string().regex(/^[a-f0-9]{64}$/u),target:z.object({path:z.string(),device:z.string(),inode:z.string()}).strict().optional()}).strict()
export type ImportDiscardInput=z.infer<typeof inputSchema>
export type ImportDiscardResult={state:'none'|'work'|'cleaned'|'kept';reason?:string}

/** docs/560: delete what an unfinished import save wrote. The folder comes only from the
 * reservation bound at creation; the draft's target is informational and never authorizes a delete. */
export function discardNovelImport(works:Workspaces,value:unknown,assertCurrent:()=>void=()=>{}):Promise<ImportDiscardResult>{
 const input=inputSchema.parse(value)
 return works.discardImportCreation({requestId:input.requestId,title:input.title.trim(),importHash:input.importHash},assertCurrent)
}
