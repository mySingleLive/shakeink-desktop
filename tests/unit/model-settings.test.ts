import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { transformSync } from "esbuild"
import { defaultState, parseContextWindow, type PublicModel } from "../../desktop/core/settings"
import * as catalog from "../../desktop/shared/model-catalog"
import * as builtinCatalog from "../../desktop/shared/builtin-model-catalog"
import { thinkingEffortOptionsFor } from "../../src/lib/ai/thinking-effort"
import { onboardingDialogGuard } from "../../src/lib/desktop/onboarding-flow"
import { saveDesktopModel, removeDesktopModel, updateDesktopSettings, useDesktopStore } from "../../src/stores/desktop"
import type { Bootstrap, SettingsAction, StateSnapshot } from "../../desktop/shared/ipc"

// Execute the actual components with controlled hooks, UI primitives and IPC.
// This proves their public state/event contracts, not Base UI focus management,
// popup collision detection, actual provider requests or native window behavior.
type Props = Record<string, unknown>
interface Element { type: string | ((props: Props) => unknown); props: Props }
interface Hook { value?: unknown; deps?: unknown[]; cleanup?: (() => void) | void }
interface Surface { element: Element; disabled: boolean; name: string; children: Surface[]; focus(): void }
const sample = (change: Partial<PublicModel> = {}): PublicModel => ({ id:"00000000-0000-4000-8000-000000000001", name:"已保存模型", provider:"openai", protocol:"openai", endpoint:"https://api.openai.com/v1", modelId:"gpt-6.1-sol", kind:"TEXT", contextWindow:16000, enabled:true, authRevision:1, keyMask:"••••••••", thinkingLevels:["low","high"], defaultThinking:"high", ...change })
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("")
  if (value && typeof value === "object" && "props" in value) return text((value as Element).props.children)
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}
function deferred<T>() { let resolve!: (value:T) => void, reject!: (error:Error) => void; const promise = new Promise<T>((yes,no) => {resolve=yes;reject=no}); return {promise,resolve,reject} }
function component(file: string, exported: string, initial: Props, dependencies: Record<string, unknown> = {}) {
  const hooks: Hook[] = [], effects: Array<() => void> = []
  let cursor = 0, changed = false, props = initial, surfaces: Surface[] = [], tree: unknown, mounted = true, focused = ""
  const react = {
    useState(initial: unknown) { const n=cursor++,hook=hooks[n]??(hooks[n]={value:typeof initial === "function" ? initial() : initial}); return [hook.value,(next:unknown)=>{ const value=typeof next === "function" ? next(hook.value) : next; if(!Object.is(value,hook.value)){hook.value=value;changed=true} }] },
    useRef(initial: unknown) { const n=cursor++; return (hooks[n]??(hooks[n]={value:{current:initial}})).value },
    useEffect(callback:()=>void|(()=>void), deps:unknown[]) { const n=cursor++,hook=hooks[n]??(hooks[n]={}); if(!hook.deps||deps.length!==hook.deps.length||deps.some((value,index)=>!Object.is(value,hook.deps![index]))){hook.deps=deps;effects.push(()=>{hook.cleanup?.();hook.cleanup=callback()})} },
  }
  const primitives=(names:string[])=>Object.fromEntries(names.map(name=>[name,name]))
  const module={exports:{} as Record<string,(props:Props)=>unknown>}
  const source=transformSync(readFileSync(new URL(`../../src/components/desktop/${file}.tsx`,import.meta.url),"utf8"),{loader:"tsx",format:"cjs",jsx:"automatic"}).code
  new Function("module","exports","require",source)(module,module.exports,(name:string)=>{
    if(name in dependencies)return dependencies[name]
    if(name==="react")return react
    if(name==="react/jsx-runtime")return {jsx:(type:Element["type"],props:Props)=>({type,props}),jsxs:(type:Element["type"],props:Props)=>({type,props}),Fragment:"Fragment"}
    if(name==="lucide-react")return new Proxy({}, {get:(_target,name)=>String(name)})
    if(name==="@/components/ui/dialog")return primitives(["Dialog","DialogContent","DialogTitle","DialogDescription"])
    if(name==="@/components/ui/input")return primitives(["Input"])
    if(name==="@/components/ui/button")return primitives(["Button"])
    if(name==="@desktop/shared/model-catalog")return catalog
    if(name==="@desktop/shared/builtin-model-catalog")return builtinCatalog
    if(name==="@desktop/core/settings")return {parseContextWindow}
    if(name==="./ModelChoiceSelect")return primitives(["ModelChoiceSelect"])
    if(name==="@/lib/ai/thinking-effort")return {thinkingEffortOptionsFor}
    if(name==="@/components/chat/provider-logos")return primitives(["ProviderLogo"])
    if(name==="@/lib/desktop/onboarding-flow")return {onboardingDialogGuard}
    if(name==="@base-ui/react/combobox")return {Combobox:primitives(["Root","Trigger","Portal","Positioner","Popup","Input","Empty","List","Item","ItemIndicator"])}
    throw new Error(`Unexpected component dependency: ${name}`)
  })
  function render(){
    if(!mounted){surfaces=[];return}
    for(let n=0;n<12;n++){
      cursor=0;changed=false;tree=module.exports[exported](props);surfaces=[]
      function visit(value:unknown,parent?:Surface,disabled=false){
        if(Array.isArray(value)){value.forEach(child=>visit(child,parent,disabled));return}
        if(!value||typeof value!=="object"||!("props" in value))return
        let element=value as Element
        if(typeof element.type==="function"){visit(element.type(element.props),parent,disabled);return}
        if(element.type==="Dialog"&&!element.props.open)return
        const ownDisabled=disabled||!!element.props.disabled
        const surface:Surface={element,disabled:ownDisabled,name:String(element.props["aria-label"]??(element.type==="ModelChoiceSelect"?element.props.label:undefined)??text(element.props.children)),children:[],focus(){focused=this.name}}
        surfaces.push(surface);parent?.children.push(surface)
        const ref=element.props.ref as {current?:unknown}|((surface:Surface)=>void)|undefined
        if(typeof ref==="function")ref(surface);else if(ref)ref.current=surface
        visit(element.props.children,surface,ownDisabled)
      }
      visit(tree);while(effects.length)effects.shift()!()
      if(!changed)return
    }
    throw new Error("Component did not settle")
  }
  function query(name:string){render();return surfaces.find(surface=>["Input","Button","button","select","ModelChoiceSelect"].includes(String(surface.element.type))&&surface.name===name)}
  function find(name:string){const surface=query(name);assert.ok(surface,`Visible control: ${name}`);return surface}
  function invoke(surface:Surface,handler:string,payload?:unknown){if(surface.disabled)return;const action=surface.element.props[handler] as ((payload:unknown)=>unknown)|undefined;assert.ok(action,`${surface.name} supports ${handler}`);void action(payload);render()}
  function dialog(title:string){
    render()
    function ownsTitle(surface:Surface):boolean{return surface.children.some(child=>{
      if(child.element.type==="Dialog"||child.element.type==="DialogContent")return false
      return child.element.type==="DialogTitle"&&child.name===title||ownsTitle(child)
    })}
    return surfaces.find(surface=>surface.element.type==="DialogContent"&&ownsTitle(surface))
  }
  render()
  return {
    find,query,dialog,render, all:()=>{render();return surfaces},focused:()=>focused,
    click:(name:string)=>invoke(find(name),"onClick"),
    fill:(name:string,value:string)=>invoke(find(name),"onChange",{target:{value}}),
    choose:(name:string,value:string)=>{const surface=find(name),options=surface.element.props.options as Array<{id:string;disabled?:boolean}>|undefined;if(options?.find(option=>option.id===value)?.disabled)return;invoke(surface,"onChange",surface.element.type==="select"?{target:{value}}:value)},
    open:(name:string)=>invoke(find(name),"onOpen"),
    async settle(){for(let n=0;n<8;n++)await Promise.resolve();render()},
    setProps(next:Props){props=next;render()},
    finish(){mounted=false;for(const hook of hooks)hook.cleanup?.();surfaces=[]},
  }
}
function configuration(options:{model?:PublicModel;kind?:"TEXT"|"IMAGE";models?:PublicModel[];write?:(draft:unknown)=>Promise<unknown>;discover?:(draft:catalog.ConfigurationDraft)=>Promise<unknown>;test?:(draft:catalog.ConfigurationDraft)=>Promise<unknown>;read?:(scope:catalog.CatalogScope)=>Promise<unknown>;reveal?:(id:string)=>Promise<string>}={}){
  const writes:unknown[]=[],tested:catalog.ConfigurationDraft[]=[],discovered:catalog.ConfigurationDraft[]=[],canceled:string[]=[]
  let closed=0
  const savedWindow=Object.getOwnPropertyDescriptor(globalThis,"window")
  Object.defineProperty(globalThis,"window",{configurable:true,writable:true,value:{desktop:{
    async discoverModels(_id:string,draft:catalog.ConfigurationDraft){discovered.push(structuredClone(draft));return await options.discover?.(draft)},
    async testModel(_id:string,draft:catalog.ConfigurationDraft){tested.push(structuredClone(draft));return await options.test?.(draft)},
    async cancelModelConfiguration(id:string){canceled.push(id)},
    ...(options.read ? {readModelCatalog: options.read} : {}),
    ...(options.reveal ? {revealModelKey: options.reveal} : {}),
  }}})
  const models=options.models??(options.model?[options.model]:[])
  const ui=component("ModelConfigurationDialog","ModelConfigurationDialog",{kind:options.kind??"TEXT",model:options.model,onClose:()=>{closed++;ui.finish()}},{"@/stores/desktop":{useDesktopStore:(select:(state:unknown)=>unknown)=>select({bootstrap:{models}}),saveDesktopModel:async(draft:unknown)=>{writes.push(structuredClone(draft));return await options.write?.(draft)}}})
  return {...ui,writes,tested,discovered,canceled,closed:()=>closed,finish(){ui.finish();if(savedWindow)Object.defineProperty(globalThis,"window",savedWindow);else Reflect.deleteProperty(globalThis,"window")}}
}

