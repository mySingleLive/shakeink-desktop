import assert from 'node:assert/strict'
import {test} from 'node:test'
import Ajv from 'ajv'
import {bridgeBound,boundReply} from '../helpers/novel-import-bound-decisions-fixture'
import {bad,good,patchReply,planOf,request} from '../helpers/novel-import-claim-patch-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {createSceneRosterBoundDecisions,sceneRosterBoundAnswerDiagnostics} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
import type {SceneRosterTargetedPlan} from '../../desktop/service/novel-import-scene-roster-targeted-repair'

test('SW01: fresh claims reject old selection wrappers before a complete explicit claims correction passes every original gate',async()=>{
 let bareOutput:unknown,wrappedOutput:unknown
 const actual=await bridgeBound(bad(),({prompt,request:r,deck,generation})=>{assert.ok(deck.tasks.every(task=>task.kind==='claims'));const bare=boundReply(prompt,patchReply(planOf(prompt),r),r);bareOutput={answers:Object.fromEntries(bare.answers.map((value,index)=>[String(index+1),value]))};wrappedOutput={answers:Object.fromEntries(bare.answers.map((_value,index)=>[String(index+1),{selection:1}]))};return generation===2?wrappedOutput:bareOutput})
 assert.equal(actual.options.length,3)
 assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()))
 const call=actual.model.doStreamCalls[1],schema=call.responseFormat?.type==='json'?call.responseFormat.schema:undefined
 assert.ok(schema);const native=new Ajv({strict:false}).compile(schema)
 assert.ok(Object.values((schema.properties!.answers as {properties:Record<string,{type:string;properties:unknown}>}).properties).every(value=>value.type==='object'&&Object.hasOwn(value.properties as object,'claimChoices')))
 assert.equal(native(bareOutput),true)
 assert.equal(native(wrappedOutput),false)
})

function deck(){
 const refs=['cf'+'1'.repeat(16),'cf'+'2'.repeat(16)],claim='pc'+'3'.repeat(16),plan:SceneRosterTargetedPlan={choices:refs.map((choiceRef,index)=>({choiceRef,unitIndex:0,start:index,end:index+1,literals:['合成室']})),rows:[{slot:0,repairRef:'rr'+'4'.repeat(16),canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]},patch:{claims:[{claimRef:claim,kind:'mention',index:0,literal:'合成室',eligibleChoiceRefs:refs,canReject:false}]}},{slot:1,repairRef:'rr'+'5'.repeat(16),canReject:true,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]}}]}
 return createSceneRosterBoundDecisions({plan,draft:[{},{}],groups:slot=>slot===0?[{claimRefs:[claim],validate(){}}]:undefined})
}
test('SW02: wrappers preserve every bare integer result and reject unsafe shapes without executing getters or Proxy traps',()=>{
 const value=deck(),replacement={mentions:[],context:[],links:[]},decode=(choice:unknown)=>value.decode([choice,replacement],entry=>entry)
 for(const choice of[1,2]){
  assert.deepEqual(decode({selection:choice}),decode(choice))
  assert.deepEqual(decode(Object.assign(Object.create(null),{selection:choice})),decode(choice))
 }
 let getterCalls=0,proxyCalls=0
 const accessor=Object.defineProperty({},'selection',{get(){getterCalls++;return 1}}),proxy=new Proxy({selection:1},{get(){proxyCalls++;return 1},getPrototypeOf(){proxyCalls++;return Object.prototype},ownKeys(){proxyCalls++;return['selection']},getOwnPropertyDescriptor(){proxyCalls++;return{value:1,configurable:true}}})
 for(const candidate of[0,3,-1,1.5,'1',true,null,[],{},{selection:0},{selection:3},{selection:1.5},{selection:'1'},{selection:true},{selection:null},{selection:undefined},{selection:NaN},{selection:Infinity},{selection:{selection:1}},{selection:1,extra:true},{selection:1,[Symbol('extra')]:true},Object.create({selection:1}),accessor,proxy,new(class{selection=1})()])assert.throws(()=>decode(candidate))
 assert.equal(getterCalls,0);assert.equal(proxyCalls,0)
 assert.equal(value.decode([1,0],entry=>entry)[1].disposition,'reject')
 const wrappedReplacement={selection:0};let received:unknown
 value.decode([1,wrappedReplacement],entry=>{received=entry;return entry})
 assert.equal(received,wrappedReplacement,'replacement objects must never be unwrapped')
})
test('SW03: replacement wrappers still fail the real strict record gate, while diagnostics respect an earlier valid selection wrapper',async()=>{
 const options:Parameters<typeof import('../../src/lib/ai/generate').generateText>[0][]=[],first=good();Object.assign(first.roster[0],{unknown:'SW_REPLACEMENT_FORCE'})
 await assert.rejects(bridgeBound(first,()=>({answers:{'1':{selection:1}}}),{options}),error=>!!error&&typeof error==='object'&&'kind'in error&&error.kind==='invalid_schema')
 assert.equal(options.length,4)
 const tasks=deck().data.tasks,diagnostics=sceneRosterBoundAnswerDiagnostics({answers:[{selection:1},{}]},tasks,()=>false)
 assert.equal(diagnostics.length,1);assert.ok(diagnostics[0].startsWith('第2项replacement'))
 assert.ok(sceneRosterBoundAnswerDiagnostics({answers:[{selection:3},{}]},tasks,()=>false)[0].startsWith('第1项是selection'))
})
