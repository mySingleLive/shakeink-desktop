# 488 · 场景导入卡住与清单整理 TDD 记录

日期：2026-11-02。依据：486 方案（3R4 > 3R3 > 3R2 > 3R > 3.1/3.2）、487 用例修订4、两份审核。基线提交 `b7f090a`。未提交、未跑全仓、未做真实目标验证（E4）。独立 code review 见 489，修复见末节。

## 1. RED（实现前，产品代码为 HEAD）

原始输出：`/private/tmp/shakeink-486/red/`（`a-section.tap`、`ui-core.tap`、`cleanup-controller.tap`、`d3-rerun.tap`）。

| 用例 | 失败断言（HEAD） | 与用例描述一致 |
| --- | --- | --- |
| A1 | 步骤停在 `import-scene`（`step import-scene`） | 是：unresolved 任务 waiting |
| A2 | `'import-scene' !== 'verify'` | 是 |
| A3 | resume 后仍 `import-scene` | 是 |
| A3e | resume 后 `selectionHash` 等于注入值 | 是 |
| A3b | `s.error==='请重新允许生成图片'` | 是：`wizardResume` 图片检查在前 |
| A3c 第一组 | `import-scene` 为 `waiting` 非 `skipped` | 是 |
| A3c 第二组 | 抛 `尚未配置图像模型` | 是：`confirmRoster` 首行检查图片 |
| A3f | 授权 hash 的 ids 含 unresolved 候选 | 是 |
| A3d | `stepError` 为 `请返回识别场景，确认新增地点及归属后继续导入` | 是：`:922` 抛错 |
| A4 | `sceneIdentitySummary.deferred` 为 undefined | 是 |
| C12b | 抛 `尚未配置图像模型` | 是 |
| D1 | `'北岸·青石镇' !== '青石镇'` | 是 |
| D2（附带） | 新身份名 `'南岸·乙港'` | 是 |
| D3（附带） | `sceneHint` 为 undefined（期望 `北岸、又有灯`） | 是；首次记录因测试限定词构造非法（`书房有` 不在证据中），修正测试后重录 |
| A7/CIUI01、CIUI14–16（附带） | 无“跳过导入场景”按钮；无“非具体地点”；无“继续导入”；无待确认列表 | 是 |
| B/C 整理用例（附带） | `planSceneCleanup is not a function`、无 cleanup 请求、`w.sceneCleanup` 不存在、schema 拒绝 `sceneCleanup` | 新接口缺失，符合预期 |

非 RED 用例在 HEAD 上：A5、A6 通过；C12-4/5 通过（当时无整理，cleanup 请求数恒为0）；B5 预算子用例通过，但原因是 roster 本身超预算，属于空过，已改为固定窗口 16000、扩大名录后才判定。C14 在 HEAD 上失败只因 D1 默认名带限定语，属于回归保护用例。

## 2. 修改文件

产品：
- `desktop/shared/novel-import-scene-identity.ts`：cleanup 请求上下文分支；`sceneCleanupDecisionSchema`；`sceneCleanupStateSchema`（严格、去重）。
- `desktop/shared/novel-import-wizard.ts`：候选 `sceneExcluded?`、`sceneHint?`。
- `desktop/shared/novel-import.ts`：摘要 `deferred`/`deferredTotal`；视图剔除 `sceneCleanup`。
- `desktop/core/novel-import-scene-identity.ts`：`defaultParts` 只返回 literal；`sceneHint`；`buildSceneWizardCandidates` 接受排除记录；`planSceneCleanup`、`validateSceneCleanupDecisions`、`applySceneCleanup`（规则1目标须 keep；预检 different-place、作者拆分、外部上级、新增环；逐条 regroup 回退；名称选择；drop 仅在未被合并时生效）。
- `desktop/core/novel-import-wizard-state.ts`：`sceneCleanup` 纳入 schema 与校验；候选新字段只允许场景。
- `desktop/core/novel-import.ts`：`wizardView` 输出待确认列表，剔除 `sceneCleanup`。
- `desktop/core/novel-import-semantics.ts`：`ImportSemanticResult.sceneCleanup`。
- `desktop/core/novel-import-ai-payload.ts`：`sceneIdentityCleanupPrompt` 及分发；其它阶段提示未改。
- `desktop/service/novel-import-ai.ts`：cleanup 响应 schema（public 与 wire）、请求校验、`validateSemanticStage` 阶段与越权键、唯一根键。
- `desktop/main/novel-import.ts`：`deferUnresolvedScenes`；`confirmRoster` 改为先失败判定、再 defer、`skip` 视同 0、仅 `selected>0` 查图片；`wizardResume` 在图片检查前 defer；`runEntities` 首个 checkpoint defer；遗漏流程只 defer 无结果的 unresolved；`runSceneCleanup`（links 之后比较 `inputHash`/`cleanedHash`、31 路池、包级 `SCENE_UNIT_ATTEMPTS` 重试、全成功后在 `commitSceneResult` 内过期检查并原子应用、过期重整一次）；上级修复提交同步 `cleanedHash`；`selectCandidates` 维护 `authorKept`；返回到 tree/kinds/files 清除；`ai()` 阶段表与唯一根键。
- `src/components/desktop/NovelImportWizard.tsx`：清单新提示、“跳过导入场景”、`sceneHint`、“非具体地点”标签；导入页 waiting 且无失败项时“继续导入”；校验页“归属待确认，未导入”列表。

