import {z} from 'zod'

export const SCENE_IDENTITY_GUIDANCE='场景身份须保留原文称呼、唯一提及及有据限定；同词不是同一地点。只引用本包真实来源和显式索引，不猜身份或父级，不丢弃提及。'
export const SCENE_IDENTITY_LIMITS={records:50000,members:50000,identities:5000,tasks:20000,relations:20000,references:50000,packetRecords:32,packetTasks:64} as const
const str=(max?:number)=>{const s=z.string().min(1).refine(v=>v.isWellFormed()&&!!v.trim(),SCENE_IDENTITY_GUIDANCE);return max?s.refine(v=>v.length<=max,SCENE_IDENTITY_GUIDANCE):s}
const key=z.string().regex(/^[a-f0-9]{64}$/u),id=z.string().regex(/^s-[a-f0-9]{16}$/u),int=z.number().int().nonnegative().refine(Number.isSafeInteger),name=str(300)
const strict=<T extends z.ZodRawShape>(shape:T)=>z.strictObject(shape,{error:SCENE_IDENTITY_GUIDANCE})
const keys=z.array(key).max(50000),evidence=z.array(strict({unitId:str(512),quote:str()})).max(50000)
export const sceneAnchorSchema=strict({unitId:str(512),quote:str()})
export type Anchor=z.infer<typeof sceneAnchorSchema>
export const sceneMentionSchema=strict({literal:name,evidence:sceneAnchorSchema})
export type Mention=z.infer<typeof sceneMentionSchema>
const relation=z.enum(['same-place','different-place','parent','not-parent'])
export const sceneMentionRecordSchema=strict({name,aliases:z.array(name).max(20),mentions:z.array(sceneMentionSchema).min(1).max(50000),context:z.array(strict({label:name,evidence:evidence.min(1)})).max(50000),links:z.array(strict({targetIndex:int,relation:z.enum(['same-place','different-place','parent']),evidence:evidence.min(1)})).max(20000)})
export type SceneMentionRecord=z.infer<typeof sceneMentionRecordSchema>
export const sceneRosterRecordsSchema=z.array(sceneMentionRecordSchema).max(50000)
export const sceneIdentityDecisionSchema=strict({taskIndex:int,result:z.enum(['same-place','different-place','parent','not-parent','unknown']),evidence})
export type SceneIdentityDecision=z.infer<typeof sceneIdentityDecisionSchema>
export const sceneIdentityDecisionsSchema=z.array(sceneIdentityDecisionSchema).max(64)
export const sourceRangeSchema=strict({unitId:str(512),unitHash:key,start:int,end:int}).refine(v=>v.end>v.start,SCENE_IDENTITY_GUIDANCE)
export type SourceRange=z.infer<typeof sourceRangeSchema>
const bodyMemberSchema=strict({key,origin:z.literal('body'),literal:name,range:sourceRangeSchema,evidenceRange:sourceRangeSchema})
const sourceMemberSchema=strict({key,origin:z.literal('source-block'),artifactId:str(512),blockIndex:int,blockHash:key,sourceName:name,nameOrigin:z.enum(['heading','artifact','filename'])})
export type BodyMember=z.infer<typeof bodyMemberSchema>
export type SourceMember=z.infer<typeof sourceMemberSchema>
export type SceneMember=BodyMember|SourceMember
const member=z.discriminatedUnion('origin',[bodyMemberSchema,sourceMemberSchema])
const context=strict({key,label:name,evidence:z.array(sourceRangeSchema).min(1).max(50000)})
const storedRecord=strict({key,batchKey:key,name,aliases:z.array(name).max(20),memberKeys:keys.min(1),context:z.array(context).max(50000)})
export type StoredRecord=z.infer<typeof storedRecord>
const storedRelation=strict({key,leftKey:key,rightKey:key,relation,evidence:z.array(sourceRangeSchema).min(1).max(50000),basis:z.enum(['model','author']),decisionKey:key.optional()})
export type StoredRelation=z.infer<typeof storedRelation>
export const sceneNamePartSchema=strict({kind:z.enum(['literal','context']),key})
export type NamePart=z.infer<typeof sceneNamePartSchema>
const parent=z.discriminatedUnion('state',[strict({state:z.literal('unknown')}),strict({state:z.literal('known'),id,relationKey:key})])
const state=z.enum(['concrete','source-scoped','unresolved'])
const identity=strict({id,memberKeys:keys.min(1),recordKeys:keys.min(1),state,nameParts:z.array(sceneNamePartSchema).min(1).max(50000),parent})
export type Identity=z.infer<typeof identity>
const taskResult=strict({outcome:z.enum(['same-place','different-place','parent','not-parent','unknown']),evidence:z.array(sourceRangeSchema).max(50000)})
const linkTask=strict({key,type:z.enum(['identity','parent']),leftKey:key,rightKey:key,basisHash:key,result:taskResult.optional()})
export type LinkTask=z.infer<typeof linkTask>
const authorDecision=strict({key,previousLedgerHash:key,revision:int,operation:z.enum(['partition','label','parent','defer']),explanation:str(16000),memberKeys:keys.min(1),before:z.array(identity).max(5000),after:z.array(identity).max(5000)})
export type IdentityDecision=z.infer<typeof authorDecision>
export const sceneIdentityLedgerSchema=strict({version:z.literal(1),sourceScopeHash:key,workingRevision:int,identityRevision:int,ledgerHash:key,members:z.array(member).max(50000),records:z.array(storedRecord).max(50000),relations:z.array(storedRelation).max(20000),identities:z.array(identity).max(5000),linkTasks:z.array(linkTask).max(20000),decisions:z.array(authorDecision).max(20000),ownershipReviewed:keys})
export type SceneIdentityLedger=z.infer<typeof sceneIdentityLedgerSchema>
const labelParent=z.discriminatedUnion('state',[strict({state:z.literal('unknown')}),strict({state:z.literal('known'),id,evidenceKeys:keys.min(1)})])
const changeBase={expectedLedgerHash:key,explanation:str(16000)}
export const sceneIdentityChangeSchema=z.discriminatedUnion('op',[
 strict({...changeBase,op:z.literal('partition'),identityIds:z.array(id).min(1).max(5000),parts:z.array(strict({memberKeys:keys.min(1),state,nameParts:z.array(sceneNamePartSchema).min(1).max(50000),parent:labelParent})).min(1).max(5000)}),
 strict({...changeBase,op:z.literal('label'),identityId:id,nameParts:z.array(sceneNamePartSchema).min(1).max(50000)}),
 strict({...changeBase,op:z.literal('parent'),identityId:id,parentId:id.nullable(),evidenceKeys:keys.min(1)}),
 strict({...changeBase,op:z.literal('defer'),identityId:id}),
])
export type SceneIdentityChange=z.infer<typeof sceneIdentityChangeSchema>
export const sceneIdentityMembershipSchema=strict({identityId:id,memberKeys:keys.min(1),ownedRanges:z.array(sourceRangeSchema).max(50000),contextRanges:z.array(sourceRangeSchema).max(50000)})
export type SceneIdentityMembership=z.infer<typeof sceneIdentityMembershipSchema>
const linkRecord=strict({recordIndex:int,key,members:z.array(member).min(1).max(50000),records:z.array(storedRecord).min(1).max(50000),knownRelations:z.array(storedRelation).max(20000),sourceBlocks:z.array(strict({memberKey:key,ranges:z.array(sourceRangeSchema).min(1).max(50000)})).max(50000).optional()})
const packetTask=strict({taskIndex:int,type:z.enum(['identity','parent']),leftIndex:int,rightIndex:int})
export const sceneIdentityRequestContextSchema=z.discriminatedUnion('mode',[
 strict({version:z.literal(1),mode:z.literal('roster')}),
 strict({version:z.literal(1),mode:z.literal('links'),ledgerHash:key,identityRevision:int,records:z.array(linkRecord).min(1).max(32),tasks:z.array(packetTask).min(1).max(64)}),
 strict({version:z.literal(1),mode:z.literal('ownership'),ledgerHash:key,identityRevision:int,memberships:z.array(sceneIdentityMembershipSchema).max(5000)}),
 strict({version:z.literal(1),mode:z.literal('cleanup'),ledgerHash:key,identityRevision:int,catalog:z.array(strict({index:int,name,aliases:z.array(name).max(50)})).min(1).max(5000),focus:z.array(strict({index:int,unitIds:z.array(str(512)).length(1),ownQuotes:z.array(str()).min(1).max(8)})).min(1).max(5000)}),
])
export type SceneIdentityRequestContext=z.infer<typeof sceneIdentityRequestContextSchema>
export type SceneIdentityLinksContext=Extract<SceneIdentityRequestContext,{mode:'links'}>
export type SceneIdentityCleanupContext=Extract<SceneIdentityRequestContext,{mode:'cleanup'}>
/** One model decision per focus index (486 §3.2/3R): keep, merge into another catalog entry, or drop a non-place. */
export const sceneCleanupDecisionSchema=strict({index:int,action:z.enum(['keep','merge','drop']),target:int.optional(),name:name.optional(),evidence:sceneAnchorSchema.optional()})
export type SceneCleanupDecision=z.infer<typeof sceneCleanupDecisionSchema>
export const sceneCleanupDecisionsSchema=z.array(sceneCleanupDecisionSchema).max(5000)
/** Wizard-private cleanup record (3R2-6, 3R4-1). */
export const sceneCleanupStateSchema=strict({inputHash:key,cleanedHash:key,excluded:z.array(strict({id,evidence:sourceRangeSchema})).max(5000),authorKept:z.array(id).max(5000)}).refine(v=>new Set(v.excluded.map(e=>e.id)).size===v.excluded.length&&new Set(v.authorKept).size===v.authorKept.length,SCENE_IDENTITY_GUIDANCE)
export type SceneCleanupState=z.infer<typeof sceneCleanupStateSchema>
