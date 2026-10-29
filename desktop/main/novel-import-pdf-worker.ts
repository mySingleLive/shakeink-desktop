import {parentPort} from 'node:worker_threads'
import {PdfDiagnostics} from './novel-import-pdf-diagnostics'

let seal:Int32Array|undefined
const diagnostics=new PdfDiagnostics(()=>{if(seal)Atomics.store(seal,0,1)})
diagnostics.install()
parentPort?.once('message',async(message:{task:{type:'inspect'|'preview';page?:number;sourceTextPolicy?:'current'|'legacy'};bytes:Uint8Array;appRoot:string;diagnosticSeal?:SharedArrayBuffer})=>{
 try{
  if(!message||!['inspect','preview'].includes(message.task?.type)||!(message.bytes instanceof Uint8Array)||typeof message.appRoot!=='string')throw Error('PDF_TASK')
  if(message.diagnosticSeal instanceof SharedArrayBuffer&&message.diagnosticSeal.byteLength===4)seal=new Int32Array(message.diagnosticSeal)
  const {runPdfTask}=await import('./novel-import-pdf-engine')
  const result=await runPdfTask(message.bytes,message.task,message.appRoot,diagnostics,value=>parentPort?.postMessage({type:'progress',value}))
  const png='png'in result?result.png:undefined
  parentPort?.postMessage({type:'result',value:result},png?[png.buffer as ArrayBuffer]:[])
 }catch(error){parentPort?.postMessage({type:'failed',code:error instanceof Error&&error.message==='PDF_RESOURCE'?'resource-missing':error instanceof Error&&error.message==='PDF_BUDGET'?'budget':'render-failed',diagnostics:diagnostics.allCodes(),details:diagnostics.details()})}
 finally{parentPort?.close()}
})
