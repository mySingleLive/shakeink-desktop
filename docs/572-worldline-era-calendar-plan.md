# 572 · 世界线按小说纪年定时间 技术方案

## 问题（用户 2026-11-15）

截图（导入《诡秘之主》后的“主世界线”事件表）：“白银之国遭黑暗怪物摧毁的深暗时代”标“前18天”，“约一千三四百年前有人下毒”标“前16天”，“二十多年前高文所在骑士团……”标“前14天”；范围显示“后10.38天 — 后18.66天”。

要求：
1. 世界线事件的时间要正确。实际相差几百年、甚至不在同一纪元的事件，不能只差几天到十几天。
2. 小说有明确纪年法时（如《诡秘之主》的“第五纪1349年”），按小说的纪年标记时间，形如“第五纪1349年6月28日”，不用“前n天/后n天”。
3. 测试用第一卷（`/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt`），只导入“世界线”。

本方案在 docs/570（一条主世界线、本步末尾一次全书排序，尚未提交）的基础上修改。

## 根因（证据）

- 隔离根 `~/shakeink-test-roots/cache-522` 中 docs/570 的 6 次运行（wl-demo1、wl-fix1–5），`timeline-applied` 全部是 `calendar:"fixed"`。833–871 个事件里只有 0–12 个有日期。用户截图来自会话 `167f718b…`（导入诡秘之主6），871 个事件，`calendar:fixed`。
- `desktop/core/novel-import-wizard-timeline.ts` 的 `applyWorldTimeline` 把名次换成“天”：没有日期时第 n 名就是第 n 天，第一个日期之前的事件每个往前推一天。“深暗时代”和“二十多年前”因此只差几天。
- 契约只接受 `YYYY-MM-DD` 或 `MM-DD`。“第五纪1349年”“第四纪”“一千三四百年前”这类纪年和相对年数都无法表达，模型只好省略 date。
- 即使有年份，日历也只能是 ISO 公历，界面显示 `1349-06-28`，不是小说的纪年写法。没有纪元的概念。
- 整理时间线的请求只看得到事件目录（名称、摘要、时间词）。“今天是1349年7月”这类交代当前年份的原文句子不属于任何事件，模型看不到。

## 方案

### 1. 数据模型：日历增加纪元（`src/lib/planning/domain.ts`、`timeline.ts`）

- `calendarSchema` 新增 `eras: [{name, start}]`，默认 `[]`。`name` 为纪元名（≤40 字，可以为空串，表示只有年份、没有纪元名），`start` 是该纪元第 1 年 1 月 1 日的小时值，各项严格递增。旧数据没有这个字段，按默认值读出，行为不变。
- `timeSchema.precision` 枚举新增 `"era"`（只知道纪元）。
- `formatTime(value, calendar, span, precision?)`：`gregorian` 且 `eras` 非空时，取 `start ≤ value` 的最后一个纪元（value 早于第一个纪元时取第一个），把 `value-start` 换算成纪元内的年月日（日期换算用 `Date.UTC`，从第 1 年起），输出 `{纪元名}{年}年{月}月{日}日`。显示到哪一级由 `precision` 决定：`era` 只显示纪元名，`year` 显示到年，`month` 到月，`day` 到日。没有给 `precision` 时按 `span` 决定（跨度 ≥ 3 年显示到年，≥ 90 天显示到月，其余显示到日）。`eras` 为空时沿用现有 ISO 输出。

### 2. 整理请求（第 17 步末尾的 timeline intent）

- **纪年线索**：应用从第一卷正文（`workingImportUnits`）中用正则摘出含纪年的短句。规则是“第X纪/纪元”，或 3–4 位数字（含中文数字）加“年”，不含“N年前/后”。每句截取匹配处前后约 20 字，去重后最多 120 句，按阅读位置排序，放进 instruction，标明是不可信资料。第一卷可摘出“第五纪1198年…”“今天是1349年7月…”“1323年9月15日…”等。
- **契约**（替换 `date`）：
  ```
  {"calendar":{"eras":[{"name":"第四纪","years":null},{"name":"第五纪","years":null}],"present":{"era":"第五纪","year":1349}},
   "timeline":[{"id":"e1","order":0,"phase":"前史","era":"第四纪","year":1,"month":6,"day":28,"ago":1350}]}
  ```
  - `calendar` 可以为 `null`，表示小说没有纪年。`eras` 按时间先后排列；原文只用年份、没有纪元名时写一个 `name:""` 的纪元。`years` 是该纪元的长度，只有原文交代时才写，否则为 `null`。`present` 是主线故事开始时的纪元和年份。
  - 每个事件的 `era/year/month/day` 都可选，只填原文给出或能由已知时间推算出的部分。纪元已知、年份不明时只写 `era`。`ago` 是“距主线开始约多少年前”，只在原文给出“N年前”这类相对年数、又换算不出纪年时填写。不得编造。
  - `order` 和 `phase` 不变。
