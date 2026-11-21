import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson} from '../../desktop/service/novel-import-ai'
import {importAiPrompt,assertImportFixedPromptReserve} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportArtifact} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {model} from '../helpers/novel-import-wizard-fixture'

const request:ImportAiRequest={semanticVersion:1,operationId:'scene-entity-test',phase:'analyze',intent:'entity',kind:'scene',entityTarget:{id:'s-child',aliases:['小巷']},units:[{id:'u-scene',fileId:'f',start:0,end:18,text:'北城的南巷又称小巷，有一盏灯。',kind:'body'}],artifacts:[],entities:[{id:'s-child',kind:'scene',name:'南巷',entityType:'PLACE',parentId:'s-parent'},{id:'s-parent',kind:'scene',name:'北城',entityType:'PLACE'}],workingRevision:0,models:{text:model}}
const actor:ImportArtifact={id:'s-child',name:'南巷',kind:'scene',text:'北城的南巷里有一盏灯。',facts:{entityType:'PLACE',parentId:'s-parent'},evidence:[{unitId:'u-scene',quote:'南巷又称小巷'}],sourceUnitIds:['u-scene'],origin:'inferred'},valid={artifacts:[actor]},context={userId:'synthetic',resolvedModel:{} as ResolvedModel}
test('SI-08a: scene entity prompt binds its selected identity and exact catalog parent without unrelated contracts',()=>{
 const prompt=importAiPrompt(request,'{}'),fixed=prompt.split('<novel-import-data>')[0]
 for(const word of ['scene-import-contract','entityTarget','parentId','有则原样复制','无则省略','PLACE','sourceUnitIds','units','完整保留'])assert.ok(fixed.includes(word),word)
 for(const word of ['roleType','WORLD','worldline','narrative','semantic-native-contract','character-facts-encoding-contract'])assert.ok(!fixed.includes(word),word)
 assertImportFixedPromptReserve(prompt,'{}')
})
const bad=[{notFound:true},{artifacts:[]},{artifacts:[actor,actor]},{artifacts:[{...actor,id:'foreign'}]},{artifacts:[{...actor,facts:{...actor.facts,parentId:'foreign'}}]}]
test('SI-08b: early scene identity, parent and target errors recover in the existing two attempts',async()=>{
 for(const value of bad){let count=0;const result=await generateImportAiJson(request,context,new AbortController().signal,importAiPrompt(request),{generateText:async()=>({text:JSON.stringify(++count===1?value:valid),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})});assert.equal(count,2);assert.deepEqual(result,valid)}
})
test('SI-08c: permanent scene target or identity errors have static diagnostics and stop after two attempts',async()=>{
 for(const [index,value] of [...bad,{artifacts:[{...actor,'SECRET-KEY':'PRIVATE-VALUE'}]}].entries()){let count=0;await assert.rejects(generateImportAiJson(request,context,new AbortController().signal,importAiPrompt(request),{generateText:async()=>({text:JSON.stringify((count++,value)),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})}),(error:Error)=>{assert.match(error.message,/模型返回的场景资料结构无效（.+）/u);assert.ok(!/foreign|s-child|s-parent|南巷|artifacts|SECRET|PRIVATE/u.test(error.message));assert.ok(error.message.includes(index<=2?'单场景目标':index===4?'场景身份与上级关系':'场景字段格式'));return true});assert.equal(count,2)}
})
test('SI-08d: a top-level scene omits parent and scene diagnostics preserve network, abort and anchor errors',async()=>{
 const top={...request,entities:request.entities!.map(e=>{const {parentId:_parent,...entry}=e;return entry})},value={artifacts:[{...actor,facts:{entityType:'PLACE'}}]};let calls=0
 assert.deepEqual(await generateImportAiJson(top,context,new AbortController().signal,importAiPrompt(top),{generateText:async()=>({text:JSON.stringify((calls++,value)),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})}),value);assert.equal(calls,1)
 for(const message of ['网络中断','授权已变化']){let count=0;await assert.rejects(generateImportAiJson(request,context,new AbortController().signal,importAiPrompt(request),{generateText:async()=>{count++;throw Error(message)}}),new RegExp(message));assert.equal(count,1)}
 const abort=new AbortController();let canceled=0;await assert.rejects(generateImportAiJson(request,context,abort.signal,importAiPrompt(request),{generateText:async()=>{canceled++;abort.abort();throw new DOMException('取消','AbortError')}}),(error:Error)=>error.name==='AbortError');assert.equal(canceled,1)
 let anchors=0;await assert.rejects(generateImportAiJson(request,context,new AbortController().signal,importAiPrompt(request),{generateText:async()=>({text:JSON.stringify((anchors++,{artifacts:[{...actor,evidence:[{unitId:'u-scene',quote:'这是完全不存在的连续原文引文'}]}]})),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})}),/模型证据无法定位（no-match）/u);assert.equal(anchors,2)
})
