import {readFile,lstat,realpath} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {gunzipSync} from 'node:zlib'
import {dirname,join,resolve,sep} from 'node:path'
import manifest from './novel-import-pdf-resource-manifest.json'

const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')
async function regular(path:string,max:number){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max||await realpath(path)!==resolve(path))throw Error('PDF_RESOURCE');return readFile(path)}
export const PDF_RESOURCE_PROFILE_HASH=hash(JSON.stringify(manifest))
export async function loadPdfResources(appRoot:string){
 try{return await loadPdfResourcesChecked(appRoot)}catch{throw Error('PDF_RESOURCE')}
}
async function loadPdfResourcesChecked(appRoot:string){
 const require=createRequire(import.meta.url),base=dirname(require.resolve('pdfjs-dist/package.json'))
 if(await realpath(base)!==await realpath(join(appRoot,'node_modules/pdfjs-dist')))throw Error('PDF_RESOURCE')
 for(const [path,expected] of Object.entries(manifest.files)){const bytes=await regular(join(base,path),12*1024*1024);if(hash(bytes)!==expected)throw Error('PDF_RESOURCE')}
 const canvasPath=require.resolve('@napi-rs/canvas/package.json');if(await realpath(dirname(canvasPath))!==await realpath(join(appRoot,'node_modules/@napi-rs/canvas')))throw Error('PDF_RESOURCE')
 const canvasPackage=JSON.parse((await regular(canvasPath,128*1024)).toString('utf8'))
 if(canvasPackage.version!==manifest.canvasVersion)throw Error('PDF_RESOURCE')
 const development=join(appRoot,'public/fonts/noto-sans-sc/NotoSansSC-Regular.ttf.gz'),installed=join(appRoot,'out/fonts/noto-sans-sc/NotoSansSC-Regular.ttf.gz')
 let path=installed;try{await lstat(join(appRoot,'out'))}catch{path=development}
 const compressed=await regular(path,8*1024*1024);if(hash(compressed)!==manifest.fontGzipHash)throw Error('PDF_RESOURCE')
 const font=gunzipSync(compressed,{maxOutputLength:12*1024*1024});if(hash(font)!==manifest.fontHash)throw Error('PDF_RESOURCE')
 const license=await regular(join(dirname(path),'LICENSE'),16*1024);if(hash(license)!=='6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2')throw Error('PDF_RESOURCE')
 return {base,font,profile:PDF_RESOURCE_PROFILE_HASH,cMapUrl:join(base,'cmaps')+sep,standardFontDataUrl:join(base,'standard_fonts')+sep,wasmUrl:join(base,'wasm')+sep}
}
/** The packaged OFL font must have a real glyph for a permitted fallback. */
export function fontHasGlyph(font:Uint8Array,codepoint:number){
 const view=new DataView(font.buffer,font.byteOffset,font.byteLength),u16=(offset:number)=>view.getUint16(offset),u32=(offset:number)=>view.getUint32(offset)
 try{
  let cmap=0;for(let i=0;i<u16(4);i++){const offset=12+i*16;if(String.fromCharCode(...font.subarray(offset,offset+4))==='cmap'){cmap=u32(offset+8);break}}
  if(!cmap)return false
  for(let i=0;i<u16(cmap+2);i++){
   const table=cmap+u32(cmap+4+i*8+4),format=u16(table)
   if(format===12){for(let j=0;j<u32(table+12);j++){const at=table+16+j*12,start=u32(at),end=u32(at+4);if(codepoint>=start&&codepoint<=end)return u32(at+8)+codepoint-start!==0}}
   if(format===4&&codepoint<=0xffff){const count=u16(table+6)/2,end=table+14,start=end+count*2+2,delta=start+count*2,ranges=delta+count*2;for(let j=0;j<count;j++){if(codepoint<u16(start+j*2)||codepoint>u16(end+j*2))continue;const distance=u16(ranges+j*2);if(!distance)return (codepoint+u16(delta+j*2))%65536!==0;const glyph=u16(ranges+j*2+distance+(codepoint-u16(start+j*2))*2);return glyph!==0&&(glyph+u16(delta+j*2))%65536!==0}}
  }
 }catch{return false}
 return false
}