for(const kind of ["TEXT","IMAGE"] as const)for(const preset of catalog.presetsFor(kind).filter(p=>p.id!=="custom"))test(`D01/D02: ${preset.id} ${kind} shows only verified builtin models without a Key or network`,async()=>{
  const ui=configuration({kind})
  try{
    ui.choose("供应商",preset.id)
    const select=ui.find("可用模型"),options=select.element.props.options as Array<{id:string;disabled?:boolean}>
    assert.equal(select.disabled,false)
    if (!options.length) { assert.equal(preset.id,"zai"); ui.open("可用模型"); await ui.settle(); assert.equal(ui.discovered.length,0); return }
    const choice=options.find(option=>!option.disabled)!;assert.ok(choice)
    ui.open("可用模型");await ui.settle();ui.choose("可用模型",choice.id)
    assert.equal(ui.find("可用模型").element.props.value,choice.id)
    assert.equal(ui.discovered.length,0);assert.equal(ui.writes.length,0)
    assert.equal(ui.find("API Key").element.props.value,"")
    ui.fill("API Key","public-candidate-fixture")
    assert.equal(ui.find("可用模型").element.props.value,choice.id)
    ui.click("保存模型");await ui.settle()
    assert.equal((ui.writes[0] as {modelId:string}).modelId,choice.id)
  }finally{ui.finish()}
})

test("D04: provider/Key edits cancel and discard late authenticated catalogs",async()=>{
  const gate=deferred<catalog.CatalogResult>(),ui=configuration({discover:()=>gate.promise})
  try{
    ui.fill("API Key","public-before-fixture");ui.open("可用模型")
    ui.choose("供应商","deepseek");assert.equal(ui.canceled.length,1)
    gate.resolve({ok:true,provider:"openai",kind:"TEXT",models:[{id:"late-only",name:"late",kind:"TEXT",permission:"listed-unverified",source:"fixture"}],complete:true,unknownCapabilityIds:[],permission:"listed-unverified",sources:[],checkedAt:new Date().toISOString(),warnings:[]})
    await ui.settle()
    const options=ui.find("可用模型").element.props.options as Array<{id:string}>
    assert.ok(options.some(row=>row.id==="deepseek-flash"));assert.ok(!options.some(row=>row.id==="late-only"))
    assert.equal(ui.find("API Key").element.props.value,"");assert.equal(ui.find("可用模型").element.props.value,"")
  }finally{ui.finish()}
})
test("D04/D05: choosing B while A's catalog refresh is pending never assigns A's metadata to B",async()=>{
  const gate=deferred<catalog.CatalogResult>(),ui=configuration({discover:()=>gate.promise})
  try{
    ui.choose("供应商","deepseek");ui.choose("可用模型","deepseek-flash");ui.fill("API Key","public-refresh-fixture");ui.open("可用模型")
    ui.choose("可用模型","deepseek-v4-pro")
    gate.resolve({ok:true,provider:"deepseek",kind:"TEXT",models:[{id:"deepseek-flash",name:"A",kind:"TEXT",contextWindow:11111,thinkingLevels:["low"],defaultThinking:"low",permission:"listed-unverified",source:"fixture"},{id:"deepseek-v4-pro",name:"B",kind:"TEXT",contextWindow:22222,thinkingLevels:["high"],defaultThinking:"high",permission:"listed-unverified",source:"fixture"}],complete:true,unknownCapabilityIds:[],permission:"listed-unverified",sources:[],checkedAt:new Date().toISOString(),warnings:[]})
    await ui.settle();ui.click("保存模型");await ui.settle()
    const saved=ui.writes[0] as {modelId:string;contextWindow:number;thinkingLevels:string[]}
    assert.equal(saved.modelId,"deepseek-v4-pro");assert.equal(saved.contextWindow,22222);assert.deepEqual(saved.thinkingLevels,["high"])
  }finally{ui.finish()}
})
for(const code of ["AUTHENTICATION_FAILED","NETWORK_ERROR"] as const)test(`D06: ${code} leaves sourced builtin choices visible and can refresh`,async()=>{
  let attempts=0
  const ui=configuration({discover:async()=>{attempts++;return attempts===1?{ok:false,code,message:"目录读取失败"}:{ok:true,provider:"deepseek",kind:"TEXT",models:[{id:"deepseek-flash",name:"live",kind:"TEXT",contextWindow:77777,thinkingLevels:["high"],defaultThinking:"high",permission:"listed-unverified",source:"fixture"}],complete:true,unknownCapabilityIds:[],permission:"listed-unverified",sources:[],checkedAt:new Date().toISOString(),warnings:[]}}})
  try{
    ui.choose("供应商","deepseek");ui.choose("可用模型","deepseek-flash");ui.fill("API Key","public-network-fixture");ui.open("可用模型");await ui.settle()
    assert.ok(ui.all().some(row=>row.element.props.role==="status"&&row.name==="目录读取失败"))
    assert.equal((ui.find("可用模型").element.props.options as unknown[]).length,2)
    ui.click("刷新模型列表");await ui.settle();ui.click("保存模型");await ui.settle()
    assert.equal(attempts,2);assert.equal((ui.writes[0] as {contextWindow:number}).contextWindow,77777)
    assert.deepEqual((ui.writes[0] as {thinkingLevels:string[]}).thinkingLevels,["high"])
  }finally{ui.finish()}
})
test("MC-07: authenticated subscription enablement is revoked on Key change and cannot be saved by a retained selection",async()=>{
  const ui=configuration({discover:async()=>({ok:true,provider:"minimax",kind:"TEXT",models:[{id:"MiniMax-M3.1-Flash-Preview",name:"Preview",kind:"TEXT",available:true,permission:"listed-unverified",source:"fixture"}],complete:true,unknownCapabilityIds:[],permission:"listed-unverified",sources:[],checkedAt:new Date().toISOString(),warnings:[]})})
  try{
    ui.choose("供应商","minimax");ui.fill("API Key","public-subscribed-fixture");ui.open("可用模型");await ui.settle()
    ui.choose("可用模型","MiniMax-M3.1-Flash-Preview")
    ui.fill("API Key","public-ordinary-fixture")
    assert.equal((ui.find("可用模型").element.props.options as Array<{id:string}>).some(row=>row.id==="MiniMax-M3.1-Flash-Preview"),false)
    ui.click("保存模型");await ui.settle();assert.equal(ui.writes.length,0);assert.equal(ui.closed(),0)
  }finally{ui.finish()}
})
test("MC-09: saved retired selection is absent and cannot bypass blank-Key save validation",async()=>{
  const ui=configuration({model:sample({modelId:"chatgpt-4o-latest"})})
  try{
    assert.equal(ui.find("可用模型").element.props.value,"chatgpt-4o-latest")
    assert.equal((ui.find("可用模型").element.props.options as Array<{id:string}>).some(row=>row.id==="chatgpt-4o-latest"),false)
    ui.click("保存模型");await ui.settle();assert.equal(ui.writes.length,0);assert.equal(ui.closed(),0)
  }finally{ui.finish()}
})

