# 517 · 世界线/叙事线导入提速方案

日期：2026-11-06。用户要求：
1. 导入向导阶段面包屑“线索”改为“剧情”。
2. 第17步“导入世界线”与第18步“导入叙事线”合计 ≤2 分钟（《诡秘之主》第一卷 小丑，213 章，760 个工作单元）。
3. 不以牺牲世界线/叙事线质量为代价。

## 1. 计时与质量口径

驱动 `/private/tmp/shakeink-lines-517/launch-lines.mjs <label>`（复制自 510 设定驱动，`LOTM_LINES=1`，目标只选 角色+世界线+叙事线，第一卷）。时钟从向导进入 `worldline` 起，到离开 `narrative` 止，单调时钟 ≤120000 ms，两步均 `done`，页面无错误。

质量指标（`lines-import-completed.json.quality`，与基线对比）：事件数、不同 lineId 数、带 people 的事件数、叙事点数与覆盖章节数、叙事 refs 总数与悬空数、证据条数、两步 coverage 是否覆盖全部 760 单元。

## 2. 基线（lines-r1，当前工作树，真实 E2E）

| 步骤 | 结果 |
| --- | --- |
| 世界线 | 11 次请求严格串行（`semanticAnalyzeUnits` 每批约 120k 字）；单次 23.6–195.4 s，p50 约 60 s；合计 873 s。10 次成功、1 次纠错后失败被对半拆分重做。 |
| 叙事线 | 串行，单次 111–173 s；第 5 批“模型返回结构不完整（evidence/sourceUnitIds）”单次纠错后仍失败，步骤失败，已用约 816 s。 |
| 质量 | 52 个事件、52 个不同 lineName（每个事件自成一条线）、timeKind 全为 unknown、无父事件；96 个叙事点覆盖 93 章，refs 总数 0。 |

原因：两步走 `runLine → semanticAnalyzeUnits`，逐批 await；请求未进导入调度通道，模型保留默认思考；每批 12 万字使输出很长。

## 3. 修改

1. **向导剧情车道。** 新 `executionLane:'wizard-lines-v1'`，仅当向导会话、`analyze`、无 intent、kind ∈ {worldline,narrative}。服务层 `wizardLinesLaneRequest` 判定；`validateSemanticRequest` 接受它；`runImportGenerationLane` 让它绕过聊天长任务名额（与角色/场景/物品/世界/设定同）。**模型选项默认不变（保留思考）。** 若真实 E2E 证明保留思考无法 ≤120 s，再按第 6 节与用户确认是否对该车道启用 `importRosterModel` 轻量策略。
2. **按章分批、并行。** 向导 `runLine` 的世界线/叙事线改走 `runLineParallel`：
   - 待处理单元按章节归组（单元归属其起点所在章），章节顺序装箱，每批字数上限 `min(profile.characters, ceil(待处理总字数/WIZARD_LINE_CONCURRENCY))`，单元数 ≤`profile.maxUnits`；单章超上限时在章内按单元切开。每批经 `requestSnapshot` + `requestFits` 校验，超预算时继续按单元缩小。
   - 并发上限 `WIZARD_LINE_CONCURRENCY=IMPORT_RUNTIME_MAX_CALLS-1`（31）。请求前一次 `verify(s)`，每个请求 `ai(…,verified=true)`；运行时 scopeHash 对该车道复用 `runtimeScopeCache`。
   - 结果逐批校验（与 `semanticAnalyzeUnits` 相同：kind、origin、来源单元、`validateImportEvidence`、`validateImportSemanticArtifact`，空结果须 `notFound`），再合并提交。提交合并缓冲：一次提交进行中时，后到结果排队，下一次 checkpoint 一并合并，避免 31 次整份日志写入。coverage 与进度按批更新。
   - 失败：某批首发失败且为模型输出类（`worldEntryRerunnable` 或证据无法定位）时同名额重跑一次（证据定位失败时附现有“上一次引文未通过定位校验…”提示）；仍是证据定位失败且单元 ≥2 时对半拆分串行重做（保留现有质量保护）；否则该批失败。任一批失败后不再发送尚未开始的批，在途批次结算并提交成功部分，然后步骤失败（作者“重试”只重做未覆盖单元，现有 coverage 语义）。暂停/取消（AbortError、epoch 变化）照旧抛出。
   - 非向导导入、大纲细纲（outline）不变，仍走 `semanticAnalyzeUnits`。
