import assert from 'node:assert/strict'
import {test} from 'node:test'
import {sceneFixture,bodyOf,byName,type Row} from '../helpers/novel-import-scene-cleanup-fixture'

// A selected place whose parent is not selected (deselected by the author or deferred as unresolved)
// must still import. Before the fix every scene request failed with 场景上级不在完整清单中, because the
// request catalog held only selected places while keeping the child's parentId. Synthetic places only.
const rows:Row[]=[{mentions:[{literal:'甲港',quote:'北岸的甲港很宽。'}],links:[{target:1,relation:'parent'}]},{mentions:[{literal:'北岸',quote:'北岸有一条长堤。'}]},{mentions:[{literal:'青石镇',quote:'青石镇的码头有灯塔。'}]}]

test('a selected scene with an unselected parent imports as top level and the other scenes are unaffected',async()=>{
 const f=await sceneFixture(rows,bodyOf(rows.map(r=>r.mentions[0].quote)))
 try{
  const v=await f.toList();assert.equal(v.wizard!.stepState['detect-scene'],'waiting',v.wizard!.stepError)
  const child=byName(f,'甲港'),parent=byName(f,'北岸');assert.equal(child.parentId,parent.id,'precondition: the roster records the parent')
  await f.act('wizard-select-candidates',{kind:'scene',ids:[parent.id],selected:false})
  await f.act('wizard-next');const done=await f.settle(),s=f.session(),w=s.wizard!
  assert.ok(!w.tasks.some(t=>t.state==='failed'),JSON.stringify(w.tasks.filter(t=>t.state==='failed').map(t=>t.error)))
  assert.equal(done.wizard!.step,'verify',done.wizard!.stepError)
  const entity=f.requests.filter(r=>r.intent==='entity'&&r.kind==='scene');assert.equal(entity.length,2)
  for(const r of entity)assert.ok(!r.entities!.some(e=>e.parentId===parent.id),'no catalog entry points at an unselected parent')
  assert.deepEqual(s.artifacts.map(a=>a.name).sort(),['甲港','青石镇'].sort());assert.equal(s.artifacts.find(a=>a.id===child.id)!.facts.parentId,undefined)
 }finally{await f.dispose()}
})
