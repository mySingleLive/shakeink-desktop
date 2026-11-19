# 589 · 导入世界线事件时间准确性 代码审核（独立子代理）

审核对象：`docs/589-worldline-event-time-accuracy-plan.md`（以修订 3 为准，对照 §1″、§2′、§3″、§4′）对应的未提交实现：
`desktop/core/novel-import-wizard-timeline.ts`、`desktop/core/novel-import-ai-payload.ts`、`desktop/main/novel-import.ts`、`tests/helpers/novel-import-wizard-fixture.ts`、`tests/unit/novel-import-worldline-timeline.test.ts`。`docs/requirements-traceability.json` 未审。

已执行（只读，Node v24.18.0）：
- `node --import tsx --test tests/unit/novel-import-worldline-timeline.test.ts`：66/66 通过（含 EC-30～EC-100、WT-01 起的本文件用例、WG-14、全部 TA-*）。
- `node --import tsx --test tests/unit/novel-import-lines-performance.test.ts tests/unit/novel-import-conflict-choices.test.ts`：71/71 通过（含这两个文件里的 WT-*、LP-*）。
- `npm run typecheck`：通过。
- `node --import tsx scripts/capture-novel-import-prompt-golden.ts --check`：**`prompt golden changed`**。用临时副本（写到 `/tmp`，已删除）逐键比较，只有 `legacy-scene:analyze/timeline/worldline///` 一个键不同，而且只是 prompt 哈希不同，payload 哈希相同。
- 临时探针（`/tmp/rv589/*.ts`，只调用导出函数，不改仓库）：
  - 3 万例随机输入，包括未标 phase、越界章、非法日、present 缺失、多纪元。结果有 0 例不严格递增，0 例出现非有限值。
  - 按用例逐个比较 HEAD 与当前实现（HEAD 版本从 `git show HEAD:` 导出到 `/tmp`）。
  - 针对 `worldTimelineDateClues` 的边界输入。
- `git diff tests` 只删除了 `timelineCatalog` 一行（改成只解析第一行），已有断言没有被放宽或删除。
- 没有运行集成测试 `tests/integration/novel-import-wizard-publish.test.ts`，也没有运行全量测试、构建或应用。

## 必须修改

### M1 `worldTimelineDateClues` 用遮蔽后字符串的 UTF-16 下标定位章节；引号内有非 BMP 字符时会定位到更早的章

`desktop/core/novel-import-wizard-timeline.ts:129-134`。`chars` 按码点拆分，引号内每个码点都换成一个 `\u0000`（1 个 UTF-16 单元）。引号内的表情或扩展 B 区汉字原本占 2 个单元，遮蔽后只占 1 个，所以 `masked` 的 UTF-16 长度比 `unit.text` 短。`unit.start+m.index` 用的是 `masked` 的下标，而 `unit.start` 和 `chapters` 都是原文的 UTF-16 坐标（`source-body-utf16-v1`）。

探针：单元文字为 `“😀×10”他走了。六月底的渡口。`，章边界在 20。原文中 `六月底` 的下标是 26，属于第 1 章，输出却是 `[0,"六月底的渡口"]`。`at`（码点下标，用于截取片段）是对的，只有章节定位错了。

改法：保留原文码点数组 `orig=[...unit.text]`，用 `unit.start+orig.slice(0,at).join('').length` 定位章节。也可以让遮蔽保持单元长度（`HIDE.repeat(c.length)`），但这样 `at` 的算法也要一起改。补一个引号内含非 BMP 字符、并且跨章节边界的用例。

### M2 主线区里只有纪元的锚点被当作“主线锚点”：主线落到故事年之前，末段按 10 年摊开

`desktop/core/novel-import-wizard-timeline.ts:393-403`（只有纪元的名次的放置循环）与 `:420-425`（`mainBefore=p>=firstMain`，B 段精度取 `precision[p]`）。

