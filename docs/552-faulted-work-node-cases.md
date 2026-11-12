# 552 · 异常作品统一导航节点 测试用例（对应 551 方案）

编号 WN-xx。全部使用合成资料与隔离临时目录。

- **集成**：`tests/integration/works-loading.test.ts`（追加）。真实 `Workspaces` + 真实 PGlite；按生产顺序 `configureConversationTransfers(works, call)` → `new LocalDispatcher(works)`，`finally` 中 dispose 并 `close()`。台账记“集成·真实库”。
- **单元**：`tests/unit/work-unavailability.test.ts`（新）。台账记“单元”。
- **浏览器**：`tests/browser/works-loading.test.ts`（追加/改写）。真实 `SidebarTree` + `ContentTabs`，fetch 夹具。台账记“界面·夹具”。
- **真实目标系统**：安装版 + 隔离数据根，截图留证。

## A. 分类（单元 + 集成）

| 编号 | 类型 | 输入 | 期望 |
|---|---|---|---|
| WN-01 | 单元 | `ContentError('WORK_LEASE_STALE')`、`WORK_IN_USE`、errno ENOENT、ENOTDIR、`WORK_DIRECTORY_CHANGED`、`WORK_IDENTITY_MISMATCH`、`WORK_DATABASE_MISSING`、普通 `Error('作品已在其他进程打开')`、`Error('private-key WORK_LEASE_STALE')`、非 Error 值 | 依次为 stale-lease、in-use、missing、missing、changed、changed、damaged、unavailable、unavailable、unavailable |
| WN-02 | 单元 | `parseNovelList` 收到 reason 为 `'future-kind'`、缺失、`'in-use'` | 前两者归一为 `unavailable`，`in-use` 保留 |
| WN-03 | 集成 | 五个作品：健康；目录改名（missing）；遗留锁（stale-lease，pid 2147483647）；锁 owner 为本机存活 pid `process.pid` 之外的存活进程（in-use，用 `process.ppid`）；`database/PG_VERSION` 删除（damaged） | `GET /api/novels`：健康作品在 `novels`；其余四个在 `unavailableWorks`，reason 依次正确；响应正文不含任何临时目录路径 |
| WN-04 | 集成 | 作品清单 `id` 改写为其他 uuid（changed） | reason `changed` |
| WN-05 | 集成 | 包装为 ContentError 后的回归 | 锁仍拒绝打开；`WORK_LEASE_STALE` 的锁修复（`WorkLeaseRecovery`）原流程通过；`works.open` 对 in-use 目录的报错文案不变（“作品已在其他进程打开”） |

## B. 移除异常作品（集成）

| 编号 | 输入 | 期望 |
|---|---|---|
| WN-10 | missing 作品 `DELETE /api/works/{id}` | 200 `{ok:true,workId,novelId}`；catalog 不含该行、其他行字节级不变；`GET /api/novels` 中不再出现；改名后目录内所有文件（含清单与数据库）字节不变；原路径仍不存在 |
| WN-11 | stale-lease 作品删除 | 200；锁目录与 `owner.json` 字节不变；之后 `closedWorkLeaseTarget(works,id,()=>{})` 抛 `WORK_LEASE_NOT_REGISTERED` |
| WN-12 | in-use 作品删除 | 200；对方锁不变 |
| WN-13 | damaged、changed 作品删除 | 均 200 |
| WN-14 | **健康作品**直接调用该端点（作品已被 `run` 打开过、槽空闲） | 200；槽被退役（再 `works.run(id)` 抛“作品不在本地目录索引中”）；目录锁已释放（锁目录不存在）；目录文件不变 |
| WN-15 | WN-14 后用 `works.open(await directoryIdentity(path))` 重新加入 | 成功，作品回到 `novels`，可 `run` 读取（证明不残留本进程锁和 forgotten 标记）。注：服务层路径，不代表原生“打开作品目录”已验证 |
| WN-16 | 健康作品有活动 `run`（挂起 Promise 中）时删除 | 409 `WORK_BUSY`；catalog 不变；释放后重试 200 |
| WN-17 | 未注册 uuid | 404 `WORK_NOT_FOUND`；catalog 不变 |
| WN-18 | `abc`、空段 | 400 `INVALID_WORK_ID`，`{error,code}` 形状；`GET /api/works/{id}` 仍为原 404“本地命令不存在” |
| WN-19 | 同一 id 删除两次 | 第二次 404，不 500 |
| WN-20 | 两个 DELETE 并发 | 一个 200、一个 404 |
| WN-21 | 未配置会话账本（`new LocalDispatcher(works, undefined)`） | 503 `CONVERSATION_LEDGER_UNAVAILABLE`；catalog 不变 |
| WN-22 | `catalog.json` chmod 000 触发真实写失败 | 500 通用文案；正文不含路径；恢复权限后重试 200 |

