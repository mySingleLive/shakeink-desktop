import {readFileSync} from 'node:fs'
import {importScopeHash} from '../desktop/core/novel-import'
const s=JSON.parse(readFileSync(process.argv[2],'utf8'))
s.artifacts=s.artifacts.filter((a:any)=>['character','scene','item'].includes(a.kind)||a.origin==='source')
for(let i=0;i<3;i++){const t=performance.now();importScopeHash(s,'analyze');console.log('scopeHash ms',Math.round(performance.now()-t))}
