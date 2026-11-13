import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,stat,realpath,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID,createHash} from 'node:crypto'
import {Workspaces} from '../../desktop/service/workspaces'
import {loadDatabaseSeed} from '../../desktop/service/database/seed'
import {prisma} from '../../src/lib/db'
import {publishNovelImport,readNovelImportRecord} from '../../desktop/service/novel-import-publish'
import {importPlanHash,importHash,sourceImportArtifacts} from '../../desktop/core/novel-import'
import {importNativeMappings} from '../../desktop/core/novel-import-semantic-state'
import {createImportBudgetPolicy} from '../../desktop/core/novel-import-budget-policy'
import {normalizeContent} from '../../src/components/content/setting-content'
import {pdfInspectionLedgerHash} from '../../desktop/core/novel-import-pdf'
import {SOURCE_TEXT_POLICY,sourceTextHash,sourceTextProofHash} from '../../desktop/core/novel-import-pdf-source-text'
import type {ImportArtifact,ImportPublishInput,ImportSession,ImportTarget} from '../../desktop/shared/novel-import'

// Every database and source belongs to this disposable fixture root. No user
// workspace, provider, Key, oracle or real-book source is opened.
let root:string,works:Workspaces
const sha=(text:string)=>createHash('sha256').update(text).digest('hex'),now='2026-01-01T00:00:00.000Z'
before(async()=>{root=await realpath(await mkdtemp(join(tmpdir(),'result-quality-publish-')));await mkdir(join(root,'app'));works=new Workspaces(join(root,'app'),resolve('prisma/migrations'),await loadDatabaseSeed(resolve('prisma/empty-database.json')));await works.initialize()})
after(async()=>{await works?.close();if(root)await rm(root,{recursive:true,force:true})})
interface Material {id:string;kind:ImportTarget;name:string;text:string;facts:Record<string,string>;origin?:ImportArtifact['origin'];schema?:2}
function material(id:string,kind:ImportTarget,facts:Record<string,string>,text='完整合成材料首句\r\n完整合成材料末句😀',name='合成'+id):Material{return {id,kind,name,text,facts}}
async function input(materials:Material[]=[],legacy=false):Promise<ImportPublishInput>{
 const id=legacy?'11111111-1111-4111-8111-111111111111':randomUUID(),folder=join(root,'fixture-'+randomUUID()),source=join(folder,'sources'),target=join(folder,'work');await mkdir(folder);await mkdir(source);await mkdir(target)
 const text=legacy?'Legacy body.\r\nFinal 😀.':'Synthetic body.\r\nThe final synthetic line. 😀',path=join(source,'body.txt');await writeFile(path,text);const identity=await stat(target,{bigint:true})
 const s:ImportSession&{semanticVersion?:1}={...(legacy?{}:{semanticVersion:1}),version:1,id,revision:1,phase:'publishing',title:legacy?'Synthetic legacy record':'合成语义原生发布',files:[{id:'body-file',name:legacy?'legacy.txt':'正文.txt',path,format:'txt',bytes:Buffer.byteLength(text),hash:sha(text),text,included:true}],units:[{id:'body-unit',fileId:'body-file',start:0,end:text.length,text,kind:'body'}],selected:['body'],targets:[],infer:false,artifacts:[],conflicts:[],patches:[],originalProse:text,workingProse:text,workingRevision:0,chapters:[{id:'chapter-1',title:legacy?'Legacy chapter':'合成正文',start:0,end:text.length,content:text}],steps:[],coverage:{body:['body-unit']},notFound:[],epoch:1,createdAt:now,updatedAt:now,decisions:[],publication:{requestId:id}}
 for(const m of materials){const text=m.text||'合成中性世界容器；来源没有已知介绍。',path=join(source,m.id+'.txt'),fileId='file-'+m.id,unitId='unit-'+m.id;await writeFile(path,text);s.files.push({id:fileId,name:m.name+'.txt',path,format:'txt',bytes:Buffer.byteLength(text),hash:sha(text),text,included:true});s.units.push({id:unitId,fileId,start:0,end:text.length,text,kind:m.kind});if(!s.selected.includes(m.kind))s.selected.push(m.kind);s.artifacts.push({...m,origin:m.origin??'confirmed',evidence:[{unitId,quote:text}],sourceUnitIds:[unitId]})}
 return {session:s,selection:{path:target,device:String(identity.dev),inode:String(identity.ino)},importHash:importPlanHash(s)}
}

