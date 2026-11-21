# 567 删除作品后重用已清空目录导入方案 · 独立审核

日期：2026-11-13。审核对象：`docs/567-reused-empty-import-target-plan.md`，并参照了 `docs/568-reused-empty-import-target-cases.md`。行号按当前工作树（HEAD `bd2f779`）。本次未修改任何源文件。

结论：**有条件通过**。根因判断正确，方案只改 `protectedDirectories()`，改动面小，旧请求不会删除新作品的文件。需要补上的有：存储内容判定漏了应用根标记；安全论证里最关键的“旧 pending 请求遇到新作品”没有对应用例；用户约束的解读需要写明。

## 一、根因核对

| 方案声明 | 核对结果 |
| --- | --- |
| `chooseTarget` 用 `[root, ...protectedDirectories()]` 做双向重叠检查 | 属实，`desktop/main/novel-import.ts:2054`。`restoring` 只豁免原会话 `sameTarget` 的同一路径。 |
| `protectedDirectories()` = 作品列表路径 ∪ 预留目录 | 属实，`desktop/service/workspaces.ts:164`；`directories()` 不区分 `pending`/`complete`（`work-creation-reservations.ts:57`）。 |
| `complete` 预留永不删除 | 属实。`mutate` 只建或改为 `complete`（`:36-39`）；`release` 只删 `pending`，遇到 `complete` 直接抛错（`:54`）。 |
| `forget()` 只删列表行 | 属实，`workspaces.ts:364` 只过滤 catalog，不碰预留和目录。 |
| 中途停止的 `pending` 预留同样会挡住目录 | 属实。只有 `discardImportCreation` 会释放预留（`:276,280,304`），也就是删除导入时。 |

补充：用户约束里“新建作品”这一半现在已经满足。新建作品走 `create-work`（`desktop/main/index.ts:789-796`）和对话建书（`conversation-runtime.ts:29`），都直接调用 `works.create`，不读受保护列表。`create` 只检查目录是否为空（`workspaces.ts:209-212`）。所以 bug 只出在导入向导，与 568 中“RT-08 修复前即通过”的说明一致。方案的“问题”一节应写明这一点。

## 二、安全性核对

### 旧 pending 预留在恢复或丢弃时，会不会删除同一目录中新作品的文件：不会

设旧请求 R1 的预留为 pending，目录为 D；新导入 R2 在 D 中建成作品 B。

- 新请求不会撞上旧预留。导入的 `requestId` 就是会话 `s.id`（`novel-import.ts:2703`），新会话的 id 是 `randomUUID()`（`:1933`）。预留按 `requestId` 哈希作键（`work-creation-reservations.ts:10`），所以 R2 的 `reserve` 不会和 R1 冲突。
- `discardImportCreation(R1)`：catalog 中没有 R1，找到 R1 的预留，目录身份相同，读到 B 的清单后发现 `requestId` 不符，返回 `kept('目录已属于其他作品')`（`workspaces.ts:283-284`），不删除任何文件。如果 R2 已预留但还没写清单，R1 只会走 `!names → release`（`:280`），释放的是 R1 自己的预留。`create` 和 `discard` 都经过 `this.serialize`（`:175,265`），两者不会交错执行。
- 旧会话 R1 恢复保存：`chooseTarget` 判定为 `restoring`，所以不做空目录检查。`checkTargetEmpty` 看到清单就放行（`novel-import.ts:2696`）。之后 `create(R1)` 读到 B 的清单，`requestId` 不符，抛 `REQUEST_CONFLICT`（`workspaces.ts:214`）。`importLeaseTarget(R1)` 同样因为 `requestId` 不符而抛错（`:172`）。这条路径会失败，并且失败时不改动任何文件。
- 旧 `complete` 请求 A 重放 `create`：列表中已没有 A，目录非空且清单属于 B，抛 `REQUEST_CONFLICT`。方案写的“报‘创建作品需要空目录’”不准确，只有目录里没有清单时才报这一句。568 的 RT-09 已经接受这两种结果。

### protectedDirectories 的其它调用者：放宽后没有覆盖作品数据的风险

- 来源扫描（`novel-import-files.ts:110,161`，`novel-import-source-picker.ts:114`，`novel-import.ts:1928,2025,2049`）：放宽后可以从已清空的旧目录读来源。如果之后把这个目录选作保存目录，`chooseTarget` 的 `s.files.some(within…)` 仍会拒绝。
- 文件导出（`file-export-target.ts:13-25`，`index.ts:273,395`）：`workRoots` 本来就只拦作品内部文件名，而且会沿祖先目录查找 `workManifest`/`appMarker`，与受保护列表无关。旧目录里只要还有清单，照样受保护。
- 配置导出（`configuration-files.ts:92-96`，`index.ts:386`）：这里拦截整棵子树，放宽后可以把配置文件写进空的旧目录。写入后目录非空，以后选它做保存目录会被空目录检查拒绝。这是预期内的影响。

