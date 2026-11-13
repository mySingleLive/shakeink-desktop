# 542 · 导入结果质量：去除可靠性批注、多标签性能、主题定位推导

日期：2026-11-10。用户要求（导入成功后作品中的问题）：

1. 导入推导出的大量文案都带有“（可靠性：XXX；信息来源：XXX；适用时间范围：XXX）”批注，要全部去除并确保不再出现。
2. 右侧内容面板打开大量 tab（约 50 个以上）后应用明显卡顿，需要优化。
3. 主题里的频道、题材、篇幅、核心卖点、目标受众等基本信息都没推导出来，这些都应能推导。

约束：解决全部问题并防止复现；用《诡秘之主》第一卷（小丑，213 章）做真实导入测试。

## 1. 现状与根因

### 1.1 批注文本

- 来源：`desktop/core/novel-import-semantics.ts` 中的 `qualifyImportKnowledgeText` 和 `qualifyImportWorldContent`。它们把 `facts.reliability/attribution/temporalScope` 拼成 `（可靠性：…；信息来源：…；适用时间范围：…）\n` 前缀，加在每个推断产物的原生文本前面。
- 写入位置：
  - `novel-import-publish.ts` 中的角色 bio、场景 description、物品 description、世界 description、世界设定 content 的每个文本字段、伏笔 content、爽点/泪点 content、主题 synopsis、文风 style、金手指 trigger/ability/limitation、卷大纲、世界线事件 fact、讲述卡 intent/reveal、ref.source；
  - `novel-import-outline.ts` 中的章级细纲 `chapter.outline`，再经发布写进 Chapter.outline 和章节卡 intent。
- 证据：vf-r3 会话 2304 个产物中，非原资料产物几乎都带 reliability/attribution；截图 `016-nav-work-expanded.png` 的作品悬浮卡与角色简介都以“（可靠性：…”开头。模型返回的 text 本身不含该批注（离线扫描 0 条），批注全部由应用拼接。
- 结论：可靠性、归属、时段已有结构化去处：`facts` 保存在导入记录 `ContentVersion(NOVEL_IMPORT)` 的快照里；讲述卡 telling 和 ref 另有原生 `reliability` 字段。正文前缀既不必要，又污染作者可见文案和后续 AI 上下文。

### 1.2 多标签卡顿

- `ContentTabs` 为保留 Monaco 实例和草稿，把每个 tab 的面板都留在 DOM 中，只用 `hidden` 切换，这个设计保留。
- 但是 `tabs.map(tab => <div …><StagedSaveSurface tab={tab}>{renderTabContent(tab)}</StagedSaveSurface></div>)` 写在 `ContentTabs` 函数体里。`ContentTabs` 订阅了 tabs、activeTabId、novel 列表、抽屉状态，任何打开、切换、拖动、关闭或标题变化都会让全部 N 个面板重新渲染（`renderTabContent` 每次返回新元素，所有面板组件都没有 memo）。
- 实测（同一 LOTM 第一卷作品，隔离根，LotmVerification.app，见 §4）：打开 60 个角色 tab 时，每次打开从 99 ms 增加到 150 ms；角色加正文共 122 个 tab 时，每次打开从 150 ms 增加到 200–267 ms，每次切换 200–252 ms。CPU 剖面中 React 协调占切换忙时一半以上，并随 tab 数线性增长。

### 1.3 主题定位未推导

- 发布时只执行 `tx.theme.update({synopsis: joined('theme')})`：把所有主题产物的 text 用空行拼接写入简介（vf-r3 中有 48 段、6518 字），channel/genre/length/tags/sellingPoints/targetAudience 保持空值。
- 主题导入任务（`importSettings` kind=theme）按批分析，产物只允许 knowledge 字段（`IMPORT_SEMANTIC_FACT_FIELDS.theme`），没有任何定位字段的提示或校验，所以从结构上就不可能推导出这些属性。
- 篇幅（WIZARD_LENGTHS）可以由导入正文的总字数确定性计算；频道、题材、标签、卖点、受众需要对全书主题做一次汇总推断。

