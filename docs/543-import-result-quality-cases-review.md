# 543 测试用例独立审核

审核对象：`docs/543-import-result-quality-cases.md`。依据：`docs/542-import-result-quality-plan.md`（§5 优先于前文）、`docs/542-import-result-quality-plan-review.md`，以及工作区源码（含未提交修改）。只读审核，没有运行测试。

## 结论

有条件通过。A/B/C 三组覆盖了三个用户问题的主干。但有一条用例的输入本身不合法（IQ-32），一条用例按当前代码构造不出来（IQ-10），还有一条用例的期望与方案/实现矛盾（IQ-37）。§5 的若干修订（采纳点剥离的全部路径、`clearedPosition` 计数、notFound 处理、清除路径）缺少对应用例或期望写得含糊。真实目标用例缺少路径、命令和判定口径。台账里还没有 NI-18。下列高、中项修订后可以进入 TDD。

## 高

H1. IQ-32 的合法样例实际不合法。
`["西方奇幻","蒸汽朋克","克苏鲁"]` 中，“克苏鲁”是“悬疑”的子类（`src/lib/creation-wizard/taxonomy.ts` 的 `WIZARD_SUBGENRES.悬疑`），不在 `男频/奇幻` 的候选里。`tagAllowed`（`position.ts:36-39`）对已知词表中的标签要求属于当前候选，所以 `positionError` 会返回“标签“克苏鲁”不适用于当前频道或题材”。`importNativeProfile` 的 theme 分支经 `themePositionValid` 判失败（`novel-import-semantics.ts` theme 分支，“主题定位的频道、题材或标签无效”）。
修正：IQ-32 的合法样例改为 `男频/奇幻/["西方奇幻","蒸汽朋克","西方"]`（“西方”属于背景组）。“克苏鲁”移到 IQ-34，作为“已知标签但不属于当前题材，修复时丢弃”的反例。

H2. IQ-10 按当前实现构造不出“剥离后仍残留”的输入。
发布前 `clean()`（`novel-import-publish.ts` 新增）先调用 `stripImportKnowledgeAnnotations`，再用 `IMPORT_KNOWLEDGE_ANNOTATION` 检查。剥离函数先做全局 `annotationBlock` 替换，再做 `balancedRemoval`（嵌套和未闭合括号会一直删到行尾），循环上限 100 次。普通的“直接写入 session”文本几乎都会被删干净，门禁永远不会触发，所以这条用例只能测到“剥离成功”。另外，直接改 session 后还要重算 `importPlanHash` 和 `semanticState.verifiedHash`，否则 `assertPlan` 会先抛“导入内容指纹已变化”（publish.ts:63），测到的是另一条错误。
修正：写明具体输入，例如同一行超过 100 个批注块且不可被正则一次吃掉的嵌套形态；或者只对 `clean()` 做单元测试，通过注入或导出让 strip 成为空操作。用例要断言错误消息是“导入文本仍含可靠性批注，未保存”，并且 PGlite 中没有作品行和回执（`contentMutation`/`ContentVersion(NOVEL_IMPORT)` 为空）。还要写明“重算指纹后再发布”这一构造步骤。

