import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {extractNovelText} from '../../desktop/main/novel-import-files'

const iconv=createRequire(import.meta.url)('iconv-lite') as {encode(text:string,encoding:string):Buffer;decode(bytes:Buffer,encoding:string):string}

test('NIW-U01: GB18030 is detected automatically without confirmation',async()=>{
 const text='第一部 甲卷\r\n第一章 起\r\n沈砚推开门。🖋\r\n',bytes=iconv.encode(text,'gb18030')
 const result=await extractNovelText(bytes,'txt')
 assert.equal(result.encoding,'gb18030');assert.equal(result.requiresEncodingConfirmation,false);assert.equal(result.encodingDetected,true)
 assert.equal(result.text,iconv.decode(bytes,'gb18030'))
})
test('NIW-U02: BOM and UTF-8 detection are marked as detected',async()=>{
 const text='第一章 起\n正文。'
 const cases:[Buffer,string][]=[[Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]),'utf-8'],[Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')]),'utf-16le'],[Buffer.from(text),'utf-8']]
 const be=Buffer.from(cases[1][0]);be.swap16();cases.push([be,'utf-16be'])
 for(const [bytes,encoding] of cases){const result=await extractNovelText(bytes,'txt');assert.equal(result.encoding,encoding);assert.equal(result.encodingDetected,true);assert.equal(result.requiresEncodingConfirmation,false);assert.equal(result.text,text)}
})
test('NIW-U03: bytes that are neither UTF-8 nor GB18030 fail with a bounded message',async()=>{
 await assert.rejects(extractNovelText(Buffer.from([0xff,0xff,0x80,0x80]),'txt'),{message:'无法识别文本编码，请改选编码或排除此文件'})
})
test('NIW-U04: HTML shares automatic GB18030 detection',async()=>{
 const bytes=iconv.encode('<html><body><p>第一章 起</p><p>沈砚推开门。</p></body></html>','gb18030')
 const result=await extractNovelText(bytes,'html')
 assert.equal(result.encoding,'gb18030');assert.equal(result.requiresEncodingConfirmation,false);assert.equal(result.encodingDetected,true);assert.match(result.text,/沈砚推开门。/)
})

import {WIZARD_STEPS,wizardSkippedSteps,materializeWizardChapters,assertWizardMaterialization,type WizardStructureChapter} from '../../desktop/core/novel-import-wizard'
import {IMPORT_TARGETS,type ImportKind,type ImportTarget} from '../../desktop/shared/novel-import'
import {importVolumeGroups} from '../../desktop/core/novel-import-chapters'

const step=(id:string)=>WIZARD_STEPS.indexOf(id as typeof WIZARD_STEPS[number])+1
const numbers=(ids:Iterable<string>)=>[...ids].map(step).sort((a,b)=>a-b)
const allFound:ImportKind[]=['body','outline','character','world','scene','item']
test('NIW-U05: skipped steps follow content selection and model availability',()=>{
 assert.equal(WIZARD_STEPS.length,22)
 const range=(a:number,b:number)=>Array.from({length:b-a+1},(_,i)=>a+i)
 assert.deepEqual(numbers(wizardSkippedSteps({selected:allFound,targets:[...IMPORT_TARGETS],infer:true,textModel:true})),[])
 assert.deepEqual(numbers(wizardSkippedSteps({selected:['body'],targets:[...IMPORT_TARGETS],infer:false,textModel:true})),range(9,20))
 assert.deepEqual(numbers(wizardSkippedSteps({selected:['character','world','scene','item'],targets:[...IMPORT_TARGETS],infer:true,textModel:true})),[5,6,7,8,17,18,19,20])
 // Without a model the source outline is still copied at step 19.
 assert.deepEqual(numbers(wizardSkippedSteps({selected:allFound,targets:[...IMPORT_TARGETS],infer:true,textModel:false})),[17,18,20])
 assert.deepEqual(numbers(wizardSkippedSteps({selected:['body','theme'],targets:[],infer:false,textModel:true})),[9,10,11,12,13,14,15,17,18,19,20])
 assert.deepEqual(numbers(wizardSkippedSteps({selected:allFound.filter(k=>k!=='character'),targets:IMPORT_TARGETS.filter((k):k is ImportTarget=>k!=='character'),infer:true,textModel:true})),[9,10])
})

