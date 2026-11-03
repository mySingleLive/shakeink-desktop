import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportModel} from '../../desktop/shared/novel-import'

const model:ImportModel={id:'text',name:'合成模型',modelId:'synthetic',endpoint:'https://prompt.invalid/v1',authRevision:1,contextWindow:16000}
const text='合成原文首句。\n合成原文次句。'
const request=(intent:'roster'|'touches'|'entity',kind:ImportAiRequest['kind']):ImportAiRequest=>({semanticVersion:1,operationId:'11111111-1111-4111-8111-111111111111',phase:'analyze',intent,kind,units:[{id:'u1',fileId:'f',start:0,end:text.length,text,kind:'body'}],artifacts:[],entities:[],workingRevision:0,models:{text:model}} as ImportAiRequest)
const contract=(prompt:string)=>/<phase-output-contract>([\s\S]*?)<\/phase-output-contract>/u.exec(prompt)?.[1]??''

test('WP-01: roster requests describe the roster output, not artifacts',()=>{
 const fields={character:['roleType','PROTAGONIST','SUPPORTING','ANTAGONIST'],scene:['parent'],item:['itemType','important','category:"item"|"character"|"place"|"organization"|"concept"|"other"','可被持有'],world:['parent','settings','settingType','LEVEL_SYSTEM']} as const
 for(const [kind,extra] of Object.entries(fields)){
  const prompt=importAiPrompt(request('roster',kind as ImportAiRequest['kind'])),c=contract(prompt)
  assert.match(c,/(?:roster|"roster"):\[/u,kind);assert.doesNotMatch(c,/artifacts:\[/u,kind)
  for(const field of ['name','aliases',...extra])assert.ok(c.includes(field),kind+' '+field)
  // Evidence is located locally from the returned names; the model copies no quotes (docs/238 B).
  for(const field of ['evidence','quote','逐字摘取'])assert.ok(!c.includes(field),kind+' must not ask for '+field)
  // Artifact-only guidance must not pull the model back to the artifacts shape.
  assert.doesNotMatch(prompt,/每项artifact\.kind必须/u,kind);assert.doesNotMatch(prompt,/character-facts-encoding-contract/u,kind)
 }
})
test('WP-02: touches requests describe the touches output',()=>{
 assert.ok(contract(importAiPrompt(request('touches',undefined))).includes('evidence:{unitId,quote}'))
 const c=contract(importAiPrompt(request('touches',undefined)))
 assert.match(c,/touches:\[/u);assert.doesNotMatch(c,/artifacts:\[/u)
 for(const field of ['foreshadowKey','title','content','PLANT','MENTION','PAYOFF','chapterIndex','summary','quote','evidence'])assert.ok(c.includes(field),field)
})
test('WP-03: entity requests keep the artifacts contract',()=>{
 const prompt=importAiPrompt(request('entity','character'))
 assert.match(contract(prompt),/artifacts:\[/u);assert.match(prompt,/character-facts-encoding-contract/u)
})
// 491-G2: hashes captured at b26975f, before the item category change. Other roster prompts must not move.
test('491-G2: character, scene and world roster prompts are byte-identical to the baseline',()=>{
 const baseline={character:'6ffb4c39c663af39b401d6c9265e372a0f8baf24995ca0eb88c6b4a9850894f7',scene:'14c60245232033c0c696c5364bf55638176dcfad4c3b3441661f1e6970c832aa',world:'c677627093af52e8245a3c4810c4e316a5afc8a7f1872db8127c5325563c7377'}
 for(const [kind,hash] of Object.entries(baseline))assert.equal(createHash('sha256').update(importAiPrompt(request('roster',kind as ImportAiRequest['kind']))).digest('hex'),hash,kind)
})
