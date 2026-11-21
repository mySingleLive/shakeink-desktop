import type {PdfDiagnosticCode} from '../shared/novel-import'

/** Closed codes only; never retain a PDF-provided string, object or getter. */
export class PdfDiagnostics {
 private current:number|null=null
 private perPage=new Map<number,Map<PdfDiagnosticCode,number>>()
 private document=new Map<PdfDiagnosticCode,number>()
 private counts=new Map<number,number>()
 private total=0
 private sealed=false
 private resourceDetails=new Set<string>()
 constructor(private lateBlocked?:()=>void){}
 page(page:number|null){this.current=page}
 get documentBlocked(){return this.document.size>0}
 record(value:unknown){
  if(this.sealed)this.lateBlocked?.()
  const target=this.current===null||this.sealed?this.document:(this.perPage.get(this.current)??this.perPage.set(this.current,new Map()).get(this.current)!)
  const count=this.current===null?0:(this.counts.get(this.current)??0)+1
  if(this.current!==null)this.counts.set(this.current,count)
  this.total++
  let code:PdfDiagnosticCode='PDF_DIAGNOSTIC_UNCLASSIFIED'
  if(this.total>512||count>128)code='PDF_DIAGNOSTIC_OVERFLOW'
  else if(typeof value==='string'&&value.length<=512){
   if(/^Warning: Image dimensions are missing, or not numbers\.$/u.test(value))code='PDF_IMAGE_DIMENSIONS_INVALID'
   else if(/(?:Unable to decode image|image.*decod|JPEG.*(?:error|invalid|truncat)|JPX.*(?:error|invalid)|Jbig2|CCITT|image.*null)/iu.test(value))code='PDF_IMAGE_DECODE_FAILED'
   else if(/(?:Image.*(?:removed|dropped|exceeded)|image.*mask|Dependent image isn't ready|Ignoring.*image)/iu.test(value))code='PDF_IMAGE_DROPPED'
   else if(/^Warning: Cannot load system font: [^\r\n]{1,160}, installing it could help to improve PDF rendering\.$/u.test(value)||/^Warning: Cannot substitute the font because of its name: [^\r\n]{1,160}$/u.test(value))code='PDF_BUNDLED_FONT_FALLBACK'
   else if(/(?:font|CMap|cmap|wasm|glyph|DOMMatrix|Path2D|canvas)/iu.test(value)){code='PDF_REQUIRED_RESOURCE_FAILED';this.resourceDetails.add(/^Warning: FontFamily /u.test(value)?'font-family':/^Warning: Cannot substitute the font because of its name:/u.test(value)?'font-family-substitution':/^Warning: (?:Failed to compile|Failed to parse|Font file is empty)/u.test(value)?'embedded-font':/^Warning: (?:loadFont|translateFont|Error during font loading)/u.test(value)?'font-loading':/cmap/iu.test(value)?'cmap':/glyph/iu.test(value)?'glyph':/wasm/iu.test(value)?'wasm':'other-resource')}
  }
  target.set(code,Math.min(513,(target.get(code)??0)+1))
 }
 add(code:PdfDiagnosticCode,page=this.current){const current=this.current;this.current=page;const target=page===null?this.document:(this.perPage.get(page)??this.perPage.set(page,new Map()).get(page)!);target.set(code,1);this.current=current}
 codes(page:number):PdfDiagnosticCode[]{return [...(this.perPage.get(page)?.keys()??[])]}
 documentCodes():PdfDiagnosticCode[]{return [...this.document.keys()]}
 allCodes():PdfDiagnosticCode[]{return [...new Set([...this.document.keys(),...[...this.perPage.values()].flatMap(values=>[...values.keys()])])]}
 details(){return [...this.resourceDetails]}
 blocked(page:number,allowFallback=false){return this.codes(page).some(code=>code!=='PDF_BUNDLED_FONT_FALLBACK'||!allowFallback)}
 seal(){this.sealed=true;this.current=null}
 install(){for(const name of ['warn','error','info','log','debug'] as const)console[name]=(...args:unknown[])=>this.record(args[0])}
}
