import {createHash} from 'node:crypto'
import {WIZARD_STEPS,WIZARD_STEP_TITLES,normalizeWizardName,type WizardStep} from '../shared/novel-import-wizard'
export {WIZARD_STEPS,WIZARD_STEP_TITLES,normalizeWizardName,type WizardStep}
import type {WizardCandidate,WizardCandidateKind,WizardRoleType,WizardSettingType} from '../shared/novel-import-wizard'
export type {WizardCandidate,WizardCandidateKind,WizardRoleType,WizardSettingType}
import {validateImportVolumeName} from './novel-import-chapters'
import type {ImportChapter,ImportKind,ImportTarget} from '../shared/novel-import'

export interface WizardSelection {selected:readonly ImportKind[];targets:readonly ImportTarget[];infer:boolean;textModel:boolean}
const ENTITY_STEPS:[ImportTarget,WizardStep,WizardStep][]=[['character','detect-char','import-char'],['scene','detect-scene','import-scene'],['item','detect-item','import-item'],['world','detect-world','import-world']]
const LINE_STEPS:[ImportTarget,WizardStep][]=[['worldline','worldline'],['narrative','narrative'],['outline','outline'],['foreshadow','foreshadow']]

/** Steps shown as skipped for the current content choice. Inference needs body text and a text model. */
export const WIZARD_SETTINGS_KINDS=['theme','style','goldenFinger','trope'] as const
export function wizardSkippedSteps(s:WizardSelection):Set<WizardStep>{
 const body=s.selected.includes('body'),infers=(kind:ImportTarget)=>body&&s.infer&&s.textModel&&s.targets.includes(kind),uses=(kind:ImportTarget)=>s.selected.includes(kind)||infers(kind)
 const skipped=new Set<WizardStep>()
 if(!body)for(const step of ['detect-struct','tree','import-struct','import-body'] as const)skipped.add(step)
 for(const [kind,detect,load] of ENTITY_STEPS)if(!uses(kind)){skipped.add(detect);skipped.add(load)}
 // Step 16 also carries theme, style, golden finger and tropes, so it runs whenever any of them is used.
 if(WIZARD_SETTINGS_KINDS.some(uses))skipped.delete('import-world')
 // Line steps copy source files and/or infer; they are skipped only when neither applies.
 for(const [kind,stepId] of LINE_STEPS)if(!uses(kind))skipped.add(stepId)
 return skipped
}

export interface WizardStructureChapter {start:number;end:number;title:string;volume?:string}
export interface WizardMaterialization {prose:string;chapters:ImportChapter[];volumes:{start:number;volume?:string}[]}

function assertSelection(structure:readonly WizardStructureChapter[],selection:readonly number[]){
 if(!selection.length)throw Error('请至少选择一章')
 if(selection.some((index,k)=>!Number.isSafeInteger(index)||index<0||index>=structure.length||(k>0&&index<=selection[k-1])))throw Error('章节选择无效')
}
/** Selected chapters become the working prose; volume names come from the frozen whole-book structure,
 * never from re-detecting headings in the shortened text. */
export function materializeWizardChapters(source:string,structure:readonly WizardStructureChapter[],selection:readonly number[]):WizardMaterialization{
 assertSelection(structure,selection)
 let prose='';const chapters:ImportChapter[]=[]
 for(const [k,index] of selection.entries()){
  const item=structure[index];if(item.volume!==undefined)validateImportVolumeName(item.volume)
  const content=source.slice(item.start,item.end);if(!content||item.end>source.length)throw Error('章节范围超出原文')
  const start=prose.length;prose+=content
  chapters.push({id:`chapter-${k+1}`,title:item.title,start,end:prose.length,content,...(item.volume!==undefined?{volume:item.volume}:{})})
 }
 return {prose,chapters,volumes:chapters.map(c=>({start:c.start,...(c.volume!==undefined?{volume:c.volume}:{})}))}
}
export function assertWizardMaterialization(source:string,structure:readonly WizardStructureChapter[],selection:readonly number[],prose:string,chapters:readonly Pick<ImportChapter,'start'|'end'|'content'|'volume'|'title'>[]){
 assertSelection(structure,selection)
 if(chapters.length!==selection.length)throw Error('选中章节与原文不匹配')
 let offset=0
 for(const [k,index] of selection.entries()){
  const item=structure[index],chapter=chapters[k]
  if(chapter.content!==source.slice(item.start,item.end)||chapter.start!==offset||chapter.end!==offset+chapter.content.length||chapter.title!==item.title)throw Error('选中章节与原文不匹配')
  if(chapter.volume!==item.volume)throw Error('卷归属与原书结构不匹配')
  offset=chapter.end
 }
 if(chapters.map(c=>c.content).join('')!==prose)throw Error('选中章节与原文不匹配')
}