3. **并行下的标识稳定。** 并行批次看不到彼此的事件/叙事 id，模型可能在不同批次给出相同 id（基线 id 形如 `wl-main-001`），`mergeImportArtifacts` 会报“标识与不同身份重复”。主进程在合并前对本批新建的 worldline/narrative id 做确定性重命名：`wl-`/`nr-` + `importHash([kind, 本批首单元id, 模型id]).slice(0,16)`；同批 `facts.eventId`、`facts.parentId`（指向本批 id 时）同步改写；指向目录已有 id 的引用不变；与会话已有同 kind 同 id 的条目保持原 id（合并语义不变）。
4. **质量保护（仅剧情车道提示词）。** 在现有 `referenceContract` 后追加两句（仅 `wizard-lines-v1`）：
   - worldline：`lineName` 写贯穿本卷的故事线名称（主线或具名支线），不得用单个事件标题；同一故事线在任何批次使用同一 lineName 与 lineId。
   - narrative：本章发生、提及或回忆了 entities 中已有 worldline 事件时，必须在 refs 写入对应 eventId（kind 与 reliability 照契约），不能留空；确无对应事件时才为空数组。
   并在主进程把 worldline 的 `lineId` 规范化为 `line-`+`importHash(NFKC 去空白的 lineName).slice(0,16)`，使不同批次同名故事线归并为同一条线（发布时 `import-world-<lineId>` 即一条世界线）。
5. **面包屑。** `NovelImportWizard.tsx` `STAGES[4]` 由“线索”改为“剧情”；设计稿 `design/novel-import-wizard/wizard.js` 同步。

不改：字段契约与严格校验、证据规则、发布映射、伏笔/细纲步骤、暂停/重试语义、非向导导入。

## 4. 估算

总字数约 74 万，31 批每批约 2.4 万字（约 7 章）。基线 12 万字一批 p50 约 60 s；输出量随批次线性缩小，预计单批 15–40 s，两步各一波，合计约 60–90 s，余量依赖最慢一批。

## 5. 验证

- 单元：车道判定只对向导两类生效；按章分批与字数上限；并行峰值 ≤31 且 >1；结果合并缓冲；失败后不再发新批且成功批 coverage 保留、重试只发未覆盖单元；模型输出类失败重跑一次；id 重命名与引用同步；lineId 规范化；提示词仅车道含新句；面包屑显示“剧情”。
- 全量 `npm test` 与基线对比、typecheck、`build:desktop`。
- 真实 E2E：两步合计 ≤120 s、全部 done、质量指标不低于基线（事件数 ≥52，lineId 数 < 事件数，叙事 refs >0，悬空 0，coverage 全覆盖）。

## 3R. 独立审核后的修订（以本节为准）

审核见 `517-lines-import-performance-plan-review.md`，全部采纳；以下取代第3节对应条目。

