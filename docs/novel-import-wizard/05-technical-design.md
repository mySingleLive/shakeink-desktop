# 导入作品分步向导：技术方案（v3）

日期：2026-10-29。依据：[02-product.md](02-product.md)、已批准审核稿（[approval.json](../../design/novel-import-wizard/approval.json)）、[01-research.md](01-research.md)。v2 按 [06-technical-review.md](06-technical-review.md) 的 22 条意见修订（标注 R1–R22）；v3 按同文件"复审"的 N1–N10 修订（标注 N1–N10）。

## 1. 范围与原则

- 在现有控制器 `desktop/main/novel-import.ts` 上增加向导模式。新会话写 `wizardVersion:1`；旧会话（无此字段）的恢复、哈希、prompt、字段表、发布路径完全不变。
- 复用：来源读取、PDF、卷章识别（本地 + structure）、分类、语义校验、证据定位、预算、运行时证明、冲突决定、发布事务、现有图像提示词纯函数、`modelService` 图像接口。
- 不新增数据库迁移。
- 安全：路径只来自原生选择器；渲染进程只按 revision 操作；模型输出一律严格 schema + 证据定位；私有目录文件 `O_EXCL|O_NOFOLLOW`、0600、`nlink===1`；Key 不进日志。

## 2. 会话状态

### 2.1 新字段（`desktop/shared/novel-import.ts`）

```ts
ImportSession.wizardVersion?: 1
ImportSession.wizard?: ImportWizardState          // 仅 wizardVersion===1 时允许存在（R18）
ImportArtifact.schema?: 2                          // 向导实体任务产出；决定字段表（R12）

interface ImportWizardState {
  version: 1
  step: WizardStep                                 // 22 步枚举
  stepState: Record<WizardStep, 'pending'|'running'|'waiting'|'done'|'skipped'|'failed'>
  stepError?: string                               // safeError 后的文案
  /** 第 5 步结束时冻结的全书结构，坐标基于 sourceBody(s)（R1） */
  structure?: { start:number; end:number; title:string; volume?:string }[]
  structureHash?: string                           // = importHash(sourceBody, structure)
  structureDecision?: NonNullable<ImportSession['chapterDetection']>['structureDecision'] // 冻结时的全书结构决定副本（N1）
  chapterSelection?: number[]                      // structure 下标，升序去重
  grantedChapters?: number[]                       // 第 6 步授权时的章节集合；之后选择只能是其子集（N2）
  materializedVolumes?: { start:number; volume?:string }[] // 物化坐标 → 卷名（N1）
  selectionHash?: string                           // 候选与图片选择（N2）
  candidates: Partial<Record<CandidateKind, WizardCandidate[]>>
  images: Record<ImageKind, boolean>               // avatar/portrait/exterior/interior/icon
  imageGrants: Partial<Record<'character'|'scene'|'item', ImportImageGrant>>
  tasks: WizardTask[]
  skipped: { taskId:string; label:string }[]
  dropped: { kind:'touch'|'materialRef'|'missingTarget'|'relationship'; label:string; reason:string }[]
  deferredConflicts: string[]                      // 实体步骤产生、留待第 21 步的冲突 id（R8）
  checks?: WizardCheck[]
  lastJournalAt?: string
}
type CandidateKind = 'character'|'scene'|'item'|'world'
interface WizardCandidate {
  id: string                                       // ^[a-z]+-[0-9a-f]{16}$，见 §7（R20）
  kind: CandidateKind | 'world-setting'
  name: string; aliases: string[]
  roleType?: 'PROTAGONIST'|'SUPPORTING'|'ANTAGONIST'
  parentId?: string; settingType?: SettingType; itemType?: string
  chapterCount: number; sources: ('source'|'body')[]; sourceArtifactIds: string[]
  selected: boolean
}
interface WizardTask {
  id: string                                       // ^(e|i)-[0-9a-f]{16}(-avatar|-portrait|-exterior|-interior|-icon)?$
  kind: 'entity'|'image'|'settings'
  candidateId?: string; imageKind?: ImageKind; settingsKind?: ImportTarget
  dependsOn?: string
  state: 'waiting'|'running'|'done'|'failed'|'paused'|'skipped'
  attempts: number; error?: string
  resultSha256?: string                            // 图片文件 sha256
  image?: { mime:'image/png'|'image/jpeg'|'image/webp'; bytes:number; prompt:string }
}
```

### 2.2 结构校验（R18）

`desktop/core/novel-import-wizard-state.ts` 新增严格 zod `importWizardStateSchema` 与 `validateImportWizardState(s)`：

- `wizardVersion!==1` 时不得有 `wizard`；
- 候选每类 ≤ 5000，任务 ≤ 20000，`skipped/dropped` ≤ 20000；id 正则如上；`step` 枚举；`chapterSelection` ⊆ `grantedChapters` ⊆ `structure` 下标；`dependsOn` 指向存在的任务；`materializedVolumes` 与物化章节一一对应；
- 在 `encodeImportJournal`、`validJournal`、`initialize` 三处调用。

### 2.3 视图

`ImportView.wizard` 只读投影：步骤状态、卷章树（标题与卷名，不含正文）、候选、任务状态、跳过/丢弃列表、检查结果。`ImportView.models.image` 只含 `{id,name}`（R4）。向导视图不新增任何路径；`targetLabel` 在向导会话中只给目录名（R21）。

## 3. 步骤状态机与 phase 映射（R9）

