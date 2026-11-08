import "./console-write-guard"
import {NovelImportSourcePicker} from "./novel-import-source-picker"
import {sourcePickerActionSchema} from "../shared/novel-import-source-picker"
import { app, BaseWindow, BrowserWindow, ImageView, clipboard, dialog, ipcMain, Menu, MessageChannelMain, nativeImage, nativeTheme, protocol, safeStorage, screen, session, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron"
import { Worker } from "node:worker_threads"
import {randomUUID} from "node:crypto"
import {DraftJournal,validateDraftSnapshot} from "./draft-journal"
import {CloseCoordinator,type CloseIntent,type CloseOwner} from "./close-coordinator"
import {RendererCloseChannel} from "./renderer-close-channel"
import { homedir,tmpdir } from "node:os"
import { join, resolve, parse } from "node:path"
import { lstat,mkdtemp,readdir } from "node:fs/promises"
import { mkdirSync,realpathSync } from "node:fs"
import { z } from "zod"
import { ModelService } from "./model-service"
import { ModelConfigurationService } from "./model-configuration"
import { AvatarAssetService } from "./avatar-assets"
import { modelFailureNotice } from "./model-guidance"
import { settingsSchema, type Settings } from "../core/settings"
import { nativeWindowAppearance, applyWindowAppearance, syncNativeThemeSource } from "./window-appearance"
import { installWindowsCloseAccent } from "./native-close-accent"
import { RevisionConflict,atomicWrite } from "../core/versioned-store"
import { ModelRepository } from "./model-repository"
import { ModelGateway } from "../core/model-authorization"
import { DirectoryAuthority, type DirectoryPurpose } from "./directory-authority"
import { RpcPeer } from "../service/rpc"
import { requestSchema, type LocalResponse, type DesktopEvent, type SettingsAction } from "../shared/ipc"
import commands from "../shared/commands.json"
import { desktopMenu, electronAccelerator } from "../shared/command-registry"
import {localImageRequest} from "../shared/local-images"
import {ConfigurationFiles} from "./configuration-files"
import {FileExports} from "./file-export"
import {fileExportFailureMessages} from "../shared/file-export"
import {guardFileExportTarget} from "./file-export-target"
import {trustedCommandCatalogs} from "./trusted-command-catalogs"
import {createRootStartupBuffer,waitRootStartup} from "../shared/root-startup"
import {prepareSessionDirectory} from "./session-directory"
import {rootMaintenanceRequired} from "./root-maintenance-preflight"
import {launchRootMaintenance} from "./root-maintenance-window"
import {staticUiResponse} from "./static-ui"
import {BusinessGate} from "./business-gate"
import {DataRootManager} from "../core/data-root"
import {RootMigrationRequests} from "./root-migration-request"
import {RootMigrationHandoff} from "./root-migration-handoff"
import {assertNoLegacyBackupRecovery} from "./legacy-recovery-preflight"
import {WorkLeaseHandoff} from "./work-lease-handoff"
import {workLeaseRequestSchema} from "../shared/work-lease"
import {ApplicationMetadataGate} from "./application-metadata-gate"
import {rootRelocationPreflight} from "./root-relocation-preflight"
import {launchRootRelocation} from "./root-relocation-window"
import {classifyStartupRecovery,executeStartupRepair,executeStartupReset,samePath} from "./startup-recovery"
import {offerConfigReset} from "./config-reset-offer"
import {inboxLeaseRecoveryRequired,recoverInboxLeaseAutomatically} from "./inbox-lease-recovery"
import {launchInboxLeaseRecovery} from "./inbox-lease-recovery-window"
import {ConversationDirectoryAuthorizations} from "./conversation-directory-authorizations"
import type {ConversationRequestOrigin} from "../shared/conversation-task"
import {workNames} from "../core/brand-names"
import {selectBrandStartupPaths,BrandStartupPathError,legacyEncryptionName,type BrandStartupPaths} from "./brand-startup-paths"
import {CURRENT_NAMES} from "../shared/brand-names"
import { InputContextMenus } from "./input-context-menu"
import { inputContextStateSchema } from "../shared/input-context-menu"
import {TextContextMenus} from './text-context-menu'
import {textContextRequestSchema} from '../shared/text-context-menu'
import { OnboardingService } from "./onboarding-service"
import { OnboardingError, onboardingActionSchema } from "../shared/onboarding"
import {PROJECT_REPOSITORY_URL,PROJECT_WEBSITE_URL,PROJECT_DOCS_URL,PROJECT_GUIDE_URL,PROJECT_FAQ_URL,displayAppVersion} from '../shared/project-info'
import { ModelCatalogRepository } from './model-catalog-repository'
import {projectAboutHtml,installProjectAboutLinks,PROJECT_ABOUT_LINK_ERROR_SCRIPT} from './project-about'
import {NovelImportController} from './novel-import'
import {NovelImportPdfClient} from './novel-import-pdf-client'
import {importActionSchema,type ImportModel,type ImportSession} from '../shared/novel-import'
import {importPlanHash} from '../core/novel-import'
import {WorkLeaseRecovery,type WorkLeaseRecoveryPreview} from '../core/work-lease-recovery'
import {RendererPrompts} from './renderer-prompts'
import {promptReplySchema} from '../shared/prompt'

app.enableSandbox()
protocol.registerSchemesAsPrivileged([{ scheme: "shakeink", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }])
// Keep the instance-lock directory stable even when the data root changes.
const isolatedRoot = process.env.SHAKEINK_TEST_ROOT ? resolve(process.env.SHAKEINK_TEST_ROOT) : null
let startupPaths:BrandStartupPaths|null=null, startupSelectionError:unknown=null
try{startupPaths=selectBrandStartupPaths({appData:app.getPath("appData"),home:homedir(),isolatedRoot})}
catch(error){
  startupSelectionError=error
  if(error instanceof BrandStartupPathError)startupPaths=error.recoveryPaths
  else startupPaths={bootstrap:join(app.getPath("appData"),CURRENT_NAMES.appIdentity),defaultRoot:join(homedir(),".shakeink"),encryptionFamily:"current"}
}
app.setName(startupPaths?.encryptionFamily==="legacy"?legacyEncryptionName:"玄印写作")
void app.whenReady().then(()=>app.setName("玄印写作"))
const bootstrapDirectory=startupPaths?.bootstrap??""
let bootstrapPath=""
if(startupPaths){
  mkdirSync(bootstrapDirectory, { recursive: true })
  bootstrapPath=realpathSync(bootstrapDirectory)
  app.setPath("userData", bootstrapPath)
}

let window: BrowserWindow | null = null
let modelService: ModelService
let modelConfiguration: ModelConfigurationService
let avatarAssets: AvatarAssetService
let onboardingService: OnboardingService
let repository: ModelRepository
let configurationFiles:ConfigurationFiles
let fileExports:FileExports
let novelImport:NovelImportController
let novelImportOwner:{window:BrowserWindow;session:NonNullable<typeof draftSession>}|null=null
let novelImportRepairing=false
let novelImportServiceLost=false
let novelImportCloseIntent:CloseIntent|null=null
let recoveryExports:FileExports
let service: RpcPeer
let worker: Worker
let dataRoot = ""
const businessGate=new BusinessGate()
const inputContextMenus=new InputContextMenus(template=>Menu.buildFromTemplate(template))
const textContextMenus=new TextContextMenus(template=>Menu.buildFromTemplate(template))
const applicationMetadata=new ApplicationMetadataGate()
const metadataWrites={withWrite:<T>(run:()=>Promise<T>)=>applicationMetadata.write(run)}
let businessClosed=false
let migrationHandoff:RootMigrationHandoff|null=null
let workLease:WorkLeaseHandoff|null=null
let draftJournal:DraftJournal
let draftSession:{owner:number;id:string;ready:boolean;release:()=>void}|null=null
let ordinaryWorkerExited=false
let failedRootCode:string|null=null
let failedRootPath:string|null=null
let quitting = false
let closingFlow:Promise<boolean>|null=null
let closeCommitted=false
let closeCoordinator:CloseCoordinator
const closeChannel=new RendererCloseChannel(event=>send(event))
const closePermits=new WeakSet<BrowserWindow>()
let menuRevision = -1
let windowTheme: Settings["appearance"]["theme"] = "system"
let menuShortcuts: Record<string,string[]> = {}
const authority = new DirectoryAuthority()
const conversationDirectories=new ConversationDirectoryAuthorizations({choose:chooseConversationDirectory,revoke:owner=>authority.revokeOwner(owner)})
const responseOwners = new Map<string, { owner: number; cancel(): Promise<void> }>()
const send = (event: DesktopEvent) => {
  if (event.type === "state"&&event.state.revision>=menuRevision) refreshMenus(event.state)
  if (window && !window.isDestroyed()) window.webContents.send("desktop:event", event)
}
// Questions shown by the workbench's React prompt host instead of native message boxes.
// A crashed renderer cannot answer; resolving to the cancel value keeps close/quit from waiting forever.
const appPrompts=new RendererPrompts(prompts=>{if(!window||window.isDestroyed()||window.webContents.isCrashed())return false;send({type:"prompts",prompts});return true})
function trusted(event: IpcMainInvokeEvent) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || (new URL(event.senderFrame.url).protocol !== "shakeink:" || new URL(event.senderFrame.url).host !== "app")) throw new Error("不受信的桌面请求")
}
function assertNovelImportOwner(){
  const owner=novelImportOwner
  if(!owner||window!==owner.window||owner.window.isDestroyed()||draftSession!==owner.session||!owner.session.ready||draftSession.owner!==window.webContents.id||closingFlow||quitting||businessGate.closed||migrationHandoff?.pending||workLease?.pending)throw Error('导入所属窗口已变化或正在关闭')
}
const novelImportSourcePicker = new NovelImportSourcePicker({
  places:async()=>[
    {name:'文档',path:app.getPath('documents')},
    {name:'下载',path:app.getPath('downloads')},
    {name:'桌面',path:app.getPath('desktop')},
    {name:'个人文件夹',path:app.getPath('home')},
    {name:'本机磁盘',path:parse(app.getPath('home')).root},
  ],
  roots:process.platform==='win32'?Array.from({length:26},(_,index)=>String.fromCharCode(65+index)+':\\'):[],
  protectedRoots:async()=>[dataRoot,bootstrapPath,...await service.call<string[]>('protected-directories')],
  changed:view=>send({type:'novel-import-picker',view}),
})
async function chooseNovelSources(mode?:'files'|'folder'){
  assertNovelImportOwner();const owner=novelImportOwner
  if(process.platform!=='darwin'){
    const selected=await novelImportSourcePicker.choose(()=>{assertNovelImportOwner();if(novelImportOwner!==owner)throw Error('导入所属窗口已变化')})
    if(!selected)return null
    assertNovelImportOwner();if(novelImportOwner!==owner)throw Error('导入所属窗口已变化')
    return selected
  }
  const selected=await dialog.showOpenDialog(window!,{
    title:'选择小说文本文件或文件夹',
    properties:['openFile','openDirectory','multiSelections'],
    filters:[{name:'小说文本',extensions:['txt','md','doc','docx','pdf','html','htm']}],
  })
  if(selected.canceled)return null
  assertNovelImportOwner();if(novelImportOwner!==owner)throw Error('导入所属窗口已变化')
  if(!Array.isArray(selected.filePaths)||!selected.filePaths.length||selected.filePaths.some(path=>typeof path!=='string'))throw Error('原生文件选择结果无效')
  return selected.filePaths
}
async function chooseNovelTarget(title:string){
  assertNovelImportOwner();const owner=novelImportOwner!,grantOwner=`novel-import:${owner.window.webContents.id}:${owner.session.id}`
  try{
    const settings=await repository.read();assertNovelImportOwner()
    const selected=await dialog.showOpenDialog(owner.window,{title:`为《${title||'导入作品'}》选择独立目录`,defaultPath:settings.settings.general.defaultParent||homedir(),properties:['openDirectory','createDirectory']})
    assertNovelImportOwner();if(novelImportOwner!==owner)throw Error('导入所属窗口已变化');if(selected.canceled)return null
    if(selected.filePaths.length!==1||typeof selected.filePaths[0]!=='string')throw Error('原生目录选择结果无效')
    const grant=await authority.issue(selected.filePaths[0],'create-work',grantOwner);assertNovelImportOwner()
    const target=await authority.consume(grant.id,'create-work',grantOwner);assertNovelImportOwner();return target
  }finally{authority.revokeOwner(grantOwner)}
}
async function novelImportModels():Promise<{text?:ImportModel;review?:ImportModel}>{
  const state=await repository.read()
  const snapshot=(id:string|null):ImportModel|undefined=>{const model=state.models.find(model=>model.id===id&&model.enabled&&model.kind==='TEXT');return model?{id:model.id,name:model.name,modelId:model.modelId,endpoint:model.endpoint,authRevision:model.authRevision,contextWindow:model.contextWindow,provider:model.provider,protocol:model.protocol}:undefined}
  return {text:snapshot(state.settings.agent.textModelId),review:snapshot(state.settings.agent.reviewModelId)}
}
/** The default image model, as the renderer's image panels resolve it. */
async function novelImportImageModel():Promise<ImportModel|undefined>{
  const state=await repository.read(),model=state.models.find(m=>m.id===state.settings.agent.imageModelId&&m.enabled&&m.kind==='IMAGE')
  return model?{id:model.id,name:model.name,modelId:model.modelId,endpoint:model.endpoint,authRevision:model.authRevision,contextWindow:0}:undefined
}
/** Same transfer protocol and limits as the service-side generateLocalImage, called directly in main. */
async function generateNovelImportImage(model:ImportModel,prompt:string,sizes:readonly string[]|undefined,signal:AbortSignal){
  const id=randomUUID(),abort=()=>{void modelService.cancel(id).catch(()=>undefined)}
  signal.addEventListener('abort',abort,{once:true})
  try{
    const header=await modelService.startImage({id,modelId:model.id,authRevision:model.authRevision,prompt,...(sizes?{sizes:[...sizes]}:{})});signal.throwIfAborted()
    const mime=header.headers['content-type'];if(header.id!==id||header.status!==200||!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('IMAGE_RESPONSE_INVALID')
    const chunks:Uint8Array[]=[];let length=0
    for(;;){const frame=await modelService.read(id);signal.throwIfAborted();if(frame.done)break;if(!(frame.bytes instanceof Uint8Array)||!frame.bytes.length||frame.bytes.length>65536)throw Error('IMAGE_RESPONSE_INVALID');length+=frame.bytes.length;if(length>10*1024*1024)throw Error('IMAGE_RESPONSE_TOO_LARGE');chunks.push(frame.bytes)}
    if(!length||header.headers['content-length']!==String(length))throw Error('IMAGE_RESPONSE_INVALID')
    return {bytes:new Uint8Array(Buffer.concat(chunks,length)),mime}
  }finally{signal.removeEventListener('abort',abort);void modelService.cancel(id).catch(()=>undefined)}
}
async function repairNovelImportTarget(session:ImportSession){
  assertNovelImportOwner()
  if(novelImportRepairing||closingFlow||migrationHandoff||workLease||!session.target||!session.publication?.hash)throw Error('当前没有可安全修复的导入保存记录')
  const owner=novelImportOwner!,root=dataRoot
  const assertCurrent=()=>{if(window!==owner.window||owner.window.isDestroyed()||draftSession!==owner.session||dataRoot!==root||closingFlow||quitting||!app.hasSingleInstanceLock())throw Error('导入锁修复所属窗口或数据根已变化')}
  novelImportRepairing=true
  novelImportServiceLost=false
  let workerClosed=false,serviceUsable=true,approved:WorkLeaseRecoveryPreview|null=null,recovery:WorkLeaseRecovery|undefined
  try{
    // Recovery always reauthorizes the original directory through a fresh native choice.
    const selection=await chooseNovelTarget(session.title);assertCurrent()
    if(!selection)throw Error('已取消重新授权保存目录')
    if(selection.path!==session.target.path||selection.device!==session.target.device||selection.inode!==session.target.inode)throw Error('请重新选择原导入保存目录')
    const active=await service.call<{active:number}>('task-status');assertCurrent()
    if(active.active||modelService.activeCount||modelConfiguration.activeCount||responseOwners.size)throw Error('请先停止其他创作任务再修复导入保存目录')
    novelImport?.cancelPdfWork?.();novelImportSourcePicker.cancel();await novelImport?.drainPdfWork?.();await businessGate.close();assertCurrent()
    const drained=await service.call<{active:number}>('task-status');assertCurrent()
    if(drained.active||responseOwners.size)throw Error('本地任务尚未排空，请稍后重试')
    await service.call('close');workerClosed=true;assertCurrent()
    const input={session,selection,importHash:importPlanHash(session)}
    // This RPC only proves an already existing reservation. It cannot reserve a new directory.
    const target=await service.call<import('../core/data-root').RootIdentity>('novel-import-lease-target',input);assertCurrent()
    await service.call('close');assertCurrent() // closes the transient inbox lookup before physical recovery
    recovery=new WorkLeaseRecovery({namesForWork:workNames,assertHost:assertCurrent,
      assertWorkClosed:()=>{assertCurrent();if(!workerClosed)throw Error('本地数据尚未关闭')},
      assertConfirmed:(id,work,leaseOwner)=>{assertCurrent();if(!approved||approved.requestId!==id||JSON.stringify(approved.work)!==JSON.stringify(work)||JSON.stringify(approved.owner)!==JSON.stringify(leaseOwner))throw Error('锁修复尚未确认')},
    })
    const preview=await recovery.prepare(target);assertCurrent()
    const confirmation=await appPrompts.ask({tone:'warning',title:'修复导入保存目录的异常退出锁',message:'移除已退出进程留下的锁并恢复原导入？',detail:`原保存目录：${preview.work.path}\n原进程：${preview.owner.pid}\n原设备：${preview.owner.host}\n已确认本机原进程退出。仅修复这次核对的锁，继续使用原请求与内容。`,buttons:[{value:'cancel',label:'取消',variant:'outline'},{value:'repair',label:'修复并继续',variant:'destructive'}],defaultValue:'cancel',cancelValue:'cancel'})
    assertCurrent();if(confirmation!=='repair'){recovery.cancel(preview.requestId);throw Error('已取消导入目录锁修复')}
    approved=preview
    const result=await recovery.recover(preview.requestId);await recovery.flush();assertCurrent()
    if(result.status!=='recovered')throw Error('导入目录锁恢复尚待收尾，请重新核对后重试')
    serviceUsable=false;await modelService.close();service.dispose();await worker.terminate();assertCurrent()
    const startup=createOrdinaryServiceWorker(),status=waitRootStartup(startup)
    if(status.status!=='ready'||status.root!==root)throw Error('本地服务重建失败，请重新启动后恢复导入')
    await service.call('ready');workerClosed=false;serviceUsable=true;novelImportServiceLost=false;assertCurrent()
  }finally{
    await recovery?.flush()
    if(novelImportServiceLost||ordinaryWorkerExited||worker.threadId===-1)serviceUsable=false
    novelImportRepairing=false
    // The source journal remains owned by this main process; no import request is rerun here.
    if(serviceUsable&&!closingFlow&&!quitting){novelImport?.reopenPdfWork?.();modelService.resume();businessGate.reopen()}
    if(!serviceUsable){businessClosed=true;send({type:'service-disconnected'})}
    const close=novelImportCloseIntent;novelImportCloseIntent=null;if(close)queueMicrotask(()=>beginClose(close))
  }
}
const directoryPurpose = z.enum(["create-work", "open-work", "data-root", "default-parent"])
function makeRecoveryExports(){
  return new FileExports({assertOwner:owner=>{
    // Recovery export must remain available when normal close/flush has failed.
    if(!window||window.isDestroyed()||!draftSession||draftSession.owner!==window.webContents.id||owner!==`${window.webContents.id}:${draftSession.id}`)throw Error("草稿所属窗口已变化")
  },chooseSave:async()=>{
    const selected=await dialog.showSaveDialog(window!,{title:"导出恢复草稿",defaultPath:"玄印写作-恢复草稿.json",filters:[{name:"恢复草稿",extensions:["json"]}]})
    return selected.canceled?null:selected.filePath??null
  },guardTarget:async target=>guardFileExportTarget(target,{dataRoots:[dataRoot,bootstrapPath],workRoots:await service.call<string[]>("protected-directories")})})
}
async function exportDraftSnapshot(input:unknown) {
  const snapshot=validateDraftSnapshot(input),current=window,sessionId=draftSession?.id
  if(!current||current.isDestroyed()||!sessionId)throw new Error("草稿窗口不可用")
  const result=await recoveryExports.save(`${current.webContents.id}:${sessionId}`,{id:randomUUID(),format:"recovery",filename:"玄印写作-恢复草稿.json",bytes:new TextEncoder().encode(JSON.stringify({format:"shakeink-recovery",version:1,snapshot})+"\n")})
  if(window!==current||current.isDestroyed()||draftSession?.id!==sessionId)throw new Error("草稿所属窗口已变化")
  if(result.status==="failed")throw Error(fileExportFailureMessages[result.code])
  return result.status==="saved"
}
function beginClose(intent:CloseIntent){
  novelImport?.cancelPdfWork?.()
  novelImportSourcePicker.cancel()
  if(novelImportRepairing){if(novelImportCloseIntent!=='quit')novelImportCloseIntent=intent;return}
  if(!closeCoordinator)return
  if(workLease)intent="quit"
  if(!closingFlow&&migrationHandoff?.pending&&businessGate.closed){void retryMigrationCancellation().then(()=>beginClose(intent)).catch(()=>send({type:"migration-cancel-pending"}));return}
  if(!closingFlow)closeCommitted=false
  const work=closeCoordinator.request(intent);closingFlow=work
  void work.finally(()=>{if(closingFlow===work)closingFlow=null})
}
async function flushDraftForClose(owner:CloseOwner,retry:boolean){
  const reply=await closeChannel.request(owner,"flush",retry)
  if(!draftSession||draftSession.owner!==owner.owner||draftSession.id!==owner.sessionId)throw new Error("草稿所属窗口已变化")
  if(reply.status==="unmodified"&&!draftSession.ready)return
  if(reply.status!=="saved"||!draftSession.ready)throw new Error("尚未保存")
  await draftJournal.confirm(String(owner.owner),reply.receipt)
}
async function chooseDirectory(purpose: DirectoryPurpose, owner: string) {
  if (!window) throw new Error("应用窗口不可用")
  const settings = await repository.read()
  const result = await dialog.showOpenDialog(window, { title: purpose === "create-work" ? "为作品选择独立的空目录" : purpose === "open-work" ? "打开作品目录" : purpose === "data-root" ? "迁移应用数据" : "选择默认作品父目录", defaultPath: settings.settings.general.defaultParent || homedir(), properties: ["openDirectory", "createDirectory"] })
  return result.canceled || !result.filePaths[0] ? null : authority.issue(result.filePaths[0], purpose, owner)
}
async function chooseConversationDirectory(input:{title:string;premise?:string;requestId:string},assertCurrent:()=>void,grantOwner:string){
  assertCurrent()
  const current=window
  if(!current)throw Error("目录选择所属窗口不可用")
  try{
    const settings=await repository.read();assertCurrent()
    const result=await dialog.showOpenDialog(current,{title:`为《${input.title}》选择独立的空目录`,defaultPath:settings.settings.general.defaultParent||homedir(),properties:["openDirectory","createDirectory"]})
    assertCurrent()
    if(result.canceled)return null
    if(!Array.isArray(result.filePaths)||result.filePaths.length!==1||typeof result.filePaths[0]!=="string")throw Error("目录选择结果无效")
    const grant=await authority.issue(result.filePaths[0],"create-work",grantOwner);assertCurrent()
    const selection=await authority.consume(grant.id,"create-work",grantOwner);assertCurrent()
    return selection
  }finally{authority.revokeOwner(grantOwner)}
}
function createOrdinaryServiceWorker(){
  const startup = createRootStartupBuffer()
  const applicationRoot=realpathSync(app.getAppPath())
  worker = new Worker(join(__dirname, "../service/index.cjs"), { workerData: { root: dataRoot, bootstrap:bootstrapPath, migrations: join(applicationRoot, "prisma/migrations"), databaseSeed:join(applicationRoot, "prisma/empty-database.json"), startup } })
  service = new RpcPeer(worker, async (method, value) => {
    if (!modelService) throw new Error("模型服务尚未就绪")
    if (method === "conversation.claim") return conversationDirectories.claim(value)
    if (method === "conversation.release") return conversationDirectories.release(value)
    if (method === "conversation.choose-directory") return conversationDirectories.choose(value)
    if (method === "conversation.create-admission") return conversationDirectories.createAdmission(value)
    if (method === "conversation.create-finished") return conversationDirectories.finishCreate(value)
    if (method === "model.catalog") return repository.read()
    if (method === "model.defaults") return modelService.defaults()
    if (method === "model.resolve") {
      try { return await modelService.resolve(value) }
      catch (error) { const notice = modelFailureNotice(error,value); if (notice) send(notice); throw error }
    }
    if (method === "model.assert") return modelService.assertAuthorization(value)
    if (method === "model.start") return modelService.start(value)
    if (method === "model.image.start") return modelService.startImage(value)
    if (method === "model.read") return modelService.read(value)
    if (method === "model.cancel") return modelService.cancel(value)
    throw new Error("未知主进程服务命令")
  })
  const disconnected = () => {
    if(worker!==currentWorker)return
    novelImport?.cancelPdfWork?.()
    if(novelImportRepairing){novelImportServiceLost=true;service.dispose();return}
    applicationMetadata.revoke()
    conversationDirectories.revokeAll()
    service.dispose()
    novelImportSourcePicker.cancel()
    if(!novelImportRepairing)void novelImport?.close().catch(()=>undefined)
    void modelService?.close().catch(() => undefined)
    send({ type: "service-disconnected" })
    const responses = [...responseOwners.values()]; responseOwners.clear()
    void Promise.allSettled(responses.map(response => response.cancel()))
  }
  const currentWorker=worker
  worker.on("error", disconnected); worker.on("exit", () => {if(worker===currentWorker){ordinaryWorkerExited=true;conversationDirectories.workerStopped();disconnected()}})
  ordinaryWorkerExited=false
  return startup
}
async function launch() {
  const assertLock=()=>{if(!app.hasSingleInstanceLock())throw Error("LOCK_REQUIRED")}
  assertNoLegacyBackupRecovery(bootstrapPath,assertLock)
  if(startupSelectionError||!startupPaths)throw startupSelectionError??Error("BRAND_STARTUP_INVALID")
  dataRoot = startupPaths.defaultRoot
  // The synchronous worker barrier validates and owns the root before Electron
  // creates caches or any UI. Legacy recovery controls are inspected above.
  const startup=createOrdinaryServiceWorker(),rootStartup=waitRootStartup(startup)
  if(rootStartup.status!=="ready"){failedRootCode=rootStartup.code;throw new Error(rootStartup.code)}
  dataRoot=rootStartup.root
  app.setPath("sessionData", prepareSessionDirectory(dataRoot))
  await service.call("ready")
  await app.whenReady()
  let vault: ModelRepository
  const gateway = new ModelGateway({ keyFor: (id, revision) => vault.keyFor(id, revision), fetch: globalThis.fetch })
  vault = repository = new ModelRepository(join(dataRoot, "state.json"), safeStorage, gateway,metadataWrites)
  await repository.initialize()
  modelService = new ModelService(repository, gateway)
  modelConfiguration = new ModelConfigurationService({ repository, gateway, fetch: globalThis.fetch, catalogs: new ModelCatalogRepository(join(dataRoot, "model-catalogs.json"), metadataWrites) })
  avatarAssets = new AvatarAssetService({ root: dataRoot,...metadataWrites })
  onboardingService = new OnboardingService({ repository, avatarAssets })
  configurationFiles=new ConfigurationFiles({repository,catalogs:trustedCommandCatalogs,protectedRoots:async()=>[dataRoot,bootstrapPath,...await service.call<string[]>("protected-directories")],assertOwner:owner=>{
    if(!window||window.isDestroyed()||!draftSession||closingFlow||!owner.startsWith(`${window.webContents.id}:${draftSession.id}:`))throw Error("配置所属窗口已变化")
  },chooseImport:async()=>{const selected=await dialog.showOpenDialog(window!,{title:"导入配置",properties:["openFile"],filters:[{name:"玄印写作配置",extensions:["json"]}]});return selected.canceled?null:selected.filePaths[0]??null},
  chooseExport:async()=>{const selected=await dialog.showSaveDialog(window!,{title:"导出配置",defaultPath:"玄印写作-配置.json",filters:[{name:"玄印写作配置",extensions:["json"]}]});return selected.canceled?null:selected.filePath??null}})
  fileExports=new FileExports({assertOwner:owner=>{
    if(!window||window.isDestroyed()||!draftSession?.ready||draftSession.owner!==window.webContents.id||closingFlow||businessGate.closed||owner!==`${window.webContents.id}:${draftSession.id}`)throw Error("导出所属窗口已变化")
  },chooseSave:async(_owner,input)=>{
    const selected=await dialog.showSaveDialog(window!,{title:input.format==="templates"?"导出模板":"导出稿件",defaultPath:input.filename,filters:[{name:input.format==="templates"?"玄印写作模板":input.extension.toUpperCase(),extensions:[input.extension]}]})
    return selected.canceled?null:selected.filePath??null
  },guardTarget:async target=>guardFileExportTarget(target,{dataRoots:[dataRoot,bootstrapPath],workRoots:await service.call<string[]>("protected-directories")})})
  recoveryExports=makeRecoveryExports()
  const importRoot=dataRoot,pdfClient=new NovelImportPdfClient({appRoot:app.getAppPath()})
  novelImport=new NovelImportController({wizard:true,imageModel:novelImportImageModel,generateImage:generateNovelImportImage,root:importRoot,pdfClient,assertPdfOwner:assertNovelImportOwner,choose:chooseNovelSources,chooseTarget:chooseNovelTarget,
    protectedDirectories:async()=>[bootstrapPath,...await service.call<string[]>('protected-directories')],models:novelImportModels,
    ai:request=>businessGate.run(()=>service.call('novel-import-ai',request)),cancelAi:async operationId=>{await service.call('novel-import-cancel',operationId)},
    publish:input=>businessGate.run(()=>service.call('novel-import-publish',input)),repairTarget:repairNovelImportTarget,
    changed:view=>send({type:'novel-import',view}),reading:active=>send({type:'novel-import-reading',active}),assertCurrent:()=>{if(dataRoot!==importRoot||businessClosed)throw Error('导入数据根已关闭或变化')},
  })
  await novelImport.initialize()
  draftJournal = new DraftJournal(dataRoot,metadataWrites)
  protocol.handle("shakeink", async request => {
    const url = new URL(request.url)
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 403 })
    if (url.hostname === "asset") {
      const id = /^\/global\/([0-9a-f-]{36})$/.exec(url.pathname)?.[1]
      if (!id || url.search || url.username || url.password) return new Response(null, { status: 404 })
      try {
        const bytes = await businessGate.run(()=>avatarAssets.readAsset(id))
        if (!bytes) return new Response(null, { status: 404 })
        return new Response(request.method === "HEAD" ? null : new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Cache-Control": "private, max-age=31536000, immutable" } })
      } catch { return new Response(null, { status: 404 }) }
    }
    if (url.hostname !== "app") return new Response(null, { status: 403 })
    if(localImageRequest(url.pathname+url.search)){
      if(!["GET","HEAD"].includes(request.method))return new Response(null,{status:405})
      try{
        const asset=await businessGate.run(()=>service.call<{bytes:Uint8Array;mime:string}>("image-asset",url.pathname))
        if(!["image/png","image/jpeg","image/webp","image/gif"].includes(asset.mime)||asset.bytes.byteLength>10*1024*1024)throw Error("INVALID_IMAGE")
        return new Response(request.method==="HEAD"?null:new Uint8Array(asset.bytes),{headers:{"Content-Type":asset.mime,"Content-Length":String(asset.bytes.byteLength),"X-Content-Type-Options":"nosniff","Cache-Control":"private, max-age=31536000, immutable","Content-Security-Policy":"default-src 'none'"}})
      }catch{return new Response(null,{status:404})}
    }
    return staticUiResponse(request,join(app.getAppPath(),"out"))
  })
  const localFontsAllowed = (contents: Electron.WebContents | null, permission: string, details: { isMainFrame: boolean; requestingUrl?: string }) => permission === "local-fonts" && !!window && contents === window.webContents && details.isMainFrame && details.requestingUrl === "shakeink://app/"
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(localFontsAllowed(contents, permission, details)))
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => localFontsAllowed(contents, permission, details))
  session.defaultSession.on("will-download",event=>event.preventDefault())
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !["shakeink:", "devtools:", "blob:", "data:"].includes(new URL(details.url).protocol) }))
  registerIpc()
  closeCoordinator=new CloseCoordinator({
    current:()=>window&&draftSession?{owner:window.webContents.id,sessionId:draftSession.id}:null,
    busy:async()=>{const status=await service.call<{active:number}>("task-status");return status.active>0||modelService.activeCount>0||modelConfiguration.activeCount>0||!!novelImport?.active},
    confirmStop:async()=>await appPrompts.ask({tone:"question",title:"仍有创作任务运行",message:"停止正在执行的任务后关闭？",detail:"已保存的内容和待确认草稿会保留。",buttons:[{value:"cancel",label:"取消关闭",variant:"outline"},{value:"stop",label:"停止任务并继续",variant:"destructive"}],defaultValue:"cancel",cancelValue:"cancel"})==="stop",
    stopTasks:async()=>{
      novelImport?.cancelPdfWork?.()
      novelImportSourcePicker.cancel()
      if(window)modelConfiguration.cancelOwner(String(window.webContents.id))
      const timeout=Promise.withResolvers<never>(),timer=setTimeout(()=>timeout.reject(new Error("停止任务超时，窗口与草稿已保留")),10000)
      try{await Promise.race([(async()=>{await novelImport?.pauseAll();await Promise.all([modelService.close(),service.call("stop-tasks")])})(),timeout.promise])}
      finally{clearTimeout(timer)}
    },
    flush:flushDraftForClose,
    closeData:async()=>{
      novelImport?.cancelPdfWork?.()
      novelImportSourcePicker.cancel()
      await novelImport?.drainPdfWork?.()
      await novelImport?.close()
      if(window){recoveryExports.cancelWindow(`${window.webContents.id}:`);fileExports.cancelWindow(`${window.webContents.id}:`);configurationFiles.cancelWindow(`${window.webContents.id}:`);modelConfiguration.cancelOwner(String(window.webContents.id));avatarAssets.cancelOwner(String(window.webContents.id))}
      const drained=businessGate.close()
      conversationDirectories.revokeAll()
      await Promise.allSettled([...responseOwners.values()].map(response=>response.cancel()))
      await drained;await conversationDirectories.flush();await recoveryExports.flush();await fileExports.flush();await configurationFiles.flush();await repository.read();await service.call("close")
      businessClosed=true
      await draftJournal.read()
      const drainedMetadata=await applicationMetadata.acquire();applicationMetadata.release(drainedMetadata)
      await migrationHandoff?.armClosed()
    },
    closedHandoffPending:()=>!!workLease?.requiresRestart,
    afterClose:async()=>{await workLease?.finishClosed()},
    failed:async()=>{
      if(workLease?.requiresRestart)return await appPrompts.ask({tone:"warning",title:"作品锁修复交接尚未完成",message:"作品锁修复状态尚未确认保存。",detail:"原文件与恢复草稿已保留。工作台暂不接受修改，请重试完成交接后重新启动。",buttons:[{value:"cancel",label:"稍后重试",variant:"outline"},{value:"retry",label:"重试交接",variant:"default"}],defaultValue:"cancel",cancelValue:"cancel"})==="retry"?"retry":"cancel"
      const choice=await appPrompts.ask({tone:"warning",title:"尚不能关闭",message:"部分修改尚未确认保存。",detail:"窗口和原草稿已保留。可以重试、导出恢复草稿，或返回继续处理。",buttons:[{value:"cancel",label:"取消关闭",variant:"outline"},{value:"export",label:"导出草稿",variant:"outline"},{value:"retry",label:"重试",variant:"default"}],defaultValue:"cancel",cancelValue:"cancel"})
      return choice==="retry"||choice==="export"?choice:"cancel"
    },
    exportDraft:async owner=>{const reply=await closeChannel.request(owner,"export");if(!window||window.isDestroyed()||window.webContents.id!==owner.owner||draftSession?.owner!==owner.owner||draftSession.id!==owner.sessionId)throw new Error("草稿所属窗口已变化");if(reply.status!=="export")throw new Error("无法读取草稿");await exportDraftSnapshot(reply.snapshot)},
    commit:async intent=>{migrationHandoff?.commit();workLease?.commit();closeCommitted=true;if(window)closePermits.add(window);if(intent==="quit"){quitting=true;void worker.terminate();app.quit()}else window?.close()},
    release:async()=>{closeChannel.cancel();if(!closeCommitted){
      if(workLease?.requiresRestart){send({type:"work-lease-pending"});return}
      await workLease?.cancel()
      try{await migrationHandoff?.cancelPrepared();await restoreBusiness()}
      catch(error){void businessGate.close();send({type:"migration-cancel-pending"});throw error}
    }},
  })
  // Subscribe before loadURL so a system change during first paint is retained.
  nativeTheme.on("updated", () => {
    applyMainWindowAppearance()
    send({ type: "theme", dark: nativeTheme.shouldUseDarkColors })
  })
  await createWindow()
  app.on("second-instance", () => { window?.show(); window?.focus() })
  app.on("activate", () => { if(closingFlow||migrationHandoff?.pending||workLease?.pending)return;if (!window) void createWindow(); else window.show() })
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
  app.on("before-quit", event => {
    if (quitting) return
    event.preventDefault()
    beginClose("quit")
  })
}
async function restoreBusiness(){if(workLease?.requiresRestart)throw Error("作品锁修复交接必须完成后重新启动");if(novelImportServiceLost||ordinaryWorkerExited||worker.threadId===-1)throw Error('本地服务已断开，请重新启动后恢复导入');if(businessGate.closed)await businessGate.close();novelImport?.reopenPdfWork?.();businessGate.reopen();businessClosed=false;modelService.resume();send({type:"close-cancelled"})}
async function retryMigrationCancellation(){
  if(closingFlow)throw Error("迁移交接仍在处理中")
  await migrationHandoff?.cancelPrepared();await restoreBusiness();migrationHandoff=null
}
function businessHandle(channel:string,handler:(event:IpcMainInvokeEvent,...args:any[])=>unknown){
  ipcMain.handle(channel,(event,...args)=>businessGate.run(async()=>handler(event,...args)))
}
function registerIpc() {
  ipcMain.handle('desktop:novel-import-sources',async(event,input)=>{
    trusted(event);const action=sourcePickerActionSchema.parse(input)
    if(action.type==='current'&&!novelImportOwner)return null
    assertNovelImportOwner()
    return businessGate.run(()=>novelImportSourcePicker.act(action))
  })
  ipcMain.handle('desktop:novel-import',async(event,input)=>{
    trusted(event);const action=importActionSchema.parse(input)
    if(!window||window.isDestroyed()||!draftSession?.ready||draftSession.owner!==event.sender.id||closingFlow||quitting||businessGate.closed||migrationHandoff?.pending||workLease?.pending||novelImportRepairing)throw Error('请等待工作台就绪，或完成当前关闭与维护操作')
    const ownerWindow=window,ownerSession=draftSession
    if(!novelImportOwner||novelImportOwner.window!==ownerWindow||novelImportOwner.session!==ownerSession)novelImportOwner={window:ownerWindow,session:ownerSession}
    if(action.type==='cancel-pdf-preview')return novelImport.cancelPdfPreview(action.id,action.requestId)
    if(action.type==='repair-target')return novelImport.act(action)
    return businessGate.run(()=>novelImport.act(action))
  })
  ipcMain.handle("desktop:work-lease",async(event,input)=>{
    trusted(event);const action=workLeaseRequestSchema.parse(input)
    if(action.type==="retry"){
      if(!workLease?.requiresRestart)throw Error("没有待完成的作品锁恢复")
      beginClose("quit");return closingFlow&&await closingFlow?"restarting":"pending"
    }
    if(closingFlow||migrationHandoff||workLease||businessGate.closed||novelImportRepairing)throw Error("恢复、迁移或关闭仍在处理中")
    const ownerWindow=window,ownerSession=draftSession
    if(!ownerWindow||!ownerSession?.ready)throw Error("请等待工作台加载完成")
    const identity={owner:ownerWindow.webContents.id,sessionId:ownerSession.id}
    const assertOwner=(owner:CloseOwner)=>{trusted(event);if(window!==ownerWindow||ownerWindow.isDestroyed()||draftSession!==ownerSession||owner.owner!==ownerSession.owner||owner.sessionId!==ownerSession.id)throw Error("作品锁恢复所属窗口已变化")}
    const handoff=new WorkLeaseHandoff({workId:action.workId,owner:identity},{
      assertOwner,assertHost:()=>{if(!app.hasSingleInstanceLock())throw Error("LOCK_REQUIRED")},
      namesForWork:workNames,
      assertClosed:()=>{if(!businessClosed||!businessGate.closed)throw Error("恢复前本地数据尚未关闭")},
      target:workId=>service.call("closed-work-lease-target",workId),
      confirm:async(preview,signal)=>{
        assertOwner(identity)
        const result=await appPrompts.ask({tone:"warning",title:"修复异常退出锁",message:"移除已退出进程留下的作品锁？",detail:`作品目录：${preview.work.path}\n原进程：${preview.owner.pid}\n原设备：${preview.owner.host}\n已确认该本机进程退出。只处理这次确认的锁，作品内容保持原样。完成或取消后应用都会重新启动。`,buttons:[{value:"cancel",label:"取消",variant:"outline"},{value:"repair",label:"修复并重新启动",variant:"destructive"}],defaultValue:"cancel",cancelValue:"cancel"},{signal})
        assertOwner(identity);return !signal.aborted&&result==="repair"
      },
      close:async()=>{beginClose("quit");return closingFlow?await closingFlow:false},
      notice:async message=>{assertOwner(identity);await appPrompts.ask({tone:"info",title:"作品锁恢复结果",message,buttons:[{value:"ok",label:"重新启动",variant:"default"}],defaultValue:"ok",cancelValue:"ok"});assertOwner(identity)},
      restart:()=>app.relaunch(),
    })
    workLease=handoff
    try{return await handoff.start()?"restarting":handoff.requiresRestart?"pending":"cancelled"}
    finally{if(!handoff.requiresRestart&&workLease===handoff)workLease=null}
  })
  ipcMain.handle("desktop:migrate-root",async(event,input)=>{
    trusted(event)
    const action=z.enum(["start","cancel"]).parse(input)
    if(action==="cancel"){await retryMigrationCancellation();return false}
    if(closingFlow||migrationHandoff||workLease||novelImportRepairing)throw Error("作品锁修复、迁移或关闭仍在处理中")
    const ownerWindow=window,ownerSession=draftSession
    if(!ownerWindow||!ownerSession?.ready)throw Error("请等待工作台加载完成")
    const source=new DataRootManager(bootstrapPath,dataRoot)
    const assertOwner=()=>{trusted(event);if(window!==ownerWindow||draftSession!==ownerSession)throw Error("迁移所属窗口已变化")}
    const requests=new RootMigrationRequests(bootstrapPath,{resolveSource:()=>source.resolve(),assertStableLock:()=>{if(!app.hasSingleInstanceLock())throw Error("LOCK_REQUIRED")},assertOwner:nonce=>handoff.assertOwner(nonce),assertClosed:()=>{if(!businessClosed||!businessGate.closed)throw Error("SOURCE_NOT_CLOSED")}})
    const handoff=new RootMigrationHandoff({requests,assertOwner,choose:async()=>{
      const grant=await chooseDirectory("data-root",String(event.sender.id));assertOwner()
      if(!grant)return null
      const target=await authority.consume(grant.id,"data-root",String(event.sender.id));assertOwner()
      if((await readdir(target.path)).length)throw Error("请选择一个空目录用于迁移应用数据")
      return target
    },confirm:async target=>{
      const result=await appPrompts.ask({tone:"question",title:"迁移应用数据",message:"迁移应用数据并重新启动？",detail:`目标目录：${target.path}\n草稿和设置保存后会重新启动，显示迁移进度。作品继续存放在各自的目录中。`,buttons:[{value:"cancel",label:"取消",variant:"outline"},{value:"migrate",label:"迁移并重新启动",variant:"default"}],defaultValue:"cancel",cancelValue:"cancel"})
      assertOwner();return result==="migrate"
    },close:async()=>{beginClose("quit");return closingFlow?await closingFlow:false},restart:()=>app.relaunch()})
    migrationHandoff=handoff
    try{return await handoff.start()}
    finally{if(!handoff.pending){if(!closeCommitted&&businessGate.closed)await restoreBusiness();if(migrationHandoff===handoff)migrationHandoff=null}}
  })
  businessHandle("desktop:configuration",async(event,input)=>{
    trusted(event)
    if(!draftSession||draftSession.owner!==event.sender.id||closingFlow)throw Error("配置所属窗口不可用")
    const ownerSession=draftSession,currentWindow=window
    const active=()=>{trusted(event);if(draftSession!==ownerSession||window!==currentWindow)throw Error("配置所属窗口已变化")}
    const action=z.discriminatedUnion("type",[
      z.object({type:z.literal("preview"),sessionId:z.uuid()}).strict(),z.object({type:z.literal("export"),sessionId:z.uuid()}).strict(),z.object({type:z.literal("cancel"),sessionId:z.uuid()}).strict(),
      z.object({type:z.literal("apply"),sessionId:z.uuid(),token:z.uuid(),choices:z.unknown()}).strict(),
    ]).parse(input)
    const owner=`${event.sender.id}:${draftSession.id}:${action.sessionId}`
    if(action.type==="cancel"){configurationFiles.cancel(owner);return true}
    if(action.type==="preview"){const result=await configurationFiles.preview(owner);active();return result}
    if(action.type==="export"){const result=await configurationFiles.export(owner);active();return result}
    const state=await configurationFiles.apply(owner,action.token,action.choices as import("../core/configuration-transfer").ConfigurationImportChoices)
    active()
    window?.webContents.setZoomFactor(state.settings.appearance.zoom);send({type:"state",state});return state
  })
  businessHandle("desktop:file-export",async(event,input)=>{
    trusted(event)
    if(!draftSession?.ready||draftSession.owner!==event.sender.id||closingFlow)throw Error("导出所属窗口不可用")
    return fileExports.save(`${event.sender.id}:${draftSession.id}`,input)
  })
  ipcMain.handle("desktop:file-export-cancel",async(event,input)=>{
    trusted(event)
    if(!draftSession||draftSession.owner!==event.sender.id)throw Error("导出所属窗口已变化")
    fileExports.cancel(`${event.sender.id}:${draftSession.id}`,z.uuid().parse(input))
  })
  // Not business-gated: the close flow asks after the gate closed.
  ipcMain.handle("desktop:prompts",async event=>{trusted(event);return appPrompts.list()})
  ipcMain.handle("desktop:prompt-reply",async(event,input)=>{trusted(event);const reply=promptReplySchema.parse(input);return appPrompts.reply(reply.id,reply.value)})
  ipcMain.handle("desktop:close-reply",async(event,sessionId,id,reply)=>{
    trusted(event)
    if(!draftSession||draftSession.owner!==event.sender.id||draftSession.id!==z.uuid().parse(sessionId))throw new Error("草稿所属窗口已变化")
    return closeChannel.reply({owner:event.sender.id,sessionId},z.uuid().parse(id),reply)
  })
  ipcMain.handle("desktop:draft-export",async(event,sessionId,snapshot)=>{
    trusted(event)
    if(!draftSession||draftSession.owner!==event.sender.id||draftSession.id!==z.uuid().parse(sessionId))throw new Error("草稿所属窗口已变化")
    return exportDraftSnapshot(snapshot)
  })
  ipcMain.handle("desktop:draft-persist", async (event, sessionId, snapshot) => {
    trusted(event)
    if(!draftSession||draftSession.owner!==event.sender.id||draftSession.id!==z.uuid().parse(sessionId))throw new Error("草稿所属窗口已变化")
    if(!draftSession.ready)throw new Error("草稿恢复尚未就绪")
    if(businessClosed)throw Error("草稿数据已关闭")
    const receipt=await draftJournal.persist(String(event.sender.id),snapshot)
    trusted(event)
    if(draftSession?.id!==sessionId)throw new Error("草稿所属窗口已变化")
    return receipt
  })
  ipcMain.handle("desktop:draft-ready",async(event,sessionId)=>{
    trusted(event)
    if(!draftSession||draftSession.owner!==event.sender.id||draftSession.id!==z.uuid().parse(sessionId))throw new Error("草稿所属窗口已变化")
    if(closingFlow)throw new Error("工作台正在关闭")
    draftSession.ready=true
  })
  ipcMain.handle("desktop:draft-read", async (event, sessionId) => {
    trusted(event)
    if(!draftSession||draftSession.owner!==event.sender.id||draftSession.id!==z.uuid().parse(sessionId))throw new Error("草稿所属窗口已变化")
    const snapshot=await draftJournal.read()
    trusted(event)
    if(draftSession?.id!==sessionId)throw new Error("草稿所属窗口已变化")
    return snapshot
  })
  ipcMain.handle("desktop:clipboard-write", async (event, input) => {
    trusted(event)
    if(!window?.isFocused())throw new Error("应用窗口未聚焦")
    const text=z.string().max(1024*1024).parse(input)
    await clipboard.writeText(text)
  })
  ipcMain.handle("desktop:input-context-menu", async (event, input) => {
    trusted(event)
    const state=inputContextStateSchema.parse(input),current=window
    if(!current?.isFocused()||closingFlow||businessGate.closed)return null
    const command=await inputContextMenus.open(current,state)
    trusted(event)
    return window===current&&current.isFocused()&&!closingFlow&&!businessGate.closed ? command : null
  })
  ipcMain.handle('desktop:text-context-menu',async(event,input)=>{
    trusted(event)
    const request=textContextRequestSchema.parse(input),owner=BrowserWindow.fromWebContents(event.sender),frame=event.senderFrame
    if(!owner||owner!==window||!owner.isFocused()||closingFlow||businessGate.closed)return {requestId:request.requestId,command:null}
    const result=await textContextMenus.open(owner,request,{platform:process.platform==='darwin'?'darwin':'win32',shortcuts:menuShortcuts})
    try{trusted(event)}catch{return {requestId:request.requestId,command:null}}
    return owner===window&&!owner.isDestroyed()&&owner.isFocused()&&frame===owner.webContents.mainFrame&&!closingFlow&&!businessGate.closed?result:{requestId:request.requestId,command:null}
  })
  ipcMain.handle('desktop:text-context-menu-cancel',async(event,input)=>{
    trusted(event);const id=z.uuid().parse(input),owner=BrowserWindow.fromWebContents(event.sender)
    if(owner)textContextMenus.cancel(owner,id)
  })
  ipcMain.handle("desktop:clipboard-read", async event => {
    trusted(event)
    if(!window?.isFocused())throw new Error("应用窗口未聚焦")
    const text=await clipboard.readText()
    trusted(event)
    if(!window?.isFocused())throw new Error("应用窗口未聚焦")
    if(text.length>1024*1024)throw new Error("剪贴板内容过长")
    return text
  })
  businessHandle("desktop:bootstrap", async event => {
    trusted(event)
    const current=draftSession
    if(!current||current.owner!==event.sender.id)throw new Error("草稿所属窗口已变化")
    const state=await repository.read();trusted(event)
    if(draftSession!==current)throw new Error("草稿所属窗口已变化")
    // Bootstrap.platform is the renderer's darwin|win32 contract, but
    // process.platform reports "linux" (and other POSIX values) on hosts the
    // renderer has no namespace for: settings.shortcuts["linux"] is undefined,
    // which crashed composer/command consumers and blanked the whole tree.
    // Non-darwin hosts keep the win32 contract, matching the menus (:660),
    // shortcut read (:677) and text context menu (:479) that already do this.
    const rendererPlatform=process.platform==="darwin"?"darwin":"win32"
    return {...state,platform:rendererPlatform,version:displayAppVersion(app.getVersion()),dataRoot,draftSessionId:current.id,systemDark:nativeTheme.shouldUseDarkColors}
  })
  businessHandle("desktop:directory", async (event, purpose) => { trusted(event); return chooseDirectory(directoryPurpose.parse(purpose), String(event.sender.id)) })
  businessHandle("desktop:model-discover", async (event, id, draft) => { trusted(event); return modelConfiguration.discover(String(event.sender.id), z.uuid().parse(id), draft) })
  businessHandle("desktop:model-catalog-read", async (event, input) => {
    trusted(event)
    const scope = z.object({ provider: z.enum(["openai", "anthropic", "google", "xai", "deepseek", "moonshot", "zai", "xiaomi", "alibaba", "minimax", "tencent", "bytedance", "custom"]), kind: z.enum(["TEXT", "IMAGE"]), protocol: z.enum(["openai", "anthropic"]), endpoint: z.string().url().max(2048) }).strict().parse(input)
    return modelConfiguration.readCatalog(scope)
  })
  businessHandle("desktop:model-test", async (event, id, draft) => { trusted(event); return modelConfiguration.test(String(event.sender.id), z.uuid().parse(id), draft, { authorizeCharge: true }) })
  businessHandle("desktop:model-reveal-key", async (event, id) => { trusted(event); return repository.revealKey(z.uuid().parse(id)) })
  ipcMain.handle("desktop:model-cancel", async (event, id) => { trusted(event); modelConfiguration.cancel(String(event.sender.id), z.uuid().parse(id)) })
  ipcMain.handle("desktop:avatar-choose", async (event, id, acceptedDraftId) => {
    trusted(event)
    const parsed=z.object({sessionId:z.uuid(),acceptedDraftId:z.uuid().nullable().optional()}).strict().safeParse({sessionId:id,acceptedDraftId})
    if(!parsed.success)throw new Error("头像编辑会话无效")
    const {sessionId}=parsed.data,owner=String(event.sender.id)
    if(businessGate.closed)throw new Error("BUSINESS_CLOSED")
    // Allocate the picker epoch when IPC is received, before the business work
    // microtask. A subsequent hide can then cancel even this queued picker.
    avatarAssets.begin(owner,sessionId)
    const selection = avatarAssets.beginSelection(owner,sessionId,parsed.data.acceptedDraftId)
    return businessGate.run(async()=>{
      avatarAssets.assertSelectionActive(owner,sessionId,selection)
      const selected = await dialog.showOpenDialog(window!, { title: "选择头像", properties: ["openFile"], filters: [{ name: "头像图片", extensions: ["png","jpg","jpeg","webp"] }] })
      trusted(event);avatarAssets.assertSelectionActive(owner,sessionId,selection)
      if (selected.canceled || !selected.filePaths[0]) return null
      return avatarAssets.stageSelected(owner,sessionId,selected.filePaths[0],selection)
    })
  })
  ipcMain.handle("desktop:avatar-cancel", async (event, id) => { trusted(event); avatarAssets.cancel(String(event.sender.id),z.uuid().parse(id)) })
  ipcMain.handle("desktop:avatar-selection-cancel", async (event, input) => {
    trusted(event)
    const parsed=z.object({sessionId:z.uuid(),draftId:z.uuid().nullable()}).strict().safeParse(input)
    if(!parsed.success)throw new Error("头像编辑会话无效")
    avatarAssets.cancelSelection(String(event.sender.id),parsed.data.sessionId,parsed.data.draftId)
  })
  businessHandle("desktop:settings", async (event, input: SettingsAction) => {
    trusted(event)
    const envelope = z.object({ type: z.enum(["update", "save-profile", "save-model", "remove-model"]), revision: z.number().int().nonnegative() }).passthrough().parse(input)
    let state: Awaited<ReturnType<ModelRepository["read"]>>
    if (envelope.type === "save-profile") {
      const profile = z.object({ type:z.literal("save-profile"), revision:z.number().int().nonnegative(), sessionId:z.uuid(), user:settingsSchema.shape.user, avatarDraftId:z.uuid().optional() }).strict().parse(input)
      const owner = String(event.sender.id)
      avatarAssets.begin(owner,profile.sessionId)
      const before = await repository.read()
      avatarAssets.assertActive(owner,profile.sessionId)
      if (before.revision !== profile.revision) throw new RevisionConflict()
      if (profile.user.avatarAssetId !== before.settings.user.avatarAssetId) throw new Error("用户资料已变更，请重新打开后保存")
      const avatar = profile.avatarDraftId ? await avatarAssets.persistDraft(owner,profile.sessionId,profile.avatarDraftId) : null
      avatarAssets.assertActive(owner,profile.sessionId,profile.avatarDraftId)
      state = await repository.updateSettings(profile.revision,{...before.settings,user:{...profile.user,avatarAssetId:avatar?.assetId ?? profile.user.avatarAssetId}})
      avatarAssets.cancel(owner,profile.sessionId,profile.avatarDraftId)
    } else if (envelope.type === "update") {
      const settings = settingsSchema.parse((input as Extract<SettingsAction,{type:"update"}>).settings)
      const before = await repository.read()
      if (JSON.stringify(settings.user) !== JSON.stringify(before.settings.user)) throw new Error("用户资料需要在编辑用户对话框中保存")
      state = await repository.updateSettings(envelope.revision,settings)
    } else if (envelope.type === "save-model") state = await repository.saveModel(envelope.revision,(input as Extract<SettingsAction,{type:"save-model"}>).model)
    else state = await repository.removeModel(envelope.revision,z.uuid().parse((input as Extract<SettingsAction,{type:"remove-model"}>).id))
    window?.webContents.setZoomFactor(state.settings.appearance.zoom)
    send({ type: "state", state }); return state
  })
  businessHandle("desktop:onboarding", async (event, input: unknown) => {
    const parsed=onboardingActionSchema.safeParse(input)
    if(!parsed.success)throw new OnboardingError("INVALID_ACTION")
    const action=parsed.data,currentWindow=window,currentSession=draftSession
    const active=()=>{
      try{trusted(event)}catch{throw new OnboardingError("OWNER_UNAVAILABLE")}
      if(!currentWindow||currentWindow.isDestroyed()||window!==currentWindow||!currentSession?.ready||draftSession!==currentSession||
        currentSession.owner!==event.sender.id||currentSession.id!==action.sessionId||closingFlow||quitting||businessGate.closed||migrationHandoff?.pending||workLease?.pending)
        throw new OnboardingError("OWNER_UNAVAILABLE")
    }
    active()
    const state=await onboardingService.commit(String(event.sender.id),action,active)
    active();currentWindow!.webContents.setZoomFactor(state.settings.appearance.zoom)
    send({type:"state",state});return state
  })
  ipcMain.handle("desktop:command", async (event, id) => { trusted(event); await executeCommand(z.string().max(100).parse(id),true) })
  ipcMain.handle("desktop:open-project-repository", async event => { trusted(event); await shell.openExternal(PROJECT_REPOSITORY_URL) })
  ipcMain.handle("desktop:cancel", async (event, id) => { trusted(event); z.uuid().parse(id); const active = responseOwners.get(id); if (active?.owner === event.sender.id) await active.cancel() })
  businessHandle("desktop:request", async (event, value) => {
    trusted(event); const input = requestSchema.parse(value)
    if (responseOwners.size >= 256) throw new Error("本地请求过多，请稍后重试")
    if (responseOwners.has(input.id)) throw new Error("请求编号重复")
    let response: LocalResponse; let local: Uint8Array | undefined
    let canceled = false; let started = false; let port: Electron.MessagePortMain | undefined
    let requestOrigin:ConversationRequestOrigin|undefined
    let canceling: Promise<void> | undefined
    const active = { owner: event.sender.id, cancel: () => {
      if (canceling) return canceling
      canceled = true
      if(requestOrigin)conversationDirectories.endRequest(requestOrigin)
      canceling = Promise.resolve().then(async () => {
        port?.close()
        try { if (started) await service.call("cancel", input.id) }
        finally { if (port && responseOwners.get(input.id) === active) responseOwners.delete(input.id) }
      })
      return canceling
    } }
    responseOwners.set(input.id, active)
    const check = () => { if (canceled || event.sender.isDestroyed() || businessGate.closed) throw new Error("本地请求已取消") }
    try {
    const pathname = new URL(input.path,"https://local.invalid").pathname
    if (pathname === "/api/novels" && input.method === "POST") {
      const grant = await chooseDirectory("create-work", String(event.sender.id))
      check()
      if (!grant) { response = { id: input.id, status: 409, headers: { "content-type": "application/json" } }; local = new TextEncoder().encode(JSON.stringify({ error: "已取消目录选择，创作草稿已保留", code: "DIRECTORY_SELECTION_CANCELLED" })) }
      else {
        const selection = await authority.consume(grant.id, "create-work", String(event.sender.id))
        check()
        check()
        const created = await service.call("create-work", { selection, input: JSON.parse(new TextDecoder().decode(Uint8Array.from(input.body ?? []))) })
        response = { id: input.id, status: 201, headers: { "content-type": "application/json" } }; local = new TextEncoder().encode(JSON.stringify(created))
      }
    } else if (["/api/models", "/api/image-models"].includes(pathname) && input.method === "GET") {
      const state = await repository.read(); const kind = pathname === "/api/models" ? "TEXT" : "IMAGE"
      response = { id: input.id, status: 200, headers: { "content-type": "application/json" } }
      local = new TextEncoder().encode(JSON.stringify({ defaultModelId: kind === "TEXT" ? state.settings.agent.textModelId : state.settings.agent.imageModelId, models: state.models.filter(model => model.kind === kind && model.enabled).map(model => ({ ...model, tier: "NORMAL", free: false, thinkingEfforts: model.thinkingLevels.filter(level => level !== "default").map(level => ({ value: level, label: level })) })) }))
    } else {
      check()
      if(pathname==="/api/chat"&&input.method==="POST"){
        const capturedWindow=window,capturedSession=draftSession
        requestOrigin=conversationDirectories.begin(input.id,String(event.sender.id),()=>{
          trusted(event)
          if(!capturedWindow||window!==capturedWindow||capturedWindow.isDestroyed()||!capturedSession?.ready||draftSession!==capturedSession||capturedSession.owner!==event.sender.id||closingFlow||businessGate.closed||quitting)throw Error("目录授权所属任务窗口已变化")
        })
      }
      started = true; response = await service.call<LocalResponse>("start",requestOrigin?{request:input,origin:requestOrigin}:input)
    }
    check()
    const channel = new MessageChannelMain(); let seq = 0; let reading = false
    port = channel.port1
    port.on("close", () => { if (responseOwners.get(input.id) === active) void active.cancel().catch(() => undefined) })
    const cancel = active.cancel
    channel.port1.on("message", async ({ data }) => {
      if (reading || data?.type !== "pull" || data.seq !== seq) { responseOwners.delete(input.id); await cancel().catch(() => undefined); return }
      reading = true
      try {
        let frame: { done: boolean; bytes?: Uint8Array }
        if (local) { frame = local.length ? { done: false, bytes: local.slice(0, 65536) } : { done: true }; local = local.slice(65536) }
        else frame = await service.call("read", input.id)
        channel.port1.postMessage({ ...frame, seq: seq++ })
        if (frame.done) { if(requestOrigin)conversationDirectories.endRequest(requestOrigin);responseOwners.delete(input.id); channel.port1.close() }
      } catch { channel.port1.postMessage({ error: "本地响应读取失败，请重试", seq: seq++ }); responseOwners.delete(input.id); await cancel().catch(() => undefined) }
      finally { reading = false }
    })
    channel.port1.start(); event.sender.postMessage("desktop:response-port", { id: input.id }, [channel.port2])
    return response
    } catch (error) {
      await active.cancel().catch(() => undefined)
      if (responseOwners.get(input.id) === active) responseOwners.delete(input.id)
      throw error
    }
  })
}
function menuTemplate(): MenuItemConstructorOptions[] {
  const roles: Record<string, MenuItemConstructorOptions["role"]> = { "app.services": "services", "app.hide": "hide", "app.hideOthers": "hideOthers", "app.showAll": "unhide", "window.minimize": "minimize", "window.front": "front" }
  return desktopMenu(process.platform === "darwin" ? "darwin" : "win32",menuShortcuts).map(group => ({
    id:`menu.${group.id}`, label:group.label, submenu:group.items.map(command => {
      const accelerator=electronAccelerator(command.binding)
      return { id:command.id, label:command.label + (command.binding && !accelerator ? `（${command.binding}）` : ""), role:roles[command.id], enabled:command.enabled, accelerator,
        click:() => { void executeCommand(command.id).catch(() => send({type:"notice",tone:"error",message:"操作未完成，请检查当前窗口或任务状态后重试。"})) } }
    }),
  }))
}
function applyMainWindowAppearance() {
  syncNativeThemeSource(nativeTheme, windowTheme)
  applyWindowAppearance(window, process.platform, windowTheme, nativeTheme.shouldUseDarkColors)
}
function refreshMenus(state: Awaited<ReturnType<ModelRepository["read"]>>) {
  if (state.revision < menuRevision) return
  menuRevision=state.revision
  windowTheme=state.settings.appearance.theme
  applyMainWindowAppearance()
  menuShortcuts=structuredClone(state.settings.shortcuts[process.platform === "darwin" ? "darwin" : "win32"])
  if (process.platform === "darwin" && app.isReady()) Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate()))
}
async function executeCommand(id: string, fromRenderer=false) {
  if((closingFlow||businessGate.closed)&&!["app.quit","window.close"].includes(id))return
  if (id === "app.menu") { if (window) Menu.buildFromTemplate(menuTemplate()).popup({ window }); return }
  if (!commands.commands.some(command => command.id === id)) throw new Error("未知应用命令")
  // Editing is owned by the retained renderer target; never queue native edits
  // against whichever field happens to be focused when IPC reaches main.
  if (fromRenderer && id.startsWith("text.")) {
    throw new Error("文本编辑命令必须由当前输入控件执行")
  }
  if(id.startsWith("menu.")){
    if(window){const group=menuTemplate().find(group=>group.id===id);if(group&&Array.isArray(group.submenu))Menu.buildFromTemplate(group.submenu).popup({window})}
    return
  }
  if(id==="app.hide"){if(process.platform==="darwin")app.hide();return}
  if(id==="app.hideOthers"){if(process.platform==="darwin")Menu.sendActionToFirstResponder("hideOtherApplications:");return}
  if(id==="app.showAll"){if(process.platform==="darwin")Menu.sendActionToFirstResponder("unhideAllApplications:");return}
  if(id==="window.front"){for(const owned of BrowserWindow.getAllWindows())owned.moveTop();return}
  if (id === "app.quit") { app.quit(); return }
  if (id === "window.close") { window?.close(); return }
  if (id === "window.minimize") { window?.minimize(); return }
  if (id === "window.maximize") { if (window?.isMaximized()) window.unmaximize(); else window?.maximize(); return }
  if (id === "view.fullscreen") { window?.setFullScreen(!window.isFullScreen()); return }
  if (id === "help.website") { await shell.openExternal(PROJECT_WEBSITE_URL); return }
  if (id === "help.docs") { await shell.openExternal(PROJECT_DOCS_URL); return }
  if (id === "help.faq") { await shell.openExternal(PROJECT_FAQ_URL); return }
  if (id === "help.guide") { await shell.openExternal(PROJECT_GUIDE_URL); return }
  if (id === "help.feedback") { await shell.openExternal("https://github.com/mySingleLive/shakeink-desktop/issues/new/choose"); return }
  if (id === "app.about") {
    if (process.platform === "darwin") { app.setAboutPanelOptions({ applicationName: "玄印写作", applicationVersion: displayAppVersion(app.getVersion()), version: "", copyright: "GPL-3.0 · ShakeInk" }); app.showAboutPanel() }
    else {
      const theme=(await repository.read()).settings.appearance.theme
      const about = new BrowserWindow({ width: 440, height: 400, resizable: false, minimizable: false, maximizable: false, parent: window ?? undefined, modal: true, title: "关于玄印写作", webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
      installProjectAboutLinks(about.webContents,url=>shell.openExternal(url),()=>{if(!about.isDestroyed())void about.webContents.executeJavaScript(PROJECT_ABOUT_LINK_ERROR_SCRIPT).catch(()=>{})})
      about.setMenu(null); await about.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(projectAboutHtml(displayAppVersion(app.getVersion()),theme==='ink'||theme==='system'&&nativeTheme.shouldUseDarkColors?'ink':'paper')))
    }
    return
  }
  if (id === "file.open") {
    await businessGate.run(async()=>{
      const owner=String(window?.webContents.id),current=window
      const grant=await chooseDirectory("open-work",owner)
      if(!grant)return
      if(closingFlow||businessGate.closed||window!==current||!current||current.isDestroyed())throw Error("作品所属窗口已变化或正在关闭")
      const proof=await authority.consume(grant.id,"open-work",owner)
      if(closingFlow||businessGate.closed||window!==current||current.isDestroyed())throw Error("作品所属窗口已变化或正在关闭")
      await service.call("open-work",proof);send({type:"command",id:"works.refresh"})
    })
    return
  }
  send({ type: "command", id })
}
async function createWindow() {
  // A macOS window-only close drained the services, but did not quit the app.
  // Reopening may resume them only after any durable migration handoff is gone.
  if(businessGate.closed){
    if(closingFlow||migrationHandoff?.pending||workLease?.pending||quitting)throw Error("工作台仍在关闭或等待维护交接")
    await restoreBusiness()
  }
  modelService.resume()
  const state = await repository.read()
  refreshMenus(state)
  const nativeAppearance = nativeWindowAppearance(state.settings.appearance.theme, nativeTheme.shouldUseDarkColors)
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 760, minHeight: 580, show: false, title: "玄印写作", backgroundColor: nativeAppearance.backgroundColor, titleBarStyle: "hidden", trafficLightPosition: { x: 14, y: 14 }, ...(process.platform === "win32" ? { titleBarOverlay: nativeAppearance.titleBarOverlay } : {}), webPreferences: { preload: join(__dirname, "../preload/index.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } })
  const current = window
  if (process.platform === "win32") installWindowsCloseAccent(current, { BaseWindow, ImageView, nativeImage, screen }, nativeAppearance.titleBarOverlay.symbolColor)
  current.webContents.setZoomFactor(state.settings.appearance.zoom)
  // Keyboard bindings are resolved once in the renderer, including secondary
  // bindings, chords, IME and shortcut recording. Native menus remain clickable.
  current.webContents.setIgnoreMenuShortcuts(true)
  const ownerId = current.webContents.id
  current.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  current.webContents.on("will-navigate", event => event.preventDefault())
  current.webContents.on("will-attach-webview", event => event.preventDefault())
  const releaseOwner = () => {
    if(novelImportOwner?.window===current){novelImport?.cancelPdfWork?.();novelImportSourcePicker.cancel();novelImportOwner=null;void novelImport?.close().catch(()=>undefined)}
    conversationDirectories.revokeOwner(String(ownerId))
    closeChannel.cancel()
    appPrompts.cancelAll()
    recoveryExports.cancelWindow(`${ownerId}:`)
    fileExports.cancelWindow(`${ownerId}:`)
    configurationFiles.cancelWindow(`${ownerId}:`)
    if(draftSession?.owner===ownerId){void workLease?.cancel().catch(()=>{});draftSession.release();draftSession=null}
    authority.revokeOwner(String(ownerId))
    modelConfiguration.cancelOwner(String(ownerId))
    avatarAssets.cancelOwner(String(ownerId))
    for (const response of responseOwners.values()) if (response.owner === ownerId) void response.cancel().catch(() => undefined)
  }
  current.webContents.on("render-process-gone", releaseOwner)
  current.webContents.on("destroyed", releaseOwner)
  current.webContents.on("did-start-navigation", (details,legacyUrl,legacySameDocument,legacyMainFrame) => {
    const mainFrame=details.isMainFrame??legacyMainFrame,sameDocument=details.isSameDocument??legacySameDocument
    // Hydration/history updates retain this document's task capabilities. Only
    // a new (or unknown) main document revokes them and creates a fresh session.
    if(mainFrame!==false&&sameDocument!==true){releaseOwner();if((details.url??legacyUrl)==="shakeink://app/")draftSession={owner:ownerId,id:randomUUID(),ready:false,release:draftJournal.activate(String(ownerId))}}
  })
  current.on("closed", () => { releaseOwner(); if (window === current) window = null; appPrompts.cancelAll({force:true}) })
  current.on("close",event=>{if(quitting||closePermits.delete(current))return;event.preventDefault();beginClose(process.platform==="win32"?"quit":"window")})
  refreshMenus(state)
  if (process.platform !== "darwin") current.setMenu(null)
  current.once("ready-to-show", () => current.show())
  await current.loadURL("shakeink://app/")
}

if(!startupPaths){
  void app.whenReady().then(()=>{dialog.showErrorBox("玄印写作无法启动","本地数据未能安全打开。原文件已保留，请检查目录和权限。");app.exit(1)})
}
else if (!app.requestSingleInstanceLock()) app.quit()
else {
  const recoveryRootFor=(family:BrandStartupPaths["encryptionFamily"])=>isolatedRoot?resolve(isolatedRoot):join(homedir(),family==="legacy"?".xuanxiang":".shakeink")
  // Unrepairable config roots degrade to a real workbench on a throwaway root
  // plus a wipe-or-quit modal; the broken root stays untouched until the user
  // chooses. launch() is only re-entered before its first protocol.handle /
  // registerIpc (failedRootCode throws ahead of both), so a second call is safe.
  const launchConfigResetOffer=(reason:string)=>{
    const family=startupPaths!.encryptionFamily,recoveryRoot=recoveryRootFor(family)
    const originalBootstrap=bootstrapPath
    const assertLock=()=>{if(!app.hasSingleInstanceLock())throw Error("LOCK_REQUIRED")}
    return offerConfigReset({reason,rootPath:recoveryRoot,host:{
      launchDegradedWorkbench:async()=>{
        assertLock()
        // Canonical path: macOS tmpdir is a symlink, and the root must equal its realpath.
        const temporary=realpathSync(await mkdtemp(join(tmpdir(),'shakeink-reset-offer-')))
        startupPaths={bootstrap:join(temporary,'bootstrap'),defaultRoot:join(temporary,'root'),encryptionFamily:family}
        startupSelectionError=null
        mkdirSync(startupPaths.bootstrap,{recursive:true})
        bootstrapPath=realpathSync(startupPaths.bootstrap)
        await launch()
        if(!window||window.isDestroyed())throw Error("DEGRADED_WORKBENCH_UNAVAILABLE")
        return window
      },
      confirm:async({rootPath,window:degraded})=>{
        const answer=await appPrompts.ask({tone:'warning',title:'配置数据无法自动修复',message:'本地配置数据已损坏且无法自动修复',detail:`已尝试自动修复但无法恢复配置数据。\n\n选择「清空全部配置并重启」将删除以下目录中的全部文件（包括作品数据，不可撤销），随后自动重启应用并重建配置：\n${rootPath}\n\n选择「退出」将直接关闭应用，原文件保持原样。`,buttons:[{value:'quit',label:'退出',variant:'outline'},{value:'wipe',label:'清空全部配置并重启',variant:'destructive'}],defaultValue:'quit',cancelValue:'quit'},{persistent:true})
        void degraded;return answer==='wipe'
      },
      wipe:()=>executeStartupReset({bootstrap:originalBootstrap,recoveryRoot},{home:homedir(),isolatedRoot,family},{assertLock}),
      relaunch(){app.relaunch();app.exit(0)},
      quit(){app.exit(0)},
      fatal(error){console.error(error);dialog.showErrorBox("玄印写作无法启动","本地数据未能安全打开。原文件已保留，请检查目录和权限。");app.exit(1)},
    }})
  }
  const reselectStartupPaths=()=>{
    const selected=selectBrandStartupPaths({appData:app.getPath("appData"),home:homedir(),isolatedRoot})
    if(selected.bootstrap!==startupPaths!.bootstrap||selected.encryptionFamily!==startupPaths!.encryptionFamily)return false
    startupPaths=selected;startupSelectionError=null
    return true
  }
  const start=async()=>{
    const assertLock=()=>{if(!app.hasSingleInstanceLock())throw Error("LOCK_REQUIRED")}
    assertNoLegacyBackupRecovery(bootstrapPath,assertLock)
    const family=startupPaths!.encryptionFamily,recoveryRoot=recoveryRootFor(family)
    const classification=classifyStartupRecovery({bootstrap:bootstrapPath,recoveryRoot},family)
    if(classification.kind==="dialog")return launchConfigResetOffer(classification.reason)
    if(classification.kind==="auto-init"||classification.kind==="repair"){
      try{
        await executeStartupRepair({bootstrap:bootstrapPath,recoveryRoot},classification.kind==="auto-init"?"pointer":classification.repair,family,{assertLock})
        // resume-init wrote nothing: the module-load recovery paths are already
        // the family-correct selection, and the strict ready-marker selector
        // must not be re-required for an interrupted initialization.
        if(classification.kind==="repair"&&classification.repair==="resume-init")startupSelectionError=null
        else if(!reselectStartupPaths())throw Error("STARTUP_RECOVERY_FAMILY_CHANGED")
        if(rootRelocationPreflight(bootstrapPath).mode!=="none")throw Error("STARTUP_RECOVERY_STILL_BLOCKED")
      }catch{return launchConfigResetOffer("repair-failed")}
    }
    else if(startupSelectionError){
      try{if(!reselectStartupPaths())throw Error("STARTUP_RECOVERY_FAMILY_CHANGED")}
      catch{return launchConfigResetOffer("paths-invalid")}
    }
    const relocation=rootRelocationPreflight(bootstrapPath)
    if(relocation.mode!=="none")return launchRootRelocation(bootstrapPath,relocation,{recoveryRoot,home:homedir(),isolatedRoot,family})
    if(rootMaintenanceRequired(bootstrapPath))return launchRootMaintenance(bootstrapPath,startupPaths!.defaultRoot)
    const assertInboxColdHost=()=>{
      if(worker||window||repository||modelService||BrowserWindow.getAllWindows().length)throw Error("ORDINARY_HOST_ALREADY_STARTED")
      assertNoLegacyBackupRecovery(bootstrapPath,assertLock)
      if(rootRelocationPreflight(bootstrapPath).mode!=="none"||rootMaintenanceRequired(bootstrapPath))throw Error("ROOT_MAINTENANCE_REQUIRED")
    }
    // A stale inbox lease is repaired inline (default attempt budget) before
    // any window exists; only repeated failures reach the repair dialog.
    if(inboxLeaseRecoveryRequired(relocation.pointer)&&!await recoverInboxLeaseAutomatically(bootstrapPath,{assertColdHost:assertInboxColdHost}))return launchInboxLeaseRecovery(bootstrapPath,assertInboxColdHost)
    try{return await launch()}catch(error){failedRootPath=relocation.pointer?.root.path??null;throw error}
  }
  const failed=async(error:unknown)=>{
    if (isolatedRoot) console.error(error)
    if(failedRootCode){
      try{
        // A failed startup barrier can leave the worker physically writing
        // (PGlite init); terminate and confirm exit before any reset may run.
        if(worker&&!ordinaryWorkerExited){await worker.terminate();if(!ordinaryWorkerExited)throw Error("WORKER_EXIT_UNCONFIRMED")}
      }catch{dialog.showErrorBox("玄印写作无法启动","本地数据未能安全打开。原文件已保留，请检查目录和权限。");app.exit(1);return}
      failedRootCode=null
      // A failed custom (non-default) root is never wiped by the offer: that
      // target is always the family default root, so keep the plain error box.
      const brokenRoot=failedRootPath;failedRootPath=null
      if(brokenRoot&&!samePath(brokenRoot,recoveryRootFor(startupPaths!.encryptionFamily))){dialog.showErrorBox("玄印写作无法启动","本地数据未能安全打开。原文件已保留，请检查目录和权限。");app.exit(1);return}
      try{await launchConfigResetOffer("worker-startup-failed");return}
      catch{dialog.showErrorBox("玄印写作无法启动","本地数据未能安全打开。原文件已保留，请检查目录和权限。");app.exit(1);return}
    }
    const legacy=error instanceof Error&&error.message.startsWith("LEGACY_BACKUP_RECOVERY")
    dialog.showErrorBox("玄印写作无法启动",legacy?"检测到旧版本未完成或无法确认的数据恢复记录。原文件已保留，请通过项目问题反馈寻求处理。":"本地数据未能安全打开。原文件已保留，请检查目录和权限。")
    app.exit(1)
  }
  try{void start().catch(failed)}catch(error){void failed(error)}
}
