# 608 · 删除作品时询问是否删除磁盘文件 技术方案

## 1. 需求（用户 2026-11-25）

点击作品菜单中的“删除”时不立即删除，弹出对话框询问是否连磁盘上的文件和目录一起删除：

- 选“否”：只删除玄印写作中的作品数据。
- 选“是”：连磁盘上的作品目录一起删除。

用户确认（同日）：

1. “是”= **永久删除**作品目录（不移到废纸篓）。
2. “否”= 从作品列表移除并删除关联对话，**目录文件不动**，以后可用“打开作品”重新加入。
3. 正常作品与不可用作品（目录缺失、被锁等）都用此对话框。
4. 文案（用户选定）：

```
标题：删除《作品名》
正文：是否同时删除磁盘上的作品文件？
      <作品目录完整路径>
      选「删除」只从玄印写作中删除，文件保留。
按钮：[取消] [删除] [删除，不保留文件]（用户 2026-11-26 由 取消/否/是，删除文件 改名，“否”易误解）
```

## 2. 现状

- 正常作品菜单 `novelMenuItems`（`src/components/layout/SidebarTree.tsx:1858`）→ 对话框“删除小说” → `DELETE /api/novels/[id]`（`desktop/handlers/novels/[id]/route.ts`）只把 novel 标为 `DELETED`。作品记录仍在 `catalog.json`，目录无法再“打开”（`open()` 要求 `status != DELETED`），会话也不清理。
- 不可用作品菜单 `FaultedWorkMenuItems` → 对话框“删除作品” → `DELETE /api/works/[workId]`（`desktop/service/dispatcher.ts:140` `removeWork`）→ `Workspaces.forget()`：关闭连接、释放锁、`forgetWorkspace` 清理会话位置、从索引移除，不碰目录（docs/548）。
- `Workspaces.forget()` 对健康作品同样可用（WN-14 已验证可移除后重新打开）。

## 3. 方案

### 3.1 统一删除入口

两类作品都走 `DELETE /api/works/[workId]`。请求体 JSON `{ "deleteFiles": boolean }`；缺省或解析失败按 `false`（保持旧调用兼容）。正常作品菜单不再调用 `DELETE /api/novels/[id]`（该 Web 路由保留不改）。

健康作品需要 workId：新增查询端点 `GET /api/works/location?novelId=…` 或 `?workId=…`（dispatcher 中与 `/api/works/[id]` 同处特判），从 catalog 返回 `{ workId, novelId, path }`；找不到 → 404 `WORK_NOT_FOUND`。作品列表（`GET /api/novels`）不变，`UnavailableWork` 仍不含路径。路径只在对话框打开时按需读取并显示给作者本人，不写日志。

### 3.2 服务端：`Workspaces.forget(id, beforeCommit, options?)`

新增可选 `options.deleteFiles`。在 `serialize` 队列内：

1. 读 catalog，取 record（不存在 / inbox → 404，同现状）。
2. 忙检查（同现状）。
3. **删除文件预检**（仅 `deleteFiles`，在任何修改前）：
   - `lstat(record.path)`：`ENOENT/ENOTDIR` → 目录已不存在，记 `files='missing'`，继续只移出列表。
   - 存在则必须全部满足，否则抛 `ContentError('WORK_FILES_UNSAFE', <原因>, 409)`，列表、会话、目录都不改：
     - 目录本身不是符号链接，`realpath === record.path`，`dev/ino` 与 `record.identity` 一致（排除被替换、复制、改名的 `changed` 情况）；
     - 与应用数据根互不包含（复用 `assertWorkDataBoundary`）；不是 `/` 或用户主目录；
     - 恰有一个品牌作品清单（`readWorkBrand`），清单 `id === record.id`；
     - 若存在锁目录 `names.lock`：其 `owner.json` 的 host 为本机，且 pid 是本进程（自己的连接，第 4 步会关闭）或进程已结束；否则 → “作品正在其他程序中使用，无法删除文件”。
4. 原有步骤：关闭空闲连接 / 遗留连接 → `beforeCommit()`（会话）→ `catalog.update`。
5. `deleteFiles` 且目录存在：catalog 提交后，在同一队列里再次核对目录身份，然后用现有 `removeTree`（不跟随符号链接，逐层核对身份）删除整个目录（含目录本身）。
   - 成功 → `files='removed'`。
   - 失败（权限、文件被占用等）→ 不回滚列表（作品已移出，数据库连接已关闭），记 `files='kept'`，原因用固定中文文案“部分文件未能删除，请手动删除作品目录”。

