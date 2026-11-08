# 531 · 补充细纲导入提速方案

日期：2026-11-08。用户要求：第19步“补充细纲”在《诡秘之主》第一卷（小丑，213 章，760 个工作单元，741017 字）上 ≤2 分钟。

## 1. 计时与质量口径

驱动 `/private/tmp/shakeink-outline-531/launch-outline.mjs <label>`（复制自 517 剧情驱动，`LOTM_OUTLINE=1`，目标只选 角色+世界线+叙事线+大纲，第一卷，隔离根 `~/shakeink-test-roots/cache-522`）。时钟从向导进入 `outline` 起，到离开 `outline` 止，单调时钟 ≤120000 ms，步骤 `done`，页面无错误。

质量（`outline-import-completed.json.quality`）：章级细纲数 = 不同 chapterIndex 数 = 213；coverage 覆盖 760 单元；细纲字数分布；证据条数；第21步 `outlines` 检查（`validateDetailedOutlineAssignments(s,true)`）可通过。

## 2. 基线（ol-r1，HEAD 4330387，真实 E2E）

- 第19步走 `runLine → semanticAnalyzeUnits`，严格串行，每批取满 `profile.characters=81920` 字（约 10 批）。
- 第一批两次生成：输入约 10.8 万 token，输出 27030 / 30900 token（保留思考），每次约 150 s；两次都因 `artifacts.N.facts.chapterIndex` 缺失被严格结构校验拒绝，非证据定位失败不拆分，步骤在 309.8 s 失败，0/213 章。
- 原因：串行、批次大、输出长、保留思考；缺 chapterIndex 无形状修复。

## 3. 修改

1. **细纲进入剧情车道。** `wizardLinesLaneRequest` 的 kind 加入 `outline`（仍要求 `executionLane:'wizard-lines-v1'`、semanticVersion 1、analyze、无 intent）。因此细纲请求：绕过聊天长任务名额；使用轻量策略（DeepSeek 关闭思考，与 2026-11-06 用户对剧情车道的选择一致）；回复走 `normalizeLinesReply`；可带 `linesRepairs`。非向导导入的细纲不带车道，不变。
2. **并行按章分批。** 向导 `runLine('outline')` 改走 `runLineParallel`（kind 类型扩为 `'worldline'|'narrative'|'outline'`），目标批数与叙事线相同（`WIZARD_LINE_CONCURRENCY*2`=62，两波，最长优先），沿用 3R3 拆分/重跑、3R5 慢批提前拆分、步骤额外请求预算、来源复核节奏、暂停时等待在途请求。
3. **按章完整性。** `commit` 对 outline 额外检查（在检查点外、写入前）：
   - 每个 artifact 必须有合法 `chapterIndex`，且该章与本批单元相交；
   - 本批每个相交章节恰有一个章级细纲；缺章或重复时抛 `模型返回结构不完整（chapterIndex）`（可重跑/拆分类别），不提交任何部分；
   - 合并后照旧 `validateDetailedOutlineAssignments({...s,artifacts:merged})`（在检查点内基于最新 artifacts）。
   卷级大纲（无 chapterIndex）在车道里不接受：车道契约要求只返回章级细纲；返回卷级条目视为结构不完整。
4. **标识稳定。** `wizardLineIds` 对 outline：id = `ol-`+`importHash(['outline',chapter.id]).slice(0,16)`，name = `章级细纲·`+chapter.id（内部名，不发布；章级细纲只发布 `text` 到 `chapters[i].outline`）。同章永远同 id/同名，跨批不撞名，重跑幂等。
5. **形状修复（仅车道细纲）。** `normalizeLinesReply` 对 outline：`chapterIndex` 缺失或非整数时，由首个可定位证据的单元起点推出全书章节索引（与叙事线相同规则）；不改正文/内容；不可定位的证据照旧丢弃并计数（至少保留一条）。
6. **提示词（仅车道细纲）。** `wizardLinesContract` 增加 outline 段：本次只分析全书一段章节；本批每一章恰好返回一个章级细纲（facts.chapterIndex 为全书索引），不返回卷级大纲；text 概括本章实际事件、转折与披露，不提前后章事实；可参考 entities 中已有事件与叙事点。原 `<chapter-outline-contract>` 保留。
7. **修复计数。** `lineRepairs` 状态 schema 增加可选 `outline`；`recordLinesRepairs` 对 outline 生成 `kind:'lines'`、label“大纲”的 dropped 记录；清空规则与剧情一致（retryKind、首份清单变化、revise）。

