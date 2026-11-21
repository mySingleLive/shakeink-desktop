import assert from'node:assert/strict'
import{test}from'node:test'
import{bridgeBound}from'../helpers/novel-import-bound-decisions-fixture'
import{request}from'../helpers/novel-import-claim-patch-fixture'
import{sceneRosterGenerationSchema}from'../../desktop/service/novel-import-ai'
test('JG01: fresh same-literal joint claims compile the complete nonduplicate options into explicit Native selection',async()=>{const r=request();r.units=['左侧甲室。尾白。','右侧甲室。尾白。'].map((text,i)=>({id:'jg-'+i,fileId:'joint-synthetic',kind:'body',start:i*100,end:i*100+text.length,text}));const first={roster:[{mentions:r.units.map((u,i)=>({literal:'甲室',evidence:{unitId:u.id,quote:'JG_BAD_'+i}})),context:[],links:[]}]},expected={roster:[{mentions:r.units.map(u=>({literal:'甲室',evidence:{unitId:u.id,quote:u.text.slice(0,u.text.indexOf('。')+1)}})),context:[],links:[]}]};const actual=await bridgeBound(first,({deck})=>{assert.equal(deck.tasks.length,1);assert.equal(deck.tasks[0].kind,'selection');return{answers:{'1':{selection:1}}}},{request:r});assert.equal(actual.options.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(r).parse(expected))})