| 步 | wizard.step | phase | 等待/运行 | 允许动作（除 current/pause/cancel/discard） |
| --- | --- | --- | --- | --- |
| 2 | files | source | 等待 | include, move, set-encoding, read-source, reselect-source, PDF 动作, wizard-next |
| 3 | work | source | 等待 | set-title, choose-target, wizard-next, wizard-back |
| 4 | kinds | source→recognizing→select | 等待/运行 | set-range, classify, select, wizard-next, wizard-back |
| 5 | detect-struct | recognizing | 运行 | （自动） |
| 6 | tree | select | 等待 | wizard-select-chapters, set-chapters, wizard-next{consent}, wizard-back |
| 7–8 | import-struct / import-body | running | 运行 | （自动，瞬时） |
| 9/11/13/15 | detect-* | running→select | 运行→等待 | wizard-select-candidates, wizard-set-role, wizard-merge-candidates, wizard-set-images, wizard-redetect, wizard-next{imageConsent?}, wizard-revise |
| 10/12/14/16 | import-* | running（有在途任务）/ select（只剩失败或暂停项，调度器已退出） | 运行/等待 | wizard-task, wizard-read-image, wizard-revise |
| 17–20 | worldline…foreshadow | running | 运行 | wizard-revise |
| 21 | verify | running→select 或 conflicts | 运行→等待 | resolve, apply-patches, wizard-retry-kind, wizard-next, wizard-revise |
| 22 | done | publishing→completed | 运行 | （现有） |

- 等待作者的清单步骤 phase 为 `select`；运行中为 `running`（第 5 步沿用 `recognizing`）。现有会把 phase 写成 `confirm` 的路径——`set-chapters`（`novel-import.ts:165`）、`set-title`（`:167`）、`recognizeStructure`（`:456`）——在 `wizardVersion===1` 时改写为表中对应 phase，并同步 `wizard.step/stepState`。暂停：`phase='paused'`、`resumePhase` 为原 phase，`wizard.step` 不变。`validJournal` 的 phase 列表不变。
- `resume`：向导会话分派到 `wizardResume(s)`——重开应用后授权已撤销，在**当前步骤**置 `stepState=waiting` 并要求重新允许（第 4–5 步 classificationGrant、第 6 步之后 analysisGrant、图片 imageGrants），不回退到 `confirm`。
- 目录：向导会话的 `analysisCheckpoint` 不绑定 target。`chooseTarget` 中"恢复分析必须重新授权原目录"（`:330`）在向导下不适用；第 3 步可随时改目录。重启后 `targetNeedsAuthorization=true` 只在第 22 步保存前要求重新选择/授权，不阻塞其他步骤。
- `wizard-back` 用于第 3–6 步之间返回（尚未授权分析，不丢弃）；`wizard-revise{to}` 用于第 7 步之后（§3.1）。

### 3.1 返回修改

`to ∈ {files, work, kinds, tree, detect-char, detect-scene, detect-item, detect-world}` 且早于当前步。

- `work`：只改名称/目录，结果不动。
- `files/kinds`：复用 `invalidate(s,true)`，清空 wizard 全部状态与图片文件（含 `structure`、`structureDecision`、`structureHash`、`materializedVolumes`、`chapterSelection`、`grantedChapters`），回到该步；之后重新执行第 5 步。
- `tree`（N1）：不调用 `invalidate` 的重新检测。从 `wizard.structure` 与 `wizard.structureDecision` 恢复全书 `s.chapters` 与 `chapterDetection`，`originalProse=workingProse=''`、`workingRevision=0`、`workingUnits` 清空；清空分析产物、候选、任务、图片、`analysisGrant`、`grantedChapters`；`chapterSelection` 保留作者原选择。
- `detect-X`：删除 X 及之后各类（顺序 character→scene→item→world→settings→worldline→narrative→outline→foreshadow）的 artifacts、候选、任务、文件、coverage；清空语义状态 `semanticState`（重建）；保留更早类别。
- 每次 revise：`epoch++`，取消在途文本与图片请求（同暂停路径），撤销 imageGrants（后续需重新允许）；清空 `deferredConflicts`、`checks`，并从 `s.conflicts`/`s.decisions` 删除被丢弃类别的冲突（N10）。

## 4. 运行中允许的动作（R2）

`act()` 在 `this.jobs.size` 检查之前分流白名单：`wizard-task`、`wizard-read-image`、`wizard-revise`、`current`、`pause`、`cancel`、`cancel-pdf-preview`。`wizard-revise` 在运行中先走 `stopAction` 的取消与排空流程，再在 serial 中执行。

- `wizard-task{taskId, op:'retry'|'skip'}`、`{op:'skip-failed'}`：只改任务状态与调度器队列，`checkpoint()` 串行保存，**不递增 epoch**，不影响在途任务。
- `wizard-read-image{taskId}`：只读，见 §11.4。
- 调度器作为一次 `launch()` 作业运行；单项错误在调度器内部捕获写入任务，不抛给 `launch` 的 catch（`:331`）。**只剩失败或暂停项时，调度器提交后退出作业**，phase 为 `select`、`stepState=waiting`；`wizard-task{retry}` 重新 `launch` 调度器，`{skip}` 在无在途任务时直接提交并在全部完成后推进（N7）。只有核验失败、授权失效、日志写入失败等全局错误才抛出，使会话 `failed`。

## 5. 第 2 步：编码（R19）

`desktop/main/novel-import-files.ts:235,245`：GB18030 严格解码成功时 `ambiguous=false`，并在 `Extracted` 增加 `encodingDetected:true`；GB18030 也失败才报"无法识别文本编码，请改选编码或排除此文件"。TXT、MD、HTML 共用此 `decode`（`:347`），同样适用。`reselectOrdinarySource` 依赖 `requiresEncodingConfirmation`（`:295,305,312`），新文件该值为 false，行为不变；补测试。旧会话中 `requiresEncodingConfirmation:true` 的文件保持原样。

