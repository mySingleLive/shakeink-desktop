# 551 · 异常作品统一导航节点 技术方案

依据：`docs/550-faulted-work-node-research.md`；设计稿 `design/faulted-work-node/index.html` v3，用户 2026-11-10 批准（方案 A 配色：错误红 / 警告黄；正常作品菜单内容不变、增加右键入口；异常作品单击整行打开菜单）。取代 `docs/548`、`docs/549` 的界面部分；服务端吸收 548-review、549-review 的意见。

## 1. 范围

| 改 | 不改 |
|---|---|
| 异常作品的分类、导航节点、菜单、悬停卡片、删除 | 正常作品菜单内容（重命名、删除）与 `DELETE /api/novels/[id]` |
| 正常作品节点（作品视图）增加右键入口，菜单与 `…` 相同 | 磁盘上的作品目录与文件（任何情况下都不读写、不删除） |
| `lockDirectory`、`Workspaces.run` 中几处错误改为带 code 的 `ContentError`（文案不变） | 锁修复交接流程（`desktop:work-lease`） |

## 2. 服务端

### 2.1 异常分类（`desktop/shared/work-list.ts`、新 `desktop/service/work-unavailability.ts`）

`UnavailableWork.reason` 扩展为 `'stale-lease' | 'in-use' | 'missing' | 'changed' | 'damaged' | 'unavailable'`。

`classifyUnavailableWork(error)` 只认可结构化标识，原始文案一律不参与（保持 WL-04 “任意原始错误不能获得修复资格”）：

| 条件 | reason |
|---|---|
| `ContentError` code `WORK_LEASE_STALE` | stale-lease |
| `ContentError` code `WORK_IN_USE` | in-use |
| errno `ENOENT` / `ENOTDIR`（目录或清单缺失） | missing |
| `ContentError` code `WORK_DIRECTORY_CHANGED` / `WORK_IDENTITY_MISMATCH` | changed |
| `ContentError` code `WORK_DATABASE_MISSING` | damaged |
| 其他（迁移失败、PGlite 打不开、关闭中、`failedRetirements` 等） | unavailable |

为此把下列抛错改为 `ContentError`，**message 保持原文**（RPC 与界面现有显示不变）：

- `lockDirectory`：“作品已在其他进程或设备打开”“作品已在其他进程打开” → `WORK_IN_USE`。内层 `try` 的 `catch(cause)` 判断 `cause.code !== 'ESRCH'` 仍会原样重抛。
- `Workspaces.run`：“作品目录发生变化，请重新关联” → `WORK_DIRECTORY_CHANGED`；“作品目录身份不匹配” → `WORK_IDENTITY_MISMATCH`。
- `validateDatabase`：“作品数据库缺失或路径无效，原作品已保留” → `WORK_DATABASE_MISSING`。

ENOENT 不包装（`missingDeletionSource` 依赖 `cause.code` 为 ENOENT/ENOTDIR，`conversation-transfer.ts:30-33`，包装会让启动恢复抛错）。

`src/lib/novel-list.ts`：未知 reason 归一为 `unavailable`；reason 缺失也归一。

### 2.2 移除异常作品：`DELETE /api/works/{workId}`

在 `LocalDispatcher.handle` 中、`matchRoute` 之前特判（与 `GET /api/novels` 同级）。主进程把该路径原样转发给 worker `start`；`workspaceFor` 对未注册路由返回 `inbox`；worker 在 `runWithGlobal('inbox')` 内执行，账本的嵌套 `run('inbox')` 复用同一连接槽。

处理器自己捕获全部错误并返回 JSON（处理器抛错会让渲染端 fetch 直接拒绝，界面拿不到安全文案）：

- `workId` 非 uuid → 400 `{error:'作品编号无效', code:'INVALID_WORK_ID'}`。
- `this.transfers` 未配置 → 503 `{code:'CONVERSATION_LEDGER_UNAVAILABLE'}`，不改索引（549-review blocker 2）。
- `ContentError` → `{error: message, code}` + 其 status。
- 其他 → 500 `{error:'暂时无法删除作品，原数据已保留，请重试。', code:'WORK_REMOVE_FAILED'}`，不含路径。
- 成功 → 200 `{ok:true, workId, novelId}`。

