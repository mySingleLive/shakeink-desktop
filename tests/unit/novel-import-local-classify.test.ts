import assert from 'node:assert/strict'
import {test} from 'node:test'
import type {ImportFile} from '../../desktop/shared/novel-import'
import {splitImportUnits,classifyLocalUnits} from '../../desktop/core/novel-import'

const file=(text:string,name:string):ImportFile=>({id:'f',name,path:'/private/tmp/source',format:'txt',bytes:Buffer.byteLength(text),hash:'x',text,included:true})
const classify=(text:string,name:string,max:number)=>{const files=[file(text,name)];return classifyLocalUnits(files,splitImportUnits(files,max))}

test('CLS-01: a unit cut mid-line that starts with a label word stays body',()=>{
 const units=classify('第一章 开始\n他看了物品很重要的样子\n第二行继续\n','正文.txt',10)
 assert.ok(units.some(u=>u.text.startsWith('物品')),'fixture must cut right before the label word')
 assert.deepEqual(units.map(u=>u.kind),units.map(()=>'body'))
})
test('CLS-02: a unit cut mid-line that starts with a chapter heading keeps the source kind',()=>{
 const units=classify('旧灯：能照亮梦里的路第三章节都提到它\n','物品.txt',10)
 assert.ok(units.some(u=>u.text.startsWith('第三章')),'fixture must cut right before the heading')
 assert.deepEqual(units.map(u=>u.kind),units.map(()=>'item'))
})
test('CLS-03: a label heading at the start of a line still switches the kind',()=>{
 const units=classify('第一章 开始\n正文一句话\n\n物品\n旧灯：照亮梦里的路\n','正文.txt',1000)
 const heading=units.findIndex(u=>u.text.startsWith('物品'))
 assert.ok(heading>0);assert.equal(units[0].kind,'body');assert.ok(units.slice(heading).every(u=>u.kind==='item'))
})
test('CLS-04: a heading after CRLF is still at the start of a line',()=>{
 const units=classify('第一章 开始\r\n正文\r\n\r\n场景\r\n河岸\r\n','正文.txt',1000)
 const heading=units.findIndex(u=>u.text.startsWith('场景'))
 assert.ok(heading>0);assert.equal(units[heading].kind,'scene')
})
