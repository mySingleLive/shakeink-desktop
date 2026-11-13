/* Offline timing of step-16 setting-batch planning on a copy of a real stored session (read-only; prints numbers only). */
import {readFileSync} from 'node:fs'
import {mkdtempSync,realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NovelImportController} from '../desktop/main/novel-import'
import {workingImportUnits} from '../desktop/core/novel-import'
const file=process.argv[2]
const s=JSON.parse(readFileSync(file,'utf8'))
s.artifacts=s.artifacts.filter((a:any)=>['character','scene','item'].includes(a.kind)||a.origin==='source')
s.wizard.step='import-world';s.analysisGrant={hash:'x',textModel:{...s.models.text},reviewModel:{...s.models.review}}
const c:any=new NovelImportController({wizard:true,root:realpathSync(mkdtempSync(join(tmpdir(),'wf-'))),models:async()=>({})} as any)
c.session=s
const profile=c.executionBudget(s,'analyze'),units=workingImportUnits(s)
console.log('units',units.length,'artifacts',s.artifacts.length,'budget',profile.characters,profile.maxUnits)
let worstSlice=0,total=0,requests=0
for(const kind of ['theme','style','goldenFinger','trope']){
 const it=c.stageRequests(s,units,profile,(batch:any)=>({phase:'analyze',kind,units:batch,artifacts:c.contextArtifacts(s,batch,profile.characters),workingRevision:s.workingRevision,executionLane:'wizard-settings-v1'}))
 for(;;){const t=performance.now(),r=it.next(),d=performance.now()-t;worstSlice=Math.max(worstSlice,d);total+=d;if(r.done)break;requests++}
}
console.log('requests',requests,'total planning ms',Math.round(total),'worst sync slice ms',Math.round(worstSlice))
