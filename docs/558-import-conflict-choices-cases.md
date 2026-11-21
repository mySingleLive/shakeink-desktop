# 558 · 导入校验冲突的展示与解决方案 测试用例

对应方案：`docs/557-import-conflict-choices-plan.md`（含「审核后修订」R2–R12）。全部为合成数据，真实书目只在 CC-40 以后使用隔离数据根。

## 控制器（`tests/unit/novel-import-conflict-choices.test.ts`，向导夹具 `legacySceneFixture` + `fullAi`）

复核模型在首个复核包里返回一条冲突，之后的定向复核（自动修复）仍报同一冲突，使其留给作者。

| 编号 | 输入 | 期望 |
|---|---|---|
| CC-01 | 复核返回 `type:'body-body'`、引用本包角色资料、`field:'text'` | 入库后 `type==='setting-body'`，`entity` 为资料名称，`kind==='character'` |
| CC-02 | 复核返回冲突，`source` 无 artifactId，`candidate.artifactId` 指向本包资料 | 两侧交换；`source.artifactId` 为该资料，`source.value` 为资料当前值 |
| CC-03 | 复核返回两侧都没有 artifactId 的冲突 | 不入库，`verify.droppedConflicts` 加 1 |
| CC-04 | 复核返回带 `reason` 的冲突（350 字） | 入库 `reason` 为前 300 字；`view.conflictDetail.reason` 相同 |
| CC-05 | 冲突待处理时读取 view | `conflictDetail` 存在：`index===1`、`total` 等于待处理数、`fieldLabel==='内容'`、`kindLabel==='角色'`、`current` 为资料实时 text、`evidence[0].location` 含章名且不含 `working-`；`choices` 含 `inferred/source/merge` 且都可用 |
| CC-06 | 选择 `inferred` | 资料 text 等于候选值；冲突 `resolved`、`resolution==='inferred'`；有 decision；锁存在；一致性行 `ok`；`phase==='select'`；决定期间没有新的模型请求；`wizard-next` 后 `completed`，发布的资料 text 为候选值 |
| CC-07 | 选择 `source`，不填解释 | 资料不变；一致性行 `ok`；无模型请求；保存完成，发布的 text 为原值 |
| CC-08 | 选择 `merge`，`mergedText:'作者填写'` | 资料 text 为「作者填写」；保存后发布值相同 |
| CC-09 | 两条待处理冲突（不同资料） | 解决第一条后 `phase==='conflicts'`、`conflictDetail.index===1,total===1`；解决第二条后 `phase==='select'` 且一致性行 `ok` |
| CC-10 | 同一资料同一字段两条待处理冲突 | 一次决定后两条都 `resolved`，decisions 增加 2 条 |
| CC-11 | 决定（`source`）后执行 [修复]，复核仍返回同一冲突 | 冲突不重新打开；一致性行仍 `ok`；保存完成 |
| CC-12 | 对 v2 字段 `backstory` 决定（`merge`）后，注入一个失败复核包再 [修复] | 复核请求不因锁报错（R2）；该包成功后一致性行 `ok` |
| CC-13 | 资料 text 长 2500 字的冲突 | `inferred` 不可用且有原因；提交 `inferred` 被拒绝，会话不变 |
| CC-14 | `roleType` 冲突，候选值「地点/山脉，非角色」 | `inferred` 不可用；`merge` 不可用；`source` 可用且提交后保存完成 |
| CC-15 | `parentId` 冲突，候选值等于资料自身 ID | `inferred` 不可用 |
| CC-16 | `merge` 填空白 | 拒绝「请填写合并后的设定」，会话不变 |
| CC-17 | 复核运行中提交决定 | 拒绝，会话不变 |
| CC-18 | 前面步骤留下的 `body-body` 冲突，资料 ID 在 candidate 侧 | 详情 `current` 为该资料实时值；`inferred` 写入的是另一侧的值；保存完成 |
| CC-19 | 第 21 步提交 `rewrite` | 仍生成正文修改提案（NIW-C19/F2 行为不变） |
| CC-20 | 决定后 `coverage.review` | 与决定前相同 |

## 适配层（`tests/unit/novel-import-verify-review.test.ts` 追加）

