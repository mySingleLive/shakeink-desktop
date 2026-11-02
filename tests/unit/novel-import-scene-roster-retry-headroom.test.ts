import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bridgeBound,boundReplacement} from '../helpers/novel-import-bound-decisions-fixture'
import {claimsFixture} from '../helpers/novel-import-claims-integration-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import type {generateText} from '../../src/lib/ai/generate'
import {sceneRosterKeyedInlineSchema,sceneRosterBoundTaskDisplay} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
import {claimsDeck} from '../helpers/novel-import-claims-integration-fixture'
import Ajv from 'ajv'

type Options=Parameters<typeof generateText>[0]
function fixture(padding=0){
 const literals=['甲室','乙室','丙室','丁室','戊室','己室'],texts=['基室灯亮。',...literals.flatMap(literal=>Array.from({length:8},(_,i)=>'第'+i+'处的'+literal+'。'))],f=claimsFixture(texts),base={literal:'基室',evidence:f.anchor(0)},row={mentions:[base,...literals.flatMap((literal,i)=>[0,1].map(at=>({literal,evidence:{unitId:f.request.units[0].id,quote:'HR_BAD_'+i+'_'+at}})))],context:[],links:[]},correct={mentions:[base,...literals.flatMap((literal,i)=>[0,1].map(at=>({literal,evidence:f.anchor(1+i*8+at)})))],context:[],links:[]},ghost={mentions:[{literal:'HR_ABSENT_PADDING_ROW',evidence:{ref:'ef'+'a'.repeat(18)}}],context:[],links:[],HR_UNTRUSTED_PADDING:'x'.repeat(padding)}
 return{...f,first:{roster:[row,ghost]},correctRows:[correct],expected:{roster:[correct]}}
}
async function run(f:ReturnType<typeof fixture>,options:Options[]=[],change?:(reply:{answers:Record<string,unknown>},prompt:string,generation:number)=>unknown){return bridgeBound(f.first,({deck,prompt,generation})=>{
 const answers:Record<string,unknown>={}
 for(const[at,task]of deck.tasks.entries()){
  if(task.kind==='selection')answers[String(at+1)]={selection:1}
  else if(task.kind==='replacement')answers[String(at+1)]=task.boundCanReject?0:boundReplacement(prompt,f.correctRows[task.slot],f.request)
  else{const used=new Map<string,Set<number>>(),local:Record<string,number[]>={};for(const[index,domain]of task.domains.entries()){assert.equal(domain.kind,'mention');const key=domain.choices.join(','),prior=used.get(key)??new Set<number>(),n=domain.choices.find(n=>!prior.has(n));assert.ok(n);prior.add(n);used.set(key,prior);local[String(index+1)]=[n]}answers[String(at+1)]={claimChoices:local}}
 }
 const reply={answers},schema=options.at(-1)?.jsonOutputSchema;assert.ok(schema);assert.equal(new Ajv({strict:false}).compile(schema)(reply),true,'the current complete SDK Native schema must match the chosen current bundle before any deliberate refusal');return change?change(reply,prompt,generation):reply
 },{request:f.request,options})}
function promptOf(option:Options){assert.ok('prompt'in option);return option.prompt}
function fixed(option:Options,f:{request:ReturnType<typeof claimsFixture>['request']}){return Buffer.byteLength(promptOf(option),'utf8')-Buffer.byteLength(serializeImportAiPayload(f.request),'utf8')+16384}
function viewOf(option:Options){const prompt=promptOf(option),tag='<scene-roster-bound-repair>',at=prompt.indexOf(tag);assert.ok(at>=0);return JSON.parse(prompt.slice(at+tag.length,prompt.indexOf('</scene-roster-bound-repair>',at)))}

test('HR01: before activation a complete hard-fit can earn5000 bytes through safe further preparation',async()=>{
 const base=fixture(),baseline=await run(base),room=64500-fixed(baseline.options[1],base);assert.ok(room>0)
 const padded=fixture(room),actual=await run(padded),second=actual.options[1]
 assert.ok(fixed(second,padded)<=65536-5000,'the optional preparation target must be reached when complete cheaper hard-fit forms exist')
 assert.equal(actual.options.length,2);assert.equal(actual.usageRows.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(padded.request).parse(padded.expected))
 assert.ok(promptOf(second).includes(serializeImportAiPayload(padded.request)));assert.ok(promptOf(second).includes('x'.repeat(room)));assert.ok(Buffer.byteLength(JSON.stringify(second.jsonOutputSchema),'utf8')<=65536);assert.equal(second.maxOutputTokens,undefined)
})

