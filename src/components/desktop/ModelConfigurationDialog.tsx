"use client"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, RefreshCw, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { saveDesktopModel, useDesktopStore } from "@/stores/desktop"
import { onboardingDialogGuard } from "@/lib/desktop/onboarding-flow"
import { parseContextWindow, type PublicModel } from "@desktop/core/settings"
import type { ModelDraft } from "@desktop/main/model-repository"
import { PROVIDER_PRESETS, presetsFor, type ConfigurationDraft, type ConfigurationProviderId, type CatalogResult, type ConnectionTestResult, type ConfigurationFailure } from "@desktop/shared/model-catalog"
import { ModelChoiceSelect } from "./ModelChoiceSelect"
import { modelChoices, excludedBuiltinModel, offlineCatalog } from "@desktop/shared/builtin-model-catalog"

type Draft = Omit<ModelDraft,"protocol"> & { protocol: ModelDraft["protocol"] | "" }
function Field({ title, children }: { title: string; children: ReactNode }) { return <div className="desktop-model-field"><div className="mb-2 text-sm">{title}</div>{children}</div> }
export interface ModelOnboardingCallbacks {
  onSubmit(draft: ModelDraft): Promise<unknown>
  onSelectExisting(id: string): Promise<unknown>
  onBack?(): void
  onSkip?(): void
  onDraftChanged?(): void
  onRetry?(): Promise<unknown>
  blocked?: boolean
  confirmationPending?: boolean
}
export interface ModelConfigurationDialogProps { kind: "TEXT" | "IMAGE"; model?: PublicModel; onClose(): void; finalFocus?: () => HTMLElement | null; open?: boolean; onboarding?: ModelOnboardingCallbacks }
export function ModelConfigurationDialog({ kind, model, onClose, finalFocus, open = true, onboarding }: ModelConfigurationDialogProps) {
  const models = useDesktopStore(state => state.bootstrap!.models)
  const initial = presetsFor(kind)[0]
  const [draft,setDraft] = useState<Draft>(() => { if (model) { const { authRevision: _authorization, keyMask: _mask, ...fields } = model; return { ...fields, apiKey: "" } }; return { name:"",provider:initial.id,protocol:initial.protocol!,endpoint:(kind === "TEXT" ? initial.textEndpoint : initial.imageEndpoint)!,modelId:"",kind,contextWindow:0,enabled:true,thinkingLevels:[],defaultThinking:"default",apiKey:"" } })
  const [useExisting,setUseExisting] = useState(false), [existingId,setExistingId] = useState<string | null>(null)
  const [context,setContext] = useState(model?.contextWindow ? String(model.contextWindow) : "")
  const [catalog,setCatalog] = useState<CatalogResult | null>(null)
  const [cached,setCached] = useState<{ scope: string; value: CatalogResult | null; failed?: boolean } | null>(null)
  const [cacheChecking,setCacheChecking] = useState(false)
  const catalogRead = useRef(0)
  const [catalogError,setCatalogError] = useState("")
  const [busy,setBusy] = useState<"" | "test" | "save">("")
  const [discovering,setDiscovering] = useState(false)
  const [error,setError] = useState("")
  const [result,setResult] = useState<ConnectionTestResult | ConfigurationFailure | null>(null)
  const [tested,setTested] = useState<{ provider:string; endpoint:string; modelId:string } | null>(null)
  const [showKey,setShowKey] = useState(false)
  const [keyRefresh,setKeyRefresh] = useState(0)
  const operation = useRef<string | null>(null), discovery = useRef<string | null>(null), alive = useRef(true), locking = useRef(false), visible = useRef(open), blocked = useRef(!!onboarding?.blocked)
  const revealedKey = useRef<string | null>(null)
  const autoRefresh = useRef<ReturnType<typeof setTimeout> | null>(null), confirming = useRef(!!onboarding?.confirmationPending)
  visible.current = open; blocked.current = !!onboarding?.blocked; confirming.current = !!onboarding?.confirmationPending
  const testButton = useRef<HTMLButtonElement>(null)
  const custom = draft.provider === "custom"
  const scopeMatches = !!model && model.provider === draft.provider && model.protocol === draft.protocol && model.endpoint === draft.endpoint && model.kind === draft.kind
  const hasKey = !!draft.apiKey.trim() || scopeMatches
  const directoryScope = JSON.stringify([draft.provider,kind,draft.protocol,draft.endpoint])
  const canReadCatalog = typeof window !== "undefined" && !!window.desktop?.readModelCatalog
  const loadingCatalog = !custom && canReadCatalog && (cacheChecking || cached?.scope !== directoryScope)
  const cacheFailed = cached?.scope === directoryScope && !!cached.failed
  function cancelRequests() {
    for (const ref of [operation,discovery]) { const id = ref.current; ref.current = null; if (id) void window.desktop?.cancelModelConfiguration(id).catch(() => {}) }
  }
  function cancelAutoRefresh() { if (autoRefresh.current !== null) { clearTimeout(autoRefresh.current); autoRefresh.current = null } }
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelRequests(); cancelAutoRefresh() } }, [])
  useEffect(() => {
    const id = model?.id
    const reveal = typeof window === "undefined" ? undefined : window.desktop?.revealModelKey
    if (!open || !id || !reveal) return
    let current = true
    void reveal(id).then(key => {
      if (!current || !alive.current || !visible.current) return
      setDraft(before => {
        if (before.id !== id || before.apiKey || before.provider !== model.provider || before.protocol !== model.protocol || before.endpoint !== model.endpoint || before.kind !== model.kind) return before
        revealedKey.current = key
        return { ...before, apiKey: key }
      })
    }).catch(() => {})
    return () => { current = false }
  }, [open, model])
  useEffect(() => {
    if (open) return
    cancelRequests(); cancelAutoRefresh(); setDiscovering(false); setResult(null); setCatalog(null); setCacheChecking(true)
    if (busy === "test") setBusy("")
  }, [open])
  useEffect(() => {
    const generation = ++catalogRead.current
    const readCatalog = typeof window === "undefined" ? undefined : window.desktop?.readModelCatalog
    if (!open || custom || !draft.protocol || !readCatalog) return
    setCatalog(null); setCacheChecking(true)
    let current = true
    const scope = directoryScope
    void readCatalog({provider:draft.provider as ConfigurationProviderId,kind,protocol:draft.protocol,endpoint:draft.endpoint}).then(response => {
      if (!current || !alive.current || !visible.current || catalogRead.current !== generation) return
      setCacheChecking(false)
      if (response && !response.ok) { setCached({scope,value:null,failed:true}); setCatalogError(response.message); return }
      setCached({scope,value:response})
      reconcileSelection(modelChoices(draft.provider as ConfigurationProviderId,kind,response))
    }).catch(() => {
      if (current && alive.current && visible.current && catalogRead.current === generation) { setCacheChecking(false); setCached({scope,value:null,failed:true}); setCatalogError("本地模型目录读取失败，请刷新目录后重试") }
    })
    return () => { current = false }
  }, [open,directoryScope])
  useEffect(() => {
    if (!keyRefresh) return
    cancelAutoRefresh()
    autoRefresh.current = setTimeout(() => {
      autoRefresh.current = null
      if (confirming.current || !presetsFor(kind).some(preset => preset.id === draft.provider)) return
      void discover()
    }, 500)
    return cancelAutoRefresh
  }, [keyRefresh])
  function reconcileSelection(entries: ReturnType<typeof modelChoices>, replace = false) {
    setDraft(before => {
      if (!before.modelId) return before
      const entry = entries.find(item => item.id === before.modelId)
      if (entry) return {...before,contextWindow:entry.contextWindow??0,thinkingLevels:entry.thinkingLevels??[],defaultThinking:entry.defaultThinking??"default"}
      const next = replace ? entries.find(item => item.available !== false && !models.some(existing => existing.id !== before.id && existing.provider === before.provider && existing.kind === before.kind && existing.endpoint === before.endpoint && existing.modelId === item.id)) : undefined
      if (!next) { setCatalogError("原选型号已不在当前目录中，请重新选择可用模型。"); setContext(""); return {...before,modelId:"",name:"",contextWindow:0,thinkingLevels:[],defaultThinking:"default"} }
      setCatalogError("原选型号已不在当前目录中，已替换为下一个可用模型。"); setContext(""); setResult(null); onboarding?.onDraftChanged?.()
      return {...before,modelId:next.id,name:next.name,contextWindow:next.contextWindow??0,thinkingLevels:next.thinkingLevels??[],defaultThinking:next.defaultThinking??"default"}
    })
  }
  function unavailable() { return !visible.current || blocked.current || locking.current || !!operation.current }
  function close() { if (!visible.current || blocked.current || locking.current) return; alive.current = false; cancelRequests(); cancelAutoRefresh(); onClose() }
  function navigate(action?: () => void) {
    if (!visible.current || blocked.current || locking.current || onboarding?.confirmationPending) return
    cancelRequests(); cancelAutoRefresh(); setDiscovering(false); setBusy(""); setResult(null); action?.()
  }
  function changeMode(existing: boolean) {
    if (unavailable() || onboarding?.confirmationPending) return
    cancelRequests(); cancelAutoRefresh(); setDiscovering(false); setCatalog(null); setCatalogError(""); setResult(null); setError(""); setUseExisting(existing); setExistingId(null); setDraft(before => ({ ...before, apiKey: "" })); onboarding?.onDraftChanged?.()
  }
  function edit(change: Partial<Draft>, clearScope = false) {
    if (unavailable() || onboarding?.confirmationPending) return
    if (clearScope || "apiKey" in change || "provider" in change || "protocol" in change || "endpoint" in change) cancelAutoRefresh()
    if (discovery.current) { void window.desktop?.cancelModelConfiguration(discovery.current).catch(() => {}); discovery.current = null }
    setDiscovering(false); setCatalog(null); setCatalogError(""); setError(""); setResult(null)
    setDraft(before => ({...before,...change,...(clearScope ? {apiKey:"",thinkingLevels:[],defaultThinking:"default"} : {})}))
    onboarding?.onDraftChanged?.()
  }
  function editKey(value: string) {
    if (unavailable() || onboarding?.confirmationPending) return
    edit({ apiKey: value })
    setKeyRefresh(before => before + 1)
  }
  function invalid(message: string, field: string): never {
    if (typeof document !== "undefined") document.querySelector<HTMLElement>(`[aria-label="${field}"]`)?.focus()
    throw new Error(message)
  }
  function configuration(): ConfigurationDraft {
    if (!draft.protocol) invalid("请选择协议", "协议")
    const apiKey = scopeMatches && revealedKey.current !== null && draft.apiKey === revealedKey.current ? "" : draft.apiKey
    return { ...(draft.id ? {id:draft.id} : {}),provider:draft.provider as ConfigurationProviderId,kind,protocol:draft.protocol,endpoint:draft.endpoint,apiKey,modelId:draft.modelId,...(custom && draft.protocol === "openai" && kind === "TEXT" ? {wire:draft.wire ?? (model ? "auto" : "chat")} : {}) }
  }
  function savedDraft(): ModelDraft {
    const config = configuration()
    if (!hasKey) invalid("请输入 API Key", "API Key")
    if (!draft.modelId.trim()) invalid(custom ? "请输入模型 ID" : "请选择可用模型", custom ? "模型 ID" : "可用模型")
    if (!custom && (loadingCatalog || cacheFailed || !choices.some(entry => entry.id === draft.modelId && entry.available !== false) || excludedBuiltinModel(draft.provider as ConfigurationProviderId,kind,draft.modelId))) invalid("请选择可用模型", "可用模型")
    if (!draft.name.trim()) invalid("请输入展示名称", custom ? "展示名称" : "可用模型")
    if (custom && !draft.providerName?.trim()) invalid("请输入供应商名称", "供应商名称")
    if (models.some(item => item.id !== draft.id && item.provider === draft.provider && item.endpoint === draft.endpoint && item.kind === kind && item.modelId === draft.modelId.trim())) invalid("这个模型已经添加", custom ? "模型 ID" : "可用模型")
    const { wire: _wire, ...fields } = draft
    return { ...fields, ...(config.wire !== undefined ? {wire:config.wire} : {}), apiKey:config.apiKey, protocol:config.protocol, contextWindow:custom ? context.trim() ? parseContextWindow(context) : 0 : draft.contextWindow }
  }
  async function discover() {
    cancelAutoRefresh()
    if (unavailable() || onboarding?.confirmationPending || useExisting || discovery.current || custom || !hasKey || !window.desktop) return
    const id = crypto.randomUUID(); discovery.current = id; setDiscovering(true); setCatalogError("")
    try {
      const response = await window.desktop.discoverModels(id,configuration())
      if (!alive.current || !visible.current || discovery.current !== id) return
      if (response.ok) {
        ++catalogRead.current
        if (response.authoritative === true || response.complete) {
          setCacheChecking(false)
          setCatalog(response); setCached({scope:directoryScope,value:offlineCatalog(response)})
          reconcileSelection(modelChoices(draft.provider as ConfigurationProviderId,kind,response),true)
        }
        if (!response.complete) setCatalogError(response.authoritative ? "目录已更新；部分型号能力尚未确认，仅显示已确认类别的型号。" : "目录尚不完整，已保留原目录，请重新刷新。")
      }
      else setCatalogError(response.message)
    } catch { if (alive.current && discovery.current === id) setCatalogError("模型目录读取失败，请重试") }
    finally { if (alive.current && discovery.current === id) { discovery.current = null; setDiscovering(false) } }
  }
  async function save() {
    if (unavailable()) return
    try {
      if (onboarding?.confirmationPending) {
        if (!onboarding.onRetry) throw new Error("上次提交尚待确认，请重新打开引导")
        locking.current = true; setBusy("save"); setError(""); cancelRequests(); setDiscovering(false)
        await onboarding.onRetry()
      } else if (onboarding && useExisting) {
        if (!existingId || !models.some(item => item.id === existingId && item.kind === kind && item.enabled)) invalid("请选择已启用的模型", "已配置模型")
        locking.current = true; setBusy("save"); setError(""); cancelRequests(); setDiscovering(false)
        await onboarding.onSelectExisting(existingId)
      } else {
        const value = savedDraft(); locking.current = true; setBusy("save"); setError(""); cancelRequests(); setDiscovering(false)
        await (onboarding?.onSubmit ?? saveDesktopModel)(value)
        if (alive.current && !onboarding) onClose()
      }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "模型保存失败") }
    finally { locking.current = false; if (alive.current) setBusy("") }
  }
  async function test() {
    if (unavailable() || onboarding?.confirmationPending || useExisting || !window.desktop) return
    let id: string | null = null
    try {
      savedDraft(); const value = configuration(); cancelRequests()
      setTested({provider:draft.providerName || PROVIDER_PRESETS.find(preset => preset.id === draft.provider)?.name || draft.provider,endpoint:draft.endpoint,modelId:draft.modelId})
      id = crypto.randomUUID(); operation.current = id; setBusy("test"); setDiscovering(false); setError("")
      const response = await window.desktop.testModel(id,value)
      if (alive.current && visible.current && operation.current === id) setResult(response)
    } catch (cause) { if (alive.current && (!id || operation.current === id)) setError(cause instanceof Error ? cause.message : "测试连接失败") }
    finally { if (alive.current && (!id || operation.current === id)) { operation.current = null; setBusy("") } }
  }
  const shownCatalog = catalog ?? (cached?.scope === directoryScope ? cached.value : null)
  const choices = loadingCatalog || cacheFailed ? [] : modelChoices(draft.provider as ConfigurationProviderId,kind,shownCatalog)
  const catalogOptions = choices.map(item => ({id:item.id,label:item.name,provider:draft.provider,hint:[item.id,...(item.permission === "unknown" ? ["调用权限待确认"] : []),...(item.notes ?? [])].join(" · "),disabled:item.available === false || models.some(existing => existing.id !== draft.id && existing.provider === draft.provider && existing.kind === kind && existing.endpoint === draft.endpoint && existing.modelId === item.id),disabledLabel:item.available === false ? "不可用" : "已添加"}))
  const disabled = !!busy || !!onboarding?.blocked || !open
  const fieldsDisabled = disabled || !!onboarding?.confirmationPending
  const navigationDisabled = busy === "save" || !!onboarding?.blocked || !open || !!onboarding?.confirmationPending
  const existingOptions = models.filter(item => item.kind === kind && item.enabled).map(item => ({ id: item.id, label: item.name, provider: item.provider, hint: item.modelId }))
  return <Dialog open={open} disablePointerDismissal={!!onboarding || undefined} onOpenChange={onboarding ? onboardingDialogGuard : value => { if (!value) close() }}><DialogContent data-desktop-settings-surface className={`desktop-model-editor${onboarding ? " desktop-onboarding desktop-onboarding-editor" : ""}`} showCloseButton={false} initialFocus={() => typeof document === "undefined" ? null : document.querySelector<HTMLElement>(useExisting ? '[aria-label="已配置模型"]' : '[aria-label="供应商"]')} finalFocus={finalFocus}>
    <div className={onboarding ? "desktop-onboarding-head" : "desktop-model-head"}>
      <DialogTitle>{onboarding ? kind === "TEXT" ? "配置文本模型" : "配置文生图模型" : "配置模型"}</DialogTitle>
      <DialogDescription className={onboarding ? "desktop-onboarding-description" : "sr-only"}>{onboarding ? kind === "TEXT" ? "添加自己的文本模型，用于 AI 写作与审核。" : "选择自己的文生图模型，之后可以用于创作图片。" : `配置一个${kind === "TEXT" ? "文本" : "文生图"}模型，点击保存后生效`}</DialogDescription>
      {!onboarding && <Button variant="ghost" size="icon-sm" className="absolute right-3 top-3" aria-label="关闭配置模型" disabled={busy === "save" || !open} onClick={close}><X size={16} /></Button>}
    </div>
    <div className={onboarding ? "desktop-onboarding-body desktop-model-body" : "desktop-model-body"}>
      <fieldset disabled={fieldsDisabled} className="desktop-model-fields">
        {onboarding && existingOptions.length > 0 && <div className="desktop-onboarding-existing-switch"><Button variant="outline" aria-pressed={!useExisting} disabled={fieldsDisabled} onClick={() => changeMode(false)}>{model ? "编辑当前模型" : "添加新模型"}</Button><Button variant="outline" aria-pressed={useExisting} disabled={fieldsDisabled} onClick={() => changeMode(true)}>选择已有模型</Button></div>}
        {onboarding && useExisting ? <Field title={`已配置${kind === "TEXT" ? "文本" : "文生图"}模型`}><ModelChoiceSelect label="已配置模型" value={existingId} options={existingOptions} disabled={fieldsDisabled} placeholder="请选择已配置模型" onChange={id => { if (unavailable() || onboarding?.confirmationPending) return; setExistingId(id); setError(""); onboarding.onDraftChanged?.() }} /><small>只选用已启用的{kind === "TEXT" ? "文本" : "文生图"}模型；保留原凭据，不重新添加。</small></Field> : <>
          <Field title="供应商"><ModelChoiceSelect label="供应商" value={draft.provider} provider disabled={fieldsDisabled} selectedOption={{id:draft.provider,label:draft.providerName || PROVIDER_PRESETS.find(preset => preset.id === draft.provider)?.name || draft.provider,provider:draft.provider}} options={presetsFor(kind).map(preset => ({id:preset.id,label:preset.name,provider:preset.id}))} onChange={id => { const preset=presetsFor(kind).find(item => item.id === id)!; setContext(""); edit({provider:id,providerName:"",protocol:preset.protocol ?? "",endpoint:(kind === "TEXT" ? preset.textEndpoint : preset.imageEndpoint) ?? "",modelId:"",name:"",contextWindow:0},true) }} /></Field>
          {custom && <><Field title="供应商名称"><Input aria-label="供应商名称" value={draft.providerName ?? ""} onChange={event => edit({providerName:event.target.value})} /></Field><Field title="协议"><select aria-label="协议" value={draft.protocol} onChange={event => edit({protocol:event.target.value as Draft["protocol"]},true)}><option value="" disabled>请选择协议</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></Field><Field title="展示名称"><Input aria-label="展示名称" value={draft.name} onChange={event => edit({name:event.target.value})} /></Field><Field title="Base URL"><Input aria-label="Base URL" value={draft.endpoint} placeholder="https://…" onChange={event => edit({endpoint:event.target.value},true)} /></Field><Field title="模型 ID"><Input aria-label="模型 ID" value={draft.modelId} onChange={event => edit({modelId:event.target.value})} /></Field></>}
          {custom && draft.protocol === "openai" && kind === "TEXT" && <Field title="OpenAI 接口"><select aria-label="OpenAI 接口" value={draft.wire ?? (model ? "auto" : "chat")} onChange={event => edit({wire:event.target.value as NonNullable<Draft["wire"]>})}><option value="auto">自动（兼容原配置）</option><option value="chat">Chat Completions</option><option value="responses">Responses</option></select></Field>}
          <Field title="API Key"><div className="relative"><Input aria-label="API Key" type={showKey ? "text" : "password"} data-desktop-clipboard="api-key" autoComplete="off" spellCheck={false} className="pr-9" value={draft.apiKey} placeholder={scopeMatches ? "已配置，留空保留原密钥" : "请输入 API Key"} onChange={event => editKey(event.target.value)} /><Button type="button" variant="ghost" size="icon-sm" className="absolute top-0.5 right-1 text-muted-foreground transition-none active:not-aria-[haspopup]:translate-y-0" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} aria-pressed={showKey} onClick={() => setShowKey(value => !value)}>{showKey ? <Eye size={16} /> : <EyeOff size={16} />}</Button></div></Field>
          {custom ? <details><summary className="cursor-pointer text-sm text-muted-foreground">高级配置</summary><Field title="上下文上限（可选）"><Input aria-label="上下文上限" value={context} placeholder="例如 128K 或 1M" onChange={event => { if (unavailable() || onboarding?.confirmationPending) return; setContext(event.target.value); setError(""); onboarding?.onDraftChanged?.() }} /><small>未配置时采用 16K 输入预算，不表示模型实际容量。</small></Field></details> : <Field title="可用模型"><div className="flex gap-2"><ModelChoiceSelect label="可用模型" value={draft.modelId} options={catalogOptions} disabled={fieldsDisabled} placeholder={discovering || loadingCatalog ? "正在读取模型列表…" : "请选择可用模型"} onOpen={() => { if (!catalog) void discover() }} onChange={id => { if (unavailable() || onboarding?.confirmationPending) return; const entry=choices.find(item => item.id === id); if (entry && entry.available !== false) { setDraft(before => ({...before,modelId:id,name:entry.name,contextWindow:entry.contextWindow ?? 0,thinkingLevels:entry.thinkingLevels ?? [],defaultThinking:entry.defaultThinking ?? "default"})); setError(""); onboarding?.onDraftChanged?.() } }} /><Button variant="outline" size="icon" aria-label="刷新模型列表" disabled={fieldsDisabled || discovering || !hasKey} onClick={() => { void discover() }}>{discovering ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw size={16} />}</Button></div><small>显示已核对的内置目录或上次刷新的官方目录；填写或更新 API Key 后自动刷新。调用权限取决于当前 Key。</small>{catalogError && <small role="status">{catalogError}</small>}{catalog?.warnings.map(warning => <small key={warning} role="status">{warning}</small>)}{shownCatalog && <small>目录获取于 {new Date(shownCatalog.checkedAt).toLocaleString()}；列出不代表当前 Key 有调用权限。</small>}</Field>}
        </>}
      </fieldset>
      {onboarding?.confirmationPending && <p role="status" className="desktop-onboarding-form-hint">上次提交已保存，请先点击继续确认写入后再修改。</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!useExisting && <p className="text-xs text-muted-foreground desktop-model-test-note">测试当前模型：{kind === 'TEXT' ? '请求简短回复' : '生成 1 张图片'}，可能产生供应商费用。</p>}
    </div>
    {onboarding ? <div className="desktop-onboarding-footer">
      {onboarding.onBack && <Button variant="ghost" disabled={navigationDisabled} onClick={() => navigate(onboarding.onBack)}><ArrowLeft size={16} />返回</Button>}
      <div className="desktop-onboarding-footer-actions">
        {onboarding.onSkip && <Button variant="ghost" disabled={navigationDisabled} onClick={() => navigate(onboarding.onSkip)}>跳过</Button>}
        {!useExisting && <Button ref={testButton} variant="outline" disabled={fieldsDisabled} aria-busy={busy === 'test'} onClick={() => { void test() }}>{busy === 'test' && <LoaderCircle className="size-4 animate-spin" />}{busy === 'test' ? '测试中…' : '测试连接'}</Button>}
        <Button disabled={disabled} onClick={() => { void save() }}>{busy === "save" && <LoaderCircle className="size-4 animate-spin" />}继续<ArrowRight size={16} /></Button>
      </div>
    </div> : <div className="flex justify-end gap-2"><Button disabled={disabled} onClick={() => { void save() }}>保存模型</Button><Button ref={testButton} variant="outline" disabled={disabled} aria-busy={busy === 'test'} onClick={() => { void test() }}>{busy === 'test' && <LoaderCircle className="size-4 animate-spin" />}{busy === 'test' ? '测试中…' : '测试连接'}</Button><Button variant="outline" disabled={busy === 'save'} onClick={close}>取消</Button></div>}
    <Dialog open={open && result !== null} disablePointerDismissal={!!onboarding || undefined} onOpenChange={onboarding ? onboardingDialogGuard : value => { if (!value) setResult(null) }}><DialogContent data-desktop-settings-surface showCloseButton={!onboarding} finalFocus={testButton}><DialogTitle>连接测试结果</DialogTitle><DialogDescription>{result?.ok ? `当前模型连接成功，用时 ${(result.durationMs / 1000).toFixed(1)} 秒。测试未保存模型。` : result?.message}</DialogDescription><div className="break-all text-xs text-muted-foreground"><p>{tested?.provider} · {tested?.modelId}</p><p>{tested?.endpoint}</p></div><Button onClick={() => setResult(null)}>返回配置</Button></DialogContent></Dialog>
  </DialogContent></Dialog>
}