**不做健康探测，不以“作品可打开”为由拒绝**（用户约束“任何作品都能删除”；548-review 第 1 条的误判问题随之消失）。语义固定为“从作品列表移除并删除关联对话，目录文件不动”。正常节点仍走原删除路径。

### 2.3 `Workspaces.forget(id, beforeCommit)`（`desktop/service/workspaces.ts`）

新增 `private readonly forgotten = new Set<string>()`。在 `serialize` 内：

1. 读 catalog；无此 id → `ContentError('WORK_NOT_FOUND','作品不存在或已从列表中删除',404)`。
2. `await this.retiring.get(id)`。
3. 若 `slots.get(id)?.active > 0` → `ContentError('WORK_BUSY','作品仍有任务在运行，请稍后重试',409)`。
4. 若有空闲槽：从 `slots` 删除并 `disconnect`；失败则记入 `failedRetirements` 并抛 `WORK_BUSY`。若 `failedRetirements` 有该 id：再试一次 `disconnect`，成功则移除，失败抛 `WORK_BUSY`。
5. `await beforeCommit()`（会话清理，见 2.4）。
6. `forgotten.add(id)`；`catalog.update(before.revision, 去掉该行)`。失败（含 `RevisionConflict`）→ `forgotten.delete(id)` 后原样抛出。
7. 提交后若又出现该 id 的槽（第 3 步后、第 6 步前并发 `run()` 建立的）：空闲则立即退役；活动中则由 `run()` 的 `finally` 在 `active` 归零时退役（见下）。

`run(id)` 改动：
- 入口：`forgotten.has(id)` → `throw new Error('作品不在本地目录索引中')`（与目录缺失记录同文案，`missingDeletionSource` 已识别）。
- `finally`：`forgotten.has(id) && slot.active === 0 && this.slots.get(id) === slot` → 删除槽并按现有退役逻辑 `disconnect`。

`open()` 成功写入 catalog 后 `forgotten.delete(record.id)`，允许同一目录重新加入（548-review 第 2 条：不再残留本进程锁导致“作品已在其他进程打开”）。

### 2.4 `ConversationTransfers.forgetWorkspace(workspaceId)`（`desktop/service/conversation-transfer.ts`）

对 `ledger.locations()` 中 `!deleted && workspaceId === id` 的每个会话：`gate.transfer(conversationId, …)` 内重读位置，仍未删除且仍属该作品 → `ledger.remove(location)`（无 inbox 回调 → deletion phase `committed`）。幂等：再次调用时没有匹配位置。`CONVERSATION_TRANSFER_BUSY` 原样抛出（409，用户重试）。已迁往其他作品或已删除的位置不动。

已知且接受的后果（写入对话框/文档，不另做处理）：
- 启动 `recover()` 对这些删除得到 `{phase:'pending', code:'CONVERSATION_DELETION_PENDING'}`，不抛错（548-review 第 4 条已验证路径）。
- 目录日后重新加入：重启前作品库里旧会话行仍在，但 `location.deleted` 使其不显示；重启后恢复流程把它们删掉。从未入账的旧会话会重新出现（548-review 第 5 条）。
- 未完成的转移日志由现有 `recover` 标为 unavailable / `SOURCE_UNAVAILABLE`。
- `protectedDirectories` 不再包含该目录。
- stale-lease 作品移除后，`closedWorkLeaseTarget` 返回 `WORK_LEASE_NOT_REGISTERED`，再次打开目录会被锁拒绝；对话框提示先修复（548-review 第 3 条）。

顺序为“退役 → 会话 → 索引”：索引写入失败时作品仍在列表，会话步骤幂等可重试；反过来会留下打不开又无入口清理的会话故障。

## 3. 界面

### 3.1 组件与文件

