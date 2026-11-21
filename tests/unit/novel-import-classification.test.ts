import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NovelImportController} from '../../desktop/main/novel-import'
import {runImportAi,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload,importAiPrompt,assertImportFixedPromptReserve} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportAiResult,ImportArtifact,ImportSession,ImportUnit,ImportModel} from '../../desktop/shared/novel-import'
// Historical literals were independently computed before production edits.
// Approved semantic contract revisions update their hashes; legacy and source classification stay unchanged.
const GOLDEN={
 "referenceMethod": "independent literal strings + Python ordered JSON/SHA; no production imports or helper output",
 "preChangePromptPayload": {
  "legacy-classify": {
   "payload": "6eb9fcbaae2b37fc8cd1eb134fc908ec4eef4fe9df5af507297d74bb1f067abb",
   "prompt": "5a12a3238f265fda34712616d1bf5490507f0e60b1961856fd4c7d96bf54bf15"
  },
  "legacy-analyze": {
   "payload": "3f4c906b73e265197497bd6fefd530f1c1b74f8ed9638cf32f73fd75222b6741",
   "prompt": "9f73c43f422932be5641323f6fe58a798b1cb2a271e6cd13c362d659f1450962"
  },
  "legacy-review": {
   "payload": "2dc8b8e801492678f688b218f03e6265fb5596113a4c234e6f468215a6b0c8f5",
   "prompt": "5bcc47ecbd5a5067a323cd89ab53a59eb2efafdae0257a4a80eaf50c5d2fe707"
  },
  "legacy-patch": {
   "payload": "2c73b5060513a9f4a4a26d96356fe6499fc9a986dc06c3b6b84eea7afb12a96d",
   "prompt": "495aba442670cdc725ace4aced5d3f85556aedfffb9dd4600011ebf6d0a359ed"
  },
  "semantic-classify": {
   "payload": "900e6aebcda79dc2bb6d903634227b6e591757ebde719263310b5d3cd374a5b8",
   "prompt": "f7c451ef509943f3b543d0c5a1072452cc8bcd8880a9c17fbdaedbff625b650e"
  },
  "semantic-analyze": {
   "payload": "2aa81b7dc161ae4baaeba4182fbaa601217f7fd6b94d119722ae8c424ac3ca40",
   "prompt": "65ecf33c05d95710c3b9d8a82c74158904532dcf46cdc88489bc53128479f042"
  },
  "semantic-review": {
   "payload": "b6467af2a6317b02e0b329dc12d7e5bfe5178261106e4a4a69ee7544c9a215b5",
   "prompt": "877d56c4ef66523238ed6eec7e703b8955d7d261670c72f1bd962de66c3c6d13"
  },
  "semantic-patch": {
   "payload": "9b91a1549898a4c4c00935a1cbfe4b50c81cee8b3c2260725d16872062d53ea7",
   "prompt": "08bbaac181e043f0b94fec8232745ac2f08ea51a5aed65d1bd88614cfb61cfe7"
  },
  "semantic-reconcile": {
   "payload": "d576d6cf844bfc6b2eb29dbcf04dcce5bde9a5260fcae16c87941302af0a6b1c",
   "prompt": "9234cdb98339a866dc6e2bc547c84d9bb4f2330e5e8738e8baa4245fe6dee85f"
  }
 },
 "oldSemanticEmptyClassifyPromptHash": "2e539e4f7975bd340b00595d11614bb4653025f4fa011aad81b476aaca3f47ec",
 "oldClassificationSourceHash": {
  "legacy": "241469228452a71e7b7804ad95660360bf17d3c8cfcbe01e1570298f383da277",
  "semantic": "741c847ef5a3cf7eeec1e9e550d54e643ee71aba1c5c6a27617234e87624cf83"
 },
 "sourceGeometryHash": "366ab6d6f96deb2cf96003befed5224ffa56aa18cd7741aedb3aa20af431595b",
 "legacyWorkingGeometryHash": "538e1f219e8990c2f959922b1da6dc6490839bc91c511d9fcc9b42932fc3fb93",
 "sourceUnits": 91,
 "sourceUtf16Characters": 90012
} as const
const sha=(s:string)=>createHash('sha256').update(s).digest('hex')
function stable(v:unknown):string{if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+stable(x)).join(',')+'}';return JSON.stringify(v)??'null'}
const digest=(v:unknown)=>sha(stable(v)),small:ImportModel={id:'classification-text',name:'合成分类模型',modelId:'synthetic',endpoint:'https://classification.invalid/v1',authRevision:1,contextWindow:16000},large={...small,contextWindow:1048576},review={...large,id:'classification-review'}
const units:ImportUnit[]=[{id:'u',fileId:'f',start:0,end:4,text:'正文内容',kind:'world'},{id:'v',fileId:'f',start:4,end:10,text:'资料\r\n😀',kind:'character'}]
const person:ImportArtifact={id:'p',kind:'character',name:'合成人物',text:'完整资料',facts:{roleType:'SUPPORTING',aliases:'[]',relationships:'[]'},evidence:[{unitId:'u',quote:'正文'}],sourceUnitIds:['u'],origin:'inferred'}
function request(label:string,semantic:boolean):ImportAiRequest{const phase=label==='reconcile'?'analyze':label as ImportAiRequest['phase'];return {operationId:'11111111-1111-4111-8111-111111111111',phase,...(['analyze','reconcile'].includes(label)?{kind:'character' as const}:{}),units:structuredClone(units),artifacts:label==='reconcile'?[structuredClone(person)]:[],workingRevision:0,models:{text:small,review:small},...(semantic?{semanticVersion:1,selectedTargets:['world','character']}:{}),...(label==='reconcile'?{intent:'reconcile',reconcile:{targetIds:['p'],locks:[],decisionHash:'c'.repeat(64),workingRevision:0}}:{})}}
test('NI-C01: source classification uses a separate contract without changing other AI phases',async()=>{
 for(const semantic of [false,true])for(const label of ['classify','analyze','review','patch',...(semantic?['reconcile']:[])]){if(semantic&&label==='classify')continue;const r=request(label,semantic),before=structuredClone(r),key=(semantic?'semantic-':'legacy-')+label;let prompt='';const response=label==='classify'?{classifications:r.units.map(u=>({unitId:u.id,kind:'body'}))}:label==='analyze'?{notFound:true}:label==='reconcile'?{artifactEdits:[],conflicts:[]}:label==='review'?{conflicts:[]}:{patches:[]};const call=runImportAi(r,new AbortController().signal,{resolve:async()=>small,assert:async()=>{},generate:async(_r,_m,_s,p)=>{prompt=p;return response}});if(label==='patch')await assert.rejects(call,/未生成可核对的正文修改/);else await call;const golden=GOLDEN.preChangePromptPayload[key as keyof typeof GOLDEN.preChangePromptPayload];assert.equal(sha(serializeImportAiPayload(r)),golden.payload,key+' frozen payload');assert.equal(sha(prompt),golden.prompt,key+' frozen prompt');assert.deepEqual(r,before)}
 const r=request('classify',true),before=structuredClone(r);let prompt='';const result={classifications:[{unitId:'u',kind:'world' as const},{unitId:'v',kind:'unknown' as const}]},call=async(raw:unknown)=>runImportAi(r,new AbortController().signal,{resolve:async()=>small,assert:async()=>{},generate:async(_r,_m,_s,p)=>{prompt=p;return raw}});assert.deepEqual((await call(result)).classifications,result.classifications,'the adapter must not force a body result');assert.deepEqual(r,before);const fixed=prompt.split('<novel-import-data>')[0],output=fixed.split('<phase-output-contract>')[1].split('</phase-output-contract>')[0];assert.ok(!fixed.includes('<semantic-native-contract>'));for(const forbidden of ['roleType','facts是字符串字典','worldline须lineId','narrative须全书chapterIndex'])assert.ok(!fixed.includes(forbidden));assert.ok(output.includes('classifications'));for(const word of ['artifacts:','artifactEdits:','patches:','missingTargets:','facts:'])assert.ok(!output.includes(word));for(const kind of ['body','outline','theme','style','world','character','scene','item','foreshadow','goldenFinger','trope','worldline','narrative','unknown'])assert.ok(fixed.includes(kind));for(const phrase of ['原作','对白','回忆','单列','selectedTargets','不可信','unknown'])assert.ok(fixed.includes(phrase));const payload=JSON.parse(prompt.split('<novel-import-data>')[1].split('</novel-import-data>')[0]);assert.deepEqual(payload.units,units.map(u=>({...u,kind:'unknown'})));assert.equal(payload.units.map((u:ImportUnit)=>u.text).join(''),units.map(u=>u.text).join(''));assertImportFixedPromptReserve(prompt,serializeImportAiPayload(r));assert.notEqual(sha(importAiPrompt({phase:'classify',semanticVersion:1,units:[],artifacts:[]},'')),GOLDEN.oldSemanticEmptyClassifyPromptHash)
 for(const raw of [{classifications:[]},{classifications:[{unitId:'u',kind:'body'},{unitId:'u',kind:'world'}]},{classifications:[{unitId:'foreign',kind:'body'},{unitId:'v',kind:'body'}]},{classifications:[{unitId:'u',kind:'excluded'},{unitId:'v',kind:'body'}]},{...result,artifacts:[person]},{...result,artifactEdits:[{artifactId:'p',baseHash:'x',reason:'越阶段',evidence:person.evidence}]},{...result,missingTargets:[{kind:'world',unitIds:['u'],evidence:person.evidence,reason:'越阶段'}]},{...result,patches:[{id:'patch',start:0,end:1,before:'正',after:'新',reason:'越阶段',workingRevision:0,conflictId:'conflict'}]}])await assert.rejects(call(raw),/覆盖|结构|类别|阶段|越权|单元/)
})
test('LOTM-L-C03: partial classifications use the existing single correction without weakening final coverage',async()=>{
 const r=request('classify',true),rows=r.units.map(unit=>({unitId:unit.id,kind:'body' as const}))
 for(const invalid of [{classifications:rows.slice(1)},{classifications:[rows[0],rows[0]]},{classifications:[rows[0],{unitId:'foreign',kind:'body'}]},{}]){
  let calls=0
  const result=await generateImportAiJson(r,{userId:'synthetic',resolvedModel:{} as any},new AbortController().signal,importAiPrompt(r),{generateText:async()=>{calls++;return{text:JSON.stringify(calls===1?invalid:{classifications:rows}),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})
  assert.equal(calls,2);assert.deepEqual(result.classifications,rows)
 }
 for(const invalid of [{classifications:rows.slice(1)},{}]){let calls=0;await assert.rejects(generateImportAiJson(r,{userId:'synthetic',resolvedModel:{} as any},new AbortController().signal,importAiPrompt(r),{generateText:async()=>{calls++;return{text:JSON.stringify(invalid),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),(error:any)=>error?.kind==='invalid_schema'&&error.invalidFields.every((path:string)=>path==='classifications'));assert.equal(calls,2)}
})
const text='HEAD😀'+'x'.repeat(90000)+'TAIL😀'
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
async function until(check:()=>boolean){for(let n=0;n<1000&&!check();n++)await new Promise(r=>setTimeout(r,2));assert.ok(check(),'controlled classification window reached')}
type Checkpoint=ImportSession&{classificationCheckpoint?:{sourceHash:string;resultHash:string}}
async function fixture(handler:(r:ImportAiRequest)=>Promise<ImportAiResult>,sourceText=text){const root=await realpath(await mkdtemp(join(tmpdir(),'classification-'))),app=join(root,'app'),target=join(root,'target'),path=join(root,'source.txt');await mkdir(app);await mkdir(target);await writeFile(path,sourceText);const info=await stat(target,{bigint:true}),requests:ImportAiRequest[]=[];let cancel=()=>{},controller:NovelImportController;const options={root:app,choose:async()=>[path],chooseTarget:async()=>({path:target,device:String(info.dev),inode:String(info.ino)}),protectedDirectories:async()=>[],models:async()=>({text:large,review}),scan:async()=>[{id:'source',name:'材料.txt',path,format:'txt' as const,bytes:Buffer.byteLength(sourceText),hash:sha(sourceText),text:sourceText,included:true}],verifySources:async()=>assert.equal(await readFile(path,'utf8'),sourceText),ai:(r:ImportAiRequest)=>{requests.push(structuredClone(r));return handler(r)},cancelAi:async()=>cancel(),publish:async(input:{session:ImportSession;importHash:string})=>({requestId:input.session.id,workId:'synthetic-work',novelId:'synthetic-novel',importHash:input.importHash})};controller=new NovelImportController(options);await controller.initialize();const act=async(type:string,extra:Record<string,unknown>={})=>{const v=(await controller.act({type:'current'})).view;return controller.act({type,...(type==='choose'?{}:{id:v!.id,revision:v!.revision}),...extra})};const saved=async()=>{const v=(await controller.act({type:'current'})).view!;return JSON.parse(await readFile(join(app,'novel-imports',v.id,'session.json'),'utf8')) as Checkpoint};/* An unsaved draft is deleted on close and never restored (doc 235). The journal checkpoint is reloaded into the live
  controller instead: pause, optionally rewrite the on-disk journal, drop send grants and bump the epoch, persist. */
  const reload=async(replace?:(s:Checkpoint)=>void)=>{await controller.pauseAll();const c=controller as any;await c.serial(async()=>{const live=c.session as Checkpoint,s=JSON.parse(await readFile(join(app,'novel-imports',live.id,'session.json'),'utf8')) as Checkpoint;replace?.(s);assert.ok(c.validJournal(s,live.id),'reloaded journal stays valid');delete (s as any).classificationGrant;delete (s as any).structureGrant;delete (s as any).analysisGrant;s.epoch=live.epoch+1;(s as any).targetNeedsAuthorization=!!s.target;if(['running','recognizing','publishing'].includes(s.phase)){s.resumePhase=s.phase as any;s.phase='paused'}for(const key of Object.keys(live))delete (live as any)[key];Object.assign(live,s);await c.save()})};const drain=async()=>{await until(()=>controller.active===0);return (await controller.act({type:'current'})).view!};return {requests,act,saved,reload,drain,setCancel(fn:()=>void){cancel=fn},async dispose(){await controller.close();await rm(root,{recursive:true,force:true})}}}
const omitKind=(u:ImportUnit)=>{const {kind:_kind,...rest}=u;return rest}
const resultHash=(s:ImportSession)=>digest({kinds:s.units.map(({id,kind})=>({id,kind})),coverage:s.coverage.classify??[]})
const valid=(r:ImportAiRequest,kind:'body'|'world'='body'):ImportAiResult=>({classifications:r.units.map(u=>({unitId:u.id,kind}))})
test('LOTM-L-C04: coverage failures split only the failed batch and commit successful children',async()=>{
 let rootFailure=true,creditAtFirstChild:string[]|undefined
 const f=await fixture(async r=>{if(rootFailure){rootFailure=false;throw Error('模型返回结构不完整（classifications）')}if(r.units.length===41)creditAtFirstChild=[...((await f.saved()).coverage.classify??[])];return valid(r)})
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});await f.drain();const s=await f.saved();assert.equal(s.phase,'select',s.error);assert.deepEqual(f.requests.map(r=>r.units.length),[81,41,40,10]);assert.deepEqual(creditAtFirstChild,[]);assert.equal(s.coverage.classify?.length,91);assert.equal(s.units.map(u=>u.text).join(''),text)}finally{await f.dispose()}
})

test('LOTM-L-C04: a failed right child never replays the successful left child and resumes only its unit',async()=>{
 let recover=false,creditAtFirstChild:string[]|undefined
 const f=await fixture(async r=>{if(r.units.length===41)creditAtFirstChild=[...((await f.saved()).coverage.classify??[])];if(!recover&&r.units.length>1)throw Error('模型返回结构不完整（classifications）');if(!recover&&r.units.length===1&&r.units[0].start===80000)throw Error('模型返回结构不完整（classifications）');return valid(r)})
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});await f.drain();const failed=await f.saved();assert.equal(failed.phase,'failed');assert.deepEqual(creditAtFirstChild,[]);assert.equal(failed.coverage.classify?.length,80);recover=true;await f.act('classify',{mode:'ai',consent:true});await f.drain();const done=await f.saved();assert.equal(done.phase,'select',done.error);assert.deepEqual(f.requests.at(-1)!.units.map(u=>u.id),failed.units.filter(u=>!failed.coverage.classify!.includes(u.id)).map(u=>u.id));assert.equal(done.coverage.classify?.length,91);assert.equal(done.units.map(u=>u.text).join(''),text);assert.equal(done.files[0].hash,sha(text))}finally{await f.dispose()}
})