## 6. 第 3–8 步

- 第 3 步：`set-title`、`choose-target` 在 source 阶段可用；`wizard-next` 要求标题非空且目录已选。
- 第 4 步：本地分类先跑；存在 unknown 且有文本模型时可"允许识别"（现有 `classify(ai)`）。`wizard-next` 等价 `select`。
- 第 5 步：现有 `confirmLocalStructure`/`prepareStructure`/`recognizeStructure`。结束时把 `s.chapters` 冻结为 `wizard.structure`（坐标基于 `sourceBody(s)`），`chapterDetection.structureDecision` 复制到 `wizard.structureDecision`，默认全选。
- 第 6 步 `set-chapters`（手动调整卷章）在向导下：仍基于全书 `sourceBody`，结果写回 `s.chapters` 与 `wizard.structure/structureDecision/structureHash`，`chapterSelection` 重置为全选，phase 保持 `select`（N1）。

### 6.1 选中章节物化（R1）

第 6 步 `wizard-next{consent}`：

1. 校验至少一章；`structureHash` 与当前 `sourceBody` 一致；与 `start()` 相同检查文本/审核模型配置与 `importSessionBudget`（`:527`），失败时不物化（N10）。
2. `originalProse = workingProse = 选中章节按序拼接`；`workingRevision=0`；`workingUnits` 清空后由 `workingImportUnits` 重建（单元只在选中正文内切分，自然不跨未选内容）。
3. `materializedVolumes` = 选中章节在物化坐标下的起点与其 `structure` 卷名（卷名来自全书结构，不依赖物化正文中是否还有卷标题）。`s.chapters` 由 `structure` 中选中章节直接平移坐标构造（`id=chapter-<k+1>`、`start/end` 重算、`volume` 取 `materializedVolumes`），**不调用** `importChapters` 的检测。
4. `grantedChapters = chapterSelection`；授予 `analysisGrant`，`hash=importScopeHash(s,'analyze')`（§10.1，不含候选选择）。

此后所有现有读取点（`review`、`requestSnapshot` 章节目录、`semanticSources`、`validateDetailedOutlineAssignments`、`workingImportUnits`）自动只看到选中内容，无需逐处过滤。返回第 6 步（`wizard-revise{to:'tree'}`）时从 `sourceBody` 与 `structure` 重新物化。

向导会话的卷章可信来源是 `wizard.structure/structureDecision/materializedVolumes`（N1）：

- `initialize()`（`novel-import.ts:131`）：`wizardVersion===1` 且已物化时，`verifiedImportStructureVolumeCuts` 改为用 `wizard.structure` 与 `sourceBody` 校验 `wizard.structureDecision`，再校验 `s.chapters` 与 `materializedVolumes`、`chapterSelection` 一致；未物化时按现有逻辑。校验失败只使该会话不可恢复（放入逐会话 try），不影响控制器初始化。
- `assertPlan:30-33` 卷归属：`wizardVersion===1` 时以 `materializedVolumes` 为可信卷映射，`importVolumeGroups(s.chapters)` 校验连续性，不在物化正文中重新检测卷标题。
- `apply-patches`（第 21 步，C1）：向导会话中 `applyImportPatches` 不重新检测章节，按补丁偏移平移各章 `start/end` 与 `materializedVolumes` 坐标；补丁跨章界时拒绝。`applyImportPatches` 会重置 artifacts/conflicts/decisions/semanticState/coverage（`novel-import.ts:295`），因此向导会话应用补丁后在同一提交中执行等价于 `wizard-revise{to:'detect-char'}` 的清理：保留物化正文、`grantedChapters`、`analysisGrant` 与第 9/11/13/15 步的候选选择和图片选项，清空第 9 步之后各步结果与图片，step 回到 `detect-char` 并自动重新识别。界面在"确认修改导入副本"前提示"将重新导入角色及之后的内容"。

`assertPlan:43-46` 在 `wizardVersion===1` 下改为：每个 `wizard.structure[chapterSelection[k]]` 的原文区间 `sourceBody(s).slice(start,end)` 等于 `s.chapters[k].content`（或在 workingRevision>0 时等于 originalProse 对应段），且 `originalProse` 等于这些区间的拼接。

- 第 7–8 步：不调用模型，直接 `done`；卷章与正文在发布时写入（§12）。

## 7. 快速识别（第 9/11/13/15 步）

### 7.1 请求契约（R11）

新增 `intent:'roster'`（`phase:'analyze'`，`kind ∈ character|scene|item|world`）。需要同步修改的契约点：

| 位置 | 修改 |
| --- | --- |
| `desktop/core/novel-import-runtime-proof.ts:4` | `intent` 枚举加 `roster`、`entity`、`touches` |
| `desktop/service/novel-import-ai.ts:182` `semanticContextSchema` | 同上 |
| `desktop/service/novel-import-ai.ts:202` 与 `desktop/main/novel-import.ts:425` 两处返回字段白名单 | `roster:['roster']`、`entity:['artifacts']`、`touches:['touches']` |
| `desktop/service/novel-import-ai.ts` `importAiResponseSchema` | 新增 `roster`、`touches` 结果 schema |
| `desktop/core/novel-import-ai-payload.ts` `semanticPrompt` | 新增三个意图的固定契约文本 |

结果 schema（严格）：

- character：`roster:[{name, aliases[], roleType:'PROTAGONIST'|'SUPPORTING'|'ANTAGONIST', evidence:{unitId,quote}}]`
- scene：`roster:[{name, aliases[], parent?:string, evidence}]`
- item：`roster:[{name, aliases[], itemType, important:boolean, evidence}]`
- world：`roster:[{world, parent?:string, settings:[{settingType(九类), name}], evidence}]`

