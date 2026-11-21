import type {ImportAiResult,ImportArtifact,ImportSceneIdentityDetail,ImportSceneIdentitySource,ImportUnit} from '../shared/novel-import'
import type {SceneIdentityLedger,SceneIdentityMembership,SourceRange} from '../shared/novel-import-scene-identity'
import {sceneSourceBlockOwnedUnits,sceneIdentityMaterialUnits,validateSceneRosterRecords,type SceneIdentitySources} from '../core/novel-import-scene-identity'
import type {WizardCandidate} from '../shared/novel-import-wizard'
import {safeImportBoundary,importHash} from '../core/novel-import'
import {importSemanticSourceFacts} from '../core/novel-import-semantic-state'

const failure=()=>Error('场景身份或来源已变化，请重新打开详情')
const boundary=(text:string,at:number)=>safeImportBoundary(text,at)&&!(at>0&&at<text.length&&text[at-1]==='\r'&&text[at]==='\n')
export function assertSceneRosterCanonical(result:ImportAiResult,units:readonly ImportUnit[]){
 const exact=(value:unknown,keys:string[])=>!!value&&typeof value==='object'&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))
 if(!exact(result,['roster','sceneRosterRecords'])||!Array.isArray(result.roster)||!Array.isArray(result.sceneRosterRecords)||result.roster.length!==result.sceneRosterRecords.length)throw Error('模型返回的场景清单与完整提及资料不一致，请重新识别')
 validateSceneRosterRecords(result.sceneRosterRecords,units)
 const order=new Map(units.map((u,i)=>[u.id,i])),expected=result.sceneRosterRecords.map(record=>{const mentions=[...record.mentions].sort((a,b)=>(order.get(a.evidence.unitId)!-order.get(b.evidence.unitId)!)||(units[order.get(a.evidence.unitId)!].text.indexOf(a.evidence.quote)+a.evidence.quote.indexOf(a.literal))-(units[order.get(b.evidence.unitId)!].text.indexOf(b.evidence.quote)+b.evidence.quote.indexOf(b.literal)));return {name:record.name,aliases:[...record.aliases],evidence:{...mentions[0].evidence}}})
 if(result.roster.some(entry=>!exact(entry,['name','aliases','evidence'])||!exact(entry.evidence,['unitId','quote']))||importHash(result.roster)!==importHash(expected))throw Error('模型返回的场景清单与完整提及资料不一致，请重新识别')
}
/** Projections of an admitted private ledger. Full source text travels only in the paged source reply. */
export function sceneIdentityDetail(ledger:SceneIdentityLedger,candidates:readonly WizardCandidate[],identityId:string,cursor:number,limit:number):ImportSceneIdentityDetail{
 const identity=ledger.identities.find(v=>v.id===identityId),candidate=candidates.find(v=>v.id===identityId)
 if(!identity||!candidate||cursor>identity.memberKeys.length||limit<1||limit>50)throw failure()
 const keys=identity.memberKeys.slice(cursor,cursor+limit),allMembers=new Map(ledger.members.map(v=>[v.key,v])),records=ledger.records.filter(v=>v.memberKeys.some(key=>keys.includes(key)))
 const contexts=[...new Map(records.flatMap(v=>v.context).map(v=>[v.key,{key:v.key,label:v.label}])).values()]
 const members=keys.map(key=>{const m=allMembers.get(key);if(!m)throw failure();const contextKeys=[...new Set(records.filter(r=>r.memberKeys.includes(key)).flatMap(r=>r.context.map(c=>c.key)))];return m.origin==='body'?{key,origin:m.origin,literal:m.literal,unitId:m.range.unitId,range:{start:m.range.start,end:m.range.end},contextKeys}:{key,origin:m.origin,sourceName:m.sourceName,blockIndex:m.blockIndex,contextKeys}})
 const pageKeys=new Set(keys),memberIdentity=new Map(ledger.identities.flatMap(i=>i.memberKeys.map(key=>[key,i.id] as const))),names=new Map(candidates.map(c=>[c.id,c.name])),relevant=ledger.relations.filter(v=>pageKeys.has(v.leftKey)||pageKeys.has(v.rightKey)),relations=relevant.slice(0,32).map(v=>{const peerKey=pageKeys.has(v.leftKey)?v.rightKey:v.leftKey,peer=allMembers.get(peerKey),peerName=names.get(memberIdentity.get(peerKey)??'')??(peer?.origin==='body'?peer.literal:peer?.sourceName)??'相关地点';return {key:v.key,relation:v.relation,label:({parent:'上级关系依据', 'not-parent':'非上级关系依据','same-place':'同地点依据','different-place':'不同地点依据'} as const)[v.relation]+'：'+peerName,evidenceKeys:[v.key]}})
 const parentId=identity.parent.state==='known'?identity.parent.id:undefined,parent=parentId?{state:'known' as const,id:parentId,name:candidates.find(c=>c.id===parentId)?.name??'已有地点'}:{state:'unknown' as const}
 const detail:ImportSceneIdentityDetail={ledgerHash:ledger.ledgerHash,identityRevision:ledger.identityRevision,identityId,state:identity.state,name:candidate.name,parent,totalMembers:identity.memberKeys.length,members,...(cursor+members.length<identity.memberKeys.length?{nextCursor:cursor+members.length}:{}),nameParts:structuredClone(identity.nameParts),namePartOptions:[...members.map(v=>({kind:'literal' as const,key:v.key,label:v.literal??v.sourceName!})),...contexts.map(v=>({kind:'context' as const,key:v.key,label:v.label}))],contexts,relations,relationTotal:relevant.length}
 if(JSON.stringify(detail).length>32768){if(members.length>1)return sceneIdentityDetail(ledger,candidates,identityId,cursor,Math.max(1,Math.floor(limit/2)));throw Error('场景详情超过单页容量，请保留资料并核对该提及的限定')}
 return detail
}

