import {z} from 'zod'
import type {ImportFormat} from './novel-import'

/** Public metadata only. Entry IDs are capabilities of one main-process picker. */
export interface SourcePickerEntry {
 id:string
 name:string
 displayPath:string
 kind:'file'|'directory'
 format?:ImportFormat
 bytes:number
 selectable:boolean
 navigable:boolean
 reason?:string
}
export interface SourcePickerView {
 id:string
 revision:number
 phase:'loading'|'ready'|'checking'
 current:SourcePickerEntry|null
 breadcrumbs:SourcePickerEntry[]
 places:SourcePickerEntry[]
 entries:SourcePickerEntry[]
 selected:SourcePickerEntry[]
 error?:string
}
const revision={id:z.uuid(),revision:z.number().int().nonnegative()}
export const sourcePickerActionSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('current')}).strict(),
 // Cancel deliberately has no CAS revision and never waits behind directory IO.
 z.object({type:z.literal('cancel'),id:z.uuid()}).strict(),
 z.object({type:z.literal('navigate'),...revision,entryId:z.uuid()}).strict(),
 z.object({type:z.literal('toggle'),...revision,entryId:z.uuid()}).strict(),
 z.object({type:z.literal('clear'),...revision}).strict(),
 z.object({type:z.literal('confirm'),...revision}).strict(),
])
export type SourcePickerAction=z.infer<typeof sourcePickerActionSchema>
export interface SourcePickerBridge {novelImportSources(action:SourcePickerAction):Promise<SourcePickerView|null>}
