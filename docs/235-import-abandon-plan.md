# 导入中断即删除草稿 技术方案（235）

日期：2026-10-30。基线提交 `3162a4f`。

## 需求

[导入作品] 流程在任何位置中断、停止、取消，直接删除未完成的导入草稿；下次点击 [导入作品] 开始全新导入，不出现历史导入。

用户已确认的口径：
- 收起窗口（收起按钮、Esc、点击外部、关闭按钮）也算中断，删除草稿；不再支持后台导入。
- 模型请求失败、保存目录失效等可重试失败仍停留在当前窗口供重试；用户随后停止/取消/收起，或退出应用，才删除。
- 已有导入时再次点击 [导入作品]：询问"将停止并删除当前导入"，确认后删除并打开文件选择，开始新导入。

## 现状（源码）

- `desktop/main/novel-import.ts` `NovelImportController`：草稿目录 `<root>/novel-imports/<id>/`，含 `.owner`、`session.json`，向导另有 `runtime.json`、`.runtime-*.tmp`、`images/`。
  - `initialize()` 恢复最近一个未完成草稿（`phase` 非 `completed`/`discarded`），把运行中阶段改为 `paused`。
  - `cancel` 动作与 `pause` 相同，走 `stopAction()`，只暂停并保留草稿。
  - `discard()` 只删除已知文件；遇未知文件/链接抛错并保留（"未知或损坏数据不删除"）。要求无在途任务（`act()` 中 `jobs.size` 检查）。
  - `close()`/`pauseAll()`：窗口关闭、渲染进程释放、服务断开时调用，暂停并保留草稿。
  - `choose()`：存在未完成草稿时不新建，直接返回当前草稿。
- `src/components/desktop/NovelImportDialog.tsx`：关闭/Esc 在运行阶段或向导中只收起；`cancel` 屏提供 继续导入/停止并保留草稿/丢弃导入草稿；任务栏按钮 `NovelImportTaskButton` 可重新打开收起的导入。
- `src/components/desktop/NovelImportWizard.tsx`：`RunningFooter` 提示"可以收起窗口，导入在后台继续"，含"收起"按钮。
- `src/lib/desktop/novel-import.ts`：`requestNovelImport()` 发送 `choose`，存在草稿时由主进程返回旧草稿。

## 方案

### 保存边界（不删除的唯一情形）

`session.publication` 已存在表示保存事务已经发出，作品目录与数据库记录可能已提交。此时删除草稿会丢失回执校验并留下无记录的作品，违反"正确性优先"。因此：
- `phase==='publishing'` 或 `publication` 已存在的草稿不自动删除，保持现有恢复/重试保存逻辑；界面只允许收起（隐藏）或重试保存。
- 其余全部阶段（source/recognizing/select/confirm/running/paused/conflicts/failed 且无 publication）适用删除。

### 主进程 `desktop/main/novel-import.ts`

1. 新增私有 `abandon(id)`，在 `act()` 的 `serial` 之外调用（与现有 pause/cancel 分支同层，避免 `serial` 自等待死锁）：
   - 置 `this.abandoning=true`；期间 `act()` 除 `current`/`cancel-pdf-preview` 外全部拒绝（`正在删除这次导入`），`current` 返回 `{view:null}`，防止重新加载后的渲染端取回旧草稿；
   - 中止图片请求、PDF 工作（`cancelPdfWork` + `drainPdfWork`）；
   - 调用 `stopAction({type:'pause'})` 排空在途 AI/工作流/运行时写入（`candidateBlocked` 时跳过此步，`stopAction` 本身也会早退）；
   - 在 `serial` 中复核：会话仍为同一 id、无 `publication`、非 `publishing`、`jobs`/`imageOperations`/`pdfRequests` 为空、`pdf.active` 为 0；有 publication 时抛 `保存已开始，不能删除这次导入，请重试保存`；
   - 调用删除（见第 6 条）。无论删除成功还是因未知文件失败，都解除内存会话（`session=null`、`changed(null)`）、清 `candidateBlocked=false`、按原规则 `pdf.reopen()`；失败时把错误（`导入草稿目录含未知文件，已保留：<id>`）抛给调用方，磁盘数据保留；
   - `finally` 清 `abandoning`。