## C. 会话账本（集成）

构造：作品健康时 `works.runWithGlobal(a.id)` 内建 conversation，`transfers.current(id)` 登记位置；另建一个未绑定（inbox）会话和一个已迁往作品 B 的会话；然后 `close()` 并把 A 目录改名。

| 编号 | 期望 |
|---|---|
| WN-30 | 删除前 `GET /api/chat/conversations` 失败（现状证据） |
| WN-31 | 删除 A 后会话列表 200，不含 A 的会话；inbox 与 B 的会话保留；B 会话位置 revision 不变 |
| WN-32 | `forgetWorkspace` 后外部改写 catalog 使 revision+1，再提交 → 请求失败；ledger 中 A 会话已 deleted；catalog 仍含 A；会话列表 200；重试 DELETE 200，且第二次 `forgetWorkspace` 不改任何位置 |
| WN-33 | 关闭后新建 `Workspaces` + `configureConversationTransfers` + `recoverConversationTransfers` | 不抛错；该删除结果 `{phase:'pending',code:'CONVERSATION_DELETION_PENDING'}`；deletion phase 仍 `committed`；会话列表 200 |
| WN-34 | 目录改回原名并 `works.open` 重新加入 | (a) 恢复前：列表不含 A 的已删会话，但作品库中该行仍在；(b) 重启并 `recover` 后 phase `complete`，库中该行已删除 |

## D. 界面（浏览器·夹具）

夹具扩展：`unavailableWorks` 可配置多条及 reason；`DELETE /api/works/*` 可返回 200 / 409 JSON / 500 非 JSON / 挂起；记录请求；`useTabsStore` 可预置 tab。

| 编号 | 输入 | 期望 |
|---|---|---|
| WN-40 | 一个健康作品 + 五类异常作品 | 作品视图中异常作品均为 `.tree-row`（role=button，高度与健康作品行相同），无“暂不可用的作品”卡片容器、无列表底部全局“重新加载作品”按钮、无 `rounded-md border` 卡片；无展开按钮 |
| WN-41 | 同上 | 图标 `[data-fault-icon=error]` 用于 missing/changed/damaged/unavailable，`warning` 用于 stale-lease/in-use；标题计算颜色分别等于 `--fault-error-text`/`--fault-warning-text`（宣纸与玄墨两主题各测一次）；健康作品标题颜色不变 |
| WN-42 | 单击异常作品行、Enter、`…`、右键 | 四种方式都打开同一菜单（role=menu），项相同；不打开作品 tab |
| WN-43 | 各 reason 的菜单项 | stale-lease（有桥）：修复作品锁、重新加载作品、删除；stale-lease（无桥）、in-use、missing、changed、damaged、unavailable：重新加载作品、删除；删除前有分隔线；顶部标签为异常类别 |
| WN-44 | 悬停异常作品 | 悬停卡片含作品名、类别、原因、建议；不含路径 |
| WN-45 | 菜单“重新加载作品” | 再请求一次 `/api/novels`；夹具改为恢复后，节点变为正常作品节点 |
| WN-46 | 菜单“修复作品锁” | 只发一次 `{type:'start',workId}`；连续点击单飞；cancelled 后可再修复；reject 显示 toast 安全文案，不含原始错误；pending/restarting 时菜单项禁用且不出现第二次 start、不声称成功 |
| WN-47 | 修复进行中打开菜单 | 删除与重新加载禁用 |
| WN-48 | 菜单“删除” | 打开 React 对话框（role=dialog，标题“删除作品”），正文含作品名、“作品目录中的文件不会被改动”；未发请求；取消关闭且无 DELETE |
| WN-49 | stale-lease 作品删除对话框 | 显示“建议先使用“修复作品锁””警告；不显示“可通过打开作品目录重新加入” |
| WN-50 | 确认，200 | 只发一次 `DELETE /api/works/{workId}`；预置的该 novelId tab 被关闭、无关 tab 保留；`/api/novels` 与 `/api/chat/conversations` 被重新请求；toast“作品已从列表中删除”；节点消失 |
| WN-51 | 确认，409 `{error:'作品仍有任务在运行，请稍后重试'}` | 对话框保持打开，role=alert 显示该文案；可再次确认 |
| WN-52 | 确认，500 非 JSON / fetch reject | 显示通用文案，不显示原始错误 |
| WN-53 | 请求挂起时连点确认、按 Esc | 只发一次请求；按钮禁用；对话框不关闭；该作品菜单项全部禁用 |
| WN-54 | 重新加载进行中 | 修复与删除禁用 |
| WN-55 | 设定/角色/正文/对话视图 | 异常作品分组标题用合成图标与对应文字色；`…` 与右键打开同一菜单；组内一行说明；无卡片 |
| WN-56 | 健康作品行右键 | 打开菜单，项为“重命名”“删除”，与 `…` 菜单逐项一致（文本、顺序、无分隔线）；“删除”走原 `DELETE /api/novels/{id}` 对话框 |
| WN-57 | 右键导航行 | 不触发文本右键菜单（`window.desktop.showTextContextMenu` 夹具未被调用）；在输入框内右键仍走文本菜单 |
| WN-58 | 列表整体请求失败 | 原“作品加载失败”块与其按钮不变；不显示上次的异常节点 |
| WN-59 | 切换 scope（数据根变化） | 修复 busy 状态复位 |