const mcCatalog=(models:catalog.CatalogEntry[],extra:Partial<catalog.CatalogResult>={}):catalog.CatalogResult=>({ok:true,provider:"deepseek",kind:"TEXT",models,authoritative:true,complete:true,unknownCapabilityIds:[],permission:"listed-unverified",sources:[],checkedAt:"2026-10-15T00:00:00Z",warnings:[],...extra})
const mcEntry=(id:string):catalog.CatalogEntry=>({id,name:id,kind:"TEXT",permission:"listed-unverified",source:"https://fixture.invalid/models",contextWindow:16000})
test("MC-09/KR-04: live replacement auto-selects the next available model and saves it",async()=>{
  const ui=configuration({discover:async()=>mcCatalog([mcEntry("deepseek-v4-pro")])})
  try{
    ui.choose("可用模型","deepseek-flash");ui.fill("API Key","public-catalog-ui-fixture");ui.click("刷新模型列表");await ui.settle()
    assert.equal(ui.find("可用模型").element.props.value,"deepseek-v4-pro")
    assert.deepEqual((ui.find("可用模型").element.props.options as Array<{id:string}>).map(row=>row.id),["deepseek-v4-pro"])
    assert.ok(ui.all().some(row=>row.element.props.role==="status"&&row.name.includes("已替换为下一个可用模型")))
    ui.click("保存模型");await ui.settle();assert.equal(ui.writes.length,1);assert.equal((ui.writes[0] as {modelId:string}).modelId,"deepseek-v4-pro")
  }finally{ui.finish()}
})
test("KR-04: automatic replacement skips models already added in the same scope",async()=>{
  const existing=sample({id:"00000000-0000-4000-8000-000000000009",provider:"deepseek",endpoint:"https://api.deepseek.com",modelId:"deepseek-v4-pro"})
  const ui=configuration({models:[existing],discover:async()=>mcCatalog([mcEntry("deepseek-v4-pro"),{...mcEntry("deepseek-v5"),contextWindow:32000}])})
  try{
    ui.choose("可用模型","deepseek-flash");ui.fill("API Key","public-catalog-ui-fixture");ui.click("刷新模型列表");await ui.settle()
    assert.equal(ui.find("可用模型").element.props.value,"deepseek-v5")
    ui.click("保存模型");await ui.settle();assert.equal((ui.writes[0] as {modelId:string;contextWindow:number}).modelId,"deepseek-v5")
    assert.equal((ui.writes[0] as {modelId:string;contextWindow:number}).contextWindow,32000)
  }finally{ui.finish()}
})
test("KR-04: opening the model list triggers the same refresh-and-replace without a duplicate request",async()=>{
  const ui=configuration({discover:async()=>mcCatalog([mcEntry("deepseek-v4-pro")])})
  try{
    ui.choose("可用模型","deepseek-flash");ui.fill("API Key","public-catalog-ui-fixture");ui.open("可用模型");await ui.settle()
    assert.equal(ui.discovered.length,1)
    assert.equal(ui.find("可用模型").element.props.value,"deepseek-v4-pro")
    assert.ok(ui.all().some(row=>row.element.props.role==="status"&&row.name.includes("已替换为下一个可用模型")))
  }finally{ui.finish()}
})
test("KR-05: refresh without any available replacement clears the selection and blocks save/test",async()=>{
  const ui=configuration({discover:async()=>mcCatalog([])})
  try{
    ui.choose("可用模型","deepseek-flash");ui.fill("API Key","public-catalog-ui-fixture");ui.click("刷新模型列表");await ui.settle()
    assert.equal(ui.find("可用模型").element.props.value,"")
    assert.deepEqual(ui.find("可用模型").element.props.options,[])
    assert.ok(ui.all().some(row=>row.element.props.role==="status"&&row.name.includes("请重新选择可用模型")))
    ui.click("保存模型");ui.click("测试连接");await ui.settle();assert.equal(ui.writes.length,0);assert.equal(ui.tested.length,0)
  }finally{ui.finish()}
})
test("KR-01: typing an API Key auto-refreshes the catalog once with the latest key",async()=>{
  const ui=configuration({discover:async()=>mcCatalog([mcEntry("deepseek-v4-pro")])})
  try{
    ui.fill("API Key","public-key-a");ui.fill("API Key","public-key-ab");ui.fill("API Key","public-key-abc")
    assert.equal(ui.discovered.length,0)
    await new Promise(resolve=>setTimeout(resolve,650));await ui.settle()
    assert.equal(ui.discovered.length,1);assert.equal(ui.discovered[0].apiKey,"public-key-abc")
    assert.deepEqual((ui.find("可用模型").element.props.options as Array<{id:string}>).map(row=>row.id),["deepseek-v4-pro"])
  }finally{ui.finish()}
})
test("KR-02: custom provider, blank key, mount and reveal-on-open never auto-refresh",async()=>{
  const idle=configuration()
  try{await new Promise(resolve=>setTimeout(resolve,650));await idle.settle();assert.equal(idle.discovered.length,0)}finally{idle.finish()}
  const custom=configuration()
  try{
    custom.choose("供应商","custom");custom.fill("供应商名称","公开夹具");custom.choose("协议","openai");custom.fill("API Key","public-custom-fixture")
    await new Promise(resolve=>setTimeout(resolve,650));await custom.settle();assert.equal(custom.discovered.length,0)
  }finally{custom.finish()}
  const revealed=configuration({model:sample(),reveal:async()=>"saved-key-fixture"})
  try{
    await revealed.settle();assert.equal(revealed.find("API Key").element.props.value,"saved-key-fixture")
    await new Promise(resolve=>setTimeout(resolve,650));await revealed.settle();assert.equal(revealed.discovered.length,0)
  }finally{revealed.finish()}
})
test("KR-03: provider switch cancels a pending key auto-refresh; plain model selection does not",async()=>{
  const ui=configuration({discover:async()=>mcCatalog([mcEntry("deepseek-flash")])})
  try{
    ui.fill("API Key","public-key-fixture");ui.choose("供应商","openai")
    await new Promise(resolve=>setTimeout(resolve,650));await ui.settle();assert.equal(ui.discovered.length,0)
    ui.choose("供应商","deepseek");ui.choose("可用模型","deepseek-flash");ui.fill("API Key","public-key-fixture")
    await new Promise(resolve=>setTimeout(resolve,650));await ui.settle()
    assert.equal(ui.discovered.length,1);assert.equal(ui.discovered[0].apiKey,"public-key-fixture");assert.equal(ui.discovered[0].provider,"deepseek")
    assert.equal(ui.find("可用模型").element.props.value,"deepseek-flash")
    ui.fill("API Key","public-key-second");ui.choose("可用模型","deepseek-flash")
    await new Promise(resolve=>setTimeout(resolve,650));await ui.settle()
    assert.equal(ui.discovered.length,2);assert.equal(ui.discovered[1].apiKey,"public-key-second")
    assert.equal(ui.find("可用模型").element.props.value,"deepseek-flash")
  }finally{ui.finish()}
})
test("MC-10: pending cache hides old seeds; persisted snapshot without a Key clears missing saved model",async()=>{
  const gate=deferred<catalog.CatalogResult>(),ui=configuration({model:sample({provider:"deepseek",endpoint:"https://api.deepseek.com",modelId:"deepseek-flash"}),read:()=>gate.promise})
  try{
    assert.deepEqual(ui.find("可用模型").element.props.options,[])
    ui.click("保存模型");await ui.settle();assert.equal(ui.writes.length,0)
    gate.resolve(mcCatalog([mcEntry("deepseek-v4-pro")]));await ui.settle()
    assert.equal(ui.find("API Key").element.props.value,"");assert.equal(ui.find("可用模型").element.props.value,"")
    assert.deepEqual((ui.find("可用模型").element.props.options as Array<{id:string}>).map(m=>m.id),["deepseek-v4-pro"])
  }finally{ui.finish()}
})
test("MC-10: failed cache blocks seed fallback; failed or incomplete refresh keeps confirmed directory",async()=>{
  let attempts=0
  const ui=configuration({read:async()=>({ok:false,code:"CATALOG_READ_FAILED",message:"本地目录损坏"}),discover:async()=>++attempts===1?mcCatalog([mcEntry("deepseek-v4-pro")]):attempts===2?{ok:false,code:"AUTHENTICATION_FAILED",message:"Key被拒绝"}:mcCatalog([],{authoritative:false,complete:false})})
  try{
    await ui.settle();assert.deepEqual(ui.find("可用模型").element.props.options,[])
    ui.fill("API Key","public-catalog-ui-fixture");ui.click("刷新模型列表");await ui.settle();ui.choose("可用模型","deepseek-v4-pro")
    for(let n=0;n<2;n++){ui.click("刷新模型列表");await ui.settle();assert.deepEqual((ui.find("可用模型").element.props.options as Array<{id:string}>).map(m=>m.id),["deepseek-v4-pro"]);assert.equal(ui.find("可用模型").element.props.value,"deepseek-v4-pro")}
  }finally{ui.finish()}
})
test("MC-10: provider switch and reverse cache/refresh responses cannot restore outdated candidates",async()=>{
  const gate=deferred<catalog.CatalogResult>(),ui=configuration({read:scope=>scope.provider==="deepseek"?gate.promise:Promise.resolve(null),discover:async()=>mcCatalog([mcEntry("deepseek-v4-pro")])})
  try{
    ui.fill("API Key","public-catalog-ui-fixture");ui.click("刷新模型列表");await ui.settle()
    gate.resolve(mcCatalog([mcEntry("deepseek-flash")]));await ui.settle()
    assert.deepEqual((ui.find("可用模型").element.props.options as Array<{id:string}>).map(m=>m.id),["deepseek-v4-pro"])
    ui.choose("供应商","openai");await ui.settle();assert.ok(!(ui.find("可用模型").element.props.options as Array<{id:string}>).some(m=>m.id.startsWith("deepseek")))
  }finally{ui.finish()}
})
test("MC-10/11: Key changes preserve refreshed existence; cancel never saves drafts or Keys",async()=>{
  const ui=configuration({discover:async()=>mcCatalog([mcEntry("deepseek-v4-pro")])})
  try{
    ui.fill("API Key","public-catalog-ui-fixture");ui.click("刷新模型列表");await ui.settle();ui.fill("API Key","")
    assert.deepEqual((ui.find("可用模型").element.props.options as Array<{id:string}>).map(m=>m.id),["deepseek-v4-pro"])
    ui.click("取消");assert.equal(ui.writes.length,0)
  }finally{ui.finish()}
})
test("MC-10: mounted dialog reopen discards older live catalog while a new disk snapshot loads",async()=>{
  const reopened=deferred<catalog.CatalogResult>();let reads=0
  const ui=configuration({read:async()=>++reads===1?null:reopened.promise,discover:async()=>mcCatalog([mcEntry("deepseek-flash")])})
  try{
    await ui.settle();ui.fill("API Key","public-catalog-ui-fixture");ui.click("刷新模型列表");await ui.settle()
    ui.setProps({kind:"TEXT",open:false,onClose:()=>{}});ui.setProps({kind:"TEXT",open:true,onClose:()=>{}})
    assert.deepEqual(ui.find("可用模型").element.props.options,[])
    reopened.resolve(mcCatalog([mcEntry("deepseek-v4-pro")]));await ui.settle()
    assert.deepEqual((ui.find("可用模型").element.props.options as Array<{id:string}>).map(m=>m.id),["deepseek-v4-pro"])
  }finally{ui.finish()}
})
test("MC-11: custom provider remains manual single-model configuration",async()=>{
  const ui=configuration({read:async()=>null})
  try{
    ui.choose("供应商","custom");ui.fill("供应商名称","公开夹具");ui.choose("协议","openai");ui.fill("Base URL","https://fixture.invalid/v1");ui.fill("模型 ID","fixture-model");ui.fill("展示名称","夹具型号");ui.fill("API Key","public-catalog-ui-fixture")
    ui.click("保存模型");await ui.settle();assert.equal(ui.writes.length,1);assert.equal((ui.writes[0] as {modelId:string}).modelId,"fixture-model");assert.equal(ui.discovered.length,0)
  }finally{ui.finish()}
})