每条 evidence 经现有 `anchorEvidence/validateImportEvidence` 定位；不能定位的条目丢弃。

服务端 `runImportAi` 分流：`intent ∈ {roster,touches}` 时跳过按 analyze 处理 artifacts 的循环（`novel-import-ai.ts:351-363`）与"analyze 必须返回 artifacts 或 notFound"规则（`:368`），改走各自校验；`importAiResponseSchema` 的 analyze 分支（`:34`）按 intent 选择结果 schema；`ImportSemanticRequestFields.intent` 类型（`novel-import-semantics.ts:34`）扩展。

### 7.2 执行

- 选中正文单元按预算分批（`stageRequests`），每批附资料文件中该类 artifacts 的名称目录；逐批 `checkpoint`，`coverage['roster:'+kind]` 记录已完成单元，失败后 `wizard-redetect` 只补未完成批次。
- 合并（纯函数 `mergeWizardRoster`）：名称 NFKC + 去空白；同名或互为别名合并；roleType 取出现次数多者，并列取 主角 > 反派 > 配角。
- `chapterCount`：在选中章节 content 中统计名称/别名出现的章数（本地）。
- 物品：模型或本地出场 ≥3 章才保留；**资料来源的物品始终保留**（R20）。
- 候选 id：`{c|s|i|w|ws}-` + `sha256(kind+规范化名称).slice(0,16)`；合并后用保留项 id。
- 排序：资料来源优先，其次 `chapterCount` 降序。
- 识别为空：`stepState=waiting`，候选为空，界面"未识别到"。失败：`stepState=failed`、`stepError`。

### 7.3 无模型或只导入资料（R14）

新增本地拆块规则 `splitWizardSourceBlocks(text, kind)`（`desktop/core/novel-import-wizard.ts`）：按 Markdown 标题（`#`–`####`）、"名称："行或列表项首行拆块；角色沿用现有姓名行规则。

- 场景/物品：每块一个候选，名称取标题。
- 世界观：一级标题为世界，二级标题为子项；子项按标题关键词映射 settingType（社会/政治/制度→SOCIETY，人文/文化/风俗/宗教→CULTURE，地理/地域→GEOGRAPHY，历史→WORLD_HISTORY，其余→SOCIETY）。等级、力量、势力、概念、地图类需要结构化 content，资料拷贝时不能可靠投影，因此本地规则不产生这些类型，统一按 SOCIETY 文本类保存原文（N8）。只有一层标题时世界为单个中性容器，子项为各标题。
- 无法拆块时整个文件一个候选（与现状一致）。
- 无模型时这些候选按资料原文拷贝（`origin:'source'`），不推断字段。本地拆块直接为资料 artifact 写 `entityType/worldId/settingType/content`（文本类 content 为 `{text:原文}`），并单测 `decodeImportWorldContent` 后内容不变。拆块与 `sourceImportArtifacts` 的改动只对 `wizardVersion===1` 生效，旧会话资料 artifact id 不变（`novel-import-publish.ts:24`）。
- P10 补充预期：仅拷贝时清单与树来自资料标题结构。

## 8. 并行导入（第 10/12/14/16 步）

### 8.1 调度器（R2、R3、R16）

`desktop/main/novel-import-wizard-scheduler.ts` 的 `WizardScheduler`，作为一次 `launch()` 作业运行：

- 两个池：实体池上限 4，图片池上限 2（常量 `WIZARD_ENTITY_CONCURRENCY`、`WIZARD_IMAGE_CONCURRENCY`）。图片任务 `dependsOn` 其实体任务。
- **来源核验合并**：调度器在启动时和此后每 30 秒（或每 16 个请求，先到为准）调用一次 `this.verify(s)`；PDF 核验在该次调用内串行。`ai()` 新增参数 `verified:true` 跳过请求前后的核验（`:419,425`）。核验失败时取消全部在途任务，本轮已返回但未写入的结果丢弃，抛出全局错误。
- **合并保存**：任务完成后把结果放入内存待提交队列；调度器在同一 `serial` 回合中**逐项** merge 与校验——单项抛错（如 `mergeImportArtifacts` 别名命中多个实体 `:252,254`）只把该任务标为 `failed`，其余继续——全部处理完后只 `save()` 一次（N6）。提交节流：距上次保存 ≥2 秒或队列 ≥8 项时提交；步骤结束、暂停、revise 前强制提交。结果在提交前不进入 `s.artifacts`，"采用前已落盘"不变。
- **运行时证明（N3）**：向导会话把运行时诊断写入会话目录下单独文件 `runtime.json`（原子写：临时文件 + fsync + rename，≤64 KiB），每次调用开始与结束各写一次；整份日志仍按上面节流。`runtime.json` 记录全部在途调用（`calls[]`，≤64 条），而不是只记 `runtime.last`；持久化失败时取消该调用（与现有 `recordRuntime` 语义一致）。日志中的 `runtimeAiCall` 在向导会话中不再作为在途证明。暂停证明 `remaining` 增加**可选** `imageOperations`（旧日志无此字段仍可解析，`novel-import-runtime-proof.ts:8` 为 strict），`importRuntimePauseProof` schema 同步。实体池 4 + 图片池 2 不超过运行时追踪器上限 16。`initialize/discard` 白名单加入 `runtime.json`。
- epoch：提交前 `this.current(s,epoch)`；暂停/revise 后迟到结果丢弃。
- 单项失败：写任务 `failed`、`error`（safeError），`attempts++`；不抛出。
- 步骤完成：全部任务 `done|skipped` 后执行 §8.3 引用解析，再 `stepState=done`，自动推进。

