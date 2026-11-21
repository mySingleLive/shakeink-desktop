import assert from 'node:assert/strict'
import {test} from 'node:test'
import type {ImportFile,ImportSession} from '../../desktop/shared/novel-import'
import {importExcludedRanges,importSourceUnits,importSourceReady,importSessionChapters,importStructureAvailable,sourceBody,toImportView} from '../../desktop/core/novel-import'
import {collectImportStructureCandidates,requiresImportStructureModel,commitImportStructure,localImportStructureDecision} from '../../desktop/core/novel-import-structure'

const file=(text:string,name='合成小说.txt'):ImportFile=>({id:'f',name,path:'/private/tmp/source/'+name,format:'txt',bytes:Buffer.byteLength(text),hash:'x',text,included:true})
function session(text:string,name?:string):ImportSession{
 const f=file(text,name)
 return {version:1,semanticVersion:1,chapterVersion:2,id:'11111111-1111-4111-8111-111111111111',revision:0,epoch:0,phase:'source',title:'合成',files:[f],units:importSourceUnits(f),selected:['body'],targets:[],infer:true,artifacts:[],conflicts:[],patches:[],originalProse:'',workingProse:'',workingRevision:0,chapters:[],steps:[],coverage:{},notFound:[],decisions:[],createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z',chapterDetection:{mode:'auto'}}
}
const prose=(word:string)=>('　　'+word+'走过长街，灯火渐暗。\n').repeat(40)
const head='==========\n更多小说下载：https://example.invalid/\n==========\n合成之书\n作者：某人\n\n内容简介：\n　　这是一段简介，讲述故事的开端。\n\n\n'
const vol1='第一部 起始\n\n\n第一章 开端\n'+prose('甲')+'第二章 发展\n'+prose('乙')
const note1='第一部总结\n　　写完第一部，说说感想，下一部叫做“远航”。\n\n\n'
const vol2='第二部 远航\n\n\n第一章 出港\n'+prose('丙')
const note2='第二部总结\n　　第三部的名字是“归来”，从起始到归来结束。\n\n\n'
const vol3='第一章 归途\n'+prose('丁')+'第二章 终点\n'+prose('戊')
const thanks='完本感言\n　　感谢一路陪伴的读者。\n\n\n'
const extra='番外\n\n\n小镇日常（一）\n'+prose('己')+'小镇日常（二）\n'+prose('庚')+'小镇日常（三）\n'+prose('辛')
const ps='　　PS1：番外写到这里结束。\n　　PS2：还有一些想法。\n'
const book=head+vol1+note1+vol2+note2+vol3+thanks+extra+ps
const at=(part:string)=>book.indexOf(part)

test('XR-01: front matter, author notes and a trailing PS are excluded at line starts only',()=>{
 assert.deepEqual(importExcludedRanges(file(book)),[[0,at(vol1)],[at(note1),at(vol2)],[at(note2),at(vol3)],[at(thanks),at(extra)],[at(ps),book.length]])
 // A bare title line before chapter one is part of the first chapter, not front matter.
 const titled='合成之书\n\n'+vol1;assert.deepEqual(importExcludedRanges(file(titled)),[])
 // A PS in the middle of the book and a summary word inside a sentence stay body text.
 const middle=vol1+'　　PS：中段说明。\n'+'　　他写下第一部总结的念头。\n'+vol2;assert.deepEqual(importExcludedRanges(file(middle)),[])
 // Setting files are never cut.
 assert.deepEqual(importExcludedRanges(file(book,'角色.txt')),[])
})
test('XR-02: source units split at excluded edges and leave nothing unclassified',()=>{
 const s=session(book)
 assert.equal(s.units.map(u=>u.text).join(''),book)
 assert.ok(s.units.every(u=>u.kind==='body'||u.kind==='excluded'),JSON.stringify(s.units.filter(u=>u.kind!=='body'&&u.kind!=='excluded').map(u=>[u.start,u.kind])))
 assert.ok(importSourceReady(s))
 assert.equal(sourceBody(s),vol1+vol2+vol3+extra)
})
test('XR-03: in the wizard, chapter headings in the body are the file outline',()=>{
 const s={...session(book),wizardVersion:1 as const};s.chapters=importSessionChapters(s,sourceBody(s))
 assert.equal(importStructureAvailable(s),true);assert.equal(toImportView(s).found.outline,1)
 const plain={...session('　　只有一段没有标题的正文，没有任何章节。\n'),wizardVersion:1 as const};assert.equal(importStructureAvailable(plain),false);assert.equal(toImportView(plain).found.outline,0)
 // The legacy dialog keeps its own outline rule: only outline source units count.
 assert.equal(toImportView(session(book)).found.outline,0)
})
test('XR-04: a 番外 parent with numbered entries forms its own volume',()=>{
 const s=session(book);s.chapters=importSessionChapters(s,sourceBody(s))
 const collected=collectImportStructureCandidates(s);assert.equal(collected.complete,true);assert.equal(requiresImportStructureModel(s,collected),false)
 commitImportStructure(s,localImportStructureDecision(collected.candidates))
 const body=sourceBody(s),extraStart=body.indexOf(extra)
 assert.deepEqual(s.chapters.map(c=>[c.title,c.volume]),[['第一章 开端','起始'],['第二章 发展','起始'],['第一章 出港','远航'],['第一章 归途','归来'],['第二章 终点','归来'],['小镇日常（一）','番外'],['小镇日常（二）','番外'],['小镇日常（三）','番外']])
 assert.equal(s.chapters[5].start,extraStart);assert.equal(s.chapters.map(c=>c.content).join(''),body)
 // A broken sequence is not a deterministic 番外 volume.
 const gap=session(head+vol1+'番外\n\n\n小镇日常（一）\n'+prose('己')+'小镇日常（三）\n'+prose('辛'));gap.chapters=importSessionChapters(gap,sourceBody(gap))
 assert.equal(collectImportStructureCandidates(gap).complete,false)
})
test('XR-05: an unnamed restarted volume takes the single next-volume name from the adjacent author note',()=>{
 // Same path as the controller: detect, then confirm the local decision when no model is needed.
 const s=session(book);s.chapters=importSessionChapters(s,sourceBody(s))
 const collected=collectImportStructureCandidates(s);assert.equal(requiresImportStructureModel(s,collected),false)
 commitImportStructure(s,localImportStructureDecision(collected.candidates))
 assert.equal(s.chapterDetection?.diagnostic,undefined);assert.equal(s.chapterDetection?.mode,'manual')
 assert.deepEqual([...new Set(s.chapters.map(c=>c.volume))],['起始','远航','归来','番外'])
 // Re-deriving chapters from the stored decision keeps the names and adds no diagnostic.
 assert.deepEqual(importSessionChapters(s,sourceBody(s)).map(c=>c.volume),s.chapters.map(c=>c.volume));assert.equal(s.chapterDetection?.diagnostic,undefined)
 // A note that names a different part number, or two names, leaves the volume for the model.
 for(const bad of ['第二部总结\n　　第五部的名字是“归来”。\n\n\n','第二部总结\n　　第三部可能叫“归来”，也可能叫“回家”。\n\n\n']){
  const t=session(head+vol1+note1+vol2+bad+vol3);t.chapters=importSessionChapters(t,sourceBody(t))
  assert.equal(requiresImportStructureModel(t),true);assert.notEqual(t.chapters.at(-1)?.volume,'归来')
 }
})
