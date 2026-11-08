# 532 · 补充细纲导入提速用例

依据 `531-outline-import-performance-plan.md`（以 3R 为准）。合成数据，不含真实正文或 Key。单元测试文件：`tests/unit/novel-import-outline-performance.test.ts`；回归：`tests/unit/novel-import-lines-performance.test.ts`、`tests/unit/novel-import-wizard-session.test.ts`、`tests/unit/novel-import-outline.test.ts`、提示词/请求 golden 检查。

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| OP-01 | 车道判定 | `wizardLinesLaneRequest` 对 `kind:'outline'`+车道+semanticVersion 1+analyze+无 intent 为真；`importGenerationModel` 对 DeepSeek 关闭思考，其他 providerOptions 保留；kind outline 不带车道、phase review、带 intent 时为假；带车道但不符时请求校验报“导入调度通道无效”。 |
| OP-02 | 分批（3R-1） | 64 章合成正文、单元跨章界：`wizardOutlinePlan` 每批章连续且只含待补章；全部批目标章并集 = 待补章且不重；每批 ≤6 章、批数 ≤ lanes；批内单元 = 目标章相交单元（去重、有序）；最长优先；字数上限为满足批数的最小值。单章超 profile 抛预算错误。 |
| OP-03 | 目标章口径（3R-2） | `outlineTargetChapters`：边界单元跨入的相邻章不算目标；批次构造出的目标章恰为装入的章。 |
| OP-04 | 并行与完成 | 64 章：outline 请求在途峰值 >1 且 ≤31，全部带 `executionLane:'wizard-lines-v1'`；步骤 done；每章恰一个章级细纲，id 为 `ol-`+hash(chapter.id)，name 为 `第N章 标题 细纲`；`lineProgress.done===total`；首个 outline 请求晚于叙事线全部结算。 |
| OP-05 | 修复 chapterIndex（3R-5） | 数字 5 → `"5"`（不计数）；`"5"` 不变；缺失 → 由证据单元推出（属目标章）；缺失且证据不可定位 → 保持缺失；`-1`/`1.5`/`"x"` 不改；合法但非目标章 → 丢弃并计 `droppedEntries`；正文、name、其它 facts 不改；有效回复返回 undefined。 |
| OP-06 | 提交检查（3R-6） | 回复缺目标章、同章两项、`notFound:true`、空数组、chapterIndex 缺失：都报 `模型返回结构不完整（chapterIndex）`，该批不写入 artifacts/coverage；随后按 3R3 拆分或重跑，最终 done 时每章恰一项。 |
| OP-07 | 拆分不切章（3R-3） | 多章批结构失败 → 按章对半，各半目标章不重且并集为原批；单章批失败一次 → 同章重跑一次后 done；单章批持续失败 → 步骤 failed，且任何请求都不会只含半章目标。 |
| OP-08 | 慢批提前拆分 | 沿用 LP-27 场景：慢 outline 批发出按章两半，采用一组；单章批不触发。 |
| OP-09 | 恢复范围（3R-4） | 一批持续失败使步骤 failed 后，作者“重试”只发送仍缺细纲的章；已有细纲的章不再请求；最终每章恰一项。 |
| OP-10 | 上下文（3R-8） | outline 请求的 `artifacts` 不含 outline；`entities` 不含 worldline/narrative/outline，仍含角色。 |
| OP-11 | 提示词（3R-9） | 车道细纲 prompt 含目标章、“恰好一个”“不返回卷级大纲”“不能返回notFound”规则，instruction 列出目标章索引与标题；非车道细纲 prompt 不含这些规则；世界线/叙事线车道 prompt 不变。 |
| OP-12 | 计数与文案（3R-10） | 有修复时步骤完成后 `w.dropped` 含 `{kind:'lines',label:'细纲'}` 及“丢弃 N 条无法定位的原文引文/丢弃 N 个不属于本批章节的细纲”；`linesRepairs` 只在车道接受，`droppedEntries` 进入 schema；返回到前面清单时清空。 |
| OP-13 | 暂停 | 在途 outline 请求时暂停：等待全部在途请求结束，步骤不标 failed；恢复后只请求缺细纲的章。 |
| OP-14 | 非向导回归（3R-11） | 非向导 `semanticWorkflow` 的 outline 仍串行（峰值 1）、不带车道；原 LP-22 改为本用例与 OP-04。 |
| OP-15 | 回归 | NIW-C05/C11 顺序与章节范围、`novel-import-outline.test.ts`、发布映射、提示词 golden（`--check`，只更新向导细纲键）与 request trace golden 全部通过；全量 `npm test` 通过。 |
| OP-REAL | 真实 E2E | `launch-outline.mjs`：《诡秘之主》第一卷，第19步 ≤120000 ms，done，213 章各一项细纲，coverage 760，页面无错误；三轮记录时长、请求数、失败/拆分数、细纲字数分布；抽 10 章人工比对与原文一致。 |

