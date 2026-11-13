import {readFileSync,mkdtempSync,realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NovelImportController} from '../desktop/main/novel-import'
import {workingImportUnits} from '../desktop/core/novel-import'
import {serializeImportAiPayload} from '../desktop/core/novel-import-ai-payload'
const s=JSON.parse(readFileSync(process.argv[2],'utf8'))
s.artifacts=s.artifacts.filter((a:any)=>['character','scene','item'].includes(a.kind)||a.origin==='source')
s.wizard.step='import-world';s.analysisGrant={hash:'x',textModel:{...s.models.text},reviewModel:{...s.models.review}}
const c:any=new NovelImportController({wizard:true,root:realpathSync(mkdtempSync(join(tmpdir(),'wf-'))),models:async()=>({})} as any);c.session=s
const p=c.executionBudget(s,'analyze'),units=workingImportUnits(s),batch=units.slice(0,60)
const T=(n:string,f:()=>unknown,k=20)=>{f();const t=performance.now();for(let i=0;i<k;i++)f();console.log(n,((performance.now()-t)/k).toFixed(1),'ms')}
const arts=c.contextArtifacts(s,batch,p.characters);console.log('ctx artifacts',arts.length)
T('contextArtifacts',()=>c.contextArtifacts(s,batch,p.characters))
const cat=c.entityCatalog(s)
T('entityCatalog',()=>c.entityCatalog(s))
const req=c.requestSnapshot(s,{phase:'analyze',kind:'trope',units:batch,artifacts:arts,workingRevision:0,executionLane:'wizard-settings-v1',executionBudget:p},cat)
T('requestSnapshot',()=>c.requestSnapshot(s,{phase:'analyze',kind:'trope',units:batch,artifacts:arts,workingRevision:0,executionLane:'wizard-settings-v1',executionBudget:p},cat))
T('serialize',()=>serializeImportAiPayload(req))
T('serialize no artifacts',()=>serializeImportAiPayload({...req,artifacts:[]}))
T('requestFits',()=>c.requestFits(req,p,s.analysisGrant.textModel))