/** F body: 3 volumes, 10 chapters + an unassigned tail. */
const volumes:[string,string[]][]=[['甲卷',['第一章 起','第二章 承','第三章 转','第四章 终']],['乙卷',['第一章 再起','第二章 再承','第三章 再终']],['丙卷',['第一章 三起','第二章 三承','第三章 三终']]]
function fixtureStructure(){
 let text='',structure:WizardStructureChapter[]=[]
 for(const [index,[volume,chapters]] of volumes.entries())for(const [k,title] of chapters.entries()){const start=text.length;text+=(k===0?`第${'一二三'[index]}部 ${volume}\n`:'')+title+'\n'+title.slice(4)+'的正文。\n';structure.push({start,end:text.length,title,volume})}
 const start=text.length;text+='后记\n作者的话。\n';structure.push({start,end:text.length,title:'后记'})
 return {text,structure}
}
test('NIW-U06: materialization keeps only selected chapters with stable volume names',()=>{
 const {text,structure}=fixtureStructure(),selection=[0,1,2,3,5,6]
 const m=materializeWizardChapters(text,structure,selection)
 assert.equal(m.prose,selection.map(i=>text.slice(structure[i].start,structure[i].end)).join(''))
 assert.equal(m.chapters.length,6);assert.deepEqual(m.chapters.map(c=>c.id),['chapter-1','chapter-2','chapter-3','chapter-4','chapter-5','chapter-6'])
 for(const [k,c] of m.chapters.entries()){assert.equal(m.prose.slice(c.start,c.end),c.content);if(k)assert.equal(c.start,m.chapters[k-1].end)}
 assert.deepEqual(m.chapters.map(c=>c.volume),['甲卷','甲卷','甲卷','甲卷','乙卷','乙卷'])
 assert.deepEqual(m.volumes.map(v=>v.volume),m.chapters.map(c=>c.volume));assert.equal(m.chapters[4].title,'第二章 再承')
 assert.ok(!m.prose.includes('再起')&&!m.prose.includes('三起')&&!m.prose.includes('后记'))
})
test('NIW-U07: unassigned groups materialize without volume names',()=>{
 const {text,structure}=fixtureStructure()
 const without=materializeWizardChapters(text,structure,structure.slice(0,-1).map((_,i)=>i));assert.ok(!without.prose.includes('后记'));importVolumeGroups(without.chapters)
 const only=materializeWizardChapters(text,structure,[structure.length-1]);assert.equal(only.chapters.length,1);assert.equal(only.chapters[0].volume,undefined);importVolumeGroups(only.chapters)
 assert.throws(()=>materializeWizardChapters(text,structure,[]),/至少选择一章/)
 assert.throws(()=>materializeWizardChapters(text,structure,[3,1]),/章节选择/)
})
test('NIW-U09: materialization assertion detects tampering',()=>{
 const {text,structure}=fixtureStructure(),selection=[0,1,2,3,5,6],m=materializeWizardChapters(text,structure,selection)
 assertWizardMaterialization(text,structure,selection,m.prose,m.chapters)
 assert.throws(()=>assertWizardMaterialization(text,structure,selection,m.prose,m.chapters.map((c,i)=>i===2?{...c,content:c.content.replace('转','反')}:c)),/原文不匹配/)
 assert.throws(()=>assertWizardMaterialization(text,structure,selection,m.prose,m.chapters.map((c,i)=>i===4?{...c,volume:'丙卷'}:c)),/卷归属/)
})

import {mergeWizardRoster,wizardCandidateId,wizardChapterCount,keepWizardItem,selectWizardWorld,wizardWorldState,keptWizardWorlds,type WizardCandidate,type WizardRosterEntry} from '../../desktop/core/novel-import-wizard'
const entry=(name:string,roleType?:WizardRosterEntry['roleType'],aliases:string[]=[]):WizardRosterEntry=>({name,aliases,...(roleType?{roleType}:{})})
test('NIW-U10: roster merge by name and alias with deterministic role voting',()=>{
 const merged=mergeWizardRoster('character',[entry('沈砚','PROTAGONIST'),entry('沈砚','SUPPORTING'),entry('沈砚','PROTAGONIST'),entry('林舟','SUPPORTING',['舟哥']),entry('舟哥','ANTAGONIST'),entry('ＡＢ','SUPPORTING'),entry('AB','SUPPORTING')])
 assert.equal(merged.length,3)
 const by=(name:string)=>merged.find(c=>c.name===name)!
 assert.equal(by('沈砚').roleType,'PROTAGONIST');assert.deepEqual(by('林舟').aliases,['舟哥']);assert.equal(by('林舟').roleType,'ANTAGONIST')
 assert.ok(merged.some(c=>c.name==='AB'||c.name==='ＡＢ'))
})
test('RS-06: merged roster aliases stay within the stored limit of 50',()=>{
 const many=Array.from({length:80},(_,i)=>'别称'+i),merged=mergeWizardRoster('character',[entry('沈砚','PROTAGONIST',many.slice(0,20)),...many.slice(19).map(a=>entry(a,'SUPPORTING',['沈砚']))])
 assert.equal(merged.length,1);assert.equal(merged[0].aliases.length,50);assert.deepEqual(merged[0].aliases.slice(0,20),many.slice(0,20),'first-seen aliases are kept')
})
test('RS-06b: a source card or unit matched only by a name past the alias cap is still linked',async()=>{
 const {buildWizardCandidates}=await import('../../desktop/core/novel-import-wizard-roster')
 const many=Array.from({length:60},(_,i)=>'别称'+i),entries=[{...entry('沈砚','PROTAGONIST',many),unitId:'u1'},{...entry('别称59','SUPPORTING'),unitId:'u9'}]
 const card={id:'a-card',kind:'character',name:'别称59',text:'资料。',facts:{},evidence:[],sourceUnitIds:[],origin:'source'} as never
 const [c]=buildWizardCandidates('character',entries,[card],[{content:'别称59出场。'}])
 assert.equal(c.aliases.length,50);assert.deepEqual(c.sources.sort(),['body','source']);assert.deepEqual(c.sourceArtifactIds,['a-card'])
 assert.deepEqual(c.evidenceUnitIds?.sort(),['u1','u9']);assert.equal(c.chapterCount,1)
})
test('RS-06c: a title shared as an alias does not merge different characters; the most used name is shown',()=>{
 const merged=mergeWizardRoster('character',[entry('克莱恩','PROTAGONIST',['愚者','魔术师之友']),entry('佛尔思','SUPPORTING',['魔术师']),entry('佛尔思','SUPPORTING',['魔术师']),entry('海神','SUPPORTING',['魔术师']),entry('克莱恩·莫雷蒂','PROTAGONIST',['克莱恩']),entry('克莱恩·莫雷蒂','PROTAGONIST',[]),entry('佛尔思·沃尔','SUPPORTING',['佛尔思','愚者'])])
 const by=(n:string)=>merged.find(c=>c.names.has(n))!
 assert.notEqual(by('佛尔思'),by('克莱恩'),'shared alias 愚者 alone does not merge');assert.notEqual(by('佛尔思'),by('海神'),'shared title 魔术师 alone does not merge')
 assert.equal(by('克莱恩').name,'克莱恩·莫雷蒂');assert.equal(by('克莱恩').roleType,'PROTAGONIST');assert.ok(by('克莱恩').aliases.includes('克莱恩'))
 assert.equal(by('佛尔思·沃尔'),by('佛尔思'),'an entry naming another entry\'s own name merges')
})
test('RS-06d: one batch wrongly listing another character as an alias does not merge them',()=>{
 const hero=Array.from({length:10},()=>entry('克莱恩','PROTAGONIST',['愚者'])),god=Array.from({length:8},()=>entry('卡维图瓦','SUPPORTING',['海神']))
 const merged=mergeWizardRoster('character',[...hero,entry('克莱恩','PROTAGONIST',['卡维图瓦']),...god])
 const k=merged.find(c=>c.name==='克莱恩')!,g=merged.find(c=>c.name==='卡维图瓦')!
 assert.ok(k&&g&&k!==g);assert.equal(k.roleType,'PROTAGONIST');assert.ok(!k.aliases.includes('卡维图瓦'),'the other character\'s own name is not kept as an alias');assert.ok(!k.names.has('卡维图瓦'))
})
test('NIW-U11: unimportant body items are dropped but source items always stay',()=>{
 assert.equal(keepWizardItem({important:false,chapterCount:2,fromSource:false}),false)
 assert.equal(keepWizardItem({important:false,chapterCount:3,fromSource:false}),true)
 assert.equal(keepWizardItem({important:false,chapterCount:0,fromSource:true}),true)
 assert.equal(keepWizardItem({important:true,chapterCount:0,fromSource:false}),true)
})
test('NIW-U12: chapter counts use names and aliases in selected chapters only',()=>{
 const chapters=['沈砚出门。','沈砚与沈砚。','无关。','砚哥来了。','沈砚'].map(content=>({content}))
 assert.equal(wizardChapterCount({name:'沈砚',aliases:['砚哥']},chapters),4)
 assert.equal(wizardChapterCount({name:'沈砚',aliases:[]},chapters.slice(2,3)),0)
})
test('NIW-U13: candidate ids are stable and kind scoped',()=>{
 const a=wizardCandidateId('character','沈砚'),b=wizardCandidateId('character',' 沈砚 '),c=wizardCandidateId('scene','沈砚')
 assert.equal(a,b);assert.notEqual(a,c);for(const id of [a,c,wizardCandidateId('world-setting','社会制度')])assert.match(id,/^[a-z]+-[0-9a-f]{16}$/)
})

