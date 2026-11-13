/** RB-P01 pure native-row assertions. No publisher, filesystem, model or DB IO.
 * The caller must supply only rows from its receipt-bound novel. This helper
 * also checks that ownership rather than using a snapshot as native evidence.
 */
import {isDeepStrictEqual} from 'node:util'
import {IMPORT_TARGETS,type ImportArtifact,type ImportSession} from '../desktop/shared/novel-import'
import {validateImportSemanticArtifact,stripImportKnowledgeAnnotations,IMPORT_WORLD_SETTING_TYPES,IMPORT_RELIABILITIES,type ImportSemanticArtifact,type ImportNativeProjection,type ImportNarrativeReference,type ImportMappingWarning} from '../desktop/core/novel-import-semantics'
import {validatePlanning} from '../src/lib/planning/domain'
import type {LevelNode} from '../src/components/content/setting-content'

export interface RealNovelSemanticAssertion {name:string;passed:boolean}
interface CharacterRow {id:string;novelId:string;name:string;roleType:string;aliases:unknown;age:string;gender:string;occupation:string;bio:string;personality:string;appearance:string;clothing:string;catchphrase:string;growthArc:string;relationships:unknown;extra:unknown}
interface SceneRow {id:string;novelId:string;name:string;parentId:string|null;coordinates:string;description:string}
interface WorldRow {id:string;novelId:string;name:string;parentId:string|null;description:string}
interface SettingRow {id:string;novelId:string;name:string;type:string;worldId:string|null;parentId:string|null;content:unknown}
export interface RealNovelSemanticRows {
 characters:readonly CharacterRow[];scenes:readonly SceneRow[];worlds:readonly WorldRow[];settings:readonly SettingRow[]
 chapters:readonly {id:string;title:string;content:string}[]
 planning:readonly {novelId:string;data:unknown}[]
}
export interface RealNovelSemanticOptions {
 novelId:string
 /** Explicit actual runtime selection. Never inferred here from origin. */
 sourceCopyIds:readonly string[]
 /** Actual runtime projection set, not proof that a source's omission was
  * semantically justified. Only explicitly warned source-copy materials may
  * be omitted. Raw material/snapshot retention is checked by the caller. */
 projectableIds:readonly string[]
}
type SemanticSession=ImportSession&{semanticVersion?:1;mappingWarnings?:ImportMappingWarning[]}
type Decoded={artifact:ImportArtifact;value:ImportSemanticArtifact}
const equal=isDeepStrictEqual
const absent=(value:unknown)=>value===null||value===undefined
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null
const unique=(values:readonly string[])=>new Set(values).size===values.length
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')
const validRawSource=(artifact:ImportArtifact)=>artifact.origin==='source'&&IMPORT_TARGETS.includes(artifact.kind)&&typeof artifact.id==='string'&&!!artifact.id&&artifact.id.isWellFormed()&&typeof artifact.name==='string'&&!!artifact.name&&artifact.name.isWellFormed()&&typeof artifact.text==='string'&&artifact.text.isWellFormed()&&!!object(artifact.facts)&&Object.values(artifact.facts).every(value=>typeof value==='string'&&value.isWellFormed())&&Array.isArray(artifact.sourceUnitIds)&&artifact.sourceUnitIds.every(id=>typeof id==='string'&&!!id&&id.isWellFormed())&&Array.isArray(artifact.evidence)&&artifact.evidence.every(value=>!!object(value)&&typeof value.unitId==='string'&&!!value.unitId&&value.unitId.isWellFormed()&&typeof value.quote==='string'&&!!value.quote&&value.quote.isWellFormed())

/** Match typed trees using complete native identities and already matched
 * parent IDs. Ambiguous same-parent rows fail instead of guessing an ID. */