test("model configuration: failed save cancels discovery and restores a usable refresh control",async()=>{
  const discovery=deferred<catalog.CatalogResult>(),save=deferred<void>(),ui=configuration({model:sample(),discover:()=>discovery.promise,write:()=>save.promise})
  try{
    ui.click("刷新模型列表");assert.equal(ui.find("刷新模型列表").disabled,true)
    ui.click("保存模型");save.reject(new Error("磁盘写入失败"));await ui.settle()
    assert.equal(ui.canceled.length,1);assert.equal(ui.closed(),0)
    assert.equal(ui.find("刷新模型列表").disabled,false,"Cancelled discovery cannot leave an endless busy state after failed save")
    assert.notEqual(ui.find("可用模型").element.props.placeholder,"正在读取模型列表…")
  }finally{ui.finish();discovery.resolve({ok:true,provider:"openai",kind:"TEXT",models:[],complete:true,unknownCapabilityIds:[],permission:"unknown",sources:[],checkedAt:new Date().toISOString(),warnings:[]})}
})

test("model configuration: saved Key refills masked, the eye toggles plaintext, and scope edits clear it",async()=>{
  const ui=configuration({model:sample(),reveal:async()=>"saved-key-fixture"})
  try{
    await ui.settle()
    assert.equal(ui.find("API Key").element.props.value,"saved-key-fixture");assert.equal(ui.find("API Key").element.props.type,"password")
    const toggle=ui.find("显示 API Key");assert.equal(toggle.element.props["aria-pressed"],false)
    assert.match(String(toggle.element.props.className),/transition-none/,"The eye icon swaps instantly without transition animation")
    assert.match(String(toggle.element.props.className),/translate-y-0/,"The eye button skips the press-down shift")
    ui.click("显示 API Key")
    assert.equal(ui.find("API Key").element.props.type,"text");assert.equal(ui.find("API Key").element.props.value,"saved-key-fixture")
    assert.equal(ui.find("隐藏 API Key").element.props["aria-pressed"],true)
    ui.click("隐藏 API Key");assert.equal(ui.find("API Key").element.props.type,"password");assert.equal(ui.find("API Key").element.props.value,"saved-key-fixture")
    ui.fill("API Key","key-scope-fixture");ui.choose("供应商","custom")
    assert.equal(ui.find("API Key").element.props.value,"");ui.fill("供应商名称","本地服务");ui.choose("协议","openai")
    ui.fill("API Key","key-scope-fixture");ui.fill("Base URL","https://provider.invalid/v1")
    assert.equal(ui.find("API Key").element.props.value,"")
    ui.fill("API Key","new-scope-fixture");ui.choose("协议","anthropic")
    assert.equal(ui.find("API Key").element.props.value,"");assert.equal(ui.writes.length,0)
    ui.click("取消");assert.equal(ui.closed(),1);assert.equal(ui.writes.length,0)
  }finally{ui.finish()}
})