- **提示**：按小说的纪年给时间；不同纪元、相隔几百年的事件，时间要拉开；跨纪元、年份不明的往事只写纪元。批次契约（每批提取）同时补一句：纪元、年份、“N年前”这类时间词也要逐字写进 `facts.time`。
- **输出体积**：第一卷约 850 个事件。只有少数事件带纪年字段，输出预计比现在多不到 20%（docs/570 的运行中 timeline 输出 25k–56k token，有一次到 65536 被截断后重试成功）。分段规则不变。

### 3. 定时间（`novel-import-wizard-timeline.ts`）

- **校验**：
  - 未知纪元名丢弃，事件保留年月日。
  - 年份是 −1e6..1e6 的整数，`ago` 是 0..1e6 的数，月日要是真实存在的日期（按所在年份检查）。不合法的整项丢弃。
  - `present` 不合法时视为没有。
- **补全**：
  - 原文时间词中的月日（现有 `worldTimelineTextDate`，补上“第五纪1349年”这类写法）在模型没给时使用。
  - 只有月日的锚点沿用前一个锚点的纪元和年份（月份回退超过 6 个月则年份加 1）。只有年份的锚点沿用前一个锚点的纪元，第一个则用 `present.era`。
- **纪元位置**（小时轴，当前纪元第 1 年 1 月 1 日为 0）：
  - 当前纪元（`present.era`，没有时取最后一个）从 0 开始。
  - 更早的纪元向前排：起点 = 后一纪元起点 − 长度。长度取原文给出的 `years`；没有时取 max(该纪元事件中最大的年份, 由 `ago` 落入该纪元的跨度) × 1.1 + 10 年，向上取整到年，至少 100 年。之后的纪元同理向后排。
  - 纪元内显示的年份始终是模型给出的年份，估算只影响纪元之间的间距。
- **锚点的值**：
  - `era+year(+month+day)` 的值为纪元起点加上从第 1 年 1 月 1 日到该日的小时数，精度为 `day/month/year`。
  - 只有 `era` 的值是该纪元的中点，精度为 `era`。
  - 只有 `ago` 的值为 `present` 年减去 `ago` 年，精度为 `era`，显示所在纪元。
  - 名次仍是权威：值必须随名次不减，用现有的最长不减子序列过滤，被丢弃的按无日期处理。
- **非锚点事件**：
  - 两个锚点之间的事件按名次线性插值，精度取两个锚点显示相同的最细一级（同一天为 `day`，同月为 `month`，同年为 `year`，同纪元为 `era`，跨纪元也是 `era`）。时间文字附“（按先后推定）”。
  - 第一个锚点之前的事件，每个向前一个单位（单位按第一个锚点的精度：日/月/年，`era` 精度为 10 年）；最后一个锚点之后同理向后。
- **严格递增**：同值的一串事件在 [v, min(下一个值, v+该精度的单位)) 内按名次等分。`era` 精度的单位取到下一个值为止，不会越过下一天/月/年。
- **没有纪年的书**（`calendar` 为 `null`，且没有任何带年份的锚点）：
  - 日历为 `fixed`。0 点改为主线第一个事件（第一个 `phase=主线` 的名次），前史显示为“前…”。
  - `ago` 换算为 `−ago×8640` 小时（fixed 日历一年 = 12×30×24）。
  - 其余名次每个一天，与现在相同。只有月日的书保持现状（docs/570 WT-12）。
- **状态**：`w.worldTimeline` 新增可选的 `eras:[{name,start}]` 和 `precisions:{[eventId]:'day'|'month'|'year'|'era'}`（strict schema，最多 50000 项）。有纪年时 `calendar:'gregorian'`、`epoch:'0001-01-01T00:00:00Z'`。旧会话没有这两个字段，行为不变。

### 4. 发布（`novel-import-publish.ts`）

- 主世界线的日历为 `{kind:'gregorian', epoch, eras}`。事件的 `precision` 取 `precisions[id]`，没有时沿用 docs/570 的规则（公历为 `day`，否则为 `hour`）。
- 纪元有名字时，每个纪元写一个时期（`periods`）：
  - id 为 `import-era-<序号>`，标题为纪元名，`start` 为纪元起点，`end` 为下一纪元起点。
  - 最后一个纪元 `end=null`、`ongoing=true`。
  - 勾选“时期”后，时间轴上显示为纪元色带。

