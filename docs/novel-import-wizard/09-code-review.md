# 导入作品分步向导：代码审核

日期：2026-10-29。审核范围：任务说明列出的新增与修改文件。依据：[05-technical-design.md](05-technical-design.md) v3、[07-test-cases.md](07-test-cases.md) v2、[02-product.md](02-product.md)、`AGENTS.md`。

## 结论：不通过

存在 3 条阻断问题：一是只导入资料的会话在第 4 步被硬拒绝，而新会话一律走向导，所以这是对旧功能的回退；二是第 21 步"修改正文导入副本"会把向导会话改坏；三是 TypeScript 类型检查不通过。另有多条重要问题，涉及调度器的错误处理、步骤跳过标记、伏笔数据丢失、未选资料进入模型请求、恢复与授权。

### 已执行的命令（Node v24.18.0）

| 命令 | 结果 |
| --- | --- |
| `node --import tsx --test tests/unit/novel-import-wizard.test.ts tests/unit/novel-import-wizard-session.test.ts tests/integration/novel-import-wizard-publish.test.ts` | 77/77 通过 |
| `node --import tsx --test tests/browser/novel-import-wizard.test.ts` | 23/23 通过 |
| `npx tsc --noEmit -p tsconfig.json` | **失败**，15 个错误，全部在 `tests/browser/novel-import-wizard.test.ts` |

这些结果都来自假 ai、假 generateImage 和假 publish，只证明代码路径。R 层（真实目标）未执行。

---

## 发现

### 阻断

**F1 只导入资料（未选正文）的会话在向导中被拒绝，而新会话一律走向导**
- 位置：`desktop/main/novel-import.ts:256`（`if(!s.selected.includes('body'))throw Error('未选择正文的导入将在后续版本步骤中开放')`）；`desktop/main/index.ts:393` 设置了 `wizard:true`。
- 失败场景：作者只选 `资料.md`（夹具 F0），或在第 4 步取消"正文"，点"开始导入"后报错，无法继续。旧流程原本支持只导入设定；现在所有新会话都进入向导，这项能力在正式产品中消失。P10、NIW-C06、NIW-C83 都不能实现。另外，该行之前的 `wizardSkippedSteps` 已经改写了 `stepState`，抛错后这些改动留在内存里（见 F14）。
- 修复：按 05 §7.3 实现不含正文的路径：跳过第 5–8 步，第 9/11/13/15 步的清单用 `splitWizardSourceBlocks` 生成，之后只做资料拷贝。在完成前，不要让只含资料的会话进入向导（新会话在这种情况下应回到旧流程），并补 C06、C83、B20 的控制器级用例。

**F2 第 21 步的"修改正文导入副本"走的是旧流程的 `applyImportPatches`，会把向导会话改坏**
- 位置：`desktop/main/novel-import.ts:234`（`case 'apply-patches':applyImportPatches(s,action.patchIds);s.epoch++`）；`desktop/core/novel-import.ts:293-296`。
- 失败场景：第 21 步出现正文冲突，作者选"修改正文导入副本"，确认补丁（`NovelImportDialog` 的 patches 屏幕不在向导分流的排除列表内，这条路可以走到）。`applyImportPatches` 会做以下改动：
  1. 用 `importSessionChapters` 在物化正文上重新检测章节。卷标题已不在物化正文里，章节的卷名与 `materializedVolumes` 不再一致。
  2. `s.artifacts=sourceImportArtifacts(s)`：向导导入的全部 V2 实体被丢掉，换成资料文件中的全部条目，**包括作者取消的候选**。
  3. 把 `phase` 写成 `confirm`。`wizard.step` 仍是 `verify`，`w.checks` 是旧结果，没有清空。
  
  结果：如果作者此时点"保存作品"，发布会被卷归属或语义检查点拒绝；如果卷名恰好一致，则会发布未选的资料条目，同时丢失已导入的实体。重启后 `initialize`（`:171`）对 `workingRevision>0` 的会话用 `s.chapters` 直接调用 `assertWizardMaterialization`，没有像 `assertPlan`（publish:45）那样换成 `originalProse` 的区间，会话因此不能恢复。
