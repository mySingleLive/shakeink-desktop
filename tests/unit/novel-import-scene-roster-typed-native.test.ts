import assert from'node:assert/strict'
import{test}from'node:test'
import{sceneRosterBoundNativeSchema}from'../../desktop/service/novel-import-scene-roster-bound-decisions'
const tasks:Parameters<typeof sceneRosterBoundNativeSchema>[0]=[{kind:'selection',slot:0,claimIndexes:[0],claims:[],options:[[[1]],[[2]]]},{kind:'replacement',slot:1,canReject:false,boundCanReject:false}]
test('TU04: the actual bound native factory emits inline homogeneous typed union instead of tuple and local references',()=>{const schema=sceneRosterBoundNativeSchema(tasks,3),answers=schema.properties!.answers as any;assert.equal(Object.hasOwn(schema,'definitions'),false);assert.equal(Array.isArray(answers.items),false);assert.ok(!JSON.stringify(schema).includes('"$ref"'));assert.ok(answers.items.anyOf.every((branch:any)=>typeof branch.type==='string'))})

import Ajv from 'ajv'
import type {JSONSchema7} from '@ai-sdk/provider'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {r49SceneRosterBoundNativeSchema,R49_BOUND_NATIVE_FACTORY_SHA256} from '../helpers/novel-import-bound-native-r49-fixture'
type Tasks=readonly Exclude<Parameters<typeof sceneRosterBoundNativeSchema>[0][number],{kind:'claims'}>[]
function oldUniform(tasks:Tasks,count:number):JSONSchema7{
 const original=r49SceneRosterBoundNativeSchema(tasks,count),copy=structuredClone(original),answers=copy.properties!.answers as JSONSchema7
 const tuple=answers.items as JSONSchema7[]
 answers.items=tuple.length?{anyOf:tuple}:{type:'integer'};delete answers.additionalItems
 const expand=(value:unknown):unknown=>{if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(expand);const node=value as Record<string,unknown>;if(Object.hasOwn(node,'$ref')){assert.deepEqual(Object.keys(node),['$ref']);const match=/^#\/definitions\/([^/]+)$/u.exec(node.$ref as string);assert.ok(match);assert.ok(Object.hasOwn(original.definitions!,match[1]));return expand(original.definitions![match[1]])}return Object.fromEntries(Object.entries(node).map(([key,child])=>[key,expand(child)]))}
 const result=expand(copy) as JSONSchema7;delete result.definitions;return result
}
const record={mentions:[{literal:'合成室',evidence:{choice:1}}],context:[],links:[]}
const replacement=(canReject=false,boundCanReject=canReject)=>({kind:'replacement' as const,slot:0,canReject,boundCanReject})
const selection=(count:number)=>({kind:'selection' as const,slot:0,claims:[],claimIndexes:[0],options:Array.from({length:count},(_,index)=>[[index+1]])})
function assertTypedTree(value:unknown):void{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(assertTypedTree);return}const node=value as Record<string,unknown>;assert.equal(Object.hasOwn(node,'$ref'),false);assert.equal(Object.hasOwn(node,'definitions'),false);if(Object.hasOwn(node,'items'))assert.equal(Array.isArray(node.items),false);if(Array.isArray(node.anyOf))for(const branch of node.anyOf)assert.equal(typeof branch.type,'string');Object.values(node).forEach(assertTypedTree)}

test('TU04b: the R49 baseline is frozen verbatim and zero/single/mixed tasks preserve old legal forms with only the declared metadata advisory superset',()=>{
 const fixture=readFileSync('tests/helpers/novel-import-bound-native-r49-fixture.ts','utf8'),source=fixture.slice(fixture.indexOf('export function r49SceneRosterBoundNativeSchema(')).replace('export function r49SceneRosterBoundNativeSchema(','export function sceneRosterBoundNativeSchema(')
 assert.equal(createHash('sha256').update(source).digest('hex'),R49_BOUND_NATIVE_FACTORY_SHA256)
 assert.equal(R49_BOUND_NATIVE_FACTORY_SHA256,'13604337f75c332f421989f877aea0c9ceb833ab190787b9afc915c3b50a9dee')
 const fixtures:Tasks[]=[[],[selection(2)],[selection(2),selection(2)],[replacement()],[replacement(true)],[replacement(true,false)],[selection(2),selection(3),replacement(),replacement(true),replacement()]]
 const ajv=new Ajv({strict:false}),variants:unknown[]=[0,1,2,3,4,-1,.5,'1',null,record,{...record,primaryMentionIndex:0},{...record,name:'合成室',aliases:[]},{...record,name:'合成室',aliases:Array(20).fill('合成称呼')},{...record,name:'合成室',aliases:Array(21).fill('合成称呼')},{...record,name:'a'.repeat(301),aliases:[]},{...record,name:'合成室',aliases:[],primaryMentionIndex:0},{...record,mentions:[]},{...record,unknown:true},{...record,mentions:[{literal:'合成室',evidence:{choice:0}}]},{...record,mentions:[{literal:'合成室',evidence:{choice:4}}]},{...record,context:[{label:'合成限定',evidence:[{choice:1},{choice:2}]}],links:[{targetIndex:0,relation:'same-place',evidence:[{choice:1},{choice:3}]}]}]
 for(const sample of fixtures){const before=structuredClone(sample),old=ajv.compile(oldUniform(sample,3)),schema=sceneRosterBoundNativeSchema(sample,3),next=ajv.compile(schema);assertTypedTree(schema);const good=sample.map(task=>task.kind==='selection'?1:task.kind==='replacement'&&task.boundCanReject?0:record);const examples:unknown[]=[{answers:good},{answers:good,unknown:true},{answers:good.slice(1)},{answers:[...good,1]},{answers:null}];for(let index=0;index<sample.length;index++)for(const variant of variants){const answers:unknown[]=structuredClone(good);answers[index]=variant;examples.push({answers})}for(const value of examples){if(old(value))assert.equal(next(value),true);else if(next(value)){assert.ok((value as {answers:unknown[]}).answers.some(entry=>!!entry&&typeof entry==='object'&&Object.hasOwn(entry,'name')&&Object.hasOwn(entry,'aliases')&&Object.hasOwn(entry,'primaryMentionIndex')),'only the declared mixed-metadata advisory difference is allowed')}}assert.equal(next({answers:good}),true);assert.equal(next({answers:[...good,1]}),false);assert.deepEqual(sample,before);if(!sample.length){assert.equal(next({answers:[]}),true);assert.deepEqual((schema.properties!.answers as JSONSchema7).items,{type:'integer'})}}
})

test('TU04c: exact duplicate leaves disappear while ranges, zero and all three complete replacement forms remain',()=>{
 const schema=sceneRosterBoundNativeSchema([selection(2),selection(2),selection(3),replacement(),replacement(true),replacement()],3),items=(schema.properties!.answers as JSONSchema7).items as JSONSchema7,leaves=items.anyOf as JSONSchema7[]
 assert.equal(leaves.length,4);assert.deepEqual(leaves.filter(node=>node.type==='integer'),[{type:'integer',minimum:1,maximum:2},{type:'integer',minimum:1,maximum:3},{type:'integer',enum:[0]}]);assert.equal(leaves.filter(node=>node.type==='object').length,1)
 assert.deepEqual((sceneRosterBoundNativeSchema([selection(2),selection(2)],3).properties!.answers as JSONSchema7).items,{type:'integer',minimum:1,maximum:2})
 const changed=sceneRosterBoundNativeSchema(tasks,3);((changed.properties!.answers as JSONSchema7).items as JSONSchema7).anyOf=[];assert.ok((((sceneRosterBoundNativeSchema(tasks,3).properties!.answers as JSONSchema7).items as JSONSchema7).anyOf??[]).length>0)
})

import {createSceneRosterBoundDecisions} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
import type {SceneRosterTargetedPlan} from '../../desktop/service/novel-import-scene-roster-targeted-repair'
test('TU05: uniform native membership cannot bypass the unchanged application position or zero gates',()=>{
 const ref='cf'+'1'.repeat(16),claim='pc'+'2'.repeat(16),plan={choices:[{choiceRef:ref,unitIndex:0,start:0,end:1,literals:['合成室']}],rows:[{slot:0,repairRef:'rr'+'3'.repeat(16),canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]},patch:{claims:[{claimRef:claim,kind:'mention',index:0,literal:'合成室',eligibleChoiceRefs:[ref],canReject:false}]}},{slot:1,repairRef:'rr'+'4'.repeat(16),canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]}}]} as SceneRosterTargetedPlan
 const deck=createSceneRosterBoundDecisions({plan,draft:[{},{}],groups:slot=>slot===0?[{claimRefs:[claim],validate(){}}]:undefined}),native=new Ajv({strict:false}).compile(sceneRosterBoundNativeSchema(deck.data.tasks,1)),legacy=new Ajv({strict:false}).compile(r49SceneRosterBoundNativeSchema(deck.data.tasks.filter((task):task is Exclude<typeof task,{kind:'claims'}>=>{assert.notEqual(task.kind,'claims');return task.kind!=='claims'}),1))
 assert.equal(native({answers:[record,1]}),true);assert.equal(legacy({answers:[record,1]}),false);assert.throws(()=>deck.decode([record,1],value=>value));assert.throws(()=>deck.decode([1,0],value=>value));assert.throws(()=>deck.decode([0,record],value=>value));assert.throws(()=>deck.decode([1],value=>value));assert.throws(()=>deck.decode([2,record],value=>value));assert.equal(deck.decode([1,record],value=>value).length,2)
 const rejectPlan=structuredClone(plan);rejectPlan.rows[1].canReject=true
 const rejectDeck=createSceneRosterBoundDecisions({plan:rejectPlan,draft:[{},{}],groups:slot=>slot===0?[{claimRefs:[claim],validate(){}}]:undefined}),rejectNative=new Ajv({strict:false}).compile(sceneRosterBoundNativeSchema(rejectDeck.data.tasks,1))
 assert.equal(rejectNative({answers:[0,record]}),true);assert.throws(()=>rejectDeck.decode([0,record],value=>value))
 const ranges=structuredClone(plan),secondRef='cf'+'5'.repeat(16),secondClaim='pc'+'6'.repeat(16)
 ranges.choices=[...ranges.choices,{choiceRef:secondRef,unitIndex:0,start:1,end:2,literals:['另一合成室']}];ranges.rows[1].patch={claims:[{...ranges.rows[0].patch!.claims[0],claimRef:secondClaim,eligibleChoiceRefs:[ref,secondRef]}]}
 const rangeDeck=createSceneRosterBoundDecisions({plan:ranges,draft:[{},{}],groups:slot=>[{claimRefs:[ranges.rows[slot].patch!.claims[0].claimRef],validate(){}}]}),rangeNative=new Ajv({strict:false}).compile(sceneRosterBoundNativeSchema(rangeDeck.data.tasks,2))
 assert.equal(rangeNative({answers:[2,1]}),true);assert.throws(()=>rangeDeck.decode([2,1],value=>value));assert.equal(rangeDeck.decode([1,2],value=>value).length,2)
})