test("model configuration: an untouched refilled Key keeps the stored credential for save and test",async()=>{
  const ui=configuration({model:sample(),reveal:async()=>"saved-key-fixture",test:async()=>({ok:true,modelId:"gpt-6.1-sol",kind:"TEXT",verifiedAt:new Date().toISOString(),durationMs:100,scope:"single-model"})})
  try{
    await ui.settle();assert.equal(ui.find("API Key").element.props.value,"saved-key-fixture")
    ui.click("测试连接");await ui.settle()
    assert.equal(ui.tested.length,1);assert.equal(ui.tested[0].apiKey,"","An unchanged refill falls back to the stored credential instead of resubmitting it")
    ui.click("返回配置")
    ui.fill("API Key","");ui.fill("API Key","saved-key-fixture")
    ui.click("保存模型");await ui.settle()
    assert.equal(ui.writes.length,1);assert.equal((ui.writes[0] as {apiKey:string}).apiKey,"","A value identical to the revealed Key counts as unmodified");assert.equal(ui.closed(),1)
  }finally{ui.finish()}
})

test("model configuration: editing a refilled Key submits only the replacement",async()=>{
  const ui=configuration({model:sample(),reveal:async()=>"saved-key-fixture"})
  try{
    await ui.settle();ui.fill("API Key","replacement-key-fixture")
    ui.click("保存模型");await ui.settle()
    assert.equal(ui.writes.length,1);assert.equal((ui.writes[0] as {apiKey:string}).apiKey,"replacement-key-fixture");assert.equal(ui.closed(),1)
  }finally{ui.finish()}
})
test("RELAY-04: explicitly retyping the revealed Key after an endpoint edit submits it for test and save",async()=>{
  const retained=sample({provider:"custom",providerName:"夹具中转",endpoint:"https://relay.fixture.invalid/",thinkingLevels:[],defaultThinking:"default"})
  const ui=configuration({model:retained,reveal:async()=>"saved-key-fixture",test:async()=>({ok:true,modelId:retained.modelId,kind:"TEXT",verifiedAt:new Date().toISOString(),durationMs:1,scope:"single-model"})})
  try{
    await ui.settle()
    ui.fill("Base URL","https://relay.fixture.invalid/v1")
    assert.equal(ui.find("API Key").element.props.value,"")
    ui.click("测试连接");await ui.settle()
    assert.equal(ui.tested.length,0,"An edited scope cannot silently reuse the saved credential")
    assert.ok(ui.all().some(surface=>surface.element.props.role==="alert"&&surface.name==="请输入 API Key"))
    ui.fill("API Key","saved-key-fixture")
    ui.click("测试连接");await ui.settle()
    assert.equal(ui.tested.length,1);assert.equal(ui.tested[0].apiKey,"saved-key-fixture")
    assert.equal(ui.tested[0].endpoint,"https://relay.fixture.invalid/v1")
    ui.click("返回配置");ui.click("保存模型");await ui.settle()
    assert.equal(ui.writes.length,1);assert.equal((ui.writes[0] as {apiKey:string}).apiKey,"saved-key-fixture")
    assert.equal(ui.closed(),1)
  }finally{ui.finish()}
})
test("WIRE-02: new custom text configurations default Chat and keep explicit choices in test/save drafts",async()=>{
  const ui=configuration({test:async()=>({ok:true,modelId:"gpt-6.1-sol",kind:"TEXT",verifiedAt:new Date().toISOString(),durationMs:1,scope:"single-model"})})
  try{
    ui.choose("供应商","custom");ui.fill("供应商名称","夹具中转");ui.choose("协议","openai")
    assert.equal(ui.find("OpenAI 接口").element.props.value,"chat")
    ui.fill("展示名称","夹具");ui.fill("模型 ID","gpt-6.1-sol");ui.fill("Base URL","https://relay.fixture.invalid/");ui.fill("API Key","wire-public-fixture")
    ui.choose("OpenAI 接口","responses")
    assert.equal(ui.find("API Key").element.props.value,"wire-public-fixture");assert.equal(ui.writes.length,0)
    ui.click("测试连接");await ui.settle()
    assert.equal((ui.tested[0] as catalog.ConfigurationDraft & {wire:string}).wire,"responses")
    ui.click("返回配置");ui.click("保存模型");await ui.settle()
    assert.equal((ui.writes[0] as {wire:string}).wire,"responses")
  }finally{ui.finish()}
})
test("WIRE-02: saved legacy custom text shows auto; changing only wire preserves the saved Key and cancel",async()=>{
  const retained=sample({provider:"custom",providerName:"夹具中转",endpoint:"https://relay.fixture.invalid/",thinkingLevels:[],defaultThinking:"default"})
  const ui=configuration({model:retained,reveal:async()=>"wire-saved-fixture",test:async()=>({ok:true,modelId:retained.modelId,kind:"TEXT",verifiedAt:new Date().toISOString(),durationMs:1,scope:"single-model"})})
  try{
    await ui.settle();assert.equal(ui.find("OpenAI 接口").element.props.value,"auto")
    ui.choose("OpenAI 接口","chat");assert.equal(ui.find("API Key").element.props.value,"wire-saved-fixture")
    ui.click("测试连接");await ui.settle()
    assert.equal((ui.tested[0] as catalog.ConfigurationDraft & {wire:string}).wire,"chat");assert.equal(ui.tested[0].apiKey,"")
    ui.click("返回配置");ui.click("取消");assert.equal(ui.writes.length,0);assert.equal(ui.closed(),1)
  }finally{ui.finish()}
})
test("WIRE-02: official, Anthropic and image configurations do not show an OpenAI API selector",async()=>{
  for(const model of [sample(),sample({provider:"custom",protocol:"anthropic"}),sample({provider:"custom",kind:"IMAGE"})]){
    const ui=configuration({model,kind:model.kind})
    try{assert.equal(ui.query("OpenAI 接口"),undefined)}finally{ui.finish()}
  }
})

test("model configuration: failed reveal keeps the field empty and masked with keep-on-blank semantics",async()=>{
  const ui=configuration({model:sample(),reveal:async()=>{throw new Error("系统密钥解密失败，请重新配置此模型")}})
  try{
    await ui.settle()
    assert.equal(ui.find("API Key").element.props.value,"");assert.equal(ui.find("API Key").element.props.type,"password")
    assert.equal(ui.find("API Key").element.props.placeholder,"已配置，留空保留原密钥")
    ui.click("保存模型");await ui.settle()
    assert.equal(ui.writes.length,1);assert.equal((ui.writes[0] as {apiKey:string}).apiKey,"");assert.equal(ui.closed(),1)
  }finally{ui.finish()}
})

test("model configuration: a late reveal never overwrites typed input or a changed scope",async()=>{
  const gate=deferred<string>(),ui=configuration({model:sample(),reveal:()=>gate.promise})
  try{
    ui.fill("API Key","typed-first-fixture")
    gate.resolve("saved-key-fixture");await ui.settle()
    assert.equal(ui.find("API Key").element.props.value,"typed-first-fixture")
  }finally{ui.finish()}
  const scopeGate=deferred<string>(),scoped=configuration({model:sample(),reveal:()=>scopeGate.promise})
  try{
    scoped.choose("供应商","custom")
    scopeGate.resolve("saved-key-fixture");await scoped.settle()
    assert.equal(scoped.find("API Key").element.props.value,"","A Key revealed for the old scope must not land on a changed scope")
  }finally{scoped.finish()}
})