- 修复：按 05 §6.1 C1 实现向导专用的 apply-patches：不重新检测章节，只平移 `start/end` 与 `materializedVolumes`；补丁跨章界时拒绝；在同一提交内执行等价于 `revise{to:'detect-char'}` 的清理。`initialize` 中的校验改用与 `assertPlan` 相同的 `originalProse` 映射。补 NIW-C19。

**F3 类型检查失败**
- 位置：`tests/browser/novel-import-wizard.test.ts:48,62,81,106`（`window.wizardFixture` 没有声明，回调参数被推断为隐式 any）。
- 失败场景：`npx tsc --noEmit -p tsconfig.json` 退出码非 0，流水线的类型门禁不能通过。
- 修复：在该测试中声明 `declare global { interface Window { wizardFixture: … } }`，或在 `page.evaluate` 中做显式类型断言。

### 重要

**F4 调度器把来源核验放在单项 try 内，开始时还会并发调用**
- 位置：`desktop/main/novel-import.ts:351`、`:376`。
- 失败场景一：核验期间来源被改动（NIW-C47）。`verify()` 抛出的错误被单项 catch 当作该任务失败，调度器继续发送其他请求，每个任务依次失败；`launch` 对 `PdfFileChanged` 的处理被绕过，会话也不会变成 `failed`。05 §8.1 要求核验失败是全局错误。
- 失败场景二：开始时 `lastVerify=0`，4 个实体 worker 同时进入 `verify()`（`lastVerify` 在 await 之后才更新）。PDF 客户端只允许 1 个运行加 1 个排队，后到的调用报 busy，这些任务失败（NIW-C45）。
- 修复：把核验移到 worker 外，由一个共享的 Promise 串行执行（in-flight 去重）；核验失败时中止全部在途请求和图片任务，然后向外抛出。

**F5 一个 worker 抛错后，其他 worker 和在途请求不会被取消**
- 位置：`desktop/main/novel-import.ts:392`（`Promise.all`）、`:355-364`（commit 中 `save()` 的异常向外传）。
- 失败场景：某次 `commit` 保存失败，或出现 F4 之外的全局错误，`Promise.all` 立即 reject，`launch` 把会话标为 failed，并把该作业从 `jobs` 中移除。其余 worker 仍在调用模型和图像服务：`controller.active` 已为 0，但请求还在途。它们返回后进入 `commit`，此时 epoch 没有变化，`current()` 能通过，结果会被写进一个已经 failed 的会话。
- 修复：worker 共用一个 AbortController，第一处全局错误发生时中止全部 `operations`/`imageOperations`，用 `Promise.allSettled` 等所有 worker 结束后再抛出；或者在 `launch` 的 catch 中递增 epoch。

**F6 运行中不能对单项"重试/跳过"（05 §4 白名单没有实现）**
- 位置：`desktop/main/novel-import.ts:197-201`。白名单只有 `wizard-revise` 和 `wizard-read-image`；`wizard-task` 走到 `if(this.jobs.size)throw Error('导入正在处理，请先暂停')`。
- 失败场景：10 个角色导入时第 4 个失败，失败卡片在界面上显示"重试""跳过"（`NovelImportWizard.tsx:142`），底栏显示"跳过失败项并继续"。在其他任务结束前点这些按钮都会报错。NIW-C31（运行中 skip、epoch 不变）不可能通过；现有测试 C31b 只覆盖调度器退出之后的情况。
- 修复：在 `jobs.size` 检查之前分流 `wizard-task`，在 serial 中修改任务状态并 `checkpoint()`。如果调度器正在运行，把 retry 的任务重新放进调度器的内存队列（队列需要可从外部注入），不要再次 `launch`。