import {IMPORT_KNOWLEDGE_ANNOTATION,IMPORT_THEME_PROFILE_ID,IMPORT_THEME_PROFILE_NAME} from '../../desktop/core/novel-import-semantics'
/* docs/542–543 IQ-09..12, IQ-41..43. Synthetic materials only. */
const note='（可靠性：人物推测；信息来源：合成叙述者；适用时间范围：早期）'
const knowledge={reliability:'人物推测',attribution:'合成叙述者',temporalScope:'早期'}
const annotated=(text:string)=>IMPORT_KNOWLEDGE_ANNOTATION.test(text)
const deepTexts=(value:unknown):string[]=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(deepTexts):value&&typeof value==='object'?Object.values(value).flatMap(deepTexts):[]

test('IQ-09/IQ-12: every inferred kind is published without knowledge notes; native reliability stays',{timeout:120000},async()=>{
 const level={scope:'GENERAL',form:'SINGLE',description:'等级说明',rules:'规则',levels:[{name:'一级',aliases:[],tags:[],condition:'条件',description:'级说明',abilities:[{name:'能力',description:'能力说明'}],children:[]}],pathways:[]}
 const materials=[
  material('p','character',{...knowledge,roleType:'PROTAGONIST',aliases:'[]',relationships:'[]'},'主角简介','合成主角'),
  material('place','scene',{...knowledge,entityType:'PLACE'},'渡口描述','合成渡口'),
  material('w','world',{...knowledge,entityType:'WORLD'},'世界介绍','合成世界'),
  material('lv','world',{...knowledge,entityType:'SETTING',worldId:'w',settingType:'LEVEL_SYSTEM',content:JSON.stringify(level)},'等级','合成等级'),
  material('fa','world',{...knowledge,entityType:'SETTING',worldId:'w',settingType:'FACTION',content:JSON.stringify({factions:[{name:'甲派',description:'甲派说明',relations:'与乙派敌对'}]})},'势力','合成势力'),
  material('so','world',{...knowledge,entityType:'SETTING',worldId:'w',settingType:'SOCIETY',content:JSON.stringify({text:'社会说明'})},'社会','合成社会'),
  material('it','item',knowledge,'物品描述','合成物品'),material('fs','foreshadow',knowledge,'伏笔内容','合成伏笔'),material('tr','trope',{...knowledge,tropeKind:'TEAR'},'泪点内容','合成泪点'),
  material('th','theme',knowledge,'主题内容','合成主题'),material('st','style',knowledge,'文风内容','合成文风'),material('ol','outline',knowledge,'卷大纲内容','合成大纲'),
  material('gf','goldenFinger',{...knowledge,trigger:'触发',limitation:'限制'},'能力内容','合成金手指'),
  material('ev','worldline',{...knowledge,reliability:'角色有限事实',lineId:'main',lineName:'主线',timeKind:'unknown',people:'["p"]'},'事件'+'甲'.repeat(100020),'合成事件'),
  material('na','narrative',{...knowledge,reliability:'可能不可靠',chapterIndex:'0',order:'0',narrator:'p',refs:'[{"eventId":"ev","kind":"mention","reliability":"人物推测","character":"p","attribution":"合成推测","temporalScope":"早期"}]'},'讲述内容','合成讲述'),
 ]
 const value=await input(materials),receipt=await publishNovelImport(works,value)
 await works.run(receipt.workId,async()=>{
  const novelId=receipt.novelId,texts:string[]=[]
  const c=await prisma.character.findFirstOrThrow({where:{novelId}});assert.equal(c.bio,'主角简介');texts.push(c.bio)
  for(const r of await prisma.scene.findMany({where:{novelId}}))texts.push(r.description)
  for(const r of await prisma.world.findMany({where:{novelId}}))texts.push(r.description)
  for(const r of await prisma.item.findMany({where:{novelId}}))texts.push(r.description)
  for(const r of await prisma.foreshadow.findMany({where:{novelId}}))texts.push(r.content)
  for(const r of await prisma.trope.findMany({where:{novelId}}))texts.push(r.content)
  const settings=await prisma.setting.findMany({where:{novelId}});for(const r of settings)texts.push(...deepTexts(r.content))
  assert.deepEqual(settings.find(r=>r.type==='LEVEL_SYSTEM')!.content,level)
  const theme=await prisma.theme.findUniqueOrThrow({where:{novelId}});texts.push(theme.synopsis);assert.equal(theme.synopsis,'主题内容')
  for(const v of await prisma.volume.findMany({where:{novelId}}))texts.push(v.summary)
  const plan=(await prisma.planningDocument.findUniqueOrThrow({where:{novelId}})).data as any
  for(const e of plan.events)texts.push(e.fact);for(const card of plan.cards)for(const t of card.tellings){texts.push(t.intent,t.source);for(const ref of t.refs)texts.push(ref.reveal,ref.source)}
  for(const ch of await prisma.chapter.findMany({where:{volume:{novelId}}}))texts.push(ch.outline)
  assert.deepEqual(texts.filter(annotated),[],'no knowledge note in any published prose')
  assert.equal(plan.events.map((e:any)=>e.fact).join(''),materials.find(m=>m.id==='ev')!.text,'long events split without a prefix')
  const telling=plan.cards.find((c:any)=>c.id.includes('import-narrative-na')).tellings[0]
  assert.equal(telling.reliability,'可能不可靠');assert.equal(telling.refs[0].reliability,'人物推测');assert.equal(telling.refs[0].source,'导入语义关系：mention')
  const snapshot=(await prisma.contentVersion.findFirstOrThrow({where:{targetType:'NOVEL_IMPORT',targetId:novelId}})).snapshot as any
  assert.equal(snapshot.materials.find((m:any)=>m.id==='p').facts.attribution,'合成叙述者','knowledge is kept in the import record')
 })
})