| 文件 | 内容 |
|---|---|
| `src/components/desktop/FaultedWorkIcon.tsx`（新） | 合成图标：lucide FolderClosed/FolderOpen 路径（ISC，已在第三方声明内）+ mask 挖空 r=7.2 + r=5.6 实心徽标 + 反色感叹号；`tone: 'error'|'warning'`，徽标色 `--destructive` / `--warning`，文件夹色 `--icon-work`；`data-fault-icon={tone}` |
| `src/components/desktop/UnavailableWorks.tsx`（重写） | 导出 `faultInfo(reason)`（level/title/text/hint 文案）、`useWorkLeaseRepair(scope)`（原修复逻辑，单飞、scope 变化复位、cancelled/pending/restarting）、`FaultedWorkMenuItems`、`FaultedWorkHoverCard`。不再渲染卡片和全局按钮 |
| `src/components/ui/context-menu.tsx`（新） | Base UI `ContextMenu` 的 Root/Trigger/Content 包装；Content 与 `DropdownMenuContent` 同样式，菜单项直接复用 `DropdownMenuItem` / `DropdownMenuSeparator`（同为 `Menu.Item`） |
| `src/components/layout/sidebar-navigation-state.tsx` | `NavigationMenu` 支持受控 `open`（未传时行为不变）；新增 `NavigationContextMenu`（paused/epoch 时关闭，同 `NavigationMenu`） |
| `src/components/layout/SidebarHoverCard.tsx` | `HoverCardData.tone?: 'error'|'warning'`，图标圆底改用对应色 |
| `src/components/layout/SidebarTree.tsx` | 见 3.2–3.4 |
| `src/app/desktop.css` | `--fault-error-text`（宣纸 `#a3463c` / 玄墨 `#e08a80`）、`--fault-warning-text`（`#7e621c` / `#d9b45f`）；`.tree-row[data-fault] .nav-label`、`.nav-group-toggle[data-fault] .nav-label` 取对应色 |
| `src/lib/novel-list.ts` | reason 归一 |

### 3.2 作品视图

- 异常作品渲染为 `TreeNode`（depth 0，`expandable` false，`avatar={<FaultedWorkIcon/>}`，`fault` 新 prop → `data-fault`），位置与现在相同（正常作品之前）。
- `action` = `NavigationMenu`（受控）+ `…` 触发器（`aria-label="作品操作"`）+ `FaultedWorkMenuItems`。
- 单击 / Enter / Space 整行：打开该菜单（`onClick` 设为 open）。
- 右键：`NavigationContextMenu` 包住该行，内容同为 `FaultedWorkMenuItems`。
- 悬停卡片：`FaultedWorkHoverCard`（标题、异常类别、原因、建议；无路径）。
- 正常作品：现有 `TreeNode` 外包 `NavigationContextMenu`，内容为从现有 JSX 抽出的 `NovelMenuItems`（重命名、删除，与 `…` 完全相同，无分隔线）。

### 3.3 其他视图（设定/角色/正文/对话）

`NavigationWorkGroup` 增加 `fault?: 'error'|'warning'` 与 `contextMenu?: ReactNode`：标题图标换为 `FaultedWorkIcon`（展开态用 open 变体），`data-fault` 着色标题；`action` 为同一 `…` 菜单；右键同一菜单；组内一行 `text-xs text-muted-foreground`：“{类别}，{建议}”。正常作品在这些视图不加右键（其 `…` 菜单本来只在作品视图）。

### 3.4 菜单与对话框

`FaultedWorkMenuItems`（顶部 `DropdownMenuGroup` + `DropdownMenuLabel` 显示异常类别）：

| reason | 项 |
|---|---|
| stale-lease 且有 `window.desktop.repairWorkLease` | 修复作品锁（busy 时显示“正在准备修复…/修复交接待完成/正在重新启动…”） |
| 全部 | 重新加载作品（`refetch()`，进行中显示“正在重新加载…”） |
| 全部 | 分隔线 + 删除（destructive） |

互斥：修复 busy（任意非 null）或删除进行中 → 全部项禁用；重新加载进行中 → 修复与删除禁用。