2. `cancel` 动作改为 `abandon`（向导与旧流程相同），成功响应 `{view:null}`。`pause` 保持仅暂停（窗口仍打开，可继续）。
3. `close()`（窗口关闭/渲染进程释放与重新加载/服务断开/应用退出）：`pauseAll()` 后，若会话无 publication，调用 `abandon`；任何异常吞掉（不抛到关闭链路）。`releaseOwner`/`disconnected` 中 `void novelImport.close()` 不变，`abandoning` 门闩保证随后到达的 `current` 不会返回旧草稿。`pauseAll()` 语义不变（`stopTasks` 仍先用它排空，随后 `closeData` 调 `close()`）。
4. `initialize()`：对 `phase` 非 `completed`/`discarded` 且无 `publication`、归属有效的草稿，按第 6 条删除，不进入 `recovered`；删除失败则跳过、不加载、不报错。只含有效 `.owner`（`session.json` 已缺失，前次删除中断）的目录同样删除。仅含 publication 的草稿按现有逻辑恢复。归属无效/损坏的目录维持现状不删除。
5. `choose()`（非追加）：存在无 publication 的未完成草稿时抛 `已有未完成的导入，请先删除`，不在 `serial` 内删除；有 publication 时维持返回当前草稿。替换由渲染端先 `cancel` 再 `choose` 完成。`discard` 动作保留，改为同 `cancel` 走 `abandon`（协议兼容）。
6. 抽出 `removeDraftDirectory(id)`，供 `abandon()`、`initialize()` 共用：先完整校验（顶层只允许 `.owner`、`session.json`、`runtime.json`、`.runtime-*.tmp`、`.session-*.tmp`、`images/`；`images/` 内只允许已暂存图片名及其临时名；全部为普通文件、无链接、`nlink===1`），校验通过后才开始删除；顺序为 images → 运行时/临时文件 → `session.json` → `.owner` → `rmdir`。`.owner` 最后删除，删除中断时留下仅含 `.owner` 的目录，由第 4 条下次启动清理。

### 渲染端

`src/lib/desktop/novel-import.ts`
- 新增 `abandonNovelImport()`：`mutateNovelImport({type:'cancel'})`。成功后 `hideNovelImport()`；失败时，若主进程已解除会话（随后 `current` 返回 null，`adopt` 关闭对话框），用 toast 显示保留目录的错误；若因 publication 拒绝，对话框保持并显示错误。
- `requestNovelImport()`：若当前 `view` 存在、非 completed/discarded、无 publication，打开对话框并切到新屏 `replace`（询问），不立即选择文件；确认后 `abandonNovelImport()` 再 `chooseSources`。有 publication 时维持重新打开当前导入。
- `ImportScreen` 增加 `'replace'`，移除 `'cancel'`。

`src/components/desktop/NovelImportDialog.tsx`
- `close()`：completed 或有 publication → `hideNovelImport()`；其余 → `abandonNovelImport()`。
- "取消导入"按钮直接 `abandonNovelImport()`，删除 `cancel` 屏及"停止并保留草稿/丢弃导入草稿"。
- 运行/暂停/失败、冲突（"稍后处理"）、正文修改生成中的"收起"按钮：无 publication 时移除，改由"取消导入"承担；`retryPublication` 场景保留"收起"。
- 删除向导 `discardOpen` 二次对话框。
- 新 `replace` 屏：标题"开始新的导入"，正文"当前导入《标题》尚未完成。开始新的导入会停止并删除它，原始文件不会更改。"，按钮"返回当前导入"/"删除并重新选择"。
- `configureModels()` 不再 `hideNovelImport()`，仅派发设置事件；对话框由 `suspended`（设置打开）暂时隐藏，关闭设置后回到原导入，不算中断。向导内"配置模型"同改。
- `NovelImportTaskButton`：只在 completed 或有 publication 时显示（其余情况对话框关闭即已删除，不应存在）。

`src/components/desktop/NovelImportWizard.tsx`
- `RunningFooter`：去掉"可以收起窗口，导入在后台继续"与"收起"按钮；"停止导入"直接删除。
- 识别中、其它步骤的"收起"同样移除。

