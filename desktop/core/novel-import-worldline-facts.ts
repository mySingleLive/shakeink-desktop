import {EVENT_CATEGORIES} from '../../src/lib/planning/domain'

/** docs/580 §3: the worldline fact values for an event's type and importance. Facts are strings in the import model. */
export const WORLDLINE_CATEGORY_VALUES:readonly string[]=EVENT_CATEGORIES
export const WORLDLINE_IMPORTANCE_VALUES=['1','2','3'] as const

/** Shape fix for `category` and `importance` in one reply artifact's facts (pure; the input is not changed).
 * Trims both, turns a numeric importance into its string, and drops values outside the allowed sets, returning how
 * many were dropped. Used by both reply paths (wizard lines and plain semantic import) before strict validation. */
/** docs/580 §3: publish reads the fact strings; anything invalid becomes the default, never an error. */
export function worldlineGradeFromFacts(facts:Record<string,string|undefined>):{category:(typeof EVENT_CATEGORIES)[number];importance:1|2|3}{
 const c=facts.category?.trim(),i=facts.importance?.trim()
 return {category:c&&WORLDLINE_CATEGORY_VALUES.includes(c)?c as (typeof EVENT_CATEGORIES)[number]:'其他',importance:i==='2'?2:i==='3'?3:1}
}
export function normalizeWorldlineGrade(facts:Record<string,unknown>):{facts:Record<string,unknown>;dropped:number}{
 const out={...facts};let dropped=0
 if(out.category!==undefined){
  const v=typeof out.category==='string'?out.category.trim():undefined
  if(v!==undefined&&WORLDLINE_CATEGORY_VALUES.includes(v))out.category=v;else{delete out.category;dropped++}
 }
 if(out.importance!==undefined){
  const raw=out.importance,v=typeof raw==='number'?String(raw):typeof raw==='string'?raw.trim():undefined
  if(v!==undefined&&(WORLDLINE_IMPORTANCE_VALUES as readonly string[]).includes(v))out.importance=v;else{delete out.importance;dropped++}
 }
 return {facts:out,dropped}
}
