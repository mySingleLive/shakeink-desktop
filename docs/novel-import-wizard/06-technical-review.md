# 导入作品分步向导：技术方案独立审核

日期：2026-10-29。审核对象：[05-technical-design.md](05-technical-design.md)。依据：[02-product.md](02-product.md)、[03-ui-design.md](03-ui-design.md)、`design/novel-import-wizard/wizard.js`、AGENTS.md，以及下文逐条引用的现有代码。本审核只读代码，未运行测试。

## 结论：不通过

方案的产品覆盖面完整，22 步、选择语义、图片选项和暂停/返回都有对应设计。但它对现有控制器、发布事务和作品资产上下文有几处假设与代码不符，按原方案实现会出现两类后果：一是未选章节的正文送进模型（违反 P02），二是并行导入、图片保存、伏笔写入在运行时直接失败。阻断项 1–6 修订后需重新审核；重要项要在测试用例阶段之前写进方案，否则 TDD 无法确定期望值。

## 发现

### 1. 阻断：章节过滤只在新函数里做，现有链路仍读全书正文

- 证据：方案 §6 保留 `session.chapters`、`workingProse` 为全书，只新增 `selectedChapterUnits(s)`，在发布时再过滤。现有代码中直接读全书的位置有：
  - `desktop/main/novel-import.ts:773` `review()` 用 `workingImportUnits(s)` 全量单元送审核模型；
  - `desktop/main/novel-import.ts:385` `requestSnapshot` 默认把 `s.chapters` 全部章名送给模型；
  - `desktop/main/novel-import.ts:557` `semanticSources`、`:725` `semanticWorkflow` 都按全量单元；
  - `desktop/core/novel-import-outline.ts:22-25` `validateDetailedOutlineAssignments(s,true)` 要求 `s.chapters` 每章都有细纲，未选章节也被要求；
  - `desktop/service/novel-import-publish.ts:43-46` `assertPlan` 要求 `originalProse===sourceBody(s)`、章节拼接等于 `workingProse`。
- 另外，方案称"单元已不跨章"，这不成立。`splitImportUnits`（`desktop/core/novel-import.ts:18-41`）只按空行和 1000 字切分，`coalesceImportWorkingUnits`（`desktop/core/novel-import-budget-policy.ts`）还会合并相邻单元，都不看章界。
- 修复：在第 6 步确认时把选择**物化**，不靠每个调用方自己过滤。做法是 `workingProse = 选中章节 content 按序拼接`，`chapters` 只保留选中章节并重算 `start/end`，`workingUnits` 置空后重建，然后用 `wizard.chapterSelection` 记录原书中的 `{index,start,end,title,volume}` 供审计。`originalProse` 改为同一拼接；`assertPlan` 的 `originalProse===sourceBody(s)` 在 `wizardVersion===1` 下改为"每个选中章节等于 `sourceBody(s).slice(原 start, 原 end)`"。这样所有现有读取点自动只看到选中内容，`chapterIndex` 也天然是选中后的序号，`selectedChapterUnits` 可以删掉。返回第 6 步时从 `sourceBody` 重新物化。

### 2. 阻断：导入运行中控制器拒绝一切操作，单项重试/跳过无法执行

- 证据：`desktop/main/novel-import.ts:154` 在有后台作业时拒绝所有操作，报"导入正在处理，请先暂停"。这样 `wizard-task{retry|skip|skip-failed}`、`wizard-read-image` 在第 10/12/14/16 步都会失败。产品要求失败项在其他项运行时可单独重试，底栏可"跳过失败项并继续"（02-product §并行导入）。
- 修复：列出运行中允许的白名单动作（`wizard-task`、`wizard-read-image`、`current`、`pause`、`cancel`），在 `this.jobs.size` 检查之前分流。这些动作只改调度器内存队列和任务状态，**不递增 epoch**，通过 `checkpoint()` 串行保存。调度器作为一次 `launch()` 作业运行，内部用两个 Promise 池；单项失败只写任务状态，不得把错误抛给 `launch` 的 catch（`:331`），否则整个会话会被置为 `failed`。

### 3. 阻断：并行请求会触发 PDF 繁忙和来源全量重读

- 证据：每次 `this.ai()` 前后各调用一次 `this.verify(s)`（`desktop/main/novel-import.ts:419,425`），其中每个 PDF 都会调用 `pdf.verify`（`:371`）。`NovelImportPdfClient` 只允许 1 个运行、1 个排队，第 3 个直接报 `busy`（`desktop/main/novel-import-pdf-client.ts:35`）。并发 4 时 PDF 来源必然失败。非 PDF 来源每次请求也要重读并哈希全部来源文件（`desktop/main/novel-import-files.ts:361-368`），4 并发下每项要读 8 次。
- 修复：调度器每轮只做一次核验，可以每批启动前一次，或者限定最长间隔，比如 30 秒内复用核验结果；`ai()` 增加 `verified` 参数跳过重复核验。返回结果后改为一次合并核验，核验失败时丢弃本轮全部在途结果。PDF 核验必须串行化。

### 4. 阻断：图片生成的调用位置、取消和授权都不成立