### 5. 面板（`PlanningWorkspace.tsx`，最小改动）

- 事件卡把 `e.time.precision` 传给 `worldTimeLabel`，最终传入 `formatTime`。docs/570 中按 precision 改 span 的写法改为直接传 precision。
- 标题下的范围、刻度、时期起止不传 precision，按 span 显示（有纪元时显示为“第五纪1349年6月”这类写法）。
- 世界线设置对话框保留 `eras`（现有代码已经展开 `previous.calendar`），本次不提供纪元编辑界面。

## 不改

叙事线、细纲、伏笔各步骤；第 21 步复核规则（docs/570 已禁止自动修复时间字段）；非向导导入；没有纪年的书的逐日排列；世界线编辑器的时间输入单位。

## 备选（未采用）

- **新增 `era` 日历类型**：要改日历下拉框、刻度、事件编辑器等多处。在 gregorian 上加 `eras` 时，刻度和编辑器都可以照旧工作。
- **只把纪年写进 `time.label`，数值仍按天**：截图里的“前18天”会变成文字正确、位置错误，时间轴上几百年的事件仍然挤在一起。
- **让模型直接给小时数**：模型算不准跨纪元的小时数，校验也无从谈起。

## 影响文件

- `src/lib/planning/domain.ts`、`src/lib/planning/timeline.ts`、`src/components/content/planning/PlanningWorkspace.tsx`
- `desktop/core/novel-import-wizard-timeline.ts`、`desktop/core/novel-import-ai-payload.ts`（timeline 提示、批次契约一句）、`desktop/service/novel-import-ai.ts`（timeline 响应 schema）、`desktop/core/novel-import-semantics.ts`（结果类型）、`desktop/main/novel-import.ts`（纪年线索、calendar 传递）、`desktop/core/novel-import-wizard-state.ts`、`desktop/service/novel-import-publish.ts`
- 测试：`tests/unit/novel-import-worldline-timeline.test.ts`、`tests/integration/novel-import-wizard-publish.test.ts`、`tests/browser/planning-worldline-time.test.ts`、`tests/helpers/novel-import-wizard-fixture.ts`；新增 `tests/unit/planning-era-calendar.test.ts`；提示金样重新生成。
- `docs/requirements-traceability.json`：NI-21 补充纪年条目。

## 验收

- 单元：纪元换算与显示；锚点和插值；精度；纪元间距；`ago`；无纪年的书；校验；schema；发布；面板显示。
- 真实目标：
  - 隔离根 `cache-522`，第一卷，只选世界线，用 `~/shakeink-test-roots/worldline-570/launch-worldline.mjs`，保存并回读作品。
  - 回读检查：
    1. 世界线 1 条，日历带纪元，至少有“第五纪”。
    2. 0 个“待定位”。
    3. 事件按保存顺序严格递增。
    4. 锚点：周明瑞穿越显示“第五纪1349年6月28日”；原主笔记（6 月 19–27 日）早于穿越；“深暗时代”“一千三四百年前下毒”这类往事与穿越至少相隔 100 年（相差 ≥ 876600 小时），不再只差几天。
    5. 截图：事件表卡片显示纪年写法，时间轴显示纪元时期。
  - 隔离：`state.json` 前后哈希一致。

## 评审后修订（`572-worldline-era-calendar-plan-review.md`，必改 R1–R14）

以下条目覆盖上文对应内容；上文与本节冲突时以本节为准。

### R1 整数日历换算
新增 `src/lib/planning/era-calendar.ts`，由面板和导入共用：
- `civilDays(year,month,day)`：从第 1 年 1 月 1 日起的日序号，按格里历闰年规则做纯整数运算（`days_from_civil` 的写法），不经过 `Date`。
- `civilFromDays(n)`：反算。
- `isCivilDate(year,month,day)`。
- 年份限定为 1..1,000,000。docs/570 的 `parseDate`/`dayNumber` 改用这些函数。
- 一年的平均长度 `ERA_YEAR_HOURS=24×365.2425`，只用于步长和估算；显示一律用 `civilFromDays` 精确换算。

### R2 早于第一个纪元
值早于第一个纪元起点时，显示“{第一个纪元名}之前”。纪元名为空时显示“纪年之前”。不改纪元起点，因为起点就是“第 1 年”。

