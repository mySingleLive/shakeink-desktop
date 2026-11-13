# 561 · 保存开始后仍可停止/删除导入 测试用例

方案：`560-import-stop-after-save-plan.md`（含修订 R1–R8）。编号 SD-xx。单元用例用控制器夹具（`tests/unit/novel-import-abandon.test.ts`、`tests/helpers/novel-import-wizard-fixture.ts`）；集成用例用真实 Workspaces + PGlite（`tests/integration/`）；界面用例用浏览器夹具（`tests/browser/novel-import-abandon.test.ts`）。

## 主进程控制器（单元）

| 编号 | 场景 | 步骤 | 期望 |
|---|---|---|---|
| SD-01 | 保存失败后删除 | publish 第一次抛错 → `phase='failed'`、有 publication → `cancel` | 返回 `{view:null}`；草稿目录被删；`discardPublication` 被调用 1 次，参数含 requestId/title/importHash/target |
| SD-02 | 保存在途时删除 | publish 挂起 → `cancel`（不 await）→ 放行 publish 成功 | `cancel` 在 publish 结束后才返回；结果 `{view:null}`；草稿目录被删；`discardPublication` **未**调用（作品已完成，保留） |
| SD-03 | 保存在途、随后失败 | publish 挂起 → `cancel` → publish 抛错 | `discardPublication` 调用 1 次；草稿被删 |
| SD-04 | 清理失败兜底 | `discardPublication` 抛「作品目录正在使用」 | `cancel` 仍返回 `{view:null}`；草稿被删；响应含 `kept` 原因文案（含目录与原因） |
| SD-05 | 重启后的 publication 草稿可删 | SD-01 的草稿 close → 新控制器 initialize（`targetNeedsAuthorization=true`）→ `cancel` | 删除成功；不要求重新授权目录 |
| SD-06 | 删除期间新操作被拒 | SD-02 挂起期间 `act('resume')` | 抛「正在删除这次导入」；`current` 返回 `null` |
| SD-07 | `close()` 语义不变 | publication 草稿 → `controller.close()` | 草稿目录保留；`discardPublication` 未调用 |
| SD-08 | 排队的 resume 在删除后启动保存 | failed publication 草稿：先发 `resume`（publish 挂起），紧接 `cancel` | 删除等到该次 publish 结束；无残留 jobs；草稿被删 |
| SD-09 | 第 22 步继续保存不要求发送授权 | 向导走到 done，publish 第一次失败（`phase='failed'`）→ `resume`（不带 consent） | 不返回「重新允许发送」；publish 被再次调用；`phase='completed'` |
| SD-10 | 第 22 步重启后需重新授权目录 | SD-09 失败后重启 → `resume` | `phase='select'`，error=「请重新选择并授权原保存目录，再继续保存」；publish 未调用；`choose-target` 后 `resume` → completed |
| SD-11 | 计划哈希变化 | 手改日志使 `importPlanHash≠publication.hash` 后重启 → 授权 → `resume` | 抛/提示「保存计划已变化，请删除这次导入后重新导入」；之后 `cancel` 成功 |
| SD-12 | wizardRun 不新增保存入口 | 回归：NIW-C61 不变 | 第 21 步 `wizard-next` 仍是唯一首次保存入口 |
| SD-13 | 选择非空目录立即提示 | 目标目录含 `a.txt` → `choose-target` | 抛「请选择空目录」；`target` 不变 |
| SD-14 | 只有 `.DS_Store` 的目录可选 | 目标目录只含 `.DS_Store` → `choose-target` → 保存 | 选择成功；保存成功 |
| SD-15 | 恢复原目录不受空目录检查影响 | 已有 publication 且目标中已有本次半成品清单 → `choose-target` 选原目录 | 选择成功 |

## 服务端清理（集成，真实 Workspaces/PGlite）

| 编号 | 场景 | 步骤 | 期望 |
|---|---|---|---|
| SD-20 | `.DS_Store` 不阻止建书 | 目标只有 `.DS_Store` → `works.create` | 成功；`.DS_Store` 保留 |
| SD-21 | 从未预留 | 无预留记录 → discard | `{kept:'none'}`；目录不变 |
| SD-22 | 已登记作品 | 正常发布后 → discard | `{kept:'work'}`；catalog、目录、预留均不变 |
| SD-23 | 半成品清理 | initializer 在 `before-initialize` 抛错（目录有 creating 清单、database、assets、预留 pending）→ discard | `{kept:'none'}` 或 `cleaned`；目录只剩原有陌生文件（`.DS_Store`、`note.txt`）；预留记录已删；随后同目录再次 create 成功 |
| SD-24 | ready 未登记 | 在 `manifest-ready` 后抛错 → discard | 不删目录、不删预留；返回 `kept:'directory'` |
| SD-25 | 归属不符 | 清单 requestId 或 requestHash 不同 → discard | 不删任何文件；返回 `kept:'directory'` 及原因 |
| SD-26 | 目录身份变化 | 预留后把目录换成同名新目录 → discard | 不删新目录内容；删除预留记录 |
| SD-27 | 符号链接条目 | 半成品中 `assets` 替换为指向外部目录的符号链接 → discard | 外部目录内容不变；返回 `kept:'directory'` |
| SD-28 | 活动连接持有的锁 | 半成品目录锁属于本进程且 `works` 有该目录的连接 → discard | 不删；返回 `kept:'directory'` |
| SD-29 | 本进程遗留的锁 | 本进程 pid 的锁、无活动连接 → discard | 锁被删除，清理完成 |
| SD-30 | 中途失败可重试 | 注入 `database/` 删除失败 → discard → 再次 discard | 第一次 `kept:'directory'` 且清单仍在；第二次清理完成 |
| SD-31 | 准入与统计 | `stop-tasks` 进行中调用 discard | 被拒（主进程按 R2 兜底）；discard 进行中 `task-status.active≥1` |

