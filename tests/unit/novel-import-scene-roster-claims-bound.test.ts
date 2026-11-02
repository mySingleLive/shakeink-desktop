import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createSceneRosterBoundDecisions as createClaimsBoundDeck} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
const refs=Array.from({length:9},(_,i)=>'cf'+String(i+1).padStart(16,'0')),claimRef='pc'+'1'.repeat(16)
function limitInput(){return{plan:{choices:refs.map((choiceRef,unitIndex)=>({choiceRef,unitIndex,start:0,end:1,literals:['合成']})),rows:[{repairRef:'rr'+'1'.repeat(16),slot:0,canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]},patch:{claims:[{claimRef,kind:'context' as const,index:0,evidenceIndex:0,label:'合成',canReject:true as const,eligibleChoiceRefs:refs}]}}]},draft:[{mentions:[],context:[],links:[]}],groups:()=>[{claimRefs:[claimRef],validate(){}}]}}
test('CB01: a complete classified patch above the original 256 assignment limit starts as full claims, not replacement',()=>{const deck=createClaimsBoundDeck(limitInput());assert.equal(deck.data.tasks[0].kind,'claims')})

import {sceneRosterKeyedInlineSchema as claimsBoundNativeSchema,sceneRosterBoundAnswerDiagnostics,sceneRosterBoundTaskDisplay,SCENE_ROSTER_BOUND_ANSWER_GUIDANCE} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
import {createHash} from 'node:crypto'
import {applyClaimsCandidate,claimsCandidateFixture} from '../helpers/novel-import-claims-bound-fixture'
import {bindSceneRosterRepairDiagnostic} from '../../desktop/service/novel-import-scene-roster-repair-diagnostic'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {prepareSceneRosterClaimPatch} from '../../desktop/service/novel-import-scene-roster-claim-patch'
import {createSceneRosterRetention} from '../../desktop/service/novel-import-scene-roster-retention'
import type {Anchor} from '../../desktop/shared/novel-import-scene-identity'
const clone=<T>(v:T):T=>structuredClone(v)
function single(){const d=createClaimsBoundDeck(limitInput());d.activate();return d}
const packet=(values:unknown)=>({answers:{'1':{claimChoices:{'1':values}}}})
function subsets(values:number[]){return Array.from({length:2**values.length},(_,mask)=>values.filter((_,i)=>mask&(1<<i)))}

test('CB02: a complete handwritten 256-assignment oracle maps numeric multi-CF decisions to the original patch application unchanged',()=>{
 const f=claimsCandidateFixture(),task=f.deck.data.tasks[5];assert.equal(task.kind,'claims');if(task.kind!=='claims')throw Error('TEST_KIND');assert.deepEqual(task.claimIndexes,[0,1,2,3]);assert.deepEqual(task.domains.map(d=>d.choices),[[6],[],[4,5],[1,2,3,4,5,6]])
 const before=clone(f.draft),proofBefore=clone(f.retention.verifiedRows());let count=0
 for(const context of subsets([4,5]))for(const link of subsets([1,2,3,4,5,6])){const value=clone(f.validWitness);value.answers['6'].claimChoices['3']=context;value.answers['6'].claimChoices['4']=link;const decoded=f.deck.decodeRoot(value,v=>v).find(d=>d.repairRef===f.plan.rows[5].repairRef)!;assert.equal(decoded.disposition,'patch');if(decoded.disposition!=='patch')throw Error('TEST_DISPOSITION');const expected=f.patches.get(5)!.data.map((c,i)=>{const nums=i===0?[6]:i===1?[]:i===2?context:link;return nums.length?{claimRef:c.claimRef,disposition:'resolve' as const,choiceRefs:nums.map(n=>f.refs[n-1])}:{claimRef:c.claimRef,disposition:'reject' as const}});assert.deepEqual(decoded.patch.claims,expected);assert.deepEqual(f.patches.get(5)!.apply(decoded.patch.claims),f.patches.get(5)!.apply(expected));count++}
 assert.equal(count,256);const ordered=clone(f.validWitness);ordered.answers['6'].claimChoices['3']=[5,4];const d=f.deck.decodeRoot(ordered,v=>v)[5];if(d.disposition!=='patch')throw Error('TEST_DISPOSITION');assert.deepEqual(d.patch.claims[2],{claimRef:f.patches.get(5)!.data[2].claimRef,disposition:'resolve',choiceRefs:[f.refs[4],f.refs[3]]});assert.deepEqual(f.draft,before);assert.deepEqual(f.retention.verifiedRows(),proofBefore)
})

