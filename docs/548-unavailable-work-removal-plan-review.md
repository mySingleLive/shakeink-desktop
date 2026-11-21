# 547 删除不可用作品 技术方案 · 独立审核

审核对象：`docs/548-unavailable-work-removal-plan.md`。审核时未修改任何源文件。

## 发现

1. **should-fix：探测失败可能是误判。** `Workspaces.run` 的 `finally` 会淘汰 LRU 中另一个空闲连接，那个连接关闭失败时会重新抛出错误（`desktop/service/workspaces.ts:393-397`）。`finally` 里抛出的错误会覆盖成功结果，所以一个健康作品的 `novel.count()` 探测也可能失败，随后被删除。另外，`this.closing` 等临时错误（`workspaces.ts:330`）也会被当成"不可用"。修改要求：只认可可识别的不可用原因（`WORK_LEASE_STALE`、ENOENT/ENOTDIR、"作品目录发生变化"、身份不匹配、数据库缺失），或者探测失败后检查 `slots.has(id)`，如果连接实际已建立就按 `WORK_AVAILABLE` 处理。

2. **should-fix：内存中可能残留连接槽。** 只有 `open/create` 走 `serialize`，`GET /api/novels` 和 `chat/conversations` 调用 `works.run(id)` 时不排队（`dispatcher.ts:87,99`）。在第 2 步检查之后、`catalog.update` 之前，并发请求可能为该 id 建立一个连接槽，并持有本进程的目录锁。之后再"打开作品目录"会进入 `open()` 的非连接槽分支（`workspaces.ts:265-270`），`lockDirectory` 看到本进程 pid 仍然存活，抛出"作品已在其他进程打开"（`workspaces.ts:56`），要重启应用才能恢复。修改要求：`catalog.update` 之后如果出现该 id 的连接槽，就把它退役，退役方式沿用 `disconnect` 和 `failedRetirements`。

3. **should-fix：stale-lease 作品删除后无法重新加入。** `open()` 会调用 `connect`，然后 `lockDirectory` 抛出 `WORK_LEASE_STALE`（`workspaces.ts:62`）。锁修复又依赖目录索引中的记录，`closedWorkLeaseTarget` 找不到记录时返回 `WORK_LEASE_NOT_REGISTERED`（`desktop/service/closed-work-lease-target.ts:15`）。所以对话框里"目录恢复后可通过打开作品目录重新加入"这句话，对 stale-lease 作品不成立。修改方式二选一：stale-lease 作品的对话框正文改为先建议修复锁，并明确说明删除后需要手动清理锁才能重新打开；或者 stale-lease 作品不提供删除入口。这一行为需要写入方案和测试。

4. **OK：启动恢复能容忍这种状态。** `ledger.remove(location)` 不带回调时，deletion 的 phase 写为 `committed`（`conversation-ledger.ts:100`）。启动时 `recover()` 调用 `remove`，进入 `withWorkspace` 和 `run`，抛出普通 `Error('作品不在本地目录索引中')`（`workspaces.ts:365`）。这个错误被包装成 `deletionPending`，cause 正好满足 `missingDeletionSource`（`conversation-transfer.ts:30-33,124-132,142`），结果记为 pending，启动不会失败。之后 `GET /api/chat/conversations` 只对未删除位置抛错（`dispatcher.ts:104`），所以也会恢复正常。作品重新打开后，下次启动会在作品库中完成删除。有一点要写进方案：作品重新打开后、下次重启前，作品库里的旧会话行仍然存在，只是 `location.deleted` 会让它们被跳过（`dispatcher.ts:111`）。

5. **nit：未入账会话会重新出现。** 作品库中从未写入账本的旧会话，重新打开作品后会重新出现。这与"已删除的会话不恢复"的说法不一致，需要在方案中说明。

6. **OK：路由可以到达。** 主进程会把除 `POST /api/novels` 和模型 GET 之外的路径都转发给 worker 的 `start`（`desktop/main/index.ts:787-806`）。`workspaceFor` 对未匹配的路由返回 `inbox`（`dispatcher.ts:31`）。`routes.generated.ts` 中没有 `/api/works`，不会冲突。worker 在 `runWithGlobal('inbox')` 内执行该请求（`service/index.ts:89`），账本的嵌套 `run('inbox')` 会复用同一个连接槽，没有死锁。

7. **OK：与锁修复交接的交互是安全的。** 删除请求经过 `start`，会把 `closedForMaintenance` 置为 false（`service/index.ts:120-123`），使交接时的"已关闭"证明失效，交接以失败结束并重启，不会误修。如果作品已被移出目录索引，交接会得到 `WORK_LEASE_NOT_REGISTERED`，这与方案第 6 节的描述一致。

8. **nit：其他引用。**
   - 未完成的转移日志：`recover` 会把它们记为 unavailable 或 `SOURCE_UNAVAILABLE`，不会抛错（`conversation-transfer.ts:157,172`）。
   - 历史子任务：如果 `historicalWorkspaceId` 指向被删作品，GET 会报错（`dispatcher.ts:48`），可以接受。
   - 受保护目录：`protectedDirectories` 不再包含该路径（`workspaces.ts:150`），所以文件导出和配置导出不再保护该目录。需要在方案中说明。

9. **nit：界面接线。** `UnavailableWorks` 目前拿不到 tab store 和 queryClient。建议由 `SidebarTree` 传入 `onRemoved(novelId)`，复用 `closeAllTabsOfNovel` 和 `invalidateNovels`（`SidebarTree.tsx:1359,1437`），不在组件内另写一套。按钮的禁用条件应覆盖 `busy` 的全部取值，包括 `'pending'` 和 `'restarting'`（`UnavailableWorks.tsx:12`）。方案只使用 React `Dialog`（`src/components/ui/dialog.tsx`），符合"不用原生弹窗"的约束。

10. **should-fix：流程要求。** 方案没有列出 `docs/requirements-traceability.json` 的台账条目和验证计划（真实缺失目录、stale-lease、重启恢复、重新打开）。按 AGENTS.md，进入测试用例阶段前需要补上。

## 结论

**approve with changes**：语义和"会话 → 索引"的顺序是正确的，启动恢复路径可行。实现前需要先修正第 1、2、3、10 条。
