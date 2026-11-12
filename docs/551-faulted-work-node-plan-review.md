# 551 异常作品统一导航节点 技术方案 · 独立审核

审核对象：`docs/551-faulted-work-node-plan.md`（对照 `docs/550`、`docs/548`/`549` 及其审核、`design/faulted-work-node/index.html`）。审核时未修改任何源文件。

## 发现

1. **OK：没有调用方按文案匹配这几处错误。** 全仓搜索"作品已在其他进程""作品目录发生变化""作品目录身份不匹配""作品数据库缺失"，只有抛出点（`desktop/service/workspaces.ts:56,57,183,232,284,367,369`），以及 WL-04 用例里的模拟原始错误（`tests/integration/works-loading.test.ts:93`）。WL-04 模拟的是普通 `Error`，按方案仍归为 `unavailable`，用例不受影响。`missingDeletionSource` 只认 ENOENT/ENOTDIR 和"作品不在本地目录索引中"（`conversation-transfer.ts:30-33`），方案对这两类都不包装，判断正确。主进程与 worker 之间的 RPC 只传 `error.message`（`desktop/service/rpc.ts:18`），所以 `open-work`/`create-work` 的显示不变。`lockDirectory` 内层 `catch(cause)` 只放过 ESRCH（`workspaces.ts:58`），`ContentError('WORK_IN_USE')` 会照常重新抛出。

2. **should-fix：改成 `ContentError` 会改变 `instanceof ContentError` 分支的行为，"界面现有显示不变"的说法不完整。** 这些错误除了出现在 `GET /api/novels`，还会经 `transfers.owned → host.withWorkspace → works.runWithGlobal`（`conversation-runtime.ts:19`）进入处理器和 AI 工具：
   - `chat/conversations/[id]/route.ts:79,110` 以前把这类错误重新抛出，渲染端 fetch 会直接拒绝。改动后变成 JSON `{error,code}` 加 `status`，`ContentError` 默认 status 是 409（`src/lib/content-errors.ts:3`）。
   - `toErrorResponse` 的 status 从 500 变成 409（`src/lib/ai/errors.ts:42`）。
   - 工具结果和对话流里，原来的通用文案会换成具体文案（`story-workflow-tools.ts:23`、`error-classification.ts:334`、`desktop/handlers/chat/route.ts:319`）。
   - `create()` 的导入或建书路径也会调用 `validateDatabase`（`workspaces.ts:304-306`），报错同样会到达上面这些分支。
   
   这些变化大多是改进，但方案需要列出受影响的位置，并给每个新 code 指定 status，不能用默认的 409 一概处理。还要加一条用例：对话所在作品被占用时，`DELETE /api/chat/conversations/{id}` 返回结构化的 409。

3. **should-fix：`missing` 的判定范围过宽。** 方案把任意 ENOENT/ENOTDIR 都归为"目录缺失"。但 ENOENT 还可能来自目录仍然存在的情况，例如 `lockDirectory` 读取 `owner.json`（`workspaces.ts:55`）：进程在 `mkdir` 之后、写入 `owner.json` 之前崩溃，就会留下一个空的锁目录。工作区清单、存储状态文件缺失也会产生 ENOENT（`workspaces.ts:288,368`）。这时界面会提示"目录被移动或删除"，误导用户。修改要求：只把 `identity(row.path)`（`workspaces.ts:366`）这一处的 ENOENT/ENOTDIR 判为 `missing`。做法是在原错误对象上加一个不占用 `code` 的标记（例如 `Object.assign(error,{workFault:'missing'})` 或 Symbol），保留 `code==='ENOENT'`，让 `missingDeletionSource` 继续生效。其余 ENOENT 归为 `unavailable`。集成用例要覆盖"锁目录存在但 `owner.json` 缺失"这种情况。

4. **should-fix：`forgotten` 设置得太晚，第 3 步到第 6 步之间留有竞态窗口。** `run()` 在同一个同步段内完成取槽和 `active++`（`workspaces.ts:332-376`）。方案先检查 `active`，然后等待 `disconnect` 和会话清理，到第 6 步才 `forgotten.add`。在这段时间里：
   - 并发的 `GET /api/novels`、`chat/conversations`（`dispatcher.ts:87,99`）可以重新建立槽，并持有本进程的目录锁。
   - 对健康作品（列表与删除之间恢复了的情况），`current()` 可能通过 `ledger.register` 为这个工作区登记新的会话位置（`conversation-transfer.ts:47`），而 `forgetWorkspace` 已经枚举过，漏掉这条。作品移出索引后，`GET /api/chat/conversations` 会因为这条未删除的位置整体报错（`dispatcher.ts:104`），列表里也没有入口能再清理它。
   
   修改要求：第 3 步检查 `active===0` 后，在同一个同步段内立即 `forgotten.add(id)`，之后再退役、清理会话、提交索引；任何一步失败都执行 `forgotten.delete(id)`。这样第 7 步的大部分情况不会再出现。