**F7 "已跳过"标记一旦写入就不会清除，返回修改或改选后对应步骤仍被静默跳过**
- 位置：`desktop/main/novel-import.ts:255`（第 4 步只写 skipped）、`:645`（`confirmRoster` 只写 skipped）、`:584`、`:509`（revise 和 retryKind 都保留 skipped）。
- 失败场景一：第 11 步作者不选场景，`import-scene` 被标为 skipped。之后 `wizard-revise{to:'detect-scene'}`，重新识别后选 5 个场景再继续，`wizardRun` 看到 `import-scene` 是 skipped 直接越过，场景不会导入，也没有任何提示。
- 失败场景二：第 4 步先关闭"推断"（第 9–20 步被标 skipped），在第 6 步 `wizard-back` 回到第 4 步打开推断再继续，第 9–20 步仍然全部跳过。
- 修复：第 4 步每次进入下一步时，先把第 5–20 步的 skipped 全部清掉，再按 `wizardSkippedSteps` 重写。`confirmRoster` 在选中数大于 0 时把导入步骤写回 pending。revise 只保留第 4 步规则产生的 skipped（可以每次重新计算，不必存储）。

**F8 未导入世界观时，主题、文风、金手指、爽点也不会导入**
- 位置：`desktop/main/novel-import.ts:524`（settings 任务只在 `planEntityTasks(kind==='world')` 中建立）；`desktop/core/novel-import-wizard.ts:18`。
- 失败场景：来源只有角色资料与"主题"资料，或第 15 步世界观全部不选或跳过。`import-world` 被标为 skipped，四类其他设定任务从未建立，主题、文风等全部丢失，也不进入 `skipped` 列表。
- 修复：只要有任一 settings 任务，就不要跳过第 16 步（`wizardSkippedSteps` 与 `confirmRoster` 都要考虑 settings）；世界观为 0 项时第 16 步只运行 settings 任务。

**F9 资料文件中的世界线、叙事线、伏笔、大纲在不推断时被丢弃**
- 位置：`desktop/core/novel-import-wizard.ts:19-20`（第 17–20 步只按"推断"判断是否跳过）、`desktop/main/novel-import.ts:426`（`prepareOutline` 只在 `runLine('outline')` 中调用）。
- 失败场景：`infer=false`，选了"大纲.md"或世界线资料。第 17–20 步都被跳过，这些资料不进入作品。代码注释"Lines are imported from source files only through the settings pass"与实现不符：`WIZARD_SETTINGS_KINDS` 里没有这四类。
- 修复：第 17–20 步对"只从文件导入"的情况执行资料拷贝（大纲调用 `prepareOutline`，其余调用 `sourceImportArtifacts` 后合并）；或者在第 16 步的 settings 中加入这些类别。

**F10 `wizard-retry-kind` 之后所有伏笔被删除；第 20 步与第 21 步失败后无法重试**
- 位置：`desktop/main/novel-import.ts:503-511`、`:441-448`、`:463`、`:223`。
- 失败场景一：第 21 步角色关系检查失败，作者点"重试导入角色"。`retryKind` 把第 17–20 步重置为 pending，但没有清 `coverage`。到第 20 步时 `coverage.touches` 已覆盖全部单元，不发请求；`touchStash` 早已删除，`applyForeshadowPlan` 拿到的是空分组，于是把 `schema===2` 的伏笔 artifact 全部删除，`foreshadowRefs` 也被写成空。第 17–19 步的结果没有重算，仍引用旧的实体结果。
- 失败场景二：第 20 步或第 21 步失败后，界面上的"重试"调用 `wizard-redetect`（`NovelImportWizard.tsx:154`）。`LINE_STEPS` 中没有 `foreshadow` 和 `verify`，于是走到 `rosterKind()` 并抛出"当前步骤不能编辑清单"，会话停在失败状态。
- 修复：retryKind 要么保留后续步骤的结果（只重跑本类和第 21 步），要么同时清除第 17–20 步的 artifacts 与 coverage。`applyForeshadowPlan` 在没有 stash 时不要删除已有伏笔。`wizard-redetect` 支持 `foreshadow` 与 `verify` 两步。

