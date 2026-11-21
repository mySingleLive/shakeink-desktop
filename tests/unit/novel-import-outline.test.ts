import assert from 'node:assert/strict'
import {test} from 'node:test'
import {projectDetailedOutlines,validateDetailedOutlineAssignments,validateDetailedOutlines} from '../../desktop/core/novel-import-outline'
import {applyImportPatches,importChapters,importPlanHash,splitImportUnits} from '../../desktop/core/novel-import'
import type {ImportArtifact,ImportSession} from '../../desktop/shared/novel-import'

const text='第一章 起\n甲。\n第二章 续\n乙。',chapters=importChapters(text,[{start:0,title:'第一章 起',volume:'初卷'},{start:text.indexOf('第二章'),title:'第二章 续',volume:'初卷'}],1,2)
function session():ImportSession{
 const file={id:'f',name:'正文.txt',format:'txt' as const,path:'/private/tmp/outline.txt',bytes:Buffer.byteLength(text),hash:'source',text,included:true}
 return {version:1,semanticVersion:1,chapterVersion:2,id:'11111111-1111-4111-8111-111111111111',revision:1,epoch:0,phase:'running',title:'合成细纲',files:[file],units:splitImportUnits([file]).map(u=>({...u,kind:'body'})),selected:['body'],targets:['outline'],infer:true,artifacts:[],conflicts:[],patches:[],originalProse:text,workingProse:text,workingRevision:0,chapters:structuredClone(chapters),steps:[],coverage:{},notFound:[],decisions:[],createdAt:'2026-10-28T00:00:00.000Z',updatedAt:'2026-10-28T00:00:00.000Z'}
}
function artifact(s:ImportSession,id:string,index:string,content=`${id}细纲`):ImportArtifact{const u=s.units[0];return{id,kind:'outline',name:id,text:content,facts:{chapterIndex:index},evidence:[{unitId:u.id,quote:u.text.slice(0,4)}],sourceUnitIds:[u.id],origin:'inferred'}}

test('LOTM-L-ORD02/03: final artifacts project once, repair stays bound and plan hash changes',()=>{
 const s=session(),before=importPlanHash(s),a0=artifact(s,'outline-0','0'),a1=artifact(s,'outline-1','1'),volume=artifact(s,'volume-outline','', '卷级大纲');delete volume.facts.chapterIndex;s.artifacts=[a0,a1,volume]
 validateDetailedOutlineAssignments(s,true);projectDetailedOutlines(s);assert.deepEqual(s.chapters.map(c=>c.outline),['outline-0细纲','outline-1细纲']);assert.deepEqual(s.detailedOutlineIds,{0:'outline-0',1:'outline-1'});assert.notEqual(importPlanHash(s),before);validateDetailedOutlines(s)
 a0.text='复核后的细纲';projectDetailedOutlines(s);assert.equal(s.chapters[0].outline,'复核后的细纲');validateDetailedOutlines(s)
 s.chapters[0].outline='被篡改';assert.throws(()=>validateDetailedOutlines(s),/细纲|chapterIndex|归属/)
})

test('LOTM-L-ORD03: duplicate invalid or missing chapter assignments fail before projection',()=>{
 const s=session(),a=artifact(s,'outline-0','0');s.artifacts=[a];assert.throws(()=>validateDetailedOutlineAssignments(s,true),/细纲|完整/);const before=structuredClone(s.chapters)
 for(const index of ['-1','1.5','2','99','x'])assert.throws(()=>projectDetailedOutlines({...session(),artifacts:[artifact(session(),'bad',index)]}),/chapterIndex|细纲/)
 s.artifacts=[a,artifact(s,'outline-other','0')];assert.throws(()=>projectDetailedOutlines(s),/重复|chapterIndex|归属/);assert.deepEqual(s.chapters,before)
})

test('LOTM-L-ORD04: existing prose outlines are not overwritten but unresolved canonical conflicts fail closed',()=>{
 const s=session();s.chapters[1].outline='作者已有细纲';s.artifacts=[artifact(s,'outline-0','0'),artifact(s,'outline-1','1','模型不同细纲')];const before=structuredClone(s.chapters);assert.throws(()=>projectDetailedOutlines(s),/细纲|覆盖|归属/);assert.deepEqual(s.chapters,before)
})

test('REVIEW-ORD03: blank canonical outlines and extra mappings cannot publish',()=>{
 for(const content of ['', '   ']){const s=session();s.artifacts=[artifact(s,'blank','0',content),artifact(s,'valid','1')];const before=structuredClone(s.chapters);assert.throws(()=>projectDetailedOutlines(s),/细纲|空白|空/);assert.deepEqual(s.chapters,before)}
 const s=session();s.artifacts=[artifact(s,'outline-0','0'),artifact(s,'outline-1','1')];projectDetailedOutlines(s);s.detailedOutlineIds![1]='other';assert.throws(()=>validateDetailedOutlines(s),/细纲|映射|归属/)
})

test('REVIEW-ORD03: rebinding an existing outline ID cannot leave a stale chapter or mapping',()=>{
 const s=session(),a=artifact(s,'same-outline','0');s.artifacts=[a,artifact(s,'outline-1','1')];projectDetailedOutlines(s);a.facts.chapterIndex='1';s.artifacts=[a];const before=structuredClone(s.chapters)
 assert.throws(()=>projectDetailedOutlines(s),/细纲|映射|归属|chapterIndex/);assert.deepEqual(s.chapters,before);assert.deepEqual(s.detailedOutlineIds,{0:'same-outline',1:'outline-1'})
})

test('REVIEW-ORD07: applying a prose patch delays source outlines and clears their old projections',()=>{
 const s=session(),outlineText='全书大纲\n第一章 细纲';s.files.push({id:'outline-file',name:'大纲.txt',format:'txt',path:'/private/tmp/outline-source.txt',bytes:Buffer.byteLength(outlineText),hash:'outline',text:outlineText,included:true});s.units.push({id:'outline-source',fileId:'outline-file',start:0,end:outlineText.length,text:outlineText,kind:'outline'});s.selected=['body','outline'];s.chapters[0].outline='旧投影细纲';s.detailedOutlineIds={0:'outline-0'}
 s.patches=[{id:'p',start:text.indexOf('甲'),end:text.indexOf('甲')+1,before:'甲',after:'丙',reason:'作者确认',workingRevision:0,conflictId:'c'}];applyImportPatches(s,['p'])
 assert.ok(s.workingProse.includes('丙'));assert.equal(s.detailedOutlineIds,undefined);assert.ok(s.chapters.every(chapter=>chapter.outline===undefined));assert.equal(s.artifacts.some(a=>a.kind==='outline'),false)
})