test('LOTM-L-C04: singleton and non-coverage failures remain closed without more credit',async()=>{
 const f=await fixture(async()=>{throw Error('模型返回结构不完整（classifications）')})
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});await f.drain();const failed=await f.saved();assert.equal(failed.phase,'failed');assert.equal(failed.coverage.classify?.length??0,0);assert.equal(failed.units.map(u=>u.text).join(''),text);assert.ok(f.requests.some(r=>r.units.length===1))}finally{await f.dispose()}
 const network=await fixture(async()=>{throw Error('NETWORK_FAILURE')})
 try{await network.act('choose',{mode:'files'});await network.act('classify',{mode:'ai',consent:true});assert.equal((await network.drain()).phase,'failed');assert.equal(network.requests.length,1);assert.equal((await network.saved()).coverage.classify?.length??0,0)}finally{await network.dispose()}
})

test('LOTM-L-C05: known whitespace never repeats provider work and survives recovery',async()=>{
 for(const kind of ['body','unknown'] as const){const sourceText='第一章 开始\n\n第二卷 归途\n第二章 继续\n乙。',f=await fixture(async r=>valid(r),sourceText)
  try{await f.act('choose',{mode:'files'});await f.act('set-range',{fileId:'source',start:sourceText.indexOf('\n\n'),end:sourceText.indexOf('\n\n')+2,kind});await f.act('classify',{mode:'ai',consent:true});await f.drain();const before=await f.saved(),sourceHash=before.classificationCheckpoint!.sourceHash;assert.equal(before.phase,'select',before.error);assert.equal(before.units.find(u=>!u.text.trim())?.kind,'body');assert.equal(before.coverage.classify?.length,before.units.filter(u=>u.kind!=='excluded').length);assert.ok(f.requests.every(r=>r.units.every(u=>u.text.trim())));const count=f.requests.length;await f.reload();await f.act('classify',{mode:'ai',consent:true});const after=await f.drain();assert.equal(after.phase,'select',after.error);assert.equal(f.requests.length,count);assert.equal((await f.saved()).classificationCheckpoint!.sourceHash,sourceHash);assert.equal((await f.saved()).units.map(u=>u.text).join(''),sourceText)}finally{await f.dispose()}
 }
})

