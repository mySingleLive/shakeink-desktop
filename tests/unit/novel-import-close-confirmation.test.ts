import assert from 'node:assert/strict'
import {test} from 'node:test'
import {abandonableImport,deletableImport,needsNovelImportCloseConfirmation} from '../../src/lib/desktop/novel-import'
import {WIZARD_STEPS,type WizardStep,type WizardTask} from '../../desktop/shared/novel-import-wizard'
import {IMPORT_KINDS,type ImportPhase,type ImportView} from '../../desktop/shared/novel-import'

const monitored:WizardStep[]=['import-struct','import-body','import-char','import-scene','import-item','import-world','worldline','narrative','outline','foreshadow','verify']
function view(phase:ImportPhase='select'):ImportView{
 return {id:'60103f7f-b69b-4d56-a228-417c8b7b6053',revision:1,phase,title:'测试作品',files:[],found:Object.fromEntries(IMPORT_KINDS.map(kind=>[kind,0])) as ImportView['found'],selected:[],targets:[],infer:false,steps:[],conflicts:[],patches:[],models:{},targetReady:false,sourceReady:true,chapters:[],notFound:[],modified:false}
}
function wizardView(step:WizardStep='tree'){
 const stepState=Object.fromEntries(WIZARD_STEPS.map(key=>[key,'pending'])) as NonNullable<ImportView['wizard']>['stepState']
 stepState[step]='waiting'
 return {...view(),wizard:{version:1,step,stepState,candidates:{},images:{avatar:false,portrait:false,exterior:false,interior:false,icon:false},imageGrants:{},tasks:[],skipped:[],dropped:[],deferredConflicts:[]} as NonNullable<ImportView['wizard']>}
}

test('NICC-01: early setup closes directly; active and interrupted imports ask first',()=>{
 for(const phase of ['source','select','confirm','failed'] as const)assert.equal(needsNovelImportCloseConfirmation(view(phase)),false,phase)
 for(const phase of ['recognizing','running','paused','conflicts'] as const)assert.equal(needsNovelImportCloseConfirmation(view(phase)),true,phase)
})

test('NICC-02: publication and terminal states never ask even with progress',()=>{
 for(const phase of ['publishing','completed','discarded'] as const){const current=view(phase);current.steps=[{key:'body',label:'正文',state:'done',completed:1}];assert.equal(needsNovelImportCloseConfirmation(current),false,phase)}
 const current=view('running');current.publication={requestId:current.id};assert.equal(needsNovelImportCloseConfirmation(current),false)
})

test('NICC-03: any classic import step list marks the import as started',()=>{
 for(const state of ['pending','running','done','skipped','failed','waiting'] as const){const current=view();current.steps=[{key:'body',label:'正文',state,completed:0}];assert.equal(needsNovelImportCloseConfirmation(current),true,state)}
})

test('NICC-04: idle wizard setup and a failed roster detection do not ask',()=>{
 assert.equal(needsNovelImportCloseConfirmation(wizardView('files')),false)
 assert.equal(needsNovelImportCloseConfirmation(wizardView('work')),false)
 assert.equal(needsNovelImportCloseConfirmation(wizardView('kinds')),false)
 assert.equal(needsNovelImportCloseConfirmation(wizardView('tree')),false)
 const failed=wizardView('detect-char');failed.wizard!.stepState['detect-char']='failed';assert.equal(needsNovelImportCloseConfirmation(failed),false)
})

test('NICC-05: a running wizard operation asks before closing',()=>{
 const current=wizardView('detect-char');current.wizard!.stepState['detect-char']='running';assert.equal(needsNovelImportCloseConfirmation(current),true)
})

for(const step of monitored)for(const state of ['running','done','waiting','failed'] as const)test(`NICC-06: ${step} ${state} independently asks before closing`,()=>{
 const current=wizardView(step);current.wizard!.stepState[step]=state;assert.equal(needsNovelImportCloseConfirmation(current),true)
})

for(const step of monitored)for(const state of ['pending','skipped'] as const)test(`NICC-07: ${step} ${state} alone does not ask`,()=>{
 const current=wizardView(step);current.wizard!.stepState[step]=state;assert.equal(needsNovelImportCloseConfirmation(current),false)
})

test('NICC-08: task progress independently marks a partial import',()=>{
 for(const state of ['running','done','failed','paused','skipped'] as const){const current=wizardView();current.wizard!.tasks=[{id:'e-0000000000000001',kind:'entity',candidateId:'c-0000000000000001',state,attempts:1} as WizardTask];assert.equal(needsNovelImportCloseConfirmation(current),true,state)}
 const current=wizardView();current.wizard!.tasks=[{id:'e-0000000000000001',kind:'entity',candidateId:'c-0000000000000001',state:'waiting',attempts:0} as WizardTask];assert.equal(needsNovelImportCloseConfirmation(current),false)
})

// docs/560 R1: deleting is always offered; automatic deletion on interruption keeps its old rule.
test('SD-34: deletableImport is true until completion; abandonableImport is unchanged',()=>{
 assert.equal(deletableImport(null),false);assert.equal(abandonableImport(null),false)
 for(const phase of ['source','recognizing','select','confirm','running','paused','conflicts','failed','publishing','completed','discarded'] as const)for(const publication of [false,true]){
  const current=view(phase);if(publication)current.publication={requestId:current.id}
  assert.equal(deletableImport(current),!['completed','discarded'].includes(phase),`${phase} ${publication}`)
  assert.equal(abandonableImport(current),!publication&&!['completed','discarded','publishing'].includes(phase),`${phase} ${publication}`)
 }
})
