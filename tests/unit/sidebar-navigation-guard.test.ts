import assert from 'node:assert/strict'
import {test} from 'node:test'
import {useTabsStore,type Tab} from '../../src/stores/tabs'
import {registerSceneLeaveGuard} from '../../src/stores/scene-ui'
const source:Tab={id:'scene-source',type:'scene',novelId:'isolated',refId:'source',title:'源场景'}
const target:Tab={id:'scenario:new',type:'scenario',novelId:'isolated',refId:'new',title:'新试验场'}
function setup(){useTabsStore.setState({tabs:[source],activeTabId:source.id,activationNonce:1,previousTabIds:[],subTabs:{[source.id]:'draft'},panelFocus:null})}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve}}
test('SN-05 new scenario awaits the existing scene guard before atomic open',async()=>{
 setup();const gate=deferred();let count=0;const release=registerSceneLeaveGuard(source.id,()=>{count++;return gate.promise})
 try{const opened=useTabsStore.getState().openTabForNavigation(target,new AbortController().signal);assert.equal(count,1);assert.deepEqual(useTabsStore.getState().tabs,[source]);assert.deepEqual(useTabsStore.getState().previousTabIds,[]);gate.resolve();assert.equal(await opened,true);assert.equal(useTabsStore.getState().activeTabId,target.id);assert.deepEqual(useTabsStore.getState().previousTabIds,[source.id]);assert.equal(useTabsStore.getState().subTabs[source.id],'draft')}finally{release()}
})
test('SN-05 cancellation resolves busy immediately and never commits a late guard',async()=>{
 setup();const gate=deferred(),controller=new AbortController();const release=registerSceneLeaveGuard(source.id,()=>gate.promise)
 try{const opened=useTabsStore.getState().openTabForNavigation(target,controller.signal);controller.abort();assert.equal(await Promise.race([opened,new Promise(r=>setTimeout(()=>r('timeout'),100))]),false);gate.resolve();await new Promise(r=>setImmediate(r));assert.equal(useTabsStore.getState().activeTabId,source.id);assert.equal(useTabsStore.getState().tabs.length,1);assert.deepEqual(useTabsStore.getState().previousTabIds,[])}finally{release()}
})
test('SN-05 guard failure is observable; stale activation and replaced target cannot commit',async()=>{
 setup();const failure=new Error('隔离草稿未保存');let release=registerSceneLeaveGuard(source.id,async()=>{throw failure})
 try{await assert.rejects(useTabsStore.getState().openTabForNavigation(target,new AbortController().signal),e=>e===failure);assert.equal(useTabsStore.getState().activeTabId,source.id)}finally{release()}
 for(const mode of ['activation','target'] as const){setup();const gate=deferred();release=registerSceneLeaveGuard(source.id,()=>gate.promise);try{const move=useTabsStore.getState().openTabForNavigation(target,new AbortController().signal);if(mode==='activation')useTabsStore.setState(s=>({activationNonce:s.activationNonce+1}));else useTabsStore.setState(s=>({tabs:[...s.tabs,{...target,title:'另一个目标'}]}));gate.resolve();assert.equal(await move,false);assert.equal(useTabsStore.getState().activeTabId,source.id)}finally{release()}}
})
test('SN-05 an older void open cannot overwrite a later navigation when its guard finishes',async()=>{
 setup();const gate=deferred(),later={...target,id:'later',refId:'later'};let pending=true
 const release=registerSceneLeaveGuard(source.id,()=>pending?gate.promise:Promise.resolve())
 try{useTabsStore.getState().openTab(target);pending=false;assert.equal(await useTabsStore.getState().openTabForNavigation(later,new AbortController().signal),true);gate.resolve();await new Promise(r=>setImmediate(r));assert.equal(useTabsStore.getState().activeTabId,later.id);assert.equal(useTabsStore.getState().tabs.some(t=>t.id===target.id),false)}finally{release()}
})
