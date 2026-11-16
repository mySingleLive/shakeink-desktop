# 567 · 删除作品后重新导入到同一（已清空）目录报“保存目录不能与来源或应用目录重叠” 技术方案

## 问题（用户 2026-11-11）

删除一本作品后再导入同一小说，选择原来的（已清空的）保存目录，第 1 步报：
`Error invoking remote method 'desktop:novel-import': Error: 保存目录不能与来源或应用目录重叠`。

约束：导入或新建作品时，所选目录为空或不含本项目作品存储文件，即使以前用过/导入过，也允许继续使用。

## 根因

- `desktop/main/novel-import.ts` `chooseTarget` 用 `[root, ...protectedDirectories()]` 做重叠检查。
- `protectedDirectories()`（`desktop/service/workspaces.ts:164`）= 作品列表路径 ∪ `WorkCreationReservations.directories()`。
- 建书/导入时写入的目录预留（`systemConfig` 键 `desktop:work-creation-reservation:*`）在完成后变为 `complete`，永不删除；`forget()` 只删列表行，不碰目录与预留（删除时“不改动目录文件”是既定要求 WN-01）。
- 因此已删除作品的目录永远留在受保护列表里，即使目录已被清空。中途停止的导入若预留未释放（`pending`），同样阻挡该目录。

## 方案

只改 `Workspaces.protectedDirectories()`：

1. 作品列表中的路径：始终受保护（不变）。
2. 预留路径且不在作品列表中：仅当该目录**仍含本项目作品存储内容**时才受保护。判定（顶层条目，任一品牌族 `BRAND_NAMES`）：
   - 名称匹配 `/^\.?(shakeink|xuanxiang)-/u` 的任何条目（评审 1：覆盖两族 `appMarker`、`workManifest`、`storage`、`storageRequired`、`lock`、`audit`、`restores`、`preserved` 及三种前缀）；
   - `database`、`assets`（预留目录中这两项只可能由本应用写入）；
   - 原子写临时文件 `/^\.[0-9a-f-]{36}\.tmp$/`。
   - 目录不存在（`ENOENT`/`ENOTDIR`）→ 不受保护；其它读取错误 → 保守地受保护。
   - `.DS_Store` 等其它条目不算作品内容。用户约束的解读（评审 3）：目录只有用户自己的文件时不再报“重叠”，但仍按现有规则报“请选择空目录”。
   - 开销（评审 5）：每个不在列表中的预留只读一次顶层目录，并发读取。
3. 预留记录本身不删除、不修改：`complete` 预留继续服务建书请求重放幂等；`pending` 预留的恢复/丢弃逻辑不变。

### 为何安全

- 新导入写入新 `requestId` 的清单；旧 `pending` 请求若之后恢复，`importLeaseTarget`/`discardImportCreation` 读到清单 `requestId` 不符 → 拒绝或 `kept('目录已属于其他作品')`，不会删除新作品文件。
- 旧 `complete` 请求重放 `create()` 时，列表中已无该作品 → 读到新作品清单，报 `REQUEST_CONFLICT`“此目录属于其他建书请求”，失败封闭（评审更正）。
- 新导入 requestId 由 `randomUUID()` 生成，不会撞旧预留。
- 只有新建作品不读该列表（直接 `works.create`），本缺陷仅出现在导入向导。
- 预留刚写、清单未写的瞬间目录不再受保护：后到请求在建书时报 `REQUEST_CONFLICT`，不损坏数据（评审 4，接受）。
- 含存储文件的旧目录仍受保护，`open`（打开作品目录找回）不受影响（`open` 不使用该列表）。
- 其它调用者（来源扫描、导出、配置文件、选择器）的受保护集合对空的旧目录放宽，这些目录中没有作品数据可被覆盖。

### 备选（未采用）

- `forget()` 时删除 `complete` 预留：改变删除“只动列表”的语义，且对目录被手动清空、中途停止的 `pending` 预留无效。
- 在 `chooseTarget` 里对空目录跳过重叠检查：会让来源扫描/导出等仍把空旧目录当受保护，规则分散，也容易误放行应用数据根。

## 影响文件

- `desktop/service/workspaces.ts`（`protectedDirectories` 及一个私有判定函数）
- 新测试 `tests/unit/reused-import-target.test.ts`
- `docs/requirements-traceability.json` 新增 NI-19

## 补充 2R（用户 2026-11-11 决定）：作品列表中的路径

实测发现：侧边栏普通“删除”只把小说标为 `DELETED`（`desktop/handlers/novels/[id]/route.ts:129`），作品仍留在作品列表（`catalog.json`），目录预留之外它本身就挡住该目录。只有异常作品的“删除”才走 `forget()`。因此仅放宽预留不能修复用户的实际路径。