模型给主线事件只写 `era:"第五纪"`、不写年份，是常见的回复。这时这个名次先被只有纪元的放置循环放在 `(上一个点, 纪元终点)` 的中点，精度为 `era`。`fillMainZone` 把它当作已放置的主线名次 P，走 B 段，于是：
- 探针（present 第五纪1349，前史 `ago:170`，主线 `era:第五纪`（章 0），主线（章 1），主线（章 2））：主线约在 **1337 年**，早于 floor（1349-01-01），TR-01 判定不通过。把只有纪元的主线换到第 2 个名次，第 1 个主线约在 1258 年。
- B 段精度沿用 `era`。末段同章的值相等，`interpolate` 按 `STEP.era`（10 年）摊开，探针中末尾三个同章主线相差约 3.3 年。

规范 §3″ 写的是“lo 是 i 之前最后一个已放置的值”，没有区分只有纪元的放置。实现照字面做了，但这样违背了 §3″ 的目的（主线从故事年或主线锚点起逐章排）。改法（需要在方案中补一句）：在 `fillMainZone` 里，只把 `own[p]` 为真的点当作“主线锚点”（`mainBefore=p>=firstMain&&own[p]`），只有纪元的点只作为 lo 下界；或者让只有纪元的放置循环在 `i>=firstMain`、名次属于 present 纪元并且 floor 已知时，取 `lo=max(lo,floor)`。补用例：上面两种排列都断言主线 `>=D(1349)`，相邻同章的差 `<=1天`。

### M3 B/C 段末尾同章的一段相等值按锚点精度摊开，最后一章的事件可以散到一个月或一年之后

`desktop/core/novel-import-wizard-timeline.ts:425,428` 与 `interpolate` 等值摊开规则（`:466` 附近，`width=min(next-v,finest)`）。B/C 段让同章的名次取同一个值。它们是全序列最后一段时 `next=+∞`，摊开宽度就是该段精度的步长：
- C 段精度为 `year`：探针（前史 `ago:170` 后接 4 个章 5 的主线）的值依次是 floor 之后第 0、91、183、274 天，即 1349 年 1 月到 10 月。
- B 段接在月精度锚点之后：同章三个依次相差约 10 天。

§3″ 的意思是“同章同值”（同一天）。TA-06 只覆盖了中间段（`next` 是第二天），没有覆盖末段。第一卷最后一章的主线如果都在最后一个锚点之后，就会遇到这个问题。改法：`fillMainZone` 写入同章值时直接在当天内拉开（例如同章第 x 个取 `v+DAY*x/(同章数)`，并且不超过 hi），不再依赖 `interpolate` 的精度宽度；或者把 B/C 段的摊开宽度限制为 1 天。精度标签可以保持规范要求的 year/P 精度。补用例：C 段与 B（month）段末尾 4 个同章，断言最大值减最小值 `<DAY`。

### M4 新规则把 carry 改成故事年后，旧 R8 分支会把它套到另一个纪元：原来正确的前史月份被过滤掉

`desktop/core/novel-import-wizard-timeline.ts:301`（新分支更新 `carryEra/carryYear`，这一步符合 §1″ 最后一条）与 `:306-310`（旧分支 `year=carryYear`，没有检查 `carryEra` 与名次自己的纪元是否相同）。

探针（twoEras，present 赤铜纪1349）：前史 `青石纪20年`（章 0）→ 前史 `5月`（章 3）→ 前史 `青石纪 七月`（章 4）。
- HEAD：`青石纪20年 | 青石纪20年5月 | 青石纪20年7月`。
- 当前：`青石纪20年 | 赤铜纪1349年5月 | 赤铜纪1349年5月（按先后推定）`。第 3 个名次得到“青石纪1349年7月”，被纪元过滤判为倒退，时间全部删除。