import{createSceneRosterBoundDecisions,sceneRosterKeyedInlineSchema}from'../../desktop/service/novel-import-scene-roster-bound-decisions'
import type{SceneRosterTargetedPlan}from'../../desktop/service/novel-import-scene-roster-targeted-repair'
const controlRef=(prefix:string,n:number)=>prefix+n.toString(16).padStart(16,'0')
function grouped(domains:number[][],groups:number[][],valid:(numbers:number[][],group:number)=>boolean=()=>true){
 const choices=Array.from({length:Math.max(...domains.flat())},(_,at)=>({choiceRef:controlRef('cf',at+1),unitIndex:0,start:at,end:at+1,literals:['甲']})),claims=domains.map((domain,index)=>({claimRef:controlRef('pc',index+1),kind:'mention' as const,index,literal:'甲'+index,canReject:false,eligibleChoiceRefs:domain.map(n=>controlRef('cf',n))})),plan:SceneRosterTargetedPlan={choices,rows:[{repairRef:controlRef('rr',1),slot:0,canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]},patch:{claims}}]};let calls=0
 const deck=createSceneRosterBoundDecisions({plan,draft:[{}],strategy:'joint-groups',groups:()=>groups.map((indexes,group)=>({claimRefs:indexes.map(index=>claims[index].claimRef),validate(decisions){calls++;const numbers=decisions.map(d=>d.disposition==='reject'?[]:d.choiceRefs.map(ref=>choices.findIndex(c=>c.choiceRef===ref)+1));if(!valid(numbers,group))throw Error('synthetic joint rejection')}}))})
 return{deck,plan,calls:()=>calls}
}
test('JG02: multi-claim options stay complete; one sorted singleton remainder shares its original slot without overwriting decisions',()=>{
 const{deck,plan}=grouped([[1,2],[1,2],[2,3],[2,3],[3]],[[0,1],[2,3],[4]],n=>n[0][0]!==n[1]?.[0])
 assert.equal(deck.data.selectionEncoding,'object');assert.deepEqual(deck.data.tasks.map(t=>[t.kind,t.kind==='replacement'?[]:t.claimIndexes]),[['selection',[0,1]],['selection',[2,3]],['claims',[4]]])
 const [first,second]=deck.data.tasks;assert.equal(first.kind,'selection');assert.equal(second.kind,'selection');if(first.kind!=='selection'||second.kind!=='selection')throw Error('test task')
 assert.deepEqual(first.options,[[[1],[2]],[[2],[1]]]);assert.deepEqual(second.options,[[[2],[3]],[[3],[2]]])
 const decisions=deck.decode([{selection:2},{claimChoices:{'1':[2],'2':[3]}},{claimChoices:{'1':[3]}}],v=>v)
 assert.equal(decisions.length,1);assert.equal(decisions[0].disposition,'patch');if(decisions[0].disposition!=='patch')throw Error('test patch')
 assert.deepEqual(decisions[0].patch.claims.map(c=>c.claimRef),plan.rows[0].patch!.claims.map(c=>c.claimRef));assert.deepEqual(decisions[0].patch.claims.map(c=>c.disposition==='resolve'?c.choiceRefs:[]),[[2],[1],[2],[3],[3]].map(ns=>ns.map(n=>controlRef('cf',n))))
 const native=sceneRosterKeyedInlineSchema(deck.data.tasks,3,deck.data.selectionEncoding)as any
 assert.deepEqual(native.properties.answers.properties['1'],{type:'object',properties:{selection:{type:'integer',minimum:1,maximum:2}},required:['selection'],additionalProperties:false})
 for(const bad of[{selection:0},{selection:3},{claimChoices:{'1':[1],'2':[1]}},{claimChoices:{'1':[1]}},{claimChoices:{'1':[1],'2':[2],'3':[]}},{selection:1,claimChoices:{'1':[1],'2':[2]}}])assert.throws(()=>deck.decode([bad,{selection:1},{claimChoices:{'1':[3]}}],v=>v))
 assert.equal(deck.decode([1,1,{claimChoices:{'1':[3]}}],v=>v).length,1,'explicit legacy integer remains compatible')
})
test('JG03: exact 256 options survive; limit+1 discards the entire group into remainder while later small groups survive',()=>{
 const domain=Array.from({length:16},(_,i)=>i+1),at=grouped([domain,domain],[[0,1]]);assert.equal(at.deck.data.tasks[0].kind,'selection');if(at.deck.data.tasks[0].kind!=='selection')throw Error('test selection');assert.equal(at.deck.data.tasks[0].options.length,256)
 const over=Array.from({length:17},(_,i)=>i+1),{deck,calls}=grouped([over,over,[1,2],[1,2],[3]],[[0,1],[2,3],[4]])
 assert.deepEqual(deck.data.tasks.map(t=>[t.kind,t.kind==='replacement'?[]:t.claimIndexes]),[['selection',[2,3]],['claims',[0,1,4]]]);const count=calls();let current=deck,steps=0
 for(;;){const preview=current.previewNext();if(!preview)break;current=current.commit(preview);steps++;assert.ok(steps<=2)}
 assert.equal(steps,2);assert.equal(current.transitions,2);assert.equal(calls(),count,'preparation never recompiles or resets original compiler work')
 assert.equal(current.data.tasks.length,1);assert.equal(current.data.tasks[0].kind,'replacement')
})
test('JG04: explicit assignment compatibility must match exactly one complete frozen option; descriptors never execute',()=>{
 const{deck}=grouped([[1,2],[1,2]],[[0,1]],n=>n[0][0]!==n[1][0]);let touched=0
 const accessor=Object.defineProperty({},'selection',{enumerable:true,get(){touched++;return 1}}),proxy=new Proxy({}, {ownKeys(){touched++;return[]}}),numbers=Object.setPrototypeOf([1],Object.create(Array.prototype));Object.defineProperty(Object.getPrototypeOf(numbers),Symbol.iterator,{get(){touched++;return Array.prototype[Symbol.iterator]}})
 for(const answer of[accessor,proxy,{claimChoices:{'1':numbers,'2':[2]}},{claimChoices:{'1':[,1],'2':[2]}},{claimChoices:{'1':[1,1],'2':[2]}}])assert.throws(()=>deck.decode([answer],v=>v))
 assert.equal(deck.decode([{claimChoices:{'1':[2],'2':[1]}}],v=>v).length,1)
 assert.equal(touched,0)
 const ambiguous=grouped([[1,1],[2]],[[0,1]]).deck;assert.throws(()=>ambiguous.decode([{claimChoices:{'1':[1],'2':[2]}}],v=>v),'identical assignments cannot select one of multiple options')
})