test('IQ-05/IQ-10/IQ-11: notes in inferred prose are cleaned at publish; source copies and the body stay verbatim',{timeout:120000},async()=>{
 const inferred=material('it2','item',knowledge,note+'\n带批注物品','合成物品二'),copy={...material('it3','item',{},'原资料（信息来源：作者笔记）保留','合成物品三'),origin:'source' as const}
 const value=await input([inferred,copy]),receipt=await publishNovelImport(works,value)
 await works.run(receipt.workId,async()=>{const items=await prisma.item.findMany({where:{novelId:receipt.novelId}});assert.equal(items.find(i=>i.name==='合成物品二')!.description,'带批注物品');assert.equal(items.find(i=>i.name==='合成物品三')!.description,copy.text)})
})

const profileMaterial=(facts:Record<string,string>):Material=>({...material(IMPORT_THEME_PROFILE_ID,'theme',facts,'定位说明',IMPORT_THEME_PROFILE_NAME),schema:2})
test('IQ-41/IQ-43: the inferred position fills the theme fields, not the author position, and the theme panel can save it',{timeout:120000},async()=>{
 const theme=material('th1','theme',{},'主题一','合成主题一'),position=profileMaterial({channel:'男频',genre:'奇幻',tags:JSON.stringify(['西方奇幻','蒸汽朋克','烧脑']),sellingPoints:'扮演法体系',targetAudience:'悬疑读者',synopsis:'一段简介。'})
 const value=await input([theme,position])
 const receipt=await publishNovelImport(works,value)
 await works.run(receipt.workId,async()=>{
  const row=await prisma.theme.findUniqueOrThrow({where:{novelId:receipt.novelId}})
  assert.deepEqual({channel:row.channel,genre:row.genre,tags:row.tags,sellingPoints:row.sellingPoints,targetAudience:row.targetAudience,synopsis:row.synopsis,length:row.length},{channel:'男频',genre:'奇幻',tags:['西方奇幻','蒸汽朋克','烧脑'],sellingPoints:'扮演法体系',targetAudience:'悬疑读者',synopsis:'一段简介。',length:'微型'})
  assert.equal(row.authorPosition,null)
  const {upsertTheme}=await import('../../src/lib/services/theme')
  const saved=await upsertTheme(receipt.novelId,{title:row.title,synopsis:row.synopsis,referenceCases:row.referenceCases,channel:row.channel,genre:row.genre,length:row.length,tags:row.tags,sellingPoints:row.sellingPoints,targetAudience:row.targetAudience},{source:'author',userId:(await prisma.novel.findUniqueOrThrow({where:{id:receipt.novelId}})).userId})
  assert.equal(saved.genre,'奇幻')
 })
})
test('IQ-42/TP-31 (docs/545): without a position the joined themes are cut to whole sentences within 15 lines and 300 characters',{timeout:120000},async()=>{
 const long=material('th2','theme',{},Array.from({length:12},(_,i)=>'长主题第'+i+'句写世界与人物。').join('\n'),'合成长主题'),other=material('th3','theme',{},'另'.repeat(200)+'。'+'另'.repeat(200)+'。','合成另主题')
 const receipt=await publishNovelImport(works,await input([long,other]))
 await works.run(receipt.workId,async()=>{const row=await prisma.theme.findUniqueOrThrow({where:{novelId:receipt.novelId}});assert.ok(Array.from(row.synopsis).length<=300);assert.ok(row.synopsis.split('\n').filter(l=>l.trim()).length<=15);assert.ok(row.synopsis.startsWith('长主题第0句'));assert.ok(row.synopsis.endsWith('。'));assert.equal(row.channel,'')})
})
test('TP-32 (docs/545): a channel-only fallback position writes the channel with genre 全部 and the joined-theme synopsis',{timeout:120000},async()=>{
 const theme=material('th4','theme',{},'渡口少年的成长。','合成主题四'),position=profileMaterial({channel:'男频'})
 const receipt=await publishNovelImport(works,await input([theme,position]))
 await works.run(receipt.workId,async()=>{const row=await prisma.theme.findUniqueOrThrow({where:{novelId:receipt.novelId}});assert.deepEqual({channel:row.channel,genre:row.genre,tags:row.tags,synopsis:row.synopsis,sellingPoints:row.sellingPoints},{channel:'男频',genre:'全部',tags:[],synopsis:'渡口少年的成长。',sellingPoints:''})})
})