/** After accepted body patches the working chapters differ from the originals; titles, order and
 * volumes still follow the frozen structure, and the original prose still equals the selected source. */
export function assertWizardSessionChapters(s:{originalProse:string;workingRevision:number;chapters:readonly Pick<ImportChapter,'start'|'end'|'content'|'volume'|'title'>[]},source:string,structure:readonly WizardStructureChapter[],selection:readonly number[]){
 if(!s.workingRevision)return assertWizardMaterialization(source,structure,selection,s.originalProse,s.chapters)
 const m=materializeWizardChapters(source,structure,selection);assertWizardMaterialization(source,structure,selection,s.originalProse,m.chapters)
 if(s.chapters.length!==m.chapters.length||s.chapters.some((c,k)=>c.title!==m.chapters[k].title||c.volume!==m.chapters[k].volume))throw Error('选中章节与原文不匹配')
}
/** Accepted body patches: each stays inside one chapter; chapters and volume starts shift, never re-detected. */
export function patchWizardChapters(prose:string,chapters:readonly ImportChapter[],patches:readonly {start:number;end:number;after:string}[]){
 const sorted=[...patches].sort((a,b)=>a.start-b.start),owner=sorted.map(p=>{const k=chapters.findIndex(c=>c.start<=p.start&&p.end<=c.end);if(k<0)throw Error('正文修改跨越章节边界，请逐章修改');return k})
 let text=prose;for(const p of [...sorted].reverse())text=text.slice(0,p.start)+p.after+text.slice(p.end)
 let shift=0;const result:ImportChapter[]=[]
 for(const [k,c] of chapters.entries()){
  const delta=sorted.reduce((n,p,i)=>owner[i]===k?n+p.after.length-(p.end-p.start):n,0),start=c.start+shift,end=c.end+shift+delta;shift+=delta
  const content=text.slice(start,end);if(!content.trim())throw Error('正文修改不能清空章节')
  const {outline:_outline,...rest}=c;result.push({...rest,start,end,content})
 }
 return {prose:text,chapters:result,volumes:result.map(c=>({start:c.start,...(c.volume!==undefined?{volume:c.volume}:{})}))}
}
export interface WizardRosterEntry {name:string;aliases:string[];roleType?:WizardRoleType;parent?:string;itemType?:string;important?:boolean}

const ID_PREFIX:Record<WizardCandidateKind,string>={character:'c',scene:'s',item:'i',world:'w','world-setting':'ws'}
/** Same name and kind always yield the same id; ids are safe as journal keys and file names. */
export function wizardCandidateId(kind:WizardCandidateKind,name:string,scope=''){
 return ID_PREFIX[kind]+'-'+createHash('sha256').update(kind+'\0'+scope+'\0'+normalizeWizardName(name)).digest('hex').slice(0,16)
}
const ROLE_PRIORITY:WizardRoleType[]=['PROTAGONIST','ANTAGONIST','SUPPORTING']
/** Merge batch rosters: equal normalized names or aliases are one entity; the most voted role wins,
 * ties prefer protagonist > antagonist > supporting. */
export const WIZARD_ALIAS_LIMIT=50
/** `names` holds every normalized name of the group (uncapped), for matching sources and evidence.
 * Entries join when one entry's own name is listed by another as an alias, and that link is seen in
 * at least half of the rarer name's own entries. A single mistaken alias (one batch listing another
 * character, or a title such as 魔术师 shared by several people) does not merge different characters.
 * Groups keep the order of their first entry; the shown name is the own name used most often. */
