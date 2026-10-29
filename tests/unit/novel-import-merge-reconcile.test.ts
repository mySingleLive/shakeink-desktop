import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mergeImportArtifacts} from '../../desktop/core/novel-import'
import {importNativeMappings} from '../../desktop/core/novel-import-semantic-state'
import type {ImportArtifact,ImportTarget} from '../../desktop/shared/novel-import'

// Synthetic names and facts only; no real book content.
const person=(id:string,facts:Record<string,string>,origin:ImportArtifact['origin']='inferred',unit='u1'):ImportArtifact=>({id,kind:'character',name:'合成人物甲',text:'合成简介'+id,facts:{roleType:'SUPPORTING',...facts},origin,sourceUnitIds:[unit],evidence:[{unitId:unit,quote:'合成证据'+id}]})
const other=(kind:ImportTarget,id:string,facts:Record<string,string>,unit='u1'):ImportArtifact=>({id,kind,name:'合成'+kind,text:'合成说明'+id,facts,origin:'inferred',sourceUnitIds:[unit],evidence:[{unitId:unit,quote:'合成证据'+id}]})
const merge=(a:ImportArtifact,b:ImportArtifact,locks?:{artifactId:string;field:string;value:string}[])=>mergeImportArtifacts([a],[{...b,id:a.id}],1,locks)

