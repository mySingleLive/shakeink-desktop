# 543 · 导入结果质量测试用例（对应 542 方案）

编号 IQ-xx。“单元”测试位于 `tests/unit/novel-import-result-quality.test.ts`，“集成”测试位于 `tests/integration/novel-import-result-quality-publish.test.ts`，“浏览器”测试位于 `tests/browser/content-tabs-render.test.ts`。

## A. 批注去除

| ID | 层 | 输入 | 期望 |
|---|---|---|---|
| IQ-01 | 单元 | 文本开头 `（可靠性：人物推测；信息来源：甲；适用时间范围：早期）\n正文` | 结果为 `正文` |
| IQ-02 | 单元 | 半角括号、单独成行、句尾、只含其中一个标签（如 `(信息来源: 叙述者)`）、标签“信息归属/适用时段” | 全部去除，相邻空白规整，正文字符不变 |
| IQ-03 | 单元 | 正文括号 `（他说：可靠吗？）`、`（信息来源不明的传言）`、`（可靠性很差）`、引号内 `“可靠性：高”` | 原样保留 |
| IQ-04 | 单元 | 剥离后再剥离 | 幂等 |
| IQ-05 | 单元 | 推断产物 text 和非结构 facts（personality、appearance、trigger、content 内文本等）带批注，经过 `runImportAi` | 返回的产物已剥离；reliability/attribution/temporalScope 这几个 facts 保留；证据仍能定位 |
| IQ-06 | 单元 | `origin:'source'` 的原资料带批注形态文字 | 不改写 |
| IQ-07 | 单元 | `projectDetailedOutlines`：推断细纲带 reliability | chapter.outline 等于 a.text，无前缀；`validateDetailedOutlines` 通过 |
| IQ-08 | 单元 | 旧会话：chapter.outline 已带前缀（旧形态） | `validateDetailedOutlines` 通过（兼容）；发布写出的 outline 无批注 |
| IQ-09 | 集成 | 发布包含 character/scene/item/world(WORLD+SETTING 各类型)/worldline/narrative/outline/theme/style/goldenFinger/trope/foreshadow 的推断产物，均带 reliability/attribution/temporalScope | 读回全部作者可见文本字段，不匹配批注模式；文本与 artifact.text 一致；telling.reliability 与 ref.reliability 保留；ref.source 为 `导入语义关系：<kind>` |
| IQ-10 | 集成 | 发布门禁：推断产物剥离后仍残留批注（构造绕过：直接写入 session） | 发布抛错并回滚，作品不写入 |
| IQ-11 | 集成 | 章节正文和原资料含 `（信息来源：…）` | 发布成功，原文保留 |
| IQ-12 | 集成 | 长文本（>100000 字）事件和讲述卡 | 分页不再扣前缀长度，各页拼接等于原文 |

## B. 多标签性能

| ID | 层 | 输入 | 期望 |
|---|---|---|---|
| IQ-20 | 浏览器 | 真实 ContentTabs 加计数面板夹具，40 个 tab；激活 t20 | 只有 t0（原活动）和 t20 两个面板渲染一次，其余面板渲染次数为 0 |
| IQ-21 | 浏览器 | 打开新 tab（store.openTab） | 已有面板渲染次数为 0，只有新 tab 渲染 |
| IQ-22 | 浏览器 | moveTab 拖动非活动 tab；closeTab 非活动 tab | 剩余面板渲染次数为 0；活动面板实例与草稿保留（实例号不变） |
| IQ-23 | 浏览器 | renameNovelTab 修改某个 novel tab | 只有该面板重新渲染 |
| IQ-24 | 浏览器 | 原 TABS-08 等 content-tabs 全部用例 | 继续通过 |
| IQ-25 | 真实 | LOTM 第一卷作品，60 个角色 tab 和 122 个角色加正文 tab（`profile-tabs.mjs`） | 打开和切换耗时不随 tab 数增长（后 10 次的均值不超过前 10 次的 1.2 倍）；同一 tab 数下低于基线；无 >200 ms 长任务 |

## C. 主题定位

