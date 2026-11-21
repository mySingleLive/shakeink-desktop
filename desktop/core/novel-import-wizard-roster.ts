import {mergeWizardRoster,wizardCandidateId,WIZARD_ALIAS_LIMIT,WIZARD_MAIN_WORLD_ID,WIZARD_MAIN_WORLD_NAME,wizardChapterCount,keepWizardItem,wizardItemRejected,normalizeWizardName,splitWizardSourceBlocks,splitWizardSourceWorlds,type WizardCandidate,type WizardRosterEntry,type WizardSettingType} from './novel-import-wizard'
import type {ImportArtifact} from '../shared/novel-import'

export type WizardRosterKind='character'|'scene'|'item'|'world'
export interface WizardRosterStashEntry extends WizardRosterEntry {unitId?:string;settings?:{settingType:WizardSettingType;name:string}[]}
export type WizardRosterStash=Partial<Record<WizardRosterKind,WizardRosterStashEntry[]>>

/** Return only nodes on cycles, not the branches leading to them. No recursion on long books. */
export function sceneParentCycleIds(nodes:readonly {id:string;parentId?:string}[]):string[]{
 const byId=new Map(nodes.map(node=>[node.id,node]));if(byId.size!==nodes.length)throw Error('场景清单标识重复')
 if(nodes.some(node=>node.parentId!==undefined&&!byId.has(node.parentId)))throw Error('场景上级不在完整清单中')
 const done=new Set<string>(),cycles=new Set<string>()
 for(const node of nodes){
  if(done.has(node.id))continue
  const path:string[]=[],seen=new Map<string,number>();let cursor:string|undefined=node.id
  while(cursor!==undefined&&!done.has(cursor)){
   const at=seen.get(cursor);if(at!==undefined){for(const id of path.slice(at))cycles.add(id);break}
   seen.set(cursor,path.length);path.push(cursor);cursor=byId.get(cursor)!.parentId
  }
  for(const id of path)done.add(id)
 }
 return nodes.filter(node=>cycles.has(node.id)).map(node=>node.id)
}
/** Apply explicit model proposals to a copy, after exact target coverage and full-graph validation. */
export function applySceneParentProposals<T extends {id:string;parentId?:string}>(nodes:readonly T[],targets:readonly string[],proposals:readonly {id:string;parentId?:string;evidence:{unitId:string;quote:string}}[]):T[]{
 const cyclic=sceneParentCycleIds(nodes),targetIds=new Set(targets),byId=new Map(nodes.map(node=>[node.id,node]))
 if(!targets.length||targets.length>32||targetIds.size!==targets.length||cyclic.length!==targets.length||cyclic.some(id=>!targetIds.has(id)))throw Error('场景上级修订目标必须恰好覆盖全部循环节点')
 if(!Array.isArray(proposals)||proposals.length!==targets.length||new Set(proposals.map(item=>item.id)).size!==targets.length||proposals.some(item=>!targetIds.has(item.id)||Object.keys(item).some(key=>!['id','parentId','evidence'].includes(key))||item.parentId!==undefined&&(typeof item.parentId!=='string'||!byId.has(item.parentId)||item.parentId===item.id)))throw Error('场景上级修订必须为每个目标提供唯一有效的父级提案')
 const changes=new Map(proposals.map(item=>[item.id,item])),next=nodes.map(node=>{
  const change=changes.get(node.id);if(!change)return node
  if(change.parentId!==undefined)return {...node,parentId:change.parentId}
  const {parentId:_parent,...root}=node;return root as T
 })
 if(sceneParentCycleIds(next).length)throw Error('场景上级修订后仍存在循环')
 return next
}

/** Turn merged model rosters and copied source blocks into the author's checklist. Source entries
 * are always kept; body items need importance; worlds expand into setting leaves. */