- 证据：
  - 方案 §11.1 说"主进程调用 `generateLocalImage`（`desktop/service/models.ts:103`）"。但这个函数在服务 worker 内，靠 `callMain` 回调主进程（`desktop/service/models.ts:16,116`），主进程里的控制器不能直接调用它。主进程对应的入口是 `modelService.startImage/read/cancel`（`desktop/main/index.ts:318-320`、`desktop/main/model-service.ts:94-130`）。
  - `stopAction` 只取消 `this.operations` 里的文本请求（`desktop/main/novel-import.ts:833`），图片任务既不在 `operations`，也不在 `jobs`，暂停时不会被中止。
  - `Options.models()` 和 `novelImportModels()` 只返回 text/review（`desktop/main/novel-import.ts:27`、`desktop/main/index.ts:190-193`），`ImportModel` 也没有 IMAGE 类型。`imageGrant` 的 `same()` 校验无从比较，渲染进程也拿不到真实图像模型名（产品要求"选项下方显示所用图像模型名称"）。
- 修复：在 `Options` 中新增 `imageModel():Promise<ImportModel|undefined>` 和 `generateImage(model,prompt,sizes,signal):Promise<{bytes,mime}>`，由 `index.ts` 用 `modelService.startImage/read/cancel` 实现，并复用 `generateLocalImage` 的帧和长度校验。每个图片任务持有 `AbortController`，登记到控制器的 `imageOperations`；`stopAction` 要同时中止这些任务并等它们结束，结束后才写暂停证明。`ImportView.models` 增加 `image`，只放名称和 id。

### 5. 阻断：发布时作品资产上下文不存在

- 证据：`saveWorkImage` 依赖 `currentWorkAssets()`，上下文里没有 `assets` 时会抛错（`desktop/service/image-assets.ts:3`）。导入的 `initialize` 运行在 `runInDatabaseContext({workspaceId,database})` 中，没有传 `assets`（`desktop/service/workspaces.ts:226`），所以方案 §11.3"`currentWorkAssets()` 可用"不成立。
- 另外，暂存图片放在主进程私有目录 `<root>/novel-imports/<id>/images/`，而发布在服务 worker 里执行（`desktop/service/index.ts:130-134`）。`ImportPublishInput` 只带 session，worker 拿不到图片字节。
- 修复：
  1. `workspaces.ts:226` 把 `connection.assets` 传进 `initialize` 的上下文；
  2. 主进程在 `publish` 前读取暂存文件并校验 sha256 与魔数，把 `{taskId,mime,sha256,bytes}` 随 `ImportPublishInput.images` 传给 worker，worker 再校验一次 sha256；
  3. `initialize` 在 `$transaction` 之前用 `assets.save()` 写入，事务失败时对本次已写文件调用 `assets.removeCreated()`（`desktop/service/workspace-assets.ts` 已提供），不要像方案那样"接受孤儿"。注意发布重试时 `verify` 分支直接返回，不能再次写图。

### 6. 阻断：伏笔写入会被 `validatePlanning` 和 `materialRefSchema` 拒绝

- 证据：
  - `src/lib/planning/domain.ts:520-521`：讲述卡里每个 `role:'plant'` 的 materialRef，都必须在**同一讲述的 refs** 引用的某个世界事件上，找到同一伏笔的 `plant`。方案 §9 只要求触点"至少有正文"，`eventId` 可以为空，也没有校验叙事卡的 `refs` 是否包含该事件，因此只要一个 PLANT 触点有 `narrativeId` 而没有对应 `eventId`，整个发布事务就会失败。
  - `src/lib/material-reference.ts:3-8` 要求 `note` 为 1–500 字，方案的 `{kind,id,role}` 缺少 `note`；`eventSchema`/`tellingSchema` 的 `materialRefs` 最多 40 条（`domain.ts:30,127`）。
  - 叙事 artifact 发布时会按 10 万字拆成多张卡（`desktop/service/novel-import-publish.ts:111`），方案没说 ref 挂在哪一张。
- 修复：在 `novel-import-foreshadow.ts` 的纯函数里预演：只有 `eventId` 存在、且 `narrativeId` 对应叙事的 `refs` 含该 `eventId` 时，才在讲述卡上写 `plant`；否则只把 `plant` 写在事件上，讲述卡不写，并记入导入记录。`note` 取触点 `summary` 截到 500 字。materialRef 只挂第 0 张卡；超过 40 条时截断并记录。发布前对完整 planning 草稿调用一次 `validatePlanning` 作为单元测试断言。

### 7. 重要：并行导入时，引用尚未完成的候选会被判为硬错误

- 证据：`importNativeMappings` 遇到推断产物引用了不存在的实体时，`drop()` 会直接抛错（`desktop/core/novel-import-semantic-state.ts:56,61`）。角色 A 的关系指向还没导入完的角色 B 的候选 id，或者场景的 `parentId` 指向还没完成的上级场景时，`mergeImportArtifacts` 之后的校验会失败（`desktop/main/novel-import.ts:702` 同类写法）。方案只为世界设定声明了依赖顺序。
- 修复：实体任务输出中，指向候选 id 的外键先存为 `pendingRefs`，单项校验时只核对目标是否属于已选候选目录。本步全部任务进入 `done|skipped` 后统一解析：已导入的写入 `characterId`/`parentId`，跳过的按产品"只保留名字"删掉 `characterId`，再调用一次 `importNativeMappings`。场景按上级优先排队；只有上级被跳过时，才把 `parentId` 置空。

### 8. 重要：冲突、遗漏补全和作者决定都会走回旧流程