测试：
- 新增 `tests/helpers/novel-import-scene-cleanup-fixture.ts`（所有回复经 `runImportAi`/`generateImportAiJson`）；`tests/unit/novel-import-scene-deferred.test.ts`（A1–A6、C12b）、`novel-import-scene-cleanup.test.ts`（B1、B4 主进程、B5、B6、C1–C5、C7/C7b/C8/C9/C11–C14）、`novel-import-scene-cleanup-core.test.ts`（B2、B3、B4 服务端、B7、C5b、C9 schema、C10、D1–D3）。
- `tests/helpers/novel-import-wizard-fixture.ts`：增加 `setImageModel` 开关。
- `tests/unit/novel-import-scene-identity-ui.test.ts`：按 A7 改写 CIUI01，新增 CIUI14–16。
- `tests/unit/novel-import-scene-identity-{actions,session,closure}.test.ts`、`novel-import-scene-roster-retry.test.ts`：合成模型增加 cleanup 中立回复（全部 keep），见第4节。
- `docs/requirements-traceability.json`：新增 NI-09，状态 `implemented-targeted-verified-real-target-pending`。

## 3. 验证结果（Node v24.18.0）

| 命令 | 结果 |
| --- | --- |
| E1 定向组 + 新增文件：`node --import tsx --test tests/unit/novel-import-scene-identity*.test.ts …-scene-hierarchy …-scene-entity …-scene-links …-scene-performance tests/unit/novel-import-wizard*.test.ts …-request-schema …-ai.test.ts …-scene-roster-retry …-scene-deferred …-scene-cleanup …-scene-cleanup-core` | 486/486 通过 |
| `node --import tsx --test tests/browser/novel-import-wizard.test.ts` | 33/33 通过 |
| 原基线组（identity*、hierarchy、links） | 176/176 通过（基线173，增 CIUI14–16） |
| `npm run typecheck` | 退出码0 |
| `npm run build:desktop` | 退出码0 |
| B7 提示字节：`/private/tmp/shakeink-486/prompt-baseline.json` 六个阶段 sha256 | 全部相等；`novel-import-ai.test.ts` 既有基线通过 |

日志：`/private/tmp/shakeink-486/e1-final.tap`、`browser.tap`、`typecheck.log`、`build.log`。

## 4. 偏离与待处理

1. **既有测试的合成模型补 cleanup 回复。** CI-A01–A12、CI-C01–C05、CI-M04–M10、SR-01/04/07 共 32 项最初失败，原因是它们的合成模型对未知请求返回 `{notFound:true}`，新增的 cleanup 阶段（3.2，用户决定2）因此被判结构无效。处理：只在这四个夹具中增加“全部 keep”的中立回复，原断言一项未改。属于方案有意新增阶段带来的夹具更新，不是削弱断言。
2. **A7 改写 CIUI01**：原断言“全部待确认时禁用”“1 项仍需在详情确认，未跳过”与 3R2-3、3.1 新提示相反，按用例改写，并新增“跳过导入场景”的点击调用断言。
3. **A3d 断言收窄（既有缺陷，未修）。** defer 后流程按 3R2-9 继续，进入已导入场景的遗漏修订；其 reconcile 请求被服务端以“设定修订分片范围或字段无效”拒绝。原因：主进程 `semanticRepairRequest` 用 `importFactFields(kind,schema)`（含 schema 2 场景字段 `exteriorDescription` 等）构造 `fragments.fields`，服务端校验只接受 `IMPORT_SEMANTIC_FACT_FIELDS`（v1 字段）。在未修改的 HEAD 上用同类合成数据（遗漏单元只含已导入场景）复现了同一错误，与 486 无关。487 A3d 要求“流程到达 verify 且 checks 全部 ok”，因此只能断言 486 部分：不再抛“请返回识别场景”，新场景未选、无任务、列入待确认，流程到达 verify 并进入 reconcile。该缺陷需另立任务决定修法（放宽服务端字段集或主进程只发 v1 字段），本次未自行设计。
4. **B5 预算构造**：v1 预算下限使分包窗口只能取 16000（12000 时 roster 本身超预算）；预算用例改为固定窗口、220 个长名称使名录超出单请求。并发用例 160 个身份，断言包数 ≥32 且峰值等于31。
5. **C4 跨包**：用 6 个填充地点隔开三处核心地点，使它们分属不同包，并断言各自所在包不同；链式期望按审核第11条为 B→C 生效、A 独立。
6. **C5b 测试入口**：`applySceneCleanup` 增加仅供测试的 `options.unchecked`，绕过预检，以验证回退防线；生产调用不传该参数。
7. **整理名称选择**：同组多个 `name` 冲突时，取该组内原文位置最早的作出选择的条目；无 `name` 时保持组内最早成员 literal（regroup 默认）。
8. **未执行**：E4 真实验证（LotmVerification.app、第一部全部章节）。traceability 条目据此标为真实目标待验。