function worlds():WizardCandidate[]{
 const base={aliases:[],chapterCount:0,sources:['body' as const],sourceArtifactIds:[],selected:true}
 return [
  {...base,id:'w-parent',kind:'world',name:'父界'},
  {...base,id:'ws-a',kind:'world-setting',name:'社会',parentId:'w-parent',settingType:'SOCIETY'},
  {...base,id:'ws-b',kind:'world-setting',name:'风俗',parentId:'w-parent',settingType:'CULTURE'},
  {...base,id:'w-child',kind:'world',name:'子界',parentId:'w-parent'},
  {...base,id:'ws-c',kind:'world-setting',name:'地理',parentId:'w-child',settingType:'GEOGRAPHY'},
  {...base,id:'w-empty',kind:'world',name:'空界'},
 ]
}
test('NIW-U18: world selection cascades to descendants and keeps parents with selected leaves',()=>{
 let list=selectWizardWorld(worlds(),'w-parent',false)
 assert.ok(list.filter(c=>c.id!=='w-empty').every(c=>!c.selected))
 assert.deepEqual(keptWizardWorlds(list).map(c=>c.id),['w-empty'])
 list=selectWizardWorld(worlds(),'ws-c',false)
 assert.deepEqual(keptWizardWorlds(list).map(c=>c.id).sort(),['w-empty','w-parent'])
 list=selectWizardWorld(worlds(),'w-empty',false)
 assert.ok(!keptWizardWorlds(list).some(c=>c.id==='w-empty'))
})
test('NIW-U19: world tri-state aggregates nested worlds',()=>{
 const list=selectWizardWorld(worlds(),'ws-c',false)
 assert.equal(wizardWorldState(list,'w-parent'),'mixed');assert.equal(wizardWorldState(list,'w-child'),'unchecked')
 assert.equal(wizardWorldState(worlds(),'w-parent'),'checked');assert.equal(wizardWorldState(selectWizardWorld(worlds(),'w-parent',false),'w-parent'),'unchecked')
})