export function sceneIdentitySource(ledger:SceneIdentityLedger,sources:SceneIdentitySources,memberKey:string,neighbor:-1|0|1,offset:number,limit:number):ImportSceneIdentitySource{
 const member=ledger.members.find(v=>v.key===memberKey);if(!member||limit<1||limit>32768||offset<0)throw failure()
 let text:string,unitId:string|undefined
 if(member.origin==='body'){
  const at=sources.workingUnits.findIndex(v=>v.id===member.range.unitId),unit=sources.workingUnits[at+neighbor]
  if(at<0||!unit)throw failure();text=unit.text;unitId=unit.id
 }else{
  if(neighbor!==0)throw failure()
  const block=sources.sourceBlocks.find(v=>v.artifactId===member.artifactId&&v.blockIndex===member.blockIndex);if(!block)throw failure();text=block.text
 }
 if(offset>text.length)throw failure();if(!boundary(text,offset))offset--
 let end=Math.min(text.length,offset+limit);if(!boundary(text,end))end--
 if(end<=offset&&offset<text.length)throw Error('原文分页大小无法容纳完整字符，请增大每页字数')
 return {ledgerHash:ledger.ledgerHash,memberKey,neighbor,...(unitId?{unitId}:{}),offset,total:text.length,text:text.slice(offset,end),...(end<text.length?{nextOffset:end}:{})}
}

export function sceneOwnedUnits(ledger:SceneIdentityLedger,sources:SceneIdentitySources,identityId:string):ImportUnit[]{
 const identity=ledger.identities.find(v=>v.id===identityId);if(!identity)throw failure()
 const members=new Map(ledger.members.map(v=>[v.key,v])),unitIds=new Set<string>(),sourceUnits:ImportUnit[]=[],contextIds=new Set(ledger.records.filter(r=>identity.recordKeys.includes(r.key)).flatMap(r=>r.context.flatMap(c=>c.evidence.map(e=>e.unitId))))
 for(const key of identity.memberKeys){const m=members.get(key);if(!m)throw failure();if(m.origin==='body')unitIds.add(m.range.unitId);else{const block=sources.sourceBlocks.find(v=>v.artifactId===m.artifactId&&v.blockIndex===m.blockIndex);if(!block)throw failure();sourceUnits.push(...sceneSourceBlockOwnedUnits(block))}}
 return sceneIdentityMaterialUnits([...sources.workingUnits.filter(v=>unitIds.has(v.id)),...sourceUnits,...sources.workingUnits.filter(v=>contextIds.has(v.id)&&!unitIds.has(v.id))],sources)
}