不改：严格字段/证据校验、发布映射、`projectDetailedOutlines`、第21步完整性检查、非向导导入、世界线/叙事线行为。

## 3R. 审核修订（依据 531 review，以本节为准，取代第3节对应条目）

用户 2026-11-08 确认：细纲车道关闭思考，追求 ≤2 分钟（审核中4 已决）。

实测（ol-r1 会话）：760 个工作单元中 210 个跨章界；每章开头平均 441 字（最多 986 字）落在上一章拥有的单元里。叙事线每批输出 p50 2802 token，2 批触及 8192 上限。

1. **按章分批，单元按相交取（高2/高3）。** 新函数 `wizardOutlinePlan(chapters,units,budget,lanes,maxChapters)`（main）：只对“待补章”（没有章级细纲的章）按章顺序装箱，每章的单元为与该章相交的全部单元（与 `wizardLineProgress` 同口径），批内单元去重、按起点排序；同 3R4 二分最小字数上限，批数 ≤ lanes，且每批 ≤ `WIZARD_OUTLINE_MAX_CHAPTERS=6` 章；最长优先。批次不切章；单章装不下 profile 时报“单个导入任务及完整元数据超过模型预算”。边界单元可同时出现在相邻两批，只作原文输入。
2. **目标章（共用口径）。** core 新函数 `outlineTargetChapters(units,chapters)`：返回 `c.start≥units[0].start && c.end≤units.at(-1).end` 的章索引。由第1条构造，批次的目标章恰为装入的章；相邻章即使出现在边界单元里也不算目标。main 的提交检查与 service 的回复修复都用它。
3. **拆分与重跑。** outline 的 `fit`、3R3 失败拆分、3R5 提前拆分都只按目标章对半（`wizardOutlinePlan(目标章,…,2)`）；只剩一章时不按单元切，只重跑一次（`job.rerun`），3R5 不触发。`finishReason:length` 照旧报“模型输出未完整结束”，属可重跑类，会触发对半拆分。
4. **恢复范围（高3）。** `runLine('outline')` 的待处理范围是“没有章级细纲的章”，不是单元 coverage 的差集。coverage 仍按批写入请求单元（进度沿用 `wizardLineProgress`）。
5. **回复修复（高1，仅车道细纲，`normalizeLinesReply`）。** 每项 `facts.chapterIndex`：非负安全整数数字转成十进制字符串（形状修复，不计数）；十进制字符串保留；缺失时由首个可定位证据的单元起点推出章索引（需属目标章），否则保留缺失（随后由提交检查拒绝）；其它值（负数、小数、非数字串）不改，由严格校验拒绝。chapterIndex 合法但不属目标章的条目丢弃，计 `droppedEntries`。`linesRepairs` 与 `w.lineRepairs` 的 schema 加可选非负整数 `droppedEntries`；“合计>0”规则把它算进去。
6. **提交检查（中7/低11）。** outline 在 `commit` 的检查点外先做与叙事线相同的 kind/origin/来源/证据/语义校验，再检查：结果非空，`notFound` 或空数组即报 `模型返回结构不完整（chapterIndex）`；每项有十进制 chapterIndex 且属目标章；目标章各恰一项。检查点内依次是：`adopt.may` → `wizardLineIds` → 合并 → `validateDetailedOutlineAssignments({...s,artifacts:merged})` → 赋值、coverage、计数 → `adopt.won`。任一步抛错都不改 `s`。
7. **标识与名称（中8）。** `wizardLineIds` 对 outline：按校验后的 chapterIndex 取 id `ol-`+`importHash(['outline',chapter.id]).slice(0,16)`，name `第{i+1}章 {chapter.title} 细纲`。同章同 id，跨批、重跑结果一致。
8. **上下文（中6）。** outline 请求的 `contextArtifacts` 排除 outline；`entities` 去掉 worldline/narrative/outline 条目（细纲 facts 只能链接角色/场景/物品）。第3节第6条“可参考 entities 中已有事件与叙事点”删除。
9. **提示词。** 车道细纲契约写明：本批目标章为 chapters 中完整落在本批单元范围内的章；每个目标章恰好返回一个章级细纲，facts.chapterIndex 为全书 0-based 索引的十进制字符串；不返回卷级大纲，也不为相邻章返回细纲；不能返回 notFound；text 概括本章实际事件、转折与披露。主进程同时在 `instruction` 里列出目标章索引与标题（应用生成，不含原文）。
10. **计数与文案（低9）。** `recordLinesRepairs` 接受 outline，label 为“细纲”，增加“丢弃 N 个不属于本批章节的细纲”；`runLine` 去掉 `kind!=='outline'` 条件；类型与 schema 同步加 `outline` 键。
11. **测试（低10）。** LP-22 改为并发 >1 且带车道；同步提示词 golden 和 request trace golden；新增用例：非向导细纲仍串行、不带车道。

