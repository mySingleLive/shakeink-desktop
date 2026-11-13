/* docs/566 WR-R1/R2 (scratch, not committed): hashes of the four setting kinds' planned requests on a copy of a
 * real draft; prints only hashes and timings. MODE=new|head, WORLD=1 keeps the world artifacts. */
import {readFileSync,mkdtempSync,realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {NovelImportController} from '../desktop/main/novel-import'
import {workingImportUnits} from '../desktop/core/novel-import'
const s=JSON.parse(readFileSync(process.argv[2],'utf8')),keep=new Set(['character','scene','item',...(process.env.WORLD==='1'?['world']:[])])
s.artifacts=s.artifacts.filter((a:any)=>keep.has(a.kind)||a.origin==='source')
s.wizard.step='import-world';s.analysisGrant={hash:'x',textModel:{...s.models.text},reviewModel:{...s.models.review}}
const c:any=new NovelImportController({wizard:true,root:realpathSync(mkdtempSync(join(tmpdir(),'wf-'))),models:async()=>({})} as any);c.session=s
const p=c.executionBudget(s,'analyze'),units=workingImportUnits(s),all=createHash('sha256')
for(const kind of ['theme','style','goldenFinger','trope']){
 const it:Iterator<any>=process.env.MODE==='head'?c.stageRequests(s,units,p,(batch:any)=>({phase:'analyze',kind,units:batch,artifacts:c.contextArtifacts(s,batch,p.characters),workingRevision:s.workingRevision,executionLane:'wizard-settings-v1'})):c.settingsPlan(s,kind,Number(process.env.SLICE??8))
 const h=createHash('sha256');let n=0,pauses=0,worst=0
 for(;;){const t=performance.now(),r=it.next();worst=Math.max(worst,performance.now()-t);if(r.done)break;if(typeof r.value==='symbol'){pauses++;continue}n++;const j=JSON.stringify(r.value);h.update(j);all.update(j)}
 console.log(kind,'requests',n,'pauses',pauses,'worst slice ms',Math.round(worst),'sha',h.digest('hex').slice(0,16))
}
console.log('all',all.digest('hex'))
