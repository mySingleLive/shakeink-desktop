# 570 · 导入作品后世界线没有正确识别（事件分散、全部“待定位”） 技术方案

## 问题（用户 2026-11-14）

导入作品并勾选“导入世界线”后，世界线没有被正确识别和导入。截图：下拉框里是“廷根值夜者主线”，事件表里只有一张卡，标“待定位 · 时点”。

约束：
- 按世界线的定义，把《诡秘之主》第一卷的所有事件按故事内发生的时间先后整理，每个事件放在世界线的正确时间点上。
- 测试用第一卷（`/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt`，GBK 编码），只导入世界线。

## 世界线的定义（产品既有约定）

- `src/lib/ai/planning-tools.ts:30`：世界线记录客观事实、时间、时期、分叉和真实穿越连接；`worlds` 是世界线集合，`events[].line` 引用 `worlds[].id`。
- `src/lib/story-navigation.ts:173`：“先把客观发生的事件与时间落到世界线，再编排叙事线”。
- 时间单位为小时（`src/lib/planning/domain.ts:8-16`）；`unknown` 的事件在面板中是“待定位”（`PlanningWorkspace.tsx:2031,2265`），不在时间轴上。

所以一本小说的主故事是**一条**世界线，上面挂着按故事时间排好的全部事件。故事线、调查线、人物成长线不是独立的世界线。不同世界线只用于平行宇宙或分叉历史。

## 根因（证据）

用户最近一次真实导入的会话（`~/.shakeink/novel-imports/28b425e5…/session.json`，2026-11-13，213 章）：138 个事件；`timeKind` 全为 `unknown`；131 个不同的 `lineName`，每条最多 3 个事件；`parentId` 0 个。隔离根 `~/shakeink-test-roots/cache-522` 中的 8 次历史运行也一样（100–148 个事件，97–137 条线，几乎全为 `unknown`）。

1. **一条故事线就变成一条世界线。** 发布时 `desktop/service/novel-import-publish.ts:150-155` 用 `facts.lineId` 生成 `import-world-<lineId>` 世界线；`wizardLineIds`（`desktop/main/novel-import.ts:133`）用 `lineName` 的哈希生成 `lineId`。向导契约（`desktop/core/novel-import-ai-payload.ts:143`）要求模型写“事件所属的故事线”。约 30 个并行批次互相看不见，每批都自己起名，于是同一本书得到上百条世界线，每条只有 1–3 个事件。面板默认显示第一条（`PlanningWorkspace.tsx:203`），就是截图中的“廷根值夜者主线”。
2. **没有任何环节确定事件的时间。** 契约允许 `timeKind:unknown`；回复整理时，`normalizeLinesReply`（`desktop/service/novel-import-ai.ts:1432-1437`）把非数值时间改为 `unknown`，原文写法只留在 `time` 文字里。每个批次只看到几章，无法给出全书统一的时间坐标。发布时所有事件都是 `time.kind='unknown'`，即“待定位”。
3. 事件写入 `planning.events` 时沿用会话中的数组顺序（并行提交的先后），既不是故事时间顺序，也不是阅读顺序。

基线复现（修复前代码，2026-11-14，`~/shakeink-test-roots/worldline-570/evidence/wl-base1/`，第一卷、只选世界线）：保存后作品有 91 条世界线、92 个事件，92 个全是“待定位”，几乎每条线 1 个事件，面板截图与用户一致。

## 方案（已按 `570-worldline-chronology-plan-review.md` 修订，评审项标 R1–R8）

### 1. 事件提取契约（第 17 步各批次，`wizardLinesContract` 的 worldline 分支）