- 证据：
  - `semanticAnalyzeUnits` 一出现 pending 冲突就把会话置为 `conflicts` 并停止（`desktop/main/novel-import.ts:704`），会打断第 10 步并行；
  - 审核得到的 `missingTargets` 没有 `artifactId` 时，会新增实体（`:645-656`），可能导入作者在第 9 步取消的角色；
  - 作者决定后，`semanticDecision` 和 `resolveConflict` 都会 `launch(this.workflow)`（`:604,618,827`），`resume`/`start` 也进 `workflow`（`:533,546`），这条路径会按旧的 12 类全量重跑。
- 修复：`wizardVersion===1` 时，实体步骤中产生的冲突只记录，不切换阶段，统一在第 21 步处理；审核阶段的 `missingTargets` 只接受指向已选候选或已有 artifact 的条目，新实体一律丢弃并记录；`workflow()` 入口按 `wizardVersion` 分派到 `wizardWorkflow`，`start/resume/resolve/prepareReviewPolicy` 也必须逐一写明向导分支。

### 9. 重要：会话阶段、恢复和目录授权没有和向导步骤对齐

- 证据：
  - `phase` 只有 11 个值（`desktop/shared/novel-import.ts:94`，`validJournal` 在 `desktop/main/novel-import.ts:141` 写死这些值），方案没有规定 `wizard.step` 与 `phase/resumePhase` 的映射，比如清单步骤停在 `waiting` 时 phase 取什么值；
  - `start()` 要求目录已授权（`:517`），`resume()` 在目录需重新授权时把阶段退回 `confirm`（`:537`），重启后一律设置 `targetNeedsAuthorization=true`（`:136`），这与方案 §5"不在第 3 步阻塞恢复"矛盾；
  - `chooseTarget` 在存在分析检查点时，禁止改选其他目录（`:330`），与产品"返回修改作品与目录不丢弃已识别内容"矛盾。
- 修复：补一张状态表，列出 22 步各自对应的 `phase`、`resumePhase`、允许的动作和恢复入口。向导会话的分析检查点改为不绑定 target（目录只在第 22 步保存前校验），或者明确"更换目录需重新授权并保留结果"，并删掉 `:330` 在向导下的限制。重启恢复时，在当前步骤要求重新允许发送，不退回 `confirm`。

### 10. 重要：授权哈希和语义检查点没有包含向导选择

- 证据：`ai()` 只对 structure 请求核对 `grant.hash`（`desktop/main/novel-import.ts:420`），analyze 请求不检查范围哈希；运行时证明的 `scopeHash`、`importSemanticInputHash`、`canRestoreAnalysis` 用的都是 `importScopeHash(s,'analyze')`（`:329,425`、`desktop/core/novel-import-semantic-state.ts:14`），其中不含 `chapterSelection` 或候选选择。方案只在授权时用新的 `importWizardScopeHash`，之后没有任何地方校验它。
- 修复：在 `importScopeHash` 的 analyze 分支，当 `wizardVersion===1` 时加入 `wizard` 摘要（选中章节、各类选中候选 id、图片选项），所有现有调用点自动生效；`ai()` 对 analyze/review 也核对 `analysisGrant.hash===importScopeHash(s,'analyze')`。注意：如果按第 1 条物化正文，章节选择已经体现在 `workingProse/chapters` 里，候选选择仍需单独加入。

### 11. 重要：新增意图需要改的契约文件没有列全

- 证据：`intent` 的枚举出现在多处：运行时证明 schema 只允许 `reconcile|structure`（`desktop/core/novel-import-runtime-proof.ts:4`）；服务端 `semanticContextSchema` 同样只允许这两个（`desktop/service/novel-import-ai.ts:182`）；`ai()` 的返回字段白名单（`desktop/main/novel-import.ts:425`）和服务端白名单（`novel-import-ai.ts:202`）都没有 roster 字段，roster 结果会被判"越权内容"。§15 文件清单漏了 `novel-import-runtime-proof.ts`。
- 修复：在文件清单和测试中加入上述 4 处。roster 结果使用新的键名 `roster`，两处白名单各加一项 `roster:['roster']`；`entity` 意图返回 `artifacts`，可复用 analyze 白名单。

### 12. 重要：扩展角色字段无法按会话版本选择

- 证据：`IMPORT_SEMANTIC_FACT_FIELDS` 是单一常量（`desktop/core/novel-import-semantics.ts:40-48`），严格校验遇到未知字段直接失败（`:139-140`）；`validateImportSemanticArtifact`、`importNativeMappings` 的输入只有 artifact，拿不到 session（`desktop/core/novel-import-semantic-state.ts:39`）。方案说"按版本选择字段表"，但没有给出版本信息从哪里传进来。
- 另外，发布时先建角色、后建卷章（`desktop/service/novel-import-publish.ts:72` 在 `:87-92` 之前），而 `arcStages[].startChapter` 需要 `{chapterId,volumeId,label}`（`src/lib/arc-stage.ts:254-258`）。
- 修复：在 `ImportArtifact` 上加可选字段 `schema?:2`，由向导实体任务写入；字段表和 `ImportNativeProjection` 按 `schema` 选择，旧产物没有这个字段，行为不变。JSON 字段写库前用 `normalizeMotivations`（`src/lib/motivation.ts:51`）、`normalizeBeliefs`、`normalizeBigFive`、`normalizeArcStages`（`src/lib/arc-stage.ts:379`）规整。`arcStages` 在章节创建后再用 `tx.character.update` 写入。物品的 `aliases`（≤10，单个 ≤50 字）和 `tags`（≤8，单个 ≤20 字）要按 `prisma/schema.prisma` 注释中的限制裁剪。

