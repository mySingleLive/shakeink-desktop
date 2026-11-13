// Read-only acceptance after the real scene import has published and closed.
// Run with --import tsx. Source/config/journal contents stay in private /tmp.
import {_electron as electron} from 'playwright'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises'
import {resolve,join,dirname,relative,isAbsolute} from 'node:path'
import {importNativeMappings} from '../desktop/core/novel-import-semantic-state.ts'
import {stripImportKnowledgeAnnotations} from '../desktop/core/novel-import-semantics.ts'
import {importVolumeGroups} from '../desktop/core/novel-import-chapters.ts'
import {sceneForestFingerprint} from './lib/scene-import-persistence.mjs'
import {quitElectronNormally} from './lib/electron-normal-quit.mjs'

const privateRoot=await realpath('/private/tmp'),insidePrivate=path=>{const part=relative(privateRoot,path);return !!part&&part!=='..'&&!part.startsWith('../')&&!isAbsolute(part)}
const existingPrivate=async value=>{assert.ok(typeof value==='string'&&value.startsWith('/private/tmp/'),'isolated private paths required');const path=await realpath(value);assert.ok(insidePrivate(path),'isolated private paths required');return path}
const appRoot=await existingPrivate(process.env.LOTM_APP_ROOT),checkpoint=await existingPrivate(process.env.LOTM_SCENE_PUBLISHED_SESSION)
const outputInput=process.env.LOTM_SCENE_REOPEN_EVIDENCE
assert.ok(typeof outputInput==='string'&&outputInput.startsWith('/private/tmp/'),'isolated private evidence path required')
const output=resolve(outputInput);assert.ok(insidePrivate(output)&&insidePrivate(await realpath(dirname(output))),'isolated private evidence path required')
const s=JSON.parse(await readFile(checkpoint,'utf8')),sha=x=>createHash('sha256').update(x).digest('hex')
assert.equal(s.phase,'completed');assert.equal(s.wizardVersion,1);assert.equal(s.semanticVersion,1);assert.ok(s.publication?.novelId);assert.deepEqual(s.targets,['scene']);assert.equal(s.files.length,1)
const expected=s.artifacts.filter(a=>a.kind==='scene'),candidates=s.wizard.candidates.scene
assert.ok(expected.length>0&&candidates.every(c=>c.selected));assert.deepEqual(expected.map(a=>a.id).sort(),candidates.map(c=>c.id).sort())
const tasks=s.wizard.tasks.filter(t=>t.kind==='entity'&&candidates.some(c=>c.id===t.candidateId))
assert.deepEqual(tasks.map(t=>t.candidateId).sort(),candidates.map(c=>c.id).sort());assert.ok(tasks.every(t=>t.state==='done'));assert.deepEqual(s.wizard.dropped,[]);assert.deepEqual(s.wizard.skipped,[])
assert.deepEqual([...s.coverage['roster:scene']].sort(),s.workingUnits.map(u=>u.id).sort())
const mapping=importNativeMappings(expected);assert.equal(mapping.mappingWarnings.length,0);assert.equal(mapping.projectableIds.length,expected.length)
const source=s.files[0];assert.ok(source.path==='/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt','unexpected verification source');assert.equal(sha(await readFile(source.path)),source.hash)
await mkdir(output,{recursive:false,mode:0o700})
const app=await electron.launch({executablePath:process.env.LOTM_ELECTRON_RUNTIME,args:[resolve('.')],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot,SHAKEINK_IMPORT_DEBUG:'0'},timeout:60000})
let exit,acceptance
try{
 const page=await app.firstWindow({timeout:60000}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:60000})
 assert.equal((await page.evaluate(()=>window.desktop.bootstrap())).dataRoot,appRoot)
 const get=async path=>{const r=await page.evaluate(async path=>{const response=await fetch(path);return {status:response.status,body:await response.json()}},path);assert.equal(r.status,200);return r.body}
 const {scenes:rows}=await get(`/api/novels/${s.publication.novelId}/scenes`)
 assert.equal(rows.length,expected.length);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length)
 const businessFields=['name','description','coordinates','exteriorDescription','interiorDescription','backstory','entryMethod']
 const expectedRows=expected.map(a=>{const decoded=mapping.decoded.get(a.id),native=decoded.native;assert.equal(native.kind,'scene');const profile=decoded.profile?.kind==='scene'?decoded.profile.value:{};return {id:a.id,parentId:a.facts.parentId??null,name:a.name,description:a.origin==='source'?native.description:stripImportKnowledgeAnnotations(native.description),coordinates:native.coordinates,...Object.fromEntries(businessFields.slice(3).map(k=>[k,profile[k]??'']))}})
 const fields=row=>Object.fromEntries(businessFields.map(k=>[k,row[k]]))
 assert.ok(JSON.stringify(sceneForestFingerprint(rows,fields))===JSON.stringify(sceneForestFingerprint(expectedRows,fields)),'persisted complete scene fields, multiplicities or actual parent bindings differ')
 const parents=expectedRows.filter(r=>r.parentId).length,fieldsCount=rows.reduce((count,r)=>count+businessFields.slice(3).filter(k=>!!r[k]).length,0)
 const {record}=await get(`/api/novels/${s.publication.novelId}/import-record`)
 assert.equal(record.id,s.id);assert.equal(record.wizard.sceneIdentityVersion,1);assert.ok(isDeepStrictEqual(record.wizard.sceneIdentity,s.wizard.sceneIdentity),'persisted scene identity ledger differs');assert.deepEqual(record.materials.filter(a=>a.kind==='scene').map(a=>a.id).sort(),expected.map(a=>a.id).sort())
 const {volumes}=await get(`/api/novels/${s.publication.novelId}/outline`)
 const groups=importVolumeGroups(s.chapters);assert.equal(volumes.length,groups.length)
 const chapters=[];for(const [i,v] of volumes.entries()){
  assert.ok(v.title===(groups[i].name??'导入内容'),'persisted volume title differs');assert.equal(v.index,i+1);assert.equal(v.chapters.length,groups[i].end-groups[i].start)
  for(const [j,c] of v.chapters.entries()){
   assert.ok(c.volumeId===v.id&&c.index===j+1,'persisted chapter outline volume/order differs')
   const {chapter}=await get(`/api/novels/${s.publication.novelId}/chapters/${c.id}`)
   assert.ok(chapter.id===c.id&&chapter.volumeId===v.id&&chapter.volume?.id===v.id,'persisted chapter volume differs');assert.ok(chapter.volume.title===v.title,'persisted chapter volume title differs');assert.equal(chapter.index,j+1);chapters.push(chapter)
  }
 }
 assert.equal(chapters.length,s.chapters.length);for(const [i,c] of chapters.entries()){assert.ok(c.title===s.chapters[i].title,'persisted chapter title differs');assert.ok(c.content===s.chapters[i].content,'persisted chapter content differs')}
 assert.equal(sha(chapters.map(c=>c.content).join('')),sha(s.workingProse));assert.equal(errors.length,0,'unexpected page error after reopening')
 await page.screenshot({path:join(output,'reopened.png')})
 acceptance={sessionId:s.id,publication:s.publication,scenes:rows.length,parents,comparedBusinessFields:rows.length*7,nonemptyBusinessFields:fieldsCount,chapters:chapters.length,volumes:volumes.length,allIdentitiesAndFieldsMatch:true,bodyUnchanged:true,sourceUnchanged:true,pageErrors:errors,realElectronReopened:true,access:'local read-only IPC routes'}
}finally{
 exit=await quitElectronNormally(app)
 const cleanupRequested=!exit.normalQuit&&app.process().exitCode===null
 if(cleanupRequested)app.process().kill('SIGKILL')
 await writeFile(join(output,'shutdown.json'),JSON.stringify({...exit,cleanupRequested})+'\n',{flag:'wx',mode:0o600})
}
assert.equal(exit.normalQuit,true,'normal Electron quit did not complete before its original deadline')
await writeFile(join(output,'acceptance.json'),JSON.stringify(acceptance,null,2)+'\n',{flag:'wx',mode:0o600})