test('CB03: exact root/local keys, integer domains, cardinality, holes and extras reject without protocol fallback',()=>{
 const d=single();assert.deepEqual(d.decodeRoot(packet([1,2]),v=>v)[0],{repairRef:'rr'+'1'.repeat(16),disposition:'patch',patch:{claims:[{claimRef,disposition:'resolve',choiceRefs:[refs[0],refs[1]]}]}})
 const invalid:unknown[]=[{answers:{}},{answers:{'01':{claimChoices:{'1':[1]}}}},{answers:{'1':0}}, {answers:{'1':{claimChoices:{}}}},{answers:{'1':{claimChoices:{'01':[1]}}}},{answers:{'1':{claimChoices:{'1':[1],'2':[]}}}},{answers:{'1':{claimChoices:{'1':[1]},extra:true}}},packet(1),packet([0]),packet([-1]),packet([1.5]),packet(['1']),packet([true]),packet([10]),packet([1,1])]
 for(const value of invalid)assert.throws(()=>d.decodeRoot(value,()=>{throw Error('NO_REPLACEMENT_FALLBACK')}))
 const hole=new Array(1);assert.throws(()=>d.decodeRoot(packet(hole),v=>v));const extra=Object.assign([1],{unexpected:1});assert.throws(()=>d.decodeRoot(packet(extra),v=>v));const symbol=[1];Object.defineProperty(symbol,Symbol('extra'),{value:1});assert.throws(()=>d.decodeRoot(packet(symbol),v=>v))
 let legacyCalls=0;assert.throws(()=>d.decodeRoot({answers:{},repairs:[]},v=>v,()=>{legacyCalls++;return[]}));assert.equal(legacyCalls,0);assert.deepEqual(d.decodeRoot({repairs:[]},v=>v,()=>{legacyCalls++;return[]}),[]);assert.equal(legacyCalls,1)
 const f=claimsCandidateFixture(),zero=clone(f.validWitness);zero.answers['6']=0 as never;assert.throws(()=>f.deck.decodeRoot(zero,v=>v));const missing=clone(f.validWitness);missing.answers['6'].claimChoices['1']=[];assert.throws(()=>f.deck.decodeRoot(missing,v=>v));assert.throws(()=>f.patches.get(5)!.apply(f.patches.get(5)!.data.map(c=>({claimRef:c.claimRef,disposition:'reject'}))))
})

test('CB04: custom/inherited prototypes, getters and proxies execute zero accessors in new claim arrays and roots',()=>{
 const d=single();let getters=0;const proto=Object.create(Array.prototype);Object.defineProperty(proto,Symbol.iterator,{get(){getters++;return Array.prototype[Symbol.iterator]}});const inherited=Object.setPrototypeOf([1],proto);assert.throws(()=>d.decodeRoot(packet(inherited),v=>v));assert.equal(getters,0)
 const own=[1];Object.defineProperty(own,'0',{get(){getters++;return 1}});assert.throws(()=>d.decodeRoot(packet(own),v=>v));const choices={};Object.defineProperty(choices,'1',{get(){getters++;return[1]},enumerable:true});assert.throws(()=>d.decodeRoot({answers:{'1':{claimChoices:choices}}},v=>v));const custom=Object.create({claimChoices:{'1':[1]}});assert.throws(()=>d.decodeRoot({answers:{'1':custom}},v=>v));const proxied=new Proxy(packet([1]),{get(){getters++;return undefined},ownKeys(){getters++;return[]}});assert.throws(()=>d.decodeRoot(proxied,v=>v));const proxiedArray=new Proxy([1],{get(){getters++;return 1}});assert.throws(()=>d.decodeRoot(packet(proxiedArray),v=>v));assert.equal(getters,0)
})

