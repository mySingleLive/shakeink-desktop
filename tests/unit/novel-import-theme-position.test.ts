import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,repairSettingsReply,runImportAi,IMPORT_THEME_PROFILE_GUIDANCE} from '../../desktop/service/novel-import-ai'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import {IMPORT_THEME_PROFILE_ID,IMPORT_THEME_PROFILE_NAME,importThemeSynopsisFallback,validateImportSemanticArtifact} from '../../desktop/core/novel-import-semantics'
import type {ImportAiRequest,ImportArtifact,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {parseJsonOutput} from '../../src/lib/ai/generate'
import {model,review} from '../helpers/novel-import-wizard-fixture'

/* docs/545–546 TP cases. Synthetic text and names only. */
const unit={id:'u1',fileId:'f',kind:'body',start:0,end:30,text:'沈砚在合成渡口旁停步，风声很大。他想起旧城的钟声。'} as ImportUnit
const facts=(over:Record<string,string|undefined>={})=>Object.fromEntries(Object.entries({channel:'男频',genre:'玄幻',tags:JSON.stringify(['异世大陆']),sellingPoints:'序列晋升与神秘学体系',targetAudience:'喜欢悬疑升级的读者',synopsis:'蒸汽与神秘并存的合成城邦。\n少年沈砚是渡口学徒。\n他在钟声里醒来，卷入一桩失踪案。',...over}).filter((e):e is [string,string]=>e[1]!==undefined))
const wire=(f:Record<string,string>=facts())=>({id:IMPORT_THEME_PROFILE_ID,kind:'theme',name:IMPORT_THEME_PROFILE_NAME,text:'主角男性；主线晋升；架空蒸汽世界。',facts:f,evidence:[{unitId:'u1',quote:'沈砚在合成渡口旁停步'}],sourceUnitIds:['u1'],origin:'inferred'})
const request=(over:Partial<ImportAiRequest>={}):ImportAiRequest=>({semanticVersion:1,phase:'analyze',kind:'theme',units:[unit],artifacts:[],operationId:'op',models:{text:model,review},workingRevision:0,selectedTargets:['theme'],executionLane:'wizard-settings-v1',themeProfile:true,chapters:[],entities:[],...over})
const parse=<T,>(text:string,schema:Parameters<typeof parseJsonOutput<T>>[1])=>parseJsonOutput(text,schema)
const repaired=(f:Record<string,string>,r=request())=>{const out=repairSettingsReply(r,JSON.stringify({artifacts:[wire(f)]}),parse);return out?{facts:JSON.parse(out.text).artifacts[0].facts as Record<string,string>,counts:out.counts}:undefined}
/** The real generation bridge with injected replies, one per generation (as SP tests). */
async function run(r:ImportAiRequest,replies:unknown[]){
 const prompts:string[]=[];let n=0
 const deps={resolve:async()=>r.models.text,assert:async()=>{},generate:async(input:never,_m:never,signal:AbortSignal,prompt:string)=>generateImportAiJson(input,{userId:'tp-synthetic-user',resolvedModel:{} as ResolvedModel,maxNetworkRetries:0},signal,prompt,{generateText:async(options:{prompt?:string})=>{prompts.push(String(options?.prompt??''));const reply=replies[Math.min(n++,replies.length-1)];return {text:typeof reply==='string'?reply:JSON.stringify(reply),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}} as never)}
 try{return {result:await runImportAi(r,new AbortController().signal,deps as never),generations:n,prompts}}catch(error){return {error:error as Error,generations:n,prompts}}
}

test('TP-01/02: the position contract defines channels and genres, forbids 不限/全部 and limits the synopsis to world, lead and opening',()=>{
 const p=importAiPrompt(request()),plain=importAiPrompt(request({themeProfile:undefined}))
 for(const text of ['男频','女频','玄幻','奇幻','悬疑','世界观','主角','开篇','15','300'])assert.ok(p.includes(text),text)
 assert.ok(/不得为"不限"|不能是"不限"|不得用"不限"/u.test(p),'不限 forbidden');assert.ok(/不得为"全部"|不能是"全部"|不得用"全部"/u.test(p),'全部 forbidden')
 assert.ok(!p.includes('无法判断时用"不限"')&&!p.includes('无法判断时用"全部"'))
 assert.ok(/不写中段|不写.*后续/u.test(p))
 assert.ok(!plain.includes('<theme-profile-contract>'))
})
test('TP-03: the correction guidance requires channel, genre and the three texts',()=>{
 assert.ok(!/不限|全部|省略/u.test(IMPORT_THEME_PROFILE_GUIDANCE),IMPORT_THEME_PROFILE_GUIDANCE)
 for(const text of ['男频','女频','必填'])assert.ok(IMPORT_THEME_PROFILE_GUIDANCE.includes(text),text)
})

test('TP-10: 不限 with a genre of one channel becomes that channel and passes in one generation',async()=>{
 const r=repaired(facts({channel:'不限'}))!;assert.equal(r.facts.channel,'男频');assert.equal(r.facts.genre,'玄幻');assert.ok((r.counts?.clearedPosition??0)>=1)
 const m=repaired(facts({channel:undefined,genre:'古风言情',tags:'[]'}))!;assert.equal(m.facts.channel,'女频')
 const out=await run(request(),[{artifacts:[wire(facts({channel:'不限'}))]}]);assert.ifError(out.error);assert.equal(out.generations,1);assert.equal(out.result!.artifacts![0].facts.channel,'男频')
})
test('TP-11: a genre of both channels does not guess a channel; the item is kept and the correction names the channel',async()=>{
 const r=repaired(facts({channel:undefined,genre:'现实',tags:'[]'}))!;assert.equal(r.facts.channel,undefined);assert.equal(r.facts.genre,'现实','genre is not cleared');assert.equal(r.facts.sellingPoints,'序列晋升与神秘学体系')
 const out=await run(request(),[{artifacts:[wire(facts({channel:undefined,genre:'现实',tags:'[]'}))]},{artifacts:[wire(facts({genre:'现实',tags:'[]'}))]}])
 assert.ifError(out.error);assert.equal(out.generations,2);assert.ok(/主题定位缺少[^。]*频道/u.test(out.prompts[1]),'feedback names the channel')
})
test('TP-12/13: a missing genre or empty texts start a correction that names them',async()=>{
 for(const [over,word] of [[{genre:'全部',tags:'[]'},'题材'],[{genre:undefined,tags:'[]'},'题材'],[{sellingPoints:' '},'卖点'],[{targetAudience:''},'受众'],[{synopsis:undefined},'简介']] as const){
  const out=await run(request(),[{artifacts:[wire(facts(over as Record<string,string|undefined>))]},{artifacts:[wire()]}])
  assert.ifError(out.error);assert.equal(out.generations,2,word);assert.ok(new RegExp('主题定位缺少[^。]*'+word,'u').test(out.prompts[1]),word)
 }
 const kept=repaired(facts({genre:'全部',tags:'[]'}))!;assert.equal(kept.facts.channel,'男频','channel stays when only the genre is missing')
})
test('TP-14/15: an over-long synopsis is cut at a sentence end within 15 lines and 300 characters',()=>{
 const lines=Array.from({length:20},(_,i)=>'第'+i+'行写世界与主角。').join('\n'),r=repaired(facts({synopsis:lines}))!
 const kept=r.facts.synopsis.split('\n').filter(l=>l.trim());assert.ok(kept.length<=15);assert.ok(r.facts.synopsis.endsWith('。'));assert.ok((r.counts?.clearedPosition??0)>=1)
 const long='甲'.repeat(200)+'。'+'乙'.repeat(150)+'。',c=repaired(facts({synopsis:long}))!;assert.equal(c.facts.synopsis,'甲'.repeat(200)+'。')
})
test('TP-16: a saved position with a 450-character synopsis still decodes',()=>{
 const a:ImportArtifact={...wire(facts({synopsis:'简'.repeat(450)})),origin:'inferred',schema:2} as ImportArtifact
 assert.equal(validateImportSemanticArtifact(a).profile?.kind,'theme')
})
test('TP-17: a complete reply passes in one generation',async()=>{
 const out=await run(request(),[{artifacts:[wire()]}]);assert.ifError(out.error);assert.equal(out.generations,1);assert.equal(out.result!.artifacts![0].facts.genre,'玄幻')
})
test('TP-19: an off-genre known tag is dropped while genre and channel stay',()=>{
 const r=repaired(facts({tags:JSON.stringify(['异世大陆','西方奇幻'])}))!;assert.deepEqual(JSON.parse(r.facts.tags),['异世大陆']);assert.equal(r.facts.genre,'玄幻');assert.equal(r.facts.channel,'男频')
})
test('TP-19b: plain theme batches get no completeness check',async()=>{
 const plain={id:'t1',kind:'theme',name:'成长',text:'少年成长。',facts:{},evidence:[{unitId:'u1',quote:'沈砚在合成渡口旁停步'}],sourceUnitIds:['u1'],origin:'inferred'}
 const out=await run(request({themeProfile:undefined}),[{artifacts:[plain]}]);assert.ifError(out.error);assert.equal(out.generations,1)
})
test('TP-24: two context themes with one id and different names make the link check reject a valid position (root cause)',async()=>{
 const t=(name:string):ImportArtifact=>({id:'theme-1',kind:'theme',name,text:'主题。',facts:{},evidence:[{unitId:'u1',quote:'沈砚在合成渡口旁停步'}],sourceUnitIds:['u1'],origin:'inferred'})
 const out=await run(request({artifacts:[t('甲'),t('乙')]}),[{artifacts:[wire()]}])
 assert.match(String(out.error?.message),/模型实体标识|结构不完整/u)
})
test('TP-34: the synopsis fallback keeps whole sentences within 15 lines and 300 characters',()=>{
 assert.equal(importThemeSynopsisFallback(''),'');assert.equal(importThemeSynopsisFallback('短简介。'),'短简介。')
 const many=Array.from({length:30},(_,i)=>'第'+i+'段。').join('\n\n'),f=importThemeSynopsisFallback(many);assert.ok(f.split('\n').filter(l=>l.trim()).length<=15);assert.ok(f.endsWith('。'))
 const noStop='无'.repeat(400),g=importThemeSynopsisFallback(noStop);assert.equal(Array.from(g).length,300)
 const emoji='😀'.repeat(400),h=importThemeSynopsisFallback(emoji);assert.equal(Array.from(h).length,300);assert.ok(h.isWellFormed())
})

/* TP-20..28: the position request inside the wizard theme task (fixture engine). */
import {legacySceneFixture,fixture,source,filesF,rosterAi,worldsAi,toImportChar,toWorldImport,type Ai} from '../helpers/novel-import-wizard-fixture'
import {localThemeChannel} from '../../desktop/main/novel-import'
type Mode={position?:'ok'|'fail'|((n:number)=>'ok'|'fail');sameIds?:boolean}
const themeAi=(base:Ai,mode:Mode):Ai=>{let calls=0,batch=0;return async r=>{
 if(r.phase==='analyze'&&!r.intent&&r.kind==='theme'){
  const u=r.units[0]
  if(r.themeProfile){const n=++calls,m=typeof mode.position==='function'?mode.position(n):mode.position??'ok';if(m==='fail')throw Error('模型返回结构不完整（facts）')
   return {artifacts:[{id:IMPORT_THEME_PROFILE_ID,kind:'theme',name:IMPORT_THEME_PROFILE_NAME,text:'线索',facts:{channel:'男频',genre:'历史',tags:JSON.stringify(['古代']),sellingPoints:'渡口少年的成长',targetAudience:'喜欢古风成长的读者',synopsis:'古代渡口。\n少年沈砚。\n钥匙引出故事。'},evidence:[{unitId:u.id,quote:u.text.slice(0,8)}],sourceUnitIds:[u.id],origin:'inferred'}]}}
  const k=++batch;return {artifacts:[{id:mode.sameIds?'theme-1':'theme-'+u.id,kind:'theme',name:'成长'+k,text:'少年在渡口成长。',facts:{},evidence:[{unitId:u.id,quote:u.text.slice(0,8)}],sourceUnitIds:[u.id],origin:'inferred'}]}
 }
 return base(r)
}}
const runSettings=async(mode:Mode)=>{
 const f=await legacySceneFixture(filesF(),rosterAi());f.setAi(themeAi(worldsAi(f.handler()),mode))
 await toImportChar(f);await toWorldImport(f)
 await f.act('wizard-next');const v=await f.settle();return {f,v}
}
const positions=(f:{requests:ImportAiRequest[]})=>f.requests.filter(r=>r.themeProfile)

test('TP-20: the position sample starts with the first working unit, in book order, and covers every context quote',async()=>{
 const {f,v}=await runSettings({});try{
  assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'done')
  const [p]=positions(f),j=await f.journal(),first=j.workingUnits?.[0]??j.units.find(u=>u.kind==='body')!
  assert.equal(p.units[0].id,first.id);const order=p.units.map(u=>u.start);assert.deepEqual(order,[...order].sort((a,b)=>a-b))
  assert.ok(p.artifacts.every(a=>a.evidence.every(e=>p.units.some(u=>u.id===e.unitId))))
 }finally{await f.dispose()}
})
test('TP-21/26: three failures — the third is lean — then a channel-only fallback position from the body',async()=>{
 const {f,v}=await runSettings({position:'fail'});try{
  const ps=positions(f);assert.equal(ps.length,3);assert.equal(ps[2].artifacts.length,0);assert.ok(ps[2].units.length<=3)
  assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'done')
  const j=await f.journal(),p=j.artifacts.find(a=>a.id===IMPORT_THEME_PROFILE_ID)
  // The synthetic body has no 她 and several 他-free lines; the result depends on counts, so both outcomes are checked against localThemeChannel.
  const expected=localThemeChannel(j,j.workingUnits??[])
  assert.equal(p?.facts.channel,expected?.facts.channel);assert.equal(p?.facts.genre,undefined)
  const note=v.wizard!.dropped.find(d=>d.kind==='settings'&&d.label==='主题定位')!;assert.ok(note)
  assert.equal(note.reason.includes('频道已按正文推断'),!!expected)
 }finally{await f.dispose()}
})
test('TP-22: failing twice then succeeding adopts the position without a note',async()=>{
 const {f,v}=await runSettings({position:n=>n<3?'fail':'ok'});try{
  assert.equal(positions(f).length,3);const j=await f.journal();assert.equal(j.artifacts.find(a=>a.id===IMPORT_THEME_PROFILE_ID)?.facts.genre,'历史')
  assert.ok(!v.wizard!.dropped.some(d=>d.kind==='settings'&&d.label==='主题定位'))
 }finally{await f.dispose()}
})
test('TP-25: batches that reuse one id give a position context with unique ids, and the position is adopted',async()=>{
 // Theme-only wizard over a longer body with a 3000-character budget, so several batches all return id theme-1.
 const body=Array.from({length:12},(_,i)=>`第${i+1}章 篇${i}\n\n沈砚在渡口听见钟声。${'风声。'.repeat(160)}\n\n`).join('')
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi());f.setAi(themeAi(f.handler(),{sameIds:true}))
 const c=f.controller as unknown as {executionBudget:(...a:unknown[])=>{characters:number;maxUnits:number}},original=c.executionBudget.bind(f.controller);c.executionBudget=(...a:unknown[])=>({...original(...a),characters:3000})
 try{
  await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成主题作品'});await f.act('choose-target');await f.act('wizard-next')
  await f.act('classify',{mode:'ai',consent:true});await f.settle();await f.act('select',{selected:['body'],targets:['theme'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
  await f.act('wizard-next',{consent:true});await f.settle()
  const batches=f.requests.filter(r=>r.kind==='theme'&&!r.themeProfile&&r.phase==='analyze'&&!r.intent);assert.ok(batches.length>=2,'several theme batches')
  const [p]=positions(f);assert.ok(p,'a position request');const ids=p.artifacts.map(a=>a.id);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.includes('theme-1'))
  assert.equal(positions(f).length,1,'adopted on the first attempt')
  assert.ok((await f.journal()).artifacts.some(a=>a.id===IMPORT_THEME_PROFILE_ID&&a.facts.genre==='历史'))
 }finally{await f.dispose()}
})
test('TP-27/28: the local channel counts single 他/她 only and needs a 2:1 lead; the one protagonist gender wins',()=>{
 const u={id:'u1',fileId:'f',kind:'body',start:0,end:40,text:'沈砚在合成渡口旁停步，风声很大，钟声很远。'} as ImportUnit
 const s=(prose:string,artifacts:ImportArtifact[]=[])=>({artifacts,workingProse:prose})
 assert.equal(localThemeChannel(s('他们其他其它他们她她她他'),[u])?.facts.channel,'女频','他们/其他 are not counted')
 assert.equal(localThemeChannel(s('他她他她他'),[u]),undefined,'no 2:1 lead')
 assert.equal(localThemeChannel(s('她她她她',[{id:'c',kind:'character',name:'沈砚',text:'',facts:{roleType:'PROTAGONIST',gender:'男'},evidence:[],sourceUnitIds:[],origin:'inferred'}]),[u])?.facts.channel,'男频')
 const a=localThemeChannel(s('他他他'),[u])!;assert.equal(validateImportSemanticArtifact(a).profile?.kind,'theme');assert.equal(a.evidence[0].unitId,'u1')
})

/* docs/546 §G2 (case review). */
test('TP-10b: 不限 with a genre of both channels clears the channel and asks for it',async()=>{
 const r=repaired(facts({channel:'不限',genre:'现实',tags:'[]'}))!;assert.equal(r.facts.channel,undefined);assert.equal(r.facts.genre,'现实')
 const out=await run(request(),[{artifacts:[wire(facts({channel:'不限',genre:'现实',tags:'[]'}))]},{artifacts:[wire(facts({genre:'现实',tags:'[]'}))]}])
 assert.ifError(out.error);assert.equal(out.generations,2);assert.ok(/主题定位缺少[^。]*频道/u.test(out.prompts[1]))
})
test('TP-13b: the correction names only the gaps left after repair, not the repaired quote or length',async()=>{
 const bad={...wire(facts({sellingPoints:'卖'.repeat(2500),targetAudience:''})),evidence:[{unitId:'u1',quote:'沈砚在合成渡口旁停步'},{unitId:'u1',quote:'并不存在的合成引文句'}]}
 const out=await run(request(),[{artifacts:[bad]},{artifacts:[wire(facts({sellingPoints:'第二轮卖点'}))]}])
 assert.ifError(out.error);assert.equal(out.generations,2)
 const tail=out.prompts[1].slice(out.prompts[1].indexOf('上一次输出未通过'))
 assert.ok(tail.includes('主题定位缺少目标受众'),tail.slice(0,120));assert.ok(!/证据|引文/u.test(tail.slice(0,tail.indexOf('主题定位facts必填'))),'no repaired issues are reported')
 assert.equal(out.result!.artifacts![0].facts.sellingPoints,'第二轮卖点')
})
test('TP-28a: the 2:1 pronoun lead is inclusive',()=>{
 const u={id:'u1',fileId:'f',kind:'body',start:0,end:40,text:'沈砚在合成渡口旁停步，风声很大，钟声很远。'} as ImportUnit
 assert.equal(localThemeChannel({artifacts:[],workingProse:'他他他他她她'},[u])?.facts.channel,'男频')
 assert.equal(localThemeChannel({artifacts:[],workingProse:'他他他她她'},[u]),undefined)
})
const withFits=async(rule:(r:ImportAiRequest)=>boolean|undefined,ai?:(base:Ai)=>Ai)=>{
 const f=await legacySceneFixture(filesF(),rosterAi());f.setAi((ai??(b=>themeAi(b,{})))(worldsAi(f.handler())))
 const c=f.controller as unknown as {requestFits:(r:ImportAiRequest,...a:unknown[])=>boolean},original=c.requestFits.bind(f.controller)
 c.requestFits=(r,...a)=>r.themeProfile?(rule(r)??original(r,...a)):original(r,...a)
 await toImportChar(f);await toWorldImport(f);await f.act('wizard-next');return {f,v:await f.settle()}
}
test('TP-20a: when only one opening unit fits, the position request holds units[0] and no context',async()=>{
 const {f,v}=await withFits(r=>r.units.length===1&&r.artifacts.length===0?undefined:false);try{
  const [p]=positions(f);assert.ok(p,'still sent');const j=await f.journal(),first=(j.workingUnits??[])[0]
  assert.deepEqual(p.units.map(u=>u.id),[first.id]);assert.equal(p.artifacts.length,0)
  assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'done')
 }finally{await f.dispose()}
})
test('TP-20b: when no opening unit fits, no position request is sent and the theme task is done',async()=>{
 const {f,v}=await withFits(()=>false);try{
  assert.equal(positions(f).length,0);assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'done')
  const note=v.wizard!.dropped.find(d=>d.kind==='settings'&&d.label==='主题定位');assert.ok(note);assert.ok(!note.reason.includes('频道已按正文推断'))
 }finally{await f.dispose()}
})
test('TP-23b: a non-rerunnable position failure is not retried',async()=>{
 const fatal=(base:Ai):Ai=>{const inner=themeAi(base,{});return async r=>{if(r.themeProfile)throw Error('模型接口请求失败（合成）');return inner(r)}}
 const {f,v}=await withFits(()=>undefined,fatal);try{
  assert.equal(positions(f).length,1);assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'done')
 }finally{await f.dispose()}
})