function singleton(padding=0,proofRows=0){
 const f=claimsFixture(['基室灯亮。','新室门开。',...Array.from({length:proofRows},(_,i)=>'第'+i+'处保留室'+String(i).padStart(2,'0')+'。')]),base={literal:'基室',evidence:f.anchor(0)},correct={mentions:[base,{literal:'新室',evidence:f.anchor(1)}],context:[],links:[]},row={...correct,mentions:[base,{literal:'新室',evidence:{ref:'ef'+'a'.repeat(18)}}]},others=Array.from({length:proofRows},(_,i)=>({mentions:[{literal:'保留室'+String(i).padStart(2,'0'),evidence:f.anchor(i+2)}],context:[],links:[]})),correctRows=[correct,...others],ghost={mentions:[{literal:'HR_ABSENT_PADDING_ROW',evidence:{ref:'ef'+'b'.repeat(18)}}],context:[],links:[],HR_UNTRUSTED_PADDING:'x'.repeat(padding)},first={roster:proofRows?[row,...others.map((value,i)=>({...value,HR_FORCE_REPLACEMENT:i===0?'x'.repeat(padding):true}))]:[row,ghost]}
 return{...f,first,correctRows,expected:{roster:correctRows}}
}
async function singletonRun(f:ReturnType<typeof singleton>){const options:Options[]=[];return bridgeBound(f.first,({deck,prompt})=>{const reply={answers:Object.fromEntries(deck.tasks.map((task,at)=>{assert.notEqual(task.kind,'selection');if(task.kind==='replacement')return[String(at+1),task.boundCanReject?0:boundReplacement(prompt,f.correctRows[task.slot],f.request)];assert.equal(task.kind,'claims');assert.equal(task.domains.length,1);assert.equal(task.domains[0].kind,'mention');assert.equal(task.domains[0].choices.length,1);return[String(at+1),{claimChoices:{'1':[task.domains[0].choices[0]]}}]}))},schema=options.at(-1)?.jsonOutputSchema;assert.ok(schema);assert.equal(new Ajv({strict:false}).compile(schema)(reply),true);return reply},{request:f.request,options})}
test('HR02: insufficient soft headroom remains legal when the next complete representation does not save fixed bytes',async()=>{
 const base=singleton(),baseline=await singletonRun(base),padding=62000-fixed(baseline.options[1],base);assert.ok(padding>0)
 const f=singleton(padding),actual=await singletonRun(f);assert.equal(fixed(actual.options[1],f),62000);assert.ok(65536-fixed(actual.options[1],f)<5000);assert.deepEqual(actual.options[1].jsonOutputSchema,baseline.options[1].jsonOutputSchema,'discarded non-saving Native must not leak into the current complete bundle');assert.equal(actual.options.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(f.request).parse(f.expected))
 const view=viewOf(actual.options[1]),plan=claimsDeck(promptOf(actual.options[1])).plan,trial=plan.rows.map(row=>({kind:'replacement' as const,slot:row.slot,canReject:row.canReject,boundCanReject:row.canReject})),nextView={...view,tasks:sceneRosterBoundTaskDisplay(trial,plan)};assert.ok(Buffer.byteLength(JSON.stringify(nextView),'utf8')>=Buffer.byteLength(JSON.stringify(view),'utf8'),'the real available terminal preview does not save fixed bytes');assert.ok(Buffer.byteLength(JSON.stringify(sceneRosterKeyedInlineSchema(trial,plan.choices.length,'object')),'utf8')<=65536,'this refusal is about non-saving fixed bytes, not a hidden Native cap failure')
})
test('HR03: a preview that exceeds the existing Native cap cannot pollute a usable hard-fit prompt or decoder',async()=>{
 const base=singleton(0,13),baseline=await singletonRun(base),schemaBytes=Buffer.byteLength(JSON.stringify(baseline.options[1].jsonOutputSchema),'utf8');assert.ok(schemaBytes>60000&&schemaBytes<=65536,'the current full original replacement schemas are genuinely near the existing Native cap')
 const padding=62000-fixed(baseline.options[1],base);assert.ok(padding>0);const f=singleton(padding,13),actual=await singletonRun(f)
 assert.equal(fixed(actual.options[1],f),62000);assert.deepEqual(actual.options[1].jsonOutputSchema,baseline.options[1].jsonOutputSchema);assert.equal(actual.options.length,2);assert.equal(actual.usageRows.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(f.request).parse(f.expected));assert.equal(actual.result.sceneRosterRecords!.length,14)
 const plan=claimsDeck(promptOf(actual.options[1])).plan,trial=plan.rows.map(row=>({kind:'replacement' as const,slot:row.slot,canReject:false,boundCanReject:false}));assert.ok(Buffer.byteLength(JSON.stringify(sceneRosterKeyedInlineSchema(trial,plan.choices.length,'object')),'utf8')>65536,'the actual only remaining complete preview exceeds the original Native hard cap')
})
test('HR04: after soft preparation commits, generations3/4 keep the exact selected bundle and all original material',async()=>{
 const base=fixture(),baseline=await run(base),padding=64500-fixed(baseline.options[1],base);assert.ok(padding>0);const f=fixture(padding),options:Options[]=[],views:string[]=[],plans:string[]=[],schemas:string[]=[],failed:unknown[]=[]
 const result=await run(f,options,(reply,prompt,generation)=>{
  views.push(JSON.stringify(viewOf(options.at(-1)!)));plans.push(JSON.stringify(claimsDeck(prompt).plan));schemas.push(JSON.stringify(options.at(-1)!.jsonOutputSchema));assert.ok(prompt.includes(serializeImportAiPayload(f.request)));assert.ok(prompt.includes('x'.repeat(padding)))
  const frames=[...prompt.matchAll(/<previous-scene-roster-output>(.*?)<\/previous-scene-roster-output>/gsu)].map(match=>JSON.parse(match[1]));assert.ok(frames.some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(f.first)));if(failed.length)assert.ok(frames.some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(failed.at(-1))))
  if(generation<4){const invalid={...reply,HR_RETRY_UNTRUSTED:{generation,padding:'y'.repeat(128)}};failed.push(structuredClone(invalid));return invalid}return reply
 })
 assert.equal(options.length,4);assert.equal(result.usageRows.length,4);assert.equal(new Set(views).size,1);assert.equal(new Set(plans).size,1);assert.equal(new Set(schemas).size,1);assert.ok(fixed(options[1],f)<=65536-5000);assert.deepEqual(result.result,sceneRosterGenerationSchema(f.request).parse(f.expected))
})