## E. 回归

- `tests/browser/works-loading.test.ts` 旧 WL-05/06/07 用例改为经菜单操作，断言含义不变。
- `tests/browser/sidebar-navigation.test.ts` 中依赖“修复作品锁”按钮的用例改为经菜单操作。
- `tests/integration/works-loading.test.ts` WL-01..04 原样通过（WL-01 中 `['unavailable','stale-lease']` 改为 `['missing','stale-lease']`，这是本次需求的预期变化）。
- `npm run typecheck`、`npm test` 全量通过。

## F. 真实目标系统

构建安装版；隔离数据根（不接触用户真实数据）；准备三个作品：目录缺失且有关联会话、stale-lease、数据库缺失。逐项：
1. 截图：作品视图与设定视图中的三个异常节点（宣纸、玄墨）。
2. 单击、右键、`…` 打开菜单并截图。
3. 依次删除三者；会话列表可打开；三个目录逐文件哈希与删除前一致。
4. 重启应用，启动成功，列表正常。
5. 正常作品右键菜单截图，与 `…` 一致。

## G. 修订（回应 552 审核与 551 审核；与前文冲突处以本节为准）

### G.1 夹具与执行

- 集成：in-use 前置 `assert.doesNotThrow(()=>process.kill(process.ppid,0))` 且 `process.ppid!==1`；chmod 类用例前置 `assert.notEqual(process.getuid?.(),0)`。reason 一律按 workId 映射断言。
- 浏览器：颜色/高度类用例（WN-40/41/55）放入 `tests/browser/sidebar-navigation.test.ts`（其夹具注入 globals.css、desktop.css 与主题 class）；works-loading 夹具挂载 `<Toaster/>`；WN-57 按 `tests/browser/text-context-menu.test.ts` 方式挂载 `DesktopCommandController`。
- 命令：`npm run typecheck`；`npm test`；浏览器单独 `SHAKEINK_TEST_CHROMIUM=… node --import tsx --test tests/browser/works-loading.test.ts tests/browser/sidebar-navigation.test.ts tests/browser/text-context-menu.test.ts`（另跑其余 tests/browser 全量作回归）。

### G.2 替换与新增用例

