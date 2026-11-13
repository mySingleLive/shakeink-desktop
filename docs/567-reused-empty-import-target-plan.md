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