| ID | 层 | 输入 | 期望 |
|---|---|---|---|
| IQ-30 | 单元 | 篇幅：9999/10000/49999/50000/299999/300000/741017 字 | 依次为微型、短篇、短篇、中篇、中篇、长篇、长篇 |
| IQ-31 | 单元 | themeProfile 请求校验：缺 settings 通道、带 intent、kind 不是 theme | `validateSemanticRequest` 拒绝 |
| IQ-32 | 单元 | 合法定位产物（男频/奇幻/["西方奇幻","蒸汽朋克","克苏鲁"]，卖点、受众、简介，证据可定位） | 解析成功，schema 为 2；profile 解码出 7 个字段 |
| IQ-33 | 单元 | channel 为“都市频” | 修复回复删除 channel、genre、tags 并计数；产物仍保留卖点和受众 |
| IQ-34 | 单元 | genre 不属于该频道（女频/玄幻）；tags 中有不在候选内的已知标签和自由标签 | genre 与 tags 规则同 `positionError`：不合法的已知标签丢弃，自由标签保留（与主题面板一致） |
| IQ-35 | 单元 | sellingPoints 超过 2000 字、synopsis 超过 500 字、tags 超过 20 个 | 严格解码失败，经修复后丢弃该项 |
| IQ-36 | 单元 | prompt：themeProfile 请求包含 `<theme-profile-contract>` 及频道/题材/标签候选；普通 theme 批次 prompt 不变 | golden 检查通过（新增条目，旧条目不变） |
| IQ-37 | 单元（向导） | 主题批次全部完成后发出 1 个定位请求；该请求的 artifacts 只包含已采纳的主题产物 | 定位产物与批次产物一起原子采纳；主题任务 done |
| IQ-38 | 单元（向导） | 定位请求两次都失败 | 主题任务 done；dropped 中有“主题定位未能推断”；没有定位产物 |
| IQ-39 | 单元（向导） | 全部批次 notFound；或只复制原资料 | 不发定位请求 |
| IQ-40 | 单元（向导） | world 重导入（retryKind world） | 定位产物随主题产物一起清除 |
| IQ-41 | 集成 | 发布带定位产物 | Theme 的 channel/genre/length/tags/sellingPoints/targetAudience/synopsis 都已写入；authorPosition 为 null；joined 简介中不含定位产物 |
| IQ-42 | 集成 | 无定位产物、主题全文超过 5000 字 | synopsis 为截断到 5000 字的拼接（字符边界），length 仍写入 |
| IQ-43 | 集成 | 发布后经 `upsertTheme`（作者保存）以原值保存 | 成功，不报“最多选择/不适用”错误 |
| IQ-44 | 单元 | importPlanHash：定位产物变化 | 指纹变化 |

## D. 回归与真实目标

| ID | 层 | 期望 |
|---|---|---|
| IQ-50 | 全量 | Node 24 下 `npm test` 与 535–541 基线相比无新增失败；`npm run typecheck`、`npm run build` 成功 |
| IQ-51 | 真实 | 《诡秘之主》第一卷完整向导导入并保存（verify 驱动），读回作品：抽查角色 bio、场景、物品、世界设定、事件、讲述卡、细纲、伏笔、主题、文风、金手指、爽点/泪点，全部不含批注模式 |
| IQ-52 | 真实 | 同一作品的主题：channel 为男频或女频，genre 合法，length 为长篇，tags 非空且合法，sellingPoints 和 targetAudience 非空；主题面板截图可见 |
| IQ-53 | 真实 | 同一作品在新 build 上执行 IQ-25 |

## E. 按审核（543-…-cases-review.md）与代码审核（544）修订

本节与前文冲突时，以本节为准。

- **H1**：IQ-32 的合法样例改为 `男频/奇幻/["西方奇幻","蒸汽朋克","烧脑"]`（烧脑属于男频风格）。IQ-34 改用其他题材的已知子类（东方玄幻）作为反例，修复时丢弃；自由标签（雾都）保留。
- **H2**：544 H2 之后 `clean()` 不再抛错，“门禁”只做剥离兜底。IQ-10 改为：推断物品的文本带批注，发布后读回已剥离（`IQ-05/IQ-10/IQ-11`）。跨行批注、未闭合批注原样保留，且不阻断保存（IQ-46）。
- **H3**：IQ-37 的期望改为：
  - 定位请求恰好 1 个，字段为 `phase analyze/kind theme/settings 通道/themeProfile:true`，无 intent；
  - 请求的 artifacts 包含本次主题批次产物；
  - 采纳后会话中恰好有 1 个 `import-theme-profile`（schema 2，origin inferred），并与主题产物一起出现。

  原子回滚由 settings 分组的既有原子采纳保证（NIW 既有用例），本次不另加用例。