test('JG05: context and link groups retain the full handwritten multi-CF/reject oracle, including order and whole-window multiplicity',()=>{
 const choices=[1,2].map(n=>({choiceRef:controlRef('cf',n),unitIndex:0,start:n-1,end:n,literals:[]})),claims=[...['context','link']as const].flatMap((kind,group)=>[0,1].map(evidenceIndex=>({claimRef:controlRef('pc',group*2+evidenceIndex+1),kind,index:0,evidenceIndex,...(kind==='context'?{label:'蓝色'}:{targetIndex:1,relation:'different-place'}),canReject:true as const,eligibleChoiceRefs:choices.map(c=>c.choiceRef)}))) as NonNullable<SceneRosterTargetedPlan['rows'][number]['patch']>['claims'],plan:SceneRosterTargetedPlan={choices,rows:[{repairRef:controlRef('rr',1),slot:0,canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]},patch:{claims}}]},deck=createSceneRosterBoundDecisions({plan,draft:[{},{}],strategy:'joint-groups',groups:()=>[[0,1],[2,3]].map(indexes=>({claimRefs:indexes.map(index=>claims[index].claimRef),validate(decisions){const refs=decisions.flatMap(d=>d.disposition==='resolve'?d.choiceRefs:[]);if(new Set(refs).size!==refs.length)throw Error('synthetic complete-window duplication')}}))})
 const subsets=[[1],[2],[1,2],[]],expected=subsets.flatMap(left=>subsets.filter(right=>!left.some(n=>right.includes(n))).map(right=>[left,right]))
 assert.equal(expected.length,9);assert.equal(deck.data.tasks.length,2);for(const task of deck.data.tasks){assert.equal(task.kind,'selection');if(task.kind!=='selection')throw Error('test selection');assert.deepEqual(task.options,expected)}
 const result=deck.decode([{claimChoices:{'1':[1,2],'2':[]}},{claimChoices:{'1':[],'2':[1,2]}}],v=>v)[0];assert.equal(result.disposition,'patch');if(result.disposition!=='patch')throw Error('test patch');assert.deepEqual(result.patch.claims.map(c=>c.disposition==='resolve'?c.choiceRefs:[]),[[controlRef('cf',1),controlRef('cf',2)],[],[],[controlRef('cf',1),controlRef('cf',2)]])
 for(const wrong of[{claimChoices:{'1':[2,1],'2':[]}},{claimChoices:{'1':[1,1],'2':[]}},{claimChoices:{'1':[1],'2':[1]}}])assert.throws(()=>deck.decode([wrong,{selection:1}],v=>v))
})

import{sceneRosterBoundAnswerDiagnostics}from'../../desktop/service/novel-import-scene-roster-bound-decisions'
test('JG06: trusted object-mode correction teaches the closed wrapper, while default legacy diagnostics and every accepting gate stay unchanged',()=>{
 const{deck}=grouped([[1,2],[1,2]],[[0,1]],n=>n[0][0]!==n[1][0]),raw={answers:{'1':{selection:999}}};assert.throws(()=>deck.decodeRoot(raw,v=>v))
 const actual=sceneRosterBoundAnswerDiagnostics(raw,deck.data.tasks,()=>true,deck.data.selectionEncoding)
 assert.equal(actual.length,1);assert.ok(actual[0].includes('{"selection":optionNumber}'));assert.ok(actual[0].includes('1..2'));assert.equal(actual[0].includes('不填0、数组或对象'),false);assert.ok(actual[0].length<=250)
 assert.deepEqual(sceneRosterBoundAnswerDiagnostics(raw,deck.data.tasks,()=>true),['第1项是selection，只能填本任务印出的整数optionNumber 1..2；不是共享choices号，不填0、数组或对象。'])
 assert.deepEqual(sceneRosterBoundAnswerDiagnostics({answers:{'1':{selection:1}}},deck.data.tasks,()=>true,'object'),[])
 assert.deepEqual(sceneRosterBoundAnswerDiagnostics({answers:[]},deck.data.tasks,()=>true,'object'),sceneRosterBoundAnswerDiagnostics({answers:[]},deck.data.tasks,()=>true))
 const unknown=sceneRosterBoundAnswerDiagnostics({answers:{'1':{secret:'JG_DIAGNOSTIC_PRIVATE'}}},deck.data.tasks,()=>true,'object');assert.equal(JSON.stringify(unknown).includes('JG_DIAGNOSTIC_PRIVATE'),false);assert.throws(()=>deck.decodeRoot(raw,v=>v))
})