TA-04c 只测了两个名次紧挨着的情况。旧分支“自己的纪元配上别的纪元的年份”是原有缺陷，但新规则让 carry 更常是故事年，使这个缺陷成了对已有行为的回归（违反 C2）。改法：旧分支在 `eraOf[i]>=0&&carryEra!==eraOf[i]` 时，不用 `carryYear`，改用该纪元最近一次写明或继承的年份（按纪元记 `lastYearOf[era]`，没有记录时退回 `firstDated` 或 present 规则）。补上面这个三名次用例。

### M5 未标 phase 的历史年份通过“非前史章状态”给同章的主线定年，并改写主线链

`desktop/core/novel-import-wizard-timeline.ts:287,292-295`。写明年份的名次不管 `setsMain` 结果如何，都会写入非前史章状态；规则 1 读到这个状态后，`phase==='主线'` 的名次满足 `setsMain`，于是把主线链设成该年。

探针（present 1349）：未标 `赤铜纪1300年`（章 0）→ 主线 `7月`（章 0）→ 主线 `8月`（章 5），结果是 `1300年 | 1300年7月 | 1300年8月`。整段主线被带到 1300 年。§1″ 把 `setsMain` 限制为“非前史且年份不早于 present.year”，目的是让补回的未标名次写着历史年份时不改主线（审核建议 4）。这条路径绕过了这个限制。

改法：章状态记录写入者是否满足 `setsMain`（`{era,year,last,main:boolean}`）。`phase==='主线'` 的名次只采用 `main` 为真的状态，否则走规则 3；未标 phase 的名次仍可以采用任意非前史状态，TA-04b 的第 3 种情况保持 1300-07-09。补上面这个用例，断言主线为 1349-07、1349-08。

### M6 prompt golden 未更新；方案审核中“golden 没有 timeline 提示词”的说法不对

`tests/fixtures/novel-import-prompt-golden.json:176` 中有 `legacy-scene:analyze/timeline/worldline///`，`--check` 现在失败。580/587 的约定是：提示文本有改动时同步更新 golden，并证明其它键逐字节不变。改法：按 587 的做法移走旧文件后重新生成（脚本使用 `wx`），确认只有这一个键的 prompt 哈希变化、payload 哈希不变，并在方案“影响面”中补上这一项，同时更正 `docs/589-…-plan-review.md:52` 的说法。

### M7 TA-10 没有驱动 `runWorldTimeline`：instruction 拼接、`chapterCount` 传参、调试行都没有测试

`tests/unit/novel-import-worldline-timeline.test.ts:466-473` 用手写的 instruction 验证 `timelineCatalog`，并单独调用 `orderWorldTimeline(…,4)`。方案的 TA-10 要求“`runWorldTimeline` 请求 instruction 含日期线索段”，但 `desktop/main/novel-import.ts:1214-1215,1225` 的拼接和 `s.chapters.length` 传参都没有测到。golden 中 timeline 的 payload 哈希没有变，也说明夹具正文里没有日期线索，现有的流程测试不会走到这一段。改法：用夹具（`tests/helpers/novel-import-wizard-fixture.ts`）跑一次只选世界线的流程，正文含一句旁白 `六月底…` 和一句对白 `“七月初…”`。断言 timeline 请求的 instruction 第 3 行以日期线索前缀开头，JSON 中只有旁白一条，章索引正确，`timelineCatalog` 仍能解析。

## 建议

### S1 “今天是”分支会收进“百年/十年”这类非日期

`desktop/core/novel-import-wizard-timeline.ts:125`。`[0-9零〇一二三四五六七八九十百千]{1,7}年` 会匹配 `今天是百年难遇的大雨`、`今天是十年来最冷的一天`（探针两条都收了）。这些片段只发给模型，影响不大，但会占用 80 条名额。改法：年份要求 3～4 位数字，或者中文数字经 `cnNumber` 换算后 `>=1`，并且后面不是 `来|前|后|难|一遇`。日也没有校验（`6月99日` 会被收），可以对 `[日号]` 前的数字限制为 1～31。