function treeMapping<T extends {id:string;name:string;parentId:string|null}>(expected:Decoded[],actual:readonly T[],parentOf:(entry:Decoded)=>string|null,fieldsEqual:(entry:Decoded,row:T)=>boolean){
 const byArtifact=new Map(expected.map(entry=>[entry.artifact.id,entry])),mapped=new Map<string,string>(),used=new Set<string>(),visiting=new Set<string>();let valid=actual.length===expected.length&&unique(actual.map(row=>row.id))
 const visit=(id:string):string|undefined=>{
  if(mapped.has(id))return mapped.get(id)
  const entry=byArtifact.get(id);if(!entry||visiting.has(id)){valid=false;return}
  visiting.add(id);const parent=parentOf(entry),parentRow=parent===null?null:visit(parent)
  if(parent!==null&&!parentRow){valid=false;visiting.delete(id);return}
  const matches=actual.filter(row=>!used.has(row.id)&&row.name===entry.artifact.name&&row.parentId===parentRow&&fieldsEqual(entry,row))
  if(matches.length!==1){valid=false;visiting.delete(id);return}
  const row=matches[0];mapped.set(id,row.id);used.add(row.id);visiting.delete(id);return row.id
 }
 for(const entry of expected)visit(entry.artifact.id)
 return {mapped,valid:valid&&mapped.size===expected.length&&used.size===actual.length}
}

/** Verify stored fragments by removing only the exact required knowledge
 * prefix and comparing their complete concatenation to the source artifact.
 * This checks the persisted protocol; it does not call/reproduce a publisher. */
function qualifiedFragments(text:string,fragments:readonly string[],knowledge:ImportSemanticArtifact['knowledge']){
 void knowledge;const prefix=''/* docs/542: no knowledge prefix */
 if(!fragments.length)return false
 const raw:string[]=[]
 for(const [index,fragment]of fragments.entries()){
  if(typeof fragment!=='string'||!fragment.startsWith(prefix))return false
  const value=fragment.slice(prefix.length)
  if(!value.isWellFormed()||fragment.length>100000||index<fragments.length-1&&value.length<100000-prefix.length-1)return false
  raw.push(value)
 }
 return raw.join('')===text&&(text.length>0?raw.every(value=>value.length>0):raw.length===1)
}

/** Independently describe the approved native consumer fields. Keep identity,
 * enums, topology and raw material untouched; do not call a producer projector.
 * Explicit structured sources retain outside-content knowledge in these same
 * readable fields. Source text/LEVEL fallback remains the original text. */
function expectedSettingContent(entry:Decoded,sourceCopy:boolean){
 const native=entry.value.native as Extract<ImportNativeProjection,{kind:'world';entityType:'SETTING'}>
 if(sourceCopy&&entry.artifact.facts.content===undefined)return native.content
 const content=structuredClone(native.content),qualified=(text:string)=>stripImportKnowledgeAnnotations(text)/* docs/542 */,nonempty=(text:string)=>text.trim().length?qualified(text):text
 if('text' in content)content.text=qualified(content.text)
 else if('concepts' in content)for(const concept of content.concepts)concept.explanation=qualified(concept.explanation)
 else if('factions' in content)for(const faction of content.factions){faction.description=qualified(faction.description);faction.relations=nonempty(faction.relations)}
 else if('scope' in content){
  content.description=qualified(content.description);content.rules=nonempty(content.rules)
  const describe=(level:LevelNode)=>{level.description=nonempty(level.description);level.condition=nonempty(level.condition);for(const ability of level.abilities)ability.description=nonempty(ability.description);level.children.forEach(describe)}
  content.levels.forEach(describe)
  for(const pathway of content.pathways){pathway.description=nonempty(pathway.description);pathway.levels.forEach(describe)}
 }
 return content
}

