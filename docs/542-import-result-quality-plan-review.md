# 542 技术方案独立审核

审核对象：`docs/542-import-result-quality-plan.md`。审核方式：对照工作区源码（含未提交的 539–541 修改）逐条核对，只读，未运行测试。

## 已核实的方案陈述

- 批注只由应用拼接：`qualifyImportKnowledgeText`（`desktop/core/novel-import-semantics.ts:276-279`）和 `qualifyImportWorldContent`（:308-318）。生产代码里的调用点只有 `desktop/service/novel-import-publish.ts:14,99,105,108,110,136,144,145` 和 `desktop/core/novel-import-outline.ts:2,16`。`publishWizardLinks`（publish.ts:178-212）和 `novel-import-world-repair.ts` 没有调用。方案 §2.1 列出的发布字段是全的。漏列一处：讲述卡 `refs[].reveal`，在 publish.ts:145 写作 `reveal:intent`。改掉 intent 后它会跟着变干净，但验收清单应把它单列出来。
- 主题发布只写 `synopsis:joined('theme')`（publish.ts:121）。`IMPORT_SEMANTIC_FACT_FIELDS.theme` 只有 knowledge 字段（semantics.ts:56）。根因判断成立。
- `TabPanelHost` 已经用 memo 落在工作区（`src/components/layout/ContentTabs.tsx:18-30,233`）。tabs store 里各操作的引用行为核实如下：`openTab`/`openTabForNavigation`/`moveTab`/`closeTab`/`closeAllTabsOfNovel`/`closeSceneTabs` 都保留原有 tab 对象，只有 `rename*Tab` 给命中的那一项生成新对象（`src/stores/tabs.ts:282-402`）。方案 §2.2 的说法成立。
- 不写 `authorPosition` 是对的。`upsertTheme` 只在 `options`（作者通过主题面板保存）存在时写 `authorPosition`；没有 options 的 AI 写入，在 `authorPosition` 存在时会被强制保留原定位（`src/lib/services/theme.ts:63-68`）。`src/lib/ai/context.ts:73` 把它当作“作者已确定”的提示。`novel-create.ts:38` 也只在作者通过建书向导选择后才写。导入时如果写入 `authorPosition`，后续 AI 就再也不能调整定位，这与“推导≠作者确认”的语义冲突。

## 问题清单

### 高

H1. 发布门禁覆盖“发布事务中写入的任何文本”，会误伤原资料。
`chapter.content`（publish.ts:131）和 `origin==='source'` 的原资料产物（bio/description 走 `a.text`，见 publish.ts:105,108,110,121 的 joined 和 `nativeText` 的 source 分支）都是用户原文。作者自己的设定文档里完全可能有“（信息来源：…）”这类写法，情报题材的正文里也可能出现。门禁一旦命中，就会整次回滚，作品永远存不下来。
修正：门禁和 strip 只作用于 `origin!=='source'` 的派生字段，并把字段清单显式列出来：bio、scene/world description、setting content 各文本节点、item/foreshadow/trope content、theme synopsis/sellingPoints/targetAudience、style、goldenFinger 三字段、volume summary 中的派生部分、event.fact、telling intent/reveal、ref.source、chapter.outline 中的派生细纲。原文和原资料一律不检、不改。

