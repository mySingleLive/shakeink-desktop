import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {mergeWizardRoster,wizardItemRejected,itemRosterTaken,normalizeWizardName,type WizardCandidate} from '../../desktop/core/novel-import-wizard'
import {buildWizardCandidates,type WizardRosterStashEntry} from '../../desktop/core/novel-import-wizard-roster'
import {emptyWizardState,validateImportWizardState} from '../../desktop/core/novel-import-wizard-state'
import {toImportView} from '../../desktop/core/novel-import'
import type {ImportArtifact,ImportAiRequest,ImportSession} from '../../desktop/shared/novel-import'
import {fixture,relatingAi,rosterAi,toStep,injectJournalEdit,type Ai} from '../helpers/novel-import-wizard-fixture'

/* docs/491 A–E. Synthetic names only. */
type Category='item'|'character'|'place'|'organization'|'concept'|'other'
const it=(name:string,category?:Category,extra:Partial<WizardRosterStashEntry>={}):WizardRosterStashEntry=>({name,aliases:[],itemType:'信物',important:false,...(category?{category}:{}),...extra} as WizardRosterStashEntry)
const chapters=(name:string,n:number)=>Array.from({length:Math.max(n,1)},(_,k)=>({content:k<n?name+'出现。':'无关。'}))
const names=(list:readonly {name:string}[])=>list.map(c=>c.name)
const item=(text:string,id='a-item'):ImportArtifact=>({id,kind:'item',name:'物品资料',text,facts:{},evidence:[],sourceUnitIds:[],origin:'source'} as unknown as ImportArtifact)

test('491-A1: a tie between item and non-item votes excludes the entry',()=>{
 assert.deepEqual(names(buildWizardCandidates('item',[it('灯神','item',{important:true}),it('灯神','character')],[],chapters('灯神',5))),[])
})
test('491-A2: an item majority keeps the entry',()=>{
 assert.deepEqual(names(buildWizardCandidates('item',[it('青铜钥匙','item',{important:true}),it('青铜钥匙','item'),it('青铜钥匙','concept')],[],chapters('青铜钥匙',1))),['青铜钥匙'])
})
test('491-A3: entries without any category keep the old behavior',()=>{
 assert.deepEqual(names(buildWizardCandidates('item',[it('青铜钥匙',undefined,{important:true}),it('青铜钥匙')],[],chapters('青铜钥匙',1))),['青铜钥匙'])
})
test('491-A4: one non-item vote with the rest unknown excludes the entry',()=>{
 assert.deepEqual(names(buildWizardCandidates('item',[it('序列甲','concept'),it('序列甲'),it('序列甲',undefined,{important:true})],[],chapters('序列甲',5))),[])
})
test('491-A5: important and itemType from non-item batches are ignored',()=>{
 const base=[it('圣徽','character',{important:true,itemType:'角色'}),it('圣徽','item',{itemType:''}),it('圣徽','item',{itemType:''})]
 assert.deepEqual(names(buildWizardCandidates('item',base,[],chapters('圣徽',1))),[],'only the character batch said important')
 const kept=buildWizardCandidates('item',[base[0],it('圣徽','item',{itemType:'圣物',important:true}),base[2]],[],chapters('圣徽',1))
 assert.deepEqual(names(kept),['圣徽']);assert.equal(kept[0].itemType,'圣物')
})
test('491-A6: an item listed in a source file stays even when batches call it a character',()=>{
 const kept=buildWizardCandidates('item',[it('灯神','character'),it('灯神','character')],[item('# 灯神\n\n一盏古灯。\n')],chapters('灯神',5))
 assert.deepEqual(names(kept),['灯神']);assert.ok(kept[0].sources.includes('source'))
})
test('491-A7: alias-merged groups are counted together',()=>{
 const entries=[it('青铜钥匙','item',{aliases:['钥匙'],important:true}),it('钥匙','concept',{aliases:['青铜钥匙']}),it('钥匙','concept',{aliases:['青铜钥匙']})]
 const merged=mergeWizardRoster('item',entries) as unknown as {itemVotes:number;otherVotes:number}[]
 assert.equal(merged.length,1);assert.equal(merged[0].itemVotes,1);assert.equal(merged[0].otherVotes,2)
 assert.deepEqual(names(buildWizardCandidates('item',entries,[],chapters('钥匙',1))),[])
})
test('491-A8: candidates carry no vote fields and pass the wizard state schema',()=>{
 const list=buildWizardCandidates('item',[it('青铜钥匙','item',{important:true}),it('青铜钥匙','item'),it('青铜钥匙','concept')],[],chapters('青铜钥匙',1))
 for(const c of list)for(const key of ['itemVotes','otherVotes','primaries','names','important'])assert.ok(!(key in c),key)
 const wizard=emptyWizardState();wizard.candidates.item=list
 assert.doesNotThrow(()=>validateImportWizardState({wizardVersion:1,wizard}))
})
test('491-A9: rejection table',()=>{
 const cases:[number,number,boolean][]=[[0,0,false],[1,0,false],[0,1,true],[1,1,true],[2,1,false]]
 for(const [itemVotes,otherVotes,rejected] of cases)assert.equal(wizardItemRejected({itemVotes,otherVotes}),rejected,itemVotes+':'+otherVotes)
})

