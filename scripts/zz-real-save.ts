import {readFileSync} from 'node:fs'
import {toImportView} from '../desktop/core/novel-import'
import {encodeImportJournal} from '../desktop/main/novel-import'
const s=JSON.parse(readFileSync(process.argv[2],'utf8'))
s.artifacts=s.artifacts.filter((a:any)=>['character','scene','item'].includes(a.kind)||a.origin==='source')
for(let i=0;i<3;i++){let t=performance.now();const e=encodeImportJournal(s);const a=performance.now()-t;t=performance.now();const v=toImportView(s);const b=performance.now()-t;console.log('encode ms',Math.round(a),'bytes',e.length,'view ms',Math.round(b),'view json',JSON.stringify(v).length)}
