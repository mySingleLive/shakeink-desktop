# 518 用例独立审核：世界线/叙事线导入提速

审核对象：`docs/518-lines-import-performance-cases.md`。依据：`517-lines-import-performance-plan.md`（3R 优先）、`517-…-plan-review.md`、当前工作树源码与测试夹具（只读，未运行测试）。

## 覆盖对照

3R-1 → LP-15；3R-2 → LP-06/16/17；3R-3 → LP-16（不全）；3R-4 → LP-03/18（与方案矛盾，见高1）；3R-5 → LP-01/02/19；3R-6 → LP-21（不可执行，见中3）；3R-7 → LP-10/11/20；3R-8 → LP-07（缺来源副本）；3R-9 → LP-12 与 E2E（缺措辞和抽查）；3R-10 → 部分覆盖（缺 payload 与缓冲失败）。第3节未改部分：重跑/拆分 LP-08/09，提示词 LP-12，面包屑 LP-13（缺设计稿），非向导 LP-22（缺向导 outline）。

## 高

1. LP-03 的字数上限与 3R-4 矛盾。用例写“≤ `ceil(总字数/31)` 与 profile 上限中较小者，单章超上限时章内切分”。3R-4 规定上限是 `max(最长章, ceil(待处理总字数/31))`，再以 profile 上限封顶；只有单章超过 profile 上限时才在章内切开。按用例实现，章长超过 `ceil/31` 的章节会被切开，这与 LP-18“章节从不跨批”冲突，也会让叙事 `order` 跨批冲突重新出现。LP-03 应改写为 3R-4 的公式，“超上限”统一指 profile 上限，并各加一个“最长章 > ceil/31 时整章成批”和“单章 > profile 上限时按单元切开”的断言。
2. 缺少“缓冲内单批合并失败只回滚该批”的用例（3R-1；方案审核 高1 的测试清单）。LP-15 只证明结果不丢。需补：同一次缓冲里 A、B、C 三批，B 在 `mergeImportArtifacts`/`assertImportSemanticLocks` 中抛错（例如 B 的候选与已有条目别名不明确）。期望 A、C 的 artifacts 和 coverage 落盘；B 不计 coverage、不留残余 artifacts；步骤 failed，重试只发 B 的单元。对照现有逐批提交位置 `desktop/main/novel-import.ts:1909-1910`。
3. LP-16 没有覆盖 3R-3 的适用范围。现在 `reconcileImportFact` 不调和 `people`/`time`（`desktop/core/novel-import.ts:316-326`），只有双方都是 inferred 时才调和（`:334`）。需补：(a) 来源副本与推断事件同名、people 不同 → 仍产生 `setting-body` 冲突，不并集；(b) narrative 同名而字段不同 → 不调和，产生冲突；(c) `time` 按 `unionFactText` 包含/拼接（`:274-280`）；(d) 字段有语义锁时不调和（`:337`）；(e) people 并集结果仍是合法 JSON 字符串数组，并且通过 `validateImportSemanticArtifact` 的角色引用校验（`:255`）。
4. 真实 E2E 验收不足以证明“质量不降”。末行只检查事件数、lineId 数 < 事件数、refs、coverage，缺少：3R-3 新增的“世界线/叙事线冲突数 ≤ 基线（0）”；3R-9 的“抽查 10 个叙事点 refs 与正文一致”；3R-10 的“每批字数与 payload 长度记录”；第1节的“带 people 事件数、叙事点数（基线 96）与覆盖章节数（93）、证据条数”；以及保留思考的证据（请求未带 thinking disabled）。另外，“不同 lineId 数 < 事件数”太弱：52 个事件里出现 51 条线也算通过，基线的“每事件一条线”问题并没有解决。建议改为数值目标（例如 ≤ 事件数/3），并人工抽查线名是否为故事线而非事件标题。

## 中

