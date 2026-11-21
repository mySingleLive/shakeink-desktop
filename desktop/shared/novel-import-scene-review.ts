import type {ImportAiRequest} from './novel-import'

/** Only ordinary scene review packets share this optional evidence encoding. */
export function sceneReviewUnitReferenceRequest(request:Pick<ImportAiRequest,'semanticVersion'|'phase'|'selectedTargets'|'conflict'|'intent'>):boolean{
 return request.semanticVersion===1&&request.phase==='review'&&request.selectedTargets?.length===1&&request.selectedTargets[0]==='scene'&&request.conflict===undefined&&request.intent===undefined
}

/** Only the main-process bounded wizard pool emits this internal lane marker. */
export function sceneReviewWaveRequest(request:Pick<ImportAiRequest,'semanticVersion'|'phase'|'selectedTargets'|'conflict'|'intent'|'executionLane'>):boolean{
 return request.executionLane==='scene-review-wave-v1'&&sceneReviewUnitReferenceRequest(request)
}

/** Static feedback only; no source values, IDs or unknown provider keys. */
export const IMPORT_SCENE_REVIEW_UNIT_GUIDANCE='evidence每项仅用{unitIndex}或{unitId,quote}；unitIndex为本包units的0-based有效整数，引用完整text；不能混用、加键或跨包。'

export const IMPORT_SCENE_REVIEW_SOURCE_GUIDANCE='source可用严格{artifactIndex}绑定本包资料的根field完整当前值，或逐字填写原raw值；只用bindableFields中完整提供的字段，不混用或加键。未完整提供时延后完整资料复核，不把错误raw改成当前值。'