### S2 去重只按片段：后一章的同一句旁白失去章号

`:137`。`seen` 只以 clip 为键。探针中第 1 章重复出现的“六月底的渡口”被丢掉，模型只看到第 0 章这一条。改法：去重键改为 `chapter+'\u0000'+clip`。

### S3 C 段使前史无时间名次的位置大幅改变（规范没有写明）

前史 `ago:170` → 两个无时间前史 → 主线（C 段）：HEAD 为 `1179 | 1180 | 1180 | 1181 | 1182`，当前为 `1179 | 1235 | 1292 | 1349 | 1349`。前史名次现在在 1179～1349 之间线性均分。两种做法都是估计，但第一卷有约 1000 个“按先后推定”的前史事件，读回的年份分布会明显变化。建议在方案 §3″ 中写明，并在 TR 中报告前史推定值的分布，避免把它误判为回归。

### S4 提示词措辞

`desktop/core/novel-import-ai-payload.ts:166`。“主线事件要尽量给出year、month、day”和前文“不得编造”有些冲突。建议在句末补一句“无法由原文或线索推算时不写”。另外，“表示该章正文当时的季节或日期”对出现在回忆旁白中的线索说得过满，可以改成“通常表示”。

### S5 调试行

`desktop/main/novel-import.ts:1238-1240` 只输出 id（`wl-<哈希>`）、固定枚举 `前史/主线` 和数字，不含正文和纪元名，符合 §4′。phase 是两个固定中文词，不是小说文本，可以接受。

## 已核对、无问题

- **严格递增与非有限值**：`fillMainZone` 中 hi 只有在 `j+1=n` 时取 +∞，此时只走 B/C 段。B 段的 lo 一定有限。C 段在 lo 为 −∞ 时取 floor，floor 也不存在时不处理。D 段回退时，`a` 为 undefined 就不处理。在不处理的情况下，名次交给 `interpolate` 按原规则步进。B/C/D 写入的值都在 `[lo,hi)` 内且不减。与 lo 或 hi 相等的情况（`lo===hi` 的等值锚点、同章同值）由等值摊开规则在 `[v,next)` 内拉开。3 万例随机输入加上 TA-11 的 2000 例都没有违例。
- **§1″ 的分支**：生效条件 `presentYear!==undefined&&(eraOf<0||eraOf===presentIndex)`；名次自己是 present 纪元、本章状态是其它纪元时，不采用本章状态，转到规则 2/3。章状态分前史和非前史两份，缺失或越界的章不读不写（`orderWorldTimeline` 用 `chapterCount` 去掉了 `chapters.length` 哨兵）。规则 2 不写任何状态。规则 3 先按 `mainLast>=10&&month<=3` 判断进年，再写主线链和本章状态。`setsMain` 与规范一致。规则 1 只在 present 纪元且满足 `setsMain` 时才改主线链，比规范更严格，与审核建议 4 的方向一致（但见 M5）。
- **§2′**：`phase==='主线'` 的 `ago` 在 `placeRanks` 入口被删除，前史不变（TA-05）。
- **§4′**：引号状态按单元重置；`“”「」『』` 被遮蔽，并且是片段的截断点，所以片段里不会混入对白；阿拉伯数字和中文数字月份都收，并校验 1～12；无法定位章的单元不输出。`timelineCatalog` 只解析第一行是安全的：`JSON.stringify` 生成的目录不含原始换行。
- `chapterIndex` 在 `mergeWorldTimelineSegments` 中通过 `...r` 保留下来，没有写入会话状态，不需要迁移。

## 结论

**需修改后再审。** M1（章节定位）、M4（已有行为回归）、M5（绕过 setsMain）是实现层面的错误。M2、M3 是修订 3 没有覆盖到的情况，会直接影响 TR-01 和“同章同日”，需要先在方案中补一句规则，再改代码。M6、M7 是验证缺口。严格递增在所有探查到的路径上都成立，S1～S5 可以与上述修改一并处理。

