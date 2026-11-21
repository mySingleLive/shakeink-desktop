import {PDFDocument,PDFDict,PDFArray,PDFRef,PDFName,PDFNull,PDFRawStream,ParseSpeeds,type PDFObject} from 'pdf-lib'
import {sourceTextHash,sourceTextObjectHash} from '../core/novel-import-pdf-source-text'
import type {ImportPdfSourceTextPageProof} from '../shared/novel-import'

export const SOURCE_TEXT_LIMITS=Object.freeze({bytes:8*1024*1024,names:100000,nameBytes:128,objects:20000,pages:5000,pageDepth:32,resourceDepth:16,resourceItems:256,fonts:4096,pageGlyphs:100000,totalGlyphs:2000000,candidatePages:128,pageChanges:2048,totalChanges:4096,proofBytes:64*1024})
type Status='eligible'|'ineligible'|'incomplete'|'budget'
export interface PdfSourceResource {status:Status;resourceClosureHash:string}
export interface PdfSourcePreparation {status:'closed'|'incomplete'|'budget';pages:PdfSourceResource[];lookups:number}
const yieldTurn=()=>new Promise<void>(resolve=>setImmediate(resolve))
const whitespace=(byte:number)=>byte===0||byte===9||byte===10||byte===12||byte===13||byte===32
const delimiter=(byte:number)=>whitespace(byte)||[40,41,60,62,91,93,123,125,47,37].includes(byte)
const hex=(byte:number)=>byte>=48&&byte<=57?byte-48:byte>=65&&byte<=70?byte-55:byte>=97&&byte<=102?byte-87:-1
/** Conservative whole-byte lexical gate. It never decodes any stream. */
export async function preflightPdfSourceText(bytes:Uint8Array):Promise<{status:'closed'|'incomplete'|'budget';names:number;objects:number}>{
 let names=0,objects=0,nextYield=65536
 if(bytes.byteLength>SOURCE_TEXT_LIMITS.bytes)return {status:'budget',names,objects}
 // The locked parser accepts `0objnull` without either keyword boundary.
 // Count every raw occurrence, even in names/streams/endobj, before loading.
 const objectBudgetExceeded=(offset:number)=>bytes[offset]===111&&bytes[offset+1]===98&&bytes[offset+2]===106&&++objects>SOURCE_TEXT_LIMITS.objects
 for(let i=0;i<bytes.length;i++){
  if(i>=nextYield){await yieldTurn();nextYield=i+65536}
  if(objectBudgetExceeded(i))return {status:'budget',names,objects}
  if(bytes[i]===47){
   if(++names>SOURCE_TEXT_LIMITS.names)return {status:'budget',names,objects}
   let name='',length=0,possible=true
   while(i+1<bytes.length&&!delimiter(bytes[i+1])){
    if(i>=nextYield){await yieldTurn();nextYield=i+65536}
    let byte=bytes[++i]
    if(objectBudgetExceeded(i))return {status:'budget',names,objects}
    // The two skipped valid hex digits cannot contain a raw 'o' start.
    if(byte===35){if(i+2>=bytes.length||hex(bytes[i+1])<0||hex(bytes[i+2])<0)possible=false;else byte=hex(bytes[++i])*16+hex(bytes[++i])}
    if(++length>7)possible=false;if(possible)name+=String.fromCharCode(byte)
   }
   if(possible&&['ObjStm','XRef','Encrypt'].includes(name))return {status:'incomplete',names,objects}
  }
 }
 return {status:'closed',names,objects}
}
class ProofFailure extends Error {constructor(readonly status:'incomplete'|'budget'){super('PDF_SOURCE_TEXT_UNPROVEN')}}
const raw=(dict:PDFDict,key:string)=>dict.get(PDFName.of(key),true)
const named=(value:unknown,name:string)=>value instanceof PDFName&&value.decodeText()===name
/** No getPages/Resources/ascend, decoded contents, save or metadata update. */
export async function preparePdfSourceText(bytes:Uint8Array,options:{load?:typeof PDFDocument.load}={}):Promise<PdfSourcePreparation>{
 const gate=await preflightPdfSourceText(bytes);if(gate.status!=='closed')return {status:gate.status,pages:[],lookups:0}
 let visits=0,fonts=0,document:PDFDocument|undefined,parserDiagnostic=false
 const original=Object.fromEntries(['warn','error','info','log','debug'].map(key=>[key,console[key as 'warn']])) as Record<'warn'|'error'|'info'|'log'|'debug',typeof console.warn>
 try{
  for(const key of Object.keys(original) as (keyof typeof original)[])console[key]=()=>{parserDiagnostic=true}
  try{const alias=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);document=await(options.load??PDFDocument.load)(alias,{updateMetadata:false,ignoreEncryption:false,throwOnInvalidObject:true,parseSpeed:ParseSpeeds.Slow})}finally{for(const key of Object.keys(original) as (keyof typeof original)[])console[key]=original[key]}
  if(parserDiagnostic)throw new ProofFailure('incomplete')
  const doc=document,ids=new WeakMap<object,number>(),fontSeen=new WeakSet<object>(),fontCache=new WeakMap<PDFDict,{status:'eligible'|'ineligible';fingerprint:string}>();let nextId=0
  const tick=()=>{if(visits>=SOURCE_TEXT_LIMITS.objects)throw new ProofFailure('budget');visits++}
  const strictName=(name:PDFName)=>{if(name.asString().length>SOURCE_TEXT_LIMITS.nameBytes*3+1)throw new ProofFailure('budget');const decoded=name.decodeText();if(decoded.length>SOURCE_TEXT_LIMITS.nameBytes)throw new ProofFailure('budget');if(decoded.includes('#'))throw new ProofFailure('incomplete');return decoded}
  const get=(value:PDFDict,key:string)=>{tick();const found=raw(value,key);if(found instanceof PDFName)strictName(found);return found}
  const id=(value:object)=>{let result=ids.get(value);if(result===undefined){result=++nextId;ids.set(value,result)}return result}
  const resolve=(value:PDFObject|undefined):PDFObject=>{tick();if(value===undefined||value===PDFNull)throw new ProofFailure('incomplete');const seen=new Set<string>();while(value instanceof PDFRef){tick();const key=value.toString();if(seen.has(key))throw new ProofFailure('incomplete');seen.add(key);value=doc.context.lookup(value);if(value===undefined||value===PDFNull)throw new ProofFailure('incomplete')}if(value instanceof PDFName)strictName(value);return value}
  const dict=(value:PDFObject|undefined)=>{const result=resolve(value);if(!(result instanceof PDFDict))throw new ProofFailure('incomplete');return result}
  const array=(value:PDFObject|undefined)=>{const result=resolve(value);if(!(result instanceof PDFArray))throw new ProofFailure('incomplete');return result}
  const fontNames=(value:PDFDict)=>{if(value.keys().length>SOURCE_TEXT_LIMITS.resourceItems)throw new ProofFailure('budget');for(const [key,entry]of value.entries()){tick();strictName(key);if(entry instanceof PDFName)strictName(entry)}}
  const leaves:PDFDict[]=[],treeStack=new Set<number>(),treeSeen=new Set<number>()
  const pages=(value:PDFObject|undefined,depth:number)=>{if(depth>SOURCE_TEXT_LIMITS.pageDepth)throw new ProofFailure('budget');const node=dict(value),key=id(node);if(treeStack.has(key)||treeSeen.has(key))throw new ProofFailure('incomplete');treeSeen.add(key);treeStack.add(key)
   if(named(get(node,'Type'),'Page')){if(leaves.length>=SOURCE_TEXT_LIMITS.pages)throw new ProofFailure('budget');leaves.push(node)}else if(named(get(node,'Type'),'Pages')){const kids=array(get(node,'Kids'));if(kids.size()>SOURCE_TEXT_LIMITS.pages)throw new ProofFailure('budget');for(let i=0;i<kids.size();i++){tick();pages(kids.get(i),depth+1)}}else throw new ProofFailure('incomplete');treeStack.delete(key)}
  pages(get(doc.catalog,'Pages'),0);if(!leaves.length)throw new ProofFailure('incomplete')
  const result:PdfSourceResource[]=[]
  for(const leaf of leaves){
   if(visits>=SOURCE_TEXT_LIMITS.objects){result.push({status:'budget',resourceClosureHash:sourceTextObjectHash(['budget'])});await yieldTurn();continue}
   let status:Status='eligible',count=0,pageFonts=0;const transcript:unknown[]=[],active=new Set<string>(),done=new Set<string>()
   const degrade=(next:Status)=>{if(['eligible','ineligible','incomplete','budget'].indexOf(next)>['eligible','ineligible','incomplete','budget'].indexOf(status))status=next}
   const resourceTick=()=>{tick();if(++count>SOURCE_TEXT_LIMITS.resourceItems)throw new ProofFailure('budget')}
   const font=(value:PDFObject|undefined)=>{resourceTick();const f=dict(value);pageFonts++;const cached=fontCache.get(f);if(cached){transcript.push(['font',id(f),cached.fingerprint]);degrade(cached.status);return}fontNames(f);if(!fontSeen.has(f)){fontSeen.add(f);if(++fonts>SOURCE_TEXT_LIMITS.fonts)throw new ProofFailure('budget')}
    let fontStatus:'eligible'|'ineligible'='eligible'
    const finish=()=>{const tag=(object:PDFObject|undefined)=>object instanceof PDFName?strictName(object):object instanceof PDFRef?object.toString():object?.constructor.name??'absent',fingerprint=sourceTextObjectHash({id:id(f),type:tag(get(f,'Subtype')),encoding:tag(get(f,'Encoding')),toUnicode:get(f,'ToUnicode')===undefined?'absent':'present',status:fontStatus});fontCache.set(f,{status:fontStatus,fingerprint});transcript.push(['font',id(f),fingerprint]);degrade(fontStatus)}
    if(named(get(f,'Subtype'),'Type3'))throw new ProofFailure('incomplete')
    const unicode=get(f,'ToUnicode');if(unicode!==undefined){const target=resolve(unicode);if(!(target instanceof PDFRawStream)&&!(target instanceof PDFName&&['Identity-H','Identity-V'].includes(target.decodeText())))throw new ProofFailure('incomplete');fontStatus='ineligible'}
    if(!named(get(f,'Subtype'),'Type0')){fontStatus='ineligible';finish();return}
    const encoding=resolve(get(f,'Encoding'));if(!(encoding instanceof PDFName)&&!(encoding instanceof PDFRawStream))throw new ProofFailure('incomplete');if(!named(encoding,'GBK-EUC-H'))fontStatus='ineligible'
    const descendants=array(get(f,'DescendantFonts'));if(descendants.size()!==1)throw new ProofFailure('incomplete');const child=dict(descendants.get(0));fontNames(child);if(!['CIDFontType0','CIDFontType2'].some(name=>named(get(child,'Subtype'),name)))throw new ProofFailure('incomplete')
    const descriptor=get(child,'FontDescriptor');if(descriptor!==undefined){const fd=dict(descriptor);fontNames(fd);const type=get(fd,'Type');if(type!==undefined&&!named(type,'FontDescriptor'))throw new ProofFailure('incomplete');for(const key of ['FontFile','FontFile2','FontFile3'])if(get(fd,key)!==undefined){if(!(resolve(get(fd,key)) instanceof PDFRawStream))throw new ProofFailure('incomplete');fontStatus='ineligible'}}
    finish()
   }
   const group=(value:PDFObject|undefined)=>{if(value!==undefined){const g=dict(value);if(get(g,'Resources')!==undefined||get(g,'AP')!==undefined||get(g,'SMask')!==undefined)throw new ProofFailure('incomplete')}}
   const resources=(value:PDFObject|undefined,depth:number)=>{if(depth>SOURCE_TEXT_LIMITS.resourceDepth)throw new ProofFailure('budget');const r=dict(value),context=id(r),key='r:'+context;if(active.has(key))throw new ProofFailure('incomplete');if(done.has(key))return;active.add(key)
    if(r.keys().length>SOURCE_TEXT_LIMITS.resourceItems)throw new ProofFailure('budget')
    for(const [name,entry]of r.entries()){resourceTick();const label=strictName(name);transcript.push([context,label,entry instanceof PDFRef?entry.toString():entry.constructor.name])
     if(label==='ProcSet'){const names=array(entry);if(names.size()>SOURCE_TEXT_LIMITS.resourceItems)throw new ProofFailure('budget');for(let i=0;i<names.size();i++){resourceTick();if(!(resolve(names.get(i)) instanceof PDFName))throw new ProofFailure('incomplete')}continue}
     if(label==='Font'){const map=dict(entry);if(map.keys().length>SOURCE_TEXT_LIMITS.resourceItems)throw new ProofFailure('budget');for(const [name,f]of map.entries()){strictName(name);font(f)}}
     else if(label==='Pattern'){if(dict(entry).keys().length)throw new ProofFailure('incomplete')}
     else if(label==='ExtGState'){const map=dict(entry);if(map.keys().length>SOURCE_TEXT_LIMITS.resourceItems)throw new ProofFailure('budget');for(const [name,state]of map.entries()){strictName(name);resourceTick();const stateDict=dict(state),mask=get(stateDict,'SMask');if(mask!==undefined&&!named(resolve(mask),'None'))throw new ProofFailure('incomplete');const fontValue=get(stateDict,'Font');if(fontValue!==undefined){const args=array(fontValue);if(args.size()!==2)throw new ProofFailure('incomplete');font(args.get(0))}}}
     else if(label==='XObject'){const map=dict(entry);if(map.keys().length>SOURCE_TEXT_LIMITS.resourceItems)throw new ProofFailure('budget');for(const [name,x]of map.entries()){strictName(name);resourceTick();const stream=resolve(x);if(!(stream instanceof PDFRawStream))throw new ProofFailure('incomplete');if(named(get(stream.dict,'Subtype'),'Image'))continue;if(!named(get(stream.dict,'Subtype'),'Form'))throw new ProofFailure('incomplete');group(get(stream.dict,'Group'));const ownResources=get(stream.dict,'Resources'),formResources=ownResources??r;if(ownResources!==undefined&&depth>=SOURCE_TEXT_LIMITS.resourceDepth)throw new ProofFailure('budget');const formKey='f:'+id(stream)+':'+id(resolve(formResources));if(active.has(formKey))throw new ProofFailure('incomplete');if(done.has(formKey))continue;active.add(formKey);if(ownResources!==undefined)resources(formResources,depth+1);active.delete(formKey);done.add(formKey)}}
     else throw new ProofFailure('incomplete')
    }
    active.delete(key);done.add(key)
   }
   try{
    const annots=get(leaf,'Annots');if(annots!==undefined&&array(annots).size())throw new ProofFailure('incomplete');group(get(leaf,'Group'))
    let current=leaf,own:PDFObject|undefined;const parents=new Set<number>();for(let depth=0;;depth++){if(depth>SOURCE_TEXT_LIMITS.pageDepth)throw new ProofFailure('budget');const key=id(current);if(parents.has(key))throw new ProofFailure('incomplete');parents.add(key);if(own===undefined&&get(current,'Resources')!==undefined)own=get(current,'Resources');const parent=get(current,'Parent');if(parent===undefined)break;if(depth>=SOURCE_TEXT_LIMITS.pageDepth)throw new ProofFailure('budget');current=dict(parent)}
    resources(own,0);if(!pageFonts)degrade('incomplete')
   }catch(error){degrade(error instanceof ProofFailure?error.status:'incomplete')}
   result.push({status,resourceClosureHash:sourceTextObjectHash(transcript)});await yieldTurn()
  }
  return {status:'closed',pages:result,lookups:visits}
 }catch(error){return {status:error instanceof ProofFailure?error.status:'incomplete',pages:[],lookups:visits}}
 finally{for(const key of Object.keys(original) as (keyof typeof original)[])console[key]=original[key];document=undefined}
}