**F11 未选候选的资料原文仍会发给模型**
- 位置：`desktop/main/novel-import.ts:540`（实体请求加入 `source` artifact 的全部 `sourceUnitIds`）、`:1259`（review 发送 `selectedImportUnits(s).filter(kind!=='body')` 全部资料单元）、`desktop/core/novel-import-wizard-checks.ts:16`（"所选范围一致"检查把全部资料单元当作合法范围）。
- 失败场景：`资料.md` 的"# 场景"段下有"北城""南巷"两块，作者取消了"南巷"。场景只有一个 source artifact（整个段落），导入"北城"时，请求包含整段资料单元，"南巷"的原文随之发送；第 21 步复核会发送全部资料单元。02 规定"未选中的……不进入后续任何环节"，NIW-C12 也只检查了正文章节。检查项 `scope` 发现不了这种情况。
- 修复：实体请求只附该候选所属块对应的单元（按 `splitWizardSourceBlocks` 的偏移切出单元，或在请求中只放块文本）；review 的资料单元限定为已导入 artifact 的 `sourceUnitIds`；`scope` 检查使用同一集合。补一个 C12 的资料版用例。

**F12 第 5 步暂停或重启后无法恢复**
- 位置：`desktop/main/novel-import.ts:564`、`:299-314`。
- 失败场景：第 5 步模型识别卷章时暂停，或应用关闭。`initialize` 撤销 `classificationGrant`/`structureGrant`；`resume` 进入 `wizardResume`，后者把 phase 设为 `recognizing` 后启动 `wizardRun`。`wizardRun` 没有处理 `detect-struct` 的分支，直接落到末尾，把它写成 `select`/`waiting`。此后 `wizard-next` 在 `detect-struct` 上抛出"当前步骤不能继续"，只能丢弃会话或返回修改。
- 修复：`wizardResume` 在 `detect-struct` 上要求重新允许识别，然后重新调用 `classify(s,'ai',true)`；或者回到第 4 步并显示"允许识别"。补用例。

**F13 恢复时界面自动代作者同意；图片授权撤销后无法重新允许**
- 位置：`src/components/desktop/NovelImportWizard.tsx:39`（`act('resume',{consent:true})`）；`desktop/main/novel-import.ts:180`、`:613-615`。
- 失败场景一：重启后在第 10 步点"继续导入"，按钮直接带 `consent:true`，主进程重新授予发送正文的权限。作者看不到 05 §3 与 NIW-C36 要求的"请重新允许"说明（发送范围、模型名）。
- 失败场景二：重启后 `imageGrants={}`。继续导入时，所有等待中的图片任务都报"图像模型配置已变化"（文案也不对）。第 10 步没有重新允许图片的入口，只能逐张跳过，或返回修改（会丢掉之后的全部结果）。NIW-C82 没有实现。
- 修复：`wizardResume` 不带 consent 时返回需要授权的状态，界面显示授权说明后再带 consent 提交；`resume` 接受 `imageConsent`，按当前图片选项重新写入 `imageGrants`；授权缺失时的错误文案改为"请重新允许生成图片"。

**F14 动作在校验通过之前修改会话，抛错后改动留在内存，下一次保存时落盘**
- 位置：`desktop/main/novel-import.ts:597-600`（`setImages` 先写 `w.images` 再检查容量）、`:641-642`（`confirmRoster` 先写 `imageGrants` 再检查识别是否失败）、`:255-257`（第 4 步先写 skipped 再抛"未选择正文"）、`:290-292`。
- 失败场景：勾选导致预估超过 200 MiB，`wizard-set-images` 报错，但 `w.images` 已经是 true。作者接着做任何一个会保存的动作（例如改角色类型），超限的选项就被保存下来，后续还会按它建立图片任务。NIW-C72 只断言了抛错。
- 修复：先校验，再修改；或者在 `act` 的 serial 回合中对 `s` 做快照，抛错时恢复。