### 13. 重要：图片暂存、丢弃和容量规则不完整

- 证据：
  - `discard()` 遇到 `.owner`、`session.json` 以外的任何条目都会拒绝，并且对每个条目调用 `regular()`，目录会失败（`desktop/main/novel-import.ts:842`）；
  - 写文件和 `checkpoint()` 不是原子操作：文件写完后保存失败或被 epoch 丢弃，会留下未登记的文件，下次 `discard` 就被永久阻止；
  - 作品备份快照的附件合计上限是 256 MiB（`desktop/service/workspace-assets.ts:73`），方案允许单会话 1 GiB 图片，保存后的作品将无法备份；
  - 资产单张上限是 10 MiB（`:10`），`generateLocalImage` 可能返回 webp，方案缩略图只允许 PNG/JPEG。
- 修复：先用临时名写入，checkpoint 成功后再 rename 为 `<taskId>.<ext>`。`initialize()` 和 `discard()` 只认 `images/` 下符合 `^[a-z0-9:-]{1,80}\.(png|jpg|webp)$` 且登记在任务表里的文件，逐个按 `O_NOFOLLOW`、`nlink===1` 检查后删除，再 `rmdir(images)`；临时名和未登记文件只在本会话目录内清理。单会话图片合计上限降到 200 MiB 以内，并在第 9/11/13 步按选中数预估，超过时提示。缩略图允许 webp。`wizard-revise` 要同步删除被丢弃的图片文件。

### 14. 重要：没有模型时，资料清单无法形成产品要求的清单和树

- 证据：`sourceImportArtifacts` 只对角色按"名字："行拆块；场景、物品、世界观每个文件每类只产出一个 artifact，名称取标题或文件名（`desktop/core/novel-import.ts:153-155`）。资料中的世界观也没有 `entityType`，只会生成映射警告（`desktop/core/novel-import-semantics.ts:169`）。所以"仅拷贝"模式下，第 11/13 步只会有一行文件名，第 15 步无法生成世界 → 子项树。
- 修复：明确无模型时的展示：场景、物品、世界观清单按资料块列出，世界观树退化为单层"资料块"列表，并在产品验收 P10 中写明这一预期；或者新增按 Markdown 标题拆块的本地规则，并为它单独写测试。

### 15. 重要：发布事务在 120 秒内完成没有依据

- 证据：事务超时为 `timeout:120000`（`desktop/service/novel-import-publish.ts:118`），章节是逐条 `tx.chapter.create`（`:92`）。向导还会增加角色全字段、图片记录和逐个 update、伏笔触点及其引用。1394 章的书没有任何实测数据。
- 修复：测试计划中加入 PGlite 基准：1394 章、300 角色、1000 触点下测量发布事务耗时，要求留出 2 倍余量。超出时把章节改为预生成 id 后 `createMany`，触点和引用也用 `createMany`。

### 16. 重要：每完成一项都保存整份日志，写入量过大

- 证据：`save()` 每次对整份会话执行 `JSON.stringify` 并 fsync（`desktop/main/novel-import.ts:99-110`）；`recordRuntime` 在每次请求开始时也保存一次（`:416,425`）。会话里有全书原文和工作稿各一份，再加上 artifacts，《诡秘之主》量级下单次保存有数十 MB。几百个实体加图片任务会写出数十 GB。
- 修复：调度器合并保存，同一个 serial 回合内把已完成的多个结果一次写入，保证"结果被采用之前已经落盘"这条语义不变。需要的话，在方案中给出保存频率上限，并加一条性能测试。

### 17. 重要：图片提示词的画风语境没有可用来源

- 证据：`resolveImageContext` 读取 `Theme.genre/tags`（`src/lib/services/character-image.ts:25-38`），但导入只写 `theme.synopsis`（`desktop/service/novel-import-publish.ts:80`），主题 artifact 也没有 genre/tags 字段（`novel-import-semantics.ts:46`）。另外，`buildCharacterImagePrompt` 要求必填 `appearance` 和 `clothing`（`src/lib/character-image-prompt.ts:11-26`）；场景、物品图需要的字段在 §8.3 中有扩展。
- 修复：明确向导的 `ImagePromptContext` 为 `{}`；如果确实要按主题，就新增 `theme.genre/tags` 的提取和写库，使保存后面板重新生成时的语境与导入时一致。外观和穿衣都为空时，角色图片任务直接失败并给出原因（与场景"缺少外观描述"一致）。

### 18. 重要：日志新增字段缺少结构校验

- 证据：`encodeImportJournal` 和 `validJournal` 对每一块状态都有 schema 校验（`desktop/main/novel-import.ts:42,141-142`），方案新增的 `wizard` 状态没有。
- 修复：新增 `validateImportWizardState`，用严格 zod schema 限定候选数、任务数、id 格式和 `step` 枚举，在 `encodeImportJournal`、`validJournal`、`initialize` 三处调用。没有 `wizardVersion` 的会话不得含有 `wizard` 字段。

### 19. 建议：编码识别的修改说明

`desktop/main/novel-import-files.ts:235,245` 改为 `ambiguous=false` 即可。HTML 也走同一个 `decode`（`:347`），方案应说明 HTML 同样适用。`reselectOrdinarySource` 依赖 `requiresEncodingConfirmation`（`desktop/main/novel-import.ts:295,305,312`），需要补测试证明行为不变。

