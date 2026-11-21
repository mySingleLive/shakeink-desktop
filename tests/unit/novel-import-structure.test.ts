import assert from 'node:assert/strict'
import {test} from 'node:test'
import {collectImportStructureCandidates,importStructureCandidateMetadata,requiresImportStructureModel,validateImportStructureDecisions,commitImportStructure,localImportStructureDecision,verifiedImportStructureVolumeCuts,type ImportStructureDecision} from '../../desktop/core/novel-import-structure'
import {importChapters,importSessionChapters,splitImportUnits,sourceBody} from '../../desktop/core/novel-import'
import {importAiPrompt,serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import {importRuntimeAiCallSchema} from '../../desktop/core/novel-import-runtime-proof'
import {runImportAi} from '../../desktop/service/novel-import-ai'
import type {ImportAiRequest,ImportFile,ImportFormat,ImportModel,ImportSession} from '../../desktop/shared/novel-import'

const model:ImportModel={id:'text',name:'受控模型',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:16000}
function file(text:string,name='正文.txt',format:ImportFormat='txt',id=name):ImportFile{return{id,name,format,path:'/private/tmp/structure/'+name,bytes:Buffer.byteLength(text),hash:'source',text,included:true}}
function session(files:ImportFile[]):ImportSession{
 const units=files.flatMap(f=>splitImportUnits([f]).map(u=>({...u,kind:'body' as const}))),text=files.map(f=>f.text).join('')
 return{version:1,semanticVersion:1,chapterVersion:2,id:'11111111-1111-4111-8111-111111111111',revision:1,epoch:0,phase:'select',title:'合成结构',files,units,selected:['body'],targets:['outline'],infer:true,artifacts:[],conflicts:[],patches:[],originalProse:'',workingProse:'',workingRevision:0,chapters:[],steps:[],coverage:{},notFound:[],decisions:[],createdAt:'2026-10-28T00:00:00.000Z',updatedAt:'2026-10-28T00:00:00.000Z',chapterDetection:{mode:'auto'}}
}
function decide(s:ImportSession,cuts:{title:string;volume?:string}[]):ImportStructureDecision{
 const {candidates}=collectImportStructureCandidates(s),used=new Set<number>(),chapterCuts=cuts.map(cut=>{
  const candidate=candidates.find(unit=>importStructureCandidateMetadata(unit).title===cut.title&&!used.has(unit.start))
  assert.ok(candidate,'候选标题 '+cut.title);used.add(candidate.start)
  const meta=importStructureCandidateMetadata(candidate);return{start:candidate.start,title:(meta.chapterTitle??meta.title.replace(/^第[一二三四五六七八九十百千万\d]+[章节回](?:\s|$)/u,'').trim())||'第一章',candidateId:candidate.id,...(cut.volume?{volume:cut.volume}:{})}
 })
 return{chapterCuts,ignoredStarts:candidates.filter(unit=>!used.has(unit.start)).map(unit=>unit.start)}
}

test('LOTM-L-STR01: actual hierarchy, not volume/chapter terminology, determines cuts',()=>{
 for(const sample of [
  {text:'# 第一部 起源\n\n## 第一章 开始\n\n甲。\n\n## 第二章 继续\n\n乙。',cuts:[{title:'第一部 起源',volume:'起源'},{title:'第二章 继续',volume:'起源'}]},
  {text:'# 总序\n\n## 第一册 远航\n\n### 第一节 离港\n\n甲。\n\n### 第二节 返航\n\n乙。',cuts:[{title:'第一册 远航',volume:'远航'},{title:'第二节 返航',volume:'远航'}]},
 ]){
  const s=session([file(sample.text)]),{candidates,body}=collectImportStructureCandidates(s),decision=decide(s,sample.cuts)
  assert.equal(body,sample.text);assert.ok(candidates.some(unit=>importStructureCandidateMetadata(unit).headingLevel===1));validateImportStructureDecisions(candidates,decision)
  commitImportStructure(s,decision);assert.equal(s.chapters.length,sample.cuts.length);assert.deepEqual(s.chapters.map(c=>c.volume),sample.cuts.map(c=>c.volume));assert.equal(s.chapters.map(c=>c.content).join(''),sample.text);assert.ok(s.chapters.every(c=>c.outline===undefined));assert.deepEqual(s.artifacts,[])
 }
 const local=session([file('第一卷：起源\n第一章 起\n甲。\n第二章 续\n乙。')]),collected=collectImportStructureCandidates(local)
 assert.equal(requiresImportStructureModel(local,collected),false)
 const clear=session([file('# 第一部 起源\n\n## 第一章 开始\n\n甲。')]);assert.equal(requiresImportStructureModel(clear,collectImportStructureCandidates(clear)),false)
 const ambiguous=session([file('第一章 起\n甲。\n第一章 又起\n乙。')]);assert.equal(requiresImportStructureModel(ambiguous,collectImportStructureCandidates(ambiguous)),true)
})

test('LOTM-L-STR02/03: file order, directories and UTF-16 offsets never inject filenames into prose',()=>{
 const files=[file('😀序。\n甲。','卷一/第一章.txt','docx'),file('乙。\n第三章 终\n😀丙。','卷一/第二章.txt','pdf'),file('丁。','第二卷/第一章.txt','html')],s=session(files),{body,candidates}=collectImportStructureCandidates(s)
 assert.equal(body,sourceBody(s));assert.equal(body,files.map(f=>f.text).join(''))
 for(const unit of candidates){const meta=importStructureCandidateMetadata(unit);assert.ok(Number.isSafeInteger(unit.start));assert.ok(unit.start>=0&&unit.start<=body.length);if(unit.text)assert.equal(unit.text,body.slice(unit.start,unit.end));assert.ok(meta.relativePath);assert.ok(['docx','pdf','html'].includes(meta.format))}
 const first=files[0].text.length,second=first+files[1].text.length
 assert.ok(candidates.some(unit=>unit.start===first));assert.ok(candidates.some(unit=>unit.start===second));assert.ok(candidates.some(unit=>importStructureCandidateMetadata(unit).source==='directory'))
 for(const decision of [{chapterCuts:[{start:1,title:'伪造章界'}],ignoredStarts:[]},{chapterCuts:[{start:0,title:'重复'},{start:0,title:'重复'}],ignoredStarts:[]}])assert.throws(()=>validateImportStructureDecisions(candidates,decision),/候选|重复|决定/)
})

test('LOTM-L-STR03: excluded source gaps keep body coordinates and original file offsets separate',()=>{
 const first=file('忽略😀\n第一章 起\n甲。'),second=file('第二章 续\n乙。','第二.txt'),s=session([first,second]);s.units=[
  {id:'skip',fileId:first.id,start:0,end:5,text:'忽略😀\n',kind:'excluded'},
  {id:'body',fileId:first.id,start:5,end:first.text.length,text:first.text.slice(5),kind:'body'},
  ...s.units.filter(unit=>unit.fileId===second.id),
 ]
 const {body,candidates}=collectImportStructureCandidates(s),heading=candidates.find(unit=>importStructureCandidateMetadata(unit).headingTitle==='第一章 起')!
 assert.equal(body,'第一章 起\n甲。第二章 续\n乙。');assert.equal(heading.start,0);assert.equal(importStructureCandidateMetadata(heading).fileOffset,5);assert.equal(heading.text,'第一章 起');assert.ok(candidates.some(unit=>unit.start==='第一章 起\n甲。'.length&&importStructureCandidateMetadata(unit).fileOffset===0))
})

test('LOTM-L-STR04: every candidate is decided and forced boundaries cannot disappear',()=>{
 const s=session([file('第一卷：起源\n第一章 起\n甲。\n第二章 续\n乙。')]),{candidates}=collectImportStructureCandidates(s),forced=candidates.filter(unit=>importStructureCandidateMetadata(unit).forced)
 assert.ok(forced.length>=2)
 assert.throws(()=>validateImportStructureDecisions(candidates,{chapterCuts:[],ignoredStarts:candidates.map(unit=>unit.start)}),/强制|章界/)
 const cuts=candidates.map((unit,index)=>({start:unit.start,title:'章'+unit.start,volume:index===1?'其他':'起源'}))
 assert.throws(()=>validateImportStructureDecisions(candidates,{chapterCuts:cuts,ignoredStarts:[]}),/重复|决定|标题|候选/)
 assert.throws(()=>validateImportStructureDecisions(candidates,{chapterCuts:cuts.slice(1),ignoredStarts:[candidates[0].start]}),/决定|遗漏|强制|标题|候选/)
 assert.throws(()=>validateImportStructureDecisions(candidates,{chapterCuts:candidates.map(unit=>({start:unit.start,title:'   '})),ignoredStarts:[]}),/标题|空/)
})

test('LOTM-L-STR05: structure has a separate schema, payload, prompt and runtime identity',async()=>{
 const s=session([file('# 第一部 起源\n\n## 第一章 开始\n\n甲。')]),{candidates}=collectImportStructureCandidates(s),request:ImportAiRequest={operationId:'11111111-1111-4111-8111-111111111111',semanticVersion:1,phase:'classify',intent:'structure',units:candidates,artifacts:[],models:{text:model,review:{...model,id:'review'}}}
 const metadata=candidates.map(unit=>importStructureCandidateMetadata(unit)),result={chapterCuts:[{start:candidates[0].start,title:'开始',volume:'起源'}],ignoredStarts:candidates.slice(1).map(unit=>unit.start)}
 if(metadata[0].title!=='第一部 起源')result.chapterCuts=[{start:candidates.find((_,i)=>metadata[i].title==='第一部 起源')!.start,title:'开始',volume:'起源'}]
 result.ignoredStarts=candidates.filter(unit=>!result.chapterCuts.some(cut=>cut.start===unit.start)).map(unit=>unit.start)
 const deps={resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(result)}
 const accepted=await runImportAi(request,new AbortController().signal,deps);assert.deepEqual(accepted,result)
 const serialized=serializeImportAiPayload(request);assert.ok(serialized.includes('"intent":"structure"'));assert.ok(serialized.includes('coordinateSystem'))
 assert.ok(importAiPrompt(request).includes('卷章结构'))
 const ordinary={...request,intent:undefined};assert.ok(!importAiPrompt(ordinary,'').includes('卷章结构识别'))
 for(const invalid of [{...result,classifications:[]},{chapterCuts:[],ignoredStarts:[]},{...result,artifacts:[]},{chapterCuts:[{start:999999,title:'伪造'}],ignoredStarts:result.ignoredStarts}])await assert.rejects(runImportAi(request,new AbortController().signal,{...deps,generate:async()=>invalid}),/结构|候选|阶段|类别|决定|内容/)
 await assert.rejects(runImportAi({...request,phase:'analyze'},new AbortController().signal,deps),/阶段|结构|类别/)
 const identity={version:1 as const,processRunId:request.operationId,sessionId:request.operationId,operationId:request.operationId,epoch:0,phase:'classify' as const,intent:'structure' as const,workingRevision:0,scopeHash:'a'.repeat(64),payloadHash:'b'.repeat(64),startedAt:new Date().toISOString()}
 assert.equal(importRuntimeAiCallSchema.safeParse({...identity,state:'pending'}).success,true);assert.equal(importRuntimeAiCallSchema.safeParse({...identity,phase:'analyze',state:'pending'}).success,false)
})

test('REVIEW-STR01: real book-part/volume/chapter hierarchy takes precedence over legacy volume labels',()=>{
 const text='# 第一部 总览\n## 第一卷 起源\n### 第一章 开始\n甲。\n### 第二章 继续\n乙。',s=session([file(text,'正文.md','md')]),collected=collectImportStructureCandidates(s)
 assert.equal(collected.complete,true);assert.equal(requiresImportStructureModel(s,collected),false);commitImportStructure(s,localImportStructureDecision(collected.candidates))
 assert.equal(s.chapters.length,2);assert.deepEqual(s.chapters.map(c=>c.title),['第一章 开始','第二章 继续']);assert.deepEqual(s.chapters.map(c=>c.volume),['起源','起源']);assert.equal(s.chapters.map(c=>c.content).join(''),text)
})

test('LOTM-L-STR10: omitted volume inherits the actual inner hierarchy after normalization',()=>{
 const text='# 总序\n## 第一册 远航\n### 第一节 离港\n'+'离港正文。'.repeat(30)+'\n### 第二节 返航\n'+'返航正文。'.repeat(30),s=session([file(text,'正文.md','md')])
 commitImportStructure(s,decide(s,[{title:'第一册 远航'},{title:'第二节 返航'}]))
 assert.deepEqual(s.chapters.map(c=>c.volume),['远航','远航']);assert.deepEqual(importSessionChapters(s,text).map(c=>c.volume),['远航','远航']);assert.equal(s.chapters.map(c=>c.content).join(''),text)
})

test('LOTM-L-STR13: omitted and repeated labels within one source volume retain continuous ownership',()=>{
 const text='第一卷 起源\n第一章 起\n甲。\n第二章 承\n乙。\n第三章 合\n丙。',s=session([file(text)]),decision=decide(s,[{title:'第一卷 起源',volume:'起源'},{title:'第二章 承'},{title:'第三章 合',volume:'起源'}]),{candidates}=collectImportStructureCandidates(s)
 validateImportStructureDecisions(candidates,{chapterCuts:decision.chapterCuts.slice(0,1),ignoredStarts:[]},true);validateImportStructureDecisions(candidates,{chapterCuts:decision.chapterCuts.slice(1),ignoredStarts:[]},true);validateImportStructureDecisions(candidates,decision);commitImportStructure(s,decision);assert.deepEqual(s.chapters.map(c=>c.volume),['起源','起源','起源']);assert.equal(s.chapters.map(c=>c.content).join(''),text)
})

test('REVIEW-STR02: an unclosed parent is ambiguous and cannot swallow a later section',()=>{
 const text='# 作品\n## 旅程\n### 出发\n甲。\n## 归途\n乙。',s=session([file(text,'正文.md','md')]),{candidates,complete}=collectImportStructureCandidates(s)
 assert.equal(complete,false);assert.equal(requiresImportStructureModel(s,collectImportStructureCandidates(s)),true)
 const used=new Set<number>(),chapterCuts=[{title:'旅程',volume:'旅程'},{title:'归途',volume:'归途'}].map(cut=>{const unit=candidates.find(candidate=>importStructureCandidateMetadata(candidate).title===cut.title)!;used.add(unit.start);return{start:unit.start,title:cut.title,...(cut.volume?{volume:cut.volume}:{})}})
 const decision={chapterCuts,ignoredStarts:candidates.filter(unit=>!used.has(unit.start)).map(unit=>unit.start)};validateImportStructureDecisions(candidates,decision);commitImportStructure(s,decision)
 assert.equal(s.chapters.length,2);assert.equal(s.chapters.map(c=>c.content).join(''),text);assert.deepEqual(s.chapters.map(c=>c.volume),['旅程','归途'])
})

test('REVIEW-STR04: model titles must come from actual candidates or deterministic heading cleanup',()=>{
 const s=session([file('# 第一部 起源\n\n## 第一章 开始\n\n甲。','正文.md','md')]),{candidates}=collectImportStructureCandidates(s),start=candidates[0].start
 const ignoredStarts=candidates.slice(1).map(unit=>unit.start)
 assert.doesNotThrow(()=>validateImportStructureDecisions(candidates,{chapterCuts:[{start,title:'开始',volume:'起源'}],ignoredStarts}))
 assert.throws(()=>validateImportStructureDecisions(candidates,{chapterCuts:[{start,title:'完全虚构的章名',volume:'完全虚构的卷名'}],ignoredStarts}),/标题|卷名|候选/)
 assert.throws(()=>validateImportStructureDecisions(candidates,{chapterCuts:[{start,title:'开始',volume:'完全虚构的卷名'}],ignoredStarts}),/卷名|候选/)
})

test('REVIEW-STR05: an entirely ignored candidate batch is valid before whole-book commit',async()=>{
 const s=session([file('第一章 起\n甲。','目录/第一章.txt')]),{candidates}=collectImportStructureCandidates(s),units=candidates.filter(unit=>importStructureCandidateMetadata(unit).source==='directory')
 assert.ok(units.length);const request:ImportAiRequest={operationId:'11111111-1111-4111-8111-111111111111',semanticVersion:1,phase:'classify',intent:'structure',units,artifacts:[],models:{text:model,review:{...model,id:'review'}}}
 const result={chapterCuts:[],ignoredStarts:units.map(unit=>unit.start)},accepted=await runImportAi(request,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>result});assert.deepEqual(accepted,result)
})