interface TextItem {str:string;dir?:string;hasEOL?:boolean;fontName?:string;transform?:number[]}
interface Glyph {unicode?:unknown;originalCharCode?:unknown}
const layout=(char:string)=>/^[\t\n\r\f \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/u.test(char)
const forbidden=(char:string)=>/[\p{Cf}\p{Cc}\p{Cs}]/u.test(char)&&!layout(char)
export async function decodePdfSourcePage(input:{page:number;resource:PdfSourceResource;operators:{fnArray:number[];argsArray:unknown[][]};ops:Record<string,number>;items:TextItem[];styles:Record<string,{vertical?:boolean}>;fontExists?(id:string):boolean;budget?:{glyphs:number;pages:number;changes:number}}):Promise<{text:string;blocked:boolean;reason?:'budget'|'state'|'resource'|'direction'|'order'|'count'|'candidate';budgetExceeded?:boolean;proof?:ImportPdfSourceTextPageProof}>{
 const fontKnown=(id:unknown)=>typeof id==='string'&&(input.fontExists?input.fontExists(id):Object.hasOwn(input.styles,id))&&input.styles[id]?.vertical!==true
 const {ops,operators,items}=input,original=items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(''),budget=input.budget??{glyphs:0,pages:0,changes:0},glyphs:{char:string;code:number}[]=[],targets:number[]=[],stack:{state:{font:boolean;mode:number};form:boolean}[]=[];let state={font:false,mode:0},uncertain=false,candidates=0,pageGlyphs=0,formDepth=0,budgetExceeded=false
 for(let index=0;index<operators.fnArray.length;index++){
  const operation=operators.fnArray[index],args=operators.argsArray[index]
  if(operation===ops.save||operation===ops.paintFormXObjectBegin){const form=operation===ops.paintFormXObjectBegin;if(form&&++formDepth>SOURCE_TEXT_LIMITS.resourceDepth)uncertain=true;if(stack.length>=32)uncertain=true;else stack.push({state:{...state},form})}
  else if(operation===ops.restore||operation===ops.paintFormXObjectEnd){const form=operation===ops.paintFormXObjectEnd,previous=stack.pop();if(!previous||previous.form!==form)uncertain=true;else{state=previous.state;if(form)formDepth--}}
  else if(operation===ops.setFont)state.font=fontKnown(args?.[0])
  else if(operation===ops.setTextRenderingMode){state.mode=Number(args?.[0]);if(![0,1,2].includes(state.mode))uncertain=true}
  else if(operation===ops.setGState){if(!Array.isArray(args?.[0]))uncertain=true;else for(const entry of args[0] as unknown[][]){if(entry[0]==='Font')state.font=Array.isArray(entry[1])&&fontKnown(entry[1][0]);if(['ca','CA'].includes(String(entry[0]))&&entry[1]!==1)uncertain=true;if(entry[0]==='SMask'&&entry[1]!==false&&entry[1]!==null)uncertain=true}}
  else if(operation===ops.showText){if(!state.font||![0,1,2].includes(state.mode))uncertain=true;if(!Array.isArray(args?.[0])){uncertain=true;continue}for(const value of args[0] as (Glyph|number)[]){if(typeof value==='number'){if(!Number.isFinite(value))uncertain=true;continue}if(++pageGlyphs>SOURCE_TEXT_LIMITS.pageGlyphs||++budget.glyphs>SOURCE_TEXT_LIMITS.totalGlyphs){uncertain=true;budgetExceeded=true;index=operators.fnArray.length;break}if(pageGlyphs%1024===0)await yieldTurn();if(!value||typeof value.unicode!=='string'||!Number.isSafeInteger(value.originalCharCode)){uncertain=true;continue}const unicode=value.unicode,code=value.originalCharCode as number;if(!unicode||code<0||code>0xffff)uncertain=true;if(unicode.includes('\u22ef')){candidates++;if(unicode!=='\u22ef'||code!==0xa1ad)uncertain=true}for(const char of unicode){if(forbidden(char))uncertain=true;if(!layout(char))glyphs.push({char,code})}}}
  else if(['showSpacedText','nextLineShowText','nextLineSetSpacingShowText','setCharWidth','setCharWidthAndBounds','beginAnnotation','endAnnotation','beginGroup','endGroup'].some(key=>operation===ops[key]))uncertain=true
 }
 if(budgetExceeded)return {text:original,blocked:true,budgetExceeded:true,reason:'budget'}
 if(!candidates&&!original.includes('\u22ef'))return {text:original,blocked:false}
 if(input.resource.status==='ineligible')return {text:original,blocked:false}
 if(!candidates)return {text:original,blocked:true,reason:'candidate'}
 if(input.resource.status!=='eligible')return {text:original,blocked:true,reason:'resource'}
 if(uncertain||stack.length)return {text:original,blocked:true,reason:'state'}
 if(++budget.pages>SOURCE_TEXT_LIMITS.candidatePages||candidates>SOURCE_TEXT_LIMITS.pageChanges||budget.changes+candidates>SOURCE_TEXT_LIMITS.totalChanges)return {text:original,blocked:true,budgetExceeded:true,reason:'budget'}
 let position=0,offset=0
 for(const item of items){if(item.dir!=='ltr'||item.fontName&&input.styles[item.fontName]?.vertical||item.transform&&(!item.transform.every(Number.isFinite)||item.transform.length!==6||item.transform[0]<=0||item.transform[3]<=0||item.transform[1]!==0||item.transform[2]!==0))return {text:original,blocked:true,reason:'direction'};for(const char of item.str){if(forbidden(char))return {text:original,blocked:true,reason:'state'};if(!layout(char)){if(glyphs[position]?.char!==char)return {text:original,blocked:true,reason:'order'};if(char==='\u22ef')targets.push(offset);position++}offset+=char.length}offset++}
 if(position!==glyphs.length||targets.length!==candidates)return {text:original,blocked:true,reason:'count'}
 let text='',start=0;for(const point of targets){text+=original.slice(start,point)+'\u2026';start=point+1}text+=original.slice(start)
 if(text.length!==original.length||targets.some(point=>original[point]!=='\u22ef'||text[point]!=='\u2026'))return {text:original,blocked:true}
 budget.changes+=targets.length
 return {text,blocked:false,proof:{page:input.page,resourceClosureHash:input.resource.resourceClosureHash,beforeUtf8Sha256:sourceTextHash(original),afterUtf8Sha256:sourceTextHash(text),candidateCount:targets.length,changedOffsets:targets,glyphSequenceHash:sourceTextObjectHash(glyphs),correspondenceHash:sourceTextObjectHash({offsets:targets,sequence:glyphs.map(glyph=>glyph.char)})}}
}