### 20. 建议：候选与物品规则

资料来源的物品不应按"重要性"过滤掉。候选 id 中含 `:`，作为图片文件名时须先按第 13 条的正则校验。`wizard-select-candidates` 对世界节点"只存叶子"时，要写明没有子项的世界怎么处理（作为自身叶子）。

### 21. 建议：隐私

`toImportView` 把 `targetLabel: session.target?.path` 发给渲染进程（`desktop/core/novel-import.ts:316`）。这是现有行为，但与"路径不进渲染进程"冲突。向导的新视图不应扩大这一暴露；建议只显示目录名，或另开整改项。图片错误码（如 `IMAGE_RESPONSE_INVALID`）经 `safeError` 后都会变成通用文案，需要补充中文映射。

### 22. 建议：验收台账

AGENTS.md 要求把需求登记到 `docs/requirements-traceability.json`，该文件目前没有本功能的条目。方案 §16 应列出 P01–P14 与测试用例 ID 的对应关系，并写明真实目标验证（《诡秘之主》+ `LotmVerification.app`）覆盖哪些 ID，不能用一次启动冒烟代替。

## 复审

日期：2026-10-29。对象：05-technical-design.md v2。只读代码复核，未运行测试。

### 结论：不通过

v2 已正确解决原阻断 2–6，以及多数重要项。剩 1 个新阻断：第 6 步物化正文后，已保存的结构决定仍指向全书坐标，导致重启时崩溃、发布时失败。另有 9 项重要问题，需要在测试用例阶段之前写进方案。阻断项修订后，可按"有条件通过"进入测试用例阶段，不必再整体复审。

### 原意见逐条

| # | 状态 | 依据 |
| --- | --- | --- |
| 1 | 部分解决 | §6.1 物化后，现有读取点确实只看到选中章节；但物化与 `structureDecision` 的冲突没有处理，见新发现 N1 |
| 2 | 部分解决 | §4 白名单可以支持重试/跳过；但 §3 表中第 10/12/14/16、17–20 步允许的 `wizard-revise` 不在白名单内，调度器空等失败项时会挡住其他动作，见 N7 |
| 3 | 已解决 | §8.1 按 30 秒或 16 个请求合并核验，`ai(verified)` 跳过逐次核验，PDF 核验串行 |
| 4 | 已解决 | §11.1 新增 `imageModel/generateImage`（由 `modelService.startImage` 实现），图片任务登记到 `imageOperations`，暂停时中止并等待 |
| 5 | 部分解决 | §11.5 传入 `assets`，图片字节随发布输入传递，失败时 `removeCreated`；重试时重复写图、场景图 url 格式两处仍有问题，见 N9 |
| 6 | 已解决 | §9.1 规则 3/5 满足 `domain.ts:520-521`；`note`、40 条上限、只挂第 0 张卡都已规定，并要求用 `validatePlanning` 断言 |
| 7 | 部分解决 | §8.3 引用延后解析的思路正确；但服务端 `validateSemanticLinks` 对实体目录有类型要求，§8.2 的目录格式会被拒绝，见 N5 |
| 8 | 已解决 | §8.7 冲突延后到第 21 步，新实体遗漏一律丢弃，6 个入口都按向导分派 |
| 9 | 部分解决 | §3 给出了步骤与 phase 映射；但现有代码 `set-chapters`（`novel-import.ts:165`）、`set-title`（`:167`）、`recognizeStructure`（`:456`）都会把 phase 写成 `confirm`，方案没要求向导覆盖这些写入 |
| 10 | 部分解决 | 范围哈希已包含向导摘要，`ai()` 也新增了哈希校验；但 §10.1 每次确认清单都改写授权哈希，会引出新问题，见 N2 |
| 11 | 部分解决 | 已列入 4 处修改；但服务端 `runImportAi` 中按 analyze 处理 artifacts 的循环（`novel-import-ai.ts:351-363`）、analyze 必须返回 notFound 的规则（`:368`）、`importAiResponseSchema` 的 analyze 分支（`:34`）都要对 roster/touches 分流；`ImportSemanticRequestFields.intent` 的类型（`novel-import-semantics.ts:34`）也要扩展 |
| 12 | 部分解决 | V2 字段表与 `schema:2` 的思路可行；但直接读 `IMPORT_SEMANTIC_FACT_FIELDS` 的位置还有 `novel-import.ts:609,630`、`novel-import-semantics.ts:73,139,280`、`novel-import-ai-payload.ts` 的 prompt，需要统一改成按产物取字段表的函数；服务端 artifact schema 是严格的（`novel-import-ai.ts:14`），`schema` 字段只能由主进程在收到结果后写入；伏笔 V2 的 `touches/status` 字段不在 §8.5 表中 |
| 13 | 部分解决 | 已规定白名单、容量（200 MiB）和 webp；但"先保存检查点、后 rename"有崩溃窗口，见 N4 |
| 14 | 部分解决 | 本地拆块规则已补；但默认类型映射为 CONCEPT，资料拷贝模式下会变成不可投影，见 N8 |
| 15 | 已解决 | §12 改用 `createMany`，§14 要求 PGlite 基准不超过 60 秒 |
| 16 | 部分解决 | 合并保存可以降低写入量；但与运行时证明的语义冲突，见 N3；批量提交中单项合并失败会连累整批，见 N6 |
| 17 | 已解决 | §11.2 画风语境固定为 `{}`，外观字段为空时任务直接失败 |
| 18 | 已解决 | §2.2 新增严格 schema，在三处调用 |
| 19 | 已解决 | §5 把 `ambiguous` 改为 false，HTML 同样适用，补测试 |
| 20 | 已解决 | §7.2 资料物品始终保留，§2.1 定义 id 正则，§8.6 处理无子项的世界 |
| 21 | 已解决 | §2.3 目录只给目录名，§13 增加图片错误码中文映射 |
| 22 | 已解决 | §15/§16 把 P 编号登记到台账，真实验证的覆盖范围逐条列出 |

