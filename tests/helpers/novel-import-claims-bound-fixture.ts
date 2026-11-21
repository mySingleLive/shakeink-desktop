import {isDeepStrictEqual} from 'node:util'
import Ajv from 'ajv'
import {createSceneRosterBoundDecisions,sceneRosterKeyedInlineSchema} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {prepareSceneRosterClaimPatch,assertSceneRosterPatchOwners,type SceneRosterPatchProof} from '../../desktop/service/novel-import-scene-roster-claim-patch'
import {createSceneRosterRetention} from '../../desktop/service/novel-import-scene-roster-retention'
import {sceneRosterGenerationSchema,runImportAi} from '../../desktop/service/novel-import-ai'
import type {SceneRosterTargetedPlan} from '../../desktop/service/novel-import-scene-roster-targeted-repair'
import type {Anchor} from '../../desktop/shared/novel-import-scene-identity'
import type {ImportAiRequest,ImportUnit} from '../../desktop/shared/novel-import'
function fail():never{throw Error('TEST_SYNTHETIC_CLAIMS_INVALID')}
const texts=['合成室甲。','合成室乙。','合成室丙。','基室中亮着蓝色灯。','乙室外有蓝色窗。','阅览间位于后院。']
const sourceUnits=(count=6):ImportUnit[]=>{let start=0;return texts.slice(0,count).map((text,i)=>{const unit={id:'claims-synthetic-'+i,fileId:'claims-synthetic-body',kind:'body' as const,start,end:start+text.length,text};start=unit.end;return unit})}
const raw=(i:number,units:ImportUnit[]):Anchor=>({unitId:units[i].id,quote:units[i].text}),bad=(units:ImportUnit[]):Anchor=>({unitId:units[0].id,quote:'SYNTHETIC_UNPROVEN_WINDOW'})
const preferred=(literal:string,evidence:unknown)=>({mentions:[{literal,evidence}],context:[],links:[]})
function request(units:ImportUnit[]):ImportAiRequest{const model={id:'claims-synthetic-model',name:'合成验证模型',modelId:'synthetic',endpoint:'https://synthetic.invalid',contextWindow:1048576,authRevision:1};return{semanticVersion:1,operationId:'claims-synthetic-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:model,review:model},units,artifacts:[],workingRevision:0}}
function restoreRecord(value:any,refs:readonly string[],choices:ReturnType<typeof createSceneRosterRepairChoices>){const resolve=(v:any,use:'mention'|'context'|'link',literal?:string)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==1||!Number.isSafeInteger(v.choice)||v.choice<1||v.choice>refs.length)fail();return choices.resolve(refs[v.choice-1],use,literal)};return{...value,mentions:value.mentions.map((v:any)=>({...v,evidence:resolve(v.evidence,'mention',v.literal)})),context:value.context.map((v:any)=>({...v,evidence:v.evidence.map((e:any)=>resolve(e,'context'))})),links:value.links.map((v:any)=>({...v,evidence:v.evidence.map((e:any)=>resolve(e,'link'))}))}}
function remap(rows:any[],removed:Set<number>){const kept=rows.map((_,slot)=>slot).filter(slot=>!removed.has(slot)),index=new Map(kept.map((slot,i)=>[slot,i]));return kept.map(slot=>({...rows[slot],links:rows[slot].links.map((link:any)=>{const targetIndex=index.get(link.targetIndex);if(targetIndex===undefined)fail();return{...link,targetIndex}})}))}
export function claimsCandidateFixture(){
 const units=sourceUnits(),table=createSceneRosterFragmentTable(units),choices=createSceneRosterRepairChoices(units,table),refs=units.map((_,i)=>choices.addAnchor(raw(i,units),i<3?'合成室':i===3?'基室':i===4?'乙室':'阅览间',i===2||i===3||i===4)),unproven=bad(units)
 const draft:any[]=[preferred('合成室',unproven),{...preferred('合成室',unproven),unknown:'SYNTHETIC_REPLACEMENT'},{primaryMentionIndex:0,...preferred('合成室',unproven)},{name:'合成室',aliases:[],...preferred('合成室',unproven)},preferred('原文无此合成阁',unproven),{mentions:[{literal:'基室',evidence:raw(3,units)},{literal:'阅览间',evidence:unproven},{literal:'原文无此合成阁',evidence:unproven}],context:[{label:'蓝色',evidence:[unproven]}],links:[{targetIndex:6,relation:'different-place',evidence:[unproven]}]}, {name:'合成室',aliases:['乙室'],mentions:[{literal:'合成室',evidence:raw(2,units)},{literal:'乙室',evidence:raw(4,units)}],context:[],links:[]}]
 const retention=createSceneRosterRetention(units);retention.capture(draft,v=>structuredClone(v) as Anchor);const proofs=retention.verifiedRows() as SceneRosterPatchProof[],patches=new Map<number,NonNullable<ReturnType<typeof prepareSceneRosterClaimPatch>>>()
 for(const slot of[0,5]){const p=prepareSceneRosterClaimPatch({draftHash:'synthetic-frozen-draft',slot,rowCount:draft.length,row:draft[slot],proofs,units,choices,resolveAnchor:v=>structuredClone(v) as Anchor});if(!p)fail();patches.set(slot,p)}choices.wholeUnits();if(choices.compactEntries().length!==6)fail()
 const rows:SceneRosterTargetedPlan['rows']=[0,1,2,3,4,5].map(slot=>({repairRef:'rr'+String(slot+1).padStart(16,'0'),slot,canReject:slot===4,requiredSpellings:slot===4?[]:draft[slot].mentions.map((v:any)=>v.literal),candidates:draft[slot].mentions.map((v:any)=>({literal:v.literal,choiceRefs:choices.forLiteral(v.literal)})),keep:{mentions:proofs[slot].mentions.map(v=>({literal:v.literal,choiceRef:choices.addAnchor(v.evidence,v.literal,true)})),context:[],links:[]},...(patches.has(slot)?{patch:{claims:patches.get(slot)!.displayClaims()}}:{})})),plan={rows,choices:choices.compactEntries()}
 let deck=createSceneRosterBoundDecisions({plan,draft,groups:slot=>patches.get(slot)?.boundGroups()});deck=deck.advance(5);deck.activate()
 const first={mentions:[{literal:'合成室',evidence:{choice:1}}],context:[],links:[]},validWitness={answers:{'1':1,'2':first,'3':{primaryMentionIndex:0,...first},'4':{name:'合成室',aliases:[],...first},'5':0,'6':{claimChoices:{'1':[6],'2':[],'3':[4,5],'4':[4,5]}}}}
 return{units,choices,refs,draft,retention,proofs,patches,plan,deck,validWitness,request:request(units)}
}