## 2. 修改

### 2.1 去除批注（发布与细纲投影）

- 删除 `qualifyImportKnowledgeText`、`qualifyImportWorldContent` 和配套的 `assertImportWorldContentProjectionBudget` 前缀计数；改为原文直出：
  - 发布：上述各字段一律写 `a.text`、`n.description`、`n.content`、`a.facts.trigger/limitation` 原值；
  - `chunks(a.text, 100000)` 不再扣除前缀长度；
  - ref.source 写 `'导入语义关系：'+kind`（happen/mention/recall），不再附带知识前缀；
  - 世界设定 content 原样写入 `n.content`（`importNativeMappings` 已完成规整与可见性校验）。
- 细纲：`novel-import-outline.ts` 的 `text()` 改为直接返回 `a.text`。`validateDetailedOutlines` 用同一函数比较，保持一致。
- 世界投影容量门：`novel-import-semantic-state.ts:52` 改为用空 knowledge 计数，相当于只校验 content 本身的容量，不再为前缀预留空间。
- 结构化保留：可靠性、归属、时段继续保存在会话 artifacts.facts、导入记录快照，以及 telling/ref 的原生 `reliability` 字段中，不丢失任何信息。
- 防复现：新增断言，在发布结果的所有作者可见文本字段中搜索批注模式 `/[（(]\s*(可靠性|信息来源|适用时间范围)[：:]/u`，命中即失败。该模式同时作为发布前门禁：发布事务中写入的任何文本若命中，就抛错并回滚。这样即使模型自己在 text 里写出同样格式的批注，也会在发布前清除，见下一条。
- 模型自写批注：`stripImportKnowledgeAnnotations(text)` 只去除整段落形态的批注，即位于文本开头、或单独成行、或句尾的括号块，且括号内只含“可靠性/信息来源/信息归属/适用时间范围/适用时段”这些标签及其值。正文引文（chapter.content）不经过该函数。发布时对推断产物的文本字段统一调用一次，门禁再兜底一次。
- 已保存的旧作品不做迁移（不改动用户已有数据库）。验收说明：旧作品需重新导入，或手动编辑。

### 2.2 多标签性能

- `ContentTabs`：抽出 `TabPanelHost = memo(({tab,prefix,active}) => …)`。`tab` 是 tabs store 里的同一对象引用，打开、切换、拖动或关闭别的 tab 时引用不变。因此每次只有可见性变化的两个面板重新渲染，其余面板跳过。
- 保持不变：所有面板仍保留实例（Monaco、草稿、未保存修改），`hidden` 语义、`role=tabpanel`/`aria-labelledby` 关联、StagedSaveSurface 包裹都不变。
- 只有当一个 tab 本身的记录改变时（例如重命名作品，`renameNovelTab` 生成新对象），该面板才会重新渲染。这一行为和以前一致。

### 2.3 主题定位推导

- 新增 wizard 主题定位步骤，紧接在主题任务完成之后，作为同一主题任务的最后一个请求（复用 `wizard-settings-v1` 通道和轻量策略）：
  - 输入：本次全部主题产物（name 与 text，按预算截取）、文风产物摘要、正文开头若干单元（预算内）以及确定性计算的篇幅。请求 `intent:'profile'`、`kind:'theme'`，units 为正文开头样本，用于证据定位。
  - 输出契约：`themeProfile:{channel,genre,tags:[],sellingPoints,targetAudience,evidence:[{unitId,quote}]}`。
    - channel 只能取 男频/女频/不限；
    - genre 只能取该频道的 `genresForChannel` 值或“全部”；
    - tags 只能取 `positionTagGroups(channel,genre)` 的候选，最多 POSITION_TAG_LIMIT 个；
    - sellingPoints 与 targetAudience 为非空可读文本，各不超过 2000 字；
    - 不返回 artifacts/notFound。
  - 校验（服务端 `novel-import-ai.ts`）：zod 严格结构；channel/genre/tags 经 `positionError`；不合法的 tag 丢弃并计数；channel 或 genre 不合法时置为“不限”/“全部”并计数；evidence 至少 1 条、可定位，不可定位的丢弃，全部无法定位则整次失败并重试（沿用 settings 的单次重跑）。
