# 531 方案独立审核：补充细纲导入提速

审核对象：`docs/531-outline-import-performance-plan.md`。依据：当前工作树源码（只读）、基线证据 `/private/tmp/shakeink-outline-531/evidence/ol-r1/app-stderr.log`。未运行测试。

## 已确认成立

- 基线描述属实：向导第19步走 `semanticAnalyzeUnits`（`desktop/main/novel-import.ts:1043`），按 `profile.maxUnits/characters` 逐批串行（`:2088`）；ol-r1 第一批两次生成分别输入 108022/108374 token，输出 27030/30900 token，`lane:null`，最后报 `模型返回结构不完整（artifacts.0..5.facts.chapterIndex）`。
- 车道判定只认 kind 白名单：`wizardLinesLaneRequest`（`desktop/service/novel-import-ai.ts:1058`）。加入 `outline` 后，以下几处会自动生效：轻量生成（`:1060-1061`，DeepSeek 关闭思考在 `:1072`）、`normalizeLinesReply`（`:712`）、`takeLinesRepairs` 越权检查（`:1171`）、通道校验（`:885`）、运行时 scopeHash 缓存（`novel-import.ts:1821` 按 `executionLane==='wizard-lines-v1'` 判定），不用另改。
- 重置路径不用改：retryKind、首份清单变化、revise 都整体 `delete w.lineRepairs`，并且清掉 outline 产物和 coverage（`novel-import.ts:1274-1276,1397,1421`）。schema 加上 `outline` 键后自动覆盖。
- 发布不受影响：只有不带 chapterIndex 的细纲会写入卷 summary（`desktop/service/novel-import-publish.ts:117`）；章级细纲经 `projectDetailedOutlines` 写入 `chapters[i].outline`（`desktop/core/novel-import-outline.ts:22-33`），用的是 chapterIndex 和 id，不用 name。
- 合并在检查点内基于最新 artifacts 进行，并有 adopt 防双写（`novel-import.ts:1075-1089`），所以并行批次不会互相覆盖。

## 高

1. **失败原因很可能是"类型错"，不是"缺失"，形状修复写错了方向。** 细纲的 facts 用 `z.record(z.string(),z.string())`（`novel-import-ai.ts:505`），而 outline 没有任何要求必须有 chapterIndex 的 refine：`validateImportSemanticArtifact` 对 outline 不查 chapterIndex，`novel-import-semantics.ts:56` 只列了允许字段。照这个逻辑，真缺 chapterIndex 应该能通过 schema，变成卷级大纲。基线报的路径却是 `facts.chapterIndex`，最可能的解释是模型给了数字 `5`，不是字符串 `"5"`。方案第5条写的是"缺失或非整数时由证据推出"，遇到数字会丢掉模型给的索引、改用证据推断的值，而证据推断在跨章引文时可能错。
   - 建议：先从 ol-r1 拿到失败字段的类型（只记类型，不记值）再定修复规则。修复按这个顺序：非负安全整数数字 → 转成十进制字符串；只有真缺失时才按证据推断；"缺失→推断"另外计数，不和数字转字符串混在一起。测试要覆盖数字、数字字符串、缺失、负数/小数这四种情况。
2. **章节归属口径不一致，会造成跨批重复或误判缺章。** 分批按"单元起点所在章"归属（`novel-import.ts:65`）；方案第3条却写"与本批单元**相交**的章"；进度统计又用重叠判断（`desktop/core/novel-import.ts:408`）。工作单元 `coalesceImportWorkingUnits` 合并相邻单元时不看章界（`desktop/core/novel-import-budget-policy.ts:114`，只限 ≤1000 字），所以一个单元可能从上一章尾部跨到下一章标题。按"相交"判定的话，下一章会被两批同时要求返回细纲：同一个 id 第二次提交时，text 会被拼接（`desktop/core/novel-import.ts:351`），reliability 等字段不同时还会产生 body-body 冲突。
   - 建议：完整性检查只用 `wizardLinePlan` 的口径（单元起点所在章），抽成一个共用函数。模型给出的 chapterIndex 必须属于本批"拥有"的章，否则判结构不完整。补一个测试：单元跨章界、相邻两批的情况。
3. **单章批次会被拆到章内，和"每章恰一条"冲突。** `fit` 和 3R3 失败拆分在 `wizardLinePlan(...,2)` 只得到一段时，退回按单元对半切（`novel-import.ts:1065` 的 `fit`，`:1150` 的 `parts=...slice`）；3R5 提前拆分也一样（`:1121`，只有 `halves.length<2` 时才不拆）。细纲批次切到章内以后，两半各自返回同一章的一份局部细纲。按方案的标识规则它们会撞同一个 id，先后合并时 text 被拼接，结果不是整章概括；如果中途暂停，coverage 只覆盖半章，恢复时还会再生成一次。
   - 建议：outline 车道禁止章内拆分。单章批次失败时只重跑一次（沿用 `job.rerun`），`fit` 对单章超预算直接报错。恢复时的待处理范围改成"还没有章级细纲的章的全部单元"，不再用单元 coverage 差集（现在是 `novel-import.ts:1042` 的 `pending`）。

## 中