### 8.2 单实体请求（`intent:'entity'`）

- 单元选择：在选中章节单元中按名称/别名检索命中单元；预算内依次取首次出场单元、命中次数最多的单元、与其他已选同类候选共现的单元，按原文顺序；资料 artifacts（`sourceArtifactIds`）的原文单元全部加入。
- 实体目录（N5）：主进程显式传入 `request.entities`（不用 `requestSnapshot` 默认目录 `:382`），格式为 `ImportSemanticEntity`：角色 `{id,kind:'character',name}`；场景 `{id,kind:'scene',name,entityType:'PLACE',parentId?}`；世界 `{id,kind:'world',name,entityType:'WORLD',parentId?}`；世界子项 `{id,kind:'world',name,entityType:'SETTING',worldId,settingType}`。别名放在 instruction 中的只读 JSON（`[{id,aliases}]`）。
- 输出：恰好一个 artifact，`id=候选 id`、`kind`；服务端 artifact schema 严格（`novel-import-ai.ts:14`），`schema:2` 由主进程收到结果后写入；经 `validateImportEvidence`、`validateImportSemanticArtifact(a,'strict')`。
- 资料来源且未勾选该类推断：不调用模型，资料 artifact 直接作为结果（`origin:'source'`）。

### 8.3 引用延后解析（R7）

- 单项校验时，`relationships[].characterId`、场景 `parentId` 只核对目标 ∈ 已选候选 id 集合，不要求已导入；`importNativeMappings` 不在单项阶段调用。
- 本步全部任务结束后统一解析：目标已导入保留；目标被跳过或失败——关系删 `characterId` 只留 `target` 名字，场景 `parentId` 置空，记入 `dropped`；然后对全部 artifacts 调用一次 `importNativeMappings`。
- 场景实体任务按上级优先排队（拓扑序）。

### 8.4 结果持久化（N4）

日志是唯一事实来源；实体结果只在提交时写入 `s.artifacts`，不另存文件。

### 8.5 角色全部属性（R12）

`IMPORT_SEMANTIC_FACT_FIELDS_V2`（新常量）在 v1 基础上增加：

| 组 | 字段 | 写库前规整 |
| --- | --- | --- |
| 外观 | height, weight, build, faceShape, tastes, habits, dialogueStyle, sampleDialogue | 字符串，按列长度截断 |
| 心理 | personalityTags(JSON string[]), motivations(JSON), desires, fears, beliefs(JSON), bigFive(JSON 或省略) | `normalizeMotivations`、`normalizeBeliefs`、`normalizeBigFive` |
| 能力 | abilities | 字符串 |
| 弧线 | backstory, arcStages(JSON，`startChapter` 用 `chapterIndex`) | `normalizeArcStages`；发布时映射章 id |

- 版本选择：新增 `importFactFields(kind, schema?)`，替换所有直接读 `IMPORT_SEMANTIC_FACT_FIELDS` 的位置：`desktop/main/novel-import.ts:609,630`、`desktop/core/novel-import-semantics.ts:73,139,280`、`desktop/core/novel-import-ai-payload.ts` 的 prompt 字段表。`validateImportSemanticArtifact` 与原生投影按 `artifact.schema===2` 选 V2；无 `schema` 的产物行为不变（旧会话哈希不变）。
- 伏笔 V2：`status`（PLANNED|PLANTED|RESOLVED）、`touches`（JSON，§9.1）。
- 场景 V2：`exteriorDescription, interiorDescription, backstory, entryMethod`。物品 V2：`appearance, acquisition, effects(JSON [{name,description}] ≤20), aliases(JSON ≤10，单个 ≤50), tags(JSON ≤8，单个 ≤20)`，按 schema 注释裁剪。
- prompt：`intent:'entity'` 时用 V2 字段表与各 JSON 字段示例；无依据字段省略。
- 字段结构不合法（规整后与原值语义不符，例如 motivations 解析失败）时对该任务重试一次并附结构提示；仍失败则任务失败。

### 8.6 世界观与其他设定（第 16 步）

- 世界任务（`entityType:'WORLD'`）先于其子项任务（`dependsOn`）；子项输出 `entityType:'SETTING'`、`worldId`、`settingType`、`content` 原生结构。
- 候选选择：后端只存叶子（子项）的 `selected`；没有子项的世界作为自身叶子（R20）。世界被保留当且仅当它自身是被选叶子或有被选后代；只剩子世界被选时，父世界作为容器保留。取消世界会级联取消其子世界，跳过世界任务会级联跳过其设定与子世界任务；父世界导入失败或被跳过而子项仍在时，§8.3 的引用解析把 `parentId` 置空。
- 其他设定（theme、style、goldenFinger、trope）：每类一个 `settings` 任务，内部沿用 `semanticAnalyzeUnits`（使用物化后的单元），对外显示一个任务进度。

### 8.7 冲突与遗漏（R8）

- 向导会话中，实体任务与其他设定任务产生的冲突写入 `s.conflicts`，id 记入 `deferredConflicts`，**不切换 phase**，不中断调度。`semanticAnalyzeUnits` 在 `wizardVersion===1` 时不执行 `:704` 的 phase 切换。
- 第 21 步统一处理（§10）。
- 复核产生的 `missingTargets`：只接受 `artifactId` 指向已有 artifact 的条目；无 `artifactId`（新实体）的一律丢弃并记入 `dropped`，不导入作者未选的实体。
- `workflow()`、`start()`、`resume()`、`resolveConflict()`、`semanticDecision()`、`prepareReviewPolicy()` 入口在 `wizardVersion===1` 时分派到向导实现：决定后只在第 21 步内重跑受影响实体的 repair 与复核，不进入旧 12 类全量流程。