/** A category heading such as “# 场景” with nothing under it names a group, not an entry. */
const headingOnly=(text:string)=>!text.replace(/^#{1,4}[\t ]+[^\r\n]*$/gmu,'').trim()
/** `taken`: normalized names of selected characters and places; a body item with one of those own
 * names is the same person or place, not an item (docs/490 2R2-4). Source items are always kept. */
export function buildWizardCandidates(kind:WizardRosterKind,entries:readonly WizardRosterStashEntry[],sources:readonly ImportArtifact[],chapters:readonly {content:string}[],taken:ReadonlySet<string>=new Set()):WizardCandidate[]{
 if(kind==='world')return buildWorlds(entries,sources,chapters,taken)
 const sourceEntries=sources.flatMap(a=>(kind==='character'?[{name:a.name,text:a.text}]:splitWizardSourceBlocks(a.text,a.name).filter(b=>!headingOnly(b.text))).map(b=>({name:b.name,artifactId:a.id,roleType:a.facts.roleType as WizardRosterEntry['roleType']})))
 const merged=mergeWizardRoster(kind,[...entries,...sourceEntries.map(e=>({name:e.name,aliases:[],...(e.roleType?{roleType:e.roleType}:{})}))])
 const result:WizardCandidate[]=[]
 for(const c of merged){
  // Match on every merged name, not the capped alias list, so sources and evidence are never lost.
  const keys=c.names,hits=sourceEntries.filter(e=>keys.has(normalizeWizardName(e.name)))
  const fromBody=entries.some(e=>[e.name,...e.aliases].some(n=>keys.has(normalizeWizardName(n))))
  const chapterCount=wizardChapterCount({name:c.name,aliases:[...new Set([c.name,...c.aliases,...entries.flatMap(e=>[e.name,...e.aliases]),...hits.map(h=>h.name)].filter(n=>keys.has(normalizeWizardName(n))))]},chapters)
  if(kind==='item'&&!hits.length&&(wizardItemRejected(c)||[...c.primaries].some(n=>taken.has(n))))continue
  if(kind==='item'&&!keepWizardItem({important:!!c.important,chapterCount,fromSource:hits.length>0}))continue
  const {important:_important,names:_names,primaries:_primaries,itemVotes:_itemVotes,otherVotes:_otherVotes,...rest}=c,evidenceUnitIds=[...new Set(entries.filter(e=>[e.name,...e.aliases].some(n=>keys.has(normalizeWizardName(n)))).flatMap(e=>e.unitId?[e.unitId]:[]))].slice(0,200)
  result.push({...rest,...(evidenceUnitIds.length?{evidenceUnitIds}:{}),chapterCount,sources:[...(hits.length?['source' as const]:[]),...(fromBody?['body' as const]:[])],sourceArtifactIds:[...new Set(hits.map(h=>h.artifactId))]})
 }
 // Scene parents are stored as candidate ids; unknown parents become top-level places.
 if(kind==='scene'){const byName=new Map(result.flatMap(c=>[c.name,...c.aliases].map(n=>[normalizeWizardName(n),c.id] as const)));for(const c of result){const parent=c.parentId?byName.get(normalizeWizardName(c.parentId)):undefined;if(parent&&parent!==c.id)c.parentId=parent;else delete c.parentId}}
 return result.sort((a,b)=>Number(b.sources.includes('source'))-Number(a.sources.includes('source'))||b.chapterCount-a.chapterCount)
}
/** A source world titled only by its category (the neutral container or a “世界观” heading) takes the body name. */
const NEUTRAL_WORLD_NAMES=new Set(['世界','世界观','世界设定'].map(normalizeWizardName))
/** docs/503 2R: one main world for every body entry without parent or parallel flag. Entries named
 * like a selected character, or child worlds named like a setting, only give settings. The main world
 * keeps a fixed id; settings take their ids from their world, so selections survive a new vote. */
function buildWorlds(entries:readonly WizardRosterStashEntry[],sources:readonly ImportArtifact[],chapters:readonly {content:string}[],taken:ReadonlySet<string>):WizardCandidate[]{
 const norm=normalizeWizardName,mainKey=norm(WIZARD_MAIN_WORLD_NAME),worlds:WizardCandidate[]=[],settings=new Map<string,{c:WizardCandidate;votes:Map<WizardSettingType,number>;fixed?:WizardSettingType}>()
 const base=(from:'source'|'body')=>({aliases:[] as string[],chapterCount:0,sources:[from] as ('source'|'body')[],sourceArtifactIds:[] as string[],selected:true})
 const addSource=(c:WizardCandidate,from:'source'|'body')=>{if(!c.sources.includes(from))c.sources.push(from)}
 const cite=(c:WizardCandidate,unitId?:string)=>{if(unitId&&!(c.evidenceUnitIds??=[]).includes(unitId)&&c.evidenceUnitIds.length<200)c.evidenceUnitIds.push(unitId)}
 const setting=(owner:WizardCandidate,name:string,settingType:WizardSettingType,from:'source'|'body',artifactId?:string)=>{
  const key=owner.id+'\0'+norm(name);let entry=settings.get(key)
  if(!entry){entry={c:{...base(from),id:wizardCandidateId('world-setting',owner.id+'\0'+name),kind:'world-setting',name,parentId:owner.id,settingType},votes:new Map()};settings.set(key,entry)}else addSource(entry.c,from)
  if(from==='source')entry.fixed??=settingType;else entry.votes.set(settingType,(entry.votes.get(settingType)??0)+1)
  if(artifactId&&!entry.c.sourceArtifactIds.includes(artifactId))entry.c.sourceArtifactIds.push(artifactId)
  return entry.c
 }
 // Source worlds keep their own names and ids.
 const byName=new Map<string,WizardCandidate>(),sourceWorlds:WizardCandidate[]=[],sourceSettings:{owner:WizardCandidate;name:string;settingType:WizardSettingType;artifactId:string}[]=[]
 for(const a of sources)for(const w of splitWizardSourceWorlds(a.text,a.name)){
  const key=norm(w.world.name);let owner=byName.get(key)
  if(!owner){owner={...base('source'),id:wizardCandidateId('world',w.world.name),kind:'world',name:w.world.name};byName.set(key,owner);sourceWorlds.push(owner)}
  if(!owner.sourceArtifactIds.includes(a.id))owner.sourceArtifactIds.push(a.id)
  for(const s of w.settings)sourceSettings.push({owner,name:s.name,settingType:s.settingType,artifactId:a.id})
 }
 // Decide each body entry's role. Settings named anywhere tell a misfiled child world.
 const settingNames=new Set(entries.flatMap(e=>(e.settings??[]).map(s=>norm(s.name))))
 const role=entries.map(e=>taken.has(norm(e.name))?'main-nameless':e.parallel?'parallel':e.parent?(settingNames.has(norm(e.name))?'main-nameless':'sub'):'main')
 // A name that is also some setting (a country, era or concept) or a selected character never names the main world.
 const unnamed=(k:string)=>!k||k===mainKey||taken.has(k)||settingNames.has(k)
 const mainCounts=new Map<string,{display:string;count:number}>(),mainNames=new Set<string>()
 const nameMain=(e:WizardRosterStashEntry)=>{for(const n of [e.name,...e.aliases]){const k=norm(n);if(unnamed(k))continue;mainNames.add(k)}const k=norm(e.name);if(!unnamed(k)){const v=mainCounts.get(k);if(v)v.count++;else mainCounts.set(k,{display:e.name.trim(),count:1})}}
 entries.forEach((e,i)=>{if(role[i]==='main')nameMain(e)})
 // A parallel or child world that shares a main world name is the main world.
 entries.forEach((e,i)=>{if((role[i]==='parallel'||role[i]==='sub')&&(mainNames.has(norm(e.name))||norm(e.name)===mainKey)){role[i]='main';nameMain(e)}})
 let main:WizardCandidate|undefined
 if(role.some(r=>r==='main'||r==='main-nameless')||sourceWorlds.length===1&&role.some(r=>r==='sub')){
  let best:{display:string;count:number}|undefined;for(const v of mainCounts.values())if(!best||v.count>best.count)best=v
  const name=best?.display??WIZARD_MAIN_WORLD_NAME,aliases=[...new Set(entries.flatMap((e,i)=>role[i]==='main'?[e.name,...e.aliases]:[]).map(n=>n.trim()).filter(n=>{const k=norm(n);return !unnamed(k)&&k!==norm(name)}))]
  const named=sourceWorlds.length===1?sourceWorlds[0]:sourceWorlds.find(w=>mainNames.has(norm(w.name)))
  if(named){main=named;addSource(main,'body');if(NEUTRAL_WORLD_NAMES.has(norm(main.name))&&best){main.aliases=[...new Set([...main.aliases,main.name])];main.name=name}main.aliases=[...new Set([...main.aliases,...aliases,...(norm(main.name)!==norm(name)?[name]:[])])].filter(a=>norm(a)!==norm(main!.name)&&norm(a)!==mainKey).slice(0,WIZARD_ALIAS_LIMIT)}
  else{main={...base('body'),id:WIZARD_MAIN_WORLD_ID,kind:'world',name,aliases:aliases.slice(0,WIZARD_ALIAS_LIMIT)};worlds.push(main)}
  for(const k of mainNames)byName.set(k,main);byName.set(norm(main.name),main)
 }
 worlds.push(...sourceWorlds)
 // Child and parallel worlds by name; the parent is the most voted one.
 const votes=new Map<WizardCandidate,Map<string,number>>()
 entries.forEach((e,i)=>{
  if(role[i]!=='sub'&&role[i]!=='parallel')return
  const key=norm(e.name);let w=byName.get(key)
  if(!w){w={...base('body'),id:wizardCandidateId('world',e.name),kind:'world',name:e.name.trim()};byName.set(key,w);worlds.push(w)}else addSource(w,'body')
  for(const a of e.aliases){const k=norm(a);if(k&&!byName.has(k)&&!taken.has(k)){byName.set(k,w);if(w.aliases.length<WIZARD_ALIAS_LIMIT)w.aliases.push(a.trim())}}
  if(role[i]==='sub'&&e.parent){const m=votes.get(w)??new Map<string,number>();m.set(norm(e.parent),(m.get(norm(e.parent))??0)+1);votes.set(w,m)}
 })
 // Each parent name is resolved to a world first, so different names of one world vote together.
 for(const [w,m] of votes){
  if(w===main)continue
  const tally=new Map<WizardCandidate|undefined,number>()
  // Names that resolve to no world (or to itself) do not vote; with no valid vote the world goes under the main world.
  for(const [k,n] of m){const t=k===mainKey?main:byName.get(k);if(t&&t!==w)tally.set(t,(tally.get(t)??0)+n)}
  let resolved:WizardCandidate|undefined=main,count=0;for(const [t,n] of tally)if(n>count){resolved=t;count=n}
  if(resolved&&resolved!==w)w.parentId=resolved.id
 }
 // Cycles among child worlds are cut onto the main world (or the top level).
 for(const id of sceneParentCycleIds(worlds)){const w=worlds.find(x=>x.id===id)!;if(main&&main.id!==id)w.parentId=main.id;else delete w.parentId}
 for(const s of sourceSettings)setting(s.owner,s.name,s.settingType,'source',s.artifactId)
 entries.forEach((e,i)=>{
  const owner=role[i]==='main'||role[i]==='main-nameless'?main!:byName.get(norm(e.name))!
  cite(owner,e.unitId);for(const s of e.settings??[])cite(setting(owner,s.name,s.settingType,'body'),e.unitId)
 })
 for(const {c,votes:v,fixed} of settings.values()){if(fixed)c.settingType=fixed;else{let best=0;for(const [t,n] of v)if(n>best){best=n;c.settingType=t}}}
 for(const w of worlds)w.chapterCount=wizardChapterCount(w,chapters)
 const list=[...settings.values()].map(s=>s.c);for(const s of list)s.chapterCount=wizardChapterCount(s,chapters)
 return [...worlds,...list]
}
