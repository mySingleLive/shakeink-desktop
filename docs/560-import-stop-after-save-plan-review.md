# 560 技术方案独立审核

审核对象：`docs/560-import-stop-after-save-plan.md`。行号均为审核时的源码行号（`desktop/main/novel-import.ts` 简称 `ni.ts`）。

## 缺陷链

1. [确认无误] 保存失败的直接原因成立。`workspaces.ts:198-200` 读取目录后，只要目录非空且没有作品清单就抛「创建作品需要空目录」。这一步在 `reserve`（`:202`、`:209`）和写清单（`:211`）之前，所以从未写入文件，也没有预留记录。`chooseNovelTarget`（`desktop/main/index.ts:184-195`）选择目录时不检查是否为空，作者直到保存才看到错误。
2. [确认无误] 「继续导入不保存」成立。`wizardRun` 在 `step==='done'` 时落到 `ni.ts:697`，只写回 `select/waiting`，不调用 `publish`。唯一会启动 `publish` 的向导入口是 `wizardNext` 的 verify 分支（`ni.ts:625`）。`wizardResume`（`ni.ts:1720-1747`）在 `:1729` 先要求发送授权，再在 `:1746` 启动 `wizardRun`。
3. [确认无误] 「无法停止/删除」成立：`ni.ts:2720`、`:2737` 拒绝删除，渲染端 `src/lib/desktop/novel-import.ts:92` 同样排除了 publication。
4. [建议] 方案没有引用草稿里的 `error`/`stepError` 原文来证明失败就是「需要空目录」。请补上；inbox 中也没有核对预留记录，这一点目前只是根据代码顺序推断的。

## 必须修改

5. [必须修改] 方案第 5 节修改 `abandonableImport` 会破坏它现有的另一层含义。这个谓词现在同时表示「中断时自动删除」，以下位置都依赖它：
   - 任务栏按钮对可删除的导入直接隐藏（`NovelImportDialog.tsx:195`）。按方案修改后，收起的保存中草稿再也无法从任务栏打开。
   - `requestNovelImport` 会对可删除的导入进入 `replace` 页（`lib/desktop/novel-import.ts:108`）。这样一来，在保存中或已有预留的草稿上开始新导入，就会改走「删除并重新选择」。
   - 对话框 `close()` 的逻辑（`NovelImportDialog.tsx:222-226`）加上方案让 `needsNovelImportCloseConfirmation` 对 publication 返回 true，导致保存中按 Esc 或关闭只能二选一：「继续导入」或「确认关闭并删除」（`:265`），原来的「收起」消失了。
   - `ProgressScreen` 的页脚（`:117`）在 `abandonableImport` 为真时隐藏「收起」，保存中也就收不起来了。

   应拆成两个谓词：`autoDiscardImport` 保持原语义（关闭、替换、任务栏都用它）；新增 `deletableImport`（排除 `completed/discarded`），只用于显示「停止/删除导入」按钮。publication 草稿关闭时仍然收起，删除只能由作者显式点击，并经过专门的确认。
6. [必须修改] 清理失败时保留草稿，这与需求 2「任何条件下都能删除」冲突。方案在以下情况都会抛错并保留草稿：清单 requestId 不符（第 2 节 4）、目录锁属于存活进程（第 2 节 6）、`businessGate` 关闭（`business-gate.ts:9` 返回 `BUSINESS_CLOSED`），以及任何 I/O 错误。用户可能被永久阻塞。目录锁问题尤其突出：服务是同进程的 Worker（`index.ts:325`），锁里的 `pid` 就等于 `process.pid`，本进程遗留的锁在重启前永远判为「存活」；pid 被其他进程复用时也一样（`workspaces.ts:56-58`）。
   应增加兜底路径：无法安全清理时，保留目标目录和预留记录，只删除导入草稿，并在确认框和结果中写明「目录 X 中保留了未完成的文件」。清理失败只降级为兜底，不阻止删除。
7. [必须修改] 服务端新 RPC 没有纳入准入控制。`desktop/service/index.ts:119-123` 只对列出的方法检查 `closing` 和 `stoppingImports`，并重置 `closedForMaintenance`。`novel-import-discard` 不在列表中，所以它可能在 `stop-tasks`（`:152-168`）或 `close`（`:190`）进行时修改 inbox 和目标目录，而 `task-status`（`:151`）与 `close` 也不会等待它。需要：把它加入 `:119` 的列表；像 `importPublications`（`:132-134`）一样登记在途任务，让 `task-status`、`stop-tasks`、`close` 和 `novel-import-lease-target` 的检查（`:115-118`）都能看到它。
8. [必须修改] 清理顺序需要明确规定：先删 `database/`、`assets/`、存储指针、标记、临时文件，**清单最后删**，最后删预留记录。如果先删清单再中途失败，下次只能进入「无清单」分支，这时已经无法用 requestId 证明目录归属，只剩 inode 一项证据。另外，比对时应同时校验清单的 `requestHash === requestHash({title,importHash})`（`workspaces.ts:201`），不能只比 requestId。
9. [必须修改] 删除流程等待在途保存时，必须保留现有的多轮排空循环（`ni.ts:2726-2732`），不能改成一次 `Promise.allSettled(jobs)`。原因是 `abandoning` 生效之前已经排入 `serial` 的 `resume` 可能在第一次等待之后才启动 `publish`。循环里 publication 分支不要调用 `stopAction`：它在 `publishing` 时直接返回（`ni.ts:2697`）；在 `publish` 写入检查点之前调用，则会递增 epoch，`publish` 在 `this.current` 处中止。后一种情况本身没有坏处，但方案应写明预期。`discardPublication` 必须在 `ni.ts:2740` 的 `finally{this.session=null}` 之前执行，并且失败后不清空会话，否则「草稿保留可重试」的说法不成立。