**F15 runtime.json（N3）没有实现；并发时整份日志按请求次数保存**
- 位置：`desktop/main/novel-import.ts:907`（每次 `ai()` 开始都执行 `recordRuntime` 中的整份 `save()`）、`:896`（`syncRuntime` 只记录 `runtime.last`）；`desktop/core/novel-import-runtime-proof.ts` 没有 `imageOperations`；`initialize`/`discard` 的白名单没有 `runtime.json`。
- 失败场景：4 个实体并发时，每个请求开始都写一次可能达数百 MiB 的 `session.json`，05 §8.1 的合并保存因此失效，NIW-C48 的上限达不到。在途证明只保留最后一个调用，另外 3 个调用不在日志中；暂停证明的 `remaining` 不统计在途图片。
- 修复：按 05 §8.1 N3 实现会话目录下的 `runtime.json`（原子写，≤64 条、≤64 KiB），在 `remaining` 中加入可选的 `imageOperations`，并把它加入 `initialize`/`discard` 白名单。补 U43、U44、C48–C52。

**F16 关闭应用时不中止图片生成**
- 位置：`desktop/main/novel-import.ts:1327`（`pauseAll` 直接调用 `stopAction`）；只有 `act` 中的 pause/cancel/revise（`:196-197`）会中止 `imageOperations`。
- 失败场景：图片生成中关闭窗口，`close()` 要等每张图片自然结束（可能是数十秒到超时）。生成的结果因 epoch 变化被丢弃，暂停证明此时也已写入。05 §11.1 要求 close 先中止图片。
- 修复：把中止 `imageOperations` 移到 `stopAction` 开头，让所有暂停路径共用。

**F17 旧流程入口没有按 05 §8.7 分派到向导**
- 位置：`desktop/main/novel-import.ts:998`（`start()` 没有向导分支）。
- 失败场景：向导会话收到 `start`（目前的界面走不到，但 IPC 接受这个动作）。`analysisCheckpoint` 在向导中从未写入，所以 `preserve=false`，代码执行 `s.artifacts=sourceImportArtifacts(s)`，把已导入的实体换成全部资料条目（含未选候选），然后进入 `workflow`，再进入 `runVerify`。"未选候选不进入作品"的保证依赖界面不发这个动作。
- 修复：`start()` 在 `wizardVersion===1` 时拒绝，或分派到对应的向导动作。`resolveConflict` 的 rewrite 分支也应拒绝或改走向导路径（与 F2 一起修复）。

### 建议

**F18 实体结果只核对 id，没有核对类型与归属**
- 位置：`desktop/main/novel-import.ts:547-550`。世界子项候选的结果可以带 `entityType:'WORLD'` 或其他 `worldId`；场景结果的 `parentId` 也可以指向任意 id。这类错误要到第 21 步的 `worlds` 检查才会暴露，而且无法重试单项。
- 修复：单项校验时要求 `entityType/worldId/settingType` 与候选一致，`parentId` 和 `relationships[].characterId` 只能是已选候选 id（05 §8.3）。

**F19 字段结构不合法时不重试（05 §8.5、NIW-C41）**
- 位置：`desktop/main/novel-import.ts:550`。`validateImportSemanticArtifact` 失败后直接让任务失败，没有"附结构提示重试一次"。

**F20 未使用与重复的代码**
- `wizardLineProgress`（`novel-import.ts:514`）从未调用，视图中也没有第 17–20 步的"已完成章数 / 总章数"（NIW-C11）。
- `wizardSourceCopy` 的参数 `list` 未使用（`:44` 中的 `void list`）。
- 图片标签映射同时写在 `novel-import.ts:217` 和 `src/lib/desktop/novel-import-wizard.ts:5`，应共用 shared 常量。
- 05 §8.1 规划的 `novel-import-wizard-scheduler.ts` 没有建立，调度器内联在 1300 多行的控制器中。可以接受，但应在 05 中说明。

**F21 `revise{to:'work'}` 会撤销图片授权并递增 epoch**
- 位置：`novel-import.ts:571-572`。NIW-C66 要求只改名称或目录。从导入步骤进入时，`stopAction` 会把任务置为 paused；返回后 phase 为 `select`，但界面只在 `paused` 时显示"继续导入"，作者需要先点"暂停"再点"继续"。