4. **关闭思考需要用户另行确认。** 2026-11-06 用户批准的轻量策略只针对世界线/叙事线，那两类产物主要用于检索和关联。细纲不一样，它会直接写进每章 `outline`，作者写作时会用到，属于面向作者的内容。方案第4节自己也承认"可能降低质量"。按 AGENTS.md"新增结论须有证据"和用户已表态的"质量优先"（2026-11-08，缓存方案），不应默认沿用。
   - 建议：实现前向用户确认，并给出对照：同一卷抽 10 章，比较"开思考 vs 关思考"的字数和要点覆盖；或者让 outline 走车道并行，但保留思考，另外测时长。
5. **非思考模式有 8192 输出上限，方案没写进分批约束。** ol-r1 的叙事线已有两批 `finishReason:"length"`，`outputTokens` 正好 8192（`app-stderr.log` 中 op `b917ef3e`、`17d098ea`）。按基线推算，每章细纲（含证据）约 1100–1300 token（27030/约23章，含思考，实际会小一些）。62 批平均 3.4 章、最长批次 3.5 万字以上时，接近这个上限。
   - 建议：批次规划除了字数，再加"每批最多 N 章"（N 由实测输出 token/章 推出，留 2 倍余量）；`length` 归为可拆分失败；质量指标加上"finishReason=length 次数"。
6. **用时估计缺依据。** 同一次 ol-r1 中，第18步叙事线：78 批，最后一批在 97.1 s 结束，9 次失败；最慢的单批 46–60 s；单批最大约 1.37 万字。细纲请求的 `entities` 会带上全部 artifacts 目录（`requestSnapshot`，`novel-import.ts:1723-1731`），比叙事线多了全部叙事点；`contextArtifacts` 还无条件带上所有 outline/world/theme（`:2174`）。并行波次里已提交的细纲会越来越多，后面的请求 prompt 也随之变大。方案"与叙事线相同"的结论没有数据支撑，120 s 的余量大约只有 20 s。
   - 建议：outline 车道的 `contextArtifacts` 排除其他 outline，`entities` 只保留 character/worldline；在方案里写明预期 prompt 大小（先离线统计一次）；方案第6条说"可参考 entities 中已有事件与叙事点"，但 entities 只有 id/kind/name，参考价值很低，这句应删掉，或改为只带本批章节的叙事点摘要。
7. **notFound 与卷级条目的处理要写清楚。** `commit` 现在接受 `notFound`（`novel-import.ts:1077`），而第21步要求每章都有细纲（`desktop/core/novel-import-wizard-checks.ts:24`，`novel-import-outline.ts:19`）。方案只说卷级条目"视为结构不完整"，但第5条的修复会给卷级条目补上 chapterIndex，把它变成章级，随后可能和真正的章级条目重复。
   - 建议：车道细纲遇到 `notFound` 或空数组，一律报结构不完整；卷级条目（模型明确不给 chapterIndex）如果也由修复补上索引，必须在重复检查中能识别出来，不能悄悄变成第二条同章细纲。
8. **标识与名称。** 用 `chapter.id`（就是 `chapter-${i+1}`，`desktop/core/novel-import.ts:172`）推导 id 可行，但必须从**校验后的 chapterIndex** 推出，并且在合并前写入；这条规则方案里应写成明确步骤（`wizardLineIds` 当前签名只接受 worldline/narrative，`novel-import.ts:80`）。名称 `章级细纲·chapter-3` 可能出现在第21步冲突或检查文案里（冲突的 `entity` 字段取自 name，`desktop/core/novel-import.ts:340`），不符合"界面文案来源于真实状态"。
   - 建议：name 改用 `第N章 章节标题 细纲` 的形式。

## 低

9. 修复计数：`runLine` 只对非 outline 写 dropped（`novel-import.ts:1047`），需要去掉这个条件；`IMPORT_LABELS.outline` 是"大纲"（`desktop/shared/novel-import.ts:14`），与"章级细纲"文案不一致，建议 label 用"细纲"。还要同步类型 `ImportWizardState.lineRepairs` 的键（`desktop/core/novel-import-wizard-state.ts:31,65`）、`recordLinesRepairs` 的签名（`novel-import.ts:1016`）和 `runLineParallel` 的签名（`:1061`）。
10. 要改的测试：LP-22（`tests/unit/novel-import-lines-performance.test.ts:388-398`，改成"并发 >1 且带车道"）、提示词 golden（`tests/fixtures/novel-import-prompt-golden.json:60`，键 `analyze//outline///` 会加上车道）、NIW-C05/C11（`tests/unit/novel-import-wizard-session.test.ts:297`，顺序断言保留）。还要新增测试：非向导 `semanticWorkflow` 的细纲仍不带车道、仍串行（`novel-import.ts:2129,2154`）。
11. 方案第3条"合并后在检查点内调用 `validateDetailedOutlineAssignments`"：要写明顺序是 `adopt.may` → 完整性 → 合并 → 校验 → 赋值，校验失败时不改 `s`。可以参照 `semanticAnalyzeUnits` 先算 merged 再赋值的写法（`:2103-2104`）。

## 结论

方向可行，复用剧情车道能解决串行和输出过长的问题。但实现前必须先改高1–3：确认失败字段的真实类型、统一章节归属口径、禁止章内拆分并按章恢复。中4（关闭思考）需要用户确认后再定；中5、中6要写进批次规划和计时依据。