H3. IQ-37 的期望与方案和实现相矛盾。
用例写的是“该请求的 artifacts 只包含已采纳的主题产物”。实际情况有三点不同：
- 方案 §2.3 的输入包括文风产物摘要；实现 `importThemeProfile` 把 `[...themes,...styles]` 截断到 600 字后放入请求，并按预算从尾部裁剪。
- 定位请求在 commit 之前运行，用的是本任务批次返回的 `found`，这些产物此时还没有被采纳。
- units 是正文开头样本，受 `profile.characters/3` 和 `requestFits` 约束。
修正：期望改为以下几条：
- artifacts 等于本次主题批次产物与非原资料文风产物的 slim 版本（text ≤600 字，evidence/sourceUnitIds 各 1 条）的前缀子集；
- units 是 `workingImportUnits` 的开头连续前缀；
- 请求字段为 `phase:'analyze',kind:'theme',executionLane:'wizard-settings-v1',themeProfile:true`，没有 intent；
- 采纳后 `s.artifacts` 里恰好有 1 个 `import-theme-profile`（schema 2、origin inferred）；
- 补一条“commit 回滚（例如 settings 分组中其他任务失败或取消）时定位产物也不留下”的原子性反例。§5 M3 要求原子采纳，现有用例没有验证回滚。
H4. 定位修复规则在用例、方案和实现之间不一致，IQ-33/34/35 的期望无法同时成立。
- 方案 §5 规定：channel 或 genre 不合法时，删除这两个字段并级联删除 tags，计入新计数 `clearedPosition`。工作区的 `repairThemePosition`（`desktop/service/novel-import-ai.ts` 新增）在 genre 不合法时只删 genre/tags，保留 channel；计数也记在 `clearedReliability` 而不是 `clearedPosition`，所以 dropped 文案会显示成“取消可靠性标注”（main/novel-import.ts `recordSettingsRepairs`）。
- IQ-34 只写了“规则同 `positionError`”，没有说 genre 不合法时 channel 是否保留，也没有说用哪个计数。
- IQ-35 期望“tags 超过 20 个时严格解码失败，经修复后丢弃该项”。实际的修复会把 tags 截到 20 个（`.slice(0,20)`）后保留，不会丢弃。sellingPoints/synopsis 超长时修复不截断，严格解码失败后丢弃整项。三种超限的结果不同。
修正：IQ-33/34/35 逐项写出修复后的 facts 精确值和计数字段名，并先由主代理决定以方案还是实现为准（建议以方案为准：使用 `clearedPosition`，genre 不合法时 channel 也删除）。IQ-35 拆成三条：tags=21 个（截断还是丢弃）、sellingPoints=2001 字、synopsis=501 字，各自边界值的另一侧（20/2000/500）为合法。dropped 文案要断言显示“已清除定位”一类的新文案，不能借用可靠性文案。

## 中

M1. 采纳点剥离（§5 M5）的覆盖不全。
IQ-05 只覆盖了 `runImportAi`。需要补充以下内容：
- (a) settings 修复路径（`repairSettingsReply`）和 lines 修复路径：剥离要发生在修复和证据校验之前，并验证剥离后文本为空的产物如何处理（例如 text 只有批注时，`validateShape` 或“不能为空”是否拒收，应计入丢弃）；
- (b) 世界设定 `facts.content` 是 JSON：嵌套字符串剥离后必须仍能通过 `importNativeMappings` 的“原生规整后丢失”和可见性校验；content 是非法 JSON 时保持原样，由解码器拒收；
- (c) `ANNOTATION_KEPT_FACTS` 的确切字段（reliability/attribution/temporalScope 之外，refs、people、tags 等 JSON 字段是否被改写）；
- (d) reconcile/review 修订返回的产物同样会被剥离。
IQ-05 的“证据仍能定位”要写成断言：`validateImportEvidence` 通过，并且 quote 不被修改。quote 是原文引文，不应剥离。

M2. IQ-06 的范围太窄。
§5 H1 要求的是原资料“不检查、不改写”贯穿全链路：采纳、发布和门禁。IQ-06 只是单元层。IQ-11 只覆盖了章节正文和“原资料”这个泛称。要补一条集成用例：`origin:'source'` 的角色 bio、world content、theme 产物含 `（信息来源：…）`，发布成功且原样读回。尤其是 source 主题会进入 `themeText`，而 `clean()` 是对整个拼接结果调用的（`synopsis:clean(...)`），可能误删原资料或误触门禁。这是 H1 修订后最容易回归的地方。

M3. IQ-08 写的是旧会话兼容，但没有给出可执行的构造。
- 夹具要求：先用新代码跑到 verify，再把 `s.chapters[i].outline` 改写成旧前缀形态 `（可靠性：…）\n`+a.text，保持 `detailedOutlineIds`，重算 `importPlanHash`。如果计划指纹包含 chapters.outline，那么 publication.hash 是否要一起重算也要写明。然后走 `start()` 的 publication 重试分支（novel-import.ts:2213 附近）。
- 反例：旧形态但正文被改动（剥离后不等于 a.text）时，应抛“章级细纲与最终复核结果不一致”。`origin:'source'` 的细纲带前缀时不享受兼容（`sameOutline` 对 source 不剥离）。
- 断言 Chapter.outline 和章节卡 `import-chapter-card-*` 的 intent 都已剥离（publish 的 `chapterOutline(i)`）。