test('LOTM-L-STR08: local prologue fallback always has a real file-start candidate',()=>{
 const text='==========================================================\n更多精校小说尽在知轩藏书下载：https://zxcs.zip/\n==========================================================\n合成书名\n作者：合成作者\n\n内容简介：\n　　合成简介。\n\n\n第一部 小丑\n\n\n第一章 绯红\n　　合成正文。',s=session([file(text,'合成书名.txt')]),{candidates}=collectImportStructureCandidates(s),first=candidates.find(unit=>unit.start===0)
 assert.ok(first);assert.ok(['heading','filename'].includes(importStructureCandidateMetadata(first).source));assert.equal(importStructureCandidateMetadata(first).chapterTitle,'正文序言');assert.equal(importStructureCandidateMetadata(first).forced,true)
 assert.throws(()=>validateImportStructureDecisions(candidates,{chapterCuts:[],ignoredStarts:[]}),/候选|决定|遗漏/)
})

test('LOTM-L-STR08: nonzero blank-line boundaries and file-start fallback preserve actual chapter metadata',()=>{
 for(const newline of ['\n','\r\n','\r']){
  const s=session([file('前置文字'+newline+newline+'独立标题'+newline+newline+'第一卷 起源'+newline+'第一章 开始'+newline+'甲。')])
  const {candidates}=collectImportStructureCandidates(s),candidate=candidates.find(unit=>importStructureCandidateMetadata(unit).title==='独立标题')
  assert.ok(candidate,'空白行之间的真实标题必须成为候选');assert.equal(importStructureCandidateMetadata(candidate).blankAfter,true)
 }
 for(const [text,expectedTitle,expectedVolume]of [['\n第一卷 起源\n第一章 开始\n甲。','第一章 开始','起源'],['前置'.repeat(200)+'\n第一卷 起源\n第一章 开始\n甲。','正文序言',undefined]] as const){
  const s=session([file(text)]),{candidates}=collectImportStructureCandidates(s),first=candidates.find(unit=>unit.start===0&&importStructureCandidateMetadata(unit).source==='filename')
  assert.ok(first);assert.equal(importStructureCandidateMetadata(first).chapterTitle,expectedTitle);assert.equal(importStructureCandidateMetadata(first).volume,expectedVolume!)
  commitImportStructure(s,localImportStructureDecision(candidates));assert.equal(s.chapters.at(-1)?.volume,'起源');assert.equal(s.chapters[0].title,expectedTitle!);assert.equal(s.chapters.map(chapter=>chapter.content).join(''),text)
 }
})