| 编号 | 类型 | 内容 |
|---|---|---|
| WN-01′ | 单元 | 输入改为：`ContentError('WORK_LEASE_STALE')`→stale-lease；`markWorkFault(Error(),'in-use'/'missing'/'changed'/'damaged')`→对应 kind；未标记 ENOENT→unavailable；`Object.assign(Error('x'),{code:'WORK_IN_USE'})`→unavailable；`ContentError('OTHER')`→unavailable；EPERM→unavailable；非 Error→unavailable；标记不可枚举（`JSON.stringify`、`Object.keys` 不含） |
| WN-02′ | 单元 | stub `fetch` 调 `fetchNovelList`：`'future-kind'`、缺失 → unavailable；`in-use` 保留 |
| WN-03′ | 集成 | in-use 用 ppid（前置见 G.1）；新增 WN-03b：`owner.json` host 为 `other-host.invalid` → in-use；WN-03c：锁目录存在但无 `owner.json` → unavailable（不是 missing） |
| WN-04b | 集成 | 删除 `shakeink-work.json` → changed |
| WN-04c | 集成 | 目录改名后 `cp -R` 复制回原路径（inode 不同）→ changed；两份目录字节不变 |
| WN-05′ | 集成 | 错误类型不变：in-use 时 `works.run` reject 的仍是普通 `Error`（非 ContentError）且 message 为“作品已在其他进程打开”；ENOENT 错误 `code` 仍为 ENOENT |
| WN-10′ | 集成 | catalog 其他行 `deepEqual`、revision+1（非字节相等） |
| WN-11b | 集成 | stale-lease 删除后 `works.open(identity)` reject `WORK_LEASE_STALE`；catalog 不含；锁字节不变 |
| WN-13′ | 集成 | damaged、changed 各补 catalog、列表、目录字节三项断言 |
| WN-14b | 集成 | 健康作品：`works.forget(id, async()=>{ await assert.rejects(works.run(id,…), /作品不在本地目录索引中/) })` —— beforeCommit 内新 run 被拒，证明 `forgotten` 在会话清理前已设置；提交后锁目录不存在 |
| WN-14c | 集成 | 健康作品在 `run` 内取得 `retainTask()` 并在 `run` 返回后继续持有（active 仍 >0）：删除 → 409 `WORK_BUSY`，catalog 不变；释放后重试 200，锁目录不存在，`works.open` 成功 |
| WN-14d | 集成·注入 | 锁目录内放入未知文件 `extra.txt`，使退役失败：删除仍 200；catalog 不含；`works.close()` 抛出原“作品目录锁包含未知文件”错误（残留连接已登记）；移除 `extra.txt` 后 `works.close()` 成功、锁目录不存在 |
| WN-21′ | 集成 | 使用从未 configure 的 `Workspaces`，先断言 `conversationTransfersFor(works)===undefined` → 503；catalog 字节不变；作品仍在 `unavailableWorks` |
| WN-22′ | 集成 | 健康作品 B 有关联会话；`data/` chmod 0o555 后删除 → 500 `WORK_REMOVE_FAILED`，正文不含 base；catalog 字节不变；B 的会话已 deleted；`works.run(B.id,…)` 成功（forgotten 已回滚）；恢复 0o755 后重试 200 |
| WN-23 | 集成 | `works.runWithGlobal('inbox',()=>dispatcher.handle(DELETE missing))` → 200，无自等待 |
| WN-24 | 集成·worker RPC | `tests/integration/desktop-worker.test.ts` 中 `DELETE /api/works/{随机uuid}` → 404 JSON `WORK_NOT_FOUND` |
| WN-18′ | 集成 | 另测 `/api/works/..%2F`、大写 uuid → 400；`POST /api/works/{uuid}`、`/api/works/{uuid}/x` → 原 404“本地命令不存在” |
| WN-31′ | 集成 | 迁往 B 的会话用 `manager.associate` 构造；补一个删除前已 `remove` 的 A 会话，其 deletion 与 location revision 不变 |
| WN-32a | 集成 | 服务层 `works.forget(A.id, async()=>{await transfers.forgetWorkspace(A.id); 直接写 catalog revision+1})` → reject `RevisionConflict`；ledger 中 A 会话 deleted、phase committed；catalog 仍含 A；会话列表 200；经路由重试 200；第二次 `forgetWorkspace` 前后 `ledger.locations()` 相同 |
| WN-32b | 集成 | 健康作品重复冲突注入后 `works.run(id, ()=>prisma.novel.count())` 返回 1 |
| WN-41′ | 界面·夹具 | 宣纸：错误标题 `rgb(163, 70, 60)`、警告 `rgb(126, 98, 28)`、徽标填充 `rgb(155, 44, 31)`/`rgb(143, 107, 35)`；玄墨：`rgb(224, 138, 128)`、`rgb(217, 180, 95)`、`rgb(229, 83, 75)`/`rgb(217, 164, 91)`；行高 28px；健康作品标题色等于改动前实测值 |
| WN-42′ | 界面·夹具 | 鼠标单击、Enter、Space、`…`、右键五种方式，`menuitem` 文本数组逐一 `deepEqual`；行 `aria-haspopup="menu"`、打开时 `aria-expanded="true"`；菜单打开后不会立即关闭（等待 300ms 后仍可见） |
| WN-43′ | 界面·夹具 | 类别标签：missing“作品目录不可用”、stale-lease“作品锁未释放”、in-use“作品正在别处使用”、changed“作品目录已变化”、damaged“作品数据无法读取”、unavailable“作品暂不可用” |
| WN-44′ | 界面·夹具 | 悬停卡片含作品名、类别、原因、建议四段文案（逐字）；删除“不含路径”断言 |
| WN-46′ | 界面·夹具 | 忙碌文案“正在准备修复…”“修复交接待完成”“正在重新启动…”；菜单关闭后节点行状态标签可见；挂载 Toaster 后 reject 的 toast 为“暂时无法开始锁修复，原文件已保留，请重试。” |
| WN-48′ | 界面·夹具 | 正文逐字含“与该作品关联的对话将一并删除。”“作品目录中的文件不会被改动。”；非 stale-lease 含“目录恢复后，可通过“打开作品目录”重新加入。” |
| WN-50′ | 界面·夹具 | 预置 tab：`novelId===work.novelId` 被关闭，`novelId===work.workId` 保留；DELETE method 与路径逐字一致；当前会话属于该作品时触发新对话 |
| WN-50b | 界面·夹具 | 服务端 404 `WORK_NOT_FOUND` → 按成功处理（关闭对话框、刷新列表） |
| WN-51′ | 界面·夹具 | 再次确认发出第 2 次 DELETE |
| WN-53′ | 界面·夹具 | 删去“菜单项全部禁用”（模态下不可观察） |
| WN-54′ | 界面·夹具 | 重新加载进行中菜单项显示“正在重新加载…”，修复与删除禁用 |
| WN-56′ | 界面·夹具 | 补：左键健康行仍打开作品 tab 且无 menu；设定视图健康作品分组标题右键无 `role=menu`；经右键菜单完成重命名 |
| WN-57′ | 界面·夹具 | 挂载 `DesktopCommandController`，stub `showTextContextMenu`；先右键 `<input>` 计 1 次（阳性对照）；再右键异常行、健康行、行内 `NavigationLabel`，次数不变且出现 `role=menu` |
| WN-59′ | 界面·夹具 | 修复挂起时 `useDesktopStore.setState` 改 `dataRoot` → 修复项恢复可用；旧 Promise resolve 后状态不变 |
| WN-60 | 界面·夹具 | SN-15 改写：甲修复挂起时，乙菜单中修复项同样禁用且文案“正在准备修复…”；切换视图后 `repairCount()` 仍为 1 |

