import assert from 'node:assert/strict'
import {test} from 'node:test'
import {repairSettingsReply,runImportAi,stripArtifactAnnotations} from '../../desktop/service/novel-import-ai'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import {IMPORT_KNOWLEDGE_ANNOTATION,IMPORT_THEME_PROFILE_ID,IMPORT_THEME_PROFILE_NAME,importLengthClass,stripImportKnowledgeAnnotations,validateImportSemanticArtifact} from '../../desktop/core/novel-import-semantics'
import {importPlanHash} from '../../desktop/core/novel-import'
import type {ImportAiRequest,ImportArtifact,ImportSession,ImportUnit} from '../../desktop/shared/novel-import'
import {model,review} from '../helpers/novel-import-wizard-fixture'

/* docs/542–543 IQ cases. Synthetic text and names only. */
const unit={id:'u1',fileId:'f',kind:'body',start:0,end:30,text:'沈砚在合成渡口旁停步，风声很大。他想起旧城的钟声。'} as ImportUnit
const note='（可靠性：人物推测；信息来源：合成叙述者；适用时间范围：早期）'
const parse=<T,>(text:string)=>JSON.parse(text) as T

test('IQ-01/02/04: knowledge notes are removed in every standalone form and stripping is idempotent',()=>{
 const cases:[string,string][]=[
  [note+'\n正文',"正文"],
  ['正文A。(信息来源: 叙述者)正文B。','正文A。正文B。'],
  ['正文\n（信息归属：克莱恩；适用时段：第一章）\n下一段','正文\n下一段'],
  ['句尾'+note,'句尾'],
  ['（适用时间范围：早期）正文','正文'],
  ['（信息来源：第三章（回忆））正文','正文'],
 ]
 for(const [input,expected] of cases){const out=stripImportKnowledgeAnnotations(input);assert.equal(out,expected,input);assert.equal(stripImportKnowledgeAnnotations(out),out);assert.ok(!IMPORT_KNOWLEDGE_ANNOTATION.test(out))}
})

test('IQ-03: ordinary brackets and quoted words are kept',()=>{
 for(const text of ['（他说：可靠吗？）','（信息来源不明的传言）','（可靠性很差）','“可靠性：高”','他（沈砚）笑了。','（注：旧城已毁）'])assert.equal(stripImportKnowledgeAnnotations(text),text)
})