test('HR05: an active object selection refusal teaches the same closed wrapper in the real next SDK prompt',async()=>{
 const f=fixture(),options:Options[]=[];let refusedTask=0
 const actual=await run(f,options,(reply,prompt,generation)=>{
  if(generation===2){const view=viewOf(options.at(-1)!);assert.equal(view.selectionEncoding,'object');refusedTask=view.tasks.findIndex((task:{kind:string})=>task.kind==='selection')+1;assert.ok(refusedTask>0);return{answers:{...reply.answers,[String(refusedTask)]:{selection:0}}}}
  assert.equal(generation,3)
  const correction=prompt.replace(/<(previous-scene-roster-output|scene-roster-targeted-repair|scene-roster-bound-repair)>.*?<\/\1>/gsu,'')
  assert.ok(correction.includes('第'+refusedTask+'项是selection，只填{"selection":optionNumber}'),'actual correction must retain the trusted object selection encoding')
  assert.equal(correction.includes('不填0、数组或对象'),false,'the correction must not forbid the required selection object')
  assert.ok(correction.includes('selection只答{"selection":局部optionNumber}'))
  return reply
 })
 assert.equal(actual.options.length,3);assert.equal(actual.usageRows.length,3);assert.deepEqual(actual.result,sceneRosterGenerationSchema(f.request).parse(f.expected))
})