## 界面（浏览器夹具）

| 编号 | 场景 | 期望 |
|---|---|---|
| SD-40 | 第 22 步保存失败 | 显示「保存作品」标题、目标目录、失败原因；有「选择目录」「继续保存」「停止导入」；**无**「允许并继续导入」及发送模型说明 |
| SD-41 | 第 22 步目录需重新授权 | 「继续保存」禁用并提示需重新授权；点「选择目录」发送 `choose-target` |
| SD-42 | 第 22 步停止导入 | 点「停止导入」→ 确认框 → 确认 → 发送 `cancel` 1 次，对话框关闭 |
| SD-43 | publication 草稿关闭窗口 | 点 × 或 Esc → 对话框收起，不发送 `cancel`，任务栏按钮仍在 |
| SD-44 | 保存中删除 | phase=publishing 点「停止导入」→ 确认后按钮显示「正在等待保存结束…」 |
| SD-45 | 清理兜底提示 | `cancel` 返回 kept 原因 → toast 显示「导入已删除；目标目录…留有未完成的文件」 |
| SD-46 | 旧版恢复保存页 | 非向导 publication 草稿的确认页有「删除导入」按钮，点后确认并发送 `cancel` |
| SD-47 | 原有用例回归 | IA-B06、IA-B08b、NICC-B13 按新规则更新：publication 草稿 Esc 只收起；「保存已开始」拒绝文案不再出现 |

## 真实目标系统（macOS 构建版，隔离数据根）

| 编号 | 场景 | 期望 |
|---|---|---|
| SD-50 | 复现截图状态 | 隔离根中放入合成 publication 草稿（step=done、`targetNeedsAuthorization`，目标仅含 `.DS_Store`）；打开导入窗口 | 第 22 步显示「保存作品」与三个按钮 |
| SD-51 | 继续保存成功 | SD-50 中选择原目录 → 继续保存 | 作品出现在列表；截图存证 |
| SD-52 | 停止导入 | 另一份同样草稿 → 停止导入 → 确认 | 导入窗口关闭；草稿目录删除；目标目录不变 |

不使用用户真实草稿与 Key；合成草稿不调用模型。

## 修订（依据 `562-…-cases-review.md`，2026-11-12）

本节替代上文中有冲突的内容。

### 定下的接口

- 服务 `novel-import-discard` 返回 `{state:'none'|'work'|'cleaned'|'kept',reason?:string}`。`none` 表示未预留，或预留的目录已不存在、身份已变（此时删除预留记录）；`work` 表示已登记作品；`cleaned` 表示半成品已删除；`kept` 表示目录保留，`reason` 为中文原因。
- 主进程 `cancel` 返回 `ImportResponse`，新增可选字段 `retained?:string`。`kept` 时值为「导入已删除；目标目录 {path} 留有未完成的文件：{reason}」；服务调用失败时同样按 `kept` 处理，`reason` 取错误信息。
- 目录锁规则：清理在 `works.serialize` 内执行，此时不会有建书在进行。锁的主机与本机相同、且 pid 等于本进程或进程已退出 → 视为遗留，删除；pid 为其他存活进程或主机不同 → `kept`。原 SD-28（活动连接持有锁）按现有代码构造不出来，删除；改为 SD-28′：锁的 pid 为其他存活进程（测试中用 `process.ppid`）→ `kept`。

### 修改的用例

- SD-10 使用 `consent:false`，并断言从未出现「请重新允许发送本次正文及设定范围」。
- SD-11 只改日志中的 `publication.hash` 字段。补 SD-11b：目录未授权且哈希不符时，先提示计划变化。
- SD-23 拆成 SD-23[before-initialize|domain-writing|database-committed]，参照 NI-W03 按阶段参数化，期望 `state:'cleaned'`。SD-24 拆成 [manifest-ready]，期望 `kept`（清单为 ready，未登记）。[catalog-committed] 期望 `work`。
- SD-26 期望 `state:'none'`，预留记录已删，新目录内容不变。
- SD-30 断言第一次失败后清单和预留记录都还在。
- SD-31 改为 worker 层（`tests/unit/novel-import-integration.test.ts` 的 `workerRig`）：discard 在途时 `task-status.active===1`；`stop-tasks` 等待它结束；`stoppingImports`/`closing` 时拒绝。
- SD-40～SD-44 改用向导界面夹具 `tests/helpers/novel-import-wizard-ui-fixture.tsx`。