返回 `{ record, files: 'kept-by-choice' | 'removed' | 'missing' | 'kept' }`。dispatcher 响应 `{ ok, workId, novelId, files }`；`deleteFiles=false` 时 `files='kept-by-choice'`。

顺序理由：预检在修改前，能避免“删了列表却拒绝删文件”的常见情况（被锁、被替换）；文件删除放在 catalog 提交之后，保证数据库连接已关闭、不会有请求重新打开它（`forgotten` 守卫已生效）。反向顺序（先删文件再移出列表）一旦移出列表失败，会留下一个列表中存在、目录已没的作品。

### 3.3 界面：`SidebarTree.tsx`

合并为一个对话框 `{ type: "delete-work"; novelId; workId?; title }`：

- 正常作品菜单“删除”→ 打开对话框，`GET /api/works/location?novelId=` 取 workId 与路径。
- 不可用作品菜单“删除”→ 打开对话框，`GET /api/works/location?workId=` 取路径。
- 路径未取到时该行显示“正在读取作品目录…”；读取失败显示“无法读取作品目录位置”，并禁用“删除，不保留文件”（“删除”仍可用）。路径用等宽小字、可选中、`break-all`。
- 按钮：`取消`（outline）、`删除`（outline）、`删除，不保留文件`（destructive）。进行中三个按钮都禁用，被点的按钮显示加载，对话框不能关闭；单次飞行沿用 `removeFlight`。
- 结果：
  - `kept-by-choice` → toast“作品已从列表中删除”
  - `removed` → toast“作品及其文件已删除”
  - `missing` → toast“作品已删除，作品目录已不存在”
  - `kept` → toast.warning“作品已删除，部分文件未能删除，请手动删除作品目录”
  - 成功后行为同现有不可用作品删除：关闭该 novelId 的全部 tab、若聊天草稿指向该作品则新开会话、invalidate `['novels']` 与 `['chat-conversations']`。
  - 404 `WORK_NOT_FOUND` 视为已删除（同 WN-50b）。
  - 其他失败：对话框内 `role="alert"` 显示服务端安全文案，保持打开。
- 删除原“删除小说”分支与 `deleteMutation`（`DELETE /api/novels/[id]`）在 SidebarTree 中的使用；世界删除不变。

### 3.4 不做

- 不移到废纸篓（用户选择永久删除）。
- 不改 `DELETE /api/novels/[id]` Web 路由及其他调用方。
- 不清理目录预留记录（docs/567 已使空目录可复用；目录被删除后预留自然不受保护）。

## 4. 风险

- 永久删除不可恢复：对话框显示完整路径；服务端多重身份核对；“删除，不保留文件”按钮为 destructive 且与“删除”分开。
- 目录中作者自己放入的其他文件也会被删除：这是“连目录一起删除”的语义，路径已显示给作者。
- 预检与删除之间目录被替换：第 5 步再次核对身份，`removeTree` 每层核对，失败停止并报 `kept`。
- 文件删除部分失败：作品已不在列表，目录残留，提示手动删除；残留目录若仍含存储文件，`protectedDirectories` 继续保护它，不会被误选为新作品目录。

## 6. 评审后修订（docs/608-work-delete-files-plan-review.md，结论“修改后通过”）

本节取代上文 §3.1、§3.2 中与之冲突的内容。

### 6.1 请求与路由（评审 8、9）

- `GET /api/works/location`：精确匹配 `url.pathname === "/api/works/location"`，放在 `/api/works/([^/]+)` 正则之前；只接受 GET。`GET /api/works/<uuid>` 仍为 404（WN-19 不变）。查询参数恰好一个 `novelId` 或 `workId`，否则 400。
- 这是作品路径首次发给渲染进程（作者本人的本机目录），只用于删除对话框：界面直接 `fetch`，不进 React Query 缓存，不写日志、toast 或错误文案。`GET /api/novels` 与 `UnavailableWork` 仍不含路径。
- `DELETE /api/works/[id]` 请求体：空 → `deleteFiles=false`（兼容）；非空则必须是严格 JSON `{ deleteFiles: false }` 或 `{ deleteFiles: true, path: string }`，否则 400 `INVALID_REQUEST`（不悄悄当作“否”）。`deleteFiles=true` 时 `path` 必须等于 catalog 中的路径，否则 409 `WORK_PATH_CHANGED`。