## 代码审核修复

依据 `docs/489-scene-import-stall-and-roster-cleanup-code-review.md`（结论：需修改）。

**H1 整理证据在服务端校验**
- cleanup 请求的每个 focus 项新增 `ownQuotes`：本项在该 focus 单元内各提及证据窗口的原文（在单元内唯一，去重，最多8段）。严格 schema 同步扩展（`desktop/shared/novel-import-scene-identity.ts`）。
- `validateSceneCleanupDecisions`（服务端 schema 调用）新增约束：merge/drop 的 quote 必须完整落在某段 `ownQuotes` 内。违规属于 schema 错误，会进入 `generateJSON` 两轮纠错和包级 `SCENE_UNIT_ATTEMPTS` 重试。应用时的 `assertSceneIdentityEvidence` 保留为防线；过期检查同时逐值比较 `ownQuotes`。
- 整理提示要求 quote 逐字取自本项 `ownQuotes`（整段或含名称的连续部分）。其它阶段提示仍与基线字节一致。
- RED：临时去掉新约束（备份后还原，`cmp` 确认一致）。服务端用例报 `Missing expected exception`；控制器用例的步骤为 `failed`，`stepError` 为“场景身份资料无效（唯一原文位置）”，与审核描述的故障相同。输出见 `/private/tmp/shakeink-486/red/h1.tap`。
- 新用例：`cleanup-core` H1 先用越过 roster quote 的回复，被服务端拒绝；纠正后的第二轮回复成功，并能应用排除。`cleanup` H1 在控制器流程中首轮给宽 quote，经包级重试完成，排除生效。

**M1** 不修 reconcile 字段集缺陷。NI-09 `verificationLimits` 写明 A3d 只完成部分断言（`tests/unit/novel-import-scene-deferred.test.ts:84`），以及阻塞缺陷的位置：`desktop/main/novel-import.ts:1721` 用 `importFactFields(kind,schema)` 构造 `fragments.fields`，`desktop/service/novel-import-ai.ts:830` 只接受 v1 字段。该缺陷在 HEAD 上已存在，需另立任务。3R2-9 的遗漏补充场景在真实使用中仍会在校验步骤失败。

**M2** B4 服务端的 roster、links 两项改用真实请求：roster 用合法记录，links 用 `planSceneIdentityLinkWave` 规划出的真实包。先断言不带 `sceneCleanup` 的回复被接受，再断言加上后被拒。核对：临时去掉服务端 `sceneCleanup` 越权判定后，B4 仍全部通过，因为加键后的回复同样被严格 wire schema 拒绝。所以这两项用例证明的是：加上该键这一项变化就足以导致拒绝。

**M3** 六个阶段的提示 sha256 写进测试常量 `PROMPT_BASELINE`，测试不再读取 `/private/tmp`。

**L1** 过期重整后，`inputHash` 取实际应用那一轮的 `frozen.ledgerHash`。C8 单次变更子用例新增断言：`inputHash` 等于变更后的账本 hash。

**L2** 测试入口改名为 `options.testOnlyUnchecked`，注释写明生产路径不传、IPC 无法到达。

**复跑（Node v24.18.0）**
| 命令 | 结果 |
| --- | --- |
| E1 定向组 + 新增文件（同第3节） | 488/488 通过 |
| `tests/browser/novel-import-wizard.test.ts` | 33/33 通过 |
| `npm run typecheck` | 退出码0 |
| `npm run build:desktop` | 退出码0 |

日志：`/private/tmp/shakeink-486/e1-r2.tap`、`browser-r2.tap`、`typecheck-r2.log`、`build-r2.log`。