import {bridgeBound,boundReplacement} from '../helpers/novel-import-bound-decisions-fixture'
import {bad,good,request} from '../helpers/novel-import-claim-patch-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
test('TU05b: the real SDK response-format boundary carries complete flat records and every original source/canonical gate',async t=>{
 for(const [label,metadata]of [['first',{}],['primary',{primaryMentionIndex:1}],['legacy',{name:'甲室',aliases:['阅览间']}]] as const)await t.test(label,async()=>{const first={roster:[{...bad().roster[0],...metadata,unknown:'TU_FORCE_REPLACEMENT'},good().roster[1]]},expected={roster:[{...good().roster[0],...metadata},good().roster[1]]};const actual=await bridgeBound(first,({prompt,request:r})=>({answers:[boundReplacement(prompt,expected.roster[0],r)]}));assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(expected));assert.equal(actual.options.length,2);assert.equal(actual.model.doStreamCalls.length,2);const schema=actual.model.doStreamCalls[1].responseFormat?.type==='json'?actual.model.doStreamCalls[1].responseFormat.schema:undefined;assert.ok(schema);assertTypedTree(schema);assert.deepEqual((schema as JSONSchema7).required,['answers']);for(const call of actual.model.doStreamCalls)assert.equal(call.maxOutputTokens,undefined);assert.deepEqual((actual.options[0].jsonOutputSchema as JSONSchema7).required,['roster'])})
})