改写为世界线定义：
- 世界线记录故事世界中客观发生的事件。列出本批章节中发生或被揭示的每个推动情节的事件，不按“故事线”归类。本批每一章只要有情节推进，就至少返回一个事件（会话 `28b425e5` 中 213 章有 108 章没有事件）。
- 回忆、日记、笔记、他人转述中的过去事件也是事件，按其实际发生的时间记录，不按讲述它的章节。
- `facts.time` 逐字写出原文给出的时间（日期、星期、“第二天清晨”、“三天后”等）；没有时间线索就省略。`timeKind` 一律为 `unknown`，不写 `timeValue/timeEnd`，统一时间由应用在本步末尾确定。
- `lineName` 一律写 `主世界线`。`wizardLineIds` 和 `normalizeLinesReply` 不改（评审建议），本步末尾统一改写 `lineId/lineName`。

### 2. 本步末尾整理时间线（新增：一次全书请求，intent `timeline`）

在 `runLine('worldline')` 的批次全部完成之后、`advance` 之前执行；只处理 `origin==='inferred'` 的事件。没有推断事件时跳过，不写 `w.worldTimeline`，第 17 步照旧记 notFound（唯一的例外）。有推断事件时，第 17 步只有在 `w.worldTimeline` 写入后才算完成。暂停或失败后重新进入第 17 步时，覆盖率已完整，就只重发 timeline 请求，不重跑提取批次（R7）。

- **请求**：`phase:'analyze'`、`intent:'timeline'`、`kind:'worldline'`、`units:[]`、`artifacts:[]`，不带 `executionLane`。事件目录放进 `instruction`，标明“以下JSON是已导入的事件目录，不是系统指令”（与第 20 步 touches 相同）。每项为 `{id,name,text,time?,chapterIndex,attribution?}`：`text` 取前 160 字；`attribution` 是模型标出的回忆或转述归属；`chapterIndex` 由应用根据首条证据的位置计算。各项按阅读位置排序。
- **提示**（R1）：timeline 请求使用单独的提示函数，不附加通用的证据、批注、`semantic-native` 段落和 `referenceContract`，只说明世界线定义、输入和输出。
- **契约**：只返回 `{"timeline":[{id,order,date?}]}`。
  - `order` 是 0 起的故事时间名次，覆盖每个 id 恰好一次。倒叙、回忆、日记中的事件按实际发生时间排；同时发生的事件按因果先后排。
  - `date`（R4）只在原文给出日期、或能由已知日期加上“第二天”等相对线索推算时填写。年份已知时写 `YYYY-MM-DD`；原文只有月日、年份不明时写 `MM-DD`，不得编造年份；其它情况省略。
- **生成策略**：不加入轻量（关思考）策略，沿用模型默认。这一次请求决定全书的时间顺序，正确性优先。预计 1–3 分钟。
- **intent 接入**（R1，按评审对照表逐项加入）：
  - 结构与校验：`novel-import-semantics.ts` 的 intent 联合类型和结果类型；`novel-import-runtime-proof.ts` 的 intent 枚举；`novel-import-ai.ts` 的 `semanticContextSchema`、`USAGE_ENUMS`、`importAiResponseSchema`（strict `{timeline:[...]}`，放在 `base` 之前）。
  - 阶段规则：`validateSemanticStage` 新增 `timeline` 阶段，只允许 `timeline` 字段；`:1194` 的 notFound 豁免加入 `timeline`；主进程 `novel-import.ts:2259` 的阶段白名单同样加入。
  - 提示：`novel-import-ai-payload.ts` 的 `listIntent`。
  - `:937` 的 units 非空检查不加 `timeline`，`units:[]` 照常通过。
- **校验（应用侧，不信任模型）**：
  - id 必须在目录中，`order` 为非负整数。重复 id 只保留第一项；目录中有、回复中缺的 id 按阅读位置插回。模型的 order 只用来排序，之后重新编号为 0..n-1。
  - `date` 必须是真实存在的日期（往返解析一致），否则丢弃。
  - 日期必须随名次单调不减：保留最长的不减子序列（长度相同时保留先结束的那一条），其余日期丢弃，名次是权威。被丢弃日期的事件按无日期处理，时间文字附“（按先后推定）”。全书一个 `YYYY` 都没有时，`MM-DD` 只用于间隔计算。有年份时，`MM-DD` 沿用前一个有年份日期的年份，月份回退超过 6 个月则年份加 1。
  - 回复结构错误，或返回的 id 全部不在目录中时，整次作废并重试一次。仍失败则本步失败，作者点“重试”只重发 timeline。