const stashState=(entries:unknown[])=>{const wizard=emptyWizardState() as ReturnType<typeof emptyWizardState>&{rosterStash?:unknown};wizard.rosterStash={item:entries as never};return {wizardVersion:1,wizard}}
test('491-B1: stash entries accept a known category, accept none, and reject unknown values',()=>{
 const entry={unitId:'u1',name:'青铜钥匙',aliases:[],itemType:'信物',important:true}
 assert.doesNotThrow(()=>validateImportWizardState(stashState([{...entry,category:'item'}])))
 assert.doesNotThrow(()=>validateImportWizardState(stashState([entry])))
 assert.throws(()=>validateImportWizardState(stashState([{...entry,category:'weapon'}])))
})
test('491-B2: resumed stashes mix old entries without category and new ones with it',()=>{
 const old=[it('灯神',undefined,{important:true}),it('灯神')]
 assert.deepEqual(names(buildWizardCandidates('item',[...old,it('灯神','character'),it('灯神','character')],[],chapters('灯神',5))),[])
 assert.deepEqual(names(buildWizardCandidates('item',[...old,it('灯神','item'),it('灯神','item')],[],chapters('灯神',5))),['灯神'])
})

const taken=(...list:string[])=>new Set(list.map(normalizeWizardName))
test('491-C1..C5: items named exactly like a selected character or place are left out',()=>{
 const imp=(name:string,extra:Partial<WizardRosterStashEntry>={})=>it(name,'item',{important:true,...extra})
 assert.deepEqual(names(buildWizardCandidates('item',[imp('沈砚'),imp('青铜钥匙')],[],chapters('x',1),taken('沈砚'))),['青铜钥匙'],'C1')
 assert.deepEqual(names(buildWizardCandidates('item',[imp('砚哥')],[],chapters('x',1),taken('沈砚','砚哥'))),[],'C2 title alias, known risk')
 assert.deepEqual(names(buildWizardCandidates('item',[imp('圣徽',{aliases:['灯神']})],[],chapters('x',1),taken('灯神'))),['圣徽'],'C3 item aliases are not compared')
 assert.deepEqual(names(buildWizardCandidates('item',[imp('沈砚')],[item('# 沈砚\n\n一枚印章。\n')],chapters('x',1),taken('沈砚'))),['沈砚'],'C4 source items stay')
 const entries=[imp('沈砚'),imp('青铜钥匙')]
 assert.deepEqual(buildWizardCandidates('item',entries,[],chapters('x',1),new Set()),buildWizardCandidates('item',entries,[],chapters('x',1)),'C5')
})
const cand=(kind:'character'|'scene',name:string,selected:boolean,extra:Partial<WizardCandidate>={}):WizardCandidate=>({id:(kind==='character'?'c-':'s-')+name,kind,name,aliases:[],chapterCount:1,sources:['body'],sourceArtifactIds:[],selected,...extra})
test('491-C6..C8: the taken set uses selected characters and selected, resolved places',()=>{
 const w=emptyWizardState()
 assert.equal(itemRosterTaken(w).size,0,'C8')
 w.candidates.character=[cand('character','沈砚',true,{aliases:['砚哥']}),cand('character','林舟',false)]
 w.candidates.scene=[cand('scene','北城',true,{sceneIdentityState:'concrete'}),cand('scene','南巷',false,{sceneIdentityState:'concrete',sceneExcluded:true}),cand('scene','东渡',true,{sceneIdentityState:'concrete',sceneExcluded:true}),cand('scene','西渡',true,{sceneIdentityState:'unresolved'})]
 assert.deepEqual([...itemRosterTaken(w)].sort(),['东渡','北城','沈砚','砚哥'].map(normalizeWizardName).sort())
})

