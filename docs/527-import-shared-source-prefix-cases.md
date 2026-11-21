# 527 · 导入共享原文前缀用例（522 第二步）

依据 `526-import-shared-source-prefix-plan.md`（修订 1 + §3A）。合成数据，不含真实正文或 Key。单元测试：`tests/unit/novel-import-shared-source.test.ts`；金样：`tests/fixtures/novel-import-prompt-golden.json`（改前生成）。

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| SS-01 金样 | 改动前，用固定合成请求为下列类型各生成提示词并冻结：classify、structure、角色/物品/世界观 roster、角色/物品/世界观 entity、世界观节点 entity、场景 roster/links/cleanup/ownership/parent、review、patch、lines(worldline/narrative)、settings、touches、outline | 改动后对**不带 `sharedSource`** 的同一请求，`importAiPrompt` 与 `serializeImportAiPayload` 输出与金样逐字节相同。 |
| SS-02 布局形状 | 带 `sharedSource` 的角色 roster | 提示词以 `SHARED_HEAD+'<novel-import-data>{"sharedSource":['` 开头；载荷顶层键依次 `sharedSource,extra,task`；`task` 无 `units` 键，其余键与旧载荷一致；数据块之后为旧阶段说明（不含数据）。 |
| SS-03 窗口逐字节一致 | 同一会话、同一窗口 k，分别构造角色/物品/世界观 roster 与以 k 为主窗口的三类 entity 请求 | 六个提示词的公共前缀长度 ≥ `SHARED_HEAD+'<novel-import-data>{"sharedSource":['+窗口k序列化` 的长度。 |
| SS-04 转义 | 单元正文含 `</novel-import-data>` 与 `<x>` | 新布局载荷内 `<`/`>` 为 `<`/`>`，提示词中 `</novel-import-data>` 恰出现一次；`JSON.parse` 后文本还原；旧布局同一请求不转义（与金样相同）。 |
| SS-05 预算 | 新布局 roster 一窗（40,960 字）与 entity 主窗+补充 | `assertImportFixedPromptReserve`、`assertImportPayloadBudget` 通过；`fixed` 字节数 = 旧布局 fixed + `SHARED_HEAD` 字节数 ±常数（分隔符）。 |
| SS-06 服务端校验 | `runImportAi` 收到：等式正确；窗口顺序错/缺单元/多单元/重复/`index` 非递增；`kind:'scene'`；`intent:'touches'`；`phase:'review'`；缺 `semanticVersion`；同时带 `sceneIdentity`/`executionLane`/`sceneParentTargets`；entity 目标为 `entityType:'WORLD'` | 第一项进入生成；其余在生成与模型解析之前抛固定错误（不含 id/正文），`generate` 0 次。 |
| SS-07 会话门 | 新建向导会话（1M 模型）；旧日志无 `promptLayout`；`SHAKEINK_PROMPT_LAYOUT=legacy`（测试根下）新建；`promptLayout:'other'` 的日志 | 第一项写入 `'shared-source-v1'`；第二项 resume/patch/revise 后仍无该字段、`importScopeHash`/`importPlanHash` 与改前相同；第三项无字段；第四项加载失败（日志校验）。 |
| SS-08 运行门 | 带字段会话但 `profile.characters` 分别为 16,384（256K）、40,960、81,920；非向导会话；无 `budgetPolicy` | 仅 81,920 且向导、v2 时生成 `sharedSource`；其余请求与旧布局相同。 |
| SS-09 规范窗口 | 合成 100 个单元（长度不等，含单元 > 窗口的一半） | 窗口只在单元边界切、每窗 ≤40,960 字且 ≤`maxUnits`、覆盖全部单元恰一次；重复计算结果相同；`workingRevision` 变化后重算。 |
| SS-10 roster 分批 | 新布局 roster，3 窗 | 恰 3 个请求，每个 `sharedSource.windows` 为单窗且 `units` 等于该窗；coverage 完成后步骤 done。 |
| SS-11 拆分重试 | 某窗批次首次抛 `ROSTER_OUTPUT_RETRYABLE` 匹配错误 | 两个子批不带 `sharedSource`、提示词为旧布局；并集等于原窗。 |
| SS-12 残缺窗口续跑 | 某窗口前半已 coverage、中断后续跑 | 该窗剩余单元走旧布局分批；其余完整窗口仍带 `sharedSource`。 |
| SS-13 entity 主窗口 | 实体在窗口 2 提及 5 次、窗口 0 提及 3 次 | `sharedSource.windows` 为 `[{index:2,…}]`，`units` 前段等于窗口 2 全部单元（原顺序，不排序）。 |
| SS-14 补充优先级 | 首次提及单元在窗口 0；`evidenceUnitIds` 指向窗口 1 单元；有资料文件切片；另有窗口 3 命中单元；预算只够部分 | `extraUnitIds` 顺序为 首次提及→引用→资料切片→其余（提及数降序），满足字数与 `maxUnits`，不含主窗口单元。 |
| SS-15 entity 回退 | 无提及窗口（只有资料切片）；世界观节点；场景 entity | 不带 `sharedSource`，提示词与旧布局相同。 |
| SS-16 entity 校验不变 | 新布局角色 entity，模型返回 `optionIndex` 证据与直接 `unitId/quote` 证据 | 与旧布局相同的结果；`evidenceOptions` 基于完整 `request.units` 计算。 |
| SS-17 纠错前缀 | 新布局请求首代结构失败 | 第二代提示词以第一代提示词为前缀（只在末尾追加）。 |
| SS-18 用量日志 | 调试开启，新布局与旧布局各一代 | `layout` 分别为 `'shared-source-v1'`、`null`；非白名单值记 `'?'`。 |
| SS-19 既有验证 | `novel-import-character-source-index.test.ts`、`scripts/verify-novel-import-close-states.mjs` 解析器 | 对新旧两种载荷都能取到 entityTarget/intent/kind/units；原断言保持。 |
| SS-20 回归 | 全量 `npm test`、`npm run typecheck`、`npm run build:desktop` | 无新增失败（与 524 后的 44 项失败基线对比）。 |
| SS-SIM 离线模拟 | 私有脚本用真实构造函数对 base-r1 会话生成全部 roster+entity 提示词 | 报告新书口径命中率（目标 ≥70%）、未命中按“窗口首发/补充单元/task 尾部”拆分、证据覆盖中位与 P10、首次提及覆盖率。 |
| SS-REAL 真实首跑 | 第一卷，角色+场景+物品+世界观，新会话，失败重试 ≤3；随后 `SHAKEINK_PROMPT_LAYOUT=legacy` 冷基线一次 | 全部成功；按 526 §3.3 对比质量（条目数 ±5%、facts 字段数均值 ≥95%、evidence 条数均值 ≥90%、text 长度中位 ≥90%、纠错代次率/证据拒绝率 ≤基线+5pp）；token-usage 对比与 DeepSeek 后台对账；不达标回退保守版本。 |