## 3R2. 用例审核修订（依据 532 review，以本节为准，取代 3R 对应条目）

1. **目标章显式随批传递（review 高2、中6，取代 3R-2）。** 分批产物是 `{targets:number[],units:ImportUnit[]}`：targets 为本批目标章索引，units 为这些章相交单元的并集。不再从单元范围反推目标章，删除 `outlineTargetChapters`。只有全书相邻的待补章才能进同一批（遇到已有细纲的章就断开），所以已有细纲的章永远不是目标章；短章整章落在跨界单元里时，也只属于显式列出它的那一批。
2. **非目标章在主进程过滤（取代 3R-5 中的“丢弃非目标章”）。** service 不知道目标章，`normalizeLinesReply` 只做形状修复。`commit` 检查前，主进程丢弃 chapterIndex 合法但不属本批目标章的条目，计入 `droppedEntries`（与 linesRepairs 累加，写入 `w.lineRepairs.outline`）。之后照 3R-6 检查：每个目标章恰一项，否则判结构不完整。
3. **缺 chapterIndex 的推断按引文位置（review 高4）。** `normalizeLinesReply` 对缺失项取首个能在其单元 text 中找到的 quote，位置为 `unit.start+unit.text.indexOf(quote)`，所在章即推断的章。找不到时保持缺失。规范十进制只认 `/^(?:0|[1-9]\d*)$/`；`""`、`"05"` 不改，由提交检查拒绝。
4. **批次上限（review 中5）。** 每批章数 ≤6 优先于批数 ≤lanes：先按 6 章上限求最小字数上限；6 章上限下的批数超过 lanes 时，批数照实际取。
5. **指令（review 中10）。** 主进程把目标章写进 instruction（`本批目标章：[{index,title}]`，应用生成）；重跑时 hint 追加在后，不覆盖目标章。
6. **名称（review 低17）。** name 为 `{chapter.title}（第{i+1}章细纲）`；标题为空时为 `第{i+1}章细纲`。chapterIndex 决定 id，name 只为同名判同与冲突文案。
7. **双写防护（review 中9）。** 慢批组的采用规则沿用 3R5；所有 outline 用例都断言每项 text 不含跨回复拼接。

## 4. 风险

- 关闭思考可能降低细纲概括质量；以 213 章全覆盖、字数分布和抽查对比衡量。若用户不接受，可单独为 outline 保留思考（预计无法 ≤120 s）。
- 并行批次看不到彼此的细纲；细纲按章独立，影响小。
- 62 批两波时，尾部由慢批决定；3R5 提前拆分与 r29 剧情经验一致，实测不达标再调目标批数。
