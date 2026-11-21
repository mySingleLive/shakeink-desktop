import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {detectImportChapterCuts} from '../../desktop/core/novel-import-chapters'
import {importChapters,importSessionChapters} from '../../desktop/core/novel-import'
import type {ImportSession} from '../../desktop/shared/novel-import'

const words='One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty|Twenty-One|Twenty-Two|Twenty-Three|Twenty-Four|Twenty-Five|Twenty-Six|Twenty-Seven|Twenty-Eight|Twenty-Nine|Thirty|Thirty-One|Thirty-Two|Thirty-Three|Thirty-Four|Thirty-Five|Thirty-Six|Thirty-Seven|Thirty-Eight|Thirty-Nine|Forty|Forty-One|Forty-Two|Forty-Three|Forty-Four|Forty-Five|Forty-Six|Forty-Seven|Forty-Eight|Forty-Nine|Fifty|Fifty-One|Fifty-Two|Fifty-Three|Fifty-Four|Fifty-Five|Fifty-Six|Fifty-Seven|Fifty-Eight'.split('|')
const roman='I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI'.split('|')
const hash=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex')
function slices(text:string,cuts:{start:number;title:string}[]){const result=cuts.map((cut,i)=>text.slice(cut.start,cuts[i+1]?.start??text.length));assert.equal(result.join(''),text);assert.equal(hash(result.join('')),hash(text));assert.ok(result.every(part=>part.isWellFormed()));assert.ok(cuts.every((cut,i)=>Number.isInteger(cut.start)&&cut.start>=0&&(!i||cut.start>cuts[i-1].start)));return result}

test('NI-CH01: standalone English word-number chapters preserve prologue through epilogue',()=>{
 const titles=['Prologue',...words.map(word=>'Chapter '+word),'Epilogue']
 const text='\r\n \t\r\n'+titles.map((title,i)=>title+'\r\n\r\n'+(i===45?'!':'Synthetic passage '+i+' 🖋️.')+'\r\n\r\n').join(''),before=hash(text),result=detectImportChapterCuts(text)
 assert.equal(result.diagnostic,undefined);assert.equal(result.cuts.length,60);assert.deepEqual(result.cuts.map(c=>c.title),titles);assert.equal(result.cuts[0].start,0)
 const prose=slices(text,result.cuts);assert.equal(prose[45],'Chapter Forty-Five\r\n\r\n!\r\n\r\n');assert.equal(hash(text),before)
 // Beyond the fixed sample: cardinal grammar must continue through hundreds.
 const generic=[...Array.from({length:100},(_,i)=>'Chapter '+(i+1)),'Chapter One Hundred and One','Chapter One Hundred Two','Chapter One Hundred and Three'],larger=generic.map(title=>title+'\n\nx.\n\n').join(''),detected=detectImportChapterCuts(larger)
 assert.equal(detected.diagnostic,undefined);assert.deepEqual(detected.cuts.map(c=>c.title),generic);slices(larger,detected.cuts)
})

test('NI-CH02: canonical Roman sequences preserve sixteen chapters and epilogue',()=>{
 const titles=[...roman,'Epilogue'],text=titles.map((title,i)=>' \t'+title+'  \r\n\r\nSynthetic '+i+' 😀.\r\n\r\n').join(''),result=detectImportChapterCuts(text)
 assert.equal(result.diagnostic,undefined);assert.equal(result.cuts.length,17);assert.deepEqual(result.cuts.map(c=>c.title),titles);assert.ok(slices(text,result.cuts)[0].startsWith(' \tI  \r\n'))
 const extended=[...roman,'XVII','XVIII','XIX','XX','Epilogue'],more=extended.map(title=>title+'\n\nx\n\n').join(''),generic=detectImportChapterCuts(more)
 assert.equal(generic.diagnostic,undefined);assert.deepEqual(generic.cuts.map(c=>c.title),extended);slices(more,generic.cuts)
 const styled='# I\nSynthetic first.\n## II\nSynthetic last.\n',styledResult=detectImportChapterCuts(styled)
 assert.deepEqual(styledResult.cuts.map(c=>c.title),['I','II']);slices(styled,styledResult.cuts)
})