### 新发现

#### N1. 阻断：物化正文后，结构决定与章节坐标不一致

- 证据：
  - 物化后 `s.chapters` 只含选中章节，但 `chapterDetection.structureDecision.volumeCuts` 仍是全书坐标。`initialize()` 恢复会话时，调用 `verifiedImportStructureVolumeCuts(s, s.chapters…, sourceBody(s))`（`desktop/main/novel-import.ts:131`）。这个函数（`desktop/core/novel-import-structure.ts:199-207`）要求章节数与全书结构一致，否则抛出"结构决定与当前章节不一致"。该调用不在逐会话的 try 里，**只要有一个向导会话进过第 6 步，重启后导入控制器就初始化失败**。
  - `assertPlan` 的 chapterVersion 2 分支（`desktop/service/novel-import-publish.ts:30-33`）用 `workingProse` 重建卷归属，但 v2 只改了 `:43-46`。正文改变后，`verifiedImportStructureVolumeCuts` 返回 undefined，`deriveImportVolumeCuts`（`desktop/core/novel-import-chapters.ts:163-177`）改为在物化正文中检测卷标题。如果某卷的第一章没选，卷标题文字也不在了（卷标题属于该卷首章正文）：后续章节要么继承前一卷名，报"卷归属与原文卷标题不匹配"；要么人工卷名与来源卷名重名，报"人工卷名必须与来源卷…区分"。模型识别出的卷（原文没有卷标题）则会全部丢失可信来源。
  - 返回第 6 步复用 `invalidate(s,false)`（`desktop/main/novel-import.ts:191`）。因为 `s.chapters` 拼接不等于 `sourceBody`，这一步会按全书重新检测章节，并把 `chapterDetection` 改为 auto，丢掉模型识别的结构。
  - 第 21 步允许 `apply-patches`，而 `applyImportPatches`（`desktop/core/novel-import.ts:292`）对物化正文重新检测章节，选中章节的结构和卷名会丢失。
  - 第 6 步的 `set-chapters`（`desktop/main/novel-import.ts:165`）基于全书、清空分析结果并把 phase 写成 `confirm`，不会同步更新 `wizard.structure` 和 `chapterSelection`。
- 修复：向导会话的卷章可信来源统一改为 `wizard.structure` 与 `structureHash`。
  1. 物化时用 `wizard.structure` 构造可信卷名映射（物化坐标 → 卷名），存入 `wizard.materializedVolumes`；
  2. `initialize:131`、`assertPlan:30-33` 在 `wizardVersion===1` 时改为校验 `structureDecision` 对应 `wizard.structure`（全书坐标），并用 `materializedVolumes` 校验物化章节；
  3. `wizard-revise{to:'tree'}` 不调用 `invalidate` 的重新检测，直接从 `wizard.structure` 恢复全书 `s.chapters`、`originalProse=''`、`workingProse=''`；
  4. `set-chapters` 在向导下更新 `wizard.structure`、重置 `chapterSelection` 为全选，phase 保持 `select`；
  5. 向导会话的 `apply-patches` 用 `materializedVolumes` 与原章界偏移重建章节，不重新检测，或在第 21 步禁用 rewrite/patch。
  每条都要加单元测试：第 7 卷首章未选、模型识别卷、重启恢复、补丁后发布。

#### N2. 重要：§10.1 每次确认清单都改写授权哈希

- 证据：
  - `importSemanticInputHash` 包含范围哈希（`desktop/core/novel-import-semantic-state.ts:14`），`semanticCheckpoint` 在哈希不一致时抛错（`desktop/main/novel-import.ts:552`）。凡是在已有 `semanticState` 之后改变选择的路径（第 21 步 `wizard-retry-kind`、冲突决定后重跑）都会报"语义检查点不匹配"。
  - "只允许移除"没有实现依据：授权只存一个哈希，无法证明新选择是旧选择的子集。
  - 改写哈希时没有要求核对模型是否变化（`same()`）。
- 修复：分开两种范围。`importScopeHash(s,'analyze')` 只包含物化正文与第 6 步状态，`analysisGrant.hash` 在第 6 步之后不再改写。候选与图片选择另用 `wizardSelectionHash` 绑定：调度器提交结果前、`importPlanHash` 计算时校验它。如果仍要把候选选择加入语义 inputHash，必须写明每次改变选择都要重建 `semanticState`。"只允许移除"改为在 `wizard` 中保存第 6 步授权时的章节集合，后续检查选中章节是它的子集即可（候选本身不扩大发送范围）。

#### N3. 重要：合并保存后，运行时证明与实际调用不符