### R3 纪元起点的计算顺序（无环）
1. 先确定当前纪元：取 `present.era`。没有 `present` 时取最后一个纪元，`present.year` 取该纪元中最大的显式年份（没有则为 1）。当前纪元起点固定为 0。
2. `ago` 只在有 `present` 时使用：值为 `civilDays(present.year,1,1)×24 − ago×ERA_YEAR_HOURS`。（docs/582 第三、四轮）`ago` 为整数且小于 `present.year` 时，取 `civilDays(present.year−ago,1,1)×24`，即那一年的 1 月 1 日；落在更早纪元时，对齐到最近的 1 月 1 日（所在纪元内的天数加 183 天后取公历年）。没有 `present` 时丢弃 `ago`。同一事件同时有 `era/year` 和 `ago` 时，以 `era/year` 为准。
3. 更早的纪元从近到远依次确定起点：
   - 模型给出 `startAgo`（该纪元开始于主线多少年前）时，起点 = `civilDays(present.year,1,1)×24 − startAgo×Y`。
   - 否则有 `years` 时，起点 = 后一纪元起点 − `years×Y`。
   - 都没有时，长度 = max(该纪元的最大显式年份, A) × 1.1 + 10，至少 100 年，取整到年。只有紧邻当前纪元的上一纪元有 A：A 是落在当前纪元起点之前、超出最远的那个 `ago` 超出的年数。其它纪元的 A 为 0。
   - 起点必须严格早于后一纪元，否则改用估算。
   - （docs/574 #3、docs/579 #1）`years` 或由 `startAgo` 推出的长度，必须能放下该纪元最大显式年份的整年（到 12 月 31 日），否则视为无效，改用估算。
   - （docs/574 #2）起点**向下**取整到整天，纪元内的日期因此都落在整天上。
4. 当前纪元之后的纪元：起点 = 前一纪元起点 + max(`years` ?? 估算长度, 前一纪元最大显式年份的整年)，**向上**取整到整天（docs/579 #1），前一纪元不会因取整变短。最后一个纪元的终点同样处理。
5. （docs/579 #3）当前纪元的最大年份包括 `present.year`，以及所有落在当前纪元内的 `ago`，因此当前纪元后面还有纪元时，主线和近期的 `ago` 不会被挤进下一个纪元。

### R4 冲突过滤的权重（docs/582 第三至五轮）
- **权重**：原文自己写出年份的名次（只看原始名次，不看 R8 继承来的年份；有没有纪元都算）权重为 n+1，其它名次为 1。纪元顺序过滤和点值过滤用同一条规则。冲突时总是舍弃估算值，保留写出的日期。
- **纪元顺序过滤**（可传递，O(n²)）：先只看带年份的名次，按（纪元序号，完整公历日期）选出权重最大的非递减链。再逐个检查只写纪元的名次：它的纪元必须介于前后最近两个已保留带年份名次的纪元之间，所以它不能把两个带年份的名次连成逆序；这些只写纪元的名次之间也不能逆序。
- **点值过滤**：按数值选权重最大的非递减链，保证最终值严格递增。

### R4/R9 只写纪元的事件按区间处理
只写纪元名的事件不当作点锚点，它的取值范围是 `[纪元起点, 下一纪元起点)`；最后一个纪元的范围是 `[起点, 起点+估算长度)`。
1. 先按名次检查纪元序号必须不减（最长不减子序列），不一致的事件去掉纪元、年月日、`ago`。
2. 再对点锚点（有年份或 `ago` 的事件）做数值的最长不减过滤。
3. 相邻两个点锚点之间（首尾为 ±∞）的只写纪元事件，取各自纪元范围与这段 `[va,vb]` 的交集，按名次在交集内等分。交集为空时按无日期处理。
4. 其余事件在已定位的事件之间按名次线性插值。

### R7 精度与步长
插值事件取两个邻居中较粗的精度。两个邻居属于不同纪元时，精度为 `era`。

步长：

| 精度 | 步长 |
| --- | --- |
| `day` | 24 小时 |
| `month` | Y/12 |
| `year` | Y |
| `era` | 10Y |

第一个锚点之前、最后一个锚点之后的无日期事件，按邻居的步长逐个前后推。同值的一串事件在 `[v, min(下一值, v+步长))` 内等分；最后一串没有下一值时，用步长。

### R8 只有月日、前面没有锚点
沿用第一个有年份锚点的纪元和年份。没有这样的锚点时，用 `present`。仍然没有时，整本书按“只有月日”处理（fixed，docs/570 原规则）。“只有年份”的锚点前面没有纪元时，也按同样的顺序取纪元。