- 篇幅（本地计算）：按导入章节正文字数 `Array.from(content).length` 的总和，对应 `WIZARD_LENGTH_META`：<1 万为微型，1–5 万为短篇，5–30 万为中篇，>30 万为长篇。LOTM 第一卷共 741017 字，计为长篇。说明：篇幅指已导入内容的规模，不推测全书。
- 存放：结果写入 `w.themeProfile`（wizard 状态，严格 schema）。重试、跳过或世界重导入（retryKind world）时与主题产物一起清除。
- 发布：
  - `tx.theme.update` 写入 `synopsis`、channel、genre、length、tags、sellingPoints、targetAudience；
  - 不写 `authorPosition`。它表示作者已确认，导入推导不等于作者确认，作者在主题面板保存后才会写入；
  - 写入前用 `positionError` 校验，失败则只写篇幅和文本字段，频道和题材保持空。
- 简介：不再把 48 段主题全文直接拼接。`synopsis` 改为汇总请求同时返回的 `synopsis` 字段（不超过 500 字的一段作品简介）；汇总失败时退回原有拼接，此时也已去除批注。主题产物全文仍完整保存在导入记录中。
- 非向导旧会话（wizardVersion 不是 1）：保持原行为（只写 synopsis），另外加写篇幅。
- 校验步骤：`novel-import-wizard-checks.ts` 不新增阻断项；定位缺失只在主题任务的 dropped 记录里提示（“频道/题材未能推断，已留空”）。

## 3. 影响面与不变项

- 不改：导入向导各步骤的顺序与 UI 批准设计、模型调用通道上限、复核与自动修复（docs/539）、正文内容。
- prompt golden（`tests/fixtures/novel-import-prompt-golden.json`）：新增 profile 请求的条目，其余条目不变。
- 现有测试中断言前缀的用例（novel-import-semantic.test.ts NI-SEM04、novel-import-semantic-publish.test.ts、lotm-local-import-audit.test.ts，以及 scripts/audit-*、real-novel-semantic-assertions、verify-lotm-scenes-persistence）按新规则修订为“原文直出且无批注”。
- 工作区中尚未提交的 539–541 修改全部保留，本次在其基础上修改。

## 4. 验证计划

- 单元：去批注函数（各种位置与形态、不误删正文括号）、发布无批注门禁、细纲直出、主题 profile 校验（合法/非法 channel、genre、tag，证据定位）、篇幅阈值、wizard 状态 schema。
- 集成：PGlite 发布后读回所有文本字段无批注；主题 7 个字段写入；authorPosition 为空。
- 浏览器：content-tabs 夹具新增“非活动面板渲染次数”断言（打开、切换第 N 个 tab 时，其它面板不重新渲染），并保留 TABS-08 实例保留断言。
- 真实目标（隔离根 `~/shakeink-test-roots/cache-522`，LotmVerification.app）：
  - 《诡秘之主》第一卷完整向导导入并保存（verify 驱动），读回主题、角色 bio、世界设定、细纲、事件、讲述卡，确认无批注，且主题 7 个字段非空、合法；
  - 打开 60 和 122 个 tab，测量 open/switch/typing；目标是每次打开和切换不随 tab 数增长（同一 tab 数下低于基线），无 >200 ms 长任务。
- 全量 `npm test`、`npm run typecheck`、`npm run build` 在 Node 24 下执行。

## 5. 按审核（542-…-plan-review.md）修订

本节与前文不一致处，以本节为准。

