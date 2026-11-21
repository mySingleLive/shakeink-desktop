import assert from 'node:assert/strict'
import type {JSONSchema7} from '@ai-sdk/provider'

type Task={kind:'selection';options:readonly unknown[]}|{kind:'replacement';boundCanReject:boolean;primaryRejectOnly?:true}|{kind:'claims';domains:readonly {kind:'mention'|'context'|'link';canReject:boolean;choices:readonly number[]}[]}
type Deck={tasks:readonly Task[];choices:readonly unknown[];selectionEncoding?:'object'}

/** Handwritten contract; deliberately does not import the production factory. */
export function assertBoundNativeShape(actual:unknown,deck:Deck):void{
 const closed=(properties:Record<string,JSONSchema7>,required=Object.keys(properties)):JSONSchema7=>({type:'object',properties,required,additionalProperties:false})
 const list=(items:JSONSchema7,maxItems:number,minItems=0):JSONSchema7=>({type:'array',items,maxItems,minItems})
 const text:JSONSchema7={type:'string',minLength:1,pattern:'\\S',maxLength:300}
 const integer:JSONSchema7={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}
 const anchor=closed({choice:{type:'integer',minimum:1,maximum:deck.choices.length}})
 const fields={
  mentions:list(closed({literal:text,evidence:anchor}),50000,1),
  context:list(closed({label:text,evidence:list(anchor,50000,1)}),50000),
  links:list(closed({targetIndex:integer,relation:{type:'string',enum:['same-place','different-place','parent']},evidence:list(anchor,50000,1)}),20000),
 }
 const records=[closed(fields),closed({primaryMentionIndex:integer,...fields}),closed({name:text,aliases:list(text,20),...fields})]
 // Every original position keeps its own domain; no cross-task union.
 const claims=(domains:Extract<Task,{kind:'claims'}>['domains'])=>closed({claimChoices:closed(Object.fromEntries(domains.map((domain,index)=>[String(index+1),domain.choices.length?{type:'array',items:{type:'integer',enum:[...domain.choices]},minItems:domain.canReject?0:1,maxItems:domain.kind==='mention'?1:Math.min(50000,domain.choices.length)}:{type:'array',items:{type:'integer'},minItems:0,maxItems:0}])) as Record<string,JSONSchema7>)})
 const properties=Object.fromEntries(deck.tasks.map((task,index)=>[String(index+1),task.kind==='selection'?(deck.selectionEncoding==='object'?closed({selection:{type:'integer',minimum:1,maximum:task.options.length}}):{type:'integer',minimum:1,maximum:task.options.length}):task.kind==='claims'?claims(task.domains):task.primaryRejectOnly&&task.boundCanReject?{type:'integer',enum:[0]}:{anyOf:task.boundCanReject?[{type:'integer',enum:[0]},...records]:records}])) as Record<string,JSONSchema7>
 assert.deepEqual(actual,closed({answers:closed(properties)}),'complete handwritten keyed Native shape, per-task domains and original strict record limits')
 const walk=(value:unknown):void=>{
  if(!value||typeof value!=='object')return
  if(Array.isArray(value)){value.forEach(walk);return}
  const row=value as Record<string,unknown>
  for(const key of ['$ref','definitions','$defs','additionalItems'])assert.equal(Object.hasOwn(row,key),false,'bound Native has no refs, definitions or tuple-only keyword')
  if(Object.hasOwn(row,'items'))assert.equal(Array.isArray(row.items),false,'items is always a homogeneous schema object')
  if(row.type==='object'){
   assert.equal(row.additionalProperties,false)
   const keys=Object.keys(row.properties as object).sort()
   assert.deepEqual([...(row.required as string[])].sort(),keys,'every property is required in the keyed Native schema')
  }
  if(Array.isArray(row.anyOf))for(const leaf of row.anyOf)assert.equal(typeof (leaf as Record<string,unknown>).type,'string','all union leaves are typed')
  Object.values(row).forEach(walk)
 }
 walk(actual)
}