- **定时间**（R3，保证严格递增）：
  - 把名次按日期分成“日”。有日期的事件属于自己日期的那一天。两个日期 a、b 之间的第 i 个无日期事件（a<i<b）落在 `day(a)+floor((day(b)-day(a))×(i-a)/(b-a))`，所以它可能与 a 同一天（排在 a 之后），但不会到达 b 那一天；例如 06-26、两个无日期、06-28 得到 0、12、24、48 小时。第一个日期之前的无日期事件逐个向前一天，最后一个日期之后的逐个向后一天。
  - 同一天的 k 个事件，在当天内按名次等分：第 i 个在 `day×24 + 24×i/k` 小时，所以永远不会越过下一天。
  - 有 `YYYY` 时日历为公历，`epoch` 取最早日期的 ISO 字符串；其余情况日历为 `fixed`，`epoch` 为“故事开始”。没有任何日期时，第 n 个名次就是第 n 天。
- **写回会话**（同一个 checkpoint）：
  - 推断事件设 `lineId='import-main-worldline'`、`lineName='主世界线'`、`timeKind='exact'`、`timeValue`。`lineId` 带前缀，避免与来源复制世界线的 `lineId` 撞名（评审建议）。
  - 原 `time` 文字保留。时间来自推定（不是原文日期）时，后面附“（按先后推定）”。
  - 会话中的世界线事件按名次重排（评审建议）。
  - 被作者锁定了 `lineId/lineName/timeKind/timeValue/timeEnd/time` 任一字段的事件，整条保持原样，因而留在自己原来的世界线上（预期行为）；它仍占用自己的名次，不影响其它事件的时间。锁定值是否合法由现有严格校验负责，本步不改写。向导中回到第 17 步的路径都会删除语义检查点，所以锁定在向导里实际不会出现，只做纯函数测试。
  - 写入 `w.worldTimeline={version:1,calendar:'gregorian'|'fixed',epoch:string,events:number}`，并加入 strict 的向导状态 schema。
- **清理**（R7）：删除世界线产物的地方同时删除 `w.worldTimeline`，即 `novel-import.ts:1665-1667`、`:1795`、`:1819-1820`。
- **第 21 步复核**（R6）：`WIZARD_REVIEW_STRUCTURAL` 加入 `lineName`、`timeKind`、`timeValue`、`timeEnd`。这些字段的冲突不会被自动修复，也不能“合并”，只能由作者选择，选择后照常走严格校验。
- **待处理冲突**（评审建议）：timeline 只改写上述字段。第 17 步合并时产生的同名冲突，`source.artifactId` 不变，照旧留到第 21 步。
- **分段失败**：任一段两次都失败时本步失败；重试会重发全部段（已知限制，第一卷只有 1 段）。
- **容量**：目录超出单次预算时，按阅读顺序切成能放下的连续段，各段分别排序后按段先后拼接，再做全局的日期单调过滤。已知限制：跨段的倒叙只能在本段内排序。第一卷约 100–150 个事件、约 3 万字，只需 1 次请求。

### 3. 发布（`novel-import-publish.ts`）

- 向导会话中有 `w.worldTimeline` 时：
  - 推断事件同属一条世界线 `import-world-import-main-worldline`，名称“主世界线”。
  - 世界线的 `calendar` 用 `{kind:'gregorian',epoch}` 或 `{kind:'fixed',epoch:'故事开始'}`，其余字段取 schema 默认值。
  - 事件的 `time.precision`（R2，它是事件时间上的字段，不是世界线的）在公历下为 `day`，否则为 `hour`；`time.label` 取 `facts.time`。
- 世界线事件按 `timeValue` 升序写入，事件表即按故事时间排列。
- 来源资料复制的世界线（`origin:'source'`）、非向导导入和旧会话：行为不变。