import {planForeshadowTouches,type WizardForeshadowInput,type WizardTouchContext} from '../../desktop/core/novel-import-foreshadow'
import {emptyPlanning,validatePlanning,worldlineSchema,lineSchema,eventSchema,cardSchema} from '../../src/lib/planning/domain'
const chapters=[{content:'沈砚在旧井边拾到一枚青铜钥匙，钥匙上刻着蛇纹。',outline:'沈砚拾到青铜钥匙'},{content:'林舟提起钥匙的来历。后来钥匙打开了地宫。',outline:'林舟提起钥匙'}]
const ctx=(over:Partial<WizardTouchContext>={}):WizardTouchContext=>({chapters,eventIds:new Set(['e1','e2']),narratives:new Map([['n1',{id:'n1',chapterIndex:0,eventIds:['e1']}],['n2',{id:'n2',chapterIndex:1,eventIds:['e1']}]]),...over})
const item=(touches:WizardForeshadowInput['touches']):WizardForeshadowInput[]=>[{id:'f1',title:'青铜钥匙',content:'钥匙的来历',touches}]
/** Project a plan onto a minimal planning document so the real validator judges it. */
function project(plan:ReturnType<typeof planForeshadowTouches>){
 const data=emptyPlanning()
 data.worlds.push(worldlineSchema.parse({id:'w',name:'主线'}));data.lines.push(lineSchema.parse({id:'l',name:'阅读线',primary:true}))
 for(const id of ['e1','e2'])data.events.push(eventSchema.parse({id,line:'w',title:id,materialRefs:plan.refs.filter(r=>r.target==='event'&&r.targetId===id).map(r=>({kind:'foreshadow',id:r.foreshadowId,role:r.role,note:r.note}))}))
 for(const [id,events] of [['n1',['e1']],['n2',['e1']]] as const)data.cards.push(cardSchema.parse({id,line:'l',title:id,tellings:[{id:id+'-t',refs:events.map(event=>({line:'w',event})),materialRefs:plan.refs.filter(r=>r.target==='telling'&&r.targetId===id).map(r=>({kind:'foreshadow',id:r.foreshadowId,role:r.role,note:r.note}))}]}))
 return validatePlanning(data)
}
test('NIW-U25: a plant linked to an event referenced by the telling is written on both',()=>{
 const plan=planForeshadowTouches(item([{kind:'PLANT',chapterIndex:0,summary:'沈砚拾到青铜钥匙',quote:'拾到一枚青铜钥匙',eventId:'e1',narrativeId:'n1'}]),ctx())
 assert.deepEqual(plan.refs.map(r=>[r.target,r.targetId,r.role]),[['event','e1','plant'],['telling','n1','plant']]);assert.deepEqual(plan.dropped,[])
 project(plan)
})
test('NIW-U26: telling plants without a matching event are dropped and planning stays valid',()=>{
 const notReferenced=planForeshadowTouches(item([{kind:'PLANT',chapterIndex:0,summary:'s',quote:'拾到一枚青铜钥匙',eventId:'e2',narrativeId:'n1'}]),ctx())
 assert.deepEqual(notReferenced.refs.map(r=>r.target),['event']);assert.match(notReferenced.dropped[0].reason,/讲述未引用对应世界事件/);project(notReferenced)
 const noEvent=planForeshadowTouches(item([{kind:'PLANT',chapterIndex:0,summary:'s',quote:'拾到一枚青铜钥匙',narrativeId:'n1'}]),ctx())
 assert.deepEqual(noEvent.refs,[]);assert.equal(noEvent.dropped.length,1);project(noEvent)
})
test('NIW-U27: unlocatable or out-of-range touches are dropped; unknown events are cleared',()=>{
 const plan=planForeshadowTouches(item([
  {kind:'MENTION',chapterIndex:0,summary:'s',quote:'不存在的句子'},
  {kind:'MENTION',chapterIndex:1,summary:'s',quote:'钥匙'},
  {kind:'MENTION',chapterIndex:99,summary:'s',quote:'钥匙'},
  {kind:'MENTION',chapterIndex:1,summary:'s',quote:'打开了地宫',eventId:'missing'},
 ]),ctx())
 assert.equal(plan.foreshadows[0].touches.length,1);assert.equal(plan.foreshadows[0].touches[0].eventId,undefined);assert.equal(plan.dropped.filter(d=>d.kind==='touch').length,3)
})
test('NIW-U28: notes fall back to the title and are capped at 500 characters',()=>{
 const empty=planForeshadowTouches(item([{kind:'MENTION',chapterIndex:0,summary:'',quote:'刻着蛇纹',eventId:'e1'}]),ctx());assert.equal(empty.refs[0].note,'青铜钥匙')
 const long=planForeshadowTouches(item([{kind:'MENTION',chapterIndex:0,summary:'长'.repeat(600),quote:'刻着蛇纹',eventId:'e1'}]),ctx());assert.equal(long.refs[0].note.length,500)
})
test('NIW-U29: each planning item keeps at most 40 material references',()=>{
 const touches=Array.from({length:5},()=>({kind:'MENTION' as const,chapterIndex:0,summary:'s',quote:'刻着蛇纹',eventId:'e1'}))
 const plan=planForeshadowTouches(item(touches),ctx({existingRefs:new Map([['e1',38]])}))
 assert.equal(plan.refs.length,2);assert.equal(plan.dropped.filter(d=>d.kind==='materialRef').length,3)
})
test('NIW-U30: status follows the kept touches',()=>{
 const s=(touches:WizardForeshadowInput['touches'])=>planForeshadowTouches(item(touches),ctx()).foreshadows[0].status
 assert.equal(s([{kind:'PLANT',chapterIndex:0,summary:'',quote:'刻着蛇纹'},{kind:'PAYOFF',chapterIndex:1,summary:'',quote:'打开了地宫'}]),'RESOLVED')
 assert.equal(s([{kind:'PLANT',chapterIndex:0,summary:'',quote:'刻着蛇纹'},{kind:'MENTION',chapterIndex:1,summary:'',quote:'提起钥匙的来历'}]),'PLANTED')
 assert.equal(s([{kind:'PLANT',chapterIndex:0,summary:'',quote:'不存在'}]),'PLANNED')
})
test('NIW-U32: outline references quote the summary only when it is locatable',()=>{
 const plan=planForeshadowTouches(item([{kind:'PLANT',chapterIndex:0,summary:'沈砚拾到青铜钥匙',quote:'刻着蛇纹'},{kind:'MENTION',chapterIndex:1,summary:'不在细纲里',quote:'提起钥匙的来历'}]),ctx())
 assert.deepEqual(plan.foreshadows[0].touches.map(t=>t.outline.quote),['沈砚拾到青铜钥匙',null])
})
test('NIW-U26b: control — a telling plant without the event plant is rejected by validatePlanning',()=>{
 assert.throws(()=>project({foreshadows:[],dropped:[],refs:[{target:'telling',targetId:'n1',foreshadowId:'f1',role:'plant',note:'n'}]}),/首次埋入伏笔未关联/)
})