| 编号 | 输入 | 期望 |
|---|---|---|
| CC-21 | `normalizeReviewReply` 收到带 `reason` 的冲突 | 输出保留 `reason`；非字符串 `reason` 被去掉 |
| CC-22 | 向导复核请求带 v2 字段锁（`backstory`）且值一致 | 不抛「语义锁定字段或基础版本无效」 |
| CC-23 | 同上但值不一致 | 仍抛该错误 |
| CC-24 | 向导复核契约 | 含 `reason` 说明句；VS-09 其余断言不变 |

## 界面（`tests/browser/novel-import.test.ts` 追加，UI 夹具推送带 `conflictDetail` 的向导视图）

| 编号 | 输入 | 期望 |
|---|---|---|
| CC-30 | 带详情的冲突视图 | 标题含「第 1 / 2 处矛盾」；主句含资料名、类别、中文字段名；显示「矛盾点：…」；两栏标题为「现在的设定」「按正文应为」；差异以 `del`/`ins` 标出；依据显示章名，不显示 `working-` |
| CC-31 | 三个方案 | 单选各带说明；默认不选中；未选时确认按钮禁用 |
| CC-32 | `inferred` 不可用 | 该单选 `disabled`，旁边显示原因 |
| CC-33 | 选 `merge` | 出现预填现值的文本框；清空后确认禁用 |
| CC-34 | 提交 `source` | 发出 `{type:'resolve',choice:'source'}`，不含必填解释；没有「正在复核」提示 |
| CC-35 | 点「返回校验」 | 回到第 21 步校验页 |
| CC-36 | 非向导会话（无详情） | 仍为旧界面，NI-U06 通过 |

## 真实目标系统

| 编号 | 输入 | 期望 |
|---|---|---|
| CC-40 | 开发构建、隔离数据根、《诡秘之主》第一卷（小丑）走到第 21 步并出现待处理矛盾 | 「处理矛盾」界面显示中文字段名、矛盾说明、差异和章名（截图） |
| CC-41 | 同一会话的三处矛盾分别选「以正文为准」「保留」「自己填写」 | 每次提交即时完成；一致性行通过；保存作品成功；读回作品中三项值分别为候选值、原值、填写值 |

## 审核后修订（对应 `558-import-conflict-choices-cases-review.md`）

- **真实保存（must-fix 1）**：`tests/integration/novel-import-verify-publish.test.ts` 增加 `CC-06..08 real publish`，三种方案各一条，经真实 `publishNovelImport` 写入 PGlite，断言 `assertSaved`、`resolution`、锁存在，并从数据库读回角色 `bio` 等于决定后的值。
- **CC-12（must-fix 2）**：每个复核请求同时交给真实 `runImportAi`（桩生成器），锁检查实际执行；先注入 `backstory` 冲突，再决定、清空复核覆盖并恢复。已验证：撤回 R2 修复时本例失败，恢复后通过。
- **R11（must-fix 3）**：CC-25（ID 显示为名称，含 JSON 内部；复核运行时不出详情）、CC-26（位置回退「原文」）。过期值由 `conflictDetail` 始终取资料实时值实现，CC-18 覆盖实时值来源。
- **R4/R8/R9**：CC-28（结构字段 `relationships` 不能自己填写，决定后 [修复] 不报错并可保存）、CC-29（可修复的 body-body 冲突被自动修复，不交给作者）、CC-27（两侧都无资料只提供保留，并可保存）。
- **反向用例**：CC-31（已解决冲突再提交报「冲突决定已过期」；推断值去掉知识标注；超长自己填写被拒且会话不变）。CC-13（不可用方案提交被拒）、CC-16（空白填写）、CC-17（复核运行中）已有。
- **CC-15** 保留用角色 `characterId` 指向自身：该字段在角色字段表中，`REFERENCE_FIELDS` 判定与 kind 无关。
- **提示词快照**：仅 `legacy-scene:review////wizard-review-v1/` 一条变化，已更新；`capture-novel-import-prompt-golden.ts --check` 通过。
- **NIW-C60/NIW-C19**：沿用。第 21 步 `rewrite` 仍由服务端接受（CC-19）。
- **CC-40/41 真实运行**：若自动修复后剩余矛盾少于三处，或部分只能「保留」，则对现有矛盾按「以正文为准 → 保留 → 自己填写」轮换；剩余方案在合成用例中已覆盖。读回方式沿用 `lotm-verify-save-driver` 的 `readback.mjs`。
