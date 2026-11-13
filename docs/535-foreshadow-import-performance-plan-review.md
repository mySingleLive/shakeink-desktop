# 535 方案独立审核：导入伏笔提速

审核对象：`docs/535-foreshadow-import-performance-plan.md`。依据：当前工作树源码（只读）；基线证据 `/private/tmp/shakeink-foreshadow-535/evidence/fs-r1/` 下的 `foreshadow-import-completed.json`、`foreshadow-session-private.json`（只统计结构，不摘录正文）和 `app-stderr.log`（`import-usage`、`lines-timing`、`lines-batch-fail` 行）。未运行测试。关闭思考已经用户批准（2026-11-08），本文不再讨论。

## 已确认成立

- 基线描述属实：`runForeshadow` 用 `stageRequests` 串行发送（`desktop/main/novel-import.ts:1216`）。touches 属于 monotone 路径，按 profile 装满（`:1800-1801`）。`ai()` 调用时没传 `verified`（`:1217`），所以每个请求前后各做一次来源复核（`:1855,1869`）。fs-r1 共 11 次生成（10 批，`f01a4f60` 在生成内重试了一次），输入约 6.2 万 token，输出 11494–42634 token，`lane:null`，全部 `finishReason:"stop"`。整步 1528108 ms，质量数字与方案第2节一致。
- touches 目前不走轻量策略：`lightImportGeneration` 只认 roster 和四类 entity（`desktop/service/novel-import-ai.ts:1067`）。加入 touches 之后，`importGenerationModel`（`:1068`）、`runImportGenerationLane`（`:1070`）和 `defaults.generate` 的分派（`:1057`）会一起生效。`intent:'touches'` 只在 `runForeshadow` 一处发出（全仓 grep），usage 枚举里已有 touches（`:638`），schema 不用改。LP-02（`tests/unit/novel-import-lines-performance.test.ts:61`）断言 touches 不进入 lines 车道，方案没有新增 executionLane，这条断言仍然成立。
- 提交原子性：现在的检查点在同一回调里追加 `touchStash` 并写 `coverage.touches`（`novel-import.ts:1218`）。两者都写在 journal 里，崩溃或暂停后恢复时只发剩余单元（`:1213,1216`），这一点在并行化后仍然成立。
- 重置路径不用改：retryKind（`:1319-1321`）、revise（`:1466`）、首份清单变化（`:460`）都会删掉 `touchStash` 和 `coverage.touches`。`refreshForeshadowPlan`（`:1304-1306`）从产物重建 stash、调用 apply、再删除，不依赖新增的 `order`，`order` 设为可选即可兼容。
- id 不受顺序影响：`wizardCandidateId('item',key,'foreshadow')` 只由规范化后的 key 推出（`novel-import.ts:1232`，`desktop/core/novel-import-wizard.ts:87`）。顺序只影响首条的 title/content（`:1232` 中 `g` 首次创建时取值）。所以方案第3节的排序只需要保证名称和说明稳定，理由成立。
- 引文定位失败会被静默丢弃（`novel-import-ai.ts:1150,1152`），不会抛错；章内不唯一的引文在 `planForeshadowTouches` 中记为 dropped（`desktop/core/novel-import-foreshadow.ts:39-40`）。因此 touches 批次没有 lines 车道那种"引文定位失败→提示重跑"的需要，不复用 anchorHint 是对的。

## 高

1. **批次缩到约 3.4 章以后，PLANT→PAYOFF 的跨批配对会大量丢失，RESOLVED 很可能明显低于基线。** 方案说"基线 10 批同样没有跨批上下文"，但这两种情况不可比。基线每批约 21 章；`foreshadow-session-private.json` 中 130 个伏笔里，有 39 个带多个触点，触点跨章数的中位数是 4，其中 20 个跨 ≥4 章，最大跨 20 章；RESOLVED 28 个里有 23 个同时带 PLANT 和 PAYOFF，基本都是同一批内配上的。改成 62 批后，大多数配对会分到不同批。后一批看不到前一批埋下的伏笔（请求只带世界事件和本批讲述卡，`novel-import.ts:1215-1216`），模型就不知道该把某段写成 PAYOFF，也不会和前一批用同一个 foreshadowKey。靠"同名合并"（方案第3节第4条）几乎合不上：基线标题都是自由生成的描述性短语。可能的结果是伏笔数上升、RESOLVED 和多触点伏笔下降。
   - 建议：(a) 批数改为 `WIZARD_LINE_CONCURRENCY`（31 批，一波，约 6.9 章/批）。时长参考 worldline：fs-r1 中 33 批、单批约 2.4 万字，p50 11.7 s，最后一批在 35.7 s 结束，有余量。(b) 在质量口径里加上硬指标，与基线对比：RESOLVED 数、多触点伏笔数、跨 ≥4 章的伏笔数，并写明不达标时的处理（交用户决定，或者加一次合并 key 的轻量请求：输入只有各组 key/title/content，不含正文，由模型给出同一伏笔的分组）。(c) 风险一节删掉"基线同样没有跨批上下文"这句。