export async function applyClaimsCandidate(value:unknown){
 const f=claimsCandidateFixture(),checks={schema:false,numericDecode:false,patchApply:false,source:false,owner:false,retention:false,witness:isDeepStrictEqual(value,f.validWitness)}
 checks.schema=!!new Ajv({strict:false}).compile(sceneRosterKeyedInlineSchema(f.deck.data.tasks,f.plan.choices.length))(value)
 if(!checks.schema)return checks
 try{
  const repairs=f.deck.decodeRoot(value,v=>structuredClone(v));checks.numericDecode=true
  const byRef=new Map(f.plan.rows.map(r=>[r.repairRef,r.slot])),rows=structuredClone(f.draft),removed=new Set<number>(),replacements=new Set<number>()
  for(const r of repairs){const slot=byRef.get(r.repairRef);if(slot===undefined)fail();if(r.disposition==='reject')removed.add(slot);else if(r.disposition==='patch'){const p=f.patches.get(slot);if(!p)fail();rows[slot]=p.apply(r.patch.claims)}else{rows[slot]=r.replacement;replacements.add(slot)}}checks.patchApply=true
  for(const slot of replacements)rows[slot]=restoreRecord(rows[slot],f.refs,f.choices)
  const rawRows=remap(rows,removed),canonical=sceneRosterGenerationSchema(f.request).parse({roster:rawRows});checks.source=true
  assertSceneRosterPatchOwners(rawRows,f.proofs,f.units,v=>structuredClone(v) as Anchor);checks.owner=true
  checks.retention=f.retention.accepts(canonical.sceneRosterRecords!)
  if(checks.retention){checks.source=false;await runImportAi(f.request,new AbortController().signal,{resolve:async role=>f.request.models[role]!,assert:async()=>{},generate:async()=>structuredClone(canonical)});checks.source=true}
 }catch{/* Gate booleans are sufficient for these all-synthetic negative controls. */}
 return checks
}