test('LOTM-L-C05: excluded whitespace stays excluded and an unresolved prefix is not forced into body',async()=>{
 for(const kind of ['excluded','unknown'] as const){const sourceText='\n\n第一章 开始\n乙。',f=await fixture(async r=>({classifications:r.units.map(u=>({unitId:u.id,kind:u.text.trim()?'body':'unknown'}))}),sourceText)
  try{await f.act('choose',{mode:'files'});await f.act('set-range',{fileId:'source',start:0,end:2,kind});await f.act('classify',{mode:'ai',consent:true});await f.drain();const s=await f.saved();assert.equal(s.units.find(u=>!u.text.trim())?.kind,kind);assert.equal(s.units.map(u=>u.text).join(''),sourceText);assert.ok(f.requests.every(r=>r.units.every(u=>u.text.trim()||kind==='unknown')))}finally{await f.dispose()}
 }
})

test('NI-C02: changed classification contracts invalidate old credit while matching contracts resume',async t=>{
 await t.test('old-contract-reopens-neutral-copies-with-atomic-invalid-response',async()=>{let mode='pending',release:(result:ImportAiResult)=>void=()=>{};const f=await fixture(r=>mode==='valid'?Promise.resolve(valid(r,'world')):Promise.reject(Error('受控分类失败')));f.setCancel(()=>release({classifications:[]}));try{await f.act('choose',{mode:'files'});const initial=await f.saved();assert.equal(initial.units.length,91);assert.equal(digest(initial.units),GOLDEN.sourceGeometryHash);await f.reload(s=>{s.units.forEach((u,i)=>{u.kind=(['world','character','theme'] as const)[i%3]});s.coverage={classify:s.units.map(u=>u.id)};s.phase='paused';s.resumePhase='recognizing';s.classificationCheckpoint={sourceHash:GOLDEN.oldClassificationSourceHash.semantic,resultHash:resultHash(s)}});const old=await f.saved();for(const invalid of ['missing','duplicate','foreign','kind','cross-phase']){const offset=f.requests.length;await f.act('classify',{mode:'ai',consent:true});await until(()=>f.requests.length>offset);const pending=await f.saved(),r=f.requests.at(-1)!;assert.deepEqual(pending.units,old.units,'pending does not rewrite prior classifications');assert.ok(r.units.every(u=>u.kind==='unknown'));assert.equal(digest(r.units.map(omitKind)),digest(old.units.slice(0,r.units.length).map(omitKind)));assert.notEqual(pending.classificationCheckpoint!.sourceHash,GOLDEN.oldClassificationSourceHash.semantic);const rows=valid(r).classifications!;release(invalid==='missing'?{classifications:rows.slice(1)}:invalid==='duplicate'?{classifications:rows.map((c,i)=>i?c:{...c,unitId:rows[1].unitId})}:invalid==='foreign'?{classifications:rows.map((c,i)=>i?c:{...c,unitId:'foreign'})}:invalid==='kind'?{classifications:rows.map((c,i)=>i?c:{...c,kind:'invalid' as any})}:{...valid(r),artifacts:[person]});assert.equal((await f.drain()).phase,'failed');const after=await f.saved();assert.deepEqual(after.units,old.units);assert.deepEqual(after.coverage.classify??[],[])}mode='valid';const offset=f.requests.length;await f.act('classify',{mode:'ai',consent:true});assert.equal((await f.drain()).phase,'select');const after=await f.saved(),sent=f.requests.slice(offset).flatMap(r=>r.units);assert.deepEqual(sent.map(u=>u.id),initial.units.map(u=>u.id));assert.ok(sent.every(u=>u.kind==='unknown'));assert.equal(digest(sent.map(omitKind)),digest(initial.units.map(omitKind)));assert.ok(after.units.every(u=>u.kind==='world'),'code preserves a legal non-body classification');assert.deepEqual(after.coverage.classify,initial.units.map(u=>u.id));assert.equal(after.files[0].hash,initial.files[0].hash)}finally{release({classifications:[]});await f.dispose()}})
 await t.test('same-contract-pause-reopen-only-uncovered-and-stale-epoch-no-credit',async()=>{let held=false,hold=true,release=()=>{};const f=await fixture(r=>{if(hold&&f.requests.length===2){held=true;return new Promise(resolve=>{release=()=>resolve(valid(r,'world'))})}return Promise.resolve(valid(r))});f.setCancel(()=>release());try{await f.act('choose',{mode:'files'});const initial=await f.saved();await f.act('classify',{mode:'ai',consent:true});await until(()=>held);await f.act('pause');const paused=await f.saved();assert.equal(paused.coverage.classify.length,81);assert.ok(paused.units.slice(0,81).every(u=>u.kind==='body'));assert.ok(paused.units.slice(81).every(u=>u.kind==='unknown'),'late valid response gives zero old-epoch classification credit');await f.reload();const count=f.requests.length;await f.act('resume',{consent:false});await assert.rejects(f.act('classify',{mode:'ai',consent:false}),/允许|授权/);assert.deepEqual((await f.saved()).units,paused.units);assert.deepEqual((await f.saved()).coverage,paused.coverage);assert.equal(f.requests.length,count);hold=false;await f.act('classify',{mode:'ai',consent:true});assert.equal((await f.drain()).phase,'select');const after=await f.saved(),sent=f.requests.slice(count).flatMap(r=>r.units),expected=initial.units.filter(u=>!paused.coverage.classify.includes(u.id));assert.deepEqual(sent.map(u=>u.id),expected.map(u=>u.id));assert.equal(digest(sent),digest(expected));assert.deepEqual(after.coverage.classify,initial.units.map(u=>u.id));assert.ok(after.units.every(u=>u.kind==='body'));assert.equal(after.units.map(u=>u.text).join(''),text);assert.equal(after.classificationCheckpoint!.sourceHash,paused.classificationCheckpoint!.sourceHash)}finally{release();await f.dispose()}})
 await t.test('legacy-formula-and-working-geometry-and-source-only-zero-AI',async()=>{const f=await fixture(r=>Promise.resolve(valid(r)));try{await f.act('choose',{mode:'files'});await f.reload(s=>{delete s.semanticVersion;delete s.chapterVersion;s.units.forEach(u=>{u.kind='world'});s.coverage={classify:s.units.slice(0,81).map(u=>u.id)};s.classificationCheckpoint={sourceHash:GOLDEN.oldClassificationSourceHash.legacy,resultHash:resultHash(s)};s.phase='paused';s.resumePhase='recognizing';s.originalProse=text;s.workingProse=text;s.workingUnits=s.units.map(u=>({...u,id:`legacy:${u.start}:${u.end}`,fileId:'legacy-source',kind:'body'}))});const before=await f.saved();assert.equal(digest(before.workingUnits),GOLDEN.legacyWorkingGeometryHash);await f.act('classify',{mode:'ai',consent:true});assert.equal((await f.drain()).phase,'select');const after=await f.saved();assert.equal(after.classificationCheckpoint!.sourceHash,GOLDEN.oldClassificationSourceHash.legacy);assert.deepEqual(after.workingUnits,before.workingUnits);assert.deepEqual(f.requests.flatMap(r=>r.units.map(u=>u.id)),before.units.slice(81).map(u=>u.id));assert.ok(f.requests.flatMap(r=>r.units).every(u=>u.kind==='world'),'legacy request retains its original kinds')}finally{await f.dispose()}
 const pure=await fixture(async()=>{throw Error('source-only cannot call AI')});try{await pure.act('choose',{mode:'files'});await pure.act('classify',{mode:'local',consent:false});const s=await pure.saved();await pure.act('set-range',{fileId:s.files[0].id,start:0,end:text.length,kind:'body'});await pure.act('select',{selected:['body'],targets:[],infer:false});await pure.act('choose-target');await pure.act('start',{consent:false});assert.equal((await pure.drain()).phase,'completed');assert.equal(pure.requests.length,0)}finally{await pure.dispose()}})
})
