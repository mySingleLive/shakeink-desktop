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
const p=c.executionBudget(s,'analyze'),units=workingImportUnits(s)
const catalog=c.entityCatalog(s),entJson=JSON.stringify(catalog.map((e:any)=>({id:e.id,kind:e.kind,name:e.name,parentId:e.parentId,entityType:e.entityType,worldId:e.worldId,settingType:e.settingType}))).length,chJson=JSON.stringify(s.chapters.map(({id,title,start,end}:any,index:number)=>({id,title,start,end,index}))).length
console.log('catalog entries',catalog.length,'entities json',entJson,'chapters json',chJson,'artifacts',s.artifacts.length,'3*budget',p.characters*3)
let start=0,batches=0,maxPayload=0,maxUnitsJson=0
while(start<units.length){let k=start,chars=0;while(k<units.length&&k-start<p.maxUnits&&chars+units[k].text.length<=p.characters){chars+=units[k].text.length;k++}
 const batch=units.slice(start,k),req=c.requestSnapshot(s,{phase:'analyze',kind:'goldenFinger',units:batch,artifacts:c.contextArtifacts(s,batch,p.characters),workingRevision:0,executionLane:'wizard-settings-v1',executionBudget:p}),pay=serializeImportAiPayload(req).length
 maxPayload=Math.max(maxPayload,pay);maxUnitsJson=Math.max(maxUnitsJson,JSON.stringify(batch).length);batches++;start=k}
console.log('char-only batches',batches,'max payload',maxPayload,'max units json',maxUnitsJson)
