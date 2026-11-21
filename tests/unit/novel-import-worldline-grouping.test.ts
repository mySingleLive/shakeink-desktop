import assert from 'node:assert/strict'
import {test} from 'node:test'
import {worldGroupingCatalog,worldGroupingRequestRows,worldGroupingRowSize,applyWorldGrouping,worldlineFamilyRanges,pruneWorldlineParents,settleEvery,nextUp,WORLD_GROUPING_PEOPLE_LIMIT,type WorldGroupingReply} from '../../desktop/core/novel-import-wizard-grouping'
import {WORLD_TIMELINE_LINE_ID,WORLD_TIMELINE_LINE_NAME,type WorldTimelineState} from '../../desktop/core/novel-import-wizard-timeline'
import {validateImportSemanticArtifact} from '../../desktop/core/novel-import-semantics'
import {validatePlanning,emptyPlanning,eventSchema,worldlineSchema} from '../../src/lib/planning/domain'
import type {ImportArtifact} from '../../desktop/shared/novel-import'

/* docs/587 WG-01..WG-26. Synthetic names and text only. */
const ev=(id:string,value:number|undefined,over:Record<string,string>={},extra:Partial<ImportArtifact>={}):ImportArtifact=>({id,kind:'worldline',name:'事件'+id,text:'沈砚在合成渡口'+id+'。',
 facts:{lineId:WORLD_TIMELINE_LINE_ID,lineName:WORLD_TIMELINE_LINE_NAME,people:'[]',reliability:'客观事实',...(value===undefined?{timeKind:'unknown'}:{timeKind:'exact',timeValue:String(value)}),...over},
 evidence:[{unitId:'u-'+id,quote:'合成渡口'+id}],sourceUnitIds:['u-'+id],origin:'inferred',...extra})
const gregorian=(ids:string[]):WorldTimelineState=>({version:1,calendar:'gregorian',epoch:'0001-01-01T00:00:00Z',events:ids.length,eras:[{name:'',start:0}],precisions:Object.fromEntries(ids.map(id=>[id,'month']))})
const base=()=>[ev('a',30),ev('b',10),ev('c',20,{category:'冲突',importance:'2'}),ev('d',40),ev('x',undefined),ev('s',5,{},{origin:'source'})]
const reply=(r:Partial<WorldGroupingReply>):WorldGroupingReply=>({groups:[],grades:[],...r})

test('WG-01: the catalogue keeps inferred exact main-line events in time order; rows are compact and cut',()=>{
 const list=[...base(),ev('o',1,{lineId:'other'})]
 const cat=worldGroupingCatalog(list)
 assert.deepEqual(cat.map(e=>e.id),['b','c','a','d'])
 const long=ev('l',1,{time:'第五纪'.repeat(30)},{name:'名'.repeat(120),text:'文'.repeat(300)})
 const [row]=JSON.parse(worldGroupingRequestRows(worldGroupingCatalog([long])))
 assert.equal(row[0],'e1');assert.equal([...row[1]].length,80);assert.equal([...row[2]].length,60);assert.equal([...row[3]].length,40)
 assert.equal(row[4],'其他');assert.equal(row[5],1)
 const two=worldGroupingRequestRows(cat);assert.equal(JSON.parse(two)[1][4],'冲突');assert.equal(JSON.parse(two)[1][5],2)
 assert.equal(worldGroupingRowSize(cat),two.length)
})

