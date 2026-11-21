# 552 用例独立审核

**结论：需修订后再实现**（4 个 blocker，9 个 should-fix）。分类、删除、会话账本三组的骨架可以用现有 harness 搭建。问题有两类：一是若干用例按原文写，错误实现也能通过（WN-14、WN-22、WN-41、WN-57）；二是有的用例按原文根本搭不起来（WN-21、WN-32）。

## Blocker

1. **WN-21 按原文无法命中 503 分支。** `LocalDispatcher` 的第二个参数带默认值 `=conversationTransfersFor(works)`（`desktop/service/dispatcher.ts:27`）。JS 遇到显式传入的 `undefined` 仍会使用默认值，所以只要该 `works` 已经 configure，`new LocalDispatcher(works, undefined)` 拿到的仍是真实账本。
   改为：“**WN-21**：使用一个从未调用 `configureConversationTransfers` 的 `Workspaces`（或先调用 `dispose()`），并先断言 `conversationTransfersFor(works)===undefined`；随后 DELETE missing 作品 → 503 `{code:'CONVERSATION_LEDGER_UNAVAILABLE'}`；catalog 文件字节不变；作品仍在 `unavailableWorks`。”

2. **WN-22 的 chmod 方式测不到“写失败”。** `catalog.update` 的写入步骤是先写临时文件，再用 `rename` 覆盖（`desktop/core/versioned-store.ts:26-34`）。对 `catalog.json` 执行 chmod 000 不会阻止 rename，只会让 `readDisk` 失败。而 forget 的第 1 步就要读 catalog，所以请求会在会话清理之前以 500 失败。用例照样能通过，但回滚 `forgotten` 这条路径完全没有执行。
   改为：“**WN-22**：先 `assert.notEqual(process.getuid?.(),0)`，以 root 运行时 chmod 不生效。对**健康**作品 B 执行删除前，把 `data/` 目录 chmod 0o555，使 `open(temp,'wx')` 报 EACCES，而读取和 `data/inbox/database` 内的写入不受影响。期望：500 `{code:'WORK_REMOVE_FAILED'}`，正文不含 `base`；catalog 字节不变；B 的关联会话已为 deleted；`works.run(B.id, …)` 仍然成功，证明 `forgotten` 已回滚；`finally` 中恢复 0o755 后重试 DELETE 返回 200。”

3. **WN-32 无法经 HTTP 注入，而且 missing 作品掩盖了 `forgotten` 的回滚。** DELETE 路由不暴露 `beforeCommit`，测试没有地方能“在 forgetWorkspace 之后改写 catalog”。另外，missing 作品的 `run` 本来就会抛 ENOENT，`forgotten` 有没有残留都看不出来。
   改为两条。
   - “**WN-32a**（服务层）：`works.forget(A.id, async()=>{await transfers.forgetWorkspace(A.id); 用 writeFile 直接写入 {schemaVersion:1,revision:r+1,value:原值}})`，期望 reject `RevisionConflict`。其余断言同原文，并补 `ledger.deletion(conv).phase==='committed'`。之后经路由重试 DELETE 返回 200，第二次 `forgetWorkspace` 前后 `ledger.locations()` 完全相同。”
   - “**WN-32b**：对健康作品重复上面的冲突注入，然后断言 `works.run(id, ()=>prisma.novel.count())` 返回 1，即没有残留 `forgotten`。”

4. **WN-14/15 测不到方案 2.3 的第 7 步和 `run().finally` 退役。** catalog 去掉该行后，`run` 本来就会在 `workspaces.ts:365` 抛出“作品不在本地目录索引中”，所以 WN-14 的这条断言在没有 `forgotten` 的情况下也成立。真正新增的逻辑处理的是“检查之后、提交之前有并发 `run`”，目前没有用例覆盖。
   新增：“**WN-14b**：健康作品 `works.forget(id, async()=>{p=works.run(id,()=>hold.promise)})`，在 beforeCommit 里建立新槽，它会重新加锁。提交后先断言锁目录存在；`hold.resolve()` 之后 `await p`，再断言 `.shakeink-lock` 已不存在；`works.close()` 不抛错。再新增 **WN-14c**：beforeCommit 内建立空闲槽（`await works.run(id, async()=>{})`），提交后锁目录立即不存在。”

## Should-fix