/* docs/547 code review M3 and L1/L3/L4. */
import {worldEntryRerunnableForTest} from '../../desktop/main/novel-import'
test('547-M3a: a position still missing a field after the correction fails as a rerunnable structure error',async()=>{
 const gap={artifacts:[wire(facts({genre:'全部',tags:'[]'}))]},out=await run(request(),[gap,gap])
 assert.equal(out.generations,2);assert.ok(out.error);assert.match(out.error!.message,/^模型返回结构不完整/u);assert.ok(worldEntryRerunnableForTest(out.error))
})
test('547-M3b: an aborted position request is not retried and the theme task is not adopted as done',async()=>{
 const abort=(base:Ai):Ai=>{const inner=themeAi(base,{});return async r=>{if(r.themeProfile)throw new DOMException('合成中止','AbortError');return inner(r)}}
 const {f,v}=await withFits(()=>undefined,abort);try{assert.equal(positions(f).length,1);assert.notEqual(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'done')}finally{await f.dispose()}
})
test('547-M3c: three failures over a 他-rich body adopt a 男频 channel-only position with the inferred note',async()=>{
 const body=Array.from({length:6},(_,i)=>`第${i+1}章 篇${i}\n\n沈砚在渡口停下，他听见钟声，他回头看见旧城。他握紧钥匙，他走进雾里。\n\n`).join('')
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi());f.setAi(themeAi(f.handler(),{position:'fail'}))
 try{
  await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成兜底作品'});await f.act('choose-target');await f.act('wizard-next')
  await f.act('classify',{mode:'ai',consent:true});await f.settle();await f.act('select',{selected:['body'],targets:['theme'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
  await f.act('wizard-next',{consent:true});const v=await f.settle()
  const ps=positions(f);assert.equal(ps.length,3);assert.equal(ps[2].artifacts.length,0);assert.ok(ps[0].artifacts.length>0)
  const j=await f.journal(),head=(j.workingUnits??[]).slice(0,ps[2].units.length).map(u=>u.id);assert.deepEqual(ps[2].units.map(u=>u.id),head,'the lean attempt holds exactly the opening units')
  const p=j.artifacts.find(a=>a.id===IMPORT_THEME_PROFILE_ID)!;assert.equal(p.facts.channel,'男频');assert.equal(p.facts.genre,undefined);assert.equal(p.schema,2)
  assert.equal(v.wizard!.dropped.find(d=>d.kind==='settings'&&d.label==='主题定位')!.reason,'主题定位未能推断，频道已按正文推断，题材、标签、卖点与受众已留空')
 }finally{await f.dispose()}
})
test('547-L1/L3/L4: a valid synopsis is kept as written, cuts keep closing quotes, padded channels are trimmed',()=>{
 const ok='世界。\n\n主角。',r=repaired(facts({synopsis:ok}))!;assert.equal(r.facts.synopsis,ok);assert.equal(r.counts?.clearedPosition??0,0)
 assert.equal(importThemeSynopsisFallback('他说：“走吧。”'+'乙'.repeat(300)),'他说：“走吧。”')
 const t=repaired(facts({channel:' 男频',genre:'玄幻 '}))!;assert.equal(t.facts.channel,'男频');assert.equal(t.facts.genre,'玄幻')
})