test('CB05: preparation is monotonic, stale decks cannot branch, and activation freezes every task/domain',()=>{
 const x=limitInput();x.plan.rows[0].patch.claims[0].eligibleChoiceRefs=[refs[0]];let deck=createClaimsBoundDeck(x);assert.equal(deck.data.tasks[0].kind,'selection');const old=deck;deck=deck.advance(0);assert.equal(deck.data.tasks[0].kind,'claims');assert.equal(deck.transitions,1);assert.throws(()=>old.advance(0));deck=deck.advance(0);assert.equal(deck.data.tasks[0].kind,'replacement');assert.equal(deck.transitions,2);assert.equal(deck.next(),undefined);assert.throws(()=>deck.advance(0));deck.activate();assert.throws(()=>deck.next());assert.throws(()=>{deck.data.tasks.push(deck.data.tasks[0])})
 const noPatch=limitInput();delete (noPatch.plan.rows[0] as any).patch;assert.equal(createClaimsBoundDeck(noPatch).data.tasks[0].kind,'replacement');const whole=limitInput();whole.plan.rows[0].canReject=true;assert.equal(createClaimsBoundDeck(whole).data.tasks[0].kind,'replacement');const incomplete=limitInput();incomplete.groups=()=>[];assert.equal(createClaimsBoundDeck(incomplete).data.tasks[0].kind,'replacement')
 const many=Array.from({length:12},(_,i)=>'cf'+String(i+1).padStart(16,'0')),calls=Array(20).fill(0),rows=Array.from({length:20},(_,slot)=>({repairRef:'rr'+String(slot+1).padStart(16,'0'),slot,canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]},patch:{claims:[{claimRef:'pc'+String(slot+1).padStart(16,'0'),kind:'context' as const,index:0,evidenceIndex:0,label:'合成',canReject:true as const,eligibleChoiceRefs:many}]}})),bounded=createClaimsBoundDeck({plan:{rows,choices:many.map((choiceRef,unitIndex)=>({choiceRef,unitIndex,start:0,end:1,literals:['合成']}))},draft:rows.map(()=>({})),groups:slot=>[{claimRefs:[rows[slot].patch.claims[0].claimRef],validate(){calls[slot]++;throw Error('SYNTHETIC_NO_ENUMERATED_SOLUTION')}}]});assert.equal(bounded.data.tasks.length,20);assert.ok(bounded.data.tasks.every(t=>t.kind==='claims'&&t.domains[0].choices.length===12));assert.ok(calls[0]>0&&calls[0]<2**12);assert.ok(calls.slice(16).every(n=>n===0),'the original 65536 request counter stops further enumeration, not claim domains')
})