test("model configuration: a direct test freezes fields, rejects repeats, cancels and ignores late replies",async()=>{
  const response=deferred<catalog.ConnectionTestResult>(),ui=configuration({model:sample(),test:()=>response.promise})
  try{
    ui.fill("API Key","key-test-fixture");ui.click("测试连接")
    assert.equal(ui.tested.length,1);assert.equal(ui.find("测试中…").disabled,true);assert.equal(ui.find("测试中…").element.props["aria-busy"],true)
    for(const label of ["供应商","API Key","可用模型","保存模型"])assert.equal(ui.find(label).disabled,true,label)
    ui.click("测试中…");assert.equal(ui.tested.length,1);assert.equal(ui.find("取消").disabled,false)
    ui.click("取消");assert.equal(ui.closed(),1);assert.equal(ui.canceled.length,1)
    response.resolve({ok:true,modelId:"gpt-6.1-sol",kind:"TEXT",verifiedAt:new Date().toISOString(),durationMs:100,scope:"single-model"});await ui.settle()
    assert.equal(ui.dialog("连接测试结果"),undefined);assert.equal(ui.writes.length,0)
  }finally{ui.finish()}
})

test("model configuration: result identifies the tested model and endpoint and returns the unchanged Key draft",async()=>{
  const ui=configuration({model:sample(),test:async()=>({ok:true,modelId:"gpt-6.1-sol",kind:"TEXT",verifiedAt:new Date().toISOString(),durationMs:100,scope:"single-model"})})
  try{
    ui.fill("API Key","key-result-fixture");ui.click("测试连接");await ui.settle()
    const result=ui.dialog("连接测试结果")!;assert.ok(result)
    assert.match(result.name,/gpt-6.1-sol/);assert.match(result.name,/https:\/\/api\.openai\.com\/v1/);assert.doesNotMatch(result.name,/key-result-fixture/)
    ui.click("返回配置");assert.equal(ui.dialog("连接测试结果"),undefined);assert.equal(ui.find("API Key").element.props.value,"key-result-fixture");assert.equal(ui.writes.length,0)
  }finally{ui.finish()}
})

test("model configuration: approved close button remains present beside cancel",()=>{
  for(const action of ["关闭配置模型","取消"]){
    const ui=configuration({model:sample()})
    try{
      assert.ok(ui.dialog("配置模型"))
      assert.equal(ui.find("关闭配置模型").disabled,false);assert.equal(ui.find("取消").disabled,false)
      ui.click(action);assert.equal(ui.closed(),1);assert.equal(ui.writes.length,0)
    }finally{ui.finish()}
  }
})

test("model picker: single selection, search and disabled choices preserve the controlled value and show unavailability",()=>{
  const changes:string[]=[],options=[{id:"a",label:"模型A",provider:"openai"},{id:"b",label:"模型B",provider:"openai",disabled:true,disabledLabel:"已停用"}]
  const ui=component("ModelChoiceSelect","ModelChoiceSelect",{label:"默认模型",value:"b",options,onChange:(id:string)=>changes.push(id)})
  try{
    const root=ui.all().find(surface=>surface.element.type==="Root")!
    assert.equal(root.element.props.multiple,false)
    const select=root.element.props.onValueChange as(value:unknown)=>void
    select(options[1]);assert.deepEqual(changes,[]);select(options[0]);assert.deepEqual(changes,["a"])
    const filter=root.element.props.filter as(option:unknown,query:string)=>boolean
    assert.equal(filter(options[0],"missing"),false);assert.equal((root.element.props.value as {id:string}).id,"b")
    const trigger=ui.all().find(surface=>surface.element.type==="Trigger")!
    assert.match(text(trigger.element.props.children),/已停用|不可用|失效/,"A retained disabled default must visibly identify unavailability before opening its menu")
  }finally{ui.finish()}
})

test("agent settings: disabled defaults stay explicit and cannot offer active thinking levels",()=>{
  const inactive=sample({enabled:false}),image=sample({id:"00000000-0000-4000-8000-000000000002",kind:"IMAGE",modelId:"image-fixture"})
  const settings=structuredClone(defaultState.settings);settings.agent.textModelId=inactive.id;settings.agent.thinking="high"
  const state={settings,models:[inactive,image]},writes:unknown[]=[]
  const ui=component("AgentSettings","AgentSettings",{}, {"@/stores/desktop":{useDesktopStore:(select:(state:unknown)=>unknown)=>select({bootstrap:state}),updateDesktopSettings:async(update:(before:typeof settings)=>unknown)=>{writes.push(update(structuredClone(settings)))}},"sonner":{toast:{error(){}}}})
  try{
    const textOptions=ui.find("默认模型").element.props.options as Array<{id:string;disabled?:boolean}>,imageOptions=ui.find("默认文生图模型").element.props.options as Array<{id:string}>
    assert.equal(textOptions.find(option=>option.id===inactive.id)?.disabled,true);assert.ok(!textOptions.some(option=>option.id===image.id));assert.ok(!imageOptions.some(option=>option.id===inactive.id))
    assert.equal(ui.find("默认模型").element.props.value,inactive.id);assert.equal(ui.find("默认思考强度").disabled,true)
    assert.equal(writes.length,0);assert.equal(state.settings.agent.textModelId,inactive.id)
  }finally{ui.finish()}
})

test("IP-06: retained current choice is displayed without joining menu items; matching menu choice wins",()=>{
  const options=[{id:"openai",label:"OpenAI"}],legacy={id:"google",label:"Google",provider:"google"}
  for(const [value,fallback,expected] of [["google",legacy,legacy],["openai",{id:"openai",label:"wrong"},options[0]],["missing",legacy,null]] as const){
    const ui=component("ModelChoiceSelect","ModelChoiceSelect",{label:"供应商",value,options,selectedOption:fallback,onChange(){}})
    try{
      const root=ui.all().find(surface=>surface.element.type==="Root")!
      assert.deepEqual(root.element.props.items,options)
      assert.deepEqual(root.element.props.value,expected)
      assert.equal(root.element.props.multiple,false)
    }finally{ui.finish()}
  }
})

test("model configuration: catalog choices replace one draft, disable duplicates and retain a failed save for retry",async()=>{
  let fail=true
  const existing=sample({id:"00000000-0000-4000-8000-000000000002",modelId:"gpt-duplicate"})
  const ui=configuration({models:[existing],write:async()=>{if(fail)throw new Error("模型保存失败")},discover:async()=>({ok:true,provider:"openai",kind:"TEXT",models:["gpt-first","gpt-second","gpt-duplicate"].map(id=>({id,name:id,kind:"TEXT",contextWindow:128000,thinkingLevels:["high"],defaultThinking:"high",permission:"listed-unverified",source:"catalog-fixture"})),authoritative:true,complete:false,unknownCapabilityIds:["gpt-unknown-capability"],permission:"listed-unverified",sources:["catalog-fixture"],checkedAt:new Date().toISOString(),warnings:["目录含输出能力待确认型号，未按名称猜测分类"]})})
  try{
    ui.choose("供应商","openai")
    ui.fill("API Key","key-catalog-fixture");ui.open("可用模型");await ui.settle()
    const choices=ui.find("可用模型").element.props.options as Array<{id:string;disabled:boolean}>
    assert.deepEqual(choices.map(option=>option.id),["gpt-first","gpt-second","gpt-duplicate"])
    assert.equal(choices.find(option=>option.id==="gpt-duplicate")?.disabled,true)
    ui.choose("可用模型","gpt-duplicate");assert.equal(ui.find("可用模型").element.props.value,"")
    ui.choose("可用模型","gpt-first");ui.choose("可用模型","gpt-second")
    assert.equal(ui.find("可用模型").element.props.value,"gpt-second");assert.equal(ui.writes.length,0)
    assert.ok(ui.all().some(surface=>surface.element.props.role==="status"&&surface.name.includes("目录已更新；部分型号能力尚未确认")))
    ui.click("保存模型");await ui.settle()
    assert.equal(ui.closed(),0);assert.equal(ui.find("API Key").element.props.value,"key-catalog-fixture");assert.equal(ui.find("可用模型").element.props.value,"gpt-second")
    assert.ok(ui.all().some(surface=>surface.element.props.role==="alert"&&surface.name==="模型保存失败"))
    fail=false;ui.click("保存模型");await ui.settle()
    assert.equal(ui.closed(),1);assert.equal(ui.writes.length,2)
    const draft=ui.writes[1] as {modelId:string;contextWindow:number;apiKey:string}
    assert.equal(draft.modelId,"gpt-second");assert.equal(draft.contextWindow,128000);assert.equal(draft.apiKey,"key-catalog-fixture")
    assert.deepEqual(ui.writes[1],{name:"gpt-second",provider:"openai",providerName:"",protocol:"openai",endpoint:"https://api.openai.com/v1",modelId:"gpt-second",kind:"TEXT",contextWindow:128000,enabled:true,thinkingLevels:["high"],defaultThinking:"high",apiKey:"key-catalog-fixture"})
    assert.deepEqual(ui.writes[0],ui.writes[1])
  }finally{ui.finish()}
  const image=configuration({kind:"IMAGE"})
  try{
    const ids=(image.find("供应商").element.props.options as Array<{id:string}>).map(option=>option.id)
    assert.deepEqual(ids,["bytedance","openai"]);assert.ok(!ids.includes("anthropic")&&!ids.includes("deepseek")&&!ids.includes("moonshot"))
  }finally{image.finish()}
})