## 中

2. **输出上限：62 批时风险低，31 批时需要实测，方案没把 `length` 写进口径。** 非思考模式下，可以参考同次 fs-r1 的 lines 车道：narrative 97 次生成，输出中位 2903 token，有 2 次正好 8192（`finishReason:"length"`）；worldline 中位 2310、最大 5168。touches 每条都要重复 foreshadowKey/title/content/summary/quote/evidence（`novel-import-ai.ts:373`），而且 `content` 最长可到 4000 字，并在同一伏笔的每个触点上重复。估计每条 150–300 token，12k 字的批大约 3–8 条，31 批的情况下翻倍，正常不会到 8192；但模型如果写了长 content，就会触到上限。`finishReason!=='stop'` 会抛 `模型输出未完整结束`（`src/lib/ai/generate.ts:221,242`），能被 `ROSTER_OUTPUT_RETRYABLE` 捕获（`novel-import.ts:181`）。
   - 建议：touchesContract 限制 content 不超过 100 字，同一 foreshadowKey 在本批第二条起 content 留空（schema 默认就是 `''`，`applyForeshadowPlan` 会取第一条非空的，`:1232`）；质量口径里加上"finishReason=length 次数"和每批输出 token 的 p50/max。
3. **ai() 的复核与 scopeHash 缓存条件没覆盖 touches，31 路并发时会显著拖慢。** 方案说"来源复核与 roster 相同"，那就必须给 `ai()` 传 `verified=true`（现在 `:1217` 没传）。另外，`scopeHash` 缓存条件只包括 entity/四类、带 sceneIdentity 的 scene roster 和 lines 车道（`:1866`），touches 每次都会重新算 `importScopeHash(s,'analyze')`（`desktop/core/novel-import.ts:382-385`，对整个会话范围做哈希）。character roster 现在同样不缓存，但并发只有 15（`novel-import.ts:182`）。
   - 建议：写明调用时传 `verified=true`；缓存条件加上 `request.intent==='touches'&&s.wizardVersion===1`，并补测试：同一 epoch 内只算一次，scope 变化后仍会拒绝（`desktop/core/novel-import-runtime-proof.ts:26-34`）。
4. **失败处理：哪些错误可重试要说清楚，单元切分和"按章对半"不一致。** touches 批可能抛的错误有：严格 schema 失败（多出的键、chapterIndex 是字符串、summary 或 quote 超过 200、content 超过 4000、带 `notFound`/`artifacts` 键，`novel-import-ai.ts:373,479`）→ "返回结构不完整"，可重试；输出未完整结束 / JSON 无法解析，可重试；`ai()` 内的模型配置变化、授权变化、越权、来源变化（`novel-import.ts:1858,1869`），不可重试。roster 的切分是按单元从中间对半（`:708` 中 `middle=Math.ceil(length/2)`），方案写的是"按章对半"；roster 也没有整步额外请求上限，方案新增了这个上限。非思考模式下 summary 超过 200 字的情况会比思考模式多：fs-r1 的 lines 车道在非思考下失败了 17 次（`lines-timing ok:false`），都是结构问题。
   - 建议：写明切分用 `wizardLinePlan(batch,…,2)`，只得到一段时退回按单元对半（与 `fit` 一致，`:1097`）；summary、content 超长的修整按 lines 车道 `normalizeLinesReply` 的思路，只在 schema 校验前截断并计数（截断是形状修复，不改内容含义）。没有这类修整时，要在方案里说明接受整批重跑的代价，并在用时预算里留出余量。
5. **chapterIndex 由模型给出，跨章单元会产生误丢弃。** `planForeshadowTouches` 用 `touch.chapterIndex` 去找章内唯一引文（`novel-import-foreshadow.ts:38-40`）；`evidence` 由本地锚定到 unit（`novel-import-ai.ts:1150`），但没有检查它和 chapterIndex 是否一致。批次变小后，单元跨章界（`coalesceImportWorkingUnits` 合并单元时不看章界，`desktop/core/novel-import-budget-policy.ts:108`）、模型用批内序号代替全书索引的情况会变多，这些都会落到"原文引文无法唯一定位 / 章节不在所选范围"而被丢弃（基线丢了 7 个）。
   - 建议：commit 时用锚定后的 `evidence`（unitId+quote 在全书中的位置）推出所在章；模型给的 chapterIndex 与之不一致时，以本地推出的为准并计数（记为 dropped 之外的修复计数）。至少要把"不在本批章节"单独计数，便于判断提示词的效果。