## 9. 线索（第 17–20 步）

- 世界线、叙事线、细纲：沿用 `semanticAnalyzeUnits(kind)`。§6.1 物化后单元与章节目录天然只含选中章节；实体目录只含已导入实体。
- 向导会话中 `foreshadow` 从"其他设定"移出，只在第 20 步执行。

### 9.1 伏笔（`intent:'touches'`，R6）

- 输入：选中正文单元分批；附已导入世界线事件目录 `{id,title,chapterIndex?}`、叙事 artifacts 目录 `{id,chapterIndex,refs:[eventId]}`。
- 输出 schema：`touches:[{foreshadowKey, title, content, touch:{kind:'PLANT'|'MENTION'|'PAYOFF', chapterIndex, summary(≤200), quote, eventId?, narrativeId?}, evidence:{unitId,quote}}]`。跨批按 `foreshadowKey`（规范化标题）合并为伏笔 artifact（`kind:'foreshadow'`, `schema:2`, facts `touches` 为 JSON）。
- 纯函数 `planForeshadowTouches(s)`（`desktop/core/novel-import-foreshadow.ts`）逐触点判定：
  1. `chapterIndex` 在选中章节范围；`quote` 在该章 content 中经 `resolveReferenceAnchor` 唯一定位，否则丢弃触点（`dropped`）。
  2. `eventId` 必须是已导入 worldline artifact，否则置空。
  3. 讲述卡关联：只有 `eventId` 存在、`narrativeId` 指向该章 narrative，且该 narrative 的 `refs` 含 `eventId` 时，才在讲述卡上写 materialRef；否则讲述卡不写，记入 `dropped`（原因"讲述未引用对应世界事件"）。
  4. 世界事件 materialRef：`eventId` 存在时写；`role` 按 PLANT→plant、MENTION→mention、PAYOFF→payoff。
  5. 若讲述卡要写 `plant`，同一伏笔的 `plant` 必须已写在该 eventId 的事件上（满足 `domain.ts:520-521`），否则讲述卡的 plant 降级为不写。
  6. `note` = `summary` 截到 500 字（`material-reference.ts:3-8`）；空 summary 用伏笔标题。
  7. 叙事 artifact 拆成多张卡时（`novel-import-publish.ts:111`），materialRef 只挂第 0 张；世界线拆块同理挂主事件。
  8. 每个事件/讲述 materialRefs 已有 + 新增 ≤ 40，超出按触点顺序截断并记录。
  9. 状态：存在 PAYOFF 触点为 RESOLVED，否则 PLANTED；没有任何保留触点的伏笔仍写入，状态 PLANNED。
- 大纲关联：触点 `summary` 在该章细纲中经 `resolveReferenceAnchor` 定位到则写带 quote 的 `CHAPTER_OUTLINE` 引用；否则写整章引用（`quote:null`）。
- 单元测试断言：对 `planForeshadowTouches` 产出的完整 planning 草稿调用 `validatePlanning` 通过。
- 第 21 步复核或修订编辑过伏笔 `touches` 后，重新运行 `planForeshadowTouches`，更新 `dropped`（N10）。

## 10. 第 21 步：校验与授权哈希（R10）

### 10.1 范围哈希（R10、N2）

两种范围分开：

- **发送范围**：`importScopeHash(s,'analyze')` 在 `wizardVersion===1` 时加入 `{structureHash, grantedChapters}`。物化后正文本身已在哈希中。`analysisGrant.hash` 在第 6 步写入后**不再改写**。`ai()` 对 analyze/review 请求校验 `grant.hash===importScopeHash(s,'analyze')`。现有运行时证明 `scopeHash`、`importSemanticInputHash`、`canRestoreAnalysis` 随之包含向导发送范围，第 6 步之后不变，语义检查点不会因候选选择失配。
- **选择范围**：`wizardSelectionHash(s)` = `{各类选中候选 id, images}` 的哈希，存入 `wizard.selectionHash`，在第 9/11/13/15 步 `wizard-next` 时更新。调度器提交每项结果前校验任务对应候选仍被选中、`selectionHash` 未变；`importPlanHash` 包含 `selectionHash` 与图片 sha256。候选选择不扩大发送范围（发送范围只由 `grantedChapters` 决定），因此无需重新授权。
- 子集约束：后续任何路径都不能把 `chapterSelection` 改为 `grantedChapters` 之外；扩大章节必须 `wizard-revise{to:'tree'}` 并重新授权。

### 10.2 检查项

| 检查 | 实现 |
| --- | --- |
| 卷章与正文完整 | §6.1 `assertPlan` 规则的纯函数版 |
| 所选范围一致 | 所有 artifact 的 evidence/sourceUnitIds ⊆ 物化正文单元 ∪ 选中资料单元；未选候选无 artifact |
| 角色关系引用 | §8.3 解析后 `importNativeMappings` 无错误 |
| 世界观归属 | SETTING.worldId 指向已导入 WORLD |
| 世界线/叙事线引用 | 现有校验 + 发布用 planning 草稿 `validatePlanning` 预演 |
| 细纲覆盖 | `validateDetailedOutlineAssignments(s,true)`（物化后即只含选中章节） |
| 伏笔触点 | §9.1 全部保留触点可定位 |
| 一致性复核 | 现有 `review()`（审核模型）+ `deferredConflicts` |

- 结构检查失败：`checks[i].ok=false` + 原因；`wizard-retry-kind{kind}` 清空该类结果并回到该类导入步骤（保留选择），之后重新经过后续步骤。
- 冲突：`phase='conflicts'`，复用现有冲突界面与 `resolve/apply-patches`；决定后经向导分派（§8.7）只重跑受影响 repair 与复核，再重新计算检查。
- 全部通过：`wizard-next` → 第 22 步。若 `targetNeedsAuthorization`，先要求重新选择/授权目录。