1. **合并在串行提交内（高1）。** 每批结果先经第3节校验，再在 `this.serial` 回调内基于当时的 `s.artifacts` 逐批 `mergeImportArtifacts`、`importNativeMappings`、`assertImportSemanticLocks`，成功后更新 artifacts、冲突（推迟到第21步）、coverage 与进度；某批合并抛错只回滚该批并按失败处理。同一次写入内可连续合并多批（合并缓冲），一次 `save()`。
2. **标识（高2、高3、低3）。** 同一性按现有规则（kind+name），不改。提交时对每个候选：若与已有条目 `sameEntity`，沿用已有条目 id；否则用确定性新 id `wl-`/`nr-`+`importHash([kind,本批首单元id,模型id]).slice(0,16)`。同批内 `parentId`/`eventId` 指向本批模型 id 时改写为上述最终 id；指向目录已有 id 的引用不变。同批两条用同一模型 id 时整批按“模型实体标识重复”失败（现有服务层已拒绝，主进程不另放宽）。
3. **跨批合并的冲突（高2）。** 跨批同名事件合并时，`people`（JSON 字符串数组）按并集、`time` 按现有 `unionFactText` 规则调和，仅限 worldline 推断条目；其它字段差异仍是作者冲突。质量指标新增“世界线/叙事线冲突数”，验收要求不高于基线（0）。
4. **不拆章（中8 相关）。** 每批字数上限取 `max(最长章, ceil(待处理总字数/31))`，不超过 profile 上限；章节从不跨批拆开（单章超过 profile 上限时才按单元切，沿用现有切分），因此同一章叙事点只在一批产生，`order` 不会跨批冲突。每批仍经 `requestFits` 校验（含 payload ≤ characters×3），不通过时减章重试。
5. **车道（中4、中7）。** `executionLane` 类型加入 `'wizard-lines-v1'`；`validateSemanticRequest` 接受；`runImportGenerationLane` 绕过长任务名额；**不进** `lightImportGeneration`，`importGenerationModel` 返回原模型选项。`ai()` 里 `runtimeScopeCache` 白名单加入该车道。
6. **来源校验（中5）。** 与 `runEntities` 相同节奏：每 30 s 或每 16 个请求复核一次来源，复核在途共享一个 Promise。
7. **结算（中6）。** 失败、暂停或 epoch 变化后不再发新批；`runLineParallel` 等所有在途请求结算（`Promise.allSettled`）后才抛出。已落盘批次保留 coverage；未落盘批次不计 coverage，恢复/重试时重做。
8. **lineId（低1）。** 规范化只作用于推断 worldline：`line-`+`importHash(NFKC 去空白 lineName).slice(0,16)`；来源复制条目不变。
9. **refs 质量（低2）。** 提示词改为“有对应事件时写 refs，不得为凑数挂接无关事件”；验收除 refs>0、悬空 0 外，抽查 10 个叙事点的 refs 与该章正文一致（人工记录于验证文档）。
10. **用例补充。** 按审核末尾清单补：并行合并不丢、暂停时在途结算、车道模型选项不变、非目标请求带车道被拒、非向导流程回归、payload 预算实测（真实 E2E 记录每批字数与 payload 长度）。

## 3R2. 真实 E2E 后的修订（以本节为准）

lines-r2（保留思考、并行 30 批）：世界线 266 s，叙事线 533 s 后失败；质量较基线提升（290 事件/80 条线/356 refs/0 悬空），但单批 1–2 分钟，保留思考无法 ≤120 s。

1. **轻量策略（用户 2026-11-06 选择“关闭思考”）。** 剧情车道并入 `lightImportGeneration`，与角色/场景/物品/世界/设定车道相同（`importRosterModel`）。取代 3R-5 中“不进 lightImportGeneration”。
2. **仅改形状的回复规范化 `normalizeLinesReply`（服务层，仅剧情车道，每次生成后、严格 schema 前）。** 不改 name/text/reliability/attribution：
   - worldline：去掉多余 `eventId` 与空白 `parentId`；时间值不是有限数（或缺 `timeKind`）时，把原值并入 `time` 文字标签并改为 `timeKind:'unknown'`；缺 `people` 视为 `[]`；`people` 只保留能指向已知角色的引用（未知人物名仍在 text 中）；缺 `lineId` 时取 `lineName`（主进程再按 lineName 统一派生）。
   - narrative：缺 `chapterIndex` 时取首条引文所在章；缺 `order` 时按回复顺序；缺 `refs` 视为 `[]`；`refs` 只保留指向已知事件的条目，`ref.character` 只保留已知角色 id；`narrator` 不是已知角色时去掉（讲述归属仍在 attribution/text）；id 与目录实体 id 相同或同批重复时加后缀（主进程最终重命名）。
   - 共通：知识外键 `characterId/sceneId/itemId` 只保留指向同类目录实体的；引文只在至少一条可定位时丢弃不可定位条目；`sourceUnitIds` 保留本批与引文所在单元；空数组回复补 `notFound:true`。
   - 仍不合规的条目原样交给严格 schema（纠错、重跑、拆分照旧）。