用户选择：作品列表中的路径也只在目录仍含作品存储时受保护；在该目录新建作品时，把指向同一目录的旧列表记录移除，侧边栏不出现同目录的两部作品。

1. `protectedDirectories()`：列表路径与预留路径用同一判定 `holdsWorkStorage`（读取失败保守受保护）。这取代上文“列表路径始终受保护”及用例 RT-04b 的原期望。
2. `create()` 登记新作品时（`catalog.update` 同一次写入），移除 `path === canonical` 且 `id !== 新 id` 的旧记录。走到登记时目录中只有本请求的清单（空目录新建，或本请求的半成品续建），旧记录的数据已不在目录中。
3. 旧记录的清理与 `forget()` 一致，放在登记写入前：
   - 有运行中任务（slot `active>0`）→ 拒绝 `WORK_BUSY`，新作品不登记，数据库已写入的半成品留给本请求续建/丢弃；
   - 空闲连接退役，加入 `forgotten`；
   - 通过可选钩子 `Workspaces.onStaleWork(id)`（由 `configureConversationTransfers` 设为 `manager.forgetWorkspace`）把旧作品的会话位置标为删除；未配置（单测）时跳过。
   - 钩子失败 → 新作品不登记，抛错；旧记录与 `forgotten` 复原。
4. 不变：`open()`、`forget()`、`discardImportCreation`、`importLeaseTarget`、目录预留记录。

## 补充 3R（真实目标发现，用户 2026-11-11 选择“读完 JSON 后释放”）

RT-R1 实测：清空目录后第二次导入保存报“原目录中的作品《…》仍有任务在运行”。调试输出证明旧作品的 slot `active=2`，来自两个未被读取正文的本地请求：侧边栏删除 `DELETE /api/novels/:id`（成功时不读正文）与删除后的 `GET /api/novels/:id`（404，不读正文）。`desktop/service/index.ts` 的 `start()` 在 `works.runWithGlobal(workspace, …)` 内一直等到渲染层读完正文（`complete`）才退出，所以作品数据库一直被占用，直到重启。这是早于本次修复的问题，也会让 `forget()` 报 `WORK_BUSY`。

修复（只改 `start()`）：
1. 非流式响应（`content-type` 不含 `text/event-stream`，且不是 `toTextStreamResponse` 的 `text/plain` 流）在作品作用域内一次读完正文，上限 8 MiB；超限按原流式路径处理。
2. 读完后立即退出作用域，`responses` 中放一个读取缓冲区的读取器，`read`/`cancel` 协议与帧格式不变。
3. 流式响应（对话、生成、测试生成）保持原行为：作用域持续到读完或取消。
4. 读取正文失败 → 与原 `read` 失败一致，请求失败。

测试：`tests/unit/service-local-response-release.test.ts`（真实 Worker 不必要；直接以导出的 `start/read` 或抽出的纯函数测试）——JSON 响应在未读取时作用域已释放；事件流响应在读完前作用域仍占用；超过上限的 JSON 走流式；帧拆分与 `done` 不变。

### 2R 审核处理（docs/569 补充审核 2R）

- 中1：`retireStaleWorks` 先等待全部退役，再在同一段同步代码中完成忙碌检查与 `forgotten.add`。
- 中2：`open()` 登记时同样移除同目录、不同 id 的旧记录（同一套退役、会话钩子与失败复原）。
- 中3（保留顺序并记录）：会话钩子仍在 `catalog.update` 之前执行，与 `forget()` 一致。若改到写入之后再失败，账本中会留下指向未登记作品的会话，`GET /api/chat/conversations` 会对全部作品报错。代价：钩子部分成功或随后登记失败时，旧记录复原但部分会话已标为删除；`forgetWorkspace` 幂等，重试可完成。旧作品的会话随旧记录一起移除，与侧边栏删除异常作品的行为一致（WN-01）。
- 低1：退役时 `$disconnect`、`engine.close`、`unlock` 各自独立执行，任何一步失败都不跳过关闭引擎。
- 低2：`staleWorkHook` 不得在 `gate.run` 内调用 `create`/`open`/`forget`/`discardImportCreation`（注释已写明）。
- 低3：接受，不修改。

### 3R 审核处理（docs/569 补充审核 3R）

- 中1（早于本项，未处理）：从未被读取正文的响应会一直留在 `responses` 中直到关闭服务，占用 256 个请求名额之一并保留缓冲正文。需要用户决定处理方式，本项不改协议。
- 中2：新增 LR-07/LR-08，从 `desktop/service/index.ts` 源码抽出真实 `start()` 测试：JSON 回复在正文未读时已释放作品作用域；事件流在读完前保持作用域。LR-07 对改前的 `start()` 失败。
- 低：按 Content-Type 判定流式、缓冲期间不检查取消信号（与原行为一致）、最坏内存 256 × 8 MiB，均接受。