H2. 新增 `intent:'profile'` 牵涉的枚举和白名单远多于方案描述，而且“复用 wizard-settings-v1 通道”与现有校验直接冲突。
以下位置必须同步修改，否则请求会被拒，或者返回内容被判越权：
1. `desktop/core/novel-import-semantics.ts:44`：`ImportSemanticRequestFields.intent` 的联合类型。
2. `desktop/core/novel-import-runtime-proof.ts:5`：`identity.intent` 的 zod 枚举。不改的话 runtime.json 的 pending 记录 parse 失败，向导会报持久化错误。
3. `desktop/service/novel-import-ai.ts:878`：`semanticContextSchema.intent` 枚举，否则报“导入语义版本或上下文结构无效”。
4. novel-import-ai.ts:902：向导 intent 的阶段守卫列表（需要 analyze 且 units 非空）。
5. novel-import-ai.ts:915-916：`validateSemanticStage` 的 stage 推导、`allowed` 表和结果字段循环，要加 `profile:['themeProfile']`，并把 `themeProfile` 放进越权检查。
6. novel-import-ai.ts:472-481：`importAiResponseSchema` 新增 profile 分支，严格 schema 里不得含 artifacts/notFound。
7. novel-import-ai.ts:38/44 的 `schema`/`semanticSchema`，以及 `desktop/shared/novel-import.ts:175` 的 `ImportAiResult`：新增 `themeProfile` 字段。
8. novel-import-ai.ts:1066：`wizardSettingsLaneRequest` 要求 `intent===undefined`。profile 请求带上 `executionLane:'wizard-settings-v1'` 后，会在 :889 报“导入调度通道无效”。必须改这个判定，或者给 profile 单开一个 lane 判定。
9. novel-import-ai.ts:1073：`lightImportGeneration`，决定是否用轻量策略。
10. novel-import-ai.ts:1154：analyze 阶段除 reconcile/roster/touches 外，必须返回 artifacts 或 `notFound`。profile 不加进豁免列表就会抛“未找到内容时必须明确返回 notFound”。
11. novel-import-ai.ts:722 和 :1237：`repairSettingsReply` 只能处理 artifacts 根，要显式排除 profile，不然 counts 语义混乱。
12. novel-import-ai.ts:640：`USAGE_ENUMS.intent`。不改则调试计数里显示 `?`。
13. `desktop/main/novel-import.ts:2116`：runtime scopeHash 缓存条件，决定 profile 是否走 `runtimeScopeCache`。
14. novel-import.ts:2119：主进程的 stage 推导和 `allowed` 表（与服务端各有一份，必须一致）。同处 `settingsRepairs` 的 lane 判定也要相应调整。
15. novel-import.ts:2049：`monotone` 判定（是否按单调批处理）。
16. `desktop/core/novel-import-ai-payload.ts:168-169,184`：`listIntent`/`requestedKind`/`contracts`。不改的话，profile 请求会拿到 theme 的 artifacts 分析契约。还要新增 profile 契约文本。
17. `scripts/capture-novel-import-prompt-golden.ts` 和 `tests/fixtures/novel-import-prompt-golden.json`。
修正：方案里列出以上清单；为“复用通道”给出准确的新判定式；补充主进程和服务端 stage 表一致性的单测。

H3. `w.themeProfile` 不在任何计划指纹里。
`importPlanHash`（`desktop/core/novel-import.ts:388-391`）只覆盖 `artifacts/chapters/...`，wizard 部分只有 selection/structureHash/chapterSelection/images。`importSemanticResultHash`（`desktop/core/novel-import-semantic-state.ts:15`）只看 artifacts、decisions、locks。`publicationRecord`（publish.ts:41）的 wizard 快照也不含它。结果是：profile 变了，`s.publication.hash` 的重放校验（novel-import.ts:2213）照样通过，验证后的 `verifiedHash` 也不失效；导入记录里也查不到发布时用了什么定位。
修正：把 `themeProfile` 放进 `importPlanHash` 的 wizard 段和 `publicationRecord`（导入记录可追溯）。更省事的做法是把 profile 存成一个 theme 产物的 facts（扩展 `IMPORT_SEMANTIC_FACT_FIELDS.theme`），这样自动进入 artifacts、hash、review 和导入记录，也就不需要新增 wizard 字段（见 M2）。

### 中

M1. 在途会话的兼容：细纲投影和发布校验不一致，会卡死。
旧 journal 里 `s.chapters[i].outline` 已经是带前缀的投影值。改掉 `text()` 后，publish.ts:65 的 `validateDetailedOutlines` 会因为 `chapter.outline!==text(a)` 抛“章级细纲与最终复核结果不一致”。`start()` 的 publication 重试分支（novel-import.ts:2213）不会重新投影，`publish()`（:2559）也不会，所以 `publishing` 或保存失败后重试的会话会永久失败。`verify` 步骤 :600 和 :2465 会先跑 `projectOutlines`，因为 `previous===a.id` 会覆盖，这两条路径没问题。
修正：`publish()` 进入时在 checkpoint 之前先执行一次 `projectOutlines`，并重算 `publication.hash`；或者对旧带前缀的 outline 做一次确定性剥离。补一条用例：用旧 journal 恢复后重试保存。