test('WG-02: a valid group creates a strict-valid parent before its first member; members point to it',()=>{
 const list=[ev('a',30,{people:'["p1","p2"]'}),ev('b',10,{people:'["p2"]'}),ev('c',20),ev('d',40)]
 const cat=worldGroupingCatalog(list)
 const out=applyWorldGrouping(list,[{catalog:cat,reply:reply({groups:[{name:'渡口风波',summary:'渡口上的一连串事。',category:'冲突',importance:2,members:['e1','e3']}]})}],[],gregorian(list.map(a=>a.id)))
 const parent=out.artifacts.find(a=>a.facts.parentId===undefined&&a.name==='渡口风波')!
 assert.match(parent.id,/^wl-[0-9a-f]{16}$/u);assert.equal(parent.kind,'worldline');assert.equal(parent.origin,'inferred');assert.equal(parent.text,'渡口上的一连串事。')
 assert.equal(parent.facts.lineId,WORLD_TIMELINE_LINE_ID);assert.equal(parent.facts.timeKind,'exact');assert.equal(parent.facts.timeValue,'10');assert.equal(parent.facts.reliability,'客观事实')
 assert.deepEqual(JSON.parse(parent.facts.people),['p2','p1'],'people ordered by count');assert.equal(parent.facts.category,'冲突');assert.equal(parent.facts.importance,'2')
 assert.deepEqual(parent.evidence,[{unitId:'u-b',quote:'合成渡口b'},{unitId:'u-a',quote:'合成渡口a'}]);assert.deepEqual(parent.sourceUnitIds,['u-b','u-a'])
 assert.doesNotThrow(()=>validateImportSemanticArtifact(parent,'strict'))
 assert.equal(out.artifacts.find(a=>a.id==='b')!.facts.parentId,parent.id);assert.equal(out.artifacts.find(a=>a.id==='a')!.facts.parentId,parent.id)
 assert.equal(out.artifacts.find(a=>a.id==='c')!.facts.parentId,undefined)
 assert.ok(out.artifacts.findIndex(a=>a.id===parent.id)<out.artifacts.findIndex(a=>a.id==='a'),'parent goes before the first member in the list')
 assert.equal(out.timeline!.calendar==='gregorian'&&out.timeline!.precisions[parent.id],'month')
 assert.deepEqual(out.state,{groups:1,parents:[parent.id],graded:0,dropped:0})
})

test('WG-03: bad groups are dropped and counted; the first group keeps a shared member',()=>{
 const list=[ev('a',1),ev('b',2),ev('c',3),ev('d',4)],cat=worldGroupingCatalog(list)
 const out=applyWorldGrouping(list,[{catalog:cat,reply:reply({groups:[
  {name:'甲',summary:'',category:'冲突',importance:1,members:['e1','e2']},
  {name:'乙',summary:'',category:'冲突',importance:1,members:['e2','e3']},
  {name:'丙',summary:'',category:'冲突',importance:1,members:['e9','e4']},
  {name:'',summary:'',category:'冲突',importance:1,members:['e3','e4']},
  {name:'事件c',summary:'',category:'冲突',importance:1,members:['e3','e4']},
 ]})}],[],null)
 assert.deepEqual(out.state.parents.length,1);assert.equal(out.artifacts.find(a=>a.id==='b')!.facts.parentId,out.state.parents[0])
 assert.equal(out.artifacts.find(a=>a.id==='c')!.facts.parentId,undefined)
 // Four groups dropped, plus the taken e2 and the unknown e9 skipped inside them (docs/587 §3.1, code review S4).
 assert.equal(out.state.dropped,6)
})

test('WG-04: locked, already-parented and parent events stay out of groups; locked grades are kept',()=>{
 const list=[ev('a',1),ev('b',2,{parentId:'d'}),ev('c',3),ev('d',4),ev('e',5)],cat=worldGroupingCatalog(list)
 const locks=[{artifactId:'c',field:'parentId',value:''},{artifactId:'e',field:'category',value:'其他'}]
 const out=applyWorldGrouping(list,[{catalog:cat,reply:reply({groups:[{name:'组',summary:'',category:'冲突',importance:1,members:['e1','e2','e3','e4']}],grades:[['e5','揭示',3]]})}],locks,null)
 assert.equal(out.state.parents.length,0,'only a remains, below two members');assert.equal(out.artifacts.find(a=>a.id==='e')!.facts.category,undefined)
 assert.equal(out.artifacts.find(a=>a.id==='e')!.facts.importance,'3')
})