删除对话框（React `Dialog`，`DialogState` 新增 `{type:'remove-faulted', work}`）：
- 标题“删除作品”；正文“确定要从作品列表中删除《{title}》吗？与该作品关联的对话将一并删除。”“作品目录中的文件不会被改动。”非 stale-lease 追加“目录恢复后，可通过“打开作品目录”重新加入。”；stale-lease 显示警告块（建议先修复；删除后需手动移除锁文件夹才能重新加入）。
- 进行中：按钮禁用，“正在删除…”，对话框不可关闭。
- 失败：对话框内 `role="alert"` 显示服务端 `error`；非 JSON / 网络失败显示“暂时无法删除作品，原数据已保留，请重试。”；可再次确认。
- 成功：toast“作品已从列表中删除”；`closeAllTabsOfNovel(work.novelId)`；invalidate `['novels']`、`['chat-conversations']`；关闭对话框。

修复失败改为 `toast.error('暂时无法开始锁修复，原文件已保留，请重试。')`（原卡片内 alert 随卡片移除）。

列表整体失败（`isError`）的全局错误块与其“重新加载作品”按钮保持不变。

## 4. 测试计划（细化见 552）

- 集成 `tests/integration/works-loading.test.ts`（真实 PGlite、隔离临时目录、按生产顺序 `configureConversationTransfers` 后再 new dispatcher）：六类分类；每类删除成功；目录字节不变；会话清理与 GET 会话恢复；重启 pending；revision 冲突后重试幂等；未配置账本拒绝；404/400；并发删除；空闲槽退役后可重新 `open`；活动槽 409；错误不含路径。
- 浏览器 `tests/browser/works-loading.test.ts`（真实 `SidebarTree`，fetch 夹具，台账记“界面·夹具”）：节点形态、图标/文字色、单击/右键/`…` 同一菜单、各 reason 菜单项、修复单飞、重新加载、删除对话框全流程、互斥、其他视图、正常作品右键菜单与 `…` 一致、文本右键菜单不被触发。
- 回归：`tests/browser/sidebar-navigation.test.ts` 中依赖旧卡片按钮的用例改为经菜单操作；`npm run typecheck`、`npm test` 全量。
- 真实目标系统：构建安装版，隔离数据根，制造“目录缺失 + 关联会话”“stale-lease”“数据库缺失”三个作品，在安装版界面中查看节点、菜单并删除；检查会话列表可打开、目录字节不变、重启后正常；截图留证。

## 5. 台账

`docs/requirements-traceability.json` 新增 `WN-01`（追加，不覆盖未提交条目）：source 550/551/552 及审核、implementation 上述文件、testIds、verificationKind 区分“集成·真实库”“界面·夹具”“真实目标系统”。

## 6. 风险

- 移除时作品其实已恢复：只是移出列表，文件仍在，可重新打开。对话框已说明。
- `WORK_IN_USE` 包含本进程自身仍持锁的情况（理论上由 2.3 第 7 步消除）。
- Base UI ContextMenu 与全局文本右键监听共存：导航行 `select-none`，`textContextSourceAt` 返回 null；用浏览器用例验证。

## 7. 修订（回应 `docs/551-faulted-work-node-plan-review.md`、`docs/552-faulted-work-node-cases-review.md`）

本节覆盖前文冲突处，实施以本节为准。

### 7.1 分类不再改错误类型（回应 551R-2、551R-3、552R-5）

不把任何现有抛错改成 `ContentError`，避免 `instanceof ContentError` 分支（会话路由、`toErrorResponse`、工具结果）行为变化。改为在**原错误对象**上附加不可枚举的 Symbol 标记 `WORK_FAULT`（`desktop/service/work-unavailability.ts` 导出 `markWorkFault(error, kind)`、`classifyUnavailableWork(error)`），message、`code`、类型均保持原样，`missingDeletionSource` 不受影响。

| 标记点（均在 `workspaces.ts`） | kind |
|---|---|
| `lockDirectory`：其他主机或存活进程持锁（:56、:57） | in-use |
| `run()`：`identity(row.path)` 抛 ENOENT/ENOTDIR（:366） | missing |
| `run()`：inode/realpath 不一致（:367）；`readWorkBrand` 抛 `BRAND_MARKER_MISSING/CONFLICT`（清单缺失或冲突）；清单 id/novelId/phase 不符（:369） | changed |
| `validateDatabase` 失败（:284） | damaged |