- 证据：`syncRuntime` 只把 `runtime.last` 写进日志（`desktop/main/novel-import.ts:415`），并发 4 时只能记录最后一个调用；`recordRuntime` 原本保证调用发出后、结果被采用前，"调用中"记录已落盘（`:416,425`），持久化失败还会取消该调用。§8.1 把它并入 2 秒节流后，崩溃时可能有在途调用没有任何持久记录，重启后诊断会少报。图片调用也不计入暂停证明的 `remaining`（`desktop/core/novel-import-runtime-proof.ts:8`），可能在图片仍运行时报"已清空"。
- 修复：二选一，写进方案。一是把运行时诊断写到会话目录下单独的小文件 `runtime.json`（≤16 KiB，按调用原子写入），整份日志仍然节流；`discard/initialize` 白名单加入该文件。二是保留逐调用保存，但只在实体池满载时允许节流，并接受写入量。另外，`ImportSession.runtimeAiCall` 要能记录多个并发调用，或明确只记录最后一个、不作为在途证明；暂停证明的 `remaining` 增加 `imageOperations` 计数，schema 同步更新。

#### N4. 重要：文件 rename 的时机有崩溃窗口，§8.4 自相矛盾

- 证据：§11.3 是"先写临时文件，检查点保存成功后再 rename"。如果在检查点落盘之后、rename 之前崩溃，日志里任务已完成，但 `initialize` 会把临时文件删掉，发布时找不到图片。§8.4 的实体结果文件写的是"用于崩溃恢复"，同时又说"重开时未登记文件删除"，因此实际不能恢复任何东西；况且重启后 epoch 已递增，也不能安全采用这些结果。
- 修复：图片改为"先写临时文件、fsync，再 rename 为最终名，然后保存检查点"。`initialize` 删除未登记的最终名文件和临时文件；日志登记了但文件缺失或 sha256 不符的任务退回 `waiting`。§8.4 整节删除（日志是唯一事实来源），`wizard/` 目录和 `.json` 白名单一并删掉。

#### N5. 重要：服务端会拒绝单实体请求的实体目录

- 证据：服务端 `entitySchema` 是严格的，不含 `aliases`（`desktop/service/novel-import-ai.ts:183`），目录条目带 `aliases` 就报"语义实体目录类型无效"（`:218`）。`validateSemanticLinks` 还要求：场景上级的目录条目带 `entityType:'PLACE'`；世界设定的 `worldId` 指向 `entityType:'WORLD'` 的条目（`:225-227`）；关系目标存在于目录（`:222`）。
- 修复：§8.2 的目录改为 `ImportSemanticEntity`。角色写 `{id,kind,name}`，别名放进 instruction 中的只读 JSON；场景候选写 `entityType:'PLACE'`，上级写 `parentId`；世界候选写 `entityType:'WORLD'`，子项写 `entityType:'SETTING',worldId,settingType`。主进程通过 `request.entities` 显式传入，不用 `requestSnapshot` 根据 artifacts 生成的默认目录（`desktop/main/novel-import.ts:382`）。

#### N6. 重要：批量提交中一项合并失败会连累整批

- 证据：`mergeImportArtifacts` 在别名命中多个已有实体或 id 冲突时直接抛错（`desktop/core/novel-import.ts:252,254`）。§8.1 在同一个 serial 回合内提交多项结果，任一项抛错就会让整批变成全局错误（§4 规定全局错误使会话 `failed`）。
- 修复：在提交回合内逐项 merge；单项抛错时只把该任务标为 `failed`（错误文案经 `safeError`），其余继续提交；全部处理完后只 `save()` 一次。

#### N7. 重要：导入运行中无法返回修改，调度器空等时挡住其他动作

- 证据：§3 表中第 10–20 步允许 `wizard-revise`，但 §4 白名单不含它；`act()` 有后台作业时会拒绝（`desktop/main/novel-import.ts:154`）。只剩失败项时，调度器作业保持运行等待作者处理，期间 `wizard-revise`、`resolve` 等动作都被挡住。
- 修复：`wizard-revise` 进白名单，内部先走 `stopAction` 的取消与排空流程，再在 serial 中执行返回修改。或者规定：只剩失败或暂停项时，调度器提交后退出作业，步骤状态为 `waiting`；`wizard-task retry` 重新 `launch` 调度器。
- 推荐第二种：作业结束后不再挡住其他动作，暂停/恢复的语义也更简单。

#### N8. 重要：资料世界观默认映射为 CONCEPT，导入后不会写成设定

- 证据：资料拷贝模式下，CONCEPT/FACTION 在没有 `content` 时直接返回 `native:null`（`desktop/core/novel-import-semantics.ts:161-162`），这些条目不可投影，发布时不会写成 Setting 行，只出现在导入记录里。§7.3 把"其余"标题都映射为 CONCEPT，无模型时大部分世界观子项在作品中会看不到。
- 修复：本地拆块直接为资料 artifact 生成 `entityType/worldId/settingType/content` 字段。默认类型改用文本类（如 SOCIETY 的 `{text}`）；或者 CONCEPT 生成 `{concepts:[{term:标题,explanation:原文}]}`，并确认经过 `decodeImportWorldContent` 后内容不变。拆块和 `sourceImportArtifacts` 的改动只对 `wizardVersion===1` 生效，避免改变旧会话 `publicationRecord`（`desktop/service/novel-import-publish.ts:24`）中的资料 id。

#### N9. 重要：发布重试时重复写图，场景图 url 与面板格式不一致