test('LOTM-L-STR09: numbered short headings without a following blank line remain model candidates',()=>{
 const extras=Array.from({length:8},(_,i)=>`一个普通人的日常（${['一','二','三','四','五','六','七','八'][i]}）\n${'实质叙述。'.repeat(40)}`).join('\n\n'),text='合成书名\n第一卷 愚者\n第四十一章 新的旅程\n主线正文。\n\n番外\n\n'+extras,s=session([file(text)]),collected=collectImportStructureCandidates(s)
 const candidates=collected.candidates.filter(unit=>importStructureCandidateMetadata(unit).title.startsWith('一个普通人的日常'))
 assert.equal(candidates.length,8);for(const unit of candidates){const meta=importStructureCandidateMetadata(unit);assert.equal(meta.blankAfter,false);assert.equal(meta.forced,false)}assert.equal(collected.complete,false);assert.equal(requiresImportStructureModel(s,collected),true)
 const decision=decide(s,[{title:'第一卷 愚者',volume:'愚者'},...candidates.map((unit,index)=>({title:importStructureCandidateMetadata(unit).title,...(index===0?{volume:'番外'}:{})}))]);commitImportStructure(s,decision)
 assert.equal(s.chapters.length,9);assert.deepEqual(s.chapters.map(c=>c.volume),['愚者',...Array.from({length:8},()=> '番外')]);assert.equal(s.chapters.map(c=>c.content).join(''),text)
 assert.equal(s.chapters[0].start,0);assert.equal(s.chapters[1].start,text.indexOf('番外'));assert.deepEqual(importSessionChapters(s,text).map(c=>c.volume),s.chapters.map(c=>c.volume))
 const cuts=s.chapters.map(c=>({start:c.start,title:c.title,volume:c.volume}));assert.deepEqual(importChapters(text,cuts,1,2,verifiedImportStructureVolumeCuts(s,cuts,text)).map(c=>c.volume),s.chapters.map(c=>c.volume))
 const normalized=s.chapterDetection!.structureDecision!;assert.equal(normalized.normalizationVersion,2);assert.equal(normalized.volumeCuts[1].start,text.indexOf('番外'));assert.equal(normalized.volumeCuts[1].candidateId,undefined)
 const legacy=structuredClone(s),legacyStart=candidates.find(unit=>importStructureCandidateMetadata(unit).title==='一个普通人的日常（一）')!.start;delete legacy.chapterDetection!.structureDecision!.normalizationVersion;legacy.chapterDetection!.structureDecision!.volumeCuts[1].start=legacyStart;legacy.chapters[1].start=legacyStart;const legacyCuts=legacy.chapters.map(c=>({start:c.start,title:c.title,volume:c.volume}));assert.doesNotThrow(()=>verifiedImportStructureVolumeCuts(legacy,legacyCuts,text))
 const unknown=structuredClone(s);unknown.chapterDetection!.structureDecision!.normalizationVersion=3 as any;assert.throws(()=>verifiedImportStructureVolumeCuts(unknown,cuts,text),/归一化版本/)
 assert.throws(()=>{const changed=structuredClone(s);changed.chapters[2].volume='愚者';importSessionChapters(changed,text);verifiedImportStructureVolumeCuts(changed,cuts,text)},/结构决定/)
 assert.throws(()=>{const changed=structuredClone(s);changed.chapterDetection!.structureDecision!.chapterCuts[0].volume='伪造';verifiedImportStructureVolumeCuts(changed,cuts,text)},/真实候选|卷名|结构决定/)
 for(const bad of ['无空行标题（三）','错误标题（四）。','长'.repeat(151)+'（五）']){const sample=session([file('正文。\n'+bad+'\n内容。')]),{candidates}=collectImportStructureCandidates(sample);assert.ok(!candidates.some(unit=>importStructureCandidateMetadata(unit).title===bad))}
})