## 11. 图片生成

### 11.1 调用链（R4）

- `Options` 新增：`imageModel():Promise<ImportModel|undefined>`（读取 settings 中图像模型，`kind==='IMAGE'`）；`generateImage(model, prompt, sizes, signal):Promise<{bytes:Uint8Array; mime}>`。
- `desktop/main/index.ts` 用 `modelService.startImage/read/cancel` 实现 `generateImage`，帧和长度校验复用 `generateLocalImage` 的规则（抽成共享纯函数）。
- 每个图片任务一个 `AbortController`，登记到控制器 `imageOperations`；`stopAction`、`revise`、`close` 先中止全部图片任务并等待结束，再写暂停证明。
- 授权：`imageGrants[kind]={hash, imageModel}`，`hash=importHash({kind, images, selectedIds})`；每次生成前比较当前 `imageModel()` 与授权（`same()`），不一致则任务失败"图像模型配置已变化"。

### 11.2 提示词（R17）

- 复用纯函数 `buildCharacterImagePrompt`、`buildSceneImagePrompt`、`buildItemImagePrompt`，输入为 V2 原生投影。
- 画风语境：`ImagePromptContext = {}`。导入不写 `Theme.genre/tags`，保存后面板重新生成时语境同样为空，保持一致。
- 前置条件：角色 `appearance` 与 `clothing` 都空、场景对应外景/内景描述为空、物品 `appearance` 与 `description` 都空时，任务直接失败并给出原因（"缺少外观描述"），可跳过。

### 11.3 暂存（R13）

- 路径：`<root>/novel-imports/<id>/images/<taskId>.<png|jpg|webp>`。顺序（N4）：写 `.<taskId>.<rand>.tmp`（`O_EXCL|O_NOFOLLOW`，0600）→ fsync → rename 为最终名 → fsync 目录 → 提交检查点登记 sha256。检查点前崩溃留下的是未登记最终名或临时文件。
- `initialize()`：删除 `images/` 下临时文件和未登记的最终名文件；登记了但文件缺失或 sha256 不符的任务退回 `waiting`。
- `discard()`：白名单允许 `images/` 目录与 `runtime.json`；逐个文件 `lstat`（非符号链接、`nlink===1`、名称匹配 `^[a-z0-9-]{1,80}\.(png|jpg|webp)$` 或临时名）后删除，再 `rmdir`；有其他未知条目仍拒绝。
- 容量：单张 ≤ 10 MiB（与作品资产上限一致）；单会话合计 ≤ 200 MiB（低于作品备份 256 MiB 上限）。第 9/11/13 步按"选中数 × 选项数 × 2.5 MiB"预估，超过 200 MiB 时界面提示并禁止勾选。
- `wizard-revise` 删除被丢弃任务的文件。

### 11.4 缩略图

`wizard-read-image{taskId}`：读取登记文件，校验 sha256 与魔数（PNG/JPEG/WebP），返回 `{mime, bytes}`；渲染进程用 blob URL 显示，卸载时 revoke。

### 11.5 发布（R5）

- `workspaces.ts:226` 导入 `initialize` 的 `runInDatabaseContext` 增加 `assets: connection.assets`。
- 主进程在 `publish` 前读取全部登记图片并校验，放入 `ImportPublishInput.images:{taskId, mime, sha256, bytes}[]`；worker 再校验 sha256。
- `initialize` 先在事务外查询该 `requestId` 的 `contentMutation`；已存在（首次事务已提交、重试进入）则跳过写图与事务（N9）。否则在 `$transaction` 之前逐张 `assets.save()`，记录文件名；事务失败对已写文件 `assets.removeCreated()`。
- 事务内：角色 `CharacterImage{kind,source:'AI',url,prompt}` + `avatarUrl/portraitUrl`，物品 `ItemImage{source:'AI',url,prompt}` + `iconUrl`，url 为 `/_desktop/assets/<workspaceId>/<filename>`（与 `character-image.ts`、`item-image.ts` 一致）。场景按 `scene-image.ts` `saveHistory` 格式：`SceneImage{id:资产 id, filename, kind, source:'AI', url:'/api/novels/<novelId>/scenes/<sceneId>/images/<资产 id>/asset', prompt}`，并更新 `exterior/interiorImageUrl` 与 revision+1。

## 12. 发布（`novel-import-publish.ts`）

`wizardVersion===1` 分支：

- 卷章：物化后的 `s.chapters` 即选中章节；卷 = 至少一章被选中的卷组，`index` 连续；章节在卷内连续编号。
- 角色：V2 全字段，JSON 字段写库前规整。`arcStages` 在章节创建后用 `tx.character.update` 写入，`startChapter={chapterId,volumeId,label}` 由 `chapterIndex` 映射（R12）。
- 场景/物品：V2 字段，物品 aliases/tags 按注释上限裁剪。
- 世界观：沿用 WORLD/SETTING。
- 伏笔：§9.1 计划写入 `Foreshadow{title,content,status}`、`ForeshadowTouch`、`ForeshadowReference`（CHAPTER_CONTENT 带 quote/prefix/suffix/偏移，CHAPTER_OUTLINE 带或不带 quote；`identityKey` 规则与 `foreshadow-reference.ts:53` 一致），以及 planning `event/telling.materialRefs`。
- 图片：§11.5。
- 批量写入（R15）：章节预生成 cuid 后 `createMany`；`ForeshadowTouch`、`ForeshadowReference`、图片记录 `createMany`。
- 导入记录增加 `wizard:{structure, chapterSelection, candidates:[{id,name,kind,selected}], skipped, dropped, images:[{taskId,kind,sha256}]}`。