`ContentError('WORK_LEASE_STALE')` → stale-lease（原逻辑）。其余（含锁目录缺 `owner.json` 的 ENOENT、kill 返回 EPERM、迁移失败、关闭中）→ unavailable。`classifyUnavailableWork` 只认 Symbol 标记与 `ContentError` code，不读 message，不认鸭子类型 `.code`。

unavailable 的文案：类别“作品暂不可用”，原因“作品暂时无法读取，原数据已保留。”，建议“稍后重新加载；仍无法打开时可从作品列表中删除。”

### 7.2 `Workspaces.forget` 并发与退役（回应 551R-4/5/6/7、552R-4/8）

新增私有 `retire(id, slot)`：沿用 LRU 写法 `retiring.set → disconnect → 失败记 failedRetirements → retiring.delete`，不抛错，返回是否成功。

`forget(id, beforeCommit)` 在 `serialize` 内：
1. 读 catalog，无此 id → `WORK_NOT_FOUND` 404。`await this.retiring.get(id)`。
2. 同一同步段内：`slots.get(id)?.active > 0` → `WORK_BUSY` 409；否则立即 `forgotten.add(id)`。此后 `run(id)` 入口与 `retainTask` 均拒绝（“作品不在本地目录索引中”）。
3. 若有空闲槽：从 `slots` 删除并 `retire`。若在 `failedRetirements`：再 `disconnect` 一次，成功则移除。**退役失败不阻止删除**（用户约束“任何作品都能删除”）：残留连接留在 `failedRetirements`，由 `close()` 清理；`open()` 遇到 `failedRetirements.has(id)` 时先重试一次 `disconnect`，失败则抛原错误。
4. `await beforeCommit()`；`catalog.update`。第 3–4 步任何异常 → `forgotten.delete(id)` 后原样抛出。
5. 成功后 `forgotten` 保留至 `open()` 重新加入同一 id 时删除。

`run()`：入口 `forgotten.has(id)` 拒绝；`finally` 中 `forgotten.has(id) && slot.active===0 && slots.get(id)===slot` → 删除槽并 `retire`。`retainTask` 的释放回调同样检查并 `retire`（回应 551R-5）。

因为第 2 步已在同步段内设置 `forgotten`，第 2 步之后不会再有新的 `current()`/`ledger.register` 进入该作品，`forgetWorkspace` 不会漏掉新位置（551R-4）。

### 7.3 界面（回应 551R-11/13、nit）

- `useWorkLeaseRepair(scope)` 只在 `SidebarTree` 实例化一次，`busy`/`start` 以 props 传入菜单；修复 busy 时，异常节点行右侧显示状态标签（“修复中”/“待重启”），悬停卡片与其他视图的说明行显示忙碌文案，菜单关闭后仍可见。
- 受控 `NavigationMenu`：paused/epoch 变化时调用 `onOpenChange(false)`。打开动作在 click 事件之后排到下一帧（`requestAnimationFrame`），避免同一次点击被当作外部点击关闭；行加 `aria-haspopup="menu"`，`aria-expanded` 跟随菜单状态；右键打开时 `hover.hideNow`。
- 删除失败文案追加“关联对话可能已删除，请重试完成移除。”（仅当服务端返回 500/冲突时）。并发删除得到 404 `WORK_NOT_FOUND` 时按成功处理。
- 删除成功后，若 `useChatStore` 当前会话的 `draftNovelId === work.novelId`，调用 `requestNewConversation()`。
- 已知后果补充：`historicalWorkspaceId` 指向已移除作品的历史子任务 GET 会报错（548R-8），接受。
- 风险补充：`GET /api/novels` 中 LRU 淘汰另一作品失败的错误会被归到当前作品（现有问题，归为 unavailable）。

### 7.4 路由

只接受 `DELETE`；路径必须正好是 `/api/works/{segment}` 两段；segment 非小写 uuid（`z.uuid()`）→ 400；其他方法与多段路径落入原 404“本地命令不存在”。

### 7.5 台账

verificationKind 使用“单元”“集成·真实库”“集成·worker RPC”“界面·夹具”“真实目标系统（macOS）”；Windows 原生验收标为待验收。浏览器用例单独执行，不计入 `npm test`。