test('IQ-05: notes written into inferred prose and descriptive facts are removed; knowledge facts and JSON facts stay',()=>{
 const item:ImportArtifact={id:'c1',kind:'character',name:'沈砚',text:note+'\n沈砚是渡口的船夫。',facts:{reliability:'人物推测',attribution:'合成叙述者',temporalScope:'早期',personality:'沉默'+note,aliases:'["（可靠性：x）"]'},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1'],origin:'inferred'}
 const world:ImportArtifact={id:'w1',kind:'world',name:'城制',text:'城制',facts:{entityType:'SETTING',worldId:'w0',settingType:'CONCEPT',content:JSON.stringify({concepts:[{term:'钟',explanation:note+'旧城的钟'}]})},evidence:[],sourceUnitIds:[],origin:'inferred'}
 stripArtifactAnnotations(item);stripArtifactAnnotations(world)
 assert.equal(item.text,'沈砚是渡口的船夫。');assert.equal(item.facts.personality,'沉默');assert.equal(item.facts.reliability,'人物推测');assert.equal(item.facts.attribution,'合成叙述者');assert.equal(item.facts.aliases,'["（可靠性：x）"]','structural JSON facts are not rewritten')
 assert.deepEqual(JSON.parse(world.facts.content),{concepts:[{term:'钟',explanation:'旧城的钟'}]})
})

test('IQ-05: runImportAi returns inferred artifacts without notes and keeps their evidence',async()=>{
 const request:ImportAiRequest={semanticVersion:1,phase:'analyze',kind:'style',units:[unit],artifacts:[],operationId:'op',models:{text:model,review},workingRevision:0,selectedTargets:['style']}
 const artifact={id:'s1',kind:'style',name:'短句',text:note+'\n多用短句。',facts:{reliability:'客观事实'},evidence:[{unitId:'u1',quote:'风声很大'}],sourceUnitIds:['u1'],origin:'inferred'}
 const deps={resolve:async()=>model,assert:async()=>undefined,generate:async()=>({artifacts:[artifact]})} as never
 const result=await runImportAi(request,new AbortController().signal,deps)
 assert.equal(result.artifacts![0].text,'多用短句。');assert.equal(result.artifacts![0].facts.reliability,'客观事实');assert.deepEqual(result.artifacts![0].evidence,[{unitId:'u1',quote:'风声很大'}])
})

test('IQ-30: length classes follow the theme panel bands',()=>{
 assert.deepEqual([9999,10000,49999,50000,299999,300000,741017].map(importLengthClass),['微型','短篇','短篇','中篇','中篇','长篇','长篇'])
})

const profileFacts=(over:Record<string,string>={})=>({channel:'男频',genre:'奇幻',tags:JSON.stringify(['西方奇幻','蒸汽朋克','烧脑']),sellingPoints:'扮演法与神秘学体系',targetAudience:'喜欢悬疑与克苏鲁的读者',synopsis:'一名穿越者在蒸汽与神秘的城市里求生。',...over})
const profile=(facts:Record<string,string>=profileFacts()):ImportArtifact=>({id:IMPORT_THEME_PROFILE_ID,kind:'theme',name:IMPORT_THEME_PROFILE_NAME,text:'作品定位说明',facts,evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1'],origin:'inferred',schema:2})
const profileRequest=(over:Partial<ImportAiRequest>={}):ImportAiRequest=>({semanticVersion:1,phase:'analyze',kind:'theme',units:[unit],artifacts:[],operationId:'op',models:{text:model,review},workingRevision:0,selectedTargets:['theme'],executionLane:'wizard-settings-v1',themeProfile:true,...over})

test('IQ-32: a valid position decodes all fields as a schema 2 theme profile',async()=>{
 const p=validateImportSemanticArtifact(profile()).profile
 assert.deepEqual(p,{kind:'theme',value:{channel:'男频',genre:'奇幻',tags:['西方奇幻','蒸汽朋克','烧脑'],sellingPoints:'扮演法与神秘学体系',targetAudience:'喜欢悬疑与克苏鲁的读者',synopsis:'一名穿越者在蒸汽与神秘的城市里求生。'}})
 const deps={resolve:async()=>model,assert:async()=>undefined,generate:async()=>{const {schema:_schema,...wire}=profile();return {artifacts:[wire]}}} as never
 const result=await runImportAi(profileRequest(),new AbortController().signal,deps)
 assert.equal(result.artifacts![0].schema,2);assert.equal(result.artifacts![0].id,IMPORT_THEME_PROFILE_ID)
})

test('IQ-31: the position request only runs on the theme settings lane without an intent',async()=>{
 const deps={resolve:async()=>model,assert:async()=>undefined,generate:async()=>{const {schema:_schema,...wire}=profile();return {artifacts:[wire]}}} as never
 for(const bad of [profileRequest({executionLane:undefined}),profileRequest({intent:'entity'}),profileRequest({kind:'style'})])await assert.rejects(runImportAi(bad,new AbortController().signal,deps),/主题定位请求无效|导入向导阶段|单实体/)
})

test('IQ-33/34: settings repair clears an invalid channel or genre and drops off-candidate known tags',()=>{
 const reply=(facts:Record<string,string>)=>{const {schema:_schema,...wire}=profile(facts),out=repairSettingsReply(profileRequest(),JSON.stringify({artifacts:[wire]}),parse);return out?JSON.parse(out.text).artifacts[0].facts:undefined}
 // docs/545 §6 M5: an invalid channel is replaced from a one-channel genre (奇幻 is 男频 only); 现实 belongs to both and keeps no channel.
 const badChannel=reply(profileFacts({channel:'都市频'}))
 assert.equal(badChannel.channel,'男频');assert.equal(badChannel.genre,'奇幻');assert.equal(badChannel.sellingPoints,'扮演法与神秘学体系')
 const both=reply(profileFacts({channel:'都市频',genre:'现实',tags:JSON.stringify(['雾都'])}))
 assert.equal(both.channel,undefined);assert.equal(both.genre,'现实');assert.equal(both.tags,undefined)
 // docs/545 §6 M5: a valid channel is kept; only a missing or 不限 channel is taken from a one-channel genre.
 const badGenre=reply(profileFacts({channel:'女频',genre:'玄幻',tags:'[]'}))
 assert.equal(badGenre.channel,'女频');assert.equal(badGenre.genre,undefined);assert.equal(badGenre.tags,undefined)
 const unknownChannel=reply(profileFacts({channel:'不限',genre:'玄幻',tags:'[]'}));assert.equal(unknownChannel.channel,'男频')
 const tags=reply(profileFacts({tags:JSON.stringify(['西方奇幻','东方玄幻','雾都'])}))
 assert.deepEqual(JSON.parse(tags.tags),['西方奇幻','雾都'],'a known sub-genre of another genre is dropped; free tags stay')
})

test('IQ-35: overlong position fields fail the strict decode',()=>{
 for(const facts of [profileFacts({sellingPoints:'卖'.repeat(2001)}),profileFacts({synopsis:'简'.repeat(501)}),profileFacts({tags:JSON.stringify(Array.from({length:21},(_,i)=>'自由标签'+i))})])assert.throws(()=>validateImportSemanticArtifact(profile(facts)),/主题定位|结构/)
 assert.throws(()=>validateImportSemanticArtifact({...profile(),id:'other-id'}),/主题定位/)
})

test('IQ-36: the position contract is added only to the position request',()=>{
 const withProfile=importAiPrompt(profileRequest()),plain=importAiPrompt(profileRequest({themeProfile:undefined}))
 assert.ok(withProfile.includes('<theme-profile-contract>')&&withProfile.includes(IMPORT_THEME_PROFILE_ID)&&withProfile.includes('男频')&&withProfile.includes('蒸汽朋克'))
 assert.ok(!plain.includes('<theme-profile-contract>'))
 assert.ok(withProfile.includes('"themeProfile":true'))
})

test('IQ-44: the import plan hash covers the position artifact',()=>{
 const base={id:'s',title:'t',files:[],units:[unit],selected:['body'],targets:['theme'],infer:true,originalProse:unit.text,workingProse:unit.text,workingRevision:0,chapters:[],artifacts:[profile()],conflicts:[],decisions:[]} as unknown as ImportSession
 const other={...base,artifacts:[profile(profileFacts({genre:'悬疑'}))]} as ImportSession
 assert.notEqual(importPlanHash(base),importPlanHash(other))
})

/* IQ-37..40: the position request inside the wizard theme task (fixture engine). */
import {legacySceneFixture,filesF,rosterAi,worldsAi,toImportChar,toWorldImport,type Ai} from '../helpers/novel-import-wizard-fixture'
const themeAi=(base:Ai,{position='ok' as 'ok'|'fail'|'none',themes=true}={}):Ai=>async r=>{
 if(r.phase==='analyze'&&!r.intent&&r.kind==='theme'){
  const u=r.units[0]
  if(r.themeProfile){if(position==='fail')throw Error('模型返回结构不完整（facts）');return {artifacts:[{id:IMPORT_THEME_PROFILE_ID,kind:'theme',name:IMPORT_THEME_PROFILE_NAME,text:'定位',facts:{channel:'男频',genre:'历史',tags:JSON.stringify(['古代']),sellingPoints:'渡口少年的成长',targetAudience:'喜欢古风成长的读者',synopsis:'渡口少年沈砚的故事。'},evidence:[{unitId:u.id,quote:u.text.slice(0,8)}],sourceUnitIds:[u.id],origin:'inferred'}]}}
  if(!themes)return {artifacts:[],notFound:true}
  return {artifacts:[{id:'theme-'+u.id,kind:'theme',name:'成长'+u.id,text:'少年在渡口成长。',facts:{},evidence:[{unitId:u.id,quote:u.text.slice(0,8)}],sourceUnitIds:[u.id],origin:'inferred'}]}
 }
 return base(r)
}
const runSettings=async(options:Parameters<typeof themeAi>[1])=>{
 const f=await legacySceneFixture(filesF(),rosterAi());f.setAi(themeAi(worldsAi(f.handler()),options))
 await toImportChar(f);await toWorldImport(f);await f.act('wizard-next');const v=await f.settle();return {f,v}
}

test('IQ-37: after every theme batch, one position request; it is adopted with the theme results',async()=>{
 const {f,v}=await runSettings({});try{
  const theme=v.wizard!.tasks.find(t=>t.settingsKind==='theme')!;assert.equal(theme.state,'done',theme.error)
  const profiles=f.requests.filter(r=>r.themeProfile),batches=f.requests.filter(r=>r.phase==='analyze'&&!r.intent&&r.kind==='theme'&&!r.themeProfile)
  assert.equal(profiles.length,1);assert.ok(batches.length>=1)
  assert.equal(profiles[0].executionLane,'wizard-settings-v1');assert.ok(profiles[0].artifacts.every(a=>a.evidence.length===1&&a.evidence.every(e=>profiles[0].units.some(u=>u.id===e.unitId))),'each context theme keeps one quote whose unit is in the sample');assert.ok(profiles[0].artifacts.some(a=>a.kind==='theme'&&a.id.startsWith('theme-')))
  const j=await f.journal(),p=j.artifacts.find(a=>a.id===IMPORT_THEME_PROFILE_ID)!
  assert.equal(p.schema,2);assert.equal(p.facts.genre,'历史');assert.ok(j.artifacts.some(a=>a.kind==='theme'&&a.id.startsWith('theme-')))
 }finally{await f.dispose()}
})
test('IQ-38: a failing position request leaves the theme task done with a dropped note and no position',async()=>{
 const {f,v}=await runSettings({position:'fail'});try{
  assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'done')
  assert.equal(f.requests.filter(r=>r.themeProfile).length,3,'docs/545: two reruns, the last one lean')
  assert.ok(v.wizard!.dropped.some(d=>d.kind==='settings'&&d.label==='主题定位'))
  // docs/545 §6 H3: a channel-only fallback may follow from the body; it never carries a genre.
  assert.equal((await f.journal()).artifacts.find(a=>a.id===IMPORT_THEME_PROFILE_ID)?.facts.genre,undefined)
 }finally{await f.dispose()}
})
test('IQ-39: no position request when no theme was found',async()=>{
 const {f}=await runSettings({themes:false});try{assert.equal(f.requests.filter(r=>r.themeProfile).length,0)}finally{await f.dispose()}
})

/* docs/544 review regressions. */
test('IQ-45 (544 H1): stripping is linear on long or unclosed note-like text',()=>{
 const pairs=(n:number)=>'（'+Array.from({length:n},(_,i)=>'可靠性：值'+i).join('；')
 for(const text of [pairs(30)+'正文'.repeat(2000),(pairs(30)+'）正文\n').repeat(2000)]){const t=performance.now();stripImportKnowledgeAnnotations(text);assert.ok(performance.now()-t<200,'took '+(performance.now()-t))}
})
test('IQ-46 (544 H2/M1): a note split across lines or left unclosed is kept verbatim and never blocks saving',()=>{
 for(const text of ['他（\n可靠性：客观事实）走了','他说：“（可靠性：高”这句话不对，然后离开了房间。'])assert.equal(stripImportKnowledgeAnnotations(text),text)
 assert.equal(stripImportKnowledgeAnnotations('（可靠性：客观事实，信息来源：叙述者）正文'),'正文')
})
test('IQ-47 (544 M2): notes inside JSON prose facts (motivations, effects, relationships) are removed; structure stays',()=>{
 const item:ImportArtifact={id:'c2',kind:'character',name:'林舟',text:'林舟',facts:{motivations:JSON.stringify([{items:[{text:'回家'+note,importance:3}]}]),relationships:JSON.stringify([{target:'沈砚',description:'旧识'+note,characterId:'c1'}]),roleType:'SUPPORTING'},evidence:[],sourceUnitIds:[],origin:'inferred'}
 stripArtifactAnnotations(item)
 assert.deepEqual(JSON.parse(item.facts.motivations),[{items:[{text:'回家',importance:3}]}]);assert.deepEqual(JSON.parse(item.facts.relationships),[{target:'沈砚',description:'旧识',characterId:'c1'}]);assert.equal(item.facts.roleType,'SUPPORTING')
})
test('IQ-48 (544 M4): position repairs are counted apart from reliability',()=>{
 const {schema:_schema,...wire}=profile(profileFacts({channel:'都市频'})),out=repairSettingsReply(profileRequest(),JSON.stringify({artifacts:[wire]}),parse)!
 assert.equal(out.counts!.clearedReliability,0);assert.equal(out.counts!.clearedPosition,1)
})
test('IQ-49 (544 M3/L): a later settings task keeps the theme position note; a plain theme batch cannot take the reserved id',async()=>{
 const {f,v}=await runSettings({position:'fail'});try{
  assert.ok(v.wizard!.tasks.filter(t=>t.kind==='settings').every(t=>t.state!=='running'))
  assert.ok((await f.journal()).wizard!.dropped.some(d=>d.kind==='settings'&&d.label==='主题定位'),'note survives the other settings tasks')
 }finally{await f.dispose()}
})
test('IQ-50b (q-r4): a bare or loosely typed position reply is normalized before the strict check',()=>{
 const bare={id:'whatever',kind:'theme',name:'作品定位',text:'',facts:{channel:'男频',genre:'奇幻',tags:['西方奇幻'],sellingPoints:'卖点',targetAudience:'读者',synopsis:'简介',score:3},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1'],origin:'inferred'}
 for(const reply of [bare,{artifacts:[bare],notFound:false}]){
  const out=repairSettingsReply(profileRequest(),JSON.stringify(reply),parse)!,a=JSON.parse(out.text).artifacts[0]
  assert.equal(a.id,IMPORT_THEME_PROFILE_ID);assert.equal(a.name,IMPORT_THEME_PROFILE_NAME);assert.equal(a.facts.tags,'["西方奇幻"]');assert.equal(a.facts.score,undefined,'unknown facts are dropped')
 }
})

test('IQ-51b (q-r7): a position whose own quotes cannot be located keeps the themes\' verified quotes',()=>{
 const theme:ImportArtifact={id:'t1',kind:'theme',name:'成长',text:'少年成长',facts:{},evidence:[{unitId:'u1',quote:'风声很大'}],sourceUnitIds:['u1'],origin:'inferred'}
 const {schema:_schema,...wire}=profile(),bad={...wire,evidence:[{unitId:'u1',quote:'原文中没有的句子'}]}
 const out=repairSettingsReply(profileRequest({artifacts:[theme]}),JSON.stringify({artifacts:[bad]}),parse)!
 assert.deepEqual(JSON.parse(out.text).artifacts[0].evidence,[{unitId:'u1',quote:'风声很大'}])
})
test('IQ-35b (q-r8): repair cuts over-long position prose at a character boundary and keeps the position',()=>{
 const {schema:_schema,...wire}=profile(profileFacts({sellingPoints:'卖😀'.repeat(1500),synopsis:'简'.repeat(600)}))
 const out=repairSettingsReply(profileRequest(),JSON.stringify({artifacts:[wire]}),parse)!,f=JSON.parse(out.text).artifacts[0].facts
 // docs/545: the requested synopsis is cut to 300 characters (no sentence end here, so at a character boundary).
 assert.equal(Array.from(f.sellingPoints).length,2000);assert.ok(f.sellingPoints.isWellFormed());assert.equal(Array.from(f.synopsis).length,300);assert.equal(f.channel,'男频')
 assert.equal(out.counts!.clearedPosition,2)
})