test('IQ-11b (543 review M2): copied source themes, character bios and world content keep their brackets verbatim',{timeout:120000},async()=>{
 const src=(m:Material):Material=>({...m,origin:'source'})
 const theme=src(material('sth','theme',{},'主题原资料（信息来源：作者笔记）','合成源主题')),bio=src(material('sp','character',{roleType:'PROTAGONIST',aliases:'[]',relationships:'[]'},'角色原资料（可靠性：作者设定）','合成源角色'))
 const receipt=await publishNovelImport(works,await input([theme,bio]))
 await works.run(receipt.workId,async()=>{assert.equal((await prisma.theme.findUniqueOrThrow({where:{novelId:receipt.novelId}})).synopsis,theme.text);assert.equal((await prisma.character.findFirstOrThrow({where:{novelId:receipt.novelId}})).bio,bio.text)})
})

/* docs/546 §G2 TP-33a/b, docs/545 §7. */
test('TP-33a: a long copied source theme alone stays verbatim',{timeout:120000},async()=>{
 const text=Array.from({length:40},(_,i)=>'原资料主题第'+i+'句。').join('\n'),theme={...material('sl','theme',{},text,'合成长源主题'),origin:'source' as const}
 const receipt=await publishNovelImport(works,await input([theme]))
 await works.run(receipt.workId,async()=>assert.equal((await prisma.theme.findUniqueOrThrow({where:{novelId:receipt.novelId}})).synopsis,text))
})
test('TP-33b: copied source themes come first verbatim; only the inferred part is cut',{timeout:120000},async()=>{
 const sourceText='原资料主题（作者笔记）。',src={...material('sm','theme',{},sourceText,'合成源主题二'),origin:'source' as const}
 const inferred=material('im','theme',{},Array.from({length:30},(_,i)=>'推断第'+i+'句。').join('\n'),'合成推断主题')
 const receipt=await publishNovelImport(works,await input([src,inferred]))
 await works.run(receipt.workId,async()=>{const s=(await prisma.theme.findUniqueOrThrow({where:{novelId:receipt.novelId}})).synopsis
  assert.ok(s.startsWith(sourceText+'\n\n'),s.slice(0,40));const rest=s.slice(sourceText.length+2)
  assert.ok(rest.startsWith('推断第0句。'));assert.ok(rest.split('\n').filter(l=>l.trim()).length<=15);assert.ok(Array.from(rest).length<=300)})
})
