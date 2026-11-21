import {z} from "zod"

/** A main-process question rendered by the window's React prompt host instead of a native message box. */
const value=z.string().regex(/^[a-z][a-z-]{0,31}$/u)
const text=(max:number)=>z.string().min(1).max(max)
export const promptButtonSchema=z.strictObject({value,label:text(40),variant:z.enum(["default","outline","destructive"])})
export const promptInputSchema=z.strictObject({
 tone:z.enum(["info","question","warning","error"]),
 title:text(120),
 message:text(400),
 detail:z.string().max(16000).optional(),
 buttons:z.array(promptButtonSchema).min(1).max(4),
 defaultValue:value,
 cancelValue:value,
}).superRefine((prompt,ctx)=>{
 const values=prompt.buttons.map(button=>button.value)
 if(new Set(values).size!==values.length)ctx.addIssue({code:"custom",message:"按钮值重复"})
 if(!values.includes(prompt.defaultValue)||!values.includes(prompt.cancelValue))ctx.addIssue({code:"custom",message:"默认或取消值不在按钮中"})
})
export type PromptButton=z.infer<typeof promptButtonSchema>
export type PromptInput=z.infer<typeof promptInputSchema>
export type AppPrompt=PromptInput&{id:string}
export const promptReplySchema=z.strictObject({id:z.uuid(),value})
export interface PromptBridge{prompts():Promise<AppPrompt[]>;replyPrompt(id:string,value:string):Promise<boolean>}