import {splitWizardSourceBlocks,splitWizardSourceWorlds,wizardSourceSettingType} from '../../desktop/core/novel-import-wizard'
import {validateImportSemanticArtifact} from '../../desktop/core/novel-import-semantics'
import {importNativeMappings} from '../../desktop/core/novel-import-semantic-state'
test('NIW-U14: copy-only rosters split source documents on headings',()=>{
 const scenes=splitWizardSourceBlocks('前言\n## 北城\n北城在河北岸。\n## 南巷\n南巷狭窄。\n','场景.md')
 assert.deepEqual(scenes.map(b=>b.name),['北城','南巷']);assert.equal(scenes.map(b=>b.text).join(''),'前言\n## 北城\n北城在河北岸。\n## 南巷\n南巷狭窄。\n')
 assert.deepEqual(splitWizardSourceBlocks('只有一段说明。','物品.md').map(b=>b.name),['物品.md'])
 const worlds=splitWizardSourceWorlds('## 社会制度\n三省六部。\n## 风俗\n上元灯会。\n','世界观.md')
 assert.equal(worlds.length,1);assert.equal(worlds[0].world.name,'世界');assert.deepEqual(worlds[0].settings.map(s=>[s.name,s.settingType]),[['社会制度','SOCIETY'],['风俗','CULTURE']])
 const nested=splitWizardSourceWorlds('# 人间\n## 地理\n九州。\n# 冥界\n## 历史\n三劫。\n','世界观.md')
 assert.deepEqual(nested.map(w=>[w.world.name,w.settings.map(s=>s.settingType)]),[['人间',['GEOGRAPHY']],['冥界',['WORLD_HISTORY']]])
})
test('NIW-U15: source setting titles map only to text-shaped types',()=>{
 const expected:[string,string][]=[['社会制度','SOCIETY'],['风俗','CULTURE'],['宗教','CULTURE'],['人文环境','CULTURE'],['地理','GEOGRAPHY'],['地域','GEOGRAPHY'],['历史','WORLD_HISTORY'],['等级体系','SOCIETY'],['力量体系','SOCIETY'],['势力','SOCIETY'],['概念','SOCIETY'],['地图','SOCIETY'],['其他','SOCIETY']]
 for(const [title,type] of expected)assert.equal(wizardSourceSettingType(title),type,title)
})
test('NIW-U16: copied source settings are natively projectable and keep the original text',()=>{
 const [world]=splitWizardSourceWorlds('## 社会制度\n三省六部。\n## 风俗\n上元灯会。\n','世界观.md')
 const unit='u1',evidence=[{unitId:unit,quote:'三省六部'}]
 const artifacts=[{id:world.world.id,kind:'world' as const,name:world.world.name,text:'',facts:{entityType:'WORLD'},evidence,sourceUnitIds:[unit],origin:'source' as const},...world.settings.map(s=>({id:s.id,kind:'world' as const,name:s.name,text:s.text,facts:{entityType:'SETTING',worldId:world.world.id,settingType:s.settingType},evidence,sourceUnitIds:[unit],origin:'source' as const}))]
 for(const a of artifacts.slice(1)){const v=validateImportSemanticArtifact(a,'source-copy');assert.ok(v.native&&v.native.kind==='world'&&v.native.entityType==='SETTING');assert.deepEqual((v.native as {content:unknown}).content,{text:a.text})}
 const mapping=importNativeMappings(artifacts);for(const a of artifacts.slice(1))assert.ok(mapping.projectable.has(a.id),a.name)
})