M4. 缺少 themeProfile 请求校验的正例和更多反例。
IQ-31 只有三条反例。需要补充：
- (a) 正例：合法请求能通过，且 `semanticResultArtifact` 赋 schema 2；
- (b) `themeProfile:false` 或非布尔值；
- (c) `semanticVersion` 缺失；
- (d) phase 为 review/classify；
- (e) 普通 theme 批次请求（没有 themeProfile）返回 schema 2 的定位产物或 id 为 `import-theme-profile` 的产物时，应被拒绝或不按定位处理，防止越权；
- (f) 定位请求返回多个产物、id 或 name 不是固定值、origin 不是 inferred 时，main 侧 `importThemeProfile` 抛“主题定位结果无效”，并进入重跑分支；
- (g) 返回 `notFound:true`（§5：视为未能推断），按 IQ-38 记 dropped，主题任务仍为 done；
- (h) evidence 全部无法定位时整次失败并重跑。
另外需要一条主进程侧的用例：runtime-proof 的 identity 中 intent 为 undefined 时 pending 记录可以 parse（H2 修订后不新增 intent，这里验证没有退化）。

M5. 清除路径的覆盖不全。
IQ-40 只覆盖了 retryKind world。§5 H3 写的是“清除路径与主题产物相同：retryKind world 和设定组原子采纳”。还应覆盖：
- 主题设置任务被跳过或重试（`wizardTask` skip/retry）；
- `revise`/`invalidate` 删除 theme 产物；
- 模型变更后重新开始。
每条都要断言 `s.artifacts` 中没有 `import-theme-profile`，dropped 里的“主题定位”记录同步清除或重写（`recordSettingsRepairs` 会先过滤 `THEME_POSITION_LABEL`）。还要补一条：主题任务中有批次失败时不发定位请求（§5 M3“无失败之后”），这一条与 IQ-39 是不同的分支。实现里的条件是 `found.length&&!halted()&&task.state!=='skipped'`，要核对“部分批次失败”时的行为是否符合方案。
M6. B 组用例在现有夹具上无法直接实现，需要先说明夹具改动。
`tests/helpers/content-tabs-fixture.ts:36-37` 用 esbuild 插件把 registry 替换成固定的 `Panel`，模块里只有 `serial` 实例计数，没有渲染计数；`window.tabsFixture`（:34）也没有 `openTab`、`moveTab` 和 `renameNovelTab`。
- 夹具的 `rename`（:34）直接 `setState` 映射所有 tab 并生成新对象（只替换命中项，其余保持引用），与 store 的 `renameNovelTab` 不是同一条路径。IQ-23 必须调用真实的 `useTabsStore.getState().renameNovelTab`，并且要用 `type:'novel'` 的 tab。记录里只有 t3 是 novel。
- 要写明夹具修改：Panel 内 `renders[tab.id]++`（在渲染函数体中计数，StrictMode 下要说明口径），暴露 `renderCounts()`/`resetCounts()`，以及 `openTab`/`moveTab`/`closeTab` 的透传。`openTab` 和 `closeTab` 经过 `afterSceneLeave`，非 scene tab 是同步的。要说明 40 个 tab 的类型分布不能触发 scene guard。
- IQ-20 的“只有 t0 和 t20 各渲染一次”：`StagedSaveSurface` 被夹具替换成透传，所以用例只验证了 `TabPanelHost` 的 memo，没有验证真实 `StagedSaveSurface` 订阅 store 后的行为。这要么写入用例限制，要么另加一条不替换 StagedSaveSurface 的变体。
- IQ-22 的“closeTab 非活动 tab”：`closeTab` 会重建 `subTabs`，ContentTabs 没有订阅 subTabs，可以接受，但仍要断言计数为 0。还要补关闭活动 tab 的情况：只有新活动面板渲染。
- L1 建议的“保存实体后 react-query 失效导致的重渲染计数”没有用例。至少要写一条记录型用例（不作为通过门槛），或在限制里说明。