6. **"已处理 N 个伏笔"的口径。** (a) `wizardView` 会剥掉 `touchStash`（`desktop/core/novel-import.ts:422`），所以要像 `wizardRosterFound`（`:412-415`）那样在 `toImportView` 里单独算（`:401`），并把 `foreshadowFound` 加进 `ImportWizardView` 类型（`desktop/shared/novel-import.ts:169`）。(b) 这个数是 apply 前不同 key 的数目，没有经过引文丢弃，也没有经过 `evidence.length` 过滤（`novel-import.ts:1239`），完成后的实际伏笔数可能更小。"已处理"这个措辞可以接受，但不能写成"已识别/已导入"。(c) roster 只在 `stepState==='running'` 时给数（`:413`），LineStep 暂停时显示"已暂停"（`src/components/desktop/NovelImportWizard.tsx:180`）。stash 在暂停和失败时都保留，方案应写明暂停、失败时是否显示这个数（建议：暂停时显示，失败时不显示）。(d) roster 文案在 `<p className="ni-w-found" aria-live="polite">` 中（`:115`），LineStep 要用同样的元素，并放在 `.ni-progress-hero` 里，驱动才能采样到。
   - 建议：上面四点写进第5节。fixture `tests/helpers/novel-import-wizard-ui-fixture.tsx:14,31` 只有 `rosterFound`，要新增 `foreshadowFound` 选项（`lineProgress` 目前也没有 fixture，建议一起补）。

## 低

7. `order` 的排序位置：建议只在 `applyForeshadowPlan` 里按 `(order??原位置, 原位置)` 稳定排序，不在每次追加时重排整个 stash（roster 是每次 flush 都重排，`:692-695`，stash 上限 50000 条，`desktop/core/novel-import-wizard-state.ts:67`）。效果相同，检查点里的工作量更小。schema 中 `order` 用 `index`（非负安全整数），并补一条 journal 校验测试：旧会话不带 `order`、新会话带 `order`、负数被拒绝。
8. 暂停：`runForeshadow` 的 catch 会把 AbortError 抛出（`:1224`），并行版本必须像 `runLineParallel` 那样先 `Promise.allSettled` 等所有在途请求结算再抛（`:1204`），否则在途批的提交可能在步骤失败之后才落地。方案第2条已经提到，测试列表里也要列出来（对照 LP-20）。
9. 进度：`wizardLineProgress` 用"相交"判定章是否完成（`desktop/core/novel-import.ts:409`），分批用"单元起点"判定（`novel-import.ts:65`）。跨章单元所在的章要等两批都完成才算完成。进度条显示可以接受，但不能作为判断完整的口径。coverage 键名是 `touches` 而不是步骤名，需要特殊映射。
10. Golden：只有 `legacy-scene:analyze/touches////` 一个键（`tests/fixtures/novel-import-prompt-golden.json:170`），改 touchesContract 后用 `scripts/capture-novel-import-prompt-golden.ts` 重生成。`novel-import-request-trace.json` 中没有 touches，不受影响。新提示词说"本次只分析全书一段章节"，对非向导/legacy 路径同样会生效，因为 touches 只有向导一个调用方，影响可以接受，但应在方案里写明。

## 测试与台账缺口

- 单元测试要新增：touches 走轻量模型（DeepSeek 关闭思考、其它模型降档，对照 `tests/unit/novel-import-roster-ai.test.ts:54-59`），并在 `runInsideLongTask` 中运行；并行批次乱序返回时，stash 顺序和 title/content 与串行一致；可重试错误会切分、单单元批最多尝试 3 次、额外请求不超过上限；不可重试错误停止派发新批，在途批结算后步骤失败，已提交的批保留，重试只发剩余单元；暂停等待在途请求；恢复只发未覆盖单元；`foreshadowFound` 只在 foreshadow 步骤给出，key 按 `normalizeWizardName` 去重；scopeHash 缓存（中3）。
- 回归：NIW-C64a（`tests/unit/novel-import-wizard-session.test.ts:319`）、NIW-C62b（`:614`）、LP-02、WP-02（`tests/unit/novel-import-wizard-prompt.test.ts:24`）、RA-08（`novel-import-roster-ai.test.ts:47`）。
- 浏览器测试：在 foreshadow 步骤运行时断言 `已处理 N 个伏笔` 和 `aria-live="polite"`，暂停视图也要断言（对照 `tests/browser/novel-import-wizard.test.ts:277`）。
- 台账：`docs/requirements-traceability.json` 中还没有 535 条目，要仿照 NI-15 新增一条（第20步 ≤2 分钟、关闭思考已由用户确认、进度文案），写明真实 E2E 证据路径和质量对比结果。这个文件可能有未提交的修改，只能编辑，不能 checkout。

## 结论

方向可行，延续了 lines 车道和 roster 的成熟做法。实现前必须先解决高1：62 批会让伏笔的埋设与回收跨批断开，建议改成 31 批，并给 RESOLVED 和多触点伏笔数设硬指标。中2–6 要写进方案：输出长度约束、`verified` 与 scopeHash 缓存、可重试错误的范围和切分口径、chapterIndex 由本地推出、"已处理"计数的口径与暂停视图。