## 第 2 轮

审核对象：方案“修订 4”对应的工作区改动，范围限于 `worldTimelineDateClues`、`placeRanks` 月日循环（`ChapterYear.main`、`eraYear`、589 分支的新进入条件）、`fillMainZone`（自有点规则、`spread`）、提示词、新增用例 589-M1…M5 与 TA-10c。

已执行（只读，Node v24.18.0）：
- `node --import tsx --test tests/unit/novel-import-worldline-timeline.test.ts`：71/71 通过。
- `node --import tsx --test --test-name-pattern="TA-10c" tests/integration/novel-import-wizard-publish.test.ts`：1/1 通过。
- `node --import tsx scripts/capture-novel-import-prompt-golden.ts --check`：`prompt golden unchanged 26 groups 38 requests`。`git diff tests/fixtures` 只改了 timeline 键的 prompt 哈希这一行。
- 重跑第 1 轮的探针（`/tmp/rv589b`，已删除）：
  - 3 万例随机输入：0 例不严格递增，0 例出现非有限值。
  - HEAD 与当前实现逐例比较：M4 用例恢复为 `青石纪20年 | 青石纪20年5月 | 青石纪20年7月`，与 HEAD 相同。M5 用例得到 `1300 | 1349-07 | 1349-08`。M2 两种排列的主线都在 1349 年。
  - 末段同章名次：C 段四个依次为 floor 后第 0、0.25、0.5、0.75 天。B 段（month 锚点）同章三个在锚点当天内，下一章从 +1 天开始。
  - 日期线索：引号内有表情时，章节定位正确（`[1,"六月底的渡口"]`）。`今天是1349年7月`、`今天是一三四九年七月` 收入，`十二月三十二日` 不收。
- 没有运行全量测试和构建（协调者的全量测试正在后台运行）。

### 第 1 轮意见的处理

| 编号 | 结论 |
|---|---|
| M1 | 已修复：`desktop/core/novel-import-wizard-timeline.ts` 中用 `source.slice(0,at).join('').length` 换算 UTF-16 偏移，589-M1 覆盖 |
| M2 | 修复范围过宽，见 R2-M1 |
| M3 | 已修复：`spread` 把同值一段放在 `[base,base+1天)` 内，与锚点同值时排在锚点之后；下一章的值是 `base+1天`，不会相撞 |
| M4 | 已修复：`eraYear` 按纪元记录最近年份；不带纪元的前史月日在 carry 是更早纪元时走旧分支 |
| M5 | 已修复：`ChapterYear.main`；主线月日只采用 `main` 为真的章状态 |
| M6 | 已修复：golden 只改了一行，`--check` 通过 |
| M7 | 已修复：TA-10c 走完整的世界线流程 |
| S1、S2、S4 | 已处理 |

### 必须修改

#### R2-M1 M2 的修复把主线区所有只有纪元的放置都清空，包括非 present 纪元：模型写明的后一纪元丢失

`desktop/core/novel-import-wizard-timeline.ts:433`。条件只检查 `!own[k]&&phase!=='前史'`，不看纪元。探针（`{第五纪, 第六纪}`，present 第五纪1349）：
- 主线 `第五纪1349年7月`（章 0）→ 主线（章 1）→ 主线 `era:第六纪`（章 2）→ 主线（章 3）。HEAD 为 `… | 第六纪* | 第六纪*`；当前为 `… | 第五纪1349年7月* | 第五纪1349年7月*`，第六纪丢失。
- 主线 `第五纪1349年7月` → 主线 `era:第六纪` → 主线 `第六纪3年`。当前第 2 个名次落在 `第五纪1423年`，标签纪元与模型给的不一致。