### 服务断开提示

`disconnected` 删除草稿后对话框会消失。`src/lib/desktop/novel-import.ts` 的 `adopt` 在收到 `view:null` 且对话框原本打开、并非本端发起删除时，toast 提示"导入已中断并删除，请重新导入作品"。这样服务断开、重新加载等非用户操作也有说明，不需改主进程事件协议。

## 影响面

- `docs/requirements-traceability.json` NI-07"持久草稿、暂停恢复、取消"改为"中断即删除、仅保存边界恢复"，测试编号随用例更新。
- 现有依赖跨重启恢复未保存草稿的单测（NI-S08、NI-S10、NI-S12、NI-S13、NI-LB05 等，以失败清单为准）需改写：恢复路径只对含 publication 的草稿成立；对未保存草稿改断言删除。
- 浏览器用例 `tests/browser/novel-import.test.ts`、`novel-import-wizard.test.ts` 中"停止并保留草稿/收起/稍后处理/丢弃导入草稿"断言改写。
- 真实数据：新版首次启动会删除数据根中已有的未完成草稿（本机 `~/.shakeink` 有 1 个 paused 草稿；LOTM 隔离根 `/private/tmp/shakeink-lotm-runtime-20261027/app-data` 有 1 个 paused 草稿，`scripts/continue-lotm-local-import.mjs` 的续跑流程将不再可用）。验证只用隔离临时根，不启动这两个根。

## 备选与取舍

| 方案 | 结论 |
| --- | --- |
| 仅渲染端在关闭时发 `discard` | 否：应用退出、崩溃、服务断开不经过渲染端，重启仍会恢复旧草稿 |
| 不持久化草稿（纯内存） | 否：改动面过大，且保存边界仍需持久回执 |
| 连 publication 草稿也删除 | 否：可能留下已提交但无记录的作品，违反正确性 |
| 为测试保留"重启恢复"开关 | 否：产品中不可达的路径，测试不再反映产品 |

## 验收

- 主进程：取消/停止（含运行中）、关闭、重启、再次选择来源均删除未保存草稿；publication 草稿保留；未知文件保留。
- 渲染端：关闭/Esc/取消/停止直接删除；替换询问；配置模型不删除。
- 全量 `npm test`、`npm run typecheck`、相关浏览器用例通过；隔离根真实 Electron 验证：导入中途关闭窗口再启动，点击导入作品为全新导入。

## 独立审核与处理（2026-10-30）

子代理只读审核结论：有条件通过。逐条处理：

| # | 审核发现 | 证据 | 处理 |
| --- | --- | --- | --- |
| 1 | `choose` 在 `serial` 内调 `abandon` 会自等待死锁 | `novel-import.ts:240`、`:172`、`:1488` | 已改：`choose` 只拒绝，替换由渲染端 `cancel`→`choose`；`abandon` 只在 `serial` 外调用（第 1、5 条） |
| 2 | `candidateBlocked` 置位后从不复位，删除后无法新建 | `:153`、`:195`、`:229` | 已改：`abandon` 结束时复位（第 1 条） |
| 3 | 未知文件使删除失败，对话框无法关闭 | `:1498`、`novel-import-images.ts:53` | 已改：失败也解除内存会话、保留磁盘、提示目录（第 1 条、渲染端） |
| 4 | 删除非原子，可能留下引用已删图片的 session 或孤立目录 | `:1498`、`:209` | 已改：先全量校验再删，`.owner` 最后删，启动清理仅含 `.owner` 的目录（第 4、6 条） |
| 5 | 复核不足，停止后到复核前可能有新任务进入 | `:1488`、`:1498` | 已改：`abandoning` 门闩 + 复核全部在途计数（第 1 条） |
| 6 | 重新加载时 `void close()` 与新 `current` 竞争 | `index.ts:926/944` | 已改：`abandoning` 期间 `current` 返回 null（第 1、3 条） |
| 7 | 服务断开静默删除 | `index.ts:349` | 已改：渲染端非本端删除时提示（"服务断开提示"） |

审核确认成立：保存边界例外正确充分（目录预留只在 publish 内 `works.create` 发生）；`suspended` 能在设置/来源选择/引导时保持导入；现状描述准确。