5. **should-fix：`retainTask` 会让被移除作品的槽和锁留在内存里。** 后台任务可以在 `run()` 返回之后继续借用连接（`workspaces.ts:381-387`）。释放回调只做 `active--`，不会触发退役。方案的第 7 步只在 `run()` 的 `finally` 里检查 `active===0`，任务稍后释放时就没有地方执行退役。结果仍是 548-review 第 2 条的问题：重新打开目录时进入 `open()` 的非连接槽分支（`workspaces.ts:269-271`），`lockDirectory` 看到本进程 pid 仍然存活，报"作品已在其他进程打开"，只能重启恢复。修改要求：`retainTask` 在 `forgotten.has(id)` 时直接拒绝；释放回调在 `forgotten && active===0 && slots.get(id)===slot` 时执行退役。补一条用例：持有任务时移除作品，任务释放后可以重新 `open`。

6. **should-fix：第 4 步退役空闲槽时没有登记到 `retiring`。** LRU 淘汰会先写 `this.retiring.set(...)` 再等待 `disconnect`（`workspaces.ts:396-397`），`run()` 和 `open()` 都会先等 `retiring`（`workspaces.ts:269,334`）。方案第 4 步和第 7 步直接调用 `disconnect`。如果同时有 `open()` 或残留的 `run()`，它们可能在锁释放之前调用 `connect`，得到"作品已在其他进程打开"。修改要求：第 4 步和第 7 步统一沿用 LRU 的写法，先 `retiring.set`，失败记入 `failedRetirements`，最后 `retiring.delete`。

7. **should-fix：`disconnect` 失败时返回 `WORK_BUSY`，违反"任何作品都能删除"。** 如果锁目录里有未知文件，`release` 会一直抛出"作品目录锁包含未知文件"（`workspaces.ts:69,73`），第 4 步每次都失败，作品永远删不掉，而 409 `WORK_BUSY` 这个文案也与实际原因不符。修改建议：退役失败时保留 `failedRetirements`，`close()` 本来就会清理它（`workspaces.ts:434`），删除流程照常继续，清理会话并提交索引，返回 200。重新打开时被拒，由 `open()` 现有的报错覆盖，或者 `open()` 在 `failedRetirements.has(id)` 时先重试一次 `disconnect`。另一种做法是保留拒绝，但必须用独立的 code 和准确的文案，并在方案中说明这是对用户约束的例外。

8. **OK：会话账本的清理顺序和幂等性成立。** `ledger.remove` 不带回调时，deletion 的 phase 记为 `committed`（`conversation-ledger.ts:95-101`）。重启后 `recover()` 调用 `remove`，经 `withWorkspace`/`run` 抛出普通 `Error('作品不在本地目录索引中')`（`workspaces.ts:365`），满足 `missingDeletionSource`，结果记为 pending，不会让启动失败（`conversation-transfer.ts:139-143`）。同一进程内，`forgotten` 拦截使用完全相同的文案，同样能被识别。`gate.transfer` 在忙时抛出 `CONVERSATION_TRANSFER_BUSY`（`conversation-phase.ts:33`），可以重试。"退役 → 会话 → 索引"的顺序正确。

9. **nit：会话已清理而索引写入失败时，对话框文案需要说明。** 这时作品仍在列表里，但关联对话已经被标为删除。如果用户不再重试，而目录恢复了，下次启动 `recover()` 会在作品库中真正删掉这些对话。失败提示应包含"关联对话可能已删除，请重试完成移除"。方案"已知后果"一节还漏了 548-review 第 8 条：`historicalWorkspaceId` 指向已删除作品时，GET 会报错（`dispatcher.ts:48`）。

10. **OK：路由可以到达，处理器的写法安全。** 主进程把这个路径原样转发给 `start`（`desktop/main/index.ts:803-806`）。`workspaceFor` 对未匹配路由返回 `inbox`（`dispatcher.ts:31`）。worker 在 `runWithGlobal('inbox')` 内执行（`service/index.ts:89`），账本的嵌套 `run('inbox')` 复用同一个槽。`LocalDispatcher` 在 `configureConversationTransfers` 之后才构造（`service/index.ts:58-60`），所以 `this.transfers` 有值。"处理器抛错会让 fetch 直接拒绝"的判断正确（`service/index.ts:96`）。补充两点：只接受 `DELETE`；路径必须正好是 `/api/works/{uuid}`，多余的段返回 404。`close()` 期间 `run('inbox')` 会抛出"正在关闭"（`workspaces.ts:330`），按"会话 → 索引"的顺序，这不会留下半完成状态。