/** Options encode already admitted owned ranges; context ranges cannot become target citations. */
export function sceneOwnedEvidenceOptions(memberships:readonly SceneIdentityMembership[],units:readonly ImportUnit[],identityId:string,names:readonly string[]=[]){
 const own=memberships.find(v=>v.identityId===identityId);if(!own)return []
 const options=own.ownedRanges.flatMap(range=>{
  const unit=units.find(v=>v.id===range.unitId);if(!unit||range.start<0||range.end>unit.text.length||range.end<=range.start)return []
  const candidate=(at:number)=>{let start=Math.max(range.start,at);while(start<range.end&&!boundary(unit.text,start))start++;let end=Math.min(range.end,start+512);while(end>start&&!boundary(unit.text,end))end--;const quote=unit.text.slice(start,end);return quote.trim()&&quote.isWellFormed()&&unit.text.indexOf(quote)===start&&unit.text.indexOf(quote,start+1)<0?{unitId:unit.id,quote}:undefined}
  const starts=new Set<number>([...names.flatMap(name=>{const at=name?unit.text.indexOf(name,range.start):-1;return at>=range.start&&at+name.length<=range.end?[Math.max(range.start,Math.min(at-64,range.end-512))]:[]}),range.start,Math.max(range.start,range.end-512)])
  for(const start of starts){const option=candidate(start);if(option)return [option]}
  for(let i=1;i<16;i++){const start=range.start+Math.floor((range.end-range.start)*i/16),option=candidate(start);if(option)return [option]}
  // No unique short encoding exists. Full units and ownership remain intact;
  // the ordinary raw quotation protocol remains available to generation.
  return []
 }).filter((v,i,all)=>all.findIndex(x=>x.unitId===v.unitId&&x.quote===v.quote)===i)
 return options.length<=8?options:Array.from({length:8},(_,i)=>options[Math.round(i*(options.length-1)/7)])
}

/** Source blocks keep their own original values even when another block has the same heading. */
export function sceneSourceCopy(ledger:SceneIdentityLedger,sources:SceneIdentitySources,candidate:WizardCandidate,artifacts:readonly ImportArtifact[]):ImportArtifact{
 const identity=ledger.identities.find(v=>v.id===candidate.id),members=identity?ledger.members.filter(v=>identity.memberKeys.includes(v.key)&&v.origin==='source-block'):[]
 if(!members.length)throw Error('场景资料来源缺失，请先确认具体地点')
 const pieces=members.map(member=>{if(member.origin!=='source-block')throw failure();const block=sources.sourceBlocks.find(v=>v.artifactId===member.artifactId&&v.blockIndex===member.blockIndex),original=artifacts.find(v=>v.id===member.artifactId);if(!block||!original)throw failure();return {block,original,facts:block.text===original.text?original.facts:importSemanticSourceFacts(block.text,'scene'),owned:sceneSourceBlockOwnedUnits(block)}}),facts:Record<string,string>={}
 for(const piece of pieces)for(const [key,value]of Object.entries(piece.facts)){const prior=facts[key];if(prior&&value&&prior!==value)throw Error('请核对同一地点的原资料字段差异，或保留为不同场景');if(prior===undefined||!prior)facts[key]=value}
 const owned=pieces.flatMap(v=>v.owned),evidence=owned.filter(v=>!!v.text.trim()).map(v=>({unitId:v.id,quote:v.text})).filter((v,i,all)=>all.findIndex(other=>other.unitId===v.unitId&&other.quote===v.quote)===i)
 return {...structuredClone(pieces[0].original),id:candidate.id,name:candidate.name,text:pieces.map(v=>v.block.text).join('\n\n'),facts:{...facts,entityType:'PLACE',...(candidate.parentId?{parentId:candidate.parentId}:{})},evidence,sourceUnitIds:[...new Set(owned.map(v=>v.id))]}
}

export function sceneRangeIntersections(ranges:readonly SourceRange[],units:readonly ImportUnit[]){return ranges.filter(r=>units.some(u=>u.id===r.unitId))}