export function mergeWizardRoster(kind:WizardCandidateKind,entries:readonly WizardRosterEntry[]):(WizardCandidate&{important?:boolean;names:Set<string>})[]{
 const own=new Map<string,number>(),links=new Map<string,number>(),pair=(a:string,b:string)=>a<b?a+'\0'+b:b+'\0'+a
 for(const e of entries){const k=normalizeWizardName(e.name);if(k)own.set(k,(own.get(k)??0)+1)}
 for(const e of entries){const k=normalizeWizardName(e.name);if(!k)continue;for(const a of new Set(e.aliases.map(normalizeWizardName)))if(a&&a!==k&&own.has(a))links.set(pair(k,a),(links.get(pair(k,a))??0)+1)}
 const root=new Map([...own.keys()].map(k=>[k,k])),find=(k:string):string=>{let r=k;while(root.get(r)!==r)r=root.get(r)!;root.set(k,r);return r}
 for(const [key,count] of links){const [a,b]=key.split('\0');if(count*2>=Math.min(own.get(a)!,own.get(b)!)){const x=find(a),y=find(b);if(x!==y)root.set(y,x)}}
 const groups=new Map<string,{names:Set<string>;primaries:Map<string,{display:string;count:number}>;aliases:string[];votes:Map<WizardRoleType,number>;parent?:string;itemType?:string;important:boolean}>()
 for(const e of entries){
  const k=normalizeWizardName(e.name);if(!k)continue
  const id=find(k);let g=groups.get(id);if(!g){g={names:new Set(),primaries:new Map(),aliases:[],votes:new Map(),important:false};groups.set(id,g)}
  // Another group's own name is never an alias here (it was not linked strongly enough).
  for(const n of [e.name,...e.aliases]){const m=normalizeWizardName(n);if(!m||own.has(m)&&find(m)!==id)continue;g.names.add(m);if(!g.aliases.some(a=>normalizeWizardName(a)===m))g.aliases.push(n.trim())}
  const p=g.primaries.get(k);if(p)p.count++;else g.primaries.set(k,{display:e.name.trim(),count:1})
  if(e.roleType)g.votes.set(e.roleType,(g.votes.get(e.roleType)??0)+1)
  g.parent??=e.parent;g.itemType??=e.itemType;g.important||=!!e.important
 }
 return [...groups.values()].map(g=>{
  let best:{display:string;count:number}|undefined;for(const v of g.primaries.values())if(!best||v.count>best.count)best=v
  const display=best!.display,roleType=[...g.votes].sort((a,b)=>b[1]-a[1]||ROLE_PRIORITY.indexOf(a[0])-ROLE_PRIORITY.indexOf(b[0]))[0]?.[0]
  // A candidate stores at most WIZARD_ALIAS_LIMIT aliases; the first-seen ones are kept.
  const aliases=[...new Set(g.aliases.filter(a=>a&&normalizeWizardName(a)!==normalizeWizardName(display)))].slice(0,WIZARD_ALIAS_LIMIT)
  return {id:wizardCandidateId(kind,display),kind,name:display,aliases,names:g.names,...(roleType?{roleType}:{}),...(g.parent?{parentId:g.parent}:{}),...(g.itemType?{itemType:g.itemType}:{}),important:g.important,chapterCount:0,sources:['body'],sourceArtifactIds:[],selected:true}
 })
}
export function wizardChapterCount(entity:{name:string;aliases:readonly string[]},chapters:readonly {content:string}[]){
 const names=[entity.name,...entity.aliases].map(n=>n.trim()).filter(Boolean)
 return chapters.filter(c=>names.some(n=>c.content.includes(n))).length
}
export const WIZARD_IMPORTANT_ITEM_CHAPTERS=3
export function keepWizardItem(item:{important:boolean;chapterCount:number;fromSource:boolean}){return item.fromSource||item.important||item.chapterCount>=WIZARD_IMPORTANT_ITEM_CHAPTERS}

/** World tree: world nodes and their settings/child worlds. Selection is stored on leaves; a world
 * without children is its own leaf. */