test('WG-05/WG-15: grades write only changed values; invalid ones drop; parents are at least their top member',()=>{
 const list=[ev('a',1,{importance:'3'}),ev('b',2),ev('c',3,{category:'揭示'})],cat=worldGroupingCatalog(list)
 const out=applyWorldGrouping(list,[{catalog:cat,reply:reply({grades:[['e1','其他',3],['e2','打斗',2],['e3','揭示',1]],groups:[{name:'组',summary:'',category:'谋划',importance:1,members:['e1','e2']}]})}],[],null)
 const by=(id:string)=>out.artifacts.find(a=>a.id===id)!
 assert.deepEqual(by('a').facts,list[0].facts.parentId?list[0].facts:{...list[0].facts,parentId:out.state.parents[0]},'same values: facts unchanged except parentId')
 assert.equal(by('b').facts.category,undefined,'invalid grade dropped');assert.deepEqual(Object.keys(by('c').facts).sort(),Object.keys(list[2].facts).sort())
 assert.equal(out.artifacts.find(a=>a.id===out.state.parents[0])!.facts.importance,'3')
 assert.equal(out.state.dropped,1);assert.equal(out.state.graded,2)
})

test('WG-06/WG-16: a reply with nothing valid throws; an empty catalogue sends nothing',()=>{
 const list=[ev('a',1),ev('b',2)],cat=worldGroupingCatalog(list)
 assert.throws(()=>applyWorldGrouping(list,[{catalog:cat,reply:reply({grades:[['e9','冲突',1]]})}],[],null),/归组/u)
 assert.equal(worldGroupingCatalog([ev('x',undefined)]).length,0)
})

test('WG-07: parent ids are stable and avoid existing ids',()=>{
 const list=[ev('a',1),ev('b',2)],cat=worldGroupingCatalog(list),r=reply({groups:[{name:'组',summary:'',category:'冲突',importance:1,members:['e1','e2']}]})
 const one=applyWorldGrouping(list,[{catalog:cat,reply:r}],[],null),two=applyWorldGrouping(list,[{catalog:cat,reply:r}],[],null)
 assert.equal(one.state.parents[0],two.state.parents[0])
 const taken=[...list,ev(one.state.parents[0],9,{lineId:'other'})]
 const three=applyWorldGrouping(taken,[{catalog:worldGroupingCatalog(taken),reply:r}],[],null)
 assert.notEqual(three.state.parents[0],one.state.parents[0]);assert.match(three.state.parents[0],/^wl-[0-9a-f]{16}$/u)
})

test('WG-09/WG-10: people are capped by count; an empty people list is valid',()=>{
 const many=Array.from({length:120},(_,i)=>'p'+i)
 const list=[ev('a',1,{people:JSON.stringify(many)}),ev('b',2,{people:JSON.stringify(many.slice(110))})],cat=worldGroupingCatalog(list)
 const out=applyWorldGrouping(list,[{catalog:cat,reply:reply({groups:[{name:'组',summary:'',category:'冲突',importance:1,members:['e1','e2']}]})}],[],null)
 const people=JSON.parse(out.artifacts.find(a=>a.id===out.state.parents[0])!.facts.people) as string[]
 assert.equal(people.length,WORLD_GROUPING_PEOPLE_LIMIT);assert.deepEqual(people.slice(0,10),many.slice(110))
 const empty=[ev('a',1),ev('b',2)],e=applyWorldGrouping(empty,[{catalog:worldGroupingCatalog(empty),reply:reply({groups:[{name:'组',summary:'',category:'冲突',importance:1,members:['e1','e2']}]})}],[],null)
 const parent=e.artifacts.find(a=>a.id===e.state.parents[0])!;assert.equal(parent.facts.people,'[]');assert.doesNotThrow(()=>validateImportSemanticArtifact(parent,'strict'))
})

test('WG-17: nextUp gives the next representable double',()=>{
 for(const v of [0,1,1e-9,2.5,1e7,123456789.123456]){const n=nextUp(v);assert.ok(n>v);assert.ok(v===0?n===Number.MIN_VALUE:(n+v)/2===v||(n+v)/2===n,'no double between')}
})