3. **重跑后仍失败的拆分（3R-7 补充）。** 证据定位或结构类失败在重跑后仍失败时，按章对半拆分串行重做，不丢弃。
4. **跨批调和（3R-3 补充）。** 同章同名叙事点的 `refs` 按并集合并（去重，≤500），不再成为作者冲突。
5. **批次大小。** 叙事线回复按章更长，批数按 2×31 规划（两批/名额）；世界线仍按 31。
6. **提示词（3R-9 修订）。** worldline：lineName 写所属故事线、不得等于或改写事件 name、同一故事线用完全相同的 lineName；不要求每章列出全部事件（lines-r12 证实该要求使输出变长、世界线 171 s）。narrative：本批每一章至少一个叙事点。
7. **知识归属保持严格（用户 2026-11-06 选择“保持严格”）。** 非客观事实缺 attribution 仍按原规则拒绝，走纠错/重跑/拆分，不自动填充或清除。未知 facts 字段不剥除（属于静默映射）。
8. **调试行（仅固定文本）。** `lines-batch-fail {kind,units,attempt,reason,paths}`（paths 去掉序号、只含字段名）；`lines-facts-reject`、`lines-link-reject`、`entity-catalog-reject` 只含校验器固定原因与字段路径。

## 3R3. 多轮真实 E2E 与代码审核后的修订（以本节为准，519 审核全部采纳）

依据：r11 103 s 通过；r13/r14/r15/r16 为 207/210/147/264 s（世界线 20–56 s 稳定，叙事线首轮约 16/64 批模型输出类失败，重跑与尾部单次 50–80 s 决定总时长）。

1. **失败即按章拆分（取代 3R2-3 的“重跑后再拆”）。** 多单元批次首次模型输出类失败（`worldEntryRerunnable`）时，按章对半拆分，两半排到共享队列最前，由空闲名额并行发送；单单元批次重跑一次，重跑仍失败则步骤失败。证据定位失败把定位提示带给重跑或两半。**上限：** 每个原始批次最多拆两层（最多 4 份）；第三层仍失败时不再拆，该份改为重跑一次，仍失败则步骤失败（每原始批次最多约 1+2+4+4=11 次请求）。worker 在有在途批次时等待新的半批，不提前退出；名额总数仍 ≤31。
2. **同批重复模型 id 回到严格校验（撤销 3R2-2 的加后缀，519 高2）。** `normalizeLinesReply` 不改 id；服务层照旧报“模型实体标识重复”，走拆分/重跑。叙事 id 与目录实体 id 相同的情况同样不改，交给严格校验。
3. **规范化的丢弃计数并对作者可见（519 高3）。** `normalizeLinesReply` 返回 `{text,counts}`，counts 为 `{droppedEvidence,droppedLinks}`（不可定位引文；未知的 people/narrator/ref/ref.character/知识外键）。`ref.character`、`narrator`、`people` 为唯一角色名时改写为角色 id（形状改写，不计丢弃）。去掉的 narrator 原称谓若不在 attribution 中，则以“讲述者：<原称谓>”追加到 attribution（不丢信息，不计丢弃）。计数经 `linesRepairs` 随结果返回（仅剧情车道，主进程白名单），runLineParallel 按步骤汇总；步骤完成后在 `w.dropped` 记一条 `{kind:'lines',label:'世界线'|'叙事线',reason:'丢弃 X 条无法定位的原文引文、Y 个无法对应已导入实体的关联'}`（只列非零部分），步骤失败或重做时清除；第21步与设定修正同样以 Notice 显示（标题“部分剧情关联已修正”）。`dropped.kind` 枚举增加 `'lines'`。
4. **确定性 id 避让（519 中5）。** `wizardLineIds` 生成的 id 若已被会话中不同 key 的同类条目占用，则在 hash 输入中追加序号重算，直到不冲突。
5. **同章同名叙事点的 order（519 中6、低9）。** 同章同名叙事点合并时 `order` 取较小值（调和，不成冲突）。规范化补的 order 从同批同章已有显式 order 的最大值 +1 起。
6. **people 并集去重（519 低10）。** 合并前把唯一角色名映射为 id 再并集。（规范化已将唯一名改写为 id，合并时仅对 id 去重。）
7. **测试（519 中7）。** LP-08 改为断言首次失败的批次被拆成两份按章不交、且无单元被重复发送超过拆分所需；新增：单单元重跑后仍失败 → 步骤失败；拆分上限；LP-11 暂停后恢复只发未覆盖单元；LP-22 改为驱动非向导会话断言串行；`until` 超时抛错；LP-01 改为观察 `runInsideLongTask` 上下文而非 sleep 竞速。
8. **台账（519 中8）。** `requirements-traceability.json` 新增 NI-13（世界线/叙事线 ≤2 分钟、质量不降、面包屑“剧情”），逐条登记 LP 用例与真实 E2E 状态。