1. LP-04、LP-15、LP-21 要求 64 章、31 批或 40 批，但夹具 `bodyF` 只有 10 章（`tests/helpers/novel-import-wizard-fixture.ts:14-19`），`linesAi` 每请求只返回 units[0] 的一条（`:163-168`）。`gated()` 只拦截 entity 和其它设定请求（`tests/unit/novel-import-world-performance.test.ts:27-38`）。用例应写明：新建 N 章合成正文生成器，以及一个拦截 `kind∈{worldline,narrative}` 且分别统计峰值的 gated 变体。
2. LP-21 无法按写法构造。按 3R-4，批数约为 `min(31, 章数)`；只有 profile 上限很小时才会出现 40 批。要么指明使用小 `contextWindow` 模型（profile.characters 很小），要么改用 31 批。合成环境中 30 s 计时不会触发，期望应写成精确值：本步骤内 `verifySources` 调用次数 = 1 + ⌊批数/16⌋（或 ≤ 该值+1），取代“远小于 40”。计数也要排除其它步骤的复核（参照 `desktop/main/novel-import.ts:811` 的节奏）。
3. LP-17 没有写明测试层级。服务层在 `desktop/service/novel-import-ai.ts:1090` 拒绝重复 id，但夹具的 `options.ai` 绕过服务层，结果直接进入主进程。需拆成两条：服务层 `runImportAi` 报“模型实体标识重复”；主进程收到同批重复 id 时整批失败，不能被确定性重命名成相同 id 后按同名合并或报“标识与不同身份重复”放行。
4. LP-07 缺 3R-8 的“来源复制条目 lineId 不变”。需补：来源副本 lineId=`main` 保持原值；推断条目规范化为 `line-`+`importHash(NFKC 去空白 lineName).slice(0,16)`，并断言精确值。还要说明大小写不同（NFKC 不折叠大小写）时的预期。
5. LP-12 只检查规则是否存在，没有检查 3R-9 修订后的措辞（“有对应事件时写 refs，不得为凑数挂接无关事件；确无对应事件时为空数组”）。“非车道请求”应列出：非向导 worldline/narrative、向导 outline、touches。
6. 缺 3R-4 的“`requestFits` 不通过时减章重试”：构造 payload 超过 characters×3 的目录，期望批次按整章缩小，仍不拆章（对照 `desktop/core/novel-import-ai-payload.ts:39`）。
7. LP-13 缺第3节第5条的设计稿同步：`design/novel-import-wizard/wizard.js:19` 的 STAGES 仍为“线索”，同文件 `:15` 物品分类中的“线索”不能改动，需各写一条断言。LP-13 还应断言当前阶段文本为 `阶段 5 / 6 · 剧情 · …`（`src/lib/desktop/novel-import-wizard.ts:13`）。

## 低

1. LP-01/LP-19 的“不占聊天长任务名额”“在长任务上下文内执行”需要写明观测点，例如注入 `runInsideLongTask` 或沿用现有 world-performance 测试的断言方式。`runtimeScopeCache` 白名单（3R-5）没有对应用例。
2. LP-22 只覆盖非向导流程。第3节规定向导 outline 仍走 `semanticAnalyzeUnits`，应断言其在途峰值为 1。
3. LP-08/09 缺两个边界：可重跑的非证据失败重跑后仍失败时直接失败、不拆分；单单元证据失败两次后失败（`desktop/main/novel-import.ts:1900`）。LP-11 缺 epoch 变化（取消/重开）的同类断言。
4. LP-03 缺跨章单元归属起点所在章的断言。LP-04 可补“叙事批次的 entities 含第17步全部事件”。LP-10 可补“重试后无重复事件”。

## 结论

需修订后通过。主体方向和大部分 3R 条目已有对应用例。实施 TDD 前需修正高1（与 3R-4 矛盾），补高2、高3，按高4 加强真实 E2E 的质量验收，并明确中1–3 的夹具与测试层级。