11. **should-fix：修复锁的状态必须放在 `SidebarTree` 层。** 菜单内容关闭时会随 Portal 卸载。如果 `useWorkLeaseRepair` 在 `FaultedWorkMenuItems` 内部调用，`busy`（`pending`/`restarting`）会随菜单关闭而丢失；在作品视图和其他视图之间切换时也会各自建立实例，破坏 SN-15 要求的"跨分类和折叠只发起一次修复"（`tests/browser/sidebar-navigation.test.ts:104-110`）。修改要求：hook 在 `SidebarTree` 中只实例化一次（`scope` 来自 `SidebarTree.tsx:1373`），把 `busy`/`start` 作为 props 传给各个菜单。另外，菜单关闭后，界面上还需要有一个持续可见的状态提示，例如悬停卡片或节点上的状态行，否则用户关闭菜单后看不到"修复交接待完成"。

12. **OK（需用例确认）：Base UI ContextMenu 与全局文本右键菜单可以共存。** 全局监听在捕获阶段执行（`text-context-menu.ts:87`）。导航行和分组按钮的 `user-select` 都是 none（`desktop.css:4,14-17`、`SidebarTree.tsx:269`），所以 `textContextSourceAt` 返回 null（`text-context-selection.ts:11`），不会调用 `preventDefault`。之后 Base UI 的 `onContextMenu` 打开菜单（`context-menu/trigger/ContextMenuTrigger.js:79-84`）。主进程没有注册 webContents 的 `context-menu` 默认菜单。`ContextMenu.Root` 内部就是 `Menu.Root`（`context-menu/root/ContextMenuRoot.js`），所以 `DropdownMenuItem`/`Separator` 可以直接复用。`MenuPositioner` 在 context-menu 下会使用光标锚点（`menu/positioner/MenuPositioner.js:81-82`）。用例要覆盖：在 `[data-text-preview]` 悬停卡片和 `NavigationLabel` 上右键时，不触发文本菜单。

13. **should-fix：单击整行打开受控菜单，需要写清细节。**
    - 受控 `NavigationMenu` 在 paused/epoch 变化时，必须通过 `onOpenChange(false)` 通知父组件，否则父组件状态仍为 open，暂停结束后菜单会自己弹出（`sidebar-navigation-state.tsx:25-27`）。
    - 行内只有一个 `…` 触发器时，Base UI 会把它当作隐式活动触发器来定位（`utils/popups/popupStoreUtils.js:373-379`）。这个触发器平时 `opacity-0`，菜单打开后靠 `data-popup-open` 显示，用例要验证菜单定位和这个样式。
    - 打开菜单的那次 click 不能被 `useDismiss` 当作外部点击立即关掉（`outsidePressEvent='sloppy'`，`floating-ui-react/hooks/useDismiss.js:45`）。用例要覆盖鼠标单击、Enter、Space 三种方式。
    - 行元素应加 `aria-haspopup="menu"`，并让 `aria-expanded` 跟随菜单状态（`SidebarTree.tsx:243-245`）。右键菜单打开时，要调用 `hover.hideNow` 收起悬停卡片。

14. **OK：正常作品的约束得到满足。** 方案把现有 JSX 抽成 `NovelMenuItems`，`…` 与右键共用这一份（`SidebarTree.tsx:1855-1883`），内容仍是重命名、删除，删除仍走 `DELETE /api/novels/[id]`（`SidebarTree.tsx:1459-1470`）。右键入口已经由用户在设计稿中批准（`design/faulted-work-node/index.html:230`）。`ContextMenu.Trigger` 外层包一个 div，不影响 `.sidebar-navigation .tree-row` 这类后代选择器（`desktop.css:145-151`）。

15. **nit：界面细节。**
    - 并发删除时，第二次请求会得到 404 `WORK_NOT_FOUND`。界面可以把它当作成功处理，关闭对话框并刷新列表。
    - 如果 `useChatStore` 当前的 `conversationId` 属于被删除的作品，应切换到新对话，否则后续请求会返回 404 `CONVERSATION_NOT_FOUND`（`dispatcher.ts:45`）。
    - `--warning` 已有定义（`globals.css:161,232`），可以直接使用。
    - `GET /api/novels` 的 LRU `finally` 可能把另一个作品的关闭错误归到当前作品（`workspaces.ts:393-397`）。这是现有问题，但会让 reason 判错，可以在风险一节里记一笔。

16. **OK：流程和台账。** 方案包含台账条目 `WN-01`，并且只追加、不覆盖未提交的条目。真实目标系统验收包含三类异常作品、目录字节不变检查和重启检查。测试用例与审核放在 552，符合 AGENTS.md 规定的顺序。

## 结论

**approve with changes**：错误分类只认结构化标识，这个方向正确；"退役 → 会话 → 索引"的顺序和账本的幂等性成立；路由可以到达；Base UI 方案可行。进入测试用例阶段前，需要先修正第 2、3、4、5、6、7、11、13 条。第 7 条直接关系到用户"任何作品都能删除"的约束，需要优先决定。
