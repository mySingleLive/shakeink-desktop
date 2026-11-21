import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {transformSync} from 'esbuild'
import * as wizardLabels from '../../src/lib/desktop/novel-import-wizard'
import * as importShared from '../../desktop/shared/novel-import'
import * as wizardShared from '../../desktop/shared/novel-import-wizard'

// Actual renderer components and bridge with controlled hooks/IPC. No browser,
// Electron, filesystem source, provider or model is started by this fixture.
type Node={type:any;props:Record<string,any>}
const jsx={jsx:(type:any,props:any,key?:string)=>({type,props:{...props,key}}),jsxs:(type:any,props:any,key?:string)=>({type,props:{...props,key}}),Fragment:'fragment'}
function nodes(value:any):Node[]{return Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'&&'props'in value?[value,...nodes(value.props.children)]:[]}
function text(value:any):string{return Array.isArray(value)?value.map(text).join(''):value&&typeof value==='object'&&'props'in value?text(value.props.children):typeof value==='string'||typeof value==='number'?String(value):''}
const hash='a'.repeat(64),identity='s-0000000000000001',other='s-0000000000000002',member='b'.repeat(64),contextKey='c'.repeat(64)
function view(){return{id:'60103f7f-b69b-4d56-a228-417c8b7b6053',revision:4,phase:'select',title:'合成作品',models:{},files:[],selected:['body'],targets:['scene'],chapters:[],conflicts:[],patches:[],wizard:{version:1,sceneIdentityVersion:1,step:'detect-scene',stepState:{'detect-scene':'waiting'},sceneIdentitySummary:{version:1,ledgerHash:hash,identityRevision:2,concreteCount:0,sourceScopedCount:0,unresolvedCount:2,ownershipDone:0,ownershipTotal:2},candidates:{scene:[{id:identity,kind:'scene',name:'东宅书房',aliases:['书房'],selected:true,chapterCount:1,sources:['body'],sourceArtifactIds:[],sceneIdentityState:'unresolved'},{id:other,kind:'scene',name:'西宅书房',aliases:['书房'],selected:true,chapterCount:1,sources:['body'],sourceArtifactIds:[],sceneIdentityState:'unresolved'}]},images:{avatar:false,portrait:false,exterior:false,interior:false,icon:false},tasks:[],skipped:[]}} as any}
function detail(v:any= view()){return{ledgerHash:v.wizard.sceneIdentitySummary.ledgerHash,identityRevision:2,identityId:identity,state:'unresolved',name:'东宅书房',parent:{state:'unknown'},nameParts:[{kind:'literal',key:member}],totalMembers:1,members:[{key:member,origin:'body',literal:'书房',unitId:'working-0',range:{start:4,end:6},contextKeys:[contextKey]}],contexts:[{key:contextKey,label:'东宅'}],namePartOptions:[{kind:'literal',key:member,label:'书房'},{kind:'context',key:contextKey,label:'东宅'}],parentOptions:[{id:other,name:'西宅书房',evidenceOptions:[{key:contextKey,label:'东宅的原文'}]}],relations:[]}}
function fixture(){
 let responder:((action:any)=>Promise<any>)|undefined;let current=view(),state:any,hookPath='',cursor=0;const calls:any[]=[],effects:Array<()=>unknown>=[],slots=new Map<string,any[]>(),pending=new Map<string,{deps?:unknown[];cleanup?:()=>void}>(),modules=new Map<string,any>()
 const react={useState(initial:any){const row=slots.get(hookPath)??[];slots.set(hookPath,row);const at=cursor++;if(!(at in row))row[at]=typeof initial==='function'?initial():initial;return[row[at],(next:any)=>{row[at]=typeof next==='function'?next(row[at]):next}]},useRef(initial:any){const row=slots.get(hookPath)??[];slots.set(hookPath,row);const at=cursor++;return row[at]??(row[at]={current:initial})},useEffect(effect:()=>unknown,deps?:unknown[]){const key=hookPath+':'+cursor++,before=pending.get(key);if(!before||!deps||deps.some((value,i)=>value!==before.deps?.[i])){pending.set(key,{deps});effects.push(()=>{before?.cleanup?.();const cleanup=effect();if(typeof cleanup==='function')pending.get(key)!.cleanup=cleanup as ()=>void})}},useMemo(read:()=>unknown){return read()},useCallback(callback:unknown){return callback}}
 const window={desktop:{novelImport:async(action:any)=>{calls.push(structuredClone(action));if(responder)return responder(action);if(action.type==='wizard-read-scene-identity')return{view:structuredClone(current),sceneIdentityDetail:{...detail(current),identityId:action.identityId}};if(action.type==='wizard-read-scene-source')return{view:structuredClone(current),sceneIdentitySource:{ledgerHash:hash,memberKey:member,neighbor:0,unitId:'working-0',offset:0,total:9,text:'原文：书房😀。'}};return{view:structuredClone(current)}}}}
 const create=(initializer:()=>any)=>{state=initializer();return Object.assign((select:(v:any)=>unknown)=>select(state),{getState:()=>state,setState(change:any){state={...state,...(typeof change==='function'?change(state):change)}}})}
 function load(path:string){if(modules.has(path))return modules.get(path);const module={exports:{} as any};modules.set(path,module.exports);const code=transformSync(readFileSync(path,'utf8'),{loader:path.endsWith('tsx')?'tsx':'ts',format:'cjs',jsx:'automatic'}).code;const require=(id:string):any=>id==='react'?react:id==='react/jsx-runtime'?jsx:id==='zustand'?{create}:id==='sonner'?{toast:{error(){}}}:id==='lucide-react'?new Proxy({},{get:()=> 'svg'}):id==='@/components/ui/button'?{Button:'button'}:id==='@/components/ui/dialog'?{DialogTitle:'h2',DialogDescription:'p'}:id==='@desktop/shared/novel-import'?importShared:id==='@desktop/shared/novel-import-wizard'?wizardShared:id==='@/lib/desktop/novel-import-wizard'?wizardLabels:id==='@/lib/desktop/novel-import'?load('src/lib/desktop/novel-import.ts'):id==='./SceneIdentityDetails'?load('src/components/desktop/SceneIdentityDetails.tsx'):id==='@/stores/tabs'?{getTabIcon:()=>'svg'}:(()=>{throw Error('Unexpected controlled renderer dependency '+id)})();new Function('module','exports','require','window',code)(module,module.exports,require,window);modules.set(path,module.exports);return module.exports}
 const bridge=load('src/lib/desktop/novel-import.ts'),component=load('src/components/desktop/NovelImportWizard.tsx');bridge.useNovelImportStore.setState({view:current,open:true})
 function expand(value:any,path:string):any{if(Array.isArray(value))return value.map((child,i)=>expand(child,path+'.'+i));if(!value||typeof value!=='object'||!('props'in value))return value;if(typeof value.type==='function'){const previous=hookPath,at=cursor;hookPath=path+':'+value.type.name;cursor=0;const result=expand(value.type(value.props),hookPath);hookPath=previous;cursor=at;return result}return{...value,props:{...value.props,children:expand(value.props.children,path+'.children')}}}
 const render=()=>expand(jsx.jsx(component.NovelImportWizard,{view:current,busy:false,onStop(){},onRevise(){}}),'root')
 const settle=async()=>{let tree=render();for(let i=0;i<5;i++){for(const effect of effects.splice(0))effect();await new Promise(setImmediate);tree=render()}return tree}
 return{calls,bridge,render,settle,respond(fn:(action:any)=>Promise<any>){responder=fn},set(v:any){current=v;bridge.useNovelImportStore.setState({view:current})},get current(){return current},find(tree:any,label:string){const node=nodes(tree).find(n=>n.type==='button'&&(n.props['aria-label']===label||text(n.props.children)===label));assert.ok(node,'normal button exists: '+label);return node},nodes,text,cleanup(){for(const value of pending.values())value.cleanup?.()}}
}

// 487 A7 rewrites the former all-unresolved/disabled assertion: decision 1 (486 §1, 3R2-3) lets the author continue.
test('CIUI01: all-unresolved offers an enabled skip; a mixed selection imports the clear places and names the deferred count',async()=>{
 const f=fixture();try{const tree=f.render();assert.match(text(tree),/待确认/);const skip=f.find(tree,'跳过导入场景');assert.equal(skip.props.disabled,false);assert.doesNotMatch(text(tree),new RegExp(hash+'|'+identity));skip.props.onClick();await f.settle();assert.deepEqual(f.calls.at(-1),{type:'wizard-next',id:f.current.id,revision:4})
  const mixed=structuredClone(f.current);mixed.wizard.candidates.scene[0].sceneIdentityState='source-scoped';mixed.wizard.sceneIdentitySummary.sourceScopedCount=1;mixed.wizard.sceneIdentitySummary.unresolvedCount=1;f.set(mixed);const after=f.render();assert.equal(f.find(after,'导入 1 个场景').props.disabled,false);assert.match(text(after),/1 项归属待确认，不会导入，将在校验页列出；可在详情确认后再导入/)}finally{f.cleanup()}
})
test('CIUI14: excluded places show 非具体地点 and same-named places show their hints in the list and on import cards',()=>{
 const f=fixture();try{const v=structuredClone(f.current);v.wizard.candidates.scene=[{...v.wizard.candidates.scene[0],name:'书房',sceneIdentityState:'source-scoped',sceneHint:'东宅'},{...v.wizard.candidates.scene[1],name:'书房',sceneIdentityState:'source-scoped',sceneHint:'西宅'},{id:'s-0000000000000003',kind:'scene',name:'铜铃',aliases:[],selected:false,chapterCount:1,sources:['body'],sourceArtifactIds:[],sceneIdentityState:'source-scoped',sceneExcluded:true}];f.set(v)
  let all=text(f.render());assert.match(all,/非具体地点/);assert.match(all,/东宅/);assert.match(all,/西宅/)
  const importing=structuredClone(v);importing.wizard.step='import-scene';importing.wizard.stepState={'import-scene':'running'};importing.phase='running';importing.wizard.tasks=[{id:'e-0000000000000001',kind:'entity',candidateId:identity,state:'running',attempts:0},{id:'e-0000000000000002',kind:'entity',candidateId:other,state:'waiting',attempts:0}];f.set(importing);all=text(f.render());assert.match(all,/东宅/);assert.match(all,/西宅/)
 }finally{f.cleanup()}
})
test('CIUI15: a waiting import step without failures offers 继续导入 (resume with consent); a failure keeps the skip button',async()=>{
 const f=fixture();try{const v=structuredClone(f.current);v.wizard.step='import-scene';v.wizard.stepState={'import-scene':'waiting'};v.wizard.tasks=[{id:'e-0000000000000001',kind:'entity',candidateId:identity,state:'done',attempts:0},{id:'e-0000000000000002',kind:'entity',candidateId:other,state:'waiting',attempts:0}];f.set(v)
  let tree=f.render();assert.ok(!nodes(tree).some(n=>n.type==='button'&&text(n).includes('暂停')));const resume=f.find(tree,'继续导入');resume.props.onClick();await f.settle();assert.deepEqual(f.calls.at(-1),{type:'resume',id:f.current.id,revision:4,consent:true})
  const images=structuredClone(v);images.wizard.images.exterior=true;f.set(images);tree=f.render();f.find(tree,'继续导入').props.onClick();await f.settle();assert.deepEqual(f.calls.at(-1),{type:'resume',id:f.current.id,revision:4,consent:true,imageConsent:true})
  const failed=structuredClone(v);failed.wizard.images.exterior=false;failed.wizard.tasks[1].state='failed';f.set(failed);tree=f.render();assert.ok(!nodes(tree).some(n=>n.type==='button'&&text(n)==='继续导入'));assert.ok(nodes(tree).some(n=>n.type==='button'&&text(n).startsWith('跳过失败项并继续')))
 }finally{f.cleanup()}
})
test('CIUI16: the verify step lists places left unimported because their ownership is unresolved',()=>{
 const f=fixture();try{const v=structuredClone(f.current);v.wizard.step='verify';v.wizard.stepState={verify:'waiting'};v.wizard.checks=[{key:'scope',ok:true,detail:'一致'}];v.wizard.sceneIdentitySummary={...v.wizard.sceneIdentitySummary,deferred:[{id:identity,name:'东宅书房'},{id:other,name:'西宅书房'}],deferredTotal:3};f.set(v);const all=text(f.render());assert.match(all,/归属待确认，未导入/);assert.match(all,/东宅书房/);assert.match(all,/西宅书房/);assert.match(all,/3/)}finally{f.cleanup()}
})
test('CIUI02: the normal scene details button reads the bounded current identity through the actual bridge',async()=>{
 const f=fixture();try{let tree=f.render();await f.find(tree,'详情').props.onClick();tree=await f.settle();const call=f.calls.find(c=>c.type==='wizard-read-scene-identity');assert.ok(call,'details invokes the normal read action, rather than only rendering aliases');assert.deepEqual(call,{type:'wizard-read-scene-identity',id:f.current.id,revision:4,expectedLedgerHash:hash,identityId:identity,cursor:0,limit:50});assert.match(text(tree),/书房/);assert.doesNotMatch(text(tree),new RegExp(hash+'|'+member+'|'+contextKey))}finally{f.cleanup()}
})

async function opened(f:ReturnType<typeof fixture>){await f.find(f.render(),'详情').props.onClick();return f.settle()}
function control(tree:any,label:string){const node=nodes(tree).find(n=>n.props['aria-label']===label);assert.ok(node,'normal control exists: '+label);return node}
function explain(tree:any,value='根据合成原文核对具体归属'){control(tree,'场景身份修改说明').props.onChange({target:{value}})}

test('CIUI03: actual label, parent and defer handlers retain explanations and the displayed scope',async t=>{
 for(const operation of ['label','parent','defer'] as const)await t.test(operation,async()=>{
  const f=fixture();try{let tree=await opened(f);assert.equal(f.find(tree,'保存称呼').props.disabled,true);explain(tree);tree=f.render()
   if(operation==='parent'){control(tree,'直接上级地点').props.onChange({target:{value:other}});tree=f.render();const evidence=nodes(tree).find(n=>n.type==='fieldset'&&text(n).startsWith('上级关系依据'));assert.ok(evidence);const checkbox=nodes(evidence).find(n=>n.type==='input');assert.ok(checkbox);checkbox.props.onChange({target:{checked:true}});tree=f.render()}
   const label=operation==='label'?'保存称呼':operation==='parent'?'保存上级地点':'保持待确认';assert.equal(f.find(tree,label).props.disabled,false);await f.find(tree,label).props.onClick();await f.settle()
   const action=f.calls.find(c=>c.type==='wizard-scene-identity');assert.ok(action);assert.equal(action.op,operation);assert.equal(action.id,f.current.id);assert.equal(action.revision,4);assert.equal(action.expectedLedgerHash,hash);assert.equal(action.explanation,'根据合成原文核对具体归属');assert.equal(action.identityId,identity);assert.equal(importShared.importActionSchema.safeParse(action).success,true)
   if(operation==='label')assert.deepEqual(action.nameParts,[{kind:'literal',key:member}]);if(operation==='parent'){assert.equal(action.parentId,other);assert.deepEqual(action.evidenceKeys,[member])}assert.doesNotMatch(text(f.render()),new RegExp(hash+'|'+identity+'|'+member))
  }finally{f.cleanup()}
 })
})

test('CIUI04: normal partition assigns every loaded mention once without copying content',async()=>{
 const f=fixture(),second='d'.repeat(64)
 f.respond(async action=>action.type==='wizard-read-scene-identity'?{view:structuredClone(f.current),sceneIdentityDetail:{...detail(f.current),totalMembers:2,members:[...detail().members,{key:second,origin:'body',literal:'另一书房',unitId:'working-1',range:{start:0,end:4},contextKeys:[]}],namePartOptions:[...detail().namePartOptions,{kind:'literal',key:second,label:'另一书房'}]}}:{view:structuredClone(f.current)})
 try{let tree=await opened(f);explain(tree);tree=f.render();await f.find(tree,'添加一个地点').props.onClick();tree=f.render();control(tree,'分配 另一书房（第 2 处提及）').props.onChange({target:{value:'1'}});tree=f.render();control(tree,'地点 1 归属状态').props.onChange({target:{value:'source-scoped'}});tree=f.render();const labelField=nodes(tree).find(n=>n.type==='fieldset'&&text(n).startsWith('地点 2 称呼'));assert.ok(labelField);const check=nodes(labelField).find(n=>n.type==='input');assert.ok(check);check.props.onChange({target:{checked:true}});tree=f.render();assert.equal(f.find(tree,'保存归属分配').props.disabled,false);await f.find(tree,'保存归属分配').props.onClick();await f.settle();const action=f.calls.find(c=>c.type==='wizard-scene-identity');assert.ok(action);assert.equal(action.op,'partition');assert.deepEqual(action.identityIds,[identity]);assert.deepEqual(action.parts.map((part:any)=>part.memberKeys),[[member],[second]]);assert.ok(action.parts.every((part:any)=>!('facts'in part)&&!('text'in part)));assert.equal(importShared.importActionSchema.safeParse(action).success,true)
 }finally{f.cleanup()}
})

test('CIUI05: member and source pagination use bounded normal actions, never original file IDs',async()=>{
 const f=fixture(),all=Array.from({length:51},(_,index)=>({...detail().members[0],key:(index+1).toString(16).padStart(64,'0'),literal:'提及'+index}))
 f.respond(async action=>{if(action.type==='wizard-read-scene-identity')return{view:structuredClone(f.current),sceneIdentityDetail:{...detail(),totalMembers:51,members:all.slice(action.cursor,action.cursor+action.limit),...(action.cursor===0?{nextCursor:50}:{})}};if(action.type==='wizard-read-scene-source')return{view:structuredClone(f.current),sceneIdentitySource:{ledgerHash:hash,memberKey:action.memberKey,neighbor:action.neighbor,unitId:'working-0',offset:action.offset,total:40000,text:action.offset===0?'原文😀𠀀\r\n':'尾部原文',...(action.offset===0?{nextOffset:32768}:{})}};return{view:structuredClone(f.current)}})
 try{let tree=await opened(f);await f.find(tree,'下一页提及').props.onClick();tree=await f.settle();assert.ok(f.calls.some(c=>c.type==='wizard-read-scene-identity'&&c.cursor===50&&c.limit===50));await f.find(tree,'查看原文').props.onClick();tree=await f.settle();assert.match(text(tree),/原文😀𠀀\r\n/);await f.find(tree,'下一页原文').props.onClick();tree=await f.settle();assert.match(text(tree),/尾部原文/);const read=f.calls.filter(c=>c.type==='wizard-read-scene-source');assert.deepEqual(read.map(c=>c.offset),[0,32768]);assert.ok(read.every(c=>c.limit===32768&&!('fileId'in c)));await f.find(tree,'读取全部提及以调整归属').props.onClick();tree=await f.settle();assert.match(text(tree),/已读取 51 处提及/);assert.equal(nodes(tree).filter(n=>n.type==='select'&&String(n.props['aria-label']).startsWith('分配 ')).length,50,'allocation UI remains paged after collecting the complete partition');assert.equal(f.calls.some(c=>!['wizard-read-scene-identity','wizard-read-scene-source'].includes(c.type)),false)
 }finally{f.cleanup()}
})

test('CIUI06: stale reads and decisions fail closed without upgrading or resending the draft',async()=>{
 const f=fixture();try{const scope=f.bridge.sceneIdentityScope(f.current),pending=Promise.withResolvers<any>();f.respond(async()=>pending.promise);const read=f.bridge.readNovelImportSceneIdentity(scope,identity);f.set({...f.current,revision:5});pending.resolve({view:structuredClone(f.current),sceneIdentityDetail:detail()});await assert.rejects(read,/清单已变化/);const before=f.calls.length;await assert.rejects(f.bridge.saveNovelImportSceneIdentity(scope,{op:'defer',identityId:identity,expectedLedgerHash:hash,explanation:'合成说明'}),/清单已变化/);assert.equal(f.calls.length,before,'stale command is never upgraded or resent');assert.equal(f.bridge.useNovelImportStore.getState().view.revision,5)}finally{f.cleanup()}
})

test('CIUI07: failed save retains the form and current view; later view changes disable its issued draft',async()=>{
 const f=fixture();try{let tree=await opened(f);const before=structuredClone(f.bridge.useNovelImportStore.getState().view);explain(tree,'保留的合成说明');f.respond(async action=>{if(action.type==='wizard-scene-identity')throw Error('保存未完成，请重试');return{view:structuredClone(f.current)}});tree=f.render();await f.find(tree,'保存称呼').props.onClick();tree=await f.settle();assert.match(text(tree),/保存未完成，请重试/);assert.equal(control(tree,'场景身份修改说明').props.value,'保留的合成说明');assert.deepEqual(f.bridge.useNovelImportStore.getState().view,before);assert.equal(f.bridge.useNovelImportStore.getState().busy,0);assert.equal(f.calls.filter(c=>c.type==='wizard-scene-identity').length,1);assert.equal(f.calls.filter(c=>c.type==='current').length,1,'a failure may refresh the authoritative view but never resends the decision');f.set({...f.current,revision:5});tree=f.render();assert.equal(f.find(tree,'保存称呼').props.disabled,true);assert.match(text(tree),/重新打开详情/)}finally{f.cleanup()}
})

test('CIUI08: truly old scene views retain their original details and enabled import path',async()=>{
 const f=fixture();try{const old=structuredClone(f.current);delete old.wizard.sceneIdentitySummary;delete old.wizard.sceneIdentityVersion;f.set(old);let tree=f.render();await f.find(tree,'详情').props.onClick();tree=await f.settle();assert.match(text(tree),/别名：书房/);assert.equal(f.find(tree,'导入 2 个场景').props.disabled,false);assert.equal(f.calls.length,0)}finally{f.cleanup()}
})

test('CIUI09: a normal complete partition can include another existing identity even when the first page is complete',async()=>{
 const f=fixture(),second='e'.repeat(64)
 f.respond(async action=>{if(action.type==='wizard-read-scene-identity'){const next=detail();if(action.identityId===other){next.identityId=other;next.name='西宅书房';next.members=[{...next.members[0],key:second,literal:'西书房',contextKeys:[]}];next.nameParts=[{kind:'literal',key:second}];next.namePartOptions=[{kind:'literal',key:second,label:'西书房'}]}return{view:structuredClone(f.current),sceneIdentityDetail:next}}return{view:structuredClone(f.current)}})
 try{let tree=await opened(f);const group=nodes(tree).find(n=>n.type==='fieldset'&&text(n).startsWith('一起核对的地点'));assert.ok(group);const box=nodes(group).find(n=>n.type==='input');assert.ok(box);assert.equal(!!box.props.disabled,false,'a fully loaded first identity must not prevent choosing another identity');box.props.onChange({target:{checked:true}});tree=f.render();await f.find(tree,'读取全部提及以调整归属').props.onClick();tree=await f.settle();assert.match(text(tree),/已读取 2 处提及/);explain(tree);tree=f.render();await f.find(tree,'保存归属分配').props.onClick();await f.settle();const action=f.calls.find(c=>c.type==='wizard-scene-identity');assert.ok(action);assert.deepEqual(action.identityIds,[identity,other]);assert.deepEqual(action.parts.flatMap((part:any)=>part.memberKeys).sort(),[member,second].sort())}finally{f.cleanup()}
})

test('CIUI10: a late save receipt cannot replace a different newer authoritative identity view',async()=>{
 const f=fixture();try{const scope=f.bridge.sceneIdentityScope(f.current),pending=Promise.withResolvers<any>(),before=structuredClone(f.current);f.respond(async()=>pending.promise);const saving=f.bridge.saveNovelImportSceneIdentity(scope,{op:'defer',identityId:identity,expectedLedgerHash:hash,explanation:'保留待确认'});const newer=structuredClone(before);newer.revision=5;newer.wizard.sceneIdentitySummary.ledgerHash='f'.repeat(64);newer.wizard.sceneIdentitySummary.identityRevision=3;f.set(newer);const receipt=structuredClone(newer);receipt.wizard.sceneIdentitySummary.ledgerHash='e'.repeat(64);pending.resolve({view:receipt});await assert.rejects(saving,/回执未采用/);assert.deepEqual(f.bridge.useNovelImportStore.getState().view,newer);assert.equal(f.calls.length,1);assert.equal(f.bridge.useNovelImportStore.getState().busy,0)}finally{f.cleanup()}
})

test('CIUI11: paused details can be read but normal author controls remain disabled',async()=>{
 const f=fixture();try{f.set({...f.current,phase:'paused'});const tree=await opened(f);assert.ok(f.calls.some(c=>c.type==='wizard-read-scene-identity'));for(const label of ['保存称呼','保存上级地点','保持待确认','添加一个地点'])assert.equal(f.find(tree,label).props.disabled,true,label);assert.equal(f.calls.some(c=>c.type==='wizard-scene-identity'),false)}finally{f.cleanup()}
})

test('CIUI12: repeated normal save clicks issue one mutation until its acknowledged result',async()=>{
 const f=fixture();try{let tree=await opened(f);explain(tree);tree=f.render();const pending=Promise.withResolvers<any>();f.respond(async()=>pending.promise);const save=f.find(tree,'保存称呼');save.props.onClick();save.props.onClick();await new Promise(setImmediate);assert.equal(f.calls.filter(c=>c.type==='wizard-scene-identity').length,1);pending.resolve({view:structuredClone(f.current)});await f.settle();assert.equal(f.bridge.useNovelImportStore.getState().busy,0);assert.equal(f.calls.filter(c=>c.type==='wizard-scene-identity').length,1)}finally{f.cleanup()}
})

test('CIUI13: identical literal allocation rows keep their real contexts and page-specific source actions',async()=>{
 const f=fixture(),westContext='d'.repeat(64),all=Array.from({length:51},(_,index)=>({...detail().members[0],key:(index+1).toString(16).padStart(64,'0'),literal:'书房',unitId:'working-'+index,range:{start:4,end:6},contextKeys:[index===50?westContext:contextKey]}))
 f.respond(async action=>{
  if(action.type==='wizard-read-scene-identity'){const rows=all.slice(action.cursor,action.cursor+action.limit),contexts=action.cursor===50?[{key:westContext,label:'西宅'}]:[{key:contextKey,label:'东宅'}];return{view:structuredClone(f.current),sceneIdentityDetail:{...detail(),totalMembers:51,members:rows,contexts,nameParts:[{kind:'literal',key:all[0].key}],namePartOptions:[...rows.map(row=>({kind:'literal',key:row.key,label:'书房'})),...contexts.map(value=>({kind:'context',key:value.key,label:value.label}))],...(action.cursor===0?{nextCursor:50}:{})}}}
  if(action.type==='wizard-read-scene-source')return{view:structuredClone(f.current),sceneIdentitySource:{ledgerHash:hash,memberKey:action.memberKey,neighbor:action.neighbor,unitId:action.neighbor===0?'working-50':'working-51',offset:0,total:13,text:action.neighbor===0?'西宅里，书房有红墙𠀀。':'西宅下一段原文😀。'}}
  return{view:structuredClone(f.current)}
 })
 try{
  let tree=await opened(f);await f.find(tree,'读取全部提及以调整归属').props.onClick();tree=await f.settle()
  const allocationRows=(value:any)=>nodes(value).filter(node=>node.type==='li'&&nodes(node).some(child=>child.type==='select'&&String(child.props['aria-label']).startsWith('分配 ')))
  assert.match(text(allocationRows(tree)[0]),/东宅/,'same literal rows must show their actual context, not merely the word 书房')
  await f.find(tree,'下一页分配').props.onClick();tree=f.render();const rows=allocationRows(tree);assert.equal(rows.length,1);assert.match(text(rows[0]),/西宅/,'the allocation page uses loaded member context, not the separate read-only member page');assert.match(text(rows[0]),/51/)
  await f.find(rows[0],'查看这处原文').props.onClick();tree=await f.settle();assert.match(text(tree),/西宅里，书房有红墙𠀀。/);await f.find(tree,'后一段').props.onClick();tree=await f.settle();assert.match(text(tree),/西宅下一段原文😀。/)
  const reads=f.calls.filter(call=>call.type==='wizard-read-scene-source');assert.deepEqual(reads.map(call=>({memberKey:call.memberKey,neighbor:call.neighbor,limit:call.limit})),[{memberKey:all[50].key,neighbor:0,limit:32768},{memberKey:all[50].key,neighbor:1,limit:32768}]);assert.equal(f.calls.some(call=>call.type==='wizard-scene-identity'),false);assert.doesNotMatch(text(rows[0]),new RegExp(all[50].key+'|'+westContext+'|'+hash))
 }finally{f.cleanup()}
})
