import {createHash} from 'node:crypto'
import {z} from 'zod'
import type {ImportPdfSourceTextDecoding,ImportPdfPageLedger} from '../shared/novel-import'

export const SOURCE_TEXT_POLICY='gbk-euc-h-a1ad-v1' as const
export function sourceTextStable(value:unknown):string{if(Array.isArray(value))return '['+value.map(sourceTextStable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>JSON.stringify(key)+':'+sourceTextStable(v)).join(',')+'}';return JSON.stringify(value)??'null'}
export const sourceTextHash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex')
export const sourceTextObjectHash=(value:unknown)=>sourceTextHash(sourceTextStable(value))
const hex=z.string().regex(/^[0-9a-f]{64}$/u)
export const sourceTextPageProofSchema=z.object({page:z.number().int().min(1).max(5000),resourceClosureHash:hex,beforeUtf8Sha256:hex,afterUtf8Sha256:hex,candidateCount:z.number().int().min(1).max(2048),changedOffsets:z.array(z.number().int().nonnegative().max(25_000_000)).min(1).max(2048),glyphSequenceHash:hex,correspondenceHash:hex}).strict()
export const sourceTextDecodingSchema=z.object({policy:z.literal(SOURCE_TEXT_POLICY),sourceHash:hex,pages:z.array(sourceTextPageProofSchema).min(1).max(128),proofHash:hex}).strict()
export function sourceTextProofHash(proof:Omit<ImportPdfSourceTextDecoding,'proofHash'>|ImportPdfSourceTextDecoding){const {proofHash:_hash,...content}=proof as ImportPdfSourceTextDecoding;return sourceTextObjectHash(content)}
export function validatePdfSourceTextDecoding(value:unknown,sourceHash:string,text:string,pages:ImportPdfPageLedger[]){
 if(Buffer.byteLength(JSON.stringify(value),'utf8')>64*1024)throw Error('PDF源文字证明超过限制')
 const proof=sourceTextDecodingSchema.parse(value)
 if(proof.sourceHash!==sourceHash||proof.proofHash!==sourceTextProofHash(proof)||proof.pages.reduce((n,p)=>n+p.changedOffsets.length,0)>4096)throw Error('PDF源文字证明无效')
 let previous=0
 for(const item of proof.pages){
  if(item.page<=previous)throw Error('PDF源文字证明页序无效');previous=item.page
  const ledger=pages.find(page=>page.page===item.page);if(!ledger||ledger.textState!=='extracted'||ledger.raster==='unknown')throw Error('PDF源文字证明页无效')
  const final=text.slice(ledger.start,ledger.end);if(sourceTextHash(final)!==item.afterUtf8Sha256||item.changedOffsets.length!==item.candidateCount)throw Error('PDF源文字证明摘要不匹配')
  let inverse='',start=0,last=-1
  for(const offset of item.changedOffsets){if(offset<=last||offset>=final.length||final[offset]!=='\u2026')throw Error('PDF源文字证明位置无效');inverse+=final.slice(start,offset)+'\u22ef';start=offset+1;last=offset}
  inverse+=final.slice(start);if(sourceTextHash(inverse)!==item.beforeUtf8Sha256)throw Error('PDF源文字证明逆向摘要不匹配')
 }
 return proof
}
export function sourceTextSummary(proof:ImportPdfSourceTextDecoding){return {policy:proof.policy,pageCount:proof.pages.length,changedCharacters:proof.pages.reduce((n,page)=>n+page.candidateCount,0)}}