### R10 `ago` 的精度
`ago` 落在当前纪元内时，精度为 `year`，显示如“第五纪1329年”；原文时间词“二十多年前”保留在 label 中，读者能看出这是约数。落到更早的纪元时，精度为 `era`。

### R11 契约示例
```
{"calendar":{"eras":[{"name":"第四纪","aliases":[],"years":null,"startAgo":null},{"name":"第五纪","aliases":["黑铁纪元","第五纪元"],"years":null,"startAgo":1349}],"present":{"era":"第五纪","year":1349}},
 "timeline":[{"id":"e1","order":0,"phase":"前史","era":"第四纪"},
             {"id":"e2","order":1,"phase":"前史","ago":20},
             {"id":"e3","order":2,"phase":"主线","era":"第五纪","year":1349,"month":6,"day":28}]}
```

### R12 分段合并与类型
- `eras` 按首次出现的先后合并，同名或别名重叠的视为同一纪元。
- 同一纪元的 `years`/`startAgo` 各段不一致时，视为没有。
- `present` 取第一段给出的。
- 合并后顺序矛盾（成环）时，整份 `calendar` 视为 `null`。
- 回复缺 `calendar` 与 `calendar:null` 等价。
- 类型和 schema 同步修改：响应 schema（strict，`eras.max(20)`、`name.max(40)`、`aliases.max(5)`）、`ImportSemanticResult.timeline` 和 `calendar`、`WorldTimelineRanked`（加 `era/year/month/day/ago`）。

### R13 别名
`eras[].aliases` 最多 5 个。比较纪元名之前先规范化：去空白，结尾的“元”去掉（“第五纪元”=“第五纪”）。事件中的纪元名先按名称匹配，再按别名匹配。

### R5/R6 规划数据
- `eras` 的严格递增不写进读取用的 schema。检查放在 `validatePlanning` 中，与 id 唯一检查并列。`formatTime` 读到乱序的 `eras` 时先排序再用，不报错。不使用 transform。
- `applyPlanningOperations` 的 `put` 在修改已有世界线时，合并 `calendar`：`{...旧calendar, ...新calendar}`。AI 只传 `{kind}` 时，`eras` 不会丢失。
- `planning-tools.ts` 的说明补上 `era` 精度和 `calendar.eras`。

### R14 初始视图
日历带纪元时，打开时间轴的初始窗口对准最密集的一段：按时间排序后，覆盖至少 80% 事件的最短连续区间。“全貌”按钮仍显示全部事件。没有纪元的世界线行为不变。

### 其余（评审建议，采纳）
- **纪年线索**：
  - 正则不排除“年前/后”，摘出三类句子：含“纪/纪元”的句子；含 3–4 位年份的句子；含“[百千]+年[前后]”的中文相对年数句子。
  - 中文数字解析补上“千/百”的写法（“一千三百四十九”）。
  - 线索写进 `build(segment)`，分段时计入大小。
- **原文时间词解析**：识别“第X纪(元)?”加年月日（含只有纪元和年份的写法），模型没给时使用。
- **状态**：
  - `precisions` 上限 5000，被锁定的事件不写入。
  - `eras` 写进状态 schema，要求 `start` 为有限值并严格递增。
- **纪元时期**：只是显示用的初始数据，显示以 `eras` 为准；无名纪元不写时期。
- **刻度**：带纪元的日历，刻度年长取 Y。
- **已知行为**：作者在事件编辑器里切换时间类型，会把精度重置为 day/hour（`PlanningWorkspace.tsx:1551`），原有行为不变。
- **原 ISO 公历路径**：导入时只要有年份，就生成带纪元的日历；原文只有年份、没有纪元名时，生成一个无名纪元，显示“1349年6月28日”。docs/570 的 `epoch=最早日期` 公历路径不再用于导入。
- **会改的测试**（逐条重写，不只新增）：
  - `tests/unit/novel-import-worldline-timeline.test.ts` 的 WT-08、WT-12、WT-13、WT-17、WT-18、状态 schema 用例、`:156`；
  - `tests/integration/novel-import-wizard-publish.test.ts` 的 WT-50b/51b；
  - `tests/browser/planning-worldline-time.test.ts` 的 WT-55；
  - 夹具的 timeline 分支（不带 `calendar`）；
  - 提示金样中 timeline 和 worldline 车道两组（先删除旧文件再生成）。
- **验收**：真实运行要重跑第 17 步提取（批次契约改了），不能只重跑 timeline。另外列出“深暗时代”等无年数往事实际得到的纪元。