## 建议

10. [建议] 不要修改 `wizardRun`（方案第 4 节第 2 点）。只有 verify 分支会准备 `keepForSave`、`projectOutlines`、`semanticState.stage='ready'` 和目录授权检查（`ni.ts:625`）。让 `wizardRun` 在 `done` 时直接 `publish`，会给其他到达 `done` 的路径（revise、redetect 之后）开一个绕过这些准备的保存入口。只在 `wizardResume` 中处理 `step==='done'` 就够了，而且这个分支必须放在 `:1729` 的授权分支**之前**。
11. [建议] `wizardResume` 重新保存前，应像旧流程 `start` 一样校验 `publication.hash===importPlanHash(s)`（`ni.ts:2285`）。`publish` 会用新哈希覆盖旧值（`ni.ts:2634`）；如果哈希已变，结果是服务端报 `REQUEST_CONFLICT`，而不是给出清楚的提示。启动前还应设置 `stepState.done='running'` 和 `phase='running'`，让 SaveStep 和 `stopAction` 看到一致的状态。
12. [建议] 第 2 节第 3 点「目录身份不符或已不存在 → 只删预留」：作者重命名或移动目录后，按原路径找不到，但半成品还在别处，删掉预留记录也就失去了对它的保护（`workspaces.ts:153`）。建议这时也在结果中提示有残留，而不是静默处理。
13. [建议] 清理时用 `readWorkBrand` 取得目录实际使用的品牌名（`CURRENT_NAMES`/`LEGACY_NAMES`，`shared/brand-names.ts`），不要硬编码文件名。清单里还应包括 `restores/` 候选目录和 `leaseTemporaryPrefix` 临时文件（`workspaces.ts:323-326` 的 `dataPath` 可能指向 `restores/`）。每次删除前重新执行 `canonicalDirectory` 校验根目录的 device/inode（`workspaces.ts:40-46`）。递归删除用 `rm` 时不跟随符号链接，但入口条目仍要先 `lstat`。
14. [建议] 方案中「最长 120 s」不准确。120 s 只是数据库事务的超时（`novel-import-publish.ts:175`）；`works.create` 中的 PGlite 启动、迁移、图片写入和登记都没有超时，RPC 本身也没有超时（`desktop/service/rpc.ts`）。等待期间 `act('current')` 返回 `{view:null}`（`ni.ts:547`），界面看起来像已删除。应显示「正在等待保存结束」并允许收起；同时确认 `close()` 等待 `abandonRun`（`ni.ts:2712`）不会拖住退出流程（`index.ts:444` 有超时）。
15. [建议] 清单 `phase==='ready'` 但未登记时，方案返回 `{kept:'directory'}` 并删除草稿，预留记录一直停在 pending。应在提示中告诉作者，可以用「打开作品」登记这个目录（`workspaces.ts:247` 的 `open` 支持 ready 状态的清单）。另一种情况也需告知作者：清单仍是 `creating` 但数据库已提交（`database-committed`），这时会删除一份完整的数据库。这符合用户决定，确认文案应写清楚。
16. [建议] `.DS_Store` 的豁免可以同时加在 `chooseTarget` 中提前检查目录是否为空。这样非空目录在选择时就被拒绝，而不是到第 22 步才失败。

## 确认无误

17. [确认无误] `close()` 保持暂停保留语义，与 `initialize` 恢复 publication 草稿的逻辑（`ni.ts:527-535`）一致。删除可以重复执行：清理完成但草稿删除失败时，重启后草稿被恢复，再次删除会得到 `kept:'none'`。
18. [确认无误] 服务端在 `works.serialize` 中执行清理，并检查 `importPublications`。`create` 也在 `serialize` 中运行（`workspaces.ts:169`），两者自然排序，不会与同一个 `create` 交错。
19. [确认无误] `candidateBlocked` 不会阻塞删除：`ni.ts:548` 放行 `cancel/discard`，排空循环在 `:2729` 已处理这种情况。`ni.ts:562` 对 publication 草稿放行 `choose-target/resume`，SaveStep 需要的操作可以使用。