### G.3 真实目标系统（macOS）

平台仅 macOS，Windows 原生验收标“待验收”。stale-lease 用手写 `owner.json`（已退出 pid）构造；删除 stale-lease 后断言 `.shakeink-lock` 仍在。安装版断网启动；在真实 Electron 中右键出现 React 菜单、不弹文本菜单。

### G.4 实施中的有意偏离（回应 `docs/553-faulted-work-node-code-review.md`）

- **WN-18′ `..%2F`**：请求在进入路由前已被现有 `requestSchema` 以“本地路径不能越界”拒绝（handle 直接 reject，不返回 400）。更早的拦截在安全上更严格；用例改为断言该拒绝，不记为“按原用例 400 通过”。大写 uuid、`abc` 仍为 400 `INVALID_WORK_ID`。
- **单击行打开菜单（551 §7.3）**：未采用“受控 open + requestAnimationFrame”。实测受控方式在菜单项执行后会让下一次打开的弹层停在 `data-closed` 状态不卸载。改为单击/Enter/Space 程序化点击行内真实 `…` 触发器，由 Base UI 管理打开、焦点与关闭；关闭后焦点用 `finalFocus` 返回行本身（WN-42b），`…` 触发器加 `focus-visible:opacity-100`。
- **右键收起悬停卡片**：悬停 Provider 新增 `hideAll()`，所有导航右键菜单打开时调用（WN-42c）。
- **WN-14c**：`retainTask` 持有期间 `active>0`，删除被 409 拒绝，因此 `run().finally`/释放回调中的“已移除后退役”分支在当前流程中不可达，作为防御保留并加注释。