test('491-D1: the running count leaves out groups judged not to be items',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});const s=await f.journal()
  s.wizard!.step='detect-item';s.wizard!.stepState['detect-item']='running'
  ;(s.wizard as {rosterStash?:unknown}).rosterStash={item:[it('灯神','item',{important:true}),it('灯神','character'),it('青铜钥匙','item')]}
  assert.equal(toImportView(s as ImportSession).wizard!.rosterFound,1)
 }finally{await f.dispose()}
})

/** E: drive the real controller to step 13 with mixed categories (fixture AI bypasses runImportAi, so each entry brings its own evidence). */
const mixed=(r:ImportAiRequest)=>({roster:r.units.flatMap(u=>([['青铜钥匙','item'],['北城','place'],['沈砚','item']] as const).filter(([n])=>u.text.includes(n)).map(([name,category])=>({name,aliases:[],itemType:'信物',important:true,category,evidence:{unitId:u.id,quote:name}})))})
async function toItemList(deselect?:string){
 const ai:Ai=relatingAi(rosterAi({'roster:item':r=>mixed(r) as never}))
 const f=await fixture(undefined,ai)
 await f.act('choose',{mode:'files'});await f.act('wizard-next')
 await f.act('set-title',{title:'合成作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle()
 await f.act('select',{selected:['body','character'],targets:['character','item'],infer:true})
 await f.act('wizard-next',{consent:true});await f.settle();await f.act('wizard-next',{consent:true});await f.settle()
 if(deselect){const at=await toStep(f,'detect-char'),id=at.wizard!.candidates.character!.find(c=>c.name===deselect)!.id;await f.act('wizard-select-candidates',{kind:'character',ids:[id],selected:false})}
 const v=await toStep(f,'detect-item');return {f,v}
}
test('491-E1: step 13 lists only items; places drop by category and selected characters by name',async()=>{
 const {f,v}=await toItemList();try{
  assert.equal(v.wizard!.stepState['detect-item'],'waiting',v.wizard!.stepError)
  assert.deepEqual(names(v.wizard!.candidates.item??[]),['青铜钥匙'])
 }finally{await f.dispose()}
 const other=await toItemList('沈砚');try{assert.deepEqual(names(other.v.wizard!.candidates.item??[]).sort(),['沈砚','青铜钥匙'].sort())}finally{await other.f.dispose()}
})
test('491-E2: the saved draft keeps no stash or vote fields and accepts categories in a stash',async()=>{
 const {f}=await toItemList();try{
  const j=await f.journal();assert.equal((j.wizard as {rosterStash?:{item?:unknown}}).rosterStash?.item,undefined)
  for(const c of j.wizard!.candidates.item!)for(const key of ['itemVotes','otherVotes','primaries'])assert.ok(!(key in c),key)
  const entry={unitId:j.workingUnits?.[0]?.id??'u1',name:'青铜钥匙',aliases:[],itemType:'信物',important:true}
  const c=await injectJournalEdit(f,x=>{(x.wizard as {rosterStash?:unknown}).rosterStash={item:[{...entry,category:'item'}]}})
  const raw=JSON.parse(await readFile(join(f.root,'novel-imports',j.id,'session.json'),'utf8'));(raw.wizard.rosterStash.item[0]).category='weapon'
  assert.equal((c as unknown as {validJournal(j:unknown,id:string):boolean}).validJournal(raw,j.id),false)
 }finally{await f.dispose()}
})