## R. 审核修订（依据 532 review，与 531 3R2 一致；与上表冲突时以本节为准）

- **夹具：** `linesAi` 的 outline 分支只为请求的目标章各返回一项（目标章从主进程 instruction 的 `本批目标章` JSON 解析，没有时退回为所有相交章，供非向导流程使用），text 为 `第i章细纲`，证据取该章自身的文字。`isLine`/`gate` 的 peaks 加 outline；新增 `toOutline`（targets 含 outline）。每个用例开头断言：`workingUnits` 中至少一个单元跨章界。
- **OP-02（改）：** 纯函数 `wizardOutlinePlan`：(a) 64 章 lanes=62：批数 ≤62，每批 ≤6 章；(b) 64 章 lanes=4：每批 ≤6 章、批数 11（章数上限优先）；(c) 待补章 {3,7}：分成两批，任何批的 targets 不含已有细纲的章；(d) 构造跨界单元、第 k 章 200 字整章落在一个跨 k-1..k+1 的单元里：各批 targets 两两不相交，并集为待补章，units 含各目标章的全部相交单元；(e) 小夹具暴力枚举，最大批字数等于可行最小值。
- **OP-03（改）：** 目标章来自批次的 targets，不再测 `outlineTargetChapters`；改测主进程过滤：回复里带非目标章（controller 层，不经 normalize）时丢弃并计 `droppedEntries`，目标章完整时批次被接受。
- **OP-05（补）：** 缺 chapterIndex，引文在跨界单元里属于下一章的那段 → 推出下一章；`""`/`"05"` 不改；全部条目缺失且无法定位 → 保持缺失（提交时报结构不完整）。`linesRepairsSchema`：`{droppedEvidence:0,droppedLinks:0,droppedEntries:1}` 接受，全 0 或负数拒绝；不带 droppedEntries 的旧日志仍能通过 `validJournal`。
- **OP-06（补）：** 检查点内 `validateDetailedOutlineAssignments` 抛错（来源已有同章章级细纲、id 不同）时该批不写入，其它批保留；来源复制的章级细纲算已有细纲，该章不再请求。
- **OP-07（补）：** 多章批抛 `模型输出未完整结束` → 按章对半；单章批抛同样错误 → 重跑一次，单元集合与原批完全相同。所有 outline 请求都满足：targets 非空，每个目标章的全部相交单元都在 `r.units` 里。
- **OP-08b/08c（新）：** LP-28（原批先返回，两半被丢弃）与 LP-29（两半都失败，采用原批）的 outline 版本；断言每项 text 等于 `第i章细纲`，没有拼接。
- **OP-09b（新）：** `injectJournalEdit` 把 coverage.outline 设为全部单元、删除第 k 章细纲，`verifyAgain` 后只发出 targets=[k] 的请求，最终每章一项；反向：coverage 为空、各章都有细纲时不发 outline 请求。
- **OP-11（补）：** 引文定位失败后的重跑请求，instruction 同时含 `本批目标章` 与 anchorHint。
- **OP-12（补）：** 两批各丢 1 条非目标章 → 文案“丢弃 2 个不属于本批章节的细纲”。
- **OP-04（补）：** 走到 verify，`outlines` 检查通过，值为 `64 / 64 章`；name 为 `{title}（第N章细纲）`。
- **OP-10（补）：** entities 仍含角色/场景/物品；artifacts 仍含 world/theme。
- **OP-01（补）：** 修改 LP-02，outline 从拒绝列表移到接受列表。
- **OP-14（补）：** 非向导流程用 `tests/unit/novel-import-session.test.ts` 的现有夹具驱动 `semanticWorkflow`，在 ai 回调里测 outline 在途峰值为 1，且请求不带车道。
- **OP-15（改）：** 删除 prompt golden 后重新生成，`git diff` 只应是 `legacy-scene:analyze//outline///` 换成带车道的键，其余逐字节不变；request trace 用 `--check`，traceOk 与 hashOk 均为 true。
- **OP-REAL（补）：** 记录 finishReason=length 次数、outline 请求 promptChars p50/max、真实会话第21步 outlines 检查结果；以每个新会话的首轮为准。