test('LOTM-L-STR14: parent-title normalization rejects ambiguous or substantive spans',()=>{
 const prose='第一卷 番外\n第一章 起\n甲。\n\n番外\n\n保留正文，不能挪走。\n\n第二章 合\n乙。',withProse=session([file(prose)]);commitImportStructure(withProse,decide(withProse,[{title:'第一卷 番外',volume:'番外'},{title:'第二章 合',volume:'番外'}]));assert.equal(withProse.chapters[1].start,prose.indexOf('第二章 合'));assert.ok(withProse.chapters[0].content.includes('保留正文，不能挪走。'))
 const extras=Array.from({length:8},(_,i)=>`一个普通人的日常（${['一','二','三','四','五','六','七','八'][i]}）\n${'实质叙述。'.repeat(40)}`).join('\n\n'),text='合成书名\n第一卷 愚者\n第四十一章 新的旅程\n主线正文。\n\n番外\n\n'+extras,s=session([file(text)]),{candidates}=collectImportStructureCandidates(s),decision=decide(s,[{title:'第一卷 愚者',volume:'愚者'},...candidates.filter(unit=>importStructureCandidateMetadata(unit).title.startsWith('一个普通人的日常')).map((unit,index)=>({title:importStructureCandidateMetadata(unit).title,...(index===0?{volume:'番外'}:{})}))]);decision.chapterCuts[1].volume='愚者';commitImportStructure(s,decision);assert.equal(s.chapters[1].start,text.indexOf('一个普通人的日常（一）'))
 const duplicate='第一卷 愚者\n第四十一章 新的旅程\n'+'主线正文。'.repeat(30)+'\n\n番外\n\n番外\n\n一个普通人的日常（一）\n'+'番外正文。'.repeat(30),ambiguous=session([file(duplicate)]);assert.throws(()=>commitImportStructure(ambiguous,decide(ambiguous,[{title:'第一卷 愚者',volume:'愚者'},{title:'一个普通人的日常（一）',volume:'番外'}])),/候选不唯一/)
})