- **H1 门禁范围**：去批注函数与发布门禁只作用于推断或确认产物（`origin!=='source'`）所投影的字段。章节正文 `chapter.content` 和原资料复制产物保持原文，不检查、不改写。
  - 门禁检查的字段：角色 bio，场景、物品、世界的 description，世界设定 content 中的全部文本，伏笔 content，爽点/泪点 content，主题 synopsis/sellingPoints/targetAudience，文风 style，金手指的三段，卷大纲，事件 fact，讲述卡 intent/reveal/source，以及映射到推断细纲的 Chapter.outline。
- **H2 不新增 intent**：主题定位改为一个 schema 2 的主题产物，id 为 `import-theme-profile`。
  - 请求：`phase:'analyze',kind:'theme',executionLane:'wizard-settings-v1'`，intent 仍为 undefined，另加请求字段 `themeProfile:true`。
  - 涉及的位置：
    - 共享类型；
    - `validateSemanticRequest`：只允许 v1、analyze、kind theme、settings 通道、无 intent；
    - payload 序列化加入 `themeProfile`；
    - `semanticResultArtifact`：themeProfile 请求下赋 schema 2；
    - `settingsItemValid`：改用 semanticResultArtifact；
    - prompt 增加 `<theme-profile-contract>`，允许字段为 theme 的 v2 字段；
    - `IMPORT_SEMANTIC_V2_FIELDS.theme=['channel','genre','tags','sellingPoints','targetAudience','synopsis']`；
    - `importNativeProfile` 增加 theme：严格解码，channel/genre/tags 经 `novelPositionSchema` 和 `positionError` 校验，tags 为 JSON 字符串数组，sellingPoints 与 targetAudience 不超过 2000 字，synopsis 不超过 500 字。
  - 返回 notFound 时视为未能推断，沿用 analyze 的原规则，不改 L1154。
  - 不合法的 tag 在修复回复中丢弃；channel 或 genre 不合法时，删掉这两个字段，并级联删除 tags（计入 settingsRepairs.droppedEvidence 之外的新计数 `clearedPosition`）。
- **H3 指纹**：定位是 s.artifacts 中的产物，因此自动进入 `importPlanHash`、语义指纹、导入记录和复核。
  - 清除路径与主题产物相同：retryKind world 和设定组原子采纳。
  - 发布时从 joined('theme') 中排除 schema 2 的定位产物。
- **M1 在途会话**：`validateDetailedOutlines` 同时接受新形态（原文）和旧形态（带前缀，仅用于兼容已在保存中的旧会话）。
  - 发布写 Chapter.outline 和章节卡 intent 时，对映射到推断细纲的章节调用 `stripImportKnowledgeAnnotations`。这样旧会话重试保存也不会留下批注，且不改变计划指纹。
- **M2**：不新增 wizard 状态字段，所以状态 schema 和回退兼容都不受影响。
- **M3 落点**：定位请求在同一 `importSettings(theme)` 中运行，时机是全部主题批次 settled 且无失败之后。它的产物与批次产物一起返回，由 commit 原子采纳。
  - 只复制原资料（不推断）时不运行。
  - 全部批次都是 notFound 时也不运行。
  - 定位请求失败（重跑 1 次后仍失败）时，主题任务仍为 done，只记一条 dropped：“主题定位未能推断，频道/题材等已留空”。
- **M4**：synopsis 优先取定位产物的 facts.synopsis。没有时用 joined 文本，并截断到 5000 字（按字符边界）。
- **M5 剥离时机**：在 `runImportAi` 解析成功后，立即对推断产物的 text 和非结构字段剥离批注。剥离后再做证据校验和 schema 校验。之后的复核、细纲比较看到的都是干净文本。发布门禁只做兜底。
- **M6**：不自动迁移已保存的作品，在总结里向用户说明并询问是否需要修复工具。
- **M7**：前缀相关的测试和脚本改为“原文直出、无批注”。向导夹具的 theme 请求遇到 themeProfile 时返回合法定位产物。按请求计数的用例按新规则修订。
- **低**：去批注规则只匹配全角或半角括号中“标签：值”的组合，且标签必须来自固定集合，至少一个。篇幅阈值：`<10000` 微型，`<50000` 短篇，`<300000` 中篇，其余长篇。
