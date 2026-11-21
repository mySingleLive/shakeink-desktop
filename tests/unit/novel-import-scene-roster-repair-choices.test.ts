import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {validateSceneRosterRecords} from '../../desktop/core/novel-import-scene-identity'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import type {ImportUnit} from '../../desktop/shared/novel-import'

function units(texts:string[],fileId='f'):ImportUnit[]{let start=0;return texts.map((text,i)=>{const u={id:'u-'+i,fileId,start,end:start+text.length,text,kind:'body' as const};start=u.end;return u})}
const make=(input:ImportUnit[])=>createSceneRosterRepairChoices(input,createSceneRosterFragmentTable(input))
const locations=(text:string,literal:string)=>{const at:number[]=[];for(let p=text.indexOf(literal);p>=0;p=text.indexOf(literal,p+1))at.push(p);return at}

test('RC-choice01: all 22 source occurrences receive exact choices, with no first-N cutoff',()=>{
 const input=units([Array.from({length:22},(_,i)=>'第'+i+'处的书房向东。').join('')]),before=structuredClone(input),c=make(input),refs=c.forLiteral('书房')
 assert.equal(refs.length,22);assert.equal(new Set(refs).size,22)
 const actual=refs.map(ref=>{const anchor=c.resolve(ref,'mention','书房');validateSceneRosterRecords([{name:'书房',aliases:[],mentions:[{literal:'书房',evidence:anchor}],context:[],links:[]}],input);return input[0].text.indexOf(anchor.quote)+anchor.quote.indexOf('书房')})
 assert.deepEqual(actual,locations(input[0].text,'书房'));assert.ok(c.entries().every(e=>e.sourceRef&&!Object.hasOwn(e,'quote')));assert.deepEqual(input,before)
 refs.pop();assert.equal(c.forLiteral('书房').length,22)
})

test('RC-choice02: overlapping occurrences and cross-fragment literals keep exact Unicode/CRLF windows',()=>{
 for(const [text,literal]of [['甲ababa乙','aba'],['青，铜门已打开。','青，铜'],['甲😀书房\r\n东窗。乙😀书房\r\n西窗。','😀书房']]as const){
  const input=units([text]),c=make(input),refs=c.forLiteral(literal)
  assert.equal(refs.length,locations(text,literal).length)
  assert.deepEqual(refs.map(ref=>{const e=c.resolve(ref,'mention',literal);assert.ok(e.quote.isWellFormed());assert.ok(!e.quote.startsWith('\n')||!text.includes('\r\n'+e.quote.slice(1)));validateSceneRosterRecords([{name:literal,aliases:[],mentions:[{literal,evidence:e}],context:[],links:[]}],input);return text.indexOf(e.quote)+e.quote.indexOf(literal)}),locations(text,literal))
 }
 const repeated=make(units(['书书']));assert.deepEqual(repeated.forLiteral('书'),[],'no subwindow can disambiguate identical minimal copies')
})

test('RC-choice03: exact original long anchors are preserved, deduplicated and immutable',()=>{
 const text='序言😀\r\n'.repeat(100)+'书房的完整原窗口。',input=units([text]),c=make(input),before=structuredClone(input)
 c.forLiteral('书房');const ref=c.addAnchor({unitId:'u-0',quote:text},'书房',true)
 assert.equal(c.addAnchor({unitId:'u-0',quote:text},undefined,true),ref);assert.equal(c.entries().filter(e=>e.choiceRef===ref).length,1)
 const entry=c.entries().find(e=>e.choiceRef===ref)!;assert.equal(entry.quote,text);assert.equal(entry.preserved,true);assert.deepEqual(entry.literals,['书房']);assert.ok(Object.isFrozen(entry)&&Object.isFrozen(entry.literals)&&Object.isFrozen(c.entries()))
 assert.throws(()=>{entry.literals.push('改值')});const anchor=c.resolve(ref,'mention','书房');anchor.quote='改值';assert.equal(c.resolve(ref,'context').quote,text)
 input[0].text='外部后变更';assert.equal(c.resolve(ref,'link').quote,before[0].text)
})

test('RC-choice04: explicit whole-unit choices do not bypass mention or exact-anchor gates',()=>{
 const input=units(['书房，另一书房。',' \r\n','']),c=make(input),refs=c.wholeUnits();assert.equal(refs.length,1)
 const e=c.entries().find(v=>v.choiceRef===refs[0])!;assert.equal(e.wholeUnit,true);assert.equal(c.resolve(refs[0],'context').quote,input[0].text);assert.equal(c.resolve(refs[0],'link').quote,input[0].text)
 assert.throws(()=>c.resolve(refs[0],'mention','书房'));assert.throws(()=>c.resolve(refs[0],'mention'));assert.throws(()=>c.resolve(refs[0],'other' as 'link'))
 for(const anchor of [{unitId:'absent',quote:'书房'},{unitId:'u-0',quote:'书房'},{unitId:'u-1',quote:' \r\n'},{unitId:'u-0',quote:'不存在'}])assert.throws(()=>c.addAnchor(anchor))
 assert.throws(()=>c.resolve(refs[0]+' ','context'));assert.throws(()=>c.resolve(refs[0].toUpperCase(),'link'));assert.throws(()=>c.resolve('cf0000000000000000','context'))
})

test('RC-choice05: source presence includes real adjacent chains, never creates cross-unit choices',()=>{
 const input=units(['前书','房','门后']),c=make(input);assert.equal(c.hasSource('书房门'),true);assert.deepEqual(c.forLiteral('书房门'),[])
 const reordered=make([...input].reverse());assert.equal(reordered.hasSource('书房门'),true)
 const gap=structuredClone(input);gap[1].start++;gap[1].end++;assert.equal(make(gap).hasSource('书房门'),false)
 const different=structuredClone(input);different[1].fileId='other';assert.equal(make(different).hasSource('书房门'),false)
 assert.equal(c.hasSource('原文全无'),false);assert.equal(c.hasSource(''),false);assert.deepEqual(c.forLiteral(''),[])
})

test('RC-choice06: a stale or conflicting fragment directory is rejected before choices are offered',()=>{
 const a=units(['东宅书房。','西宅书房。']),old=createSceneRosterFragmentTable(a),changed=structuredClone(a);changed[0].text='北宅书房。'
 assert.throws(()=>createSceneRosterRepairChoices(changed,old))
 const duplicate={units:old.units.map((u,i)=>({...u,fragments:u.fragments.map(f=>({...f,ref:i?old.units[0].fragments[0].ref:f.ref}))})),resolve:old.resolve}
 assert.throws(()=>createSceneRosterRepairChoices(a,duplicate))
})