const children=(list:readonly WizardCandidate[],id:string)=>list.filter(c=>c.parentId===id&&(c.kind==='world'||c.kind==='world-setting'))
function leaves(list:readonly WizardCandidate[],id:string):WizardCandidate[]{
 const node=list.find(c=>c.id===id);if(!node)return []
 const kids=children(list,id);if(!kids.length)return [node]
 return kids.flatMap(k=>leaves(list,k.id))
}
export function selectWizardWorld(list:readonly WizardCandidate[],id:string,selected:boolean):WizardCandidate[]{
 const ids=new Set(leaves(list,id).map(c=>c.id)),next=list.map(c=>ids.has(c.id)?{...c,selected}:c)
 // Interior world nodes mirror their leaves so the stored flag never disagrees with the tree.
 return next.map(c=>c.kind==='world'&&children(next,c.id).length?{...c,selected:leaves(next,c.id).some(l=>l.selected)}:c)
}
export function wizardWorldState(list:readonly WizardCandidate[],id:string):'checked'|'unchecked'|'mixed'{
 const all=leaves(list,id),on=all.filter(c=>c.selected).length
 return on===0?'unchecked':on===all.length?'checked':'mixed'
}
/** Worlds kept for import: a world is kept when it is a selected leaf or has a selected descendant. */
export function keptWizardWorlds(list:readonly WizardCandidate[]){return list.filter(c=>c.kind==='world'&&leaves(list,c.id).some(l=>l.selected))}

export interface WizardSourceBlock {name:string;text:string;start:number;end:number;depth:number}
/** Copy-only rosters: split a source document on Markdown headings (#–####). Text before the first
 * heading stays with the first block; a document without headings is a single block. */
export function splitWizardSourceBlocks(text:string,fallbackName:string):WizardSourceBlock[]{
 const headings=[...text.matchAll(/^(#{1,4})[\t ]+([^\r\n]+?)[\t ]*$/gmu)].map(m=>({start:m.index!,depth:m[1].length,name:m[2].trim()})).filter(h=>h.name)
 if(!headings.length)return [{name:fallbackName,text,start:0,end:text.length,depth:1}]
 return headings.map((h,i)=>{const start=i===0?0:h.start,end=headings[i+1]?.start??text.length;return {name:h.name.slice(0,300),text:text.slice(start,end),start,end,depth:h.depth}})
}
/** Only text-shaped setting types are produced locally; structured types (levels, powers, factions,
 * concepts, maps) cannot be projected reliably from free text in copy-only mode. */
export function wizardSourceSettingType(title:string):WizardSettingType{
 if(/人文|文化|风俗|习俗|宗教|信仰|民俗/u.test(title))return 'CULTURE'
 if(/地理|地域|地形|疆域/u.test(title))return 'GEOGRAPHY'
 if(/历史|年表|编年/u.test(title))return 'WORLD_HISTORY'
 return 'SOCIETY'
}
export interface WizardSourceWorld {world:WizardSourceBlock&{id:string};settings:(WizardSourceBlock&{id:string;settingType:WizardSettingType})[]}
/** World documents: depth-1 headings are worlds, deeper headings their settings. Without a depth-1
 * heading all blocks belong to one neutral world container. */
export function splitWizardSourceWorlds(text:string,fallbackName:string):WizardSourceWorld[]{
 const blocks=splitWizardSourceBlocks(text,fallbackName),top=Math.min(...blocks.map(b=>b.depth))
 const result:WizardSourceWorld[]=[]
 const hasWorlds=blocks.filter(b=>b.depth===top).length>0&&blocks.some(b=>b.depth>top)
 const neutral=(start:number)=>({name:'世界',text:'',start,end:start,depth:top,id:wizardCandidateId('world','世界',fallbackName)})
 for(const block of blocks){
  if(hasWorlds&&block.depth===top){result.push({world:{...block,id:wizardCandidateId('world',block.name,fallbackName)},settings:[]});continue}
  if(!result.length)result.push({world:neutral(block.start),settings:[]})
  const owner=result.at(-1)!
  owner.settings.push({...block,id:wizardCandidateId('world-setting',owner.world.name+'\0'+block.name,fallbackName),settingType:wizardSourceSettingType(block.name)})
 }
 return result
}