M2. 新增 wizard 状态字段的 journal 和清理面。
`importWizardStateSchema` 是 `.strict()`（`desktop/core/novel-import-wizard-state.ts:55-74`），所以要同时改 `ImportWizardState`（:11-38）、schema、`ImportWizardView` 的 Omit 列表（`desktop/shared/novel-import.ts:170`）和 `publicView` 的剔除（`desktop/core/novel-import.ts:429`，是否暴露给 UI 要定）。旧 journal 没有这个字段，用 optional 读取没问题。但如果用户回退到旧版本，新 journal 会被旧 strict schema 拒收（`ImportWizardStateError`），应在方案里写明接受这一点。
清除点也比方案写的多。`retryKind(world)`（novel-import.ts:1563-1564）已经覆盖。还要加：`wizardTask` 跳过或重试 theme 设置任务（:582-590）、`revise`（:1701 起会删 theme 产物）、`invalidate`（:1800 起）、模型变更或重新开始（:2200）。少清一处，就会出现“主题产物没了，定位还在”的陈旧发布。如果改用 H3 的“存为 theme 产物 facts”方案，这些清理会随产物自动完成。

M3. profile 请求放进 `importSettings` 的落点和原子性没写清。
主题批次是并行的（novel-import.ts:1053）。汇总请求必须等全部批次 settled，用合并后的主题产物作输入，然后在 `commit` 的 settings 分组事务（:937-942）里和产物一起采纳或回滚。现在 `importSettings` 只返回 `{artifacts,repairs}`，需要新增返回通道。还有三条边界未定义：
- `copied`-only（不推断）的路径（:1030）；
- 全部批次都返回 `notFound` 的 `empty` 路径（:959）；
- profile 本身失败时，主题任务是整体失败（这会丢掉已经成功的主题产物）还是只记 dropped。
建议：profile 失败只记 dropped，不让主题任务失败；篇幅由确定性计算得出，任何路径都写。

M4. synopsis 退回拼接时超过主题面板的上限。
`themeInputSchema.synopsis` 是 `max(5000)`（`src/lib/services/theme.ts:11`），vf-r3 的拼接是 6518 字。作者之后在主题面板保存会得到 `INVALID_THEME`，必须先手动删减。方案里汇总失败时“退回原有拼接”还会重现这个问题。
修正：退回时截断到 ≤5000 字，并保证在完整字符边界截断。在集成用例里断言读回的主题能被 `upsertTheme` 原样保存。sellingPoints/targetAudience 的 2000 字上限已经和 schema 对齐。

M5. 去批注放在发布阶段太晚。
如果只在发布时调用 `stripImportKnowledgeAnnotations`，会话里的产物、第 21 步复核和自动修复（docs/539）、细纲投影、伏笔触点（novel-import.ts:1301 用 `c.outline`）看到的都是未剥离的文本。`validateDetailedOutlines` 比较时也必须使用同一个剥离函数，否则发布前后不一致。
修正：在模型结果采纳点剥离（服务端 schema 的 transform，或 settings/lines 的 repair 阶段），并计入 dropped 计数。发布门禁只做兜底。这样 `importPlanHash` 和导入记录都是干净值。

M6. 已有作品不迁移，与用户“全部去除”的要求有落差。
用户说“导入推导出的大量文案都带…要全部去除”，指的是现有作品。方案让用户“重新导入或手动编辑”，按真实数据量（2304 个产物）这是不可行的。仓库里已经有带 dry-run、快照和回执的修复模式（`desktop/service/novel-import-world-repair.ts`）。
建议：要么明确请用户确认“不迁移”，要么做一个同模式、只剥离派生字段的可选修复，先 dry-run 再提交。

