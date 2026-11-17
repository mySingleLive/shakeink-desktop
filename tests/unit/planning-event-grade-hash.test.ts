import assert from 'node:assert/strict'
import {test} from 'node:test'
import {planningSchema} from '../../src/lib/planning/domain'
import {worldRepairProtectedRowsHash} from '../../desktop/service/novel-import-world-repair'

/* docs/581 WU-09d (S14): an old planning row without category/importance gets defaults on read, and the protected-rows
 * hash over the stored row is unchanged, because defaults are never written back to the original row. */
const keys=['novels','themes','volumes','chapters','characters','scenes','items','worlds','settings','foreshadows','tropes','planning','versions','mutations']
const oldData={schemaVersion:1,worlds:[{id:'w',name:'主世界线'}],events:[{id:'e1',line:'w',title:'渡口相遇',time:{kind:'exact',value:24}}],lines:[],periods:[],cards:[],volumes:[],chapters:[],connections:[]}
const rows=()=>Object.fromEntries(keys.map(k=>[k,k==='planning'?[{novelId:'n1',data:structuredClone(oldData)}]:k==='novels'?[{id:'n1',title:'测试作品'}]:[]]))

test('WU-09d: reading an old planning row fills defaults without changing the protected-rows hash',()=>{
 const stored=rows(),before=worldRepairProtectedRowsHash(stored)
 const parsed=planningSchema.parse((stored.planning[0] as {data:unknown}).data)
 assert.equal(parsed.events[0].category,'其他')
 assert.equal(parsed.events[0].importance,1)
 assert.equal(worldRepairProtectedRowsHash(stored),before)
 assert.equal(Object.hasOwn((stored.planning[0] as {data:{events:object[]}}).data.events[0],'category'),false)
 // Positive control: writing the defaults back would change the hash.
 const written=rows();(written.planning[0] as {data:unknown}).data=parsed
 assert.notEqual(worldRepairProtectedRowsHash(written),before)
})