test('NI-CH03: ambiguous prose and title sequences never create guessed chapter cuts',()=>{
 const ambiguous=[
  'Chapter One\n\nx\n\nChapter Three\n\nx\n',
  'Contents\n\nChapter One\n\nChapter Two\n\nNovel\n\nChapter One\n\nx\n\nChapter Two\n\nx\n',
  'Contents\n\nI\n\nII\n\nNovel\n\nI\n\nx\n\nII\n\nx\n',
  'I\n\nx\n\nIII\n\nx\n',
  'I\n\nx\n\nII\n\nx\n\nIIII\n\nx\n',
  'II\n\nx\n\nIII\n\nx\n',
  'I\n\nx\n\nII\n\nx\n\nI\n\nI am speaking.\n',
 ]
 for(const text of ambiguous){const result=detectImportChapterCuts(text);assert.deepEqual(result.cuts,[{start:0,title:'未分章正文'}]);assert.ok(result.diagnostic);slices(text,result.cuts)}
 for(const text of ['I\n\nA first-person fragment.','He said I would return.\n\n"I"\n\n"II"\n','Chapter one was difficult.\n\nIn chapter two I returned.','I\nI am writing\nII\nI continue']){const result=detectImportChapterCuts(text);assert.deepEqual(result.cuts,[{start:0,title:'未分章正文'}]);slices(text,result.cuts)}
 const leading=' \t\r\n\r\nChapter One\r\n\rx😀\r\n\r\nChapter Two\r\n\r\ny',plain=detectImportChapterCuts(leading);assert.equal(plain.cuts.length,2);assert.equal(plain.cuts[0].start,0);slices(leading,plain.cuts)
 const preface='Actual preface 😀.\n\nChapter One\n\nx.\n\nChapter Two\n\ny.',prefaced=detectImportChapterCuts(preface);assert.deepEqual(prefaced.cuts.map(c=>c.title),['正文序言','Chapter One','Chapter Two']);slices(preface,prefaced.cuts)
 const chinese='第一卷 起始\n\n# 第一章 部落少年\n\n甲🖋️。\n\n第二章 归来\n\n乙。',oldRules=detectImportChapterCuts(chinese);assert.deepEqual(oldRules.cuts.map(c=>c.title),['正文序言','第一章 部落少年','第二章 归来']);slices(chinese,oldRules.cuts)
 const manualText=ambiguous[1],manual=[{start:0,title:'人工序言'},{start:manualText.indexOf('Novel'),title:'人工确认正文'}],manualBefore=JSON.stringify(manual),manualResult=importChapters(manualText,manual)
 assert.deepEqual(manualResult.map(c=>({start:c.start,title:c.title})),manual);assert.equal(manualResult.map(c=>c.content).join(''),manualText);assert.equal(JSON.stringify(manual),manualBefore)
 assert.deepEqual(detectImportChapterCuts('').cuts,[])
})

test('NI-CH04: unchanged manual session chapters survive implicit calculation with validation',()=>{
 const text='合成前记😀。\r\n\r\n合成记事甲。\r\n\r\n合成记事乙。\r\n',cuts=[{start:0,title:'人工前记'},{start:text.indexOf('合成记事甲'),title:' 人工甲 '},{start:text.indexOf('合成记事乙'),title:'人工乙'}]
 const session={semanticVersion:1,chapters:importChapters(text,cuts,1),chapterDetection:{mode:'manual',diagnostic:'合成歧义须人工核对'}} as ImportSession,before=structuredClone(session),bytes=hash(text)
 const retained=importSessionChapters(session,text)
 assert.deepEqual(retained,before.chapters,'implicit calculation retains every manual id/title/start/end/content');assert.deepEqual(session,before,'manual diagnostic and existing chapter objects are not rewritten');assert.equal(retained.map(c=>c.content).join(''),text);assert.equal(hash(retained.map(c=>c.content).join('')),bytes)
 const explicit=[{start:0,title:'重新确认合成前段'},{start:text.indexOf('合成记事乙'),title:'重新确认合成末段'}],changed=importSessionChapters(session,text,explicit)
 assert.deepEqual(changed,importChapters(text,explicit,1));assert.equal(session.chapterDetection?.mode,'manual');assert.equal(session.chapterDetection?.diagnostic,before.chapterDetection?.diagnostic)
 for(const nextText of [text+'追加一句。',text.replace('记事甲','记事丙')]){const s=structuredClone(before),detected=detectImportChapterCuts(nextText);assert.deepEqual(importSessionChapters(s,nextText),importChapters(nextText,detected.cuts,1));assert.deepEqual(s.chapterDetection,{mode:'auto',...(detected.diagnostic?{diagnostic:detected.diagnostic}:{})});assert.equal(hash(text),bytes)}
 const automatic=structuredClone(before);automatic.chapterDetection={mode:'auto'};assert.deepEqual(importSessionChapters(automatic,text),importChapters(text,detectImportChapterCuts(text).cuts,1));assert.equal(automatic.chapterDetection.mode,'auto')
 const empty=structuredClone(before);empty.chapters=[];assert.deepEqual(importSessionChapters(empty,text),importChapters(text,detectImportChapterCuts(text).cuts,1));assert.equal(empty.chapterDetection?.mode,'auto')
 const legacy=structuredClone(before);delete legacy.semanticVersion;assert.deepEqual(importSessionChapters(legacy,text),importChapters(text));assert.deepEqual(legacy.chapterDetection,before.chapterDetection)
 for(const invalid of [-1, text.indexOf('😀')+1, 0, text.length]){const s=structuredClone(before);s.chapters[1].start=invalid;assert.equal(s.chapters.map(c=>c.content).join(''),text);assert.throws(()=>importSessionChapters(s,text),/章节|范围|原文|顺序/);assert.equal(s.chapterDetection?.mode,'manual')}
 const blank=structuredClone(before);blank.chapters[1].title=' \t';assert.throws(()=>importSessionChapters(blank,text),/章节|范围/)
 assert.equal(hash(text),bytes)
})