import {readFileSync} from 'node:fs'
import {importScopeHash,importPlanHash,wizardSelectionHash,toImportView} from '../../desktop/core/novel-import'
import {emptyWizardState,validateImportWizardState,ImportWizardStateError,importWizardStateSchema,type ImportWizardState} from '../../desktop/core/novel-import-wizard-state'
import type {ImportSession} from '../../desktop/shared/novel-import'
const legacy=JSON.parse(readFileSync('tests/fixtures/novel-import-wizard/legacy-hash.json','utf8')) as {session:ImportSession;classify:string;analyze:string;plan:string}
function wizardSession(change:(w:ImportWizardState)=>void=()=>{}):ImportSession{
 const s=structuredClone(legacy.session),w=emptyWizardState()
 w.structure=[{start:0,end:s.workingProse.length,title:'第一章 起'}];w.structureHash='a'.repeat(64);w.chapterSelection=[0];w.grantedChapters=[0];w.materializedVolumes=[{start:0}]
 w.candidates.character=[{id:wizardCandidateId('character','沈砚'),kind:'character',name:'沈砚',aliases:[],roleType:'PROTAGONIST',chapterCount:1,sources:['body'],sourceArtifactIds:[],selected:true},{id:wizardCandidateId('character','林舟'),kind:'character',name:'林舟',aliases:[],roleType:'SUPPORTING',chapterCount:1,sources:['body'],sourceArtifactIds:[],selected:true}]
 change(w);return {...s,wizardVersion:1,wizard:w}
}
test('NIW-U33: candidate choices change the selection hash, not the send scope',()=>{
 const a=wizardSession(),b=wizardSession(w=>{w.candidates.character![1].selected=false}),c=wizardSession(w=>{w.grantedChapters=[];w.chapterSelection=[]})
 assert.equal(importScopeHash(a,'analyze'),importScopeHash(b,'analyze'));assert.notEqual(wizardSelectionHash(a),wizardSelectionHash(b))
 assert.notEqual(importScopeHash(a,'analyze'),importScopeHash(c,'analyze'))
})
test('NIW-U34: the plan hash binds candidate choices, image options and image results',()=>{
 const base=importPlanHash(wizardSession())
 assert.notEqual(importPlanHash(wizardSession(w=>{w.candidates.character![0].selected=false})),base)
 assert.notEqual(importPlanHash(wizardSession(w=>{w.images.avatar=true})),base)
 const withImage=(sha:string)=>importPlanHash(wizardSession(w=>{w.tasks=[{id:'e-0000000000000000',kind:'entity',state:'done',attempts:1},{id:'i-0000000000000000-avatar',kind:'image',imageKind:'avatar',dependsOn:'e-0000000000000000',state:'done',attempts:1,resultSha256:sha}]}))
 assert.notEqual(withImage('a'.repeat(64)),withImage('b'.repeat(64)))
})
test('NIW-U35: legacy sessions keep their exact scope and plan hashes',()=>{
 assert.equal(importScopeHash(legacy.session,'classify'),legacy.classify);assert.equal(importScopeHash(legacy.session,'analyze'),legacy.analyze);assert.equal(importPlanHash(legacy.session),legacy.plan)
})
test('NIW-U36: wizard journal state is validated strictly',()=>{
 validateImportWizardState(wizardSession());validateImportWizardState(legacy.session)
 const bad:[string,ImportSession][]=[
  ['wizard on legacy',{...legacy.session,wizard:emptyWizardState()}],
  ['selection beyond grant',wizardSession(w=>{w.structure!.push({start:0,end:1,title:'第二章'});w.chapterSelection=[0,1];w.materializedVolumes=[{start:0},{start:1}]})],
  ['bad candidate id',wizardSession(w=>{w.candidates.character![0].id='沈砚'})],
  ['dangling dependency',wizardSession(w=>{w.tasks=[{id:'i-1',kind:'image',dependsOn:'e-missing',state:'waiting',attempts:0}]})],
  ['too many tasks',wizardSession(w=>{w.tasks=Array.from({length:20001},(_,i)=>({id:'e-'+i,kind:'entity' as const,state:'waiting' as const,attempts:0}))})],
  ['unknown step',wizardSession(w=>{(w as {step:string}).step='confirm'})],
 ]
 for(const [label,s] of bad)assert.throws(()=>validateImportWizardState(s),ImportWizardStateError,label)
})

test('NIW-U36b: roster repair audits are strict and legacy dropped records remain valid',()=>{
 const base=wizardSession().wizard!
 assert.equal(importWizardStateSchema.safeParse({...base,dropped:[{kind:'touch',label:'伏笔',reason:'原记录'}]}).success,true)
 const valid={kind:'roster',rosterKind:'character',label:'角色识别',reason:'部分结果未采用',invalid:0,unlocatable:1,unfinishedUnits:2}
 assert.equal(importWizardStateSchema.safeParse({...base,dropped:[valid]}).success,true)
 const invalid=[{...valid,rosterKind:undefined},{...valid,kind:'settings'},{...valid,invalid:-1},{...valid,unlocatable:0.5},{...valid,unfinishedUnits:'2'},{kind:'touch',label:'伏笔',reason:'旧记录',rosterKind:'character'}]
 for(const dropped of invalid)assert.equal(importWizardStateSchema.safeParse({...base,dropped:[dropped]}).success,false,JSON.stringify(dropped))
})
test('NIW-U36c: rosterIncomplete derives only current ordinary waiting inference gaps without mutating the session',()=>{
 const s=wizardSession(w=>{w.step='detect-char';w.stepState['detect-char']='waiting'});s.workingProse=s.originalProse='甲乙丙丁戊己庚辛壬癸';s.workingUnits=[0,1].map(i=>({id:`working-0:${i*5}:${i*5+5}`,fileId:'working-0',start:i*5,end:i*5+5,text:s.workingProse.slice(i*5,i*5+5),kind:'body' as const}));s.coverage['roster:character']=['working-0:0:5','stale']
 const before=structuredClone(s);assert.equal(toImportView(s).wizard!.rosterIncomplete,1);assert.deepEqual(s,before);assert.equal(Object.hasOwn(s.wizard!,'rosterIncomplete'),false)
 for(const state of ['running','failed'] as const){s.wizard!.stepState['detect-char']=state;assert.equal(toImportView(s).wizard!.rosterIncomplete,undefined,state)}
 s.wizard!.stepState['detect-char']='waiting';s.coverage['roster:character']=s.workingUnits.map(u=>u.id);assert.equal(toImportView(s).wizard!.rosterIncomplete??0,0)
 s.wizard!.step='detect-scene';s.wizard!.stepState['detect-scene']='waiting';s.targets=['scene'];s.coverage['roster:scene']=[];assert.equal(toImportView(s).wizard!.rosterIncomplete,undefined)
})