M7. IQ-24 和 IQ-50 的回归口径不对。
`npm test` 只运行 `tests/unit` 和 `tests/integration`（package.json:6），不包含 `tests/browser`。IQ-20 到 IQ-24 和 `tests/browser/novel-import-wizard.test.ts` 要单独运行，写明命令（例如 `node --import tsx --test tests/browser/content-tabs.test.ts tests/browser/content-tabs-render.test.ts tests/browser/novel-import-wizard.test.ts`，或 `scripts/check-browser-file-regression.mjs`）。IQ-50 的“与 535–541 基线相比无新增失败”要给出基线文件，即 `/private/tmp/shakeink-verify-539/full-1.txt`（4606 通过、45 失败），并写明比较方法（按测试名逐项比较，不能只比计数）。还要列出 M7 清单中预计会修改的套件，并逐个给出预期结果：
- `novel-import-semantic.test.ts` 的 NI-SEM04（:100-105）
- `novel-import-semantic-publish.test.ts`
- `lotm-local-import-audit.test.ts`（:19 引用的 `qualifyImportKnowledgeText` 是否保留导出）
- `lotm-import-audit.test.ts`
- `novel-import-publish.test.ts:32`
- `novel-import-runtime-proof.test.ts`
- `novel-import-settings-performance.test.ts`
- `novel-import-wizard-session.test.ts` 按请求计数的断言
- 新增的 `novel-import-verify-publish.test.ts`
用例里还要明确夹具改法：`novel-import-wizard-fixture.ts:37` 的 fallback 对 `themeProfile:true` 返回 `{notFound:true}`，按 §5 这会被视为“未能推断”而不是报错。要说明默认 fallback 是返回合法定位产物（§5 M7），还是保持 notFound 并让计数类用例接受多 1 次请求和 1 条 dropped。

M8. IQ-41 到 IQ-43 的发布用例缺少边界和反例。
- IQ-41 要逐字段断言：tags 去重，genre 为空时写“全部”，channel 为空时不写 channel/genre/tags（实现中的 `themePosition?.channel?` 分支）。
- 补充：定位产物只有卖点、没有 channel 时（IQ-33 的修复结果），Theme 的 channel/genre 保持 `novel-create.ts:38` 的初始值 `''`。随后 IQ-43 用 `upsertTheme` 保存时，`positionError(data, existing)` 在 channel 没变时跳过频道校验（position.ts:42），所以能通过；但如果作者在面板里把 channel 从空改成别的值，或者 tags 变了，就会按新值校验。IQ-43 必须在“channel 为空”和“channel 已写入”两种主题上都执行，并分别用 author（options）和非 author 两种方式保存。
- `synopsis` 的优先级：定位的 synopsis 非空时优先使用；为空时用拼接文本并截断到 5000 字。需要“定位存在但 synopsis 为空”这一条。IQ-42 要包含 4999/5000/5001 字和代理对（emoji）跨越截断点的情况，断言 `Array.from` 长度为 5000，且没有孤立代理项。
- 篇幅：IQ-30 只测了纯函数。发布层要补：非向导会话也写 length（§2.3），没有章节时不写 length，length 按 `s.chapters`（chapterSelection 之后）计算而不是全书（审核 L3）。
- authorPosition 为 null：要在“作品已有 authorPosition”时（建书路径并不会出现这种情况，可用 IQ-43 之后再导入的情况说明）确认导入不写入。至少要断言 `tx.theme.update` 的 data 中没有 `authorPosition` 键。

M9. IQ-09 的字段清单要与 §5 H1 逐一对应。
需要逐项列出：
- 金手指 trigger/ability/limitation 三段；
- 卷大纲 summary，包括超过 100000 字时写“原始大纲全文见导入记录”的分支；
- 讲述卡 refs[].reveal（审核漏列项）；
- 章节卡 intent；
- 世界设定 content 的全部嵌套文本节点（pathways/levels/abilities/concepts/factions）；
- 主题 sellingPoints/targetAudience。
“ref.source 为 `导入语义关系：<kind>`”要覆盖 happen/mention/recall 三种，以及 kind 缺省时为 happen。还要断言非 semantic（`semanticVersion!==1`）会话的旧行为不变（`source:'根据正文分析'`）。

