# 560 · 保存开始后仍可停止/删除导入，并能完成保存 技术方案

需求（用户 2026-11-12，附截图）：

1. 第 22 步「完成」处于「已暂停」，无法完成导入、无法保存作品，也无法停止或删除，被阻塞。
2. 任何条件和进度下，都必须允许停止导入并删除这次导入。

用户决定（2026-11-12）：
- 作品已写入（作品列表已有这次导入的作品）时，删除导入只删导入草稿，保留作品。
- 保存未完成时，清理本次导入在目标目录写入的半成品文件。

## 现状（真实草稿 `~/.shakeink/novel-imports/8f6259da…/session.json` 只读核对）

- `publication={requestId,hash}`，`importPlanHash(s)` 与 `hash` 相等；`wizard.step='done'`，`stepState.done='waiting'`，`phase='select'`，`targetNeedsAuthorization=true`。
- 目标目录 `…/导入诡秘之主3` 只有 `.DS_Store`（11-11 17:44，早于导入开始 11-12 13:26）；作品目录清单（catalog.json）中没有该 requestId。

缺陷链：

1. **保存失败**：`Workspaces.create`（`desktop/service/workspaces.ts:198-200`）把含 `.DS_Store` 的目录当作非空，抛「创建作品需要空目录」。Finder 打开目录就会生成该文件，作者无从察觉。此异常发生在预留（reserve）之前，所以没有写入任何文件或预留记录。
2. **继续导入不保存**：`wizardResume`（`desktop/main/novel-import.ts:1720`）对 `step==='done'` 走通用分支：先按“继续导入”重新索取发送正文的授权，再 `launch(wizardRun)`；`wizardRun` 在 `done` 步骤只把状态写回 `select/waiting`（`:697`），从不调用 `publish`。重启后 `targetNeedsAuthorization=true`，向导第 22 步也没有重新授权目录的入口。
3. **无法停止/删除**：`abandonDraft`（`:2720`、`:2737`）只要有 `publication` 就抛「保存已开始，不能删除这次导入，请重试保存」；渲染端 `abandonableImport`（`src/lib/desktop/novel-import.ts:92`）同样排除 `publication`。
4. **界面误导**：第 22 步复用 `LineStep`，暂停时显示「继续导入即允许把所选章节正文发送给模型」，实际只需要保存，不发送任何内容。

## 方案

### 1. 删除导入在任何阶段都可执行（主进程 `abandonDraft`）

- 去掉两处 publication 拒绝。
- 保存请求在途（`publishing` 且 `jobs` 非空）：外部事务不能中途打断，先等待在途任务结束（`Promise.allSettled(jobs)`），期间 `abandoning=true` 阻止新操作。
- 结束后重新读取会话：
  - `phase==='completed'`（作品已写入）：只删导入草稿目录，不动作品。
  - 有 `publication` 但未完成：调用新选项 `discardPublication(session)` 清理半成品（见 2），成功后删除草稿目录。清理失败时抛出原因，草稿保留，作者可重试删除。
- 没有 `publication` 的路径保持原样。
- `close()`（退出应用/窗口失效）不变：有 publication 时仍暂停保留以便恢复，只有作者显式停止/删除才清理。

### 2. 服务端 `novel-import-discard`（新文件 `desktop/service/novel-import-discard.ts`，`Workspaces.discardImportCreation`）

输入：`{requestId,title,importHash,selection}`（`selection` 为草稿记录的 `target`，可为空）。在 `works.serialize` 中执行，`importPublications.has(id)` 时拒绝（主进程已等待，正常不会出现）。

1. catalog 中已有 `requestId` 相同的作品 → 返回 `{kept:'work'}`，不改任何文件。
2. 没有预留记录 → 返回 `{kept:'none'}`（从未写入目标目录，例如本次缺陷）。
3. 预留记录存在：用记录中的 `path/device/inode`（建书时原生授权并持久绑定的目录）定位，**不使用草稿传来的路径作为授权**。目录身份不符或已不存在 → 只删除预留记录。
4. 目录内作品清单 `requestId` 与本次不符 → 不动目录，抛出「目录已属于其他作品，已保留」。
5. 清单 `phase==='ready'`（数据库已提交，只差登记）→ 视同作品已写入：不动目录和预留，返回 `{kept:'directory'}`。
6. 清单 `phase==='creating'`（或无清单）→ 清理本次写入的已知条目：作品清单、`database/`、`assets/`、存储指针与保护标记、本机已退出进程留下的目录锁、`.<uuid>.tmp` 原子写临时文件。目录锁属于存活进程 → 抛「作品目录正在使用」。其他文件（含 `.DS_Store`）保留。每个条目删除前 `lstat` 校验非符号链接、位于该目录内。
7. 删除预留记录（仅 `phase==='pending'` 且字段一致）。

主进程 `desktop/main/index.ts` 把 `discardPublication` 接到 `businessGate.run(()=>service.call('novel-import-discard',…))`。