## 13. 渲染进程

- `NovelImportDialog.tsx`：`view.wizard` 存在时渲染 `NovelImportWizard`；旧会话仍用现有屏幕。
- 新组件 `src/components/desktop/novel-import-wizard/`：`WizardShell`、`FilesStep`、`WorkStep`、`KindsStep`、`ChapterTree`、`CandidateList`、`ImageOptions`、`WorldTree`、`TaskGrid`、`VerifyChecks`、`ReviseDialog`、`StopDialog`。
- 选择器纯函数 `src/lib/desktop/novel-import-wizard.ts`：跳过判定、三态、计数、按钮文案、任务条文字、搜索过滤（名称+别名）、图片容量预估。
- 交互：受控复选 + 稳定 key（勾选后焦点不丢）、`compositionstart/end`、Esc 收起、`aria-live=polite` 进度、`role=progressbar`、减弱动态；树不使用 `role=tree`（与已批准稿一致）。
- 样式 `ni-w-*`，只用令牌；遮罩沿用现有。
- 文案来自真实状态；示例值清单（03-ui-design）不得出现在源码中（测试断言）。
- 图片错误码（`IMAGE_RESPONSE_INVALID` 等）在 `safeError` 增加中文映射（R21）。

## 14. 风险与取舍

| 风险 | 处理 |
| --- | --- |
| 旧会话 | `wizardVersion`、`artifact.schema` 双重版本隔离；旧哈希/prompt/字段表不变 |
| 快速识别成本（480 万字） | 每类一次全量输入、极短输出；批次检查点可续 |
| 供应商限流 | 并发常量；失败可重试/跳过；已有中文映射 |
| 同名不同人 | 只按完全同名或互为别名合并；作者可手动合并；不自动拆分 |
| 单实体上下文漏信息 | 首次出场 + 高频 + 共现 + 资料全文；无依据留空 |
| 伏笔关联不满足规划规则 | §9.1 预演降级并记录，发布前 `validatePlanning` |
| 日志写入量 | §8.1 合并保存 + `runtime.json` 小文件；性能用例给出上限（每个导入步骤整份日志保存次数 ≤ ⌈任务数/8⌉ + 时长秒数/2 + 5） |
| 发布耗时 | createMany；PGlite 基准用例（1394 章、300 角色、1000 触点）要求 ≤ 60 秒 |

## 15. 文件清单

| 文件 | 变更 |
| --- | --- |
| `desktop/shared/novel-import.ts` | 类型、动作 schema、视图 |
| `desktop/core/novel-import-wizard.ts`（新） | 步骤/跳过、物化、候选合并、本地拆块、检查纯函数 |
| `desktop/core/novel-import-wizard-state.ts`（新） | 日志 schema 校验 |
| `desktop/core/novel-import-foreshadow.ts`（新） | 触点计划 |
| `desktop/core/novel-import.ts` | `importScopeHash`/`importPlanHash` 向导摘要；`toImportView` 向导投影 |
| `desktop/core/novel-import-semantics.ts` | V2 字段表与原生投影 |
| `desktop/core/novel-import-semantic-state.ts` | 按 schema 选字段表 |
| `desktop/core/novel-import-ai-payload.ts` | roster/entity/touches 契约 |
| `desktop/core/novel-import-runtime-proof.ts` | intent 枚举 |
| `desktop/service/novel-import-ai.ts` | 结果 schema、上下文 schema、白名单 |
| `desktop/main/novel-import.ts` | 向导动作、白名单分流、状态机、分派、discard/initialize |
| `desktop/main/novel-import-wizard-scheduler.ts`（新） | 调度、合并核验/保存 |
| `desktop/main/novel-import-images.ts`（新） | 生成、暂存、读取 |
| `desktop/main/novel-import-files.ts` | 编码 |
| `desktop/main/index.ts` | imageModel、generateImage |
| `desktop/service/workspaces.ts` | initialize 带 assets |
| `desktop/service/novel-import-publish.ts` | 向导分支 |
| `src/components/desktop/NovelImportDialog.tsx`、`novel-import-wizard/*`（新）、`novel-import.css` | 界面 |
| `src/lib/desktop/novel-import-wizard.ts`（新）、`src/lib/desktop/novel-import.ts` | 选择器与动作 |
| `docs/requirements-traceability.json` | P01–P14 条目（R22） |

## 16. 验证与台账（R22）

- 测试用例文档（07）为每条用例标注覆盖的 P 编号，并登记到 `docs/requirements-traceability.json`。
- 单元：纯函数（编码、物化、跳过、候选合并、本地拆块、三态、伏笔计划 + `validatePlanning`、范围哈希、状态 schema、图片容量）。
- 控制器集成：注入假 `ai`/`generateImage`/`publish` 驱动完整 22 步；暂停恢复；revise；失败重试/跳过；并发上限；epoch 丢弃；运行中白名单；核验合并；保存次数上限；PDF 来源不 busy。
- 发布集成：PGlite 验证选中章节、角色全字段、引用解析、伏笔触点与 materialRefs、图片记录与资产文件、失败回滚资产；发布基准。
- 界面：浏览器组件测试覆盖树三态、清单、图片选项、任务卡、焦点、读屏属性、示例值不入源码。
- 真实目标：《诡秘之主》在隔离运行时（`LotmVerification.app`）以真实模型执行完整向导，取消"未分卷"与部分章节、取消部分角色、勾选部分图片；验证保存的作品。真实验证覆盖 P01–P14 中的哪些条目在 07 中逐条列出，不以启动冒烟或模拟代替。