**F22 发布写入未按 R15 批量处理；arcStages 的 label 格式与 S07 不一致**
- 位置：`desktop/service/novel-import-publish.ts:179-186`。`ForeshadowTouch`、`ForeshadowReference`、图片记录都逐条 `create`，NIW-S16 的 1000 触点基准有风险。`startChapter.label` 只取章节标题，没有"第一卷 · 第 n 章 标题"格式。

**F23 导入记录保存了资料原文的全部条目**
- 位置：`desktop/service/novel-import-publish.ts:37`。`materials` 中的 `original-*` 包括作者未选候选所在的资料原文。这属于导入记录而不是作品实体，但应在 02 中明确它不违反"不进入后续环节"，或者只保存块名。

**F24 `images/` 中出现异常链接时，整个会话静默消失**
- 位置：`desktop/main/novel-import-images.ts:46`。抛错后被 `initialize` 逐会话的 catch 吞掉，界面上找不到这个草稿，也没有提示。建议在视图中显示"草稿无法恢复"。

---

## 设计未实现项汇总（05）

| 设计条目 | 状态 |
| --- | --- |
| §7.3 只有资料、无正文的向导路径（P10） | 未实现，见 F1 |
| §6.1 C1 向导的 apply-patches | 未实现，见 F2 |
| §4 运行中的 `wizard-task` 白名单 | 未实现，见 F6 |
| §8.1 合并核验：失败为全局错误 | 实现有误，见 F4 |
| §8.1 N3 `runtime.json`、暂停证明中的 `imageOperations` | 未实现，见 F15 |
| §8.5 结构提示重试 | 未实现，见 F19 |
| §8.7 `start` 分派 | 未实现，见 F17 |
| §3 恢复时重新允许（文本与图片） | 部分实现，见 F13 |
| §11.1 close 先中止图片 | 未实现，见 F16 |
| §10.1 `ai()` 对 analyze/review 校验 `grant.hash===importScopeHash` | 未实现（只校验了 structure） |
| §10.1 提交前校验 `selectionHash` | 未实现（目前清单在导入步骤中不能修改，暂无实际影响） |
| §12 R15 createMany | 未实现，见 F22 |
| 17–20 步章数进度（C11） | 未实现，见 F20 |

## 07 中没有对应测试的用例

用测试名中的编号比对（含 `C30/C31` 这类合并编号）。以下用例在 `tests/` 中找不到对应测试：

- **U（6 条）**：U08、U17、U23、U31、U43、U44
- **C（40 条）**：C02、C04、C06、C07、C08、C09、C16、C19、C20、C25、C32、C36、C37、C41、C42、C44、C45、C46、C47、C48、C49、C50、C51、C52、C53、C54、C56、C57、C58、C59、C71、C72、C74、C78、C79、C82、C83、C84、C85、C86
  - 其中隐私（C86）、旧会话兼容（C84、C85）、核验与运行时证明（C45–C52）、恢复（C36、C37、C82）直接对应本次审核的关注点，应优先补齐。
- **S（10 条）**：S01、S02、S03、S04、S05、S10、S11、S12、S13、S16（`tests/unit/novel-import-wizard-publish.test.ts` 不存在，S06–S09、S15 在 integration 文件中合并为一条）。图片发布（S10–S13）完全没有测试。
- **B（2 条）**：B09、B11
- **R（11 条）**：R01–R11 全部未执行；`scripts/verify-novel-import-wizard-lotm.mjs` 不存在。

部分已有测试的断言少于 07 的要求：
- C12 只检查正文，没有检查资料（见 F11）。
- C31 没有覆盖"运行中"（见 F6）。
- C72 没有检查状态未改变（见 F14）。
- C62 没有检查 retry 之后的后续步骤（见 F10）。

按 `AGENTS.md`，这些用例在台账中不得标为通过。