### 6.2 `Workspaces.removeWork(id, beforeCommit, { deleteFiles? })`

`forget()` 改为调用 `removeWork(..., {})`，行为不变。`removeWork` 在 `serialize` 内：

1. 读 catalog、取 record；路径核对；忙检查（同现状）。
2. **预检（只读，`deleteFiles`）**：
   - `lstat(path)`：`ENOENT/ENOTDIR` → `files='missing'`，其余步骤只移出列表；其它错误 → 409 `WORK_FILES_UNSAFE`。
   - 目录、非符号链接、`realpath===path`、dev/ino 与 `record.identity` 一致；不是挂载点（父目录 dev 相同）；不是 `/`、用户主目录；与应用数据根互不包含（评审 10）。
   - 清单：`readWorkBrand` 得到唯一清单，`id===record.id` 且 `novelId===record.novelId`（评审 13），保留观察对象用于删除中的 `assertCurrent()`。
   - catalog 中其他作品路径、目录预留路径都不得位于此目录内（评审 1）。
   - 全树扫描（`lstat`，不跟随链接）：任何条目 dev 与作品根不同 → 拒绝（评审 2）；任何子目录中含任一品牌的作品清单或应用标记 → 拒绝（未登记的嵌套作品、应用数据根）。
3. 关闭连接（同现状），但 `deleteFiles` 时**关闭失败即拒绝**：retire 返回 false 或遗留连接关闭失败 → 409 `WORK_FILES_UNSAFE`“作品数据库未能关闭，文件未删除”，走现有回滚（评审 3）。
4. 关闭后若锁目录仍存在：只允许“恰好一个 `owner.json`、本机 host、pid ≠ `process.pid` 且进程已结束”（Worker 与主进程同 pid，本进程 pid 一律视为在用，评审 3）；否则 409“作品正在使用，文件未删除”。
5. `beforeCommit()`、`catalog.update`（在现有 try/catch 内，失败照旧回滚）。
6. **提交后独立 try**（评审 4）：任何异常只得到 `files='kept'`，不回滚、不抛出。删除顺序（评审 5）：除清单与锁外的顶层条目逐个 `removeTree`（每个条目前 `guard()`：作品根身份 + 清单 `assertCurrent()`；递归时子目录 dev 必须等于根 dev）→ 锁目录 → 清单 → `rmdir` 根。中途失败时清单仍在。残留目录的保护：有创建预留的目录按预留长期受保护；没有预留（用“打开作品”加入）的目录由本进程的 `keptDeletions` 保护，应用重启后不再受保护（代码评审中2、复审）。

返回 `{ record, files: 'kept-by-choice'|'removed'|'missing'|'kept' }`。

### 6.3 界面文案修订（评审 6、11）

- `missing` → toast“作品已删除，未找到作品目录，没有删除任何文件”。
- 选“是”时收到 404 `WORK_NOT_FOUND` → “作品已从列表中删除”。
- `WORK_FILES_UNSAFE` / `WORK_PATH_CHANGED` 的服务端文案在对话框 `role="alert"` 中显示，作者仍可改选“否”。

### 6.4 已知、不处理（评审 12）

以前通过 `DELETE /api/novels/[id]` 删除的作品仍留在 catalog 中，界面看不到也无法移除，目录一直受保护。本次不处理。

## 5. 影响文件

- `desktop/service/workspaces.ts`（`forget` 选项、预检、删除）
- `desktop/service/dispatcher.ts`（请求体、`GET /api/works/location`）
- `src/components/layout/SidebarTree.tsx`（统一对话框）
- 测试：`tests/integration/faulted-work-removal.test.ts`（或新文件 `work-delete-files.test.ts`）、`tests/browser/works-loading.test.ts`
- `docs/requirements-traceability.json` 新增 WD-608

## 7. 文案修订（用户 2026-11-26）

用户实际使用后反馈“否”容易引起误解，改为：

- 只从玄印写作删除、保留文件的按钮：「删除」
- 连目录永久删除的按钮：「删除，不保留文件」
- 提示句：选「删除」只从玄印写作中删除，文件保留。

标题、问句、路径与按钮顺序（取消 / 删除 / 删除，不保留文件）不变；行为不变。