第 1 轮 M2 的问题只出在 **present 纪元** 的只有纪元的放置（被放在纪元中点，早于故事年）。其它纪元的只有纪元的放置是模型给出的有效信息，原有规则（docs/574 #1）保证它落在该纪元范围内。改法：把 `eraOf` 传入 `fillMainZone`，只清空 `eraOf[k]===presentIndex` 的放置，或者只清空值 `<floor` 的放置。方案修订 4 的 M2 条目同步写明“present 纪元”。补用例：上面两种排列都断言 `label` 以 `第六纪` 开头，并且严格递增。

### 建议

#### R2-S1 修订 4 的 M4 例外使原始问题 1 在“历史年份属于更早纪元”时仍会出现

`:300` 的进入条件：不带纪元的前史月日，在 carry 是更早纪元时走旧分支。探针（`{第四纪, 第五纪}`）：前史 `第四纪1198年`（章 3）→ 前史 `5月29日`、`6月25日`（章 8）→ 主线 `6月28日`（章 8），得到 `第四纪1198年5月29日 | 第四纪1198年6月25日 | 第五纪1349年6月28日`，也就是方案“现状”第 1 条的问题，只是换成了跨纪元的形式。《诡秘之主》第一卷的罗塞尔是第五纪，不受影响，TR 不会发现。这是保留 HEAD 行为（C2）和修复问题 1 之间的取舍：同一章写了更早纪元年份时沿用它是合理的，跨章时则不一定。建议这个例外只在同一章（前史章状态的 `era` 是更早纪元）时生效，跨章仍取 `present.year`。M4 用例（第 3、4 章）在这种做法下会改变，所以需要先在方案中做出决定；如果维持现状，就在方案中把它写为已知限制。

#### R2-S2 TA-10c 的残留代码

`tests/integration/novel-import-wizard-publish.test.ts:107-108`：`body` 只用于 `void body`，可以删除。断言 `c[0]===0` 已经覆盖了章索引。如果夹具正文的第 1 章不是第 0 章（例如前面有序章），这个断言的含义会变，建议注释说明夹具中“之夜。”位于第 0 章。

#### R2-S3 589-M2 用例只覆盖 present 纪元

在 R2-M1 的改动中补上非 present 纪元的用例，防止以后再次出现过宽的清空。

### 已核对、无问题

- `spread` 在 B/C 段内对每组同值执行一次。lead 只在组的值等于锚点值时为 1，所以组内的值在 `(锚点, 锚点+1天)` 内；下一章的值至少是 `base+1天`，因此严格递增，而且 `interpolate` 不会再按年或月的宽度摊开。B 段接两个相等锚点时，`interpolate` 再在 `[v, 已拉开的值)` 内摊开，探针结果 `181 | 181.25 | 181.5`，严格递增。
- 自有点规则：`mainBefore=p>=firstMain&&own[p]`。清空后的点 `precision` 也置为 undefined，A/D 段与 `interpolate` 不会读到残留精度。
- `ChapterYear.main`：写明年份时为 `eraOf===presentIndex&&setsMain`；规则 3 写入时为 true；规则 1 由非前史名次采用、并满足 `setsMain` 时置为 true。未标 phase 的名次仍可采用 `main=false` 的状态（TA-04b 第 3 种情况保持 1300-07-09）。
- 旧分支的 `same`：carry 与名次纪元相同时沿用 carry（HEAD 行为）；不同时取 `eraYear.get(era)`，没有记录时退回 `firstDated` 或 `presentYear`。`carry()` 在所有分支都更新 `eraYear`。
- 提示词新增“由原文和线索推算不出时不写”“通常表示”，与“不得编造”一致。调试行没有改动。

### 结论

**需修改后再审（只剩 R2-M1）。** R2-M1 是修订 4 引入的新回归：模型写明的非 present 纪元被丢弃。改动很小（清空条件加上 present 纪元），补上用例后可以通过，不需要再完整审一轮。R2-S1 需要在方案中做出决定或记为已知限制。
