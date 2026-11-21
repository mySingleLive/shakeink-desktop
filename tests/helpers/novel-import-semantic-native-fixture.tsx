import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {ThemeProvider} from 'next-themes'
import {SettingContentEditor} from '../../src/components/content/SettingContentEditor'
import type {SettingContent,LevelNode,LevelSystemContent} from '../../src/components/content/setting-content'
import type {SettingType} from '../../src/generated/prisma/enums'
import {monaco} from '../../src/components/editor/monaco-setup'

// Synthetic native shapes test existing consumers, not the import/publisher path.
export const semanticNativeTypes=['LEVEL_SYSTEM','CONCEPT','FACTION','POWER_SYSTEM','MAP','SOCIETY','CULTURE','GEOGRAPHY','WORLD_HISTORY'] as const
type NativeType=typeof semanticNativeTypes[number]
type CaseKey=NativeType|'LEVEL_SYSTEM_MULTI'
const prose=(name:string)=>`${name}_首句\n\n${name}_末句`
const node=(name:string,children:LevelNode[]=[]):LevelNode=>({name,aliases:[name+'_别名'],tags:[name+'_标签'],condition:prose(name+'_条件'),description:prose(name+'_介绍'),abilities:[{name:name+'_能力',description:prose(name+'_能力描述')}],children})
const single:LevelSystemContent={scope:'CHARACTER',form:'SINGLE',description:prose('LEVEL_SYSTEM_介绍'),rules:prose('LEVEL_SYSTEM_规则'),levels:[node('首等级',[node('子等级')]),node('末等级')],pathways:[]}
const initial:Record<CaseKey,SettingContent>={
 LEVEL_SYSTEM:single,
 LEVEL_SYSTEM_MULTI:{scope:'ITEM',form:'MULTI_PATHWAY',description:prose('多途径_介绍'),rules:prose('多途径_规则'),levels:[],pathways:[{name:'首途径',aliases:['首途径_别名'],tags:['首途径_标签'],description:prose('首途径_介绍'),levels:[node('途径首等级'),node('途径末等级')]},{name:'末途径',aliases:['末途径_别名'],tags:['末途径_标签'],description:prose('末途径_介绍'),levels:[node('末途径等级')]}]},
 CONCEPT:{concepts:[{term:'首概念',explanation:prose('首概念_解释')},{term:'末概念',explanation:prose('末概念_解释')}]},
 FACTION:{factions:[{id:'faction-first',name:'首势力',description:prose('首势力_简介'),relations:prose('首势力_关系')},{id:'faction-last',name:'末势力',description:prose('末势力_简介'),relations:prose('末势力_关系')}]},
 POWER_SYSTEM:{text:prose('POWER_SYSTEM')},MAP:{text:prose('MAP')},SOCIETY:{text:prose('SOCIETY')},CULTURE:{text:prose('CULTURE')},GEOGRAPHY:{text:prose('GEOGRAPHY')},WORLD_HISTORY:{text:prose('WORLD_HISTORY')},
}
interface NativeFixture {
 show(type:NativeType,multi?:boolean):void
 initial(key:CaseKey):SettingContent
 value(key:CaseKey):SettingContent
 changes():{key:CaseKey;value:SettingContent}[]
 focusEditorEnd():void
 editorValues():string[]
 workers():number
 workerDiagnostics():{errors:string[];messages:number}
 unexpected():string[]
 unmount():void
}
declare global {interface Window {mountSemanticNative(workerSource:string):NativeFixture;semanticNative:NativeFixture}}

window.mountSemanticNative=(workerSource:string)=>{
 const workerUrl=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'})),workers:Worker[]=[],workerErrors:string[]=[],unexpected:string[]=[],changes:{key:CaseKey;value:SettingContent}[]=[];let workerMessages=0
 // Production monaco-setup injects the installed Monaco into the real React
 // adapter. Only its worker URL is adapted to this closed, in-memory document.
 self.MonacoEnvironment={getWorker(){const worker=new Worker(workerUrl);worker.addEventListener('error',event=>workerErrors.push(event.message||event.type));worker.addEventListener('message',()=>workerMessages++);workers.push(worker);return worker}}
 window.fetch=async input=>{unexpected.push(String(input));throw Error('No API is authorized in the native consumer fixture')}
 const values=structuredClone(initial),client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}}),root=createRoot(document.getElementById('app')!)
 let show:(key:CaseKey)=>void=()=>{throw Error('Native consumer not mounted')}
 function App(){
  const [key,setKey]=useState<CaseKey>('LEVEL_SYSTEM'),[contents,setContents]=useState(values)
  show=setKey
  return <ThemeProvider attribute="class" themes={['paper','ink']} enableSystem={false} forcedTheme="paper"><QueryClientProvider client={client}><main style={{width:980,minHeight:800,padding:24}}><h1>合成 native 消费契约 · {key}</h1><div data-native-consumer={key} style={{height:760}}><SettingContentEditor key={key} settingType={(key==='LEVEL_SYSTEM_MULTI'?'LEVEL_SYSTEM':key) as SettingType} value={contents[key]} onChange={value=>{values[key]=structuredClone(value);changes.push({key,value:structuredClone(value)});setContents(previous=>({...previous,[key]:value}))}} settingId="synthetic-setting" settingName="合成设定"/></div></main></QueryClientProvider></ThemeProvider>
 }
 flushSync(()=>root.render(<App/>))
 return {show:(type,multi=false)=>flushSync(()=>show(multi?'LEVEL_SYSTEM_MULTI':type)),initial:key=>structuredClone(initial[key]),value:key=>structuredClone(values[key]),changes:()=>structuredClone(changes),focusEditorEnd:()=>{const editors=monaco.editor.getEditors().filter(editor=>editor.getDomNode()?.isConnected);if(editors.length!==1)throw Error(`Expected one mounted real Monaco, found ${editors.length}`);const editor=editors[0],model=editor.getModel();if(!model)throw Error('Real Monaco model unavailable');editor.setPosition(model.getPositionAt(model.getValueLength()));editor.focus()},editorValues:()=>monaco.editor.getEditors().filter(editor=>editor.getDomNode()?.isConnected).map(editor=>editor.getValue()),workers:()=>workers.length,workerDiagnostics:()=>({errors:[...workerErrors],messages:workerMessages}),unexpected:()=>[...unexpected],unmount:()=>{flushSync(()=>root.unmount());client.clear();workers.forEach(worker=>worker.terminate());URL.revokeObjectURL(workerUrl)}}
}