5. **分类缺少真实输入，部分期望与方案自相矛盾。**
   - 清单被删除时，`readWorkBrand` 抛的是 `Error('BRAND_MARKER_MISSING')`，没有 errno（`desktop/core/brand-names.ts:45`），按 2.1 的规则会得到 `unavailable`。但方案写的是“目录或清单缺失 → missing”。需要和 551 审核对齐后写死期望：“**WN-04b**：删除 `shakeink-work.json` → reason =（missing 或 unavailable，由方案定）。”
   - `WORK_DIRECTORY_CHANGED` 只有单元用例。新增“**WN-04c**：把目录改名后用 `cp -R` 复制回原路径，inode 不同 → `changed`，两份目录字节均不变。”
   - 外设备锁没有用例。新增“**WN-03b**：`owner.json` 的 host 为 `other-host.invalid` → `in-use`。”
   - WN-01 追加两条输入：`Object.assign(Error('x'),{code:'WORK_IN_USE'})`（非 ContentError）→ `unavailable`，用来防止按 `.code` 鸭子类型判断；errno `EPERM` → 期望值由方案写明。`workspaces.ts:58` 会原样重抛 EPERM，它在语义上更接近“正在使用”。

6. **WN-03 的 in-use 夹具需要前置检查。** 用 `process.ppid` 并且 `host: hostname()` 是现实的做法，与 `works-loading.test.ts:44` 遗留锁的写法一致。但 ppid 为 1 时 `kill` 返回 EPERM，结果会变成 unavailable。前置条件补上：`assert.doesNotThrow(()=>process.kill(process.ppid,0))`，以及 `process.ppid!==1`。期望按 workId 映射 reason，不要依赖“依次”这种顺序。

7. **测试路径不是生产路径。** 生产 worker 会先 `workspaceFor`，再在 `runWithGlobal(workspace)` 里调用 `handle`（`desktop/service/index.ts:88-91`），B 组则直接调用 `handle`。新增“**WN-23**：在 `works.runWithGlobal('inbox', ()=>dispatcher.handle(DELETE…))` 内删除 missing 作品，返回 200，不出现自等待。另外在 `tests/integration/desktop-worker.test.ts` 的 RPC harness 中执行 `DELETE /api/works/{随机uuid}` → 404 `WORK_NOT_FOUND` JSON，证明主进程到 worker 的转发与 `workspaceFor→inbox` 有效，而不是 rpc reject。”

8. **方案 2.3 第 4 步的 `failedRetirements`/`WORK_BUSY` 分支仍然没有用例。** 549 审核第 7 条已经指出这一点，本次仍未处理。可以写一条注入用例，用 mock `disconnect` 让它 reject，台账记为“注入”；或者从方案中删去这个分支。

9. **方案 2.4 末条和 C 组的覆盖缺口。**
   - 新增“**WN-11b**：stale-lease 作品删除后，`works.open(await directoryIdentity(path))` reject `WORK_LEASE_STALE`；catalog 不含该作品；锁文件字节不变。”
   - WN-31 补一个“删除前已经由 `removeConversation` 删掉的 A 会话”，断言它的 deletion 记录和 location revision 都不变（549 审核第 3 条）。
   - 迁往 B 的会话按 `conversation-transfer-101-review.test.ts:41-43` 的 `manager.associate` 构造。

10. **颜色和高度断言必须用带样式的夹具，期望写成字面值。** `tests/browser/works-loading.test.ts:30` 的 CSS loader 是 `'empty'`，也不注入样式，计算色只能得到默认黑色，`h-7` 也不会生效。注入了 `globals.css` 和 `desktop.css` 并设置主题 class 的是 `tests/helpers/sidebar-navigation-fixture.ts:9,27,37`。WN-40/41/55 改为在这个夹具中运行（或给 works-loading 夹具补 `addStyleTag`）。期望要写死：
    - 宣纸主题：标题色 `rgb(163, 70, 60)` / `rgb(126, 98, 28)`；徽标 `--destructive` `#9b2c1f`、`--warning` `#8f6b23`（`globals.css:142,161`）。
    - 玄墨主题：标题色 `rgb(224, 138, 128)` / `rgb(217, 180, 95)`；徽标 `#e5534b`、`#d9a45b`（`globals.css:213,232`）。
    - 行高 28px；健康作品标题色与改动前的实测值相等。

    “等于 `--fault-error-text`”这种写法，在变量值本身写错时仍然成立。

11. **WN-57 在现有两个夹具中都会空过。** 文本右键监听由 `DesktopCommandController` 安装（`src/lib/desktop/text-context-menu.ts:87`），works-loading 和 sidebar 两个夹具都没有挂载它。改为：“按 `tests/browser/text-context-menu.test.ts:23-30` 的方式挂载 `DesktopCommandController`，并 stub `window.desktop.showTextContextMenu` 记录调用。夹具放一个 `<input>`。先右键 input，stub 被调用 1 次（阳性对照）；再用 `page.click({button:'right'})` 右键异常行和健康行，stub 次数不变，`role=menu` 出现。”Base UI 的 ContextMenu 由 trusted `contextmenu` 触发，用 Playwright 右键可以测。