- **H4**：以方案为准，计数使用 `clearedPosition`（IQ-48），提示文案为“N 处主题定位不合规已清除”。修复规则如下：
  - channel 不合法：删除 channel/genre/tags；
  - genre 不在该频道内：保留 channel，删除 genre/tags。这里有意偏离方案的“频道也删”：频道合法时保留它，作者面板可以显示；
  - 已知标签但不在当前候选内：丢弃，自由标签保留；
  - tags 超过 20 个：修复截断到 20 个；
  - sellingPoints/targetAudience/synopsis 超长：严格解码失败，修复后该项丢弃。修复不截断这三个字段，丢弃后主题任务仍为 done（IQ-35）。
- **M1/M2**：
  - IQ-05：剥离同样覆盖 JSON 散文事实（IQ-47），content 的嵌套结构保持不变；quote 不剥离（IQ-05 断言 evidence 不变）；
  - 原资料全链路不改写：新增 IQ-11b，覆盖源主题、源角色 bio；
  - 发布时主题拼接不再对整体调用 clean，每条推断主题单独剥离。
- **M5**：主题任务部分批次失败时，importSettings 先抛出批次错误，不会发定位请求（沿用既有失败路径）。
- **M6**：夹具改动见 `tests/helpers/content-tabs-fixture.ts`：Panel 渲染计数（非 StrictMode），以及 `open`/`move`/`renders`/`clearRenders`。限制如下：
  - registry 和 StagedSaveSurface 被替换，只验证 ContentTabs/TabPanelHost 层的隔离；
  - react-query 失效引起的面板内重渲染不在本次范围内，由真实目标 IQ-25 观测；
  - IQ-23 用夹具的 `rename`（只替换命中 tab 对象，其余保持原引用），与 `renameNovelTab` 的语义相同。
- **M7 回归口径**：
  - `npm test` 结果与 `/private/tmp/shakeink-verify-539/full-1.txt` 按测试名逐项比较；
  - 浏览器用例单独运行：`node --import tsx --test tests/browser/content-tabs.test.ts tests/browser/content-tabs-render.test.ts tests/browser/content-tabs-preparation.test.ts tests/browser/ai-caption-drag.test.ts`；
  - 向导夹具的 fallback 对 themeProfile 返回 `{notFound:true}`，按 analyze 规则视为未能推断。计数类用例（SP-12b、SP-14）只统计非定位请求和非“主题定位”记录。
- **M10 真实目标**：
  - 驱动为 `/private/tmp/shakeink-quality-542/launch-quality.mjs <label>`，基于 539 verify 驱动，只选第一卷“小丑”，隔离根 `~/shakeink-test-roots/cache-522`，每次全新会话；
  - 读回 `evidence/<label>/quality-readback.json`：对作品全部作者可见文本做全量扫描（角色、场景、物品、世界、设定、伏笔、爽点泪点、主题、卷、细纲、规划事件与讲述卡），用 `IMPORT_KNOWLEDGE_ANNOTATION` 统计命中数，期望为 0；
  - 主题判据：`novelPositionSchema.safeParse` 成功；length 为“长篇”；sellingPoints 与 targetAudience 非空；截图为 `theme-panel.png`；
  - IQ-25/53：`/private/tmp/shakeink-tabs-542/profile-tabs.mjs <label> <count>`，`MODE=chapters`。基线 label 为 `baseline-60b`、`baseline-ch60`。判据针对 open 和 switch：122 个 tab 时，后 10 次打开的均值不超过前 10 次的 1.2 倍，且每个 tab 数下都低于对应基线。
- **M11**：在台账中追加 NI-18。
- **E2E 修订（q-r8，2026-11-10）**：真实回复的卖点或简介超长时，整项丢弃会导致定位全部丢失。改为修复时按字符边界截断，并计入 `clearedPosition`（IQ-35b）。修复后若严格解码仍失败，依次清除 tags、genre、channel，其余字段保留。严格解码本身（IQ-35）不变。
