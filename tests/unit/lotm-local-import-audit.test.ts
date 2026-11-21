import assert from 'node:assert/strict'
import {test,before,after} from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,readdir,symlink,link,rename} from 'node:fs/promises'
import {join,resolve,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID,createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {
 AUDIT_LOCAL_BUILD_FILES,LOTM_LOCAL_TARGETS,LotmLocalAuditFailure,
 describeLocalAuditBuild,verifyLocalPrepared,verifyLocalCompleted,verifyLocalShutdown,
 verifyLocalNativeRows,verifyLocalMigrationRows,captureLocalAuditTree,resolveLocalAuditStorage,
 auditLocalClosedWork,
} from '../../scripts/audit-lotm-local-import'
import {migrateDatabase,loadMigrations} from '../../desktop/service/database/migrations'
import {importHash,importPlanHash,workingImportUnits} from '../../desktop/core/novel-import'
import {createImportBudgetPolicy} from '../../desktop/core/novel-import-budget-policy'
import {createImportSemanticState,importNativeMappings,importSemanticAudit,importSemanticResultHash} from '../../desktop/core/novel-import-semantic-state'
import {importReviewTaskKeys} from '../../desktop/core/novel-import-review-tasks'
import {IMPORT_WORLD_SETTING_TYPES,stripImportKnowledgeAnnotations,importLengthClass,importThemeSynopsisFallback} from '../../desktop/core/novel-import-semantics'
import {validatePlanning} from '../../src/lib/planning/domain'
import type {ImportArtifact,ImportSession} from '../../desktop/shared/novel-import'

const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex')
const clone=<T>(value:T):T=>structuredClone(value)
const counts=[213,269,250,214,204,116,87,41,8]
const names=['小丑','无面人','旅行家','不死者','红祭司','逐光者','倒吊人','愚者','番外']
const stamp='2026-10-28T00:00:00.000Z'
const createdAt='2026-10-28T00:02:00.000Z'
const updatedAt='2026-10-28T00:03:00.000Z'
const launchedAt='2026-10-28T00:01:00.000Z'
const exitedAt='2026-10-28T00:04:00.000Z'
const runName='LOTM-LOCAL-SYNTHETIC'
let root:string,s:ImportSession,rows:any,prepared:any,bundle:any,binding:any,build:any,shutdown:any,run:any
let originalBody:string,originalSource:string,fixtureEngine:PGlite|undefined

async function json(path:string,value:unknown){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')}
function codeOf(error:unknown){assert.ok(error instanceof LotmLocalAuditFailure,`expected LotmLocalAuditFailure, got ${String(error)}`);return error.code}
function throwsCode(code:string,run:()=>unknown){assert.throws(run,error=>{assert.equal(codeOf(error),code);return true})}
async function rejectsCode(code:string,run:()=>Promise<unknown>){await assert.rejects(run,error=>{assert.equal(codeOf(error),code);return true})}
function nativeNegative(code:string,mutate:(value:any)=>void){const changed=clone(rows);mutate(changed);throwsCode(code,()=>verifyLocalNativeRows(s,changed,prepared))}
function completedNegative(code:string,mutate:(value:any)=>void){const changed=clone(s);mutate(changed);throwsCode(code,()=>verifyLocalCompleted(changed,prepared,{sessionId:s.id,run:run.run,workId:s.publication?.workId}))}

function freezeCorpus(){
 const raw:{volume:number;positionInVolume:number;title:string;text:string}[]=[]
 for(let v=0;v<9;v++)for(let c=1;c<=counts[v];c++){
  const title=`第${c}章 合成${v+1}-${c}`
  const volumeHeading=c===1?`第${v+1}卷 ${names[v]}\r\n`:''
  const known=v===0&&c===1?'合成角色携带已知乱码�。':'合成角色在合成场景行动。'
  raw.push({volume:v+1,positionInVolume:c,title,text:volumeHeading+title+'\r\n'+known+'\r\n'})
 }
 const deficit=4_785_312-raw.reduce((sum,chapter)=>sum+chapter.text.length,0)
 assert.ok(deficit>0)
 raw[700].text+='合成正文。'.repeat(Math.ceil(deficit/5)).slice(0,deficit)
 assert.equal(raw.reduce((sum,chapter)=>sum+chapter.text.length,0),4_785_312)
 let body='',source=''
 const chapters:any[]=[],bodySegments:any[]=[],intervals:any[]=[]
 for(let v=0;v<9;v++){
  const bodyStart=body.length,sourceStart=source.length
  for(const chapter of raw.filter(item=>item.volume===v+1)){
   const start=body.length,originalStart=source.length
   body+=chapter.text;source+=chapter.text
   chapters.push({index:chapters.length+1,volume:chapter.volume,volumeName:names[v],positionInVolume:chapter.positionInVolume,title:chapter.title,start,end:body.length,sourceStart:originalStart,sourceEnd:source.length,sourceDecodedUtf8Sha256:sha(chapter.text),expectedUtf8Sha256:sha(chapter.text)})
  }
  bodySegments.push({volume:v+1,name:names[v],start:sourceStart,end:source.length,bodyStart,bodyEnd:body.length,textSha256:sha(source.slice(sourceStart))})
  if(v<8){const text=`非叙事${v+1}：`+'作者说明。'.repeat(1000)+'终';const padded=text.slice(0,2266);assert.equal(padded.length,2266);const start=source.length;source+=padded;intervals.push({index:v+1,start,end:source.length,textSha256:sha(padded),classification:'non-narrative'})}
 }
 assert.equal(source.length,4_803_440)
 assert.equal(body.length,4_785_312)
 const nonNarrative={schemaVersion:1,bodySegments,intervals}
 return {source,body,chapters,nonNarrative,knownMojibake:[{chapterIndex:1,text:'�'}]}
}

function makeWorkingUnits(body:string){const units=[];for(let start=0;start<body.length;){const end=Math.min(body.length,start+1000);units.push({id:`working-0:${start}:${end}`,fileId:'working-0',start,end,text:body.slice(start,end),kind:'body' as const,part:'正文'});start=end}return units}

function makeArtifacts(unit:{id:string},chapters:any[]){
 const artifact=(id:string,kind:ImportArtifact['kind'],name:string,facts:Record<string,string>={},text=`${name}全文`):ImportArtifact=>({id,kind,name,text,facts,origin:'inferred',evidence:[{unitId:unit.id,quote:'合成角色'}],sourceUnitIds:[unit.id]})
 const result=[
  artifact('outline','outline','合成大纲'),artifact('theme','theme','合成主题'),artifact('style','style','合成文风'),
  artifact('person','character','合成人',{roleType:'PROTAGONIST',aliases:'["合成别名"]',relationships:'[{"target":"合成配角","description":"合成关系","characterId":"person2"}]',age:'17',occupation:'作者'}),
  artifact('person2','character','合成配角',{roleType:'SUPPORTING',relationships:'[]'}),
  artifact('place','scene','合成地点',{entityType:'PLACE',coordinates:'0,0'}),artifact('place-child','scene','合成房间',{entityType:'PLACE',parentId:'place'}),
  artifact('item','item','同名物品',{},'合成物品甲'),artifact('item2','item','同名物品',{},'合成物品乙'),artifact('foreshadow','foreshadow','合成伏笔'),
  artifact('world','world','合成世界',{entityType:'WORLD'}),
 ]
 const worldContent=(type:string)=>type==='LEVEL_SYSTEM'?{scope:'GENERAL',form:'SINGLE',description:'合成等级',rules:'',levels:[],pathways:[]}:type==='CONCEPT'?{concepts:[{term:'合成概念',explanation:'合成解释'}]}:type==='FACTION'?{factions:[{name:'合成势力',description:'合成描述',relations:''}]}:{text:`${type}合成内容`}
 for(const type of IMPORT_WORLD_SETTING_TYPES){const id=type==='MAP'?'map':`setting-${type}`;result.push(artifact(id,'world',`合成${type}`,{entityType:'SETTING',worldId:'world',settingType:type,content:JSON.stringify(worldContent(type))}));if(type==='MAP')result.push(artifact('map-child','world','合成子地图',{entityType:'SETTING',worldId:'world',settingType:'MAP',parentId:'map',content:'{"text":"合成子地图内容"}'}))}
 result.push(
  artifact('satisfaction','trope','合成爽点',{tropeKind:'SATISFACTION'}),artifact('tear','trope','合成泪点',{tropeKind:'TEAR'}),
  artifact('event','worldline','合成事件',{lineId:'main',lineName:'合成世界线',timeKind:'exact',timeValue:'2',time:'第2小时',people:'["person"]',reliability:'客观事实'}),
  artifact('event2','worldline','合成后续',{lineId:'main',lineName:'合成世界线',timeKind:'unknown',time:'未知',people:'["person2"]',parentId:'event',reliability:'客观事实'}),
  artifact('narrative','narrative','合成叙事',{chapterIndex:'1401',order:'0',narrator:'person',refs:'[{"eventId":"event2","kind":"recall","character":"person","reliability":"客观事实"}]',reliability:'客观事实'}),
 )
 for(const chapter of chapters)result.push(artifact('chapter-outline-'+chapter.index,'outline',chapter.title+'细纲',{chapterIndex:String(chapter.index-1)},chapter.title+'完整细纲'))
 return result
}

function freezeRows(session:ImportSession,chapters:any[]){
 const novelId=session.publication!.novelId!,mapping=importNativeMappings(session),projected=session.artifacts.filter(a=>mapping.projectable.has(a.id))
 const nativeText=(a:ImportArtifact)=>stripImportKnowledgeAnnotations(a.text)
 const joined=(kind:ImportArtifact['kind'])=>projected.filter(a=>a.kind===kind).map(nativeText).join('\n\n')
 const result:any={novels:[{id:novelId,userId:'local-author',title:session.title,currentStage:'WRITING'}],volumes:[],chapters:[],themes:[],characters:[],scenes:[],items:[],worlds:[],settings:[],foreshadows:[],tropes:[],planning:[],versions:[],mutations:[]}
 for(let v=0;v<9;v++)result.volumes.push({id:`native-volume-${v+1}`,novelId,index:v+1,title:names[v],summary:v===0?projected.filter(a=>a.kind==='outline'&&a.facts.chapterIndex===undefined).map(nativeText).join('\n\n'):''})
 for(const [i,chapter]of chapters.entries()){const outline=session.chapters[i].outline??'';result.chapters.push({id:`native-chapter-${String(i+1).padStart(4,'0')}`,volumeId:`native-volume-${chapter.volume}`,index:chapter.positionInVolume,title:chapter.title,outline,content:session.chapters[i].content,wordCount:0,status:'WRITTEN'})}
 for(const [i,row]of result.chapters.entries()){row.content=session.chapters[i].content;row.wordCount=[...row.content].length}
 result.themes.push({id:'native-theme',novelId,title:session.title,synopsis:importThemeSynopsisFallback(joined('theme')),referenceCases:'',channel:'',genre:'',length:session.chapters.length?importLengthClass(session.chapters.reduce((n,c)=>n+Array.from(c.content).length,0)):'',authorPosition:null,tags:[],sellingPoints:'',targetAudience:'',version:1,createdAt:updatedAt,updatedAt})
 for(const a of projected.filter(a=>a.kind==='character')){const native=mapping.decoded.get(a.id)!.native as any;result.characters.push({id:`native-${a.id}`,novelId,name:a.name,roleType:native.roleType,aliases:native.aliases,age:native.age,gender:native.gender,occupation:native.occupation,bio:nativeText(a),personality:native.personality,appearance:native.appearance,clothing:native.clothing,catchphrase:native.catchphrase,growthArc:native.growthArc,extra:native.extra,relationships:native.relationships.map((r:any)=>({...r,...(r.characterId?{characterId:`native-${r.characterId}`}:{})}))})}
 for(const a of projected.filter(a=>a.kind==='scene')){const native=mapping.decoded.get(a.id)!.native as any;result.scenes.push({id:`native-${a.id}`,novelId,name:a.name,parentId:native.parentId?`native-${native.parentId}`:null,coordinates:native.coordinates,description:nativeText(a)})}
 for(const a of projected.filter(a=>a.kind==='item'))result.items.push({id:`native-${a.id}`,novelId,name:a.name,description:nativeText(a)})
 for(const a of projected.filter(a=>a.kind==='world')){const native=mapping.decoded.get(a.id)!.native as any;if(native.entityType==='WORLD')result.worlds.push({id:`native-${a.id}`,novelId,name:a.name,parentId:native.parentId?`native-${native.parentId}`:null,description:nativeText(a)});else result.settings.push({id:`native-${a.id}`,novelId,name:a.name,type:native.settingType,worldId:`native-${native.worldId}`,parentId:native.parentId?`native-${native.parentId}`:null,content:JSON.parse(JSON.stringify(native.content))})}
 for(const a of projected.filter(a=>a.kind==='foreshadow'))result.foreshadows.push({id:`native-${a.id}`,novelId,title:a.name,content:nativeText(a)})
 for(const a of projected.filter(a=>a.kind==='trope'))result.tropes.push({id:`native-${a.id}`,novelId,kind:a.facts.tropeKind,category:a.name,content:nativeText(a),referenceCase:'',selected:true})
 result.settings.push({id:'native-style',novelId,name:'文风设定',type:'STYLE',worldId:null,parentId:null,content:{style:joined('style'),referenceCases:'',dialogueMark:'DOUBLE_QUOTE',innerDialogueMark:'NONE'}})
 const planning:any={schemaVersion:1,worlds:[{id:'import-world-main',name:'合成世界线'}],lines:[{id:'import-reading-line',name:'导入作品',primary:true}],events:[],periods:[],cards:[],volumes:[],chapters:[],connections:[]}
 for(const [i,volume]of result.volumes.entries())planning.volumes.push({id:volume.id,line:'import-reading-line',title:volume.title,summary:volume.summary.length<=100000?volume.summary:'原始大纲全文见导入记录',order:i})
 for(const [i,chapter]of result.chapters.entries()){planning.chapters.push({id:chapter.id,line:'import-reading-line',volume:chapter.volumeId,title:chapter.title,order:i,wordBudget:Math.min(200000,Math.max(1,chapter.wordCount))});if(chapter.outline)planning.cards.push({id:'import-chapter-card-'+chapter.id,line:'import-reading-line',chapter:chapter.id,title:chapter.title,order:i,tellings:[{id:'import-telling-'+chapter.id,intent:chapter.outline,source:'导入大纲'}]})}
 for(const a of projected.filter(a=>a.kind==='worldline')){const eventId='import-event-'+a.id,known=a.facts.timeKind==='exact'||a.facts.timeKind==='window';planning.events.push({id:eventId,line:'import-world-main',parent:a.facts.parentId?'import-event-'+a.facts.parentId:null,title:a.name,fact:nativeText(a),people:JSON.parse(a.facts.people).map((id:string)=>'native-'+id),time:{kind:known?a.facts.timeKind:'unknown',value:known?Number(a.facts.timeValue):0,end:a.facts.timeKind==='window'?Number(a.facts.timeEnd):null,label:a.facts.time??''}})}
 for(const a of projected.filter(a=>a.kind==='narrative')){const index=Number(a.facts.chapterIndex),intent=nativeText(a),refs=JSON.parse(a.facts.refs).map((ref:any)=>({line:'import-world-main',event:'import-event-'+ref.eventId,character:ref.character?'native-'+ref.character:null,reliability:ref.reliability,reveal:intent,source:'导入语义关系：'+(ref.kind??'happen')/* docs/542 */}));planning.cards.push({id:'import-narrative-'+a.id+'-0',line:'import-reading-line',chapter:result.chapters[index].id,title:a.name,order:index*1000000+Number(a.facts.order)*1000,tellings:[{id:'import-narrative-telling-'+a.id+'-0',character:'native-'+a.facts.narrator,narrator:a.facts.narrator,intent,refs,source:'根据正文分析',reliability:a.facts.reliability}]})}
 result.planning.push({novelId,version:1,data:validatePlanning(planning)})
 const snapshot={version:1,chapterVersion:2,semanticVersion:1,semanticAudit:importSemanticAudit(session),sourceCopyIds:mapping.sourceCopyIds,mappingWarnings:mapping.mappingWarnings,importBudget:(awaitlessImportBudget(session)),id:session.id,title:session.title,createdAt:session.createdAt,sourceKinds:session.selected,targets:session.targets,modified:false,summary:{source:0,inferred:session.artifacts.length,decisions:0},materials:session.artifacts.map(a=>({...a,characters:a.text.length})),decisions:session.decisions,originalProse:session.originalProse,workingProse:session.workingProse,sources:session.files.map(f=>({name:f.name,format:f.format,hash:f.hash})),coverage:session.coverage,notFound:session.notFound,importHash:session.publication!.hash}
 result.versions.push({id:'cversion0000000000000000000001',targetType:'NOVEL_IMPORT',targetId:novelId,version:1,snapshot,reason:'导入作品',createdAt:updatedAt})
 result.mutations.push({id:'cmutation0000000000000000000001',userId:'local-author',novelId,targetType:'NOVEL_IMPORT',targetId:novelId,operationId:'novel-import:'+session.id,requestHash:session.publication!.hash,beforeHash:importHash(null),afterHash:session.publication!.hash,beforeVersion:0,afterVersion:1,result:{novelId,requestId:session.id,importHash:session.publication!.hash},createdAt:updatedAt})
 return result
}
function awaitlessImportBudget(session:ImportSession){const policy=session.budgetPolicy!,units=workingImportUnits(session);return {policy,workingUnits:units.map(u=>({id:u.id,fileId:u.fileId,start:u.start,end:u.end,textHash:importHash(u.text)}))}}

async function insertFixture(engine:PGlite,value:any){
 const query=(text:string,values:any[]=[])=>engine.query(text,values)
 await query('INSERT INTO "User" (id,email,"passwordHash",name,"updatedAt") VALUES ($1,$2,$3,$4,$5)',['local-author','synthetic@localhost.invalid','','合成作者',stamp])
 for(const novel of value.novels)await query('INSERT INTO "Novel" (id,"userId",title,"currentStage","updatedAt") VALUES ($1,$2,$3,$4,$5)',[novel.id,novel.userId,novel.title,novel.currentStage,updatedAt])
 for(const theme of value.themes)await query('INSERT INTO "Theme" (id,"novelId",title,synopsis,"referenceCases",channel,genre,length,"authorPosition",tags,"sellingPoints","targetAudience",version,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::text[],$11,$12,$13,$14,$15)',[theme.id,theme.novelId,theme.title,theme.synopsis,theme.referenceCases,theme.channel,theme.genre,theme.length,theme.authorPosition===null?null:JSON.stringify(theme.authorPosition),theme.tags,theme.sellingPoints,theme.targetAudience,theme.version,theme.createdAt,theme.updatedAt])
 for(const volume of value.volumes)await query('INSERT INTO "Volume" (id,"novelId","index",title,summary,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6)',[volume.id,volume.novelId,volume.index,volume.title,volume.summary,updatedAt])
 for(const chapter of value.chapters)await query('INSERT INTO "Chapter" (id,"volumeId","index",title,outline,content,"wordCount",status,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[chapter.id,chapter.volumeId,chapter.index,chapter.title,chapter.outline,chapter.content,chapter.wordCount,chapter.status,updatedAt])
 for(const row of value.characters)await query('INSERT INTO "Character" (id,"novelId",name,"roleType",aliases,age,gender,occupation,bio,personality,appearance,clothing,catchphrase,"growthArc",relationships,extra,"updatedAt") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17)',[row.id,row.novelId,row.name,row.roleType,JSON.stringify(row.aliases),row.age,row.gender,row.occupation,row.bio,row.personality,row.appearance,row.clothing,row.catchphrase,row.growthArc,JSON.stringify(row.relationships),JSON.stringify(row.extra),updatedAt])
 for(const row of value.scenes)await query('INSERT INTO "Scene" (id,"novelId",name,"parentId",coordinates,description,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7)',[row.id,row.novelId,row.name,row.parentId,row.coordinates,row.description,updatedAt])
 for(const row of value.items)await query('INSERT INTO "Item" (id,"novelId",name,description,"updatedAt") VALUES ($1,$2,$3,$4,$5)',[row.id,row.novelId,row.name,row.description,updatedAt])
 for(const row of value.worlds)await query('INSERT INTO "World" (id,"novelId",name,"parentId",description,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6)',[row.id,row.novelId,row.name,row.parentId,row.description,updatedAt])
 for(const row of value.settings)await query('INSERT INTO "Setting" (id,"novelId",name,type,"worldId","parentId",content,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',[row.id,row.novelId,row.name,row.type,row.worldId,row.parentId,JSON.stringify(row.content),updatedAt])
 for(const row of value.foreshadows)await query('INSERT INTO "Foreshadow" (id,"novelId",title,content,"updatedAt") VALUES ($1,$2,$3,$4,$5)',[row.id,row.novelId,row.title,row.content,updatedAt])
 for(const row of value.tropes)await query('INSERT INTO "Trope" (id,"novelId",kind,category,content,"referenceCase",selected,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[row.id,row.novelId,row.kind,row.category,row.content,row.referenceCase,row.selected,updatedAt])
 for(const row of value.planning)await query('INSERT INTO "PlanningDocument" ("novelId",version,data,"updatedAt") VALUES ($1,$2,$3::jsonb,$4)',[row.novelId,row.version,JSON.stringify(row.data),updatedAt])
 for(const row of value.versions)await query('INSERT INTO "ContentVersion" (id,"targetType","targetId",version,snapshot,reason,"createdAt") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)',[row.id,row.targetType,row.targetId,row.version,JSON.stringify(row.snapshot),row.reason,row.createdAt])
 for(const row of value.mutations)await query('INSERT INTO "ContentMutation" (id,"userId","novelId","targetType","targetId","operationId","requestHash","beforeHash","afterHash","beforeVersion","afterVersion",result,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)',[row.id,row.userId,row.novelId,row.targetType,row.targetId,row.operationId,row.requestHash,row.beforeHash,row.afterHash,row.beforeVersion,row.afterVersion,JSON.stringify(row.result),row.createdAt])
}

before(async()=>{
 root=await realpath(await mkdtemp(join(tmpdir(),'lotm-local-auditor-synthetic-')));const runDir=join(root,'run'),appRoot=join(root,'app'),workRoot=join(root,'work'),repo=join(root,'repo');await Promise.all([mkdir(runDir),mkdir(appRoot),mkdir(workRoot),mkdir(repo)])
 for(const file of AUDIT_LOCAL_BUILD_FILES){await mkdir(dirname(join(repo,file)),{recursive:true});await writeFile(join(repo,file),file==='prisma/schema.prisma'?await readFile(resolve(file)):Buffer.from('synthetic-build:'+file))}
 for(const dir of await readdir(resolve('prisma/migrations'),{withFileTypes:true})){if(!dir.isDirectory())continue;const dest=join(repo,'prisma/migrations',dir.name,'migration.sql');await mkdir(dirname(dest),{recursive:true});await writeFile(dest,await readFile(resolve('prisma/migrations',dir.name,'migration.sql')))}
 const corpus=freezeCorpus();originalSource=corpus.source;originalBody=corpus.body;const sourcePath=join(runDir,'original-full.txt'),bodyPath=join(runDir,'expected-body.txt'),chaptersPath=join(runDir,'expected-chapters.json'),nonNarrativePath=join(runDir,'non-narrative.json'),minimumPath=join(runDir,'semantic-minimum.json')
 await writeFile(sourcePath,originalSource);await writeFile(bodyPath,originalBody);await json(chaptersPath,corpus.chapters);await json(nonNarrativePath,corpus.nonNarrative);await json(minimumPath,{minimumChecks:Array.from({length:45},(_,i)=>({id:`MIN-${i}`,status:'NOT RUN'}))})
 run={schemaVersion:1,run:runName,runDir,frozenAt:stamp,sourcePath,sourceSha256:sha(originalSource),sourceEncoding:'utf-8',sourceCharacters:4_803_440,sourceBytes:Buffer.byteLength(originalSource),expectedBodyPath:bodyPath,expectedBodySha256:sha(originalBody),expectedBodyCharacters:4_785_312,expectedBodyBytes:Buffer.byteLength(originalBody),expectedChaptersPath:chaptersPath,expectedChaptersSha256:sha(await readFile(chaptersPath)),nonNarrativePath,nonNarrativeSha256:sha(await readFile(nonNarrativePath)),semanticMinimumPath:minimumPath,semanticMinimumSha256:sha(await readFile(minimumPath)),expectedChapterCount:1402,volumeCount:9,volumeChapterCounts:counts,volumeNames:names,knownMojibake:corpus.knownMojibake};await json(join(runDir,'run.json'),run)
 const id=randomUUID(),workId=randomUUID(),novelId='novel-local-synthetic',file={id:'body',name:'original-full.txt',format:'txt' as const,path:sourcePath,text:originalSource,hash:sha(originalSource),bytes:Buffer.byteLength(originalSource),encoding:'utf-8',included:true}
 const units=corpus.nonNarrative.bodySegments.flatMap((segment:any,index:number)=>{const bodyUnit={id:`source-body-${index}`,fileId:'body',start:segment.start,end:segment.end,text:originalSource.slice(segment.start,segment.end),kind:'body' as const};if(index===8)return[bodyUnit];const gap=corpus.nonNarrative.intervals[index];return[bodyUnit,{id:`source-excluded-${index}`,fileId:'body',start:gap.start,end:gap.end,text:originalSource.slice(gap.start,gap.end),kind:'excluded' as const}]})
 const model={id:'synthetic',name:'合成',modelId:'synthetic',endpoint:'https://model.invalid',authRevision:1,contextWindow:262144}
 s={version:1,semanticVersion:1,chapterVersion:2,id,revision:30,epoch:1,phase:'completed',title:'LOTM-LOCAL-SYNTHETIC',files:[file],units,selected:['body'],targets:[...LOTM_LOCAL_TARGETS],infer:true,artifacts:[],conflicts:[],patches:[],originalProse:originalBody,workingProse:originalBody,workingRevision:0,workingUnits:makeWorkingUnits(originalBody),chapters:corpus.chapters.map((c:any)=>({id:`chapter-${c.index}`,title:c.title,start:c.start,end:c.end,content:originalBody.slice(c.start,c.end),volume:c.volumeName,outline:c.title+'完整细纲'})),detailedOutlineIds:Object.fromEntries(corpus.chapters.map((c:any)=>[c.index-1,'chapter-outline-'+c.index])),coverage:{},steps:[],notFound:[],decisions:[],createdAt,updatedAt,publication:{requestId:id,workId,novelId},budgetPolicy:createImportBudgetPolicy({text:model,review:model})}
 const evidenceUnit=workingImportUnits(s)[0];s.artifacts=makeArtifacts(evidenceUnit,corpus.chapters);s.mappingWarnings=importNativeMappings(s).mappingWarnings;const working=workingImportUnits(s),ids=working.map(u=>u.id);for(const kind of LOTM_LOCAL_TARGETS)s.coverage[kind]=[...ids];s.coverage.review=[...ids];s.coverage.reviewFacts=importReviewTaskKeys(s);s.semanticState=createImportSemanticState(s);s.semanticState.stage='ready';s.semanticState.verifiedHash=importSemanticResultHash(s);const importHashValue=importPlanHash(s);s.publication={requestId:id,hash:importHashValue,workId,novelId}
 const journalDir=join(appRoot,'novel-imports',id);await mkdir(journalDir,{recursive:true});await writeFile(join(journalDir,'.owner'),'shakeink-novel-import-v1\n'+id+'\n');await json(join(journalDir,'session.json'),{...s,models:{text:{apiKey:'SYNTHETIC_SECRET_TRAP'}}})
 const manifest={schemaVersion:1,id:workId,phase:'ready',novelId,title:s.title,requestId:id,requestHash:importHash({title:s.title,importHash:importHashValue}),createdAt:updatedAt};await json(join(workRoot,'shakeink-work.json'),manifest);const storage={schemaVersion:1,workId,revision:0,active:{kind:'original'},previous:null};await json(join(workRoot,'shakeink-storage.json'),{state:storage,sha256:sha(JSON.stringify(storage))});await json(join(workRoot,'shakeink-storage-required.json'),{schemaVersion:1,workId,required:true})
 build={run:run.run,sessionId:id,runDir,appRoot,workRoot,repo,workId,novelId,importHash:importHashValue,launchId:randomUUID(),appPid:999999,launchedAt,...(await describeLocalAuditBuild(repo))};shutdown={run:run.run,sessionId:id,runDir,appRoot,workRoot,workId,novelId,importHash:importHashValue,launchId:build.launchId,appPid:build.appPid,normalExit:true,exitCode:0,exitedAt};await json(join(runDir,'final-build.json'),build);await json(join(runDir,'shutdown.json'),shutdown)
 bundle={run,source:Buffer.from(originalSource),expectedBody:Buffer.from(originalBody),expectedChapters:corpus.chapters,nonNarrative:corpus.nonNarrative,minimum:{minimumChecks:Array.from({length:45},(_,i)=>({id:`MIN-${i}`,status:'NOT RUN'}))}};prepared=verifyLocalPrepared(bundle);rows=freezeRows(s,corpus.chapters)
 fixtureEngine=await PGlite.create({dataDir:join(workRoot,'database'),relaxedDurability:false});await migrateDatabase(fixtureEngine,await loadMigrations(join(repo,'prisma/migrations')));await insertFixture(fixtureEngine,rows);await fixtureEngine.close();fixtureEngine=undefined
 binding={runDir,appRoot,workRoot,repo,sessionId:id,run:run.run,label:'audit-positive',appClosed:true,buildIdentity:join(runDir,'final-build.json'),shutdownEvidence:join(runDir,'shutdown.json'),runSha256:sha(await readFile(join(runDir,'run.json')))}
},{timeout:180000})
after(async()=>{await fixtureEngine?.close();if(root)await rm(root,{recursive:true,force:true})})

test('LOTM-L-AUD01 positive: independently frozen closed work passes the complete scratch READ ONLY path',{timeout:600000},async()=>{
 assert.equal(originalSource.length,4_803_440);assert.equal(originalBody.length,4_785_312);assert.equal(prepared.chapters.length,1402);assert.equal(s.files[0].text,originalSource);assert.notEqual(s.files[0].text,originalBody)
 const before=await captureLocalAuditTree(binding.workRoot);let opened=0;const result=await auditLocalClosedWork({...binding,hooks:{openScratch:async(path:string)=>{opened++;assert.ok(path.startsWith(join(binding.runDir,binding.label+'-audit','scratch-database')));assert.ok(!path.startsWith(binding.workRoot));return PGlite.create({dataDir:path,relaxedDurability:false})}}})
 assert.equal(opened,1);assert.equal(result.mechanicalPassed,true);assert.equal(result.literaryStatus,'NOT RUN');assert.equal(result.transactionIsolation,'REPEATABLE READ');assert.equal(result.transactionReadOnly,true);assert.equal(result.counts.volumes,9);assert.equal(result.counts.chapters,1402);assert.equal(result.counts.themes,1);assert.equal(result.counts.tropes,2);assert.equal(result.counts.versions,1);assert.equal(result.counts.mutations,1);assert.deepEqual(await captureLocalAuditTree(binding.workRoot),before)
 for(const name of ['assertions.json','checkpoint-public.json','business-records.json']){const output=await readFile(join(binding.runDir,binding.label+'-audit',name),'utf8');assert.ok(!output.includes('SYNTHETIC_SECRET_TRAP'));assert.ok(!output.includes('models'))}
})

test('frozen geometry supports bookends adjacent volumes and consecutive excluded units',()=>{
 const build=(split:boolean)=>{
  const b=clone(bundle),gaps=b.nonNarrative.intervals,[first,second]=gaps,front='😀'+originalSource.slice(first.start,first.start+99),back=originalSource.slice(first.start+100,first.end-1)+originalSource.slice(second.start,second.end),shift=(position:number)=>front.length+position-(position>=second.end?first.end-first.start+second.end-second.start:position>=first.end?first.end-first.start:0),source=front+originalSource.slice(0,first.start)+originalSource.slice(first.end,second.start)+originalSource.slice(second.end)+back
  b.source=Buffer.from(source);b.run.sourceSha256=sha(b.source);b.run.sourceBytes=b.source.byteLength;b.run.sourceCharacters=source.length
  b.nonNarrative.bodySegments=b.nonNarrative.bodySegments.map((segment:any)=>({...segment,start:shift(segment.start),end:shift(segment.end)}));b.expectedChapters=b.expectedChapters.map((chapter:any)=>({...chapter,sourceStart:shift(chapter.sourceStart),sourceEnd:shift(chapter.sourceEnd)}))
  b.nonNarrative.intervals=[{start:0,end:front.length,textSha256:sha(front),classification:'non-narrative'},...gaps.slice(2).map((gap:any)=>({...gap,start:shift(gap.start),end:shift(gap.end)})),{start:source.length-back.length,end:source.length,textSha256:sha(back),classification:'non-narrative'}].map((gap,index)=>({...gap,index:index+1}))
  if(split){const at=b.nonNarrative.intervals[2],middle=at.start+1;b.nonNarrative.intervals.splice(2,1,{...at,end:middle,textSha256:sha(source.slice(at.start,middle))},{...at,start:middle,textSha256:sha(source.slice(middle,at.end))});b.nonNarrative.intervals=b.nonNarrative.intervals.map((gap:any,index:number)=>({...gap,index:index+1}))}
  const session=clone(s);session.files[0].text=source;session.files[0].hash=sha(source);session.files[0].bytes=Buffer.byteLength(source);session.units=[...b.nonNarrative.bodySegments.map((segment:any)=>({id:'body-'+segment.start,fileId:'body',start:segment.start,end:segment.end,text:source.slice(segment.start,segment.end),kind:'body' as const})),...b.nonNarrative.intervals.map((gap:any)=>({id:'gap-'+gap.start,fileId:'body',start:gap.start,end:gap.end,text:source.slice(gap.start,gap.end),kind:'excluded' as const}))].sort((a,b)=>a.start-b.start)
  session.semanticState=createImportSemanticState(session);session.semanticState.stage='ready';session.semanticState.verifiedHash=importSemanticResultHash(session);session.publication!.hash=importPlanHash(session)
  return{b,session}
 }
 for(const split of [false,true]){const{b,session}=build(split),value=verifyLocalPrepared(b);verifyLocalCompleted(session,value,{sessionId:s.id,run:run.run});assert.equal(value.body,originalBody);assert.equal(value.chapters.length,1402)}
 const{b,session}=build(false),invalid=(mutate:(value:any)=>void,code='NON_NARRATIVE_GEOMETRY_MISMATCH')=>{const changed=clone(b);mutate(changed);throwsCode(code,()=>verifyLocalPrepared(changed))}
 for(const mutate of [(value:any)=>{value.nonNarrative.intervals.splice(1,1)},(value:any)=>{value.nonNarrative.intervals[1].start++},(value:any)=>{value.nonNarrative.intervals[1].end=value.nonNarrative.intervals[1].start},(value:any)=>{value.nonNarrative.intervals[1].classification='body'},(value:any)=>{value.nonNarrative.intervals[1].textSha256='0'.repeat(64)},(value:any)=>{value.nonNarrative.intervals.pop()},(value:any)=>{value.nonNarrative.intervals[0].end=1},(value:any)=>{value.nonNarrative.intervals[1].start=value.nonNarrative.intervals[0].start+1}] as const)invalid(mutate)
 const prepared=verifyLocalPrepared(b),missing=clone(session);missing.units=missing.units.filter(unit=>unit.kind!=='excluded');throwsCode('SOURCE_UNIT_GEOMETRY_MISMATCH',()=>verifyLocalCompleted(missing,prepared,{sessionId:s.id,run:run.run}))
 const extra=clone(session);extra.units.push({id:'extra',fileId:'body',start:extra.files[0].text.length,end:extra.files[0].text.length+1,text:'x',kind:'excluded'});throwsCode('SOURCE_UNIT_GEOMETRY_MISMATCH',()=>verifyLocalCompleted(extra,prepared,{sessionId:s.id,run:run.run}))
})

test('volume-first chapter title prefix has independent raw and imported chapter hashes',()=>{
 const b=clone(bundle)
 for(const segment of b.nonNarrative.bodySegments){const chapter=b.expectedChapters.find((chapter:any)=>chapter.volume===segment.volume&&chapter.positionInVolume===1),prefix=b.source.slice(segment.start,chapter.sourceStart).toString()||b.source.slice(segment.start,segment.start+1).toString();assert.ok(prefix.length>0);chapter.sourceStart+=prefix.length;chapter.sourceDecodedUtf8Sha256=sha(new TextDecoder().decode(b.source.slice(chapter.sourceStart,chapter.sourceEnd)).slice(new TextDecoder().decode(b.source.slice(chapter.sourceStart,chapter.sourceEnd)).indexOf(chapter.title)))}
 const first=b.expectedChapters[0],raw=new TextDecoder().decode(b.source.slice(first.sourceStart,first.sourceEnd)),titleAt=raw.indexOf(first.title);console.log(JSON.stringify({titleAt,field:first.sourceDecodedUtf8Sha256,recomputed:sha(raw.slice(titleAt)),body:sha(originalBody.slice(first.start,first.end)),title:first.title}))
 const prepared=verifyLocalPrepared(b);assert.equal(prepared.chapters.length,1402)
 const changed=clone(b);changed.expectedChapters[0].sourceStart++;throwsCode('FROZEN_CHAPTER_ORACLE_MISMATCH',()=>verifyLocalPrepared(changed))
})

test('frozen source/body geometry and 1402 chapter oracle reject one-variable changes',()=>{
 assert.notDeepEqual(bundle.nonNarrative.intervals,[]);for(const [code,mutate]of [
  ['FROZEN_COUNTS_INVALID',(b:any)=>{b.run.volumeCount=8}],
  ['FROZEN_SOURCE_IDENTITY_INVALID',(b:any)=>{b.source=Buffer.from('changed')}],
  ['FROZEN_BODY_IDENTITY_INVALID',(b:any)=>{b.expectedBody=Buffer.from('changed')}],
  ['NON_NARRATIVE_GEOMETRY_MISMATCH',(b:any)=>{b.nonNarrative.intervals[0].end++}],
  ['FROZEN_CHAPTER_ORACLE_MISMATCH',(b:any)=>{b.expectedChapters.pop()}],
  ['FROZEN_CHAPTER_ORACLE_MISMATCH',(b:any)=>{b.expectedChapters[1]=clone(b.expectedChapters[0])}],
  ['FROZEN_CHAPTER_ORACLE_MISMATCH',(b:any)=>{[b.expectedChapters[1],b.expectedChapters[2]]=[b.expectedChapters[2],b.expectedChapters[1]]}],
  ['FROZEN_CHAPTER_ORACLE_MISMATCH',(b:any)=>{b.expectedChapters[700].expectedUtf8Sha256='0'.repeat(64)}],
 ]as const){const changed=clone(bundle);mutate(changed);throwsCode(code,()=>verifyLocalPrepared(changed))}
})

test('native chapters reject missing duplicate reorder merged extras placeholder mojibake and word counts',()=>{
 nativeNegative('NATIVE_CHAPTER_SEQUENCE_MISMATCH',r=>{r.chapters.pop()})
 nativeNegative('NATIVE_CHAPTER_SEQUENCE_MISMATCH',r=>{r.chapters[1]=clone(r.chapters[0])})
 nativeNegative('NATIVE_CHAPTER_SEQUENCE_MISMATCH',r=>{[r.chapters[1],r.chapters[2]]=[r.chapters[2],r.chapters[1]]})
 nativeNegative('NATIVE_CHAPTER_CONTENT_MISMATCH',r=>{r.chapters.at(-2).content+=r.chapters.at(-1).content;r.chapters.at(-2).wordCount=[...r.chapters.at(-2).content].length})
 nativeNegative('NATIVE_CHAPTER_CONTENT_MISMATCH',r=>{r.chapters.at(-1).content='导入内容';r.chapters.at(-1).wordCount=4})
 nativeNegative('NATIVE_CHAPTER_CONTENT_MISMATCH',r=>{const index=counts.slice(0,7).reduce((a,b)=>a+b,0);r.chapters[index].content='导入内容';r.chapters[index].wordCount=4})
 nativeNegative('NATIVE_CHAPTER_CONTENT_MISMATCH',r=>{r.chapters[0].content=r.chapters[0].content.replace('�','已修正');r.chapters[0].wordCount=[...r.chapters[0].content].length})
 nativeNegative('NATIVE_CHAPTER_WORD_COUNT_MISMATCH',r=>{r.chapters[2].wordCount++})
 nativeNegative('NATIVE_CHAPTER_SEQUENCE_MISMATCH',r=>{r.chapters[213].volumeId=r.volumes[0].id})
})

test('completed targets coverage review semantic repairs omissions and conflicts fail closed',()=>{
 completedNegative('COMPLETED_SESSION_REQUIRED',x=>{x.phase='failed'})
 completedNegative('COMPLETED_SESSION_REQUIRED',x=>{x.chapterVersion=3})
 completedNegative('COMPLETED_SESSION_REQUIRED',x=>{delete x.semanticVersion})
 completedNegative('PUBLICATION_IDENTITY_INVALID',x=>{x.publication!.workId=randomUUID()})
 completedNegative('COMPLETED_TARGETS_INVALID',x=>{x.selected=['body','theme']})
 completedNegative('COMPLETED_TARGETS_INVALID',x=>{x.notFound=['item']})
 completedNegative('TARGET_ARTIFACTS_INCOMPLETE',x=>{x.artifacts=x.artifacts.filter((a:any)=>a.kind!=='theme')})
 completedNegative('TARGET_ARTIFACTS_INCOMPLETE',x=>{x.artifacts=x.artifacts.filter((a:any)=>a.kind!=='trope')})
 completedNegative('UNEXPECTED_GOLD_FINGER',x=>{x.artifacts.push({...clone(x.artifacts.find((a:any)=>a.kind==='item')),id:'golden',kind:'goldenFinger'})})
 completedNegative('TARGET_COVERAGE_INCOMPLETE',x=>{x.coverage.item.pop()})
 completedNegative('REVIEW_COVERAGE_INCOMPLETE',x=>{x.coverage.review.pop()})
 completedNegative('REVIEW_COVERAGE_INCOMPLETE',x=>{x.coverage.reviewFacts.pop()})
 completedNegative('SEMANTIC_BINDING_INCOMPLETE',x=>{x.semanticState.stage='review'})
 completedNegative('SEMANTIC_TASKS_INCOMPLETE',x=>{const a=x.artifacts.find((a:any)=>a.kind==='item');x.semanticState.repairs.push({artifactId:a.id,baseHash:importHash(a),original:a,tasks:[],committed:false})})
 completedNegative('SEMANTIC_TASKS_INCOMPLETE',x=>{x.semanticState.omissions.push({key:'missing',kind:'item',unitIds:[x.workingUnits[0].id],evidence:[{unitId:x.workingUnits[0].id,quote:'合成角色'}],reason:'合成',done:false,completedUnitIds:[]})})
 completedNegative('SEMANTIC_TASKS_INCOMPLETE',x=>{x.semanticState.omissions.push({key:'extra',kind:'item',unitIds:[],evidence:[],reason:'合成',done:true,completedUnitIds:[x.workingUnits[0].id]})})
 completedNegative('CONFLICTS_UNRESOLVED',x=>{x.conflicts.push({status:'pending'})})
})

test('ordered detailed outlines require all 1402 canonical mappings and no volume-summary duplication',()=>{
 for(const mutate of [
  (x:any)=>{delete x.chapters[10].outline},
  (x:any)=>{x.detailedOutlineIds[0]='missing'},
  (x:any)=>{delete x.detailedOutlineIds},
  (x:any)=>{x.detailedOutlineIds[1]=x.detailedOutlineIds[0]},
 ]){const changed=clone(s);mutate(changed);changed.publication!.hash=importPlanHash(changed);throwsCode('DETAILED_OUTLINE_INCOMPLETE',()=>verifyLocalCompleted(changed,prepared,{sessionId:s.id,run:run.run,workId:s.publication?.workId}))}
 nativeNegative('NATIVE_PLANNING_PROJECTION_MISMATCH',r=>{r.chapters[0].outline=''})
 nativeNegative('NATIVE_VOLUME_PROJECTION_MISMATCH',r=>{r.volumes[0].summary+=r.chapters[0].outline})
})

test('Theme STYLE Trope Item Foreshadow and nine world types are exact native multisets',()=>{
 for(const mutate of [(r:any)=>{r.themes=[]},(r:any)=>{r.themes[0].synopsis='changed'},(r:any)=>{r.themes[0].novelId='wrong'},(r:any)=>{r.themes.push({...clone(r.themes[0]),id:'extra'})}])nativeNegative('NATIVE_THEME_ROW_MISMATCH',mutate)
 for(const mutate of [(r:any)=>{r.tropes=[]},(r:any)=>{r.tropes=r.tropes.filter((x:any)=>x.kind!=='TEAR')},(r:any)=>{r.tropes.push({...clone(r.tropes[0]),id:'extra'})},(r:any)=>{r.tropes[0].kind='TEAR'},(r:any)=>{r.tropes[0].category='changed'},(r:any)=>{r.tropes[0].content='changed'},(r:any)=>{r.tropes[0].referenceCase='changed'},(r:any)=>{r.tropes[0].selected=false},(r:any)=>{r.tropes[0].novelId='wrong'}])nativeNegative('NATIVE_TROPE_MULTISET_MISMATCH',mutate)
 for(const mutate of [(r:any)=>{r.settings=r.settings.filter((x:any)=>x.type!=='STYLE')},(r:any)=>{r.settings.push({...clone(r.settings.find((x:any)=>x.type==='STYLE')),id:'extra-style'})},(r:any)=>{r.settings.find((x:any)=>x.type==='STYLE').name='changed'},(r:any)=>{r.settings.find((x:any)=>x.type==='STYLE').novelId='wrong'},(r:any)=>{r.settings.find((x:any)=>x.type==='STYLE').content.style='changed'},(r:any)=>{r.settings.find((x:any)=>x.type==='STYLE').content.referenceCases='changed'},(r:any)=>{r.settings.find((x:any)=>x.type==='STYLE').content.dialogueMark='changed'},(r:any)=>{r.settings.find((x:any)=>x.type==='STYLE').content.innerDialogueMark='changed'},(r:any)=>{r.settings.find((x:any)=>x.type==='STYLE').worldId=r.worlds[0].id},(r:any)=>{r.settings.find((x:any)=>x.type==='STYLE').parentId='wrong'}])nativeNegative('NATIVE_STYLE_ROW_MISMATCH',mutate)
 nativeNegative('UNEXPECTED_GOLD_FINGER',r=>{r.settings.push({...clone(r.settings.find((x:any)=>x.type==='STYLE')),id:'gold',type:'GOLD_FINGER'})})
 for(const type of IMPORT_WORLD_SETTING_TYPES)nativeNegative('WORLD_SETTING_TYPES_INCOMPLETE',r=>{r.settings=r.settings.filter((x:any)=>x.type!==type)})
 nativeNegative('NATIVE_ITEM_MULTISET_MISMATCH',r=>{r.items[0].description='changed'})
 nativeNegative('NATIVE_FORESHADOW_MULTISET_MISMATCH',r=>{r.foreshadows[0].content='changed'})
})

test('character MAP world event narrative refs and reliability have concrete failures',()=>{
 nativeNegative('NATIVE_CHARACTER_RELATIONSHIP_MISMATCH',r=>{r.characters[0].relationships[0].characterId='wrong'})
 nativeNegative('NATIVE_MAP_PARENT_MISMATCH',r=>{r.settings.find((x:any)=>x.id==='native-map-child').parentId=r.settings.find((x:any)=>x.type==='GEOGRAPHY').id})
 nativeNegative('NATIVE_WORLD_SETTING_MISMATCH',r=>{r.settings.find((x:any)=>x.type==='GEOGRAPHY').worldId='wrong'})
 nativeNegative('NATIVE_WORLD_EVENT_MISMATCH',r=>{r.planning[0].data.events[0].people=['wrong']})
 nativeNegative('NATIVE_WORLD_EVENT_MISMATCH',r=>{r.planning[0].data.events[0].time.value++})
 nativeNegative('NATIVE_NARRATIVE_STRUCTURE_MISMATCH',r=>{r.planning[0].data.cards.find((x:any)=>x.id.startsWith('import-narrative-')).chapter=r.chapters[0].id})
 nativeNegative('NATIVE_NARRATIVE_REFS_MISMATCH',r=>{r.planning[0].data.cards.find((x:any)=>x.id.startsWith('import-narrative-')).tellings[0].refs[0].event='wrong'})
 nativeNegative('NATIVE_NARRATIVE_RELIABILITY_MISMATCH',r=>{r.planning[0].data.cards.find((x:any)=>x.id.startsWith('import-narrative-')).tellings[0].reliability='人物推测'})
 nativeNegative('NATIVE_PLANNING_PROJECTION_MISMATCH',r=>{r.planning[0].data.lines[0].name='changed'})
 nativeNegative('NATIVE_PLANNING_PROJECTION_MISMATCH',r=>{r.planning[0].data.volumes[0].title='changed'})
 nativeNegative('NATIVE_PLANNING_PROJECTION_MISMATCH',r=>{r.planning[0].data.chapters[0].wordBudget++})
 nativeNegative('NATIVE_PLANNING_PROJECTION_MISMATCH',r=>{r.planning[0].data.cards.find((x:any)=>x.id.startsWith('import-chapter-card-')).tellings[0].source='changed'})
 nativeNegative('NATIVE_PLANNING_PROJECTION_MISMATCH',r=>{r.planning[0].data.cards.push(clone(r.planning[0].data.cards[0]))})
})

test('ContentVersion snapshot and ContentMutation bind every persisted field',()=>{
 for(const mutate of [(r:any)=>{r.versions=[]},(r:any)=>{r.versions.push({...clone(r.versions[0]),id:'extra'})},(r:any)=>{r.versions[0].id=''},(r:any)=>{r.versions[0].targetType='NOVEL'},(r:any)=>{r.versions[0].targetId='wrong'},(r:any)=>{r.versions[0].version=2},(r:any)=>{r.versions[0].reason='changed'},(r:any)=>{r.versions[0].createdAt='invalid'}])nativeNegative('CONTENT_VERSION_BINDING_INVALID',mutate)
 const fields=['version','chapterVersion','semanticVersion','semanticAudit','sourceCopyIds','mappingWarnings','importBudget','id','title','createdAt','sourceKinds','targets','modified','summary','materials','decisions','originalProse','workingProse','sources','coverage','notFound','importHash']
 for(const field of fields)nativeNegative('SNAPSHOT_BINDING_INVALID',r=>{r.versions[0].snapshot[field]=field==='modified'?true:'changed'})
 nativeNegative('SNAPSHOT_BINDING_INVALID',r=>{r.versions[0].snapshot.materials[0].facts.changed='x'})
 nativeNegative('SNAPSHOT_BINDING_INVALID',r=>{r.versions[0].snapshot.materials[0].evidence=[]})
 for(const field of ['id','userId','novelId','targetType','targetId','operationId','requestHash','beforeHash','afterHash','beforeVersion','afterVersion','result','createdAt'])nativeNegative('CONTENT_MUTATION_BINDING_INVALID',r=>{r.mutations[0][field]='changed'})
 nativeNegative('CONTENT_MUTATION_BINDING_INVALID',r=>{r.mutations.push({...clone(r.mutations[0]),id:'extra'})})
 const installed=build.migrations.files.map((f:any)=>({id:f.id,checksum:f.checksum}));verifyLocalMigrationRows(installed,build.migrations);throwsCode('DATABASE_MIGRATIONS_MISMATCH',()=>verifyLocalMigrationRows(installed.slice(1),build.migrations))
})

test('build launch shutdown and normal-close identities are exact',()=>{
 for(const mutate of [(b:any)=>{b.run='old'},(b:any)=>{b.sessionId=randomUUID()},(b:any)=>{b.launchId='bad'},(b:any)=>{b.appPid=0},(b:any)=>{b.workId=randomUUID()},(b:any)=>{b.novelId='bad'},(b:any)=>{b.importHash='bad'},(b:any)=>{b.repo='other'}]){const changed=clone(build);mutate(changed);throwsCode('FINAL_BUILD_LAUNCH_BINDING_REQUIRED',()=>verifyLocalShutdown(shutdown,s,changed,run.run,binding))}
 for(const mutate of [(e:any)=>{e.sessionId=randomUUID()},(e:any)=>{e.launchId=randomUUID()},(e:any)=>{e.appPid++},(e:any)=>{e.normalExit=false},(e:any)=>{e.exitCode=1},(e:any)=>{e.exitedAt=stamp},(e:any)=>{e.workId=randomUUID()},(e:any)=>{e.importHash='bad'}]){const changed=clone(shutdown);mutate(changed);throwsCode('CURRENT_NORMAL_EXIT_REQUIRED',()=>verifyLocalShutdown(changed,s,build,run.run,binding))}
})

test('LOTM-L-PERF01: 1402 chapter budgets use exact reading-card membership without repeated whole-book sorting',{timeout:30000},()=>{
 const data=validatePlanning(rows.planning[0].data),parent={...data.cards[0],id:'organization-parent',chapter:null,parent:null,wordBudget:null,narrateSummary:false}
 const withParent=validatePlanning({...data,cards:[parent,...data.cards.map(card=>({...card,parent:parent.id}))]})
 assert.equal(withParent.cards.length,1404);assert.deepEqual(withParent.cards.slice(1).map(card=>({...card,parent:null})),data.cards)
 assert.equal(validatePlanning({...data,cards:[{...parent,narrateSummary:true},...data.cards.map(card=>({...card,parent:parent.id}))]}).cards.length,1404)
 for(const [code,mutate]of [
  ['BUDGET_EXCEEDED',(card:any)=>{card.wordBudget=rows.chapters[0].wordCount+1}],
  ['BUDGET_RANGE_INVALID',(card:any)=>{card.wordBudget=1}],
 ]as const){const changed=structuredClone(data);changed.chapters[0].wordMin=rows.chapters[0].wordCount;changed.cards[0].wordBudget=rows.chapters[0].wordCount;mutate(changed.cards[0]);assert.throws(()=>validatePlanning(changed),(error:any)=>error?.code===code)}
 assert.throws(()=>validatePlanning({...data,lines:[]}),/卡片所属叙事线不存在/)
})

test('runMetadata is explicit tracked input and never falls back to a simplified file',async()=>{
 let opened=0;const openScratch=async()=>{opened++;throw Error('must not open')}
 await rejectsCode('FROZEN_SOURCE_OUTSIDE_OWN_CORPUS',()=>auditLocalClosedWork({...binding,label:'outside-run-metadata',runMetadata:join(root,'outside.json'),hooks:{openScratch}}));assert.equal(opened,0)
 await rejectsCode('RUN_METADATA_CHANGED',()=>auditLocalClosedWork({...binding,label:'bad-run-metadata-sha',runMetadata:join(binding.runDir,'run.json'),runSha256:'0'.repeat(64),hooks:{openScratch}}));assert.equal(opened,0)
 const simplified=join(binding.runDir,'simplified-run.json'),value=clone(run);delete value.schemaVersion;await json(simplified,value);const runSha256=sha(await readFile(simplified))
 await rejectsCode('FROZEN_COUNTS_INVALID',()=>auditLocalClosedWork({...binding,label:'simplified-run-metadata',runMetadata:simplified,runSha256,hooks:{openScratch}}));assert.equal(opened,0)
})

test('final build hashes and work manifest are verified before any database engine opens',async()=>{
 const buildPath=join(binding.runDir,'final-build.json'),originalBuild=await readFile(buildPath),changedBuild=clone(build);changedBuild.sha256['prisma/schema.prisma']='0'.repeat(64);let opened=0
 await json(buildPath,changedBuild)
 try{await rejectsCode('FINAL_BUILD_OR_MIGRATIONS_CHANGED',()=>auditLocalClosedWork({...binding,label:'bad-final-build',hooks:{openScratch:async()=>{opened++;throw Error('must not open')}}}));assert.equal(opened,0)}finally{await writeFile(buildPath,originalBuild)}
 const manifestPath=join(binding.workRoot,'shakeink-work.json'),originalManifest=await readFile(manifestPath),manifest=JSON.parse(originalManifest.toString('utf8'));manifest.requestHash='0'.repeat(64);await json(manifestPath,manifest)
 try{await rejectsCode('OWN_WORK_MANIFEST_RECEIPT_MISMATCH',()=>auditLocalClosedWork({...binding,label:'bad-work-manifest',hooks:{openScratch:async()=>{opened++;throw Error('must not open')}}}));assert.equal(opened,0)}finally{await writeFile(manifestPath,originalManifest)}
})

test('copy during/after and post-query/final tampering never opens the original database',{timeout:240000},async t=>{
 const dbFile=join(binding.workRoot,'database','PG_VERSION'),inputFile=join(binding.runDir,'expected-body.txt'),pointerFile=join(binding.workRoot,'shakeink-storage.json')
 const replace=async(target:string)=>{const held=target+'-held-'+randomUUID();await rename(target,held);await writeFile(target,'tampered');return async()=>{await rm(target,{force:true});await rename(held,target)}}
 await t.test('during copy',async()=>{let restore=async()=>{},opened=0;try{await rejectsCode('SOURCE_CHANGED_DURING_COPY',()=>auditLocalClosedWork({...binding,label:'io-during-copy',hooks:{beforeCopyEntry:async(entry:any)=>{if(entry.type==='file'&&entry.path==='PG_VERSION')restore=await replace(dbFile)},openScratch:async()=>{opened++;throw Error('must not open')}}}));assert.equal(opened,0)}finally{await restore()}})
 await t.test('after copy',async()=>{let restore=async()=>{},opened=0;try{await rejectsCode('DATABASE_TREE_CHANGED',()=>auditLocalClosedWork({...binding,label:'io-after-copy',hooks:{afterCopy:async()=>{restore=await replace(dbFile)},openScratch:async()=>{opened++;throw Error('must not open')}}}));assert.equal(opened,0)}finally{await restore()}})
 await t.test('after query input',async()=>{let restore=async()=>{},opened=0;try{await rejectsCode('FROZEN_FILE_CHANGED_DURING_AUDIT',()=>auditLocalClosedWork({...binding,label:'io-after-query',hooks:{afterQuery:async()=>{restore=await replace(inputFile)},openScratch:async(path:string)=>{opened++;return PGlite.create({dataDir:path,relaxedDurability:false})}}}));assert.equal(opened,1)}finally{await restore()}})
 await t.test('before final pointer check',async()=>{let restore=async()=>{};try{await rejectsCode('FROZEN_FILE_CHANGED_DURING_AUDIT',()=>auditLocalClosedWork({...binding,label:'io-final-pointer',hooks:{beforeFinalVerification:async()=>{restore=await replace(pointerFile)}}}))}finally{await restore()}})
})

test('links hardlinks wrong storage scratch replacement existing label and live app are blocked',{timeout:120000},async t=>{
 await t.test('link closure',async()=>{const dir=join(root,'io-links');await mkdir(dir);await writeFile(join(dir,'file'),'safe');await symlink(join(dir,'file'),join(dir,'sym'));await rejectsCode('DATABASE_LINK_REJECTED',()=>captureLocalAuditTree(dir));await rm(join(dir,'sym'));await link(join(dir,'file'),join(dir,'hard'));await rejectsCode('DATABASE_SPECIAL_OR_HARDLINK',()=>captureLocalAuditTree(dir))})
 await t.test('wrong candidate and every pointer control field',async()=>{const work=join(root,'wrong-candidate'),pointer=join(work,'shakeink-storage.json'),required=join(work,'shakeink-storage-required.json'),workId=s.publication!.workId!;await mkdir(work);const save=async(state:any)=>json(pointer,{state,sha256:sha(JSON.stringify(state))}),wrong={schemaVersion:1,workId,revision:1,active:{kind:'candidate',id:randomUUID(),directory:{path:join(work,'other'),device:'1',inode:'2'}},previous:null};await save(wrong);await rejectsCode('STORAGE_CANDIDATE_OUTSIDE_ALLOWED_SLOT',()=>resolveLocalAuditStorage(work,workId))
  const valid={schemaVersion:1,workId,revision:0,active:{kind:'original'},previous:null};for(const mutate of [(x:any)=>{x.workId=randomUUID()},(x:any)=>{x.revision=-1},(x:any)=>{x.active={kind:'bad'}},(x:any)=>{x.previous={active:{kind:'original'},backupId:'bad'}},(x:any)=>{x.extra=true}]){const changed=clone(valid);mutate(changed);await save(changed);await rejectsCode('STORAGE_POINTER_IDENTITY_INVALID',()=>resolveLocalAuditStorage(work,workId))}
  await json(pointer,{state:valid,sha256:'0'.repeat(64)});await rejectsCode('STORAGE_POINTER_IDENTITY_INVALID',()=>resolveLocalAuditStorage(work,workId));await rm(pointer);await json(required,{schemaVersion:1,workId,required:true});await rejectsCode('STORAGE_REQUIRED_POINTER_MISSING',()=>resolveLocalAuditStorage(work,workId));await save(valid)
  for(const [code,marker]of [['STORAGE_REQUIRED_WORK_MISMATCH',{schemaVersion:1,workId:randomUUID(),required:true}],['STORAGE_REQUIRED_MARKER_INVALID',{schemaVersion:1,workId,required:false}],['STORAGE_REQUIRED_MARKER_INVALID',{schemaVersion:1,workId,required:true,extra:true}]]as const){await json(required,marker);await rejectsCode(code,()=>resolveLocalAuditStorage(work,workId))}
 })
 await t.test('scratch replacement',async()=>{let opened=0;const output=join(binding.runDir,'io-scratch-audit'),scratch=join(output,'scratch-database');await rejectsCode('SCRATCH_REPLACED',()=>auditLocalClosedWork({...binding,label:'io-scratch',hooks:{beforeScratchOpen:async()=>{const held=scratch+'-held';await rename(scratch,held);await symlink(join(binding.workRoot,'database'),scratch)},openScratch:async()=>{opened++;throw Error('must not open')}}}));assert.equal(opened,0)})
 await t.test('existing output',async()=>{const output=join(binding.runDir,'io-taken-audit');await mkdir(output);await writeFile(join(output,'sentinel'),'keep');await rejectsCode('AUDIT_OUTPUT_EXISTS',()=>auditLocalClosedWork({...binding,label:'io-taken'}));assert.equal(await readFile(join(output,'sentinel'),'utf8'),'keep')})
 await t.test('not closed and lock',async()=>{await rejectsCode('NORMAL_APP_SHUTDOWN_REQUIRED',()=>auditLocalClosedWork({...binding,label:'io-live',appClosed:false}));const lock=join(binding.workRoot,'.shakeink-lock');await mkdir(lock);try{await rejectsCode('APPLICATION_STILL_OPEN',()=>auditLocalClosedWork({...binding,label:'io-lock'}))}finally{await rm(lock,{recursive:true,force:true})}})
})