test("MC-05/B01/B21: builtin defaults hide protocol/address and do not enable unavailable subscription choices",async()=>{
  const ui=configuration({discover:async()=>({ok:true,provider:"minimax",kind:"TEXT",models:[{id:"MiniMax-M3.1-Flash-Preview",name:"Preview",kind:"TEXT",permission:"unknown",source:"official",available:false,notes:["仅订阅可用"]}],complete:false,unknownCapabilityIds:[],permission:"listed-unverified",sources:["official"],checkedAt:new Date().toISOString(),warnings:["仅订阅可用"]})})
  try {
    ui.choose("供应商","minimax"); assert.equal(ui.query("协议"),undefined); assert.equal(ui.query("Base URL"),undefined)
    ui.fill("API Key","public-fixture");ui.open("可用模型");await ui.settle()
    const options=ui.find("可用模型").element.props.options as Array<{id:string;disabled:boolean;hint:string}>
    assert.equal(options.some(option=>option.id==="MiniMax-M3.1-Flash-Preview"),false)
    assert.equal(ui.find("可用模型").element.props.value,"")
    assert.ok(ui.all().some(s=>s.element.props.role==="status"&&s.name.includes("已保留原目录")))
    assert.equal(ui.writes.length,0)
  } finally {ui.finish()}
})

test("desktop state: model/settings/removal share a latest-revision queue and model drafts are copied before dispatch",async()=>{
  const savedWindow=Object.getOwnPropertyDescriptor(globalThis,"window"),savedStore=useDesktopStore.getState()
  const first=deferred<void>(),requests:SettingsAction[]=[]
  let actual:StateSnapshot={revision:7,settings:structuredClone(defaultState.settings),models:[]}
  Object.defineProperty(globalThis,"window",{configurable:true,writable:true,value:{desktop:{
    async settings(action:SettingsAction){
      requests.push(structuredClone(action))
      assert.equal(action.revision,actual.revision,"Every queued action uses the preceding confirmed revision")
      if(action.type==="save-model"){await first.promise;actual={...actual,models:[sample({name:action.model.name})]}}
      else if(action.type==="update")actual={...actual,settings:action.settings}
      else if(action.type==="remove-model")actual={...actual,models:actual.models.filter(model=>model.id!==action.id)}
      else throw new Error("Unexpected action in the model queue fixture")
      actual={...actual,revision:actual.revision+1};return structuredClone(actual)
    },async bootstrap(){return structuredClone(actual)},
  }}})
  useDesktopStore.setState({bootstrap:{...actual,platform:"darwin"} as Bootstrap,saving:0,error:null})
  try{
    const {id:_id,authRevision:_revision,keyMask:_mask,...fields}=sample(),draft={...fields,name:"模型草稿",apiKey:"key-original-fixture"}
    const model=saveDesktopModel(draft);draft.name="后来编辑";draft.apiKey="key-later-fixture"
    const preference=updateDesktopSettings(before=>({...before,appearance:{...before.appearance,uiFontSize:18}}))
    const removal=removeDesktopModel(sample().id)
    for(let n=0;n<6;n++)await Promise.resolve()
    assert.equal(requests.length,1);assert.equal(useDesktopStore.getState().bootstrap?.models.length,0,"An unacknowledged model must not become globally selectable")
    assert.equal(useDesktopStore.getState().saving,3)
    first.resolve();await Promise.all([model,preference,removal])
    assert.deepEqual(requests.map(request=>[request.type,request.revision]),[["save-model",7],["update",8],["remove-model",9]])
    const sent=requests[0] as Extract<SettingsAction,{type:"save-model"}>
    assert.equal(sent.model.name,"模型草稿");assert.equal(sent.model.apiKey,"key-original-fixture")
    assert.equal(useDesktopStore.getState().bootstrap?.settings.appearance.uiFontSize,18);assert.deepEqual(useDesktopStore.getState().bootstrap?.models,[])
    assert.equal(useDesktopStore.getState().saving,0);assert.equal(useDesktopStore.getState().error,null)
  }finally{useDesktopStore.setState(savedStore);if(savedWindow)Object.defineProperty(globalThis,"window",savedWindow);else Reflect.deleteProperty(globalThis,"window")}
})

test("model picker: keyboard Space selects one highlighted option and busy close never reopens on completion",()=>{
  const changes:string[]=[],options=[{id:"a",label:"模型A",provider:"openai"},{id:"b",label:"模型B",provider:"openai"}],props={label:"可用模型",value:"a",options,onChange:(id:string)=>changes.push(id)}
  const ui=component("ModelChoiceSelect","ModelChoiceSelect",props)
  const root=()=>ui.all().find(surface=>surface.element.type==="Root")!
  try{
    const open=root().element.props.onOpenChange as(open:boolean)=>void
    open(true);ui.render();assert.equal(root().element.props.open,true)
    const highlight=root().element.props.onItemHighlighted as(option:unknown,details:{reason:string})=>void
    highlight(options[1],{reason:"keyboard"})
    let prevented=false
    ;(ui.find("搜索可用模型").element.props.onKeyDown as(event:unknown)=>void)({key:" ",nativeEvent:{isComposing:false},preventDefault(){prevented=true}})
    ui.render();assert.equal(prevented,true);assert.deepEqual(changes,["b"]);assert.equal(root().element.props.open,false)
    open(true);ui.render();ui.setProps({...props,disabled:true});assert.equal(root().element.props.open,false)
    ui.setProps({...props,disabled:false});assert.equal(root().element.props.open,false,"Restoring the test controls must not reopen the pre-test popup")
  }finally{ui.finish()}
})