/* Publish ranges against validatePlanning (WG-20..WG-26). */
type Node={id:string;parent?:string;kind:'exact'|'window';value:number;end?:number}
function planning(nodes:Node[]){
 const ranges=worldlineFamilyRanges(nodes.map(n=>({id:n.id,parentId:n.parent,timeKind:n.kind,timeValue:n.value,timeEnd:n.end})))
 const data=emptyPlanning() as ReturnType<typeof emptyPlanning>
 data.worlds.push(worldlineSchema.parse({id:'w',name:'主世界线',calendar:{kind:'gregorian',epoch:'0001-01-01T00:00:00Z',eras:[{name:'',start:0}]}}))
 for(const n of nodes){const r=ranges.get(n.id);data.events.push(eventSchema.parse({id:n.id,line:'w',parent:n.parent??null,title:n.id,duration:r?r.duration:0,time:{kind:n.kind,value:r?r.value:n.value,end:n.kind==='window'?n.end!:null,precision:'day'}}))}
 return {data,ranges}
}
const fixed6=(v:number)=>Math.round(v*1e6)/1e6
function seeded(seed:number){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32}}

test('WG-20/WG-21/WG-23: a family covers its children; equal children and an earlier child still validate',()=>{
 assert.doesNotThrow(()=>validatePlanning(planning([{id:'p',kind:'exact',value:10},{id:'a',parent:'p',kind:'exact',value:10},{id:'b',parent:'p',kind:'exact',value:500}]).data))
 assert.doesNotThrow(()=>validatePlanning(planning([{id:'p',kind:'exact',value:10},{id:'a',parent:'p',kind:'exact',value:10},{id:'b',parent:'p',kind:'exact',value:10}]).data))
 const {data,ranges}=planning([{id:'p',kind:'exact',value:10},{id:'a',parent:'p',kind:'exact',value:-300}])
 assert.doesNotThrow(()=>validatePlanning(data));assert.equal(ranges.get('p')!.value,-300)
})

test('WG-25: three-level chains and window roots validate; HEAD-publishable input keeps duration 0',()=>{
 assert.doesNotThrow(()=>validatePlanning(planning([{id:'A',kind:'window',value:-19.195661,end:2.495924},{id:'B',parent:'A',kind:'exact',value:-16.720715},{id:'C',parent:'B',kind:'exact',value:2.495924}]).data))
 const small=planning([{id:'A',kind:'exact',value:100},{id:'B',parent:'A',kind:'exact',value:105},{id:'C',parent:'B',kind:'exact',value:110}])
 assert.equal(small.ranges.get('A')!.duration,0);assert.equal(small.ranges.get('B')!.duration,0)
})

test('WG-22/WG-26: fixed-seed fuzz over fixed and gregorian magnitudes, chains, windows',()=>{
 const rand=seeded(587)
 for(const scale of [1e4,1e7])for(let run=0;run<5000;run++){
  const v=()=>fixed6((rand()*2-1)*scale),root=v(),nodes:Node[]=[]
  if(rand()<0.25){const end=fixed6(root+rand()*48);nodes.push({id:'r',kind:'window',value:root,end});const mid=fixed6(root+rand()*(end-root));nodes.push({id:'m',parent:'r',kind:'exact',value:mid});nodes.push({id:'l',parent:'m',kind:'exact',value:fixed6(mid+rand()*Math.max(0,end-mid))})}
  else{nodes.push({id:'r',kind:'exact',value:root});const mid=v();nodes.push({id:'m',parent:'r',kind:'exact',value:mid});for(let k=0;k<3;k++)nodes.push({id:'l'+k,parent:rand()<0.5?'m':'r',kind:rand()<0.2?'window':'exact',value:v(),end:undefined});for(const n of nodes)if(n.kind==='window')n.end=fixed6(n.value+rand()*100)}
  assert.doesNotThrow(()=>validatePlanning(planning(nodes).data),JSON.stringify(nodes))
  // Families the HEAD rule already publishes (no child before the parent, all within a day) keep duration 0.
  const ranges=planning(nodes).ranges
  for(const n of nodes){const kids=nodes.filter(k=>k.parent===n.id);if(n.kind!=='exact'||!kids.length)continue;const sub=(x:Node):number[]=>[x.kind==='window'?x.end!:x.value,...nodes.filter(k=>k.parent===x.id).flatMap(sub)]
   const all=kids.flatMap(k=>[k.value,...sub(k)]);if(all.every(v=>v>=n.value&&v<=n.value+24))assert.equal(ranges.get(n.id)!.duration,0)}
 }
})