import {importArtifactSemanticHash} from '../../desktop/core/novel-import-semantics'
import type {ImportArtifact} from '../../desktop/shared/novel-import'
const ev=[{unitId:'u1',quote:'沈砚推开门'}]
const character=(facts:Record<string,string>,schema?:2):ImportArtifact=>({id:'c-0000000000000001',kind:'character',name:'沈砚',text:'渡口少年。',facts:{roleType:'PROTAGONIST',...facts},evidence:ev,sourceUnitIds:['u1'],origin:'inferred',...(schema?{schema}:{})})
const v2Facts={height:'178cm',weight:'60kg',build:'瘦削',faceShape:'长脸',tastes:'喜茶',habits:'思考时捏袖口',dialogueStyle:'短句',sampleDialogue:'走吧。',personalityTags:'["沉稳","护短"]',motivations:'[{"items":[{"text":"找回父亲","importance":5}]}]',desires:'安稳',fears:'失去同伴',beliefs:'{"values":"守诺"}',bigFive:'{"openness":60,"neuroticism":30}',abilities:'辨识古物',backstory:'渡口长大',arcStages:'[{"id":"s1","name":"出走","chapterIndex":0,"description":"离开渡口","isDebut":true}]'}
test('NIW-U20: v2 characters decode every panel field strictly',()=>{
 const v=validateImportSemanticArtifact(character(v2Facts,2))
 assert.equal(v.profile?.kind,'character');const p=v.profile!.value as import('../../desktop/core/novel-import-semantics').ImportCharacterProfile
 assert.equal(p.height,'178cm');assert.equal(p.sampleDialogue,'走吧。');assert.deepEqual(p.personalityTags,['沉稳','护短']);assert.deepEqual(p.motivations,[{items:[{text:'找回父亲',importance:5}]}])
 assert.deepEqual(p.beliefs,{values:'守诺'});assert.deepEqual(p.bigFive,{openness:60,neuroticism:30});assert.equal(p.abilities,'辨识古物');assert.equal(p.backstory,'渡口长大')
 assert.deepEqual(p.arcStages,[{id:'s1',name:'出走',chapterIndex:0,description:'离开渡口',tags:[],markers:[],changes:[],isDebut:true}])
})
test('NIW-U21: invalid v2 structured fields fail with the field name',()=>{
 const cases:[Record<string,string>,RegExp][]=[[{motivations:'不是JSON'},/motivations/],[{bigFive:'{"openness":120}'},/bigFive/],[{arcStages:JSON.stringify(Array.from({length:51},(_,i)=>({id:'s'+i,name:'阶段'})))},/arcStages/],[{zodiac:'子'},/未支持的业务字段/]]
 for(const [facts,pattern] of cases)assert.throws(()=>validateImportSemanticArtifact(character(facts,2)),pattern)
})
test('NIW-U22: legacy artifacts keep the v1 field table and hash',()=>{
 assert.throws(()=>validateImportSemanticArtifact(character({height:'178cm'})),/未支持的业务字段/)
 const plain=character({});assert.equal(validateImportSemanticArtifact(plain).profile,undefined)
 assert.equal(importArtifactSemanticHash(plain),importArtifactSemanticHash(JSON.parse(JSON.stringify(plain))))
 assert.throws(()=>validateImportSemanticArtifact({...plain,schema:3 as 2}),/结构版本无效/)
})
test('NIW-U24: v2 item aliases and tags are capped to panel limits',()=>{
 const item:ImportArtifact={id:'i-0000000000000001',kind:'item',name:'青铜钥匙',text:'一枚钥匙。',facts:{aliases:JSON.stringify(['长'.repeat(60),...Array.from({length:11},(_,i)=>'别名'+i)]),tags:JSON.stringify(['长'.repeat(25),...Array.from({length:9},(_,i)=>'标签'+i)])},evidence:ev,sourceUnitIds:['u1'],origin:'inferred',schema:2}
 const p=validateImportSemanticArtifact(item).profile!.value as import('../../desktop/core/novel-import-semantics').ImportItemProfile
 assert.equal(p.aliases.length,10);assert.equal([...p.aliases[0]].length,50);assert.equal(p.tags.length,8);assert.equal([...p.tags[0]].length,20)
})

import {wizardTaskBarText,wizardImportButton,wizardAnalyzeButton,wizardCandidateMatches,wizardVolumeToggle,wizardProgressText,wizardImageEstimate} from '../../src/lib/desktop/novel-import-wizard'
const noImages={avatar:false,portrait:false,exterior:false,interior:false,icon:false}
test('NIW-U37: staged image estimate enforces the 200 MiB session limit',()=>{
 assert.equal(wizardImageEstimate({character:30},{...noImages,avatar:true,portrait:true}).allowed,true)
 assert.equal(wizardImageEstimate({scene:50},{...noImages,exterior:true,interior:true}).allowed,false)
 assert.equal(wizardImageEstimate({character:500},noImages).bytes,0)
})
test('NIW-U38: task bar text names the step and waiting or paused state',()=>{
 assert.equal(wizardTaskBarText({step:'import-char',title:'作品甲',waiting:false,paused:false}),'导入作品 · 第 10 步 导入角色 · 作品甲')
 assert.equal(wizardTaskBarText({step:'detect-char',title:'作品甲',waiting:true,paused:false}),'导入作品 · 第 9 步 识别角色 · 等待确认 · 作品甲')
 assert.equal(wizardTaskBarText({step:'import-char',title:'作品甲',waiting:false,paused:true}),'导入作品 · 第 10 步 导入角色 · 已暂停 · 作品甲')
})
test('NIW-U39: primary button text follows selection and image options',()=>{
 assert.equal(wizardImportButton('character',9,['avatar','portrait']),'导入 9 个角色并生成头像与立绘')
 assert.equal(wizardImportButton('character',0,['avatar']),'跳过')
 assert.equal(wizardImportButton('scene',7,['exterior','avatar']),'导入 7 个场景并生成外景图')
 assert.equal(wizardImportButton('world',5,[]),'导入 5 项世界观')
 assert.equal(wizardAnalyzeButton(true),'允许分析并导入');assert.equal(wizardAnalyzeButton(false),'开始导入')
})
test('NIW-U40: search matches aliases and volume toggles only matched chapters',()=>{
 assert.equal(wizardCandidateMatches({name:'林舟',aliases:['舟哥']},'舟哥'),true);assert.equal(wizardCandidateMatches({name:'林舟',aliases:[]},'沈'),false)
 const chapters=[{title:'第一章 再起'},{title:'第二章 再承'},{title:'第三章 终'}]
 assert.deepEqual(wizardVolumeToggle(chapters,'再').map(c=>c.title),['第一章 再起','第二章 再承']);assert.equal(wizardVolumeToggle(chapters,'').length,3)
})
test('NIW-U41: progress summary counts entities, images, failures and skips',()=>{
 const tasks=[...Array.from({length:4},()=>({kind:'entity' as const,state:'done' as const})),{kind:'entity' as const,state:'failed' as const},...Array.from({length:4},()=>({kind:'entity' as const,state:'waiting' as const})),{kind:'image' as const,imageKind:'avatar' as const,state:'done' as const},{kind:'image' as const,imageKind:'avatar' as const,state:'done' as const}]
 assert.equal(wizardProgressText(tasks,{paused:false,entities:9}),'已完成 4 / 9 · 头像 2 / 9 · 1 项失败')
 assert.equal(wizardProgressText(tasks,{paused:true,entities:9}).startsWith('已暂停 · '),true)
})