test('LOTM-L-STR11: adjacent excluded volume notes are bounded evidence, never automatic volume names',()=>{
 const previous='第七卷 倒吊人\n第四十一章 旧的结束\n'+'旧卷正文。'.repeat(30)+'\n',note='第八部的名字很好猜，“愚者”，从“小丑”开始，到“愚者”结束。\n\n',next='第一章 这一晚\n'+'新卷正文。'.repeat(30),text=previous+note+next,s=session([file(text)])
 s.units=[{id:'old',fileId:s.files[0].id,start:0,end:previous.length,text:previous,kind:'body'},{id:'note',fileId:s.files[0].id,start:previous.length,end:previous.length+note.length,text:note,kind:'excluded'},{id:'next',fileId:s.files[0].id,start:previous.length+note.length,end:text.length,text:next,kind:'body'}]
 const {candidates}=collectImportStructureCandidates(s),candidate=candidates.find(unit=>importStructureCandidateMetadata(unit).title==='第一章 这一晚')!,meta=importStructureCandidateMetadata(candidate)
 assert.ok(meta.volumeContext);assert.equal(meta.volumeContext.unitId,'note');assert.equal(meta.volumeContext.end,previous.length+note.length);assert.ok(meta.volumeContext.start>=previous.length);assert.ok(meta.volumeContext.text.length<=2000);assert.ok(meta.volumeContext.text.includes('第八部'));assert.ok(meta.volumeContext.candidates.includes('愚者'));assert.notEqual(meta.volume,'愚者')
 const parent=candidates.find(unit=>importStructureCandidateMetadata(unit).title==='第七卷 倒吊人')!,decision={chapterCuts:[{start:parent.start,title:importStructureCandidateMetadata(parent).chapterTitle!,volume:'倒吊人',candidateId:parent.id},{start:candidate.start,title:candidate.text,volume:'愚者',candidateId:candidate.id}],ignoredStarts:candidates.filter(unit=>unit.start!==parent.start&&unit.start!==candidate.start).map(unit=>unit.start)};commitImportStructure(s,decision)
 assert.deepEqual(s.chapters.map(c=>c.volume),['倒吊人','愚者']);assert.equal(s.chapters.map(c=>c.content).join(''),previous+next);assert.deepEqual(importSessionChapters(s,previous+next).map(c=>c.volume),['倒吊人','愚者'])
 assert.throws(()=>validateImportStructureDecisions(candidates,decide(s,[{title:'第四十一章 旧的结束',volume:'倒吊人'},{title:'第一章 这一晚',volume:'伪造'}])),/真实候选|卷名/)
 const inherited=session([file(text)]);inherited.units=structuredClone(s.units);commitImportStructure(inherited,{...decision,chapterCuts:decision.chapterCuts.map(cut=>({...cut,volume:cut.volume==='愚者'?undefined:cut.volume}))});assert.notEqual(inherited.chapters.at(-1)?.volume,'愚者');assert.equal(meta.volumeContext.unitIds,undefined)
 const splitCase=(noteText:string,lengths:number[])=>{const source=previous+noteText+next,part=session([file(source)]);let offset=previous.length;part.units=[{id:'old',fileId:part.files[0].id,start:0,end:previous.length,text:previous,kind:'body'},...lengths.map((length,index)=>{const unit={id:'note-'+index,fileId:part.files[0].id,start:offset,end:offset+length,text:noteText.slice(offset-previous.length,offset-previous.length+length),kind:'excluded' as const};offset+=length;return unit}),{id:'next',fileId:part.files[0].id,start:offset,end:source.length,text:next,kind:'body'}];return collectImportStructureCandidates(part).candidates.find(unit=>importStructureCandidateMetadata(unit).title==='第一章 这一晚')!}
 const split=importStructureCandidateMetadata(splitCase(note,[note.length-1,1])).volumeContext;assert.ok(split);assert.equal(split.unitId,'note-0');assert.deepEqual(split.unitIds,['note-0','note-1']);assert.equal(split.text,note);assert.ok(split.candidates.includes('愚者'))
 for(const [length,lengths,first]of [[2600,[900,900,800],0],[3000,[1000,1000,1000],1]]as const){const noteText='作'.repeat(length-note.length)+note,context=importStructureCandidateMetadata(splitCase(noteText,[...lengths])).volumeContext;assert.ok(context);assert.equal(context.unitId,'note-'+first);assert.deepEqual(context.unitIds,lengths.map((_length,index)=>'note-'+index).slice(first));assert.equal(context.start,previous.length+length-2000);assert.equal(context.end,previous.length+length);assert.equal(context.text,noteText.slice(-2000));assert.ok(context.candidates.includes('愚者'));assert.throws(()=>importStructureCandidateMetadata({...splitCase(noteText,[...lengths]),part:JSON.stringify({...importStructureCandidateMetadata(splitCase(noteText,[...lengths])),volumeContext:{...context,unitIds:['wrong','wrong']}})}),/卷章候选元数据无效/)}
 const prefix='作者说明。\n\n',body='第一章 开始\n'+'开始正文。'.repeat(30)+'\n第一章 重启\n'+'重启正文。'.repeat(30),other=session([file(prefix+body)]);other.units=[{id:'prefix',fileId:other.files[0].id,start:0,end:prefix.length,text:prefix,kind:'excluded'},...other.units.filter(unit=>unit.kind==='body').map(unit=>({...unit,start:unit.start+prefix.length,end:unit.end+prefix.length}))]
 const first=collectImportStructureCandidates(other).candidates.find(unit=>unit.start===0);assert.ok(first);assert.equal(importStructureCandidateMetadata(first).volumeContext,undefined)
 const substantive='实质序言。'.repeat(30)+'\n\n',prefaceText=substantive+note+body,preface=session([file(prefaceText)]),prefaceStart=substantive.length+note.length;preface.units=[{id:'prologue',fileId:preface.files[0].id,start:0,end:substantive.length,text:substantive,kind:'body'},{id:'note',fileId:preface.files[0].id,start:substantive.length,end:prefaceStart,text:note,kind:'excluded'},{id:'chapters',fileId:preface.files[0].id,start:prefaceStart,end:prefaceText.length,text:body,kind:'body'}]
 const afterPrologue=collectImportStructureCandidates(preface).candidates.find(unit=>importStructureCandidateMetadata(unit).title==='第一章 开始');assert.ok(afterPrologue);assert.equal(importStructureCandidateMetadata(afterPrologue).volumeContext,undefined)
})