test('WG-36: step 21 removes a childless made parent and frees children of a missing parent',()=>{
 const list=[ev('wl-p',1),ev('a',2,{parentId:'gone'}),ev('wl-q',3),ev('b',4,{parentId:'wl-q'})]
 const timeline:WorldTimelineState={...gregorian(['wl-p','a','wl-q','b'])}
 const out=pruneWorldlineParents(list,{groups:2,parents:['wl-p','wl-q'],graded:0,dropped:0},timeline)
 assert.deepEqual(out.removed,['wl-p']);assert.deepEqual(out.artifacts.map(a=>a.id),['a','wl-q','b'])
 assert.equal(out.artifacts[0].facts.parentId,undefined);assert.equal(out.artifacts[2].facts.parentId,'wl-q')
 assert.deepEqual(out.grouped!.parents,['wl-q']);assert.equal(out.grouped!.groups,2);assert.equal(out.timeline!.calendar==='gregorian'&&'wl-p' in out.timeline!.precisions,false)
 assert.deepEqual(out.notes.map(n=>n.reason),['子事件均未保存，已去掉这个父事件','父事件不存在，已改为独立事件'])
 const same=pruneWorldlineParents(out.artifacts,out.grouped,out.timeline);assert.deepEqual(same.removed,[]);assert.deepEqual(same.notes,[],'idempotent')
})

test('WG-36b: the step-21 lines check reports an event whose parent is missing',async()=>{
 const {wizardStructureChecks}=await import('../../desktop/core/novel-import-wizard-checks')
 const {emptyWizardState}=await import('../../desktop/core/novel-import-wizard-state')
 const session=(artifacts:ImportArtifact[])=>({selected:[],targets:['worldline'],infer:true,chapters:[],artifacts,wizard:{...emptyWizardState(),candidates:{}},files:[],units:[],workingProse:'',workingRevision:0}) as never
 const lines=(artifacts:ImportArtifact[])=>wizardStructureChecks(session(artifacts)).find(c=>c.key==='lines')!
 assert.equal(lines([ev('a',1),ev('b',2,{parentId:'a'})]).ok,true)
 const bad=lines([ev('b',2,{parentId:'gone'})]);assert.equal(bad.ok,false);assert.match(bad.detail,/父事件不存在/u)
})

test('M1: settleEvery waits for every job, then throws a stop first, else the first failure',async()=>{
 const done:number[]=[],wait=(ms:number)=>new Promise(r=>setTimeout(r,ms))
 await assert.rejects(settleEvery([0,1,2],async i=>{if(i===0)throw Error('甲');await wait(30);done.push(i);return i}),/甲/u)
 assert.deepEqual(done.sort(),[1,2],'the slower jobs finished before the throw')
 await assert.rejects(settleEvery([0,1],async i=>{if(i===0)throw Error('甲');throw new DOMException('已取消','AbortError')}),e=>e instanceof DOMException&&e.name==='AbortError')
 assert.deepEqual(await settleEvery([2,1],async(v,i)=>v*10+i),[20,11])
})
test('M2/S4: model text is cleaned; a parent failing strict checks is dropped; skipped members are counted',()=>{
 const list=[ev('a',1),ev('b',2),ev('c',3)],cat=worldGroupingCatalog(list)
 const out=applyWorldGrouping(list,[{catalog:cat,reply:reply({groups:[{name:'渡口\u0000风\ud800波\n',summary:'经\u2028过',category:'冲突',importance:1,members:['e1','e2','e2','e9']}]})}],[],null)
 const parent=out.artifacts.find(a=>a.id===out.state.parents[0])!
 assert.equal(parent.name,'渡口 风\ufffd波');assert.equal(parent.text,'经 过');assert.ok(parent.name.isWellFormed())
 assert.equal(out.state.dropped,2,'the repeated and the unknown member')
})
test('WG-24: a parent range ignores a long member\'s parts; parts keep their own parent',()=>{
 const ranges=worldlineFamilyRanges([{id:'p',timeKind:'exact',timeValue:0},{id:'a',parentId:'p',timeKind:'exact',timeValue:5}])
 assert.deepEqual(ranges.get('p'),{value:0,duration:0});assert.equal(ranges.get('a'),undefined,'a member with no children of its own has no range')
})