### 3R3 审核修订（review-2，全部采纳，以下取代 3R3 对应条目）

- **高1：不写 attribution。** 去掉未知 narrator 时不追加任何文字，计入 droppedLinks；严格的“非客观事实须有知识归属”规则不受影响（LP-23c 断言非客观、无 attribution、未知 narrator 的条目在规范化后仍无 attribution）。
- **高2：计数持久累计。** 每批 counts 在该批 checkpoint 内累加到 `w.lineRepairs[kind]`（schema 校验，非负整数）；只有 commit 成功的批次计入；暂停/失败后恢复继续累计；仅在线索步骤被重置（retryKind、首份清单变化）时清零。步骤完成时由累计值生成 `w.dropped`（kind:'lines'）。
- **中3：步骤级额外请求预算。** 每步额外请求（拆分份数与重跑）总数 ≤ 初始批数；耗尽后下一次失败直接使步骤失败。
- **中4：order=min 条件。** 仅当两条均为推断、同名同章（chapterIndex 相同，否则按身份规则本就不合并）且 order 未锁定时取较小值；不同名叙事点间的 order 重复是已知边界（不冲突，发布按 order 排序）。
- **低5：id 避让** 检查会话全部 id 与本批已分配 id，最多 |stored|+1 次，超出抛“标识重复”。
- **低6：护栏。** linesRepairs 每次生成前重置；服务层严格 schema（非负、合计>0）；非剧情车道带 linesRepairs 报“越权内容”（LP-26）。
- **低7：** worker 数固定为 min(31, 初始批数)，半批在已有 worker 中轮转；初始批数 ≥30，影响可忽略，记为已知限制。
- **低8：** 改写为 id 只用精确且唯一的角色名（与 `known` 相同，不用别名）；重名不改写并计丢弃（LP-26）。

## 3R4. 批次均衡与调度（以本节为准）

依据 r17/r18（192/196 s）：叙事线 54 批分两波，单批 3.6k–16.5k 字不均（“填满到目标”会超出目标近一倍），最大批 69–78 s 决定两波各自尾部；首波 28 批同时发出，其后新批只在名额空出时补入。

1. **最优连续划分。** `wizardLinePlan` 改为：在按章分组后，二分查找最小的单批上限 C（下界最长章，上界 profile 上限），使贪心按章装箱的批数 ≤ 目标批数；按 C 装箱。批次仍整章、不拆章（单章超 profile 上限时照旧按单元切）。这样同样批数下最大批最小，消除超出目标近一倍的大批。
2. **最长优先发送。** 初始队列按批字数降序（LPT），使大批最先占用名额，第二波由小批填补；拆分出的半批照 3R3 排到队首。批次合并顺序不变（按完成先后、在串行检查点内），结果与发送顺序无关。
3. 世界线目标批数 31，叙事线 62（3R2-5 不变）。

## 3R5. 慢批提前拆分（用户 2026-11-06 选择“提前发送两半”）

依据 lines-r23 逐批计时（`lines-timing`）：世界线 33 份、叙事线 78 份；每步尾部由 1–2 个“挂起 60–76 s 后失败”的原始批次决定（例如世界线 `[0+76 失败 23426 字]` 之后两半 `[76+10]`），同规模正常批次 10–20 s。

