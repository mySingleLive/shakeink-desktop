import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateSceneRosterRecords} from '../../desktop/core/novel-import-scene-identity'
import {createSceneRosterRetention} from '../../desktop/service/novel-import-scene-roster-retention'
import type {Anchor,SceneMentionRecord} from '../../desktop/shared/novel-import-scene-identity'
import type {ImportUnit} from '../../desktop/shared/novel-import'

const texts=['序言😀\r\n东馆的甲室又称起居间。东馆的阅览间已经开放。','西馆的乙室位于庭院。','北馆的丙室毗邻城墙。','东馆的甲室在另一段文字中再次出现。','南馆的新厅尚未开放。']
const units:ImportUnit[]=texts.map((text,i)=>({id:'rd-u'+i,fileId:'rd-body',start:i*100,end:i*100+text.length,text,kind:'body'}))
const anchor=(i:number,quote=texts[i]):Anchor=>({unitId:units[i].id,quote})
function row(mentions:SceneMentionRecord['mentions'],context:SceneMentionRecord['context']=[],links:SceneMentionRecord['links']=[]):SceneMentionRecord{const names=[...new Set(mentions.map(m=>m.literal))];return{name:names[0],aliases:names.slice(1),mentions,context,links}}
function original():SceneMentionRecord[]{return[
 row([{literal:'甲室',evidence:anchor(0)},{literal:'起居间',evidence:anchor(0)}],[{label:'东馆',evidence:[anchor(0)]}],[{targetIndex:1,relation:'parent',evidence:[anchor(0),anchor(1)]}]),
 row([{literal:'乙室',evidence:anchor(1)}],[{label:'西馆',evidence:[anchor(1)]}],[{targetIndex:2,relation:'different-place',evidence:[anchor(1),anchor(2)]}]),
 row([{literal:'丙室',evidence:anchor(2)}],[{label:'北馆',evidence:[anchor(2)]}])
]}
const plain=()=>original().map(r=>({...r,context:[],links:[]}))
const diagnosticProof=(rows:ReturnType<ReturnType<typeof createSceneRosterRetention>['verifiedRows']>)=>rows.map(r=>({...r,context:r.context.map(c=>({...c,evidence:[c.evidence]}))}))
function capture(first=original()){const value=createSceneRosterRetention(units);value.capture(first,evidence=>structuredClone(evidence) as Anchor);return value}
function valid(records:SceneMentionRecord[]){validateSceneRosterRecords(records,units);return records}

// These use the original source validator and retention acceptance predicate;
// diagnostics must explain that predicate, never become a second accepting path.
test('RD01: no capture, unchanged/reordered owners and genuinely new members produce no mismatch',()=>{
 const empty=createSceneRosterRetention(units);assert.equal(empty.diagnose(original()),undefined)
 const saved=capture(),first=original();assert.equal(saved.accepts(first),true);assert.equal(saved.diagnose(first),undefined)
 const reordered=[first[2],first[0],first[1]];reordered[1].links[0].targetIndex=2;reordered[2].links[0].targetIndex=0
 valid(reordered);assert.equal(saved.accepts(reordered),true);assert.equal(saved.diagnose(reordered),undefined)
 const extra=original();extra[0].mentions.push({literal:'阅览间',evidence:anchor(0)});extra[0].aliases.push('阅览间');extra.push(row([{literal:'新厅',evidence:anchor(4)}]))
 valid(extra);assert.equal(saved.accepts(extra),true);assert.equal(saved.diagnose(extra),undefined)
})

test('RD02: shrinking a complete window preserves occurrence but reports its missing atom and full endpoint closure',()=>{
 const saved=capture(),before=saved.verifiedRows(),current=original();current[0].mentions[0].evidence=anchor(0,'东馆的甲室又称起居间。');valid(current)
 assert.equal(saved.accepts(current),false);const d=saved.diagnose(current)!;assert.ok(d)
 assert.deepEqual(d.issues.map(i=>i.kind),['missing-mention-atom']);assert.equal(d.issues[0].originalRowIndex,0);assert.equal(d.issues[0].proofIndex,0)
 assert.deepEqual(d.owners.flatMap(o=>o.originalRowIndexes),[0,1,2],'full outgoing relation endpoint closure is retained')
 assert.deepEqual(d.owners.flatMap(o=>o.rows).map(r=>r.proof),diagnosticProof(before))
 assert.deepEqual(d.currentRows.map(r=>r.currentRowIndex),[0,1,2]);assert.ok(d.currentRows.every(r=>r.oldMemberKeys.length>0))
 assert.deepEqual(saved.verifiedRows(),before);assert.equal(saved.accepts(current),false)
})

test('RD03: another occurrence or a deleted mention cannot substitute for an original atom or owner',async t=>{
 for(const mutation of ['move','delete'] as const)await t.test(mutation,()=>{
  const saved=capture(),current=original();if(mutation==='move')current[0].mentions[0].evidence=anchor(3);else{current[0].mentions.shift();current[0].name='起居间';current[0].aliases=[]}valid(current)
  assert.equal(saved.accepts(current),false);const d=saved.diagnose(current)!;assert.ok(d.issues.some(i=>i.kind==='missing-mention-atom'));assert.ok(d.issues.some(i=>i.kind==='missing-owner'));assert.ok(d.issues.some(i=>i.kind==='new-owner-projection'))
  assert.deepEqual(d.owners.flatMap(o=>o.originalRowIndexes),[0,1,2]);assert.deepEqual(d.owners[0].rows[0].proof.mentions,saved.verifiedRows()[0].mentions)
 })
})