test('CB06: Native reject-only and original 50000 multi-CF cap remain explicit, with no empty enum or mention widening',()=>{
 const empty=limitInput();empty.plan.rows[0].patch.claims[0].eligibleChoiceRefs=[];const d=createClaimsBoundDeck(empty).advance(0),schema=claimsBoundNativeSchema(d.data.tasks,9) as any,field=schema.properties.answers.properties['1'].properties.claimChoices.properties['1'];assert.equal(field.minItems,0);assert.equal(field.maxItems,0);assert.equal(Object.hasOwn(field.items,'enum'),false);assert.deepEqual(d.decodeRoot(packet([]),v=>v)[0],{repairRef:'rr'+'1'.repeat(16),disposition:'patch',patch:{claims:[{claimRef,disposition:'reject'}]}});assert.throws(()=>d.decodeRoot(packet([1]),v=>v))
 const large=Array.from({length:50001},(_,i)=>'cf'+String(i+1).padStart(16,'0')),input=limitInput();input.plan.choices=large.map((choiceRef,unitIndex)=>({choiceRef,unitIndex,start:0,end:1,literals:['合成']}));input.plan.rows[0].patch.claims[0].eligibleChoiceRefs=large;const big=createClaimsBoundDeck(input),native=claimsBoundNativeSchema(big.data.tasks,large.length) as any,f=native.properties.answers.properties['1'].properties.claimChoices.properties['1'];assert.equal(f.items.enum.length,50001);assert.equal(f.maxItems,50000);assert.throws(()=>big.decodeRoot(packet(Array.from({length:50001},(_,i)=>i+1)),v=>v));assert.equal(big.decodeRoot(packet(Array.from({length:50000},(_,i)=>i+1)),v=>v)[0].disposition,'patch')
 const fixture=claimsCandidateFixture(),s=claimsBoundNativeSchema(fixture.deck.data.tasks,6) as any,parts=s.properties.answers.properties['6'].properties.claimChoices.properties;assert.equal(parts['1'].maxItems,1);assert.deepEqual(parts['1'].items.enum,[6]);assert.equal(parts['2'].maxItems,0);assert.equal(parts['3'].maxItems,2);assert.equal(parts['4'].maxItems,6)
})

test('CB07: actual original duplicate-member guards map only trusted frozen claim bindings to local task/claim numbers',()=>{
 const texts=['基室独有的蓝灯。','阅览间在东侧。','阅览间在西侧。'],units=texts.map((text,i)=>({id:'diagnostic-'+i,fileId:'synthetic',start:i*100,end:i*100+text.length,text,kind:'body' as const})),a=(i:number):Anchor=>({unitId:units[i].id,quote:units[i].text}),unknown=(n:number)=>({unitId:units[0].id,quote:'BAD'+n}),row={mentions:[{literal:'基室',evidence:a(0)},{literal:'阅览间',evidence:unknown(1)},{literal:'阅览间',evidence:unknown(2)}],context:[],links:[]},retention=createSceneRosterRetention(units);retention.capture([row],v=>v as Anchor);const choices=createSceneRosterRepairChoices(units,createSceneRosterFragmentTable(units)),patch=prepareSceneRosterClaimPatch({draftHash:'diagnostic',slot:0,rowCount:1,row,proofs:retention.verifiedRows(),units,choices,resolveAnchor:v=>v as Anchor});assert.ok(patch);choices.wholeUnits();const plan={rows:[{repairRef:'rr'+'1'.repeat(16),slot:0,canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]},patch:{claims:patch.displayClaims()}}],choices:choices.compactEntries()};const deck=createClaimsBoundDeck({plan,draft:[row],groups:()=>patch.boundGroups()}).advance(0),number=deck.data.choices.findIndex(c=>c.choiceRef===patch.displayClaims()[0].eligibleChoiceRefs[0])+1,decoded=deck.decodeRoot({answers:{'1':{claimChoices:{'1':[number],'2':[number]}}}},v=>v)[0];assert.equal(decoded.disposition,'patch');let error:unknown;try{if(decoded.disposition==='patch')patch.apply(decoded.patch.claims)}catch(e){error=e}assert.ok(error);assert.deepEqual(deck.diagnostic(error),{taskNumber:1,localClaimNumber:2,reason:'new-mention-duplicate'})
 let getters=0;const fake=Error();for(const key of ['message','claimRef','reason'])Object.defineProperty(fake,key,{get(){getters++;return'PRIVATE_UNTRUSTED'},configurable:true});assert.equal(deck.diagnostic(fake),undefined);assert.equal(deck.diagnostic(new Proxy(Error(),{get(){getters++;return undefined}})),undefined);assert.equal(getters,0);const unbound=Error();bindSceneRosterRepairDiagnostic(unbound,{claimRef:'pc'+'9'.repeat(16),reason:'transaction'});assert.equal(deck.diagnostic(unbound),undefined)
})

