import {mergeWizardRoster,wizardCandidateId,wizardChapterCount,keepWizardItem,normalizeWizardName,splitWizardSourceBlocks,splitWizardSourceWorlds,type WizardCandidate,type WizardRosterEntry,type WizardSettingType} from './novel-import-wizard'
import type {ImportArtifact} from '../shared/novel-import'

export type WizardRosterKind='character'|'scene'|'item'|'world'
export interface WizardRosterStashEntry extends WizardRosterEntry {unitId?:string;settings?:{settingType:WizardSettingType;name:string}[]}
export type WizardRosterStash=Partial<Record<WizardRosterKind,WizardRosterStashEntry[]>>

/** Turn merged model rosters and copied source blocks into the author's checklist. Source entries
 * are always kept; body items need importance; worlds expand into setting leaves. */
/** A category heading such as “# 场景” with nothing under it names a group, not an entry. */
const headingOnly=(text:string)=>!text.replace(/^#{1,4}[\t ]+[^\r\n]*$/gmu,'').trim()
export function buildWizardCandidates(kind:WizardRosterKind,entries:readonly WizardRosterStashEntry[],sources:readonly ImportArtifact[],chapters:readonly {content:string}[]):WizardCandidate[]{
 if(kind==='world')return buildWorlds(entries,sources,chapters)
 const sourceEntries=sources.flatMap(a=>(kind==='character'?[{name:a.name,text:a.text}]:splitWizardSourceBlocks(a.text,a.name).filter(b=>!headingOnly(b.text))).map(b=>({name:b.name,artifactId:a.id,roleType:a.facts.roleType as WizardRosterEntry['roleType']})))
 const merged=mergeWizardRoster(kind,[...entries,...sourceEntries.map(e=>({name:e.name,aliases:[],...(e.roleType?{roleType:e.roleType}:{})}))])
 const result:WizardCandidate[]=[]
 for(const c of merged){
  // Match on every merged name, not the capped alias list, so sources and evidence are never lost.
  const keys=c.names,hits=sourceEntries.filter(e=>keys.has(normalizeWizardName(e.name)))
  const fromBody=entries.some(e=>[e.name,...e.aliases].some(n=>keys.has(normalizeWizardName(n))))
  const chapterCount=wizardChapterCount({name:c.name,aliases:[...new Set([c.name,...c.aliases,...entries.flatMap(e=>[e.name,...e.aliases]),...hits.map(h=>h.name)].filter(n=>keys.has(normalizeWizardName(n))))]},chapters)
  if(kind==='item'&&!keepWizardItem({important:!!c.important,chapterCount,fromSource:hits.length>0}))continue
  const {important:_important,names:_names,...rest}=c,evidenceUnitIds=[...new Set(entries.filter(e=>[e.name,...e.aliases].some(n=>keys.has(normalizeWizardName(n)))).flatMap(e=>e.unitId?[e.unitId]:[]))].slice(0,200)
  result.push({...rest,...(evidenceUnitIds.length?{evidenceUnitIds}:{}),chapterCount,sources:[...(hits.length?['source' as const]:[]),...(fromBody?['body' as const]:[])],sourceArtifactIds:[...new Set(hits.map(h=>h.artifactId))]})
 }
 // Scene parents are stored as candidate ids; unknown parents become top-level places.
 if(kind==='scene'){const byName=new Map(result.flatMap(c=>[c.name,...c.aliases].map(n=>[normalizeWizardName(n),c.id] as const)));for(const c of result){const parent=c.parentId?byName.get(normalizeWizardName(c.parentId)):undefined;if(parent&&parent!==c.id)c.parentId=parent;else delete c.parentId}}
 return result.sort((a,b)=>Number(b.sources.includes('source'))-Number(a.sources.includes('source'))||b.chapterCount-a.chapterCount)
}
function buildWorlds(entries:readonly WizardRosterStashEntry[],sources:readonly ImportArtifact[],chapters:readonly {content:string}[]):WizardCandidate[]{
 const worlds=new Map<string,WizardCandidate>(),settings=new Map<string,WizardCandidate>()
 const base=(sources:('source'|'body')[])=>({aliases:[],chapterCount:0,sources,sourceArtifactIds:[] as string[],selected:true})
 const world=(name:string,from:'source'|'body',parent?:string)=>{const key=normalizeWizardName(name);let w=worlds.get(key);if(!w){w={...base([from]),id:wizardCandidateId('world',name),kind:'world',name};worlds.set(key,w)}else if(!w.sources.includes(from))w.sources.push(from);if(parent&&!w.parentId)w.parentId=parent;return w}
 const setting=(owner:WizardCandidate,name:string,settingType:WizardSettingType,from:'source'|'body',artifactId?:string)=>{const key=owner.id+'\0'+normalizeWizardName(name);let c=settings.get(key);if(!c){c={...base([from]),id:wizardCandidateId('world-setting',owner.name+'\0'+name),kind:'world-setting',name,parentId:owner.id,settingType};settings.set(key,c)}else if(!c.sources.includes(from))c.sources.push(from);if(artifactId&&!c.sourceArtifactIds.includes(artifactId))c.sourceArtifactIds.push(artifactId);return c}
 for(const a of sources)for(const w of splitWizardSourceWorlds(a.text,a.name)){const owner=world(w.world.name,'source');if(!owner.sourceArtifactIds.includes(a.id))owner.sourceArtifactIds.push(a.id);for(const s of w.settings)setting(owner,s.name,s.settingType,'source',a.id)}
 const cite=(c:WizardCandidate,unitId?:string)=>{if(unitId&&!(c.evidenceUnitIds??=[]).includes(unitId)&&c.evidenceUnitIds.length<200)c.evidenceUnitIds.push(unitId)}
 for(const e of entries){const owner=world(e.name,'body',e.parent);cite(owner,e.unitId);for(const s of e.settings??[])cite(setting(owner,s.name,s.settingType,'body'),e.unitId)}
 for(const w of worlds.values()){if(w.parentId){const parent=worlds.get(normalizeWizardName(w.parentId));if(parent&&parent.id!==w.id)w.parentId=parent.id;else delete w.parentId}w.chapterCount=wizardChapterCount(w,chapters)}
 for(const s of settings.values())s.chapterCount=wizardChapterCount(s,chapters)
 return [...worlds.values(),...settings.values()]
}