### 3. `.DS_Store` 不视为目录内容

`Workspaces.create` 的空目录判断忽略 `.DS_Store`（仅此一个名称），修复保存失败的直接原因。已有清单的分支不变。

### 4. 第 22 步「保存作品」可继续

- `wizardResume`：`w.step==='done'` 时不索取发送授权；`targetNeedsAuthorization` → 停在 `select`，`error='请重新选择并授权原保存目录，再继续保存'`；否则 `s.epoch++` 并 `launch(publish)`。
- `wizardRun` 走到 `done` 时直接 `publish`（原来只写回等待）。
- 新组件 `SaveStep`（`NovelImportWizard.tsx`）替代第 22 步的 `LineStep`：
  - 保存中：「正在将作品保存到所选目录」。
  - 暂停/失败/等待：显示目标目录、失败原因；按钮「选择目录」（`choose-target`，标“需重新授权”）、「继续保存」（`resume`，目录未就绪时禁用）、「停止导入」。
  - 第 22 步不显示 `ResumeConsent`（不发送内容）。

### 5. 渲染端允许删除

- `abandonableImport`：只排除 `completed/discarded`，publication 与 `publishing` 都可删除；`needsNovelImportCloseConfirmation` 对 publication 草稿返回 true（必须确认）。
- 确认文案：保存在途时说明「将等待当前保存结束后删除」。
- 旧版（非向导）`ConfirmScreen` 恢复保存时，「收起」旁加「删除导入」。

## 修订（依据 `560-…-plan-review.md`，2026-11-12）

以下条目替代上文对应内容。

- **R1 两个判断分开。** `abandonableImport` 保持原义，只用于中断时自动删除、任务栏、replace 页和「收起」。新增 `deletableImport(view)`：只要不是 `completed/discarded` 就为真，只控制「停止导入/删除导入」按钮。草稿有 publication 时，关闭对话框仍然只收起，删除必须由作者显式确认（确认框沿用 `needsNovelImportCloseConfirmation` 的样式，由按钮直接打开）。
- **R2 清理失败不阻止删除。** 第 2 节中第 4 步和第 6 步的“抛出”，以及服务调用的任何错误，都改为：保留目标目录和预留记录，仍然删除导入草稿，并把 `{kept:'directory',reason}` 返回给渲染端。渲染端用 toast 提示「导入已删除；目标目录 X 留有未完成的文件，原因：…」。目录锁的 pid 等于本进程时（服务是同进程的 Worker，`desktop/main/index.ts:325`），按「当前进程持有」处理：只有这把锁不属于任何活动连接（`works.slots` 中没有该目录）才删除，否则保留。
- **R3 准入与在途统计。** `novel-import-discard` 加入 `index.ts:120` 的准入列表（`closing`/`stoppingImports` 时拒绝，被拒同样走 R2 兜底），并像 `importPublications` 一样登记，计入 `task-status`、`stop-tasks` 和 `close` 的等待。
- **R4 清理顺序和归属。** 归属校验同时比对清单的 `requestId` 和 `requestHash`（`requestHash({title,importHash})`）。删除顺序：临时文件 → `assets/` → `database/` → 存储指针与保护标记 → 目录锁 → 作品清单 → 预留记录。中途失败时清单仍在，下次删除还能证明归属。品牌文件名由 `readWorkBrand` 的 `names` 决定，不写死 current。`restores/`、`preserved/` 只在发布中途不会产生，出现即按陌生文件保留。
- **R5 排空顺序。** 保留 `abandonDraft` 现有的 5 轮排空循环，并在循环中等待 `publishing` 的在途任务。清理放在最后的 `serial` 块内、`removeDraftDirectory` 之前，此时 `session` 仍在。R2 兜底保证这里不会因清理失败而停住。
- **R6 不改 `wizardRun`。** 只在 `wizardResume` 中、授权分支之前处理 `step==='done'`，并先校验 `publication.hash===importPlanHash(s)`，不一致时提示「保存计划已变化，请删除这次导入后重新导入」（删除始终可用）。
- **R7 等待说明。** 去掉「最长 120 s」。删除等待保存期间，确认按钮显示「正在等待保存结束…」，并保持可收起。
- **R8 提前检查空目录。** `chooseTarget` 选中目录后，若目录中有除 `.DS_Store` 外的内容且不是本次恢复的原目录，立即提示「请选择空目录」，不等到第 22 步。

## 不做

- 不改 `close()` 的恢复语义；不改非导入建书的空目录规则以外的行为。
- 不迁移或修改用户现有草稿；修复后作者可在界面直接继续保存或删除。

## 风险

- 清理半成品使用预留记录绑定的目录与清单 requestId 双重确认，只删已知条目；陌生文件一律保留。
- 等待在途保存：保存最长受 `initialize` 事务 120 s 超时限制；等待期间界面显示删除中。