export function realNovelSemanticAssertions(session:SemanticSession,rows:RealNovelSemanticRows,options:RealNovelSemanticOptions):RealNovelSemanticAssertion[]{
 const assertions:RealNovelSemanticAssertion[]=[],check=(name:string,passed:unknown)=>assertions.push({name,passed:!!passed})
 check('semantic-version-one-native-audit-required',session.semanticVersion===1)
 if(session.semanticVersion!==1)return assertions
 const artifacts=session.artifacts,sourceCopyIds=new Set(options.sourceCopyIds),projectableIds=new Set(options.projectableIds),lookup=new Map(artifacts.map(artifact=>[artifact.id,artifact]))
 check('semantic-artifact-and-source-copy-identities-unique',unique(artifacts.map(a=>a.id))&&unique(options.sourceCopyIds)&&options.sourceCopyIds.length===artifacts.filter(artifact=>artifact.origin==='source').length&&options.sourceCopyIds.every(id=>lookup.get(id)?.origin==='source'))
 check('semantic-projectable-selection-cannot-exempt-derived-artifacts',unique(options.projectableIds)&&options.projectableIds.every(id=>lookup.has(id))&&artifacts.every(artifact=>sourceCopyIds.has(artifact.id)||projectableIds.has(artifact.id)))
 const excludedSources=artifacts.filter(artifact=>sourceCopyIds.has(artifact.id)&&!projectableIds.has(artifact.id)),warned=(id:string)=>!!session.mappingWarnings?.some(warning=>warning.artifactId===id&&Array.isArray(warning.fields)&&warning.fields.length>0&&warning.fields.every(field=>typeof field==='string'&&!!field.trim())&&typeof warning.reason==='string'&&!!warning.reason.trim())
 check('semantic-unmapped-source-exclusions-have-explicit-mapping-warnings',excludedSources.every(artifact=>warned(artifact.id)))
 for(const artifact of excludedSources)check('semantic-unconfirmed-unmapped-source-material-id:'+artifact.id,warned(artifact.id))
 const own=[...rows.characters,...rows.scenes,...rows.worlds,...rows.settings,...rows.planning]
 check('semantic-native-rows-only-own-novel',!!options.novelId&&own.every(row=>row.novelId===options.novelId))
 const decoded:Decoded[]=[],rawOnlyIds=new Set<string>();let contractsValid=true
 for(const artifact of artifacts)try{decoded.push({artifact,value:validateImportSemanticArtifact(artifact,sourceCopyIds.has(artifact.id)?'source-copy':'strict')})}catch{
  // Failed source decoding is never native success. Only the explicitly
  // excluded, warned, structurally intact raw material may remain readable;
  // the caller separately verifies its full snapshot text/facts/evidence.
  const rawOnly=sourceCopyIds.has(artifact.id)&&!projectableIds.has(artifact.id)&&warned(artifact.id)&&validRawSource(artifact)
  if(rawOnly){rawOnlyIds.add(artifact.id);decoded.push({artifact,value:{native:null,knowledge:{},mappingWarnings:[],inferred:false}});check('semantic-unconfirmed-raw-source-material-only-id:'+artifact.id,true)}else contractsValid=false
 }
 check('semantic-projectable-native-contracts-and-explicit-raw-source-fallbacks-valid',contractsValid&&decoded.length===artifacts.length)
 if(!contractsValid)return assertions
 const projected=decoded.filter(entry=>projectableIds.has(entry.artifact.id))
 check('semantic-full-selected-targets-not-satisfied-by-unmapped-source-materials',!session.infer||!session.selected.includes('body')||!session.workingProse||session.targets.every(kind=>projected.some(entry=>entry.artifact.kind===kind)?!session.notFound.includes(kind):!artifacts.some(artifact=>artifact.kind===kind)&&session.notFound.includes(kind)))
 check('semantic-projectable-native-materials-have-decodable-shapes',projected.every(entry=>{if(['character','scene','world'].includes(entry.artifact.kind))return entry.value.native!==null;if(['worldline','narrative'].includes(entry.artifact.kind))try{validateImportSemanticArtifact({...entry.artifact,origin:'confirmed'});return true}catch{return false}return true}))
 check('semantic-source-copy-decoder-mapping-warnings-preserved',decoded.filter(entry=>sourceCopyIds.has(entry.artifact.id)).every(entry=>entry.value.mappingWarnings.every(expected=>session.mappingWarnings?.some(warning=>warning.artifactId===entry.artifact.id&&Array.isArray(warning.fields)&&expected.fields.every(field=>warning.fields.includes(field))&&typeof warning.reason==='string'&&!!warning.reason.trim()))))
 const readableText=(entry:Decoded)=>sourceCopyIds.has(entry.artifact.id)?entry.artifact.text:stripImportKnowledgeAnnotations(entry.artifact.text)
 const characters=projected.filter(entry=>entry.value.native?.kind==='character'),characterMap=new Map<string,string>();let characterIdentity=rows.characters.length===characters.length&&unique(rows.characters.map(row=>row.id))
 for(const entry of characters){const matches=rows.characters.filter(row=>object(row.extra)?.importArtifactId===entry.artifact.id);if(matches.length===1)characterMap.set(entry.artifact.id,matches[0].id);else characterIdentity=false}
 characterIdentity&&=characterMap.size===characters.length&&unique([...characterMap.values()])
 check('semantic-characters-exact-population-and-artifact-ids',characterIdentity)
 let profiles=characterIdentity,relations=characterIdentity
 const profileFields=['roleType','aliases','age','gender','occupation','bio','personality','appearance','clothing','catchphrase','growthArc'] as const
 for(const {artifact,value}of characters){const native=value.native as Extract<ImportNativeProjection,{kind:'character'}>,row=rows.characters.find(row=>row.id===characterMap.get(artifact.id));if(!row){profiles=false;relations=false;continue}
  profiles&&=row.name===artifact.name&&profileFields.every(field=>equal(row[field],field==='bio'?readableText({artifact,value}):native[field]))&&equal(object(row.extra)?.importMapping,native.extra.importMapping)
  const expected=native.relationships.map(relation=>({...relation,...(relation.characterId?{characterId:characterMap.get(relation.characterId)}:{})}))
  relations&&=native.relationships.every(relation=>!relation.characterId||characterMap.has(relation.characterId))&&equal(row.relationships,expected)
 }
 check('semantic-character-all-supported-profile-fields-exact',profiles)
 check('semantic-character-two-pass-relationships-own-actual-ids',relations)
 const scenes=projected.filter(entry=>entry.value.native?.kind==='scene'),sceneTree=treeMapping(scenes,rows.scenes,entry=>(entry.value.native as Extract<ImportNativeProjection,{kind:'scene'}>).parentId,(entry,row)=>{const native=entry.value.native as Extract<ImportNativeProjection,{kind:'scene'}>;return row.description===readableText(entry)&&row.coordinates===native.coordinates})
 check('semantic-scenes-only-place-exact-parent-tree-coordinates-text',sceneTree.valid)
 const worlds=projected.filter(entry=>entry.value.native?.kind==='world'&&entry.value.native.entityType==='WORLD'),worldTree=treeMapping(worlds,rows.worlds,entry=>(entry.value.native as Extract<ImportNativeProjection,{kind:'world';entityType:'WORLD'}>).parentId,(entry,row)=>row.description===readableText(entry))
 check('semantic-worlds-only-world-exact-parent-tree-text',worldTree.valid)
 // Persisted JSON omits undefined optional object fields; retain every real
 // field/value and compare that exact representation, without normalization.
 const settings=projected.filter(entry=>entry.value.native?.kind==='world'&&entry.value.native.entityType==='SETTING'),worldSettingRows=rows.settings.filter(row=>!absent(row.worldId)||IMPORT_WORLD_SETTING_TYPES.includes(row.type as typeof IMPORT_WORLD_SETTING_TYPES[number])),settingTree=treeMapping(settings,worldSettingRows,entry=>(entry.value.native as Extract<ImportNativeProjection,{kind:'world';entityType:'SETTING'}>).parentId,(entry,row)=>{const native=entry.value.native as Extract<ImportNativeProjection,{kind:'world';entityType:'SETTING'}>;return worldTree.mapped.has(native.worldId)&&row.worldId===worldTree.mapped.get(native.worldId)&&row.type===native.settingType&&equal(row.content,JSON.parse(JSON.stringify(expectedSettingContent(entry,sourceCopyIds.has(entry.artifact.id)))))})
 check('semantic-nine-world-setting-content-world-and-map-parent-exact',settingTree.valid)
 check('semantic-map-parent-only-map-in-same-world',settings.every(entry=>{const native=entry.value.native as Extract<ImportNativeProjection,{kind:'world';entityType:'SETTING'}>;if(!native.parentId)return true;const parent=settings.find(value=>value.artifact.id===native.parentId)?.value.native;return native.settingType==='MAP'&&parent?.kind==='world'&&parent.entityType==='SETTING'&&parent.settingType==='MAP'&&parent.worldId===native.worldId}))
 const novelSettingRows=rows.settings.filter(row=>!worldSettingRows.includes(row))
 check('semantic-setting-table-population-has-only-declared-native-settings',novelSettingRows.filter(row=>row.type==='STYLE').length===(projected.some(entry=>entry.artifact.kind==='style')?1:0)&&novelSettingRows.filter(row=>row.type==='GOLD_FINGER').length===projected.filter(entry=>entry.artifact.kind==='goldenFinger').length&&novelSettingRows.every(row=>absent(row.worldId)&&absent(row.parentId)&&['STYLE','GOLD_FINGER'].includes(row.type)))
 check('semantic-unmapped-source-materials-create-no-fake-native-entities',rows.characters.length===characters.length&&rows.scenes.length===scenes.length&&rows.worlds.length===worlds.length&&worldSettingRows.length===settings.length)

 // Read actual persisted fields before the domain parser can supply defaults.
 // Outline/legacy cards are outside this semantic narrative protocol.
 const rawPlanning=object(rows.planning[0]?.data),rawCards=Array.isArray(rawPlanning?.cards)?rawPlanning.cards:[]
 let explicitReliability=true
 for(const {artifact,value}of projected.filter(entry=>entry.artifact.kind==='narrative')){
  const pattern=new RegExp('^'+escape('import-narrative-'+artifact.id+'-')+'\\d+$','u'),cards=rawCards.map(object).filter(card=>typeof card?.id==='string'&&pattern.test(card.id))
  let refs:ImportNarrativeReference[]=[];try{refs=artifact.facts.refs?JSON.parse(artifact.facts.refs):[];if(!Array.isArray(refs))throw Error()}catch{explicitReliability=false}
  explicitReliability&&=cards.length>0
  for(const card of cards){const tellings=Array.isArray(card?.tellings)?card.tellings:[];explicitReliability&&=tellings.length>0
   for(const raw of tellings){const telling=object(raw),actualRefs=Array.isArray(telling?.refs)?telling.refs:[]
    explicitReliability&&=!!telling&&Object.hasOwn(telling,'reliability')&&IMPORT_RELIABILITIES.some(reliability=>reliability===telling.reliability)&&telling.reliability===value.knowledge.reliability&&Object.hasOwn(telling,'refs')&&Array.isArray(telling.refs)&&actualRefs.length===refs.length
    for(const [index,ref]of actualRefs.entries()){const actual=object(ref);explicitReliability&&=!!actual&&Object.hasOwn(actual,'reliability')&&IMPORT_RELIABILITIES.some(reliability=>reliability===actual.reliability)&&actual.reliability===refs[index]?.reliability}
   }
  }
 }
 check('semantic-narrative-persisted-reliability-explicit-and-matched',explicitReliability)
 let planning:ReturnType<typeof validatePlanning>
 try{if(rows.planning.length!==1)throw Error();planning=validatePlanning(rows.planning[0].data);check('semantic-planning-native-document-valid',true)}catch{check('semantic-planning-native-document-valid',false);return assertions}
 check('semantic-narrative-chapter-id-mapping-uses-exact-ordered-session',rows.chapters.length===session.chapters.length&&unique(rows.chapters.map(chapter=>chapter.id))&&rows.chapters.every((chapter,index)=>chapter.title===session.chapters[index].title&&chapter.content===session.chapters[index].content))
 const character=(reference:string|undefined):string|null|undefined=>{
  if(reference===undefined)return null
  if(characterMap.has(reference))return characterMap.get(reference)
  const matches=characters.filter(entry=>entry.artifact.name===reference)
  return matches.length===1?characterMap.get(matches[0].artifact.id):undefined
 }
 // Raw-only IDs never had decoded knowledge. Their explicit generic warning
 // and raw-integrity gate above is separate from missing decoded reliability.
 const unmappedTimelines=decoded.filter(entry=>sourceCopyIds.has(entry.artifact.id)&&['worldline','narrative'].includes(entry.artifact.kind)&&!projectableIds.has(entry.artifact.id)&&!rawOnlyIds.has(entry.artifact.id))
 check('semantic-source-copy-unmapped-timelines-explicitly-warn-reliability',unmappedTimelines.every(entry=>!!entry.value.knowledge.reliability||session.mappingWarnings?.some(warning=>warning.artifactId===entry.artifact.id&&warning.fields.includes('reliability')&&warning.reason.trim())))
 const worldlines=projected.filter(entry=>entry.artifact.kind==='worldline'),narratives=projected.filter(entry=>entry.artifact.kind==='narrative'),seenEvents=new Set<string>(),seenCards=new Set<string>(),eventByArtifact=new Map<string,{id:string;line:string}>()
 for(const {artifact}of worldlines)eventByArtifact.set(artifact.id,{id:'import-event-'+artifact.id,line:'import-world-'+(artifact.facts.lineId||artifact.id)})
 let eventText=true,eventStructure=true
 for(const {artifact,value}of worldlines){const base=eventByArtifact.get(artifact.id)!,pattern=new RegExp('^'+escape(base.id)+'(?:-part-(\\d+))?$','u'),parts=planning.events.filter(event=>pattern.test(event.id)).sort((a,b)=>Number(a.id.match(pattern)?.[1]??0)-Number(b.id.match(pattern)?.[1]??0))
  const names=parts.map(event=>event.id),ordered=names.length>0&&names[0]===base.id&&names.slice(1).every((id,index)=>id===base.id+'-part-'+(index+1))
  eventText&&=ordered&&qualifiedFragments(artifact.text,parts.map(event=>event.fact),value.knowledge)
  let people:unknown[]=[];try{people=artifact.facts.people?JSON.parse(artifact.facts.people):[];if(!Array.isArray(people))throw Error()}catch{eventStructure=false}
  const actualPeople=people.map(person=>typeof person==='string'?character(person):undefined),parent=artifact.facts.parentId?eventByArtifact.get(artifact.facts.parentId):null
  for(const [index,event]of parts.entries()){if(seenEvents.has(event.id))eventStructure=false;seenEvents.add(event.id);const known=index===0&&['exact','window'].includes(artifact.facts.timeKind)
   eventStructure&&=event.line===base.line&&event.parent===(index?base.id:parent?.id??null)&&(!artifact.facts.parentId||!!parent)&&actualPeople.every(id=>!!id)&&equal(event.people,actualPeople)&&event.time.kind===(known?artifact.facts.timeKind:'unknown')&&event.time.value===(known?Number(artifact.facts.timeValue):0)&&event.time.end===(index===0&&artifact.facts.timeKind==='window'?Number(artifact.facts.timeEnd):null)&&event.time.label===(artifact.facts.time??'')
  }
 }
 check('semantic-world-event-facts-retain-full-knowledge-qualified-text',eventText)
 check('semantic-world-event-parent-people-time-own-actual-ids',eventStructure)
 check('semantic-world-event-population-exact-no-fork-facts',seenEvents.size===planning.events.length&&planning.worlds.every(line=>!line.fork))
 const expectedLines=new Map<string,string>();let lineIdentity=true
 for(const {artifact}of worldlines){const id=eventByArtifact.get(artifact.id)!.line,name=artifact.facts.lineName||artifact.name;if(expectedLines.has(id)&&expectedLines.get(id)!==name)lineIdentity=false;expectedLines.set(id,name)}
 check('semantic-worldline-identities-and-population-exact',lineIdentity&&planning.worlds.length===expectedLines.size&&planning.worlds.every(line=>line.name===expectedLines.get(line.id)))
 let narrativeText=true,narrativeStructure=true,references=true
 for(const [artifactIndex,{artifact,value}]of narratives.entries()){
  const prefix='import-narrative-'+artifact.id+'-',pattern=new RegExp('^'+escape(prefix)+'(\\d+)$','u'),cards=planning.cards.filter(card=>pattern.test(card.id)).sort((a,b)=>Number(a.id.slice(prefix.length))-Number(b.id.slice(prefix.length))),chapterIndex=artifact.facts.chapterIndex===undefined?undefined:Number(artifact.facts.chapterIndex),order=artifact.facts.order===undefined?artifactIndex:Number(artifact.facts.order),narrator=character(artifact.facts.narrator)
  narrativeText&&=cards.length>0&&cards.every((card,index)=>card.id===prefix+index&&card.tellings.length===1)&&qualifiedFragments(artifact.text,cards.flatMap(card=>card.tellings.map(telling=>telling.intent)),value.knowledge)
  let refs:ImportNarrativeReference[]=[];try{refs=artifact.facts.refs?JSON.parse(artifact.facts.refs):[];if(!Array.isArray(refs))throw Error()}catch{references=false}
  for(const [part,card]of cards.entries()){if(seenCards.has(card.id))narrativeStructure=false;seenCards.add(card.id)
   narrativeStructure&&=card.line==='import-reading-line'&&card.chapter===(chapterIndex===undefined?null:rows.chapters[chapterIndex]?.id)&&card.order===(chapterIndex??rows.chapters.length)*1000000+order*1000+part&&narrator!==undefined
   for(const telling of card.tellings){narrativeStructure&&=telling.id==='import-narrative-telling-'+artifact.id+'-'+part&&telling.character===narrator&&telling.narrator===(artifact.facts.narrator||'待定')&&telling.reliability===value.knowledge.reliability&&telling.source===(artifact.origin==='source'?'导入原设定':'根据正文分析')
    references&&=telling.refs.length===refs.length
    for(const [index,ref]of refs.entries()){const actual=telling.refs[index],event=eventByArtifact.get(ref.eventId),person=ref.character?characterMap.get(ref.character):null
     references&&=!!actual&&!!event&&(!ref.character||!!person)&&actual.line===event?.line&&actual.event===event?.id&&actual.reliability===ref.reliability&&(absent(actual.character)?null:actual.character)===person&&actual.reveal===telling.intent&&actual.source==='导入语义关系：'+(ref.kind??'happen')/* docs/542 */
    }
   }
  }
 }
 check('semantic-narrative-intents-retain-full-knowledge-qualified-text',narrativeText)
 check('semantic-narrative-character-reliability-chapter-order-exact',narrativeStructure)
 check('semantic-narrative-ref-event-character-reliability-kind-qualified-source',references)
 const outlines=rows.chapters.filter((_chapter,index)=>!!session.chapters[index]?.outline)
 check('semantic-narrative-population-exact-with-only-known-outline-cards',planning.cards.length===seenCards.size+outlines.length&&planning.cards.every(card=>seenCards.has(card.id)||outlines.some(chapter=>card.id==='import-chapter-card-'+chapter.id)))
 return assertions
}