12. **toast 断言需要挂载 Toaster；菜单文案需要写死。**
    - WN-46/50 断言 toast，但两个夹具都没有 `<Toaster/>`。改为挂载 `src/components/ui/sonner` 的 `Toaster`，写法同 `tests/browser/text-selection.test.ts:28`。
    - WN-43 的“顶部标签为异常类别”无法证伪。逐一写出：missing“作品目录不可用”、stale-lease“作品锁未释放”、in-use“作品正在别处使用”、changed“作品目录已变化”、damaged“作品数据无法读取”。unavailable 的文案设计稿没有给出，需由方案补齐。
    - WN-46 写死忙碌文案：“正在准备修复…”“修复交接待完成”“正在重新启动…”。WN-54 写死“正在重新加载…”。
    - WN-48 补断言正文含“与该作品关联的对话将一并删除。”，并且非 stale-lease 显示“目录恢复后，可通过“打开作品目录”重新加入。”。

13. **交互覆盖缺口。**
    - WN-42 加 Space 键；四种方式打开后取 `menuitem` 文本数组逐一 `deepEqual`。
    - WN-56 补三点：左键健康行仍然打开作品 tab、不出现 menu；设定视图里健康作品的分组标题右键不出现 `role=menu`（方案 3.3）；重命名经右键菜单可以完成。
    - WN-50 的 tab 预置改为：`novelId===work.novelId` 的 tab 被关闭，`novelId===work.workId` 的 tab 保留，这样能抓到误用 workId 的实现。另外断言 DELETE 的 method 和路径完全一致。
    - WN-51 补“再次确认发出第 2 次 DELETE”。
    - WN-59 写明机制：scope 取 `user.id:dataRoot`（`SidebarTree.tsx:1372-1373`）。修复挂起时执行 `useDesktopStore.setState({bootstrap:{…,dataRoot:'other'}})`，之后菜单中“修复作品锁”可用；旧 Promise resolve 后状态不变。

## Nit

- WN-02：函数名是 `fetchNovelList`（`src/lib/novel-list.ts:9`），没有 `parseNovelList`，单元测试需要 stub `fetch`。
- WN-10：catalog 整体重写，“其他行字节级不变”应改为“其他行 `deepEqual`，revision+1”。WN-13 补 catalog、`GET /api/novels`、目录字节三项断言。
- WN-18：补 `/api/works/..%2F`、大写 uuid 的期望。WN-30 写明是 `handle` reject（ENOENT，`dispatcher.ts:104`），不是返回状态码。
- WN-44 的“不含路径”：夹具里本来就没有路径，这条断言恒真，可以删除或改成别的检查。WN-53 的“删除进行中菜单项全部禁用”：对话框模态且不可关闭，界面上观察不到，应注明为防御性逻辑，或删除这条断言。
- E 组的 `sidebar-navigation.test.ts:104-109`（SN-15）改写时要说明：甲修复挂起期间，乙菜单中的修复项同样禁用，文案为“正在准备修复…”，切换视图后 `repairCount()` 仍为 1。

## 台账与执行

- `npm test` 只运行 `tests/unit` 和 `tests/integration`（`package.json:6`）。E 组需要单独列出浏览器命令：`SHAKEINK_TEST_CHROMIUM=… node --import tsx --test tests/browser/works-loading.test.ts tests/browser/sidebar-navigation.test.ts tests/browser/text-context-menu.test.ts`。不能用“npm test 全量通过”来证明界面用例通过。
- 标签：B/C 组直接调用 dispatcher，可以记“集成·真实库”，但不代表 IPC 或主进程已验证。WN-23 的 worker 用例可以单独记录。D 组只能记“界面·夹具”。新增的“单元”类别要同步写进 551 §5 的 verificationKind。
- F 组需要说明以下几点：
  - 平台：本轮只在 macOS 执行，Windows 原生验收保持“待验收”（implementation-boundaries 要求两个平台分别验收）。
  - stale-lease 的构造方式：手写 `owner.json` 写入已退出进程的 pid，或者强杀应用进程。
  - 删除 stale-lease 后 `.shakeink-lock` 仍然存在。
  - 安装版离线启动。
  - 右键菜单在真实 Electron 中出现，并且不弹出文本菜单。
