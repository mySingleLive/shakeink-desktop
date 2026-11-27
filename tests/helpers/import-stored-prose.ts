import {formatImportChapterProse} from '../../desktop/core/novel-import-prose'
import type {ImportSession} from '../../desktop/shared/novel-import'
/** docs/610: the body a publication stores for each session chapter (headings removed, blank-line paragraphs). */
export const storedChapterProse=(s:Pick<ImportSession,'chapters'>)=>s.chapters.map(c=>formatImportChapterProse(c.content,{title:c.title,...(c.volume!==undefined?{volume:c.volume}:{})}).text)