- 证据：
  - 如果首次发布在事务已提交、manifest 未写为 ready 时中断，重试会再次进入 `initialize`（`desktop/service/workspaces.ts:199-226`）。事务内发现已有回执就直接返回（`desktop/service/novel-import-publish.ts:66`），但 §11.5 在事务之前已经再写了一遍图片，产生孤儿文件。
  - 场景面板的图片记录格式是 `{id:file.id, filename}`，url 为 `/api/novels/<novelId>/scenes/<sceneId>/images/<fileId>/asset`（`src/lib/services/scene-image.ts` 中的 `saveHistory`），读取时按图片 id 和 filename 查找（`readSceneImageAsset`）。§11.5 统一使用 `saveWorkImage` 的 url，与此不一致。
- 修复：写图前先在事务外查询 `contentMutation`，已存在就跳过写图。`SceneImage` 按 `saveHistory` 的格式写，`id` 等于资产 id，并写入 `filename`。角色和物品沿用 `saveWorkImage` 的 url，与 `character-image.ts`、`item-image.ts` 一致。

#### N10. 建议

- 第 6 步 `wizard-next{consent}` 要和 `start()` 一样检查模型配置与预算（`importSessionBudget`，`desktop/main/novel-import.ts:527`），失败时不要物化正文。
- 伏笔 artifact 的 `touches` 由复核和修订编辑后，第 21 步要重新运行 `planForeshadowTouches`，被丢弃的触点更新到 `dropped`。
- §3.1 返回修改要写明会清空 `deferredConflicts`、`checks`，并删除对应的 `s.conflicts`。

## v3 核对

日期：2026-10-29。范围：只核对 N1–N10 是否落实。

### 结论：有条件通过

N1 的卷章坐标问题已经解决。剩下一个条件 C1 需要在测试用例阶段之前写进方案，不必再复审。

| 项 | 状态 | 说明 |
| --- | --- | --- |
| N1 | 已解决（附 C1） | 第 5 步冻结全书结构决定；物化时直接平移坐标，不再检测；`initialize` 改为按向导结构校验，并放入逐会话 try；`assertPlan` 以 `materializedVolumes` 为卷名依据；返回第 6 步、`set-chapters` 都改为基于全书结构。现有代码只有 `novel-import.ts:131` 和 `novel-import-publish.ts:32` 两处调用 `verifiedImportStructureVolumeCuts`，两处 v3 都已覆盖 |
| N2 | 已解决 | 授权哈希在第 6 步后不再改写；候选选择改由 `selectionHash` 绑定；后续章节选择受 `grantedChapters` 子集约束 |
| N3 | 已解决 | 改为单独的 `runtime.json` 按调用原子写入，记录全部在途调用，暂停证明计入图片任务。注意：暂停证明 schema 是 strict 的（`novel-import-runtime-proof.ts:8`），新增的 `imageOperations` 必须设为可选，否则旧日志解析失败；并发总数不得超过追踪器上限 16 |
| N4 | 已解决 | 图片先 rename 再保存检查点；实体结果不再另存文件 |
| N5 | 已解决 | 实体目录改为 `ImportSemanticEntity` 格式，带场景和世界的类型字段，别名移到 instruction |
| N6 | 已解决 | 批量提交时逐项 merge，单项失败只影响该任务 |
| N7 | 已解决 | 只剩失败或暂停项时调度器退出，重试时重新启动 |
| N8 | 已解决 | 本地拆块对未匹配的类型默认用 SOCIETY 文本类保存，资料拷贝时可以投影 |
| N9 | 已解决 | 写图前先在事务外检查回执，有回执就跳过；场景图片按 `saveHistory` 的 id、filename、url 格式写入 |
| N10 | 已解决 | 第 6 步先检查模型与预算再物化；伏笔触点在第 21 步重新规划；返回修改时清空延后冲突与检查结果 |

### 条件

**C1（重要，进入测试用例阶段前写进方案）：向导中应用正文修改会清空已导入结果，但任务状态仍为已完成。**

- 证据：`applyImportPatches`（`desktop/core/novel-import.ts:295`）在章节处理之后，还会重置 `artifacts`（只剩资料产物）、`conflicts`、`decisions`、`semanticState`、`coverage` 和 `analysisGrant`，并把 phase 置为 `confirm`。v3 只改了章节重建，向导任务仍是已完成状态，而导入结果已经没有了，后果是校验失败或发布缺内容。
- 修复（二选一）：
  1. 向导会话的 `apply-patches` 应用后，等价执行一次 `wizard-revise{to:'detect-char'}`：保留物化与授权，重新导入第 9 步及以后各步；
  2. 第 21 步禁用 rewrite/patch 类冲突决定。

另有一处小问题：返回 files/kinds 时调用的 `invalidate` 会重新检测全书章节，所以 `wizard.structure`、`structureDecision`、`materializedVolumes`、`grantedChapters`、`chapterSelection` 也应一并清空，然后重新执行第 5 步。

### v3 核对后修订（主代理）

- C1 选方案 1：向导会话应用正文修改后，保留物化、授权与候选选择，清空第 9 步之后结果并回到识别角色；写入 05 §6.1 与 07 NIW-C19。
- 返回 files/kinds 时一并清空结构与章节选择状态；写入 05 §3.1 与 07 NIW-C66b。
- N3 注意事项：`imageOperations` 为可选字段；并发总数 6 ≤ 16；写入 05 §8.1，测试 NIW-U43。