M10. 真实目标用例不够具体。
- IQ-25/53：`profile-tabs.mjs` 实际位于 `/private/tmp/shakeink-tabs-542/profile-tabs.mjs`，不在仓库里，根据 memory 中的清理记录，它有被删除的风险。要写明它的绝对路径（或移入 `scripts/`），以及调用参数 `<label> <count>`、`MODE=chapters`、`APP_ROOT`、LotmVerification.app 路径、证据目录 `/private/tmp/shakeink-tabs-542/evidence/<label>`、基线 label 和基线数值（§1.2：60 tab 时 99→150 ms，122 tab 时 150→200–267 ms，切换 200–252 ms）。
- “后 10 次均值 ≤ 前 10 次 ×1.2”和“同一 tab 数下低于基线”都要写明是针对 open 还是 switch，样本量多少，以及是否首次冷启动。长任务的 200 ms 阈值要说明来自 `PerformanceObserver longtask` 的哪一段区间。
- IQ-51/52：要写明驱动脚本（memory 中的 LOTM verify/save driver）、隔离根 `~/shakeink-test-roots/cache-522`、只选第一卷“小丑”，以及每次全新会话。还要写明读回方式（work-readback.json 的生成脚本）和“抽查”的范围。建议全量扫描所有作者可见文本字段，不用抽查；用 `IMPORT_KNOWLEDGE_ANNOTATION` 统计命中数，期望为 0，并把结果写入证据。
- IQ-52 的“genre 合法、tags 合法”要以 `novelPositionSchema.safeParse`（position.ts:57）的结果为判据。length 必须是“长篇”（741017 字）。截图要指定文件名和主题面板路径。
- 缺少两条真实用例：保存后在主题面板原样点击保存成功（IQ-43 的真实对应）；去批注后 AI 上下文（`src/lib/ai/context.ts`）的主题和角色片段中没有批注。后者可以降为离线读回检查。
M11. 台账没有 NI-18。
`docs/requirements-traceability.json` 只有 NI-15/16/17（NI-17 在 :4894），没有 NI-18。按 AGENTS.md，台账是实施和验收的依据。用例文档应附上 NI-18 的预期内容：
- requirement 写入用户的三条原话（2026-11-10）；
- source 为 542 方案、542 审核、543 用例、本审核；
- implementation 列出 `desktop/core/novel-import-semantics.ts`、`novel-import-outline.ts`、`novel-import-semantic-state.ts`、`desktop/service/novel-import-ai.ts`、`novel-import-publish.ts`、`desktop/main/novel-import.ts`、`desktop/core/novel-import-ai-payload.ts`、`desktop/shared/novel-import.ts`、`src/components/layout/ContentTabs.tsx`，以及修订的 scripts/audit-*；
- testIds 为 IQ-01..IQ-53 和 M7 中修订的套件；
- verificationKind 为 `NOVEL_IMPORT_TARGETED`；
- status 在执行前为 not-run。
verificationLimits 至少写入：已保存的旧作品不迁移（§5 M6，待用户确认）；ContentTabs 浏览器用例替换了 registry/StagedSaveSurface；react-query 失效导致的重渲染没有优化。memory 记录台账常有未提交修改，只能追加，不能 checkout。

## 低

L1. IQ-02 要拆成可以逐条断言的输入输出对。“相邻空白规整、正文字符不变”要写成精确的期望字符串。尤其是：批注独占一行时整行连同换行符删除（实现中的 `removeLine`）；句中批注两侧空格的处理；全角与半角混用，如 `（可靠性: 高)`。当前正则要求括号成对同型，混用时走 `balancedRemoval`，结果要明确。
L2. IQ-03 要补审核 L2 列出的形态：括号里有“来源”但没有冒号；`（可靠性：高）` 出现在正文句中，例如“他说（可靠性：存疑）不可信”，按规则这会被删除，要确认这是可以接受的行为；多段都带批注；嵌套括号 `（信息来源：第三章（回忆））`；未闭合括号一直删到行尾时的误删范围。逗号作为标签分隔符（`[；;，,]`）可能吞掉值中带逗号的正文，要有一条用例。
L3. IQ-12 的“>100000 字”要给出具体长度（如 100001 和 200001），以及代理对落在分页点上的情况，并断言页数。
L4. IQ-36 要写明运行 `scripts/capture-novel-import-prompt-golden.ts --check`，并断言旧条目哈希逐条不变。`<theme-profile-contract>` 的候选列表应与 `genresForChannel`/`positionTagGroups` 一致，不能另写一份。
L5. IQ-44 要补充两个对照：定位产物不变时指纹不变；`importSemanticResultHash` 和 `publicationRecord` 都包含定位产物（§5 H3 的“导入记录可追溯”）。
L6. 篇幅 IQ-30 要补 0 字的情况（无章节时不写 length，见 M8），以及含代理对的字数按 `Array.from` 计算。
L7. 用例文档没有说明 IQ-13 到 IQ-19、IQ-26 到 IQ-29 等编号空缺是否有意为之，建议加一句说明，避免台账 testIds 出现歧义。