test("settings outside dismissal: pointer cancellation or window blur cannot consume the next unrelated click",()=>{
  const savedDocument=Object.getOwnPropertyDescriptor(globalThis,"document")
  const savedWindow=Object.getOwnPropertyDescriptor(globalThis,"window")
  type EventRecord={target:unknown;clientX:number;clientY:number;prevented:boolean;stopped:boolean;preventDefault():void;stopImmediatePropagation():void}
  function eventTarget(){
    const listeners=new Map<string,Array<{listener:(event:EventRecord)=>void;once:boolean}>>()
    const target={
      addEventListener(type:string,listener:(event:EventRecord)=>void,options?:boolean|{once?:boolean}){const list=listeners.get(type)??[];list.push({listener,once:typeof options==="object"&&!!options.once});listeners.set(type,list)},
      removeEventListener(type:string,listener:(event:EventRecord)=>void){listeners.set(type,(listeners.get(type)??[]).filter(item=>item.listener!==listener))},
    }
    return {...target,dispatch(type:string,eventTarget:unknown,clientX=10,clientY=10){const event:EventRecord={target:eventTarget,clientX,clientY,prevented:false,stopped:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};for(const item of [...listeners.get(type)??[]]){if(item.once)target.removeEventListener(type,item.listener);item.listener(event);if(event.stopped)break}return event}}
  }
  const body={tagName:"BODY"},settingsSurface={getBoundingClientRect:()=>({left:100,top:100,right:400,bottom:500,width:300,height:400})}
  const document={...eventTarget(),body,querySelectorAll(){return [settingsSurface]}},window=eventTarget()
  Object.defineProperty(globalThis,"document",{configurable:true,writable:true,value:document})
  Object.defineProperty(globalThis,"window",{configurable:true,writable:true,value:window})
  const bootstrap={settings:structuredClone(defaultState.settings),models:[],dataRoot:"/isolated/settings",platform:"darwin"}
  let closed=0,ui!:ReturnType<typeof component>
  const props={open:true,onOpenChange:(open:boolean)=>{if(!open){closed++;ui.setProps({...props,open:false})}}}
  ui=component("SettingsDialog","SettingsDialog",props,{
    "@/stores/desktop":{useDesktopStore:(select:(state:unknown)=>unknown)=>select({bootstrap,saving:0,error:null}),updateDesktopSettings:async()=>{}},
    "@/components/ui/switch":{Switch:"Switch"},"sonner":{toast:{error(){}}},
    "./ShortcutSettings":{ShortcutSettings:"ShortcutSettings"},"./AppearanceNumber":{AppearanceNumber:"AppearanceNumber"},
    "./ModelSettings":{ModelSettings:"ModelSettings"},"./AgentSettings":{AgentSettings:"AgentSettings"},
    "./ProfileSettings":{ProfileSettings:"ProfileSettings"},
    "./ProjectStarPrompt":{ProjectStarPrompt:"ProjectStarPrompt"},
    "./ConfigurationTransfer":{ConfigurationImportButton:"ConfigurationImportButton",ConfigurationExportButton:"ConfigurationExportButton"},
    "./DataRootMigrationButton":{DataRootMigrationButton:"DataRootMigrationButton"},
    "@/lib/desktop/appearance":{localFontFamilies:async()=>[]},
  })
  try{
    for(const reason of ["pointercancel","blur"]){
      ui.setProps(props)
      const before=closed,inside=document.dispatch("pointerdown",settingsSurface,150,150)
      assert.equal(inside.prevented,false);assert.equal(inside.stopped,false);assert.equal(closed,before,"A pointer inside the current dialog must not dismiss it")
      const outside=document.dispatch("pointerdown",document.body)
      assert.equal(outside.prevented,true);assert.equal(outside.stopped,true)
      if(reason==="blur")window.dispatch(reason,window);else document.dispatch(reason,document.body)
      const next=document.dispatch("click",document.body)
      assert.equal(next.prevented,false,`${reason} must clean up its original click-through guard`);assert.equal(next.stopped,false)
    }
    assert.equal(closed,2)
  }finally{ui.finish();if(savedDocument)Object.defineProperty(globalThis,"document",savedDocument);else Reflect.deleteProperty(globalThis,"document");if(savedWindow)Object.defineProperty(globalThis,"window",savedWindow);else Reflect.deleteProperty(globalThis,"window")}
})

test("model picker: Escape dismisses only an open menu and restores its trigger focus",()=>{
  const changes:string[]=[],options=[{id:"a",label:"模型A",provider:"openai"}]
  const ui=component("ModelChoiceSelect","ModelChoiceSelect",{label:"供应商",value:"a",options,onChange:(id:string)=>changes.push(id)})
  const root=()=>ui.all().find(surface=>surface.element.type==="Root")!
  function press(type:"Popup"|"Trigger",composing=false){
    const target=ui.all().find(surface=>surface.element.type===type)!,event={key:"Escape",nativeEvent:{isComposing:composing},prevented:false,stopped:false,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}}
    ;(target.element.props.onKeyDownCapture as(event:unknown)=>void)(event);ui.render();return event
  }
  try{
    const open=()=>{(root().element.props.onOpenChange as(open:boolean)=>void)(true);ui.render()}
    open();assert.equal(press("Popup",true).stopped,false);assert.equal(root().element.props.open,true)
    const escape=press("Popup");assert.equal(escape.prevented,true);assert.equal(escape.stopped,true);assert.equal(root().element.props.open,false);assert.equal(ui.focused(),"供应商")
    assert.equal(press("Trigger").stopped,false,"A closed picker lets Escape reach its owning configuration dialog")
    open();assert.equal(press("Trigger").stopped,true);assert.equal(root().element.props.open,false);assert.deepEqual(changes,[])
  }finally{ui.finish()}
})

test("agent settings: a failed default change retains the pending choice and offers explicit retry",async()=>{
  const a=sample(),b=sample({id:"00000000-0000-4000-8000-000000000002",name:"模型B",modelId:"gpt-b"}),settings=structuredClone(defaultState.settings)
  settings.agent.textModelId=a.id
  const state={settings,models:[a,b]},writes:typeof settings[]=[],failure=deferred<void>()
  let attempts=0
  const ui=component("AgentSettings","AgentSettings",{}, {
    "@/stores/desktop":{useDesktopStore:(select:(state:unknown)=>unknown)=>select({bootstrap:state}),updateDesktopSettings:async(update:(before:typeof settings)=>typeof settings)=>{
      const next=update(structuredClone(state.settings));writes.push(next)
      if(attempts++===0)await failure.promise
      state.settings=next
    }},"sonner":{toast:{error(){}}},
  })
  try{
    ui.choose("默认模型",b.id);failure.reject(new Error("默认配置保存失败"));await ui.settle()
    assert.equal(state.settings.agent.textModelId,a.id,"The previous confirmed default remains active after failed persistence")
    assert.equal(ui.find("默认模型").element.props.value,b.id,"The author's failed default choice must remain as a pending draft")
    const retry=ui.all().find(surface=>["Button","button"].includes(String(surface.element.type))&&/重试/.test(surface.name))
    assert.ok(retry,"Pending defaults need an explicit retry action")
    state.models=[a,{...b,enabled:false}];ui.render();ui.click(retry.name);await ui.settle()
    assert.equal(state.settings.agent.textModelId,a.id);assert.equal(writes.length,1,"Retry revalidates a default which became unavailable before dispatch")
    assert.ok(ui.all().some(surface=>surface.element.props.role==="alert"&&/不可用/.test(surface.name)))
    state.models=[a,b];ui.render()
    ui.click(retry.name);await ui.settle()
    assert.equal(state.settings.agent.textModelId,b.id);assert.equal(writes.length,2)
  }finally{ui.finish()}
})

test("model management: disabling requires confirmation and cancelling cannot revoke the saved model",async()=>{
  const model=sample(),state={models:[model]},writes:PublicModel[]=[]
  const ui=component("ModelSettings","ModelSettings",{}, {
    "@/stores/desktop":{useDesktopStore:(select:(state:unknown)=>unknown)=>select({bootstrap:state}),saveDesktopModel:async(value:PublicModel)=>{writes.push(structuredClone(value));state.models=[{...model,enabled:value.enabled}]},removeDesktopModel:async()=>{}},
    "./ModelConfigurationDialog":{ModelConfigurationDialog:"ModelConfigurationDialog"},"sonner":{toast:{error(){}}},
  })
  try{
    ui.click(`停用模型 ${model.name}`)
    assert.equal(writes.length,0,"The first disable action opens confirmation before changing authorization")
    assert.ok(ui.all().some(surface=>surface.element.type==="DialogTitle"&&/停用/.test(surface.name)))
    ui.click("取消");assert.equal(writes.length,0);assert.equal(state.models[0].enabled,true)
    ui.click(`停用模型 ${model.name}`)
    const confirm=ui.all().find(surface=>["Button","button"].includes(String(surface.element.type))&&/停用/.test(surface.name)&&surface.name!==`停用模型 ${model.name}`)
    assert.ok(confirm,"A visible confirm action explicitly disables this model")
    ui.click(confirm.name);await ui.settle();assert.equal(writes.length,1);assert.equal(state.models[0].enabled,false)
    ui.click(`启用模型 ${model.name}`);await ui.settle();assert.equal(writes.length,2);assert.equal(state.models[0].enabled,true)
  }finally{ui.finish()}
})
