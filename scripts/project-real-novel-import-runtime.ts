/** Private, bounded stdin projection. Never echo malformed input or raw errors. */
import {z} from 'zod'
import {parseImportRuntimeDiagnostics} from '../desktop/core/novel-import-runtime-proof'

const unavailable={runtimeDiagnosticsStatus:'unavailable'} as const
const envelope=z.object({sessionId:z.uuid(),diagnostics:z.unknown()}).strict()
const maxInputBytes=17408
async function project(){
 const chunks:Buffer[]=[];let size=0
 for await(const chunk of process.stdin){
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)
  if(bytes.length>maxInputBytes-size)return unavailable
  size+=bytes.length;chunks.push(bytes)
 }
 const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size))
 const parsed=envelope.safeParse(JSON.parse(text))
 if(!parsed.success)return unavailable
 return parseImportRuntimeDiagnostics(parsed.data.sessionId,parsed.data.diagnostics)??unavailable
}
void project().then(
 value=>process.stdout.write(JSON.stringify(value)+'\n'),
 ()=>process.stdout.write(JSON.stringify(unavailable)+'\n'),
)