1. **触发。** 某原始批次（depth 0、非重跑）在途时间超过 `max(30 s, 2×本步已成功批次耗时中位数)`，且当时有空闲名额、步骤额外请求预算 ≥2 时，按章对半拆分（同 3R3-1），两半立即入队首并发送；原批次继续等待（同一份文字、同一规则，不丢内容）。每个原始批次至多触发一次；单单元或单章批次不触发。
2. **只采用一组。** 原批次与其两半构成一组，三者结果先校验但都在串行检查点内提交：
   - 原批次先成功提交：两半的结果丢弃（不合并、不计 coverage/计数），在途的两半由 `cancelAi` 取消。
   - 两半都已成功提交：原批次结果丢弃，在途原批次取消。
   - 一半已提交而原批次随后成功：原批次结果丢弃（其单元已部分覆盖），只等另一半；另一半失败时按 3R3 拆分/重跑处理。
   提交前在检查点内判定“该组是否已由另一路径采用”，判定与提交在同一串行回调中，所以不会两路都写入。
3. **失败。** 原批次失败而两半已发出：不再另行拆分（两半已覆盖其单元）；两半失败按 3R3 处理。两半失败而原批次成功：采用原批次。被取消的请求（因组已采用）不算步骤失败，也不计入 3R3 预算。
4. **预算与上限。** 提前发出的两半计入 3R3 步骤级额外请求预算；名额仍 ≤31。
5. **调试。** `lines-timing` 增加 `early:true` 标记；新增 `lines-early-split {kind,startMs,chars}`（固定字段）。
6. **验证。** 单元：慢批触发两半、先完成的一路被采用而另一路结果不写入且被取消、原批与两半不会同时提交、触发一次、预算不足不触发、单章不触发；真实 E2E 三轮 ≤120 s 并记录额外请求数。

### 3R4/3R5 审核修订（review-3，以下取代对应条目）

- **高1：** `revise` 清空剧情 coverage 时同时清空 `w.lineRepairs` 与 `kind:'lines'` 的 dropped 记录（与 retryKind、无清单分支一致）。
- **中2（措辞）：** order 取较小值只在整条候选无冲突时生效；不同 chapterIndex 的同名叙事点会在 chapterIndex 上产生冲突，冲突候选不应用任何调和值（LP-16d 补反向用例）。
- **中3：** 补用例：多个批次各失败一次，额外请求总数 ≤ 初始批数；真实 E2E 每轮记录请求总数、拆分数、最大深度（`lines-timing`）。
- **低4（措辞）：** 合并正确性与完成顺序无关；新 id 与冲突的呈现顺序取决于完成先后（3R4 之前已如此）。
- **低6：** 先 `flatMap(fit)` 再按字数降序排序。
- **3R5 高A：** 组内被取消或被放弃的一路以“已被另一路采用”静默结束，不计 debug、不扣预算、不 halt；该判定在 catch 的第一步按组状态进行（不依赖错误文字）。
- **3R5 高B：** 采用判定是提交回调的第一步，在 id 改写、合并、coverage、计数之前；不采用时返回哨兵值而不抛错；组状态只在本次合并成功后才置为已采用（合并抛错时不改组状态）。
- **3R5 中C：** 两半的后代（再拆分的份）继承同一组与“半”角色；原批次被采用后它们的结果一律丢弃并被取消。已知边界：一半已提交后原批次结果即被放弃，若另一半最终失败则步骤失败（不回退到原批次）；不引入暂存，保持单一提交路径。
- **3R5 中D：** 触发阈值按字数归一化：`耗时 > max(下限, 2×中位(已成功批次 ms/字)×本批字数)`，成功样本 <3 时不触发。
- **3R5 中E：** 提前拆分最多使用步骤额外请求预算的一半。
- **3R5 低F：** 计时器在批次结算时清除；回调先检查 halt 与 epoch。

## 6. 风险

- 保留思考时单批可能仍 >60 s。届时给出实测数据，由用户决定是否对剧情车道关闭思考（并以第1节质量指标对比）。
- 跨批同一事件可能重复成两条事件（并行无法互见）；按章分批使跨批事件只出现在批边界章节，记录为已知边界。