M7. 会坏的测试和脚本。删除导出后 typecheck 会直接失败。
- `tests/unit/novel-import-semantic.test.ts:100-105`（NI-SEM04 前缀与容量前缀）
- `tests/integration/novel-import-semantic-publish.test.ts:59,63-67`（前缀和容量用例依赖前缀才越界，需要重新设计容量边界数据）
- `tests/unit/lotm-local-import-audit.test.ts:19,99,105,117`（:105 期望 `synopsis:joined('theme')`、`length:''`；主题字段写入后会失败）
- `scripts/audit-lotm-local-import.ts:12,185,188`（:185 的 `expectedTheme` 写死了 channel/genre/length 为空）
- `scripts/real-novel-semantic-assertions.ts:7,60,79,118`
- `scripts/audit-real-novel-import.ts:20,141`
- `scripts/audit-lotm-import.ts:12,125`
- `scripts/verify-lotm-scenes-persistence.mjs:10,41`
- `tests/integration/novel-import-publish.test.ts:32`（非向导会话断言 synopsis；方案说非向导会话也加写篇幅，要同步改）
- 向导夹具 `tests/helpers/novel-import-wizard-fixture.ts:37`：对未知请求的 fallback 返回 `{notFound:true}`，profile 严格 schema 会拒绝，于是所有跑到主题任务的向导会话用例（`novel-import-wizard-session.test.ts`、`novel-import-settings-performance.test.ts:105-170` 等）都会失败。按请求计数断言的用例（如 wizard-session :59,117,357）数字也会变。
- `tests/unit/novel-import-settings-performance.test.ts:90`：lane 拒绝矩阵要加 profile 的正反用例。
- `tests/unit/novel-import-runtime-proof.test.ts`：intent 枚举。
- 新增未提交的 `tests/integration/novel-import-verify-publish.test.ts` 要核对主题读回。

### 低

L1. memo 足以消除“切换或打开触发全部面板重渲染”，也安全。
- `prefix` 来自 `useId`，稳定；`active` 是布尔值；`StagedSaveSurface` 订阅自己的 store（`src/components/content/StagedSaveSurface.tsx:159-163`），不依赖父组件重渲染。
- 面板的 focus 和 scene 行为都靠自己 subscribe tabs store（SettingPanel.tsx:411、WorldPanel.tsx:238、SceneWorkspace.tsx:26/48），不受 memo 影响。
- `workspace-draft-source.ts:47` 恢复时会 `structuredClone`，全部面板重渲染一次，这是预期行为。
- `renameNovelTab` 只让作品 tab 重渲染，而 `NovelOverview` 本来就要更新标题。

不足之处有两点。第一，react-query 失效（例如保存角色后 invalidate 列表）仍会唤醒所有隐藏面板里订阅同一 key 的组件，这与 tab 数线性相关。第二，`ContentTabs` 本身每次仍会渲染 N 个标签头，并重建 `coverByNovel`。
建议：验收用例里补一项“保存一个实体后的重渲染计数”。如果不达标，再考虑让隐藏面板暂停 query（`enabled`/`subscribed`）。这部分不阻塞本方案。

L2. `stripImportKnowledgeAnnotations` 误删正文的风险低，但规则要再收紧：括号内必须由“标签：值”组成、以“；”分隔、至少包含一个指定标签，并且整体位于段首、独占一行或句尾。正文引文和原资料不经过这个函数（见 H1）。单测要覆盖：括号里只出现“来源”而没有冒号、全角和半角混用、嵌套括号、多段都带批注。

L3. 篇幅阈值的边界要写清。10000、50000、300000 这几个精确值分别归哪一档，按 `WIZARD_LENGTH_META` 的“1-5 万字”这类描述，建议用左闭右开。“已导入章节”要按 `chapterSelection` 之后的 `s.chapters` 计算，不能用全书。

L4. `assertImportWorldContentProjectionBudget` 改用空 knowledge 后，容量门实际放宽了（不再加 fields×prefix）。这是预期结果，但 semantic-state.ts:52 的 mappingWarnings 文案里仍列出了 reliability/attribution/temporalScope 字段，应同步检查。

L5. 方案说的“tags 只能取 `positionTagGroups` 的候选”比 `positionError`/`tagAllowed` 更严（后者允许词表外的自由标签）。这样做可以接受，但服务端应该直接用 `novelPositionSchema`（`src/lib/creation-wizard/position.ts:57`）做最终校验，避免另写一套规则产生偏差。

## 结论

有条件通过。三个问题目标和根因判断正确，memo 方案可行且安全，不写 `authorPosition` 的判断正确。实施前必须修订方案：
- H1：门禁和 strip 只作用于派生字段；
- H2：完整列出 profile intent 的 17 处改动，并给出通道判定；
- H3：profile 进入计划指纹和导入记录，推荐存为 theme 产物 facts。

同时明确 M1–M6 的处理：在途会话重新投影、清理点、并行批次后的汇总落点、synopsis 5000 字上限、在采纳点剥离、旧作品是否修复（需要用户确认）。测试修订清单按 M7 补全后，再进入测试用例阶段。
