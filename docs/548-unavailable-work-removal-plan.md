# 548 · 删除不可用作品 技术方案

## 1. 需求

用户 2026-11-10：侧栏中“作品目录暂不可用”“上次异常退出留下了写入锁”等无法正常加载的作品，应允许用户删除。

## 2. 现状

- `GET /api/novels`（`desktop/service/dispatcher.ts`）对目录索引 `catalog.json` 中每个作品 `works.run(id)` 读取；失败者进入 `unavailableWorks`（`reason: 'stale-lease' | 'unavailable'`）。
- `UnavailableWorks`（`src/components/desktop/UnavailableWorks.tsx`）只提供“修复作品锁”（仅 stale-lease）和“重新加载作品”。
- 正常作品删除走 `DELETE /api/novels/[id]`，在作品数据库中把 novel 标为 `DELETED`。不可用作品的数据库打不开，此路径不可用。
- 会话位置账本（inbox 库 `systemConfig`）中若有未删除的会话位置指向读取失败的作品，`GET /api/chat/conversations` 整体抛错（`dispatcher.ts:104`）。只把作品移出索引不能消除此故障。

## 3. 语义

“删除不可用作品” = **从本应用的作品索引中移除该作品，并删除索引中与之关联的会话**。

- 不读写、不删除作品目录内任何文件（目录可能缺失、被移动或被锁；删除用户磁盘文件不可逆）。对话框明确说明。
- 目录恢复后，用户可用现有“打开作品目录”重新加入；已删除的会话不恢复（与普通删除作品一致）。
- 健康作品不能走此路径：服务端在提交前重新探测，能打开则拒绝（409 `WORK_AVAILABLE`），提示用作品菜单删除。

## 4. 方案

### 4.1 服务端

新增 `Workspaces.unregisterUnavailable(id, beforeCommit)`（`desktop/service/workspaces.ts`），在 `serialize` 队列内：

1. 读取 catalog；无此 id → `ContentError('WORK_NOT_FOUND', …, 404)`。
2. `failedRetirements` 含该 id（引擎关闭未完成，可能仍有活引擎）或 `slots`/`retiring` 中有该 id → `WORK_AVAILABLE`/`WORK_BUSY` 拒绝。
3. 探测：`this.run(id, () => novel.count())`。成功 → `WORK_AVAILABLE` 409；失败 → 视为不可用。
4. `await beforeCommit()`（会话账本清理）。
5. `catalog.update(before.revision, 去掉该行)`；revision 冲突原样抛出（不重试，用户重试即可）。

新增 `ConversationTransfers.forgetWorkspace(workspaceId)`（`desktop/service/conversation-transfer.ts`）：对 `ledger.locations()` 中 `!deleted && workspaceId === id` 的每个会话，在 `gate.transfer(id)` 内重读位置，仍匹配则 `ledger.remove(location)`（无 inbox 删除回调 → deletion phase `committed`）。这与现有“源目录缺失的待清理删除”状态相同：启动 `recover()` 对缺失源返回 pending，不抛错；若目录日后被重新打开，恢复流程会在该库中完成删除。幂等：重复调用时无未删除位置。

新增端点 `DELETE /api/works/[workId]`：`dispatcher.handle` 中在 `matchRoute` 前特判（与 `GET /api/novels` 同级）。`workspaceFor` 对未注册路由返回 `inbox`，无需改动。workId 用 `z.uuid()` 校验，非法 → 400。成功返回 `{ ok: true, novelId }`。ContentError 映射为 `{ error, code }` + status；其他错误 500 通用文案，不泄露路径。

顺序为“探测 → 会话 → 索引”：若会话清理后索引写入失败，作品仍在列表，用户重试即可（会话步骤幂等）；反过来会留下打不开、又无入口清理的会话故障。

### 4.2 界面

`UnavailableWorks` 每个作品详情区增加“删除作品”按钮（outline，destructive 文字色），点击打开 React `Dialog`（不用原生弹窗）：

- 标题“删除作品”；正文：`确定要从作品列表中删除《{title}》吗？与该作品关联的对话将一并删除。作品目录中的文件不会被改动，目录恢复后可通过“打开作品目录”重新加入。`
- “取消” / “确认删除”（destructive，进行中显示加载并禁用）。
- 成功：toast“作品已从列表中删除”，关闭该 novelId 的全部 tab，invalidate `['novels']` 与 `['chat-conversations']`。
- 失败：对话框内 `role="alert"` 显示服务端 `error`（已是安全文案），对话框保持打开。
- 修复锁进行中（`busy`）或正在重新加载时禁用删除按钮；删除进行中禁用修复与重新加载。

`SidebarTree` 不改；按钮在 works 视图与其他视图（`renderWork` 分组）中都在 `details` 内，因此都可见。

## 5. 不做

- 不删除磁盘目录或文件；不提供“同时删除文件”选项。
- 不处理指向该作品的未完成会话转移日志（已有恢复流程将其标为 unavailable）。
- 不改正常作品的删除流程。

## 6. 风险

- 探测与提交之间目录恢复：极小窗口，结果是移除了一个刚恢复的作品，文件仍在，可重新打开。可接受。
- 删除与锁修复交接并发：界面互斥；服务端在交接重启时会得到 `WORK_LEASE_NOT_REGISTERED`，交接失败但数据不丢。