import {NovelImportController} from '../../desktop/main/novel-import'
test('NIW-U42: image error codes have Chinese messages',()=>{
 const c=new NovelImportController({root:'/nonexistent'} as never)
 for(const [code,text] of [['IMAGE_RESPONSE_INVALID','图像模型返回的图片无效，请重试'],['IMAGE_TIMEOUT','图像生成超时，请重试'],['AUTHORIZATION_REVOKED','图像模型授权已变化，请重新允许'],['缺少外观描述','缺少外观描述']])assert.equal(c.safeError(Error(code)),text)
 assert.equal(c.safeError(Error('/Users/someone/secret path')),'导入处理失败，请核对来源、模型配置后重试')
})
import {patchWizardChapters,assertWizardSessionChapters} from '../../desktop/core/novel-import-wizard'
test('NIW-U45/F2: body patches shift chapters and volume starts; a patch across chapters is refused',()=>{
 const {text,structure}=fixtureStructure(),selection=[0,1,2,3,4],m=materializeWizardChapters(text,structure,selection)
 const at=m.chapters[2].content.indexOf('转的正文')+m.chapters[2].start
 const p=patchWizardChapters(m.prose,m.chapters,[{start:at,end:at+1,after:'转折转折'}])
 assert.equal(p.chapters[2].end-p.chapters[2].start,m.chapters[2].end-m.chapters[2].start+3)
 assert.equal(p.chapters[3].start,m.chapters[3].start+3);assert.deepEqual(p.chapters.map(c=>c.volume),m.chapters.map(c=>c.volume))
 for(const c of p.chapters)assert.equal(c.content,p.prose.slice(c.start,c.end))
 assertWizardSessionChapters({originalProse:m.prose,workingRevision:1,chapters:p.chapters},text,structure,selection)
 const edge=m.chapters[3].start
 assert.throws(()=>patchWizardChapters(m.prose,m.chapters,[{start:edge-2,end:edge+2,after:'x'}]),/跨越章节/)
})
import {randomUUID} from 'node:crypto'
import {encodeWizardRuntime,parseWizardRuntime,trimWizardRuntimeCalls} from '../../desktop/core/novel-import-wizard-runtime'
import {importRuntimePauseProofSchema} from '../../desktop/core/novel-import-runtime-proof'
const runtimeCall=(sessionId:string,processRunId:string,state:'pending'|'settled'='pending')=>({version:1 as const,processRunId,sessionId,operationId:randomUUID(),epoch:1,phase:'analyze' as const,intent:'entity' as const,kind:'character' as const,workingRevision:0,scopeHash:'a'.repeat(64),payloadHash:'b'.repeat(64),startedAt:new Date().toISOString(),...(state==='settled'?{state,outcome:'fulfilled' as const,settledObservedAt:new Date().toISOString()}:{state})})
test('NIW-U43: an old pause proof without imageOperations still parses',()=>{
 const sessionId=randomUUID(),processRunId=randomUUID(),at=new Date().toISOString()
 const proof={version:1,processRunId,sessionId,oldEpoch:1,newEpoch:2,capturedAt:at,barrierAt:at,state:'missed',calls:[],remaining:{pendingCalls:0,operations:0,workflowJobs:0,pdfActive:0,pdfRequests:0}}
 assert.ok(importRuntimePauseProofSchema.safeParse(proof).success)
 assert.ok(importRuntimePauseProofSchema.safeParse({...proof,remaining:{...proof.remaining,imageOperations:0}}).success)
})
test('NIW-U44: runtime.json holds at most 64 calls and 64 KiB',()=>{
 const sessionId=randomUUID(),processRunId=randomUUID(),file=(n:number)=>({version:1 as const,sessionId,processRunId,updatedAt:new Date().toISOString(),calls:Array.from({length:n},()=>runtimeCall(sessionId,processRunId))})
 const text=encodeWizardRuntime(file(64));assert.equal(parseWizardRuntime(sessionId,text)!.calls.length,64)
 assert.throws(()=>encodeWizardRuntime(file(65)));assert.equal(parseWizardRuntime(randomUUID(),text),null)
 assert.equal(parseWizardRuntime(sessionId,JSON.stringify(file(64)).padEnd(65537,' ')),null)
 const mixed=[...Array.from({length:40},()=>runtimeCall(sessionId,processRunId,'settled')),...Array.from({length:30},()=>runtimeCall(sessionId,processRunId))]
 const kept=trimWizardRuntimeCalls(mixed);assert.equal(kept.length,64);assert.equal(kept.filter(c=>c.state==='pending').length,30)
})