test('CB08: the actual-capability synthetic candidate schema is identical and all original full gates remain authoritative',async()=>{
 const f=claimsCandidateFixture(),schema=claimsBoundNativeSchema(f.deck.data.tasks,f.plan.choices.length)
 assert.equal(Buffer.byteLength(JSON.stringify(schema)),19491)
 assert.equal(createHash('sha256').update(JSON.stringify(schema)).digest('hex'),'e3b3997558bfc48b647b12b75c36dff3c9c50b12c83c36daa01370529eba9c52')
 assert.ok(Object.values(await applyClaimsCandidate(f.validWitness)).every(Boolean))
 const duplicate=clone(f.validWitness);duplicate.answers['6'].claimChoices['3']=[4,4]
 const invalid=await applyClaimsCandidate(duplicate);assert.equal(invalid.schema,true);assert.equal(invalid.numericDecode,false);assert.equal(invalid.patchApply,false)
 const absent=clone(f.validWitness);absent.answers['2'].mentions[0].literal='合成源中不存在的名称'
 const rejected=await applyClaimsCandidate(absent);assert.equal(rejected.schema,true);assert.equal(rejected.numericDecode,true);assert.equal(rejected.source,false)
})
test('CB09: rejected claims diagnostics stay local and never execute caller accessors or mislabel claims as replacement',()=>{
 const d=single();let reads=0;const bad={};Object.defineProperty(bad,'claimChoices',{get(){reads++;return{}},enumerable:true})
 assert.deepEqual(sceneRosterBoundAnswerDiagnostics({answers:{'1':bad}},d.data.tasks,()=>{reads++;return false}),[])
 const proxy=new Proxy({}, {ownKeys(){reads++;return[]},get(){reads++;return undefined}})
 sceneRosterBoundAnswerDiagnostics(proxy,d.data.tasks,()=>{reads++;return false})
 const messages=sceneRosterBoundAnswerDiagnostics(packet([10]),d.data.tasks,()=>{reads++;return false})
 assert.equal(messages.length,1);assert.ok(messages[0].includes('claims'));assert.ok(!messages[0].includes('replacement须有'));assert.equal(reads,0)
})

import {expandBoundTaskDisplay} from '../helpers/novel-import-bound-task-display-fixture'
import {assertBoundNativeShape} from '../helpers/novel-import-bound-native-shape-fixture'
test('CB10: independent readers retain the complete claims display and handwritten Native contract, rejecting malformed domains',()=>{
 const f=claimsCandidateFixture(),before=clone(f.deck.data.tasks),view=sceneRosterBoundTaskDisplay(f.deck.data.tasks)
 assert.deepEqual(expandBoundTaskDisplay(view,f.plan.rows),before)
 assertBoundNativeShape(claimsBoundNativeSchema(f.deck.data.tasks,6),f.deck.data)
 for(const mutate of[(v:any[])=>delete v[5].domains[0].canReject,(v:any[])=>v[5].domains[0].extra=true,(v:any[])=>v[5].domains[0].choices=[6,6],(v:any[])=>v[5].domains[0].choices=['6'],(v:any[])=>v[5].domains[0].kind='replacement',(v:any[])=>v[5].domains.pop(),(v:any[])=>v[5].claimIndexes[0]=99]){const bad=clone(view);mutate(bad);assert.throws(()=>expandBoundTaskDisplay(bad,f.plan.rows),/TEST_BOUND_TASK_DISPLAY_INVALID/u)}
 assert.deepEqual(f.deck.data.tasks,before)
 assert.ok(SCENE_ROSTER_BOUND_ANSWER_GUIDANCE.length<=250,'the exact business-label guidance must survive the unchanged parser feedback cap')
})