test('REVIEW-STR06: a plain-text book title is part of the first real chapter, not an empty prologue',()=>{
 for(const text of [
  '作品名\n第一卷 起源\n第一章 开始\n甲。\n第二章 继续\n乙。',
  '作品名\n第一部 总览\n第一卷 起源\n第一章 开始\n甲。\n第二章 继续\n乙。',
 ]){
  const s=session([file(text)]),collected=collectImportStructureCandidates(s);commitImportStructure(s,localImportStructureDecision(collected.candidates))
  assert.equal(s.chapters.length,2);assert.deepEqual(s.chapters.map(c=>c.title),['第一章 开始','第二章 继续']);assert.deepEqual(s.chapters.map(c=>c.volume),['起源','起源']);assert.equal(s.chapters[0].start,0);assert.equal(s.chapters.map(c=>c.content).join(''),text);assert.ok(s.chapters.every(c=>c.title!=='正文序言'))
 }
})

test('REVIEW-STR07: multi-candidate cuts require a selected ID, ignored siblings and values from that candidate',()=>{
 const s=session([file('第一卷 起源\n第一章 开始\n甲。\n第二章 继续\n乙。','目录/第一章.txt')]),{candidates}=collectImportStructureCandidates(s),heading=candidates.find(unit=>importStructureCandidateMetadata(unit).source==='heading')!,directory=candidates.find(unit=>importStructureCandidateMetadata(unit).source==='directory')!
 for(const decision of [
  {chapterCuts:[{start:0,title:'第一章 开始',volume:'起源'}],ignoredStarts:[]},
  {chapterCuts:[{start:0,title:'第一章 开始',volume:'起源',candidateId:heading.id}],ignoredStarts:[]},
  {chapterCuts:[{start:0,title:'第一章 开始',volume:'起源'}],ignoredStarts:[0]},
  {chapterCuts:[{start:0,title:'第一章 开始',volume:'目录',candidateId:heading.id}],ignoredStarts:[0]},
 ])assert.throws(()=>validateImportStructureDecisions(candidates,decision),/candidateId|候选|卷名|忽略/)
 const chapterCuts=[{start:0,title:'第一章 开始',volume:'起源',candidateId:heading.id},...candidates.filter(unit=>unit.start>0).map(unit=>{const meta=importStructureCandidateMetadata(unit);return{start:unit.start,title:meta.chapterTitle??meta.title,volume:'起源',candidateId:unit.id}})],decision={chapterCuts,ignoredStarts:[0]}
 validateImportStructureDecisions(candidates,decision);commitImportStructure(s,decision);assert.equal(s.chapters.length,2);assert.equal(s.chapters.map(c=>c.content).join(''),s.files[0].text)
})