test('RD04: atom-complete merged, split and extra bridge rows report exact old-universe projections',async t=>{
 for(const mode of ['merge','split','bridge'] as const)await t.test(mode,()=>{
  const first=plain(),saved=capture(first);let current:SceneMentionRecord[]
  if(mode==='merge')current=[row([...first[0].mentions,...first[1].mentions]),first[2]]
  else if(mode==='split')current=[row([first[0].mentions[0]]),row([first[0].mentions[1]]),first[1],first[2]]
  else current=[...first,row([...first[0].mentions,...first[1].mentions])]
  valid(current);assert.equal(saved.accepts(current),false);const d=saved.diagnose(current)!;assert.ok(!d.issues.some(i=>i.kind==='missing-mention-atom'));assert.ok(d.issues.some(i=>i.kind==='new-owner-projection'))
  assert.equal(d.issues.some(i=>i.kind==='missing-owner'),mode!=='bridge');assert.deepEqual(d.owners.flatMap(o=>o.originalRowIndexes),mode==='split'?[0]:[0,1])
  for(const r of d.currentRows){assert.deepEqual(r.oldMemberKeys,[...r.oldMemberKeys].sort());assert.equal(new Set(r.oldMemberKeys).size,r.oldMemberKeys.length)}
 })
})

test('RD05: context and relation diagnostics retain original complete facts and original endpoint identity',async t=>{
 for(const mode of ['context','link','endpoint','link-window'] as const)await t.test(mode,()=>{
  const saved=capture(),current=original();if(mode==='context')current[0].context=[];else if(mode==='link')current[0].links=[];else if(mode==='endpoint')current[0].links[0].targetIndex=2;else current[0].links[0].evidence.pop();valid(current)
  assert.equal(saved.accepts(current),false);const d=saved.diagnose(current)!;const issue=d.issues.find(i=>i.kind===(mode==='context'?'missing-context':'missing-link'))!;assert.ok(issue);assert.equal(issue.originalRowIndex,0);assert.equal(issue.proofIndex,0)
  assert.deepEqual(d.owners.flatMap(o=>o.originalRowIndexes),[0,1,2]);assert.deepEqual(d.owners.flatMap(o=>o.rows).map(r=>r.proof),diagnosticProof(saved.verifiedRows()))
  if(mode!=='context')assert.equal(issue.targetOwnerKey,d.owners.find(o=>o.originalRowIndexes.includes(1))!.ownerKey)
 })
})

test('RD06: duplicate original slots remain one owner group and returned data cannot mutate frozen proof',()=>{
 const a=plain(),first=[a[0],structuredClone(a[0]),a[1]],input=structuredClone(first),saved=capture(first),before=saved.verifiedRows(),current=valid([row([...a[0].mentions,...a[1].mentions])]),currentBefore=structuredClone(current)
 assert.equal(saved.accepts(current),false);const d=saved.diagnose(current)!;assert.equal(d.owners.length,2);assert.deepEqual(d.owners.map(o=>o.originalRowIndexes),[[0,1],[2]])
 assert.equal(d.owners[0].rows.length,2);assert.deepEqual(d.owners[0].rows.map(r=>r.originalRowIndex),[0,1]);assert.equal(d.issues.filter(i=>i.kind==='missing-owner').length,2,'owner issue count does not pretend original slot count is owner count')
 assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.owners)&&Object.isFrozen(d.owners[0].rows[0].proof.mentions[0].evidence));assert.throws(()=>{(d.owners[0].rows[0].proof.mentions[0].evidence as Anchor).quote='外部修改'});assert.throws(()=>{(d.currentRows[0].oldMemberKeys as string[]).push('伪成员')})
 assert.deepEqual(first,input);assert.deepEqual(current,currentBefore);assert.deepEqual(saved.verifiedRows(),before);assert.deepEqual(saved.diagnose(current),d);assert.equal(saved.accepts(current),false);assert.equal(saved.accepts(first),true);assert.throws(()=>saved.capture(first,v=>v as Anchor),/已建立/u)
})

test('RD07: invalid source claims are never promoted and unsafe inputs omit the optional diagnosis',()=>{
 const first=original();first[0].aliases.push('不存在的房间');first[0].mentions.push({literal:'不存在的房间',evidence:anchor(0)});const saved=capture(first),validCurrent=original();assert.equal(saved.accepts(validCurrent),true);assert.equal(saved.diagnose(validCurrent),undefined)
 assert.equal(saved.diagnose(null as unknown as SceneMentionRecord[]),undefined);assert.equal(saved.accepts(validCurrent),true)
})

test('RD08: originally overlapping owners keep their exact projections despite reorder and new members',()=>{
 const a=plain(),first=[a[0],row([structuredClone(a[0].mentions[0])]),a[1]],saved=capture(first),current=[structuredClone(first[2]),structuredClone(first[1]),structuredClone(first[0])]
 current[2].mentions.push({literal:'阅览间',evidence:anchor(0)});current[2].aliases.push('阅览间');valid(current)
 assert.equal(saved.accepts(current),true);assert.equal(saved.diagnose(current),undefined)
 const missingSubset=valid([current[0],current[2]]);assert.equal(saved.accepts(missingSubset),false)
 const d=saved.diagnose(missingSubset)!;assert.deepEqual(d.issues.map(i=>i.kind),['missing-owner']);assert.deepEqual(d.owners.map(o=>o.originalRowIndexes),[[1]])
 assert.deepEqual(d.currentRows.map(r=>r.currentRowIndex),[1]);assert.ok(d.currentRows[0].oldMemberKeys.length>saved.verifiedRows()[1].mentions.length,'the actual superset is reported, not guessed to be the missing subset owner')
})
