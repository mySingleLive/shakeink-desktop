import assert from 'node:assert/strict'
import {test} from 'node:test'
import {eventSchema,planningSchema,applyPlanningOperations,EVENT_CATEGORIES} from '../../src/lib/planning/domain'

/* docs/581 WU-01–WU-04: event category and importance. Synthetic data only. */
const base={schemaVersion:1,worlds:[{id:'w',name:'主世界线'}],events:[{id:'e1',line:'w',title:'渡口失火',time:{kind:'exact',value:24}}]}

test('WU-01: works without category/importance read as 其他 / 1 and keep them after a save round-trip',()=>{
 const data=planningSchema.parse(base)
 assert.equal(data.events[0].category,'其他');assert.equal(data.events[0].importance,1)
 const again=planningSchema.parse(JSON.parse(JSON.stringify(data)))
 assert.equal(again.events[0].category,'其他');assert.equal(again.events[0].importance,1)
 assert.deepEqual([...EVENT_CATEGORIES],['冲突','谋划','揭示','关系','成长','变故','其他'])
})
test('WU-02: invalid category or importance fails at that field and leaves other events alone',()=>{
 for(const [k,v] of [['category','未知'],['importance',0],['importance',4],['importance',1.5],['importance','2']] as const){
  const r=eventSchema.safeParse({id:'x',line:'w',title:'t',[k]:v})
  assert.equal(r.success,false,`${k}=${v}`);assert.deepEqual(r.error!.issues[0].path,[k])
 }
 const ok=planningSchema.safeParse({...base,events:[...base.events,{id:'e2',line:'w',title:'好事件',category:'揭示',importance:3}]})
 assert.ok(ok.success);assert.equal(ok.data!.events[1].category,'揭示')
})
test('WU-04: an AI put keeps category/importance when a later put of the same id omits them',()=>{
 const start=planningSchema.parse(base)
 const once=applyPlanningOperations(start,[{kind:'put',collection:'events',value:{id:'e1',line:'w',title:'渡口失火',category:'揭示',importance:3}}] as never)
 assert.equal(once.events[0].category,'揭示');assert.equal(once.events[0].importance,3)
 const twice=applyPlanningOperations(once,[{kind:'put',collection:'events',value:{id:'e1',title:'渡口大火'}}] as never)
 assert.equal(twice.events[0].title,'渡口大火');assert.equal(twice.events[0].category,'揭示');assert.equal(twice.events[0].importance,3)
})
import {forkChangedCount} from '../../src/lib/planning/domain'
test('WU-03: changing only category or importance of a source event does not count as a changed fork fact',()=>{
 const src={id:'s1',line:'src',title:'渡口失火',fact:'夜里起火',time:{kind:'exact',value:24}}
 const make=(over:Record<string,unknown>)=>planningSchema.parse({schemaVersion:1,worlds:[{id:'src',name:'源'},{id:'fk',name:'分支',fork:{source:'src',event:'s1',version:1,events:[{...src,line:'src'}],periods:[],calendar:{}}}],events:[{...src,...over}]})
 assert.equal(forkChangedCount(make({}),'fk'),0)
 assert.equal(forkChangedCount(make({category:'冲突'}),'fk'),0)
 assert.equal(forkChangedCount(make({importance:3}),'fk'),0)
 assert.equal(forkChangedCount(make({fact:'清晨起火'}),'fk'),1)
})