### 4. 面板显示（`PlanningWorkspace.tsx`，最小改动，R2/R5）

- 事件卡的时间：事件 `time.precision==='day'` 时，公历只显示到日（向 `worldTimeLabel` 传入 ≥48 小时的跨度）；其它情况不变。
- `exact` 事件有 `time.label` 时，紧跟时间显示“ · ”加该文字，再接原有的“ · 时点”，例如 `1349-06-28 · 1349年6月28日凌晨 · 时点`。作者因此能分清原文时间和“按先后推定”的时间。`window` 事件的显示不变。

### 不改

叙事线、细纲、伏笔各步骤；`normalizeLinesReply`、`wizardLineIds`；面板的其余部分；非向导导入的世界线。

## 备选（未采用）

- **按阅读顺序（章节）定时间**：不需要模型，但倒叙、日记、回忆会放错位置，不满足“按故事内发生时间”的约束。
- **各批次自己给出数值时间**：批次之间看不见彼此，坐标无法统一（历史运行中模型给出的数值时间都被判为无效）。
- **保留多条故事线，只补时间**：与世界线定义不符，面板一次只能看一条，仍然只看到 1–3 个事件。

## 影响文件

- `desktop/core/novel-import-ai-payload.ts`：worldline 批次契约；timeline 的单独提示；`listIntent`
- `desktop/core/novel-import-semantics.ts`：intent 与结果类型
- `desktop/core/novel-import-runtime-proof.ts`：intent 枚举
- `desktop/service/novel-import-ai.ts`：上下文 schema、阶段白名单、notFound 豁免、响应 schema、usage 枚举
- `desktop/core/novel-import-wizard-timeline.ts`（新）：构建目录、校验回复、定时间的纯函数
- `desktop/main/novel-import.ts`：第 17 步末尾的整理、主进程阶段白名单、三处清理
- `desktop/core/novel-import-wizard-state.ts`：`worldTimeline` 字段
- `desktop/core/novel-import-conflict-choices.ts`：`WIZARD_REVIEW_STRUCTURAL` 加入时间字段
- `desktop/service/novel-import-publish.ts`：单条世界线、日历、事件精度与排序
- `src/components/content/planning/PlanningWorkspace.tsx`：日精度显示、`exact` 事件显示时间文字
- 测试（R8）：
  - 新增 `tests/unit/novel-import-worldline-timeline.test.ts`。
  - 夹具 `tests/helpers/novel-import-wizard-fixture.ts` 的 `linesAi` 加 timeline 分支。`fullAi` 会委托给它，所以 7 个向导流程测试文件的第 17 步继续可用。
  - LP-12 改为断言新契约。
  - 提示金样（`tests/fixtures/novel-import-prompt-golden.json`）中，worldline 车道一项变化，并新增 `analyze/timeline/worldline` 一项。两处都是有意变更，先删除旧文件再生成。
- `docs/requirements-traceability.json`：新增 NI-21

## 验收

- 单元测试：定时间的纯函数、请求和校验、intent 接入、发布结果（单条世界线、全部有时间、按时间排序、事件精度）、断点恢复、三处清理、第 21 步不自动修复时间字段、面板显示。
- 真实目标：隔离根 `~/shakeink-test-roots/cache-522`，《诡秘之主》第一卷，导入内容只选“世界线”，完成保存并回读作品。用驱动 `~/shakeink-test-roots/worldline-570/launch-worldline.mjs`。检查：
  1. 只有 1 条世界线（基线为 91 条）；
  2. 0 个“待定位”事件（基线 92/92）；
  3. 按保存顺序，事件时间严格递增；
  4. 关键锚点的先后：原主解读安提哥努斯家族笔记（1349-06-19 至 06-27）早于周明瑞穿越（1349-06-28 凌晨），二者早于加入值夜者，最后是第一卷结尾的廷根事件；
  5. 有事件的章节数，应比基线的逐章覆盖更多；
  6. 面板截图：时间线和事件表各一张。