### 新增用例

| 编号 | 层 | 场景 | 期望 |
|---|---|---|---|
| SD-16 | 单元 | 重启前 `publishing` 的草稿（恢复为 paused）→ `cancel` | 删除成功，调用 discard |
| SD-16b | 单元 | 同上 → 授权目录 → `resume` | 保存完成 |
| SD-17 | 单元 | discard 成功但草稿目录删除失败（含未知文件）→ 重启 → `cancel` | 第一次报「已保留」，会话已清空；重启后草稿恢复（有 publication），再次 `cancel` 时 discard 返回 `none` 或 `cleaned`，删除成功 |
| SD-18 | 单元 | `discardPublication` 抛「导入任务正在停止」或「本地服务正在关闭」 | 按 R2 兜底：`{view:null,retained:…}` |
| SD-19 | 单元 | 删除等待保存期间 `act('current')` | 返回 `{view:null}`；保存结束后草稿已删除 |
| SD-19b | 单元 | 删除等待保存期间调用 `controller.close()` | `close()` 等待删除结束（`abandonRun`），不会提前清空会话 |
| SD-20b | 集成 | 回归：`workspaces.test.ts:48`，含 `author.txt` 的目录仍抛 `/空目录/` | 不变 |
| SD-13b | 单元 | 已有 publication 时选择另一个非空目录 | 拒绝（「恢复保存必须重新授权原来的目录」或「请选择空目录」） |
| SD-13c | 单元 | 选择含其他作品清单的目录 | 「请选择空目录」 |
| SD-32 | 集成 | 旧品牌名（`LEGACY_NAMES`）清单的半成品 | 按其 names 清理，`cleaned` |
| SD-33 | 集成 | 半成品目录中有 `restores/`、`.<uuid>.tmp`、`note.txt` | `.tmp` 被删；`restores/`、`note.txt` 保留；返回 `kept` |
| SD-34 | 单元·谓词 | `deletableImport` / `abandonableImport` 真值表：source、running、paused、failed、publishing、completed、discarded，各分有无 publication | `deletable` 仅 completed/discarded 为假；`abandonable` 与旧实现一致 |
| SD-35 | 单元·接线 | `desktop/main/index.ts` 中 `discardPublication` 经 `businessGate.run` 调用 `novel-import-discard`（AST 抽取，参照 NI-L04） | 调用方法名与参数一致 |

### 必须更新的旧用例

| 用例 | 原断言 | 新断言 |
|---|---|---|
| `tests/unit/novel-import-abandon.test.ts:127` IA-12 | `cancel` 抛「保存已开始」 | 拆成：IA-12a 重启后恢复同 id 并 retry 成功（不调用 cancel）；IA-12b 由 SD-01 覆盖删除 |
| `tests/helpers/novel-import-ui-fixture.tsx:44` `cancelMode:'publication'` | 抛旧拒绝文案 | 改为 `cancelMode:'retained'`：返回 `{view:null,retained:'导入已删除；目标目录 /合成/目录 留有未完成的文件：作品目录正在使用'}` |
| `tests/browser/novel-import-abandon.test.ts:97` IA-B08b | 对话框留在原处并提示拒绝 | 改为 SD-45：对话框关闭，toast 显示 retained 文案 |
| `tests/browser/novel-import-abandon.test.ts:101` NICC-B13 | 确认后被拒、返回导入 | 改为：确认后对话框关闭；toast 显示 retained 文案；`busy` 为 0 |
| `tests/unit/novel-import-close-confirmation.test.ts:22` NICC-02 | publication 不弹确认 | **不变**，作为 R1 回归：publication 草稿关闭时只收起 |
| `tests/unit/novel-import-pdf-source-text.test.ts:135`、`tests/unit/novel-import-volumes.test.ts:68` | 「保存已开始，请保留原导入计划并重试」 | **不变**（`ni.ts:562` 保留） |
| `tests/browser/novel-import-wizard.test.ts:214`、`:248` | 无 publication 时「停止导入」直接删除，不弹确认 | **不变** |

### 界面回归（新增）

- SD-47a：publication 草稿点「开始新导入」→ 重新打开当前导入，不进 replace 页（IA-B04b 不变）。
- SD-47b：publishing 时 × 和「收起」都只收起，任务栏按钮可见。
- SD-47c：「导入完成」页没有「停止导入」。

### 真实目标系统

- SD-50 的合成草稿不手写。在隔离根中用控制器夹具（真实 Workspaces 发布）跑到第 22 步，并在 `before-initialize` 注入失败，这样会同时产生预留记录和半成品。再用构建版打开该隔离数据根。拷贝数据根后先移出 `inbox/.shakeink-lease-recovery.json`。
- SD-52 断言目标目录中的 `.DS_Store` 仍在，半成品已删除，预留记录已删除。
- 台账按实际执行情况记录：真实系统只记录 SD-50～52 实际走过的路径。