## 三、问题与修改要求

### 中1：判定漏了应用数据根标记 `shakeink-app.json`/`xuanxiang-app.json`

方案的前缀规则只认带点的 `.shakeink`/`.xuanxiang`，而 `appMarker` 不带点（`brand-names.ts:9-10`）。预留目录以后可能变成旧的应用数据根（例如作品删除后，用户把数据根迁到这个空目录，再迁走，旧根被保留）。当前数据根由 `dataRoot`/`bootstrapPath` 保护，不受影响。对旧根来说，配置导出没有沿祖先检查 `appMarker`，所以放宽后可以写入旧根，甚至覆盖其中的文件，例如 `catalog.json`。

要求：判定中加入两族 `appMarker`。更简单的写法是对顶层条目统一匹配 `/^\.?(shakeink|xuanxiang)-/`，同时覆盖 `workManifest`、`storage`、`storageRequired`、`appMarker` 和所有点前缀条目。RT-05 要补上这一项。

其余条目核对完整。作品目录里由本应用写入的条目有：
- `workManifest`（`workspaces.ts:225,244`）
- `assets`（`:229`，`workspace-assets.ts:24`）
- `database`（`:406,415`）
- `storage`（`work-storage.ts:29`）
- `storageRequired`（`workspace-storage.ts:11`）
- `lock/owner.json`（`workspaces.ts:63-87`）
- `audit` 和 `leaseTemporaryPrefix*.tmp`（`work-lease-recovery.ts:100,224`）
- `restores/<id>`（`work-storage.ts:38,61`；数据库可能迁到这里，方案已经覆盖）
- 原子写临时文件 `.<uuid>.tmp`（`versioned-store.ts:26`）

`migrationStagePrefix`/`rootRecoveryPrefix` 只出现在应用根（`data-root.ts`），多列进判定没有坏处。导入图片和会话文件写在应用根的 `novel-imports/` 下，不进入保存目录。

### 中2：安全论证中最关键的路径没有用例

568 的 RT-09 只测了旧 `complete` 请求重放。方案“为何安全”第一条说的是旧 `pending` 请求遇到新作品，这条没有用例。需要新增：
- RT-07 的状态下，用新 `requestId` 在 D 上建成 B，然后：
  - `discardImportCreation(R1)` 返回 `kept`，B 的全部文件和清单不变，R1 的预留仍在；
  - `importLeaseTarget(R1)` 抛错；
  - `create(R1)` 抛 `REQUEST_CONFLICT`。
- 控制器层：旧会话 R1 带 `publication`、`target` 为 D 时恢复保存，结果失败且 D 不变。

### 低1：用户约束的解读要写进方案

用户说的是“为空**或**不含本项目作品存储文件”。方案的处理是：目录里只有用户自己的文件时，不再报“重叠”，但仍按现有规则报“请选择空目录”（RT-13）。这与现有的“创建作品需要空目录”规则（`workspaces.ts:212`，`novel-import.ts:2054`）一致，我认为合理。但方案正文要明确写出“非空目录仍按空目录规则拒绝，本次不改”，并说明这是对用户约束的解读，免得验收时出现分歧。

### 低2：pending 预留不再在预留那一刻占住目录

现在 `create` 先 `reserve`，再写清单（`workspaces.ts:223-225`）。改后，这段时间内 D 为空，也还不在列表中，于是不受保护，另一个导入向导可以在此时选中 D。这种情况不会造成数据错误：后到的请求在 `create` 时读到对方的清单，抛 `REQUEST_CONFLICT`。代价是用户到保存时才看到报错，而不是选目录时。可以接受，方案在“为何安全”里注明即可。

### 低3：每次调用都要读所有预留目录

预留只增不减。改后 `protectedDirectories()` 每次都要逐个 `readdir`，每次来源扫描、导出、选目录都会触发。外置盘或网络盘挂起时可能卡住，读失败则按方案保守处理为受保护。建议：
- 每个目录只做一次顶层 `readdir`，并发读取所有目录；
- 不递归；
- 方案写明这里的开销与预留数量成正比。

## 四、其它阻挡点检查

- `reserve` 按 `requestId` 作键，新会话使用新 id，不冲突（见第二节）。
- `restoring`/`sameTarget`（`novel-import.ts:320,2054`）只作用于带 `publication` 的原会话，新会话不受影响。`canRestoreAnalysis` 对新会话不成立。
- `checkTargetEmpty`（`:2694-2697`）和 `create` 的空目录检查都忽略 `.DS_Store`，与 RT-03 一致。
- `assertWorkDataBoundary` 只检查与当前应用根是否重叠，与旧预留无关。
- `forget` 后，内存中的 `forgotten`/`slots` 以作品 id 为键（`workspaces.ts:357-360`），新作品 B 的 id 不同，不受影响。

改完以上判定后，修复 `protectedDirectories()` 就能放行这个场景，没有发现别的阻挡点。
