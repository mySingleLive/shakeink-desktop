# 568 · 删除作品后重用已清空目录导入 测试用例

方案：`567-reused-empty-import-target-plan.md`（以评审后版本为准）。编号 RT-xx，台账 NI-20（NI-19 已由第 16 步规划冻结工作占用）。评审 `568-reused-empty-import-target-cases-review.md` 的必须项与中低项已全部纳入（标 R）。测试文件 `tests/unit/reused-import-target.test.ts`，使用真实 `Workspaces`（PGlite + `prisma/migrations`），临时目录隔离，只用合成标题。

## 单元（真实 Workspaces）

| 编号 | 场景 | 步骤 | 期望 |
|---|---|---|---|
| RT-01 | 删除后清空目录可重用 | `create` 作品 A 到目录 D → `forget(A)` → 清空 D | `protectedDirectories()` 不含 D |
| RT-02 | 删除后目录仍有作品文件 | 同 RT-01 但不清空 D | `protectedDirectories()` 含 D |
| RT-03 | 只剩 `.DS_Store` | 清空 D 后写入 `.DS_Store` | 不含 D |
| RT-04 | 列表中的作品目录始终受保护 | `create` A 到 D，不删除 | 含 D |
| RT-04b（R，2R 修订） | 列表作品目录被清空 | `create` A 到 D，不删除，清空 D 并放 `.DS_Store` | 不含 D；`chooseTarget` 接受 D（用户 2026-11-11 选择：列表路径也按目录内容判定） |
| RT-05 | 残留存储文件逐项受保护 | 删除后清空 D，再分别放入单个条目：两族 `appMarker`（方案评审 1）、`workManifest`/`storage`/`storageRequired`/`lock`/`audit`/`restores`/`preserved`、`leaseTemporaryPrefix`/`migrationStagePrefix`/`rootRecoveryPrefix` 前缀条目、`database`、`assets`、UUID `.tmp`、`.shakeink-unknown`、`.xuanxiang-unknown`（R）；另以目录形式放 `database/`、`assets/`、`.shakeink-unknown/`（R） | 每种情况都含 D |
| RT-06 | 目录已不存在 | 删除后 `rm` D；再把 D 换成普通文件（ENOTDIR，R） | 两种都不含 D；不抛错 |
| RT-07 | 中途停止的 pending 预留 | 只调用预留 `reserve`（pending）指向空目录 D | 不含 D；`discardImportCreation` 对该请求返回 `none` 并释放预留（行为不变） |
| RT-07b（R） | 旧 pending 请求不能破坏新作品 | R1 pending 预留指向空 D，R2 在 D 建成作品 B | `discardImportCreation(R1)` 返回 `kept('目录已属于其他作品')`；`importLeaseTarget(R1)` 报“原导入目录请求不匹配”；以 R1 重放 `create` 报 `REQUEST_CONFLICT`（方案评审 2）；D 文件名与 B 清单字节不变；R1 预留仍在 |
| RT-08 | 重用后新作品可建成 | RT-01 之后用新 `requestId` 在 D 上 `create` 作品 B | 成功；B 进入列表；`protectedDirectories()` 含 D |
| RT-09 | 旧请求不能破坏新作品 | RT-08 之后以作品 A 的原 `requestId`/标题重放 `create` | 拒绝且报“此目录属于其他建书请求”（R）；D 文件名与 B 清单字节不变 |
| RT-10 | 读取错误保守处理 | 预留目录 D 存在但不可读（`chmod 000`，非 root） | 含 D |
| RT-13（R） | 只有他人文件的旧目录 | 删除后清空 D，放 `notes.txt` | 不含 D；`chooseTarget` 报“请选择空目录，用于保存导入的作品”，不报重叠（现有空目录规则，本次不改） |

RT-08 在修复前即通过（`create` 不读受保护列表），只作回归。

## 控制器（novel-import chooseTarget）

| 编号 | 场景 | 期望 |
|---|---|---|
| RT-11 | 选择被清空的旧目录 | 控制器 `protectedDirectories` 取真实 `Workspaces.protectedDirectories()`（RT-01 状态），`chooseTarget` 返回 D | 不报“重叠”；`view.targetReady === true`，`view.targetLabel === D`（非向导夹具下为完整路径；R） |
| RT-12 | 仍含作品文件的旧目录 | RT-02 状态 | 报“保存目录不能与来源或应用目录重叠” |

## 补充 2R（方案补充 2R：列表中的路径）

| 编号 | 场景 | 步骤 | 期望 |
|---|---|---|---|
| RT-14 | 普通删除（软删除，仍在列表） | 建 A → 小说标 `DELETED` → 先不清空，再清空 D → 新建 B 到 D | 清空前含 D；清空后不含 D，`chooseTarget` 接受；B 登记后列表只有 B；钩子收到 A 的 id；`run(A)` 报“作品不在本地目录索引中”；含 D |
| RT-15 | 会话钩子失败 | A 在列表，清空 D，钩子抛错，新建 B | 拒绝；列表仍只有 A；去掉钩子后重试成功，列表只有 B |
| RT-16 | 旧作品正有任务 | A 的 `run` 未结束，清空 D，新建 B | `WORK_BUSY`；列表仍只有 A |
| RT-17 | 不影响其它目录的作品 | 另一目录有作品 K；D 上 A 清空后建 B | 列表为 K 和 B；K 的目录仍受保护 |

## 回归

- `tests/unit/work-creation-reservations.test.ts`、`novel-import-stop-after-save.test.ts`、`novel-import-abandon.test.ts`、`backup-removal-service.test.ts`、`conversation-create-guard.test.ts`
- 全量 `npm test`（Node 24）、typecheck、`build:desktop`。

## 真实目标

| 编号 | 场景 | 期望 |
|---|---|---|
| RT-R1（R） | 构建版应用，隔离数据根：导入一部合成小说到 D 并保存 → 删除作品 → 用 Finder 清空 D → 重新导入，选择 D | 第 1 步不出现重叠错误，显示目录名，可继续（截图）。仅复制正文，无需模型 |
| RT-R2（R） | 同上但不清空 D | 仍报“保存目录不能与来源或应用目录重叠”（截图） |