test('MG01: descriptive character fields union their fragments without conflicts',()=>{
 const r=merge(person('p',{personality:'谨慎、节俭',occupation:'文员'}),person('q',{personality:'节俭、机智',occupation:'文员；顾问'},'inferred','u2'))
 assert.equal(r.conflicts.length,0);const f=r.artifacts[0].facts
 assert.equal(f.personality,'谨慎、节俭；节俭、机智');assert.equal(f.occupation,'文员；顾问')
 for(const field of ['appearance','clothing','catchphrase','growthArc']){const m=merge(person('p',{[field]:'甲'}),person('q',{[field]:'乙'},'inferred','u2'));assert.equal(m.conflicts.length,0,field);assert.equal(m.artifacts[0].facts[field],'甲；乙')}
 assert.deepEqual(r.artifacts[0].sourceUnitIds,['u1','u2']);importNativeMappings(r.artifacts)
})
test('MG02: attribution and temporalScope union with a fixed separator for every kind',()=>{
 const c=merge(person('p',{temporalScope:'第1—3章',attribution:'叙述者'}),person('q',{temporalScope:'本次片段',attribution:'叙述者；角色自述'},'inferred','u2'))
 assert.equal(c.conflicts.length,0);assert.equal(c.artifacts[0].facts.temporalScope,'第1—3章；本次片段');assert.equal(c.artifacts[0].facts.attribution,'叙述者；角色自述')
 const s=merge(other('scene','s',{entityType:'PLACE',temporalScope:'早期'}),other('scene','t',{entityType:'PLACE',temporalScope:'后期'},'u2'))
 assert.equal(s.conflicts.length,0);assert.equal(s.artifacts[0].facts.temporalScope,'早期；后期')
})
test('MG03: relationships merge by identity, union descriptions and append new targets',()=>{
 const a=person('p',{relationships:JSON.stringify([{target:'合成乙',description:'哥哥'},{target:'合成丙',description:'同事',characterId:'c-bing'}])})
 const b=person('q',{relationships:JSON.stringify([{target:'合成乙',description:'哥哥、室友'},{target:'合成丙',description:'上司'},{target:'合成丁',description:'旧友'}])},'inferred','u2')
 const r=merge(a,b);assert.equal(r.conflicts.length,0)
 assert.deepEqual(JSON.parse(r.artifacts[0].facts.relationships),[{target:'合成乙',description:'哥哥、室友'},{target:'合成丙',description:'同事；上司',characterId:'c-bing'},{target:'合成丁',description:'旧友'}])
 // The referenced character must exist for native mapping to accept characterId.
 importNativeMappings([...r.artifacts,{...person('c-bing',{}),name:'合成丙'}])
})
test('MG04: an invalid relationships side still conflicts',()=>{
 const r=merge(person('p',{relationships:'[{"target":"合成乙","description":"哥哥"}]'}),person('q',{relationships:'不是JSON'},'inferred','u2'))
 assert.equal(r.conflicts.length,1);assert.equal(r.conflicts[0].field,'relationships')
})
test('MG05: reliability takes the weaker level and keeps every attribution; invalid values conflict',()=>{
 for(const [x,y] of [['客观事实','角色有限事实'],['角色有限事实','客观事实']]){
  const r=merge(person('p',{reliability:x,attribution:'叙述者'}),person('q',{reliability:y,attribution:'角色转述'},'inferred','u2'))
  assert.equal(r.conflicts.length,0);assert.equal(r.artifacts[0].facts.reliability,'角色有限事实');assert.equal(r.artifacts[0].facts.attribution,'叙述者；角色转述');importNativeMappings(r.artifacts)
 }
 const w=merge(person('p',{reliability:'人物推测',attribution:'甲'}),person('q',{reliability:'可能不可靠',attribution:'乙'},'inferred','u2'));assert.equal(w.artifacts[0].facts.reliability,'可能不可靠')
 const bad=merge(person('p',{reliability:'客观事实'}),person('q',{reliability:'大概吧',attribution:'乙'},'inferred','u2'));assert.ok(bad.conflicts.some(c=>c.field==='reliability'))
})
test('MG06: structural and identity fields still conflict',()=>{
 for(const field of ['roleType','age','gender']){const values=field==='roleType'?['SUPPORTING','ANTAGONIST']:['甲','乙'];const r=merge(person('p',{[field]:values[0]}),person('q',{[field]:values[1]},'inferred','u2'));assert.equal(r.conflicts.length,1,field);assert.equal(r.conflicts[0].field,field)}
 const base={lineId:'l',lineName:'合成线',timeKind:'exact',people:'[]',reliability:'客观事实'}
 const t=merge(other('worldline','e',{...base,timeValue:'1'}),other('worldline','f',{...base,timeValue:'2'},'u2'));assert.ok(t.conflicts.some(c=>c.field==='timeValue'))
})
test('MG07: an author-locked field keeps the conflict path and its value',()=>{
 const a=person('p',{personality:'谨慎'}),r=merge(a,person('q',{personality:'机智'},'inferred','u2'),[{artifactId:'p',field:'personality',value:'谨慎'}])
 assert.equal(r.conflicts.length,1);assert.equal(r.artifacts[0].facts.personality,'谨慎')
})
test('MG08: source merges and legacy calls keep the original conflict behaviour',()=>{
 const src=person('p',{personality:'谨慎'},'source'),inf=person('q',{personality:'机智'},'inferred','u2')
 assert.equal(mergeImportArtifacts([src],[{...inf,id:'p'}],1).conflicts.length,1,'setting-body')
 assert.equal(mergeImportArtifacts([src],[{...person('q',{personality:'机智'},'source','u2'),id:'p'}],1).conflicts.length,1,'source-source')
 assert.equal(mergeImportArtifacts([person('p',{personality:'谨慎'})],[{...inf,id:'p'}]).conflicts.length,1,'legacy')
})
test('MG11: a candidate with any conflict applies no union or downgrade',()=>{
 const a=person('p',{age:'19',personality:'谨慎',reliability:'客观事实'}),r=merge(a,person('q',{age:'17',personality:'机智',reliability:'人物推测',attribution:'转述'},'inferred','u2'))
 assert.deepEqual(r.conflicts.map(c=>c.field),['age']);const f=r.artifacts[0].facts
 assert.equal(f.personality,'谨慎');assert.equal(f.reliability,'客观事实');assert.equal(f.attribution,'转述','empty fields still fill as before');assert.deepEqual(r.artifacts[0].sourceUnitIds,['u1'])
 const locked=merge(person('p',{reliability:'客观事实',attribution:'叙述者'}),person('q',{reliability:'人物推测',attribution:'转述'},'inferred','u2'),[{artifactId:'p',field:'attribution',value:'叙述者'}])
 assert.ok(locked.conflicts.some(c=>c.field==='attribution'));assert.equal(locked.artifacts[0].facts.reliability,'客观事实')
})
test('MG13: unions over the per-field caps fall back to visible conflicts',()=>{
 const long=merge(person('p',{personality:'甲'.repeat(1000)}),person('q',{personality:'乙'.repeat(600)},'inferred','u2'));assert.equal(long.conflicts.length,1);assert.equal(long.artifacts[0].facts.personality,'甲'.repeat(1000))
 const rel=(n:number,prefix:string)=>JSON.stringify(Array.from({length:n},(_,i)=>({target:prefix+i,description:'合成'})))
 const many=merge(person('p',{relationships:rel(40,'甲')}),person('q',{relationships:rel(30,'乙')},'inferred','u2'));assert.equal(many.conflicts.length,1)
})
test('MG14: inconsistent or duplicated relationship identities fail closed; output is stable',()=>{
 const cases=[[[{target:'乙',description:'甲',characterId:'c1'}],[{target:'乙',description:'丙',characterId:'c2'}]],[[{target:'乙',description:'甲',characterId:'c1'}],[{target:'丁',description:'丙',characterId:'c1'}]],[[{target:'乙',description:'甲'},{target:'乙',description:'丁'}],[{target:'戊',description:'丙'}]],[[{target:'乙',description:'甲',extra:'x'}],[{target:'戊',description:'丙'}]]]
 for(const [x,y] of cases){const r=merge(person('p',{relationships:JSON.stringify(x)}),person('q',{relationships:JSON.stringify(y)},'inferred','u2'));assert.equal(r.conflicts.length,1,JSON.stringify([x,y]))}
 const a=person('p',{relationships:JSON.stringify([{description:'哥哥',target:'乙'}])}),b=person('q',{relationships:JSON.stringify([{target:'乙',characterId:'c-yi',description:'哥哥'}])},'inferred','u2')
 const once=merge(a,b);assert.equal(once.artifacts[0].facts.relationships,'[{"target":"乙","description":"哥哥","characterId":"c-yi"}]')
})
test('MG15: merging is idempotent and treats whitespace/NFKC-equal values as equal',()=>{
 const a=person('p',{personality:'谨慎',temporalScope:'第１章'}),b=person('q',{personality:' 谨慎 ',temporalScope:'第1章'},'inferred','u2')
 const r=merge(a,b);assert.equal(r.conflicts.length,0);assert.equal(r.artifacts[0].facts.personality,'谨慎');assert.equal(r.artifacts[0].facts.temporalScope,'第１章')
 const c=person('q',{personality:'机智'},'inferred','u2'),one=merge(a,c),two=mergeImportArtifacts(one.artifacts,[{...c,id:'p'}],1)
 assert.deepEqual(two.artifacts,one.artifacts)
})
test('MG17: whole-value containment never drops a clause; unchanged long values are not capped',()=>{
 const r=merge(person('p',{personality:'对乙 忠诚；对丙 怀疑'}),person('q',{personality:'对乙 怀疑'},'inferred','u2'))
 assert.equal(r.conflicts.length,0);assert.equal(r.artifacts[0].facts.personality,'对乙 忠诚；对丙 怀疑；对乙 怀疑')
 const back=merge(person('p',{personality:'对乙 怀疑'}),person('q',{personality:'对乙 忠诚；对丙 怀疑'},'inferred','u2'))
 assert.equal(back.artifacts[0].facts.personality,'对乙 怀疑；对乙 忠诚；对丙 怀疑')
 const long='甲'.repeat(1600),kept=merge(person('p',{personality:long}),person('q',{personality:'甲甲'},'inferred','u2'))
 assert.equal(kept.conflicts.length,0);assert.equal(kept.artifacts[0].facts.personality,long)
 const grow=merge(person('p',{personality:long}),person('q',{personality:'乙'},'inferred','u2'));assert.equal(grow.conflicts.length,1)
})
