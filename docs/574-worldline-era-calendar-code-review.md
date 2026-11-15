# 574 · 世界线小说纪年 代码审核

审核范围：docs/572（以“评审后修订”为准）、572 评审、docs/573 对应的未提交改动。只读审核，未改源码和测试。

## 结论

**不通过，需修改后复审。** 现有用例全部通过：`planning-era-calendar.test.ts` 10/10，`novel-import-worldline-timeline.test.ts` 28/28，`novel-import-wizard-publish.test.ts` 中 EC-7x/WT-5x 2/2。整数日历换算、合并成环、锁定、发布顺序、无纪元回归，都没有发现问题。

问题出在随机测试和边界输入上。我写了随机测试脚本（`/Users/dt_flys/.claude/jobs/049d62b0/tmp/review/fuzz.ts`、`fuzz2.ts`、`c*.ts`），通过 `applyWorldTimeline` 跑了 2 万组随机名次和日历，结果如下：
- 约 0.8%～1% 的输入，`timeValue` 不严格递增。
- 带显式年份的锚点，约 10% 显示成别的年份、别的日期，甚至别的纪元。
- 第 17 步的回复按提示的写法填写，会被响应 schema 整段拒绝。

## 必改

### 1. 同一纪元的“只写纪元”事件被隔开后，值会倒退
`desktop/core/novel-import-wizard-timeline.ts:252-258`

只写纪元的事件按“连续、同纪元”分成一段一段。每一段都在同一个区间 `[max(纪元起点,前锚点), min(纪元终点,后锚点))` 里从头等分。中间隔着无日期事件或其它纪元的只写纪元事件时，后一段又从区间开头排起，值就比前一段小。随后 `interpolate`（`:274-276`）在两段之间插值，也会得到倒退的值。

失败输入：日历 `{eras:[{name:'甲纪'}]}`，名次 `[{era:'甲纪'},{},{era:'甲纪'},{era:'甲纪'}]`。
- 实际结果：`[438291, 365242.5, 292194, 584388]`。
- 另一个失败输入：`present={era:'甲纪',year:50}`，名次 `[{phase:'主线'},{ago:1000000},{era:'甲纪'},{},{era:'甲纪'},{era:'甲纪'},{era:'甲纪',year:3}]`，结果为 `[…,8760,7300,5840,11680,17520]`。

修法：在两个点锚点之间，按名次顺序给只写纪元的事件分配互不重叠、递增的子区间。例如把这一段里所有只写纪元的事件一起等分，同时保证同一纪元的区间不回退；或者每放下一个值，就把它当作后面事件的下界。改完后，用随机测试（名次 1–10、纪元 1–4、混合 year/ago/month/era）验证严格递增，并写进 EC-43 或新增用例。

### 2. 更早纪元的起点不是整天，显式日期显示早一天或早一年
`desktop/core/novel-import-wizard-timeline.ts:233-237`，`src/lib/planning/era-calendar.ts:67`

`starts[e]` 有三种算法：
- `next − years×Y`
- `next − estimate×Y`
- `Math.round(agoValue(startAgo))`（取整到小时）

Y=8765.82 不是 24 的倍数，所以这三种结果都不在整天上。事件值是 `start + civilDays×24`。`eraLabel` 再算 `floor((value−start)/24)` 时，浮点误差会让结果落成 `D−ε`，显示退回前一天。前一天在 1 月 1 日时，连年份也退一年。

失败输入：日历 `[第四纪, 第五纪]`，`present={era:'第五纪',year:1349}`，事件 `第四纪106年1月1日`。
- 实际显示：`第四纪105年12月31日`。
- 另一组：`present={era:'甲纪',year:5}`，事件 `乙纪800年`，显示 `乙纪799年`。
- 在第 1–1400 年中按步长 7 取年份，每年测 4 个日期，有 8 个错。

修法：把起点取整到 24 的倍数（与 R3 “取整到年”的意图一致，也可以取整到 `civilDays` 的年初）。另外，`eraLabel` 中的 `(value−start)/24` 先四舍五入到 1e-6，再取 floor。

### 3. 模型给的 `years`/`startAgo` 比显式年份短时，事件被显示到下一纪元
`desktop/core/novel-import-wizard-timeline.ts:233-234,237`

R3 只检查起点必须早于后一纪元，没有检查纪元长度能否放下这个纪元里出现过的最大年份。

失败输入 A：`eras=[{name:'第四纪',years:50},{name:'第五纪'}]`，`present=第五纪1349`，事件 `第四纪100年`、`第五纪1349年`。
- 实际显示：`第五纪49年 | 第五纪1349年`。

失败输入 B：`第四纪 startAgo:2000`，`present=第五纪1349`，于是第四纪只有 651 年。事件 `第四纪900年`。
- 实际显示：`第五纪248年`。

修法：`years`，或由 `startAgo` 推出的长度，小于 `maxYear[e]` 时视为无效，改用估算。当前纪元之后的纪元（`:237`）和 `lastEnd`（`:238`）同样处理。

### 4. 没写纪元的年份锚点会沿用“只写纪元”事件的纪元，主线被放进前一个纪元
`desktop/core/novel-import-wizard-timeline.ts:204,210`（`:212` 同理）

`firstEra` 取的是第一个带 `era` 的事件，包括只写纪元的前史事件。R8 的顺序是：先取第一个有年份锚点的纪元，没有再取 `present`。小说的实际情况往往是：前史写“第四纪”，主线模型只写 `year:1349`，没写纪元。主线于是落进第四纪。

失败输入：`eras=[第四纪, 第五纪]`，`present={era:'第五纪',year:1349}`，名次 `[{era:'第四纪'},{year:1349,month:6,day:28}]`。
- 实际显示：`第四纪 | 第四纪1349年6月28日`。
- 期望：第五纪1349年6月28日。

修法：`firstEra` 只从同时带 `era` 和 `year` 的事件里取。仍然没有时，回退到 `presentIndex`。

### 5. `present.year` 不允许 null，按提示填写的回复整段被拒
`desktop/service/novel-import-ai.ts:390`，提示见 `desktop/core/novel-import-ai-payload.ts:155`

提示写着“present是主线故事开始时所在的纪元和年份，原文没有交代年份时为null”，模板中又写 `"present":{"era":"","year":0}`。模型很可能回复 `present:{era:'第五纪',year:null}`。但 schema 中 `year:z.number().finite()` 不允许 null，整段解析失败。每段会重试一次，再失败第 17 步就失败。

失败输入：`{"calendar":{"eras":[{"name":"第五纪"}],"present":{"era":"第五纪","year":null}},"timeline":[{"id":"e1","order":0,"phase":"主线"}]}`，`safeParse` 返回 false。

修法二选一：
- `present.year` 改为 `.nullable().optional()`，`placeRanks` 按“没有年份”处理（此时 R3 只用 `present.era`）。
- 提示改为明确写“没有年份时 present 整体为 null”，并去掉模板中的 `year:0`。

无论选哪种，都在 EC-61 中加一条 `present.year:null` 的用例。

### 6. `cnNumber` 把“零”当作数字参与取平均，“一千零三”得 1002
`desktop/core/novel-import-wizard-timeline.ts:59`

“零”在 `CN_DIGIT` 中值为 0。随后的“三”被当作“三四百”式的连写约数，取 `(0+3)/2`。

失败输入及实际结果：
- `cnNumber('一千零三')=1002`
- `cnNumber('一千零五十')=1025`
- `cnNumber('一万零五')=10003`

“一千零三年”这类年份写法在原文里很常见。修法：“零”只作占位，遇到“零”时清空 `digit`，不参与取平均。

### 7. 原文时间词把时长和相对时间当成纪年
`desktop/core/novel-import-wizard-timeline.ts:75,80`

- `worldTimelineTextTime('三百年来')` 返回 `{year:300}`。“年来”“年间”“年的”表示时长，不是第 300 年。这个值会变成点锚点，再从其它事件继承纪元。
- `worldTimelineTextTime('三年前的七月')` 返回 `{month:7}`。“三年前”这个相对时间被丢掉了，七月又按 R8 沿用前一锚点的年份，日期整整错了三年。

修法：
- 年份后面紧跟“来/间/之久/的时间/多/余”时不当作纪年。
- 同一个时间词里出现过不能解析的相对年（`N年前` 且 N<100 等）时，不再单独取月日。

改完后，在 EC-51 的否定列表中加上这两例。

### 8. docs/570 已保存的会话读不出，草稿会从列表中消失
`desktop/core/novel-import-wizard-state.ts:82`

docs/570 保存的 `worldTimeline:{version:1,calendar:'gregorian',epoch:'1349-06-26',events:3}` 没有 `eras`/`precisions`，在新 schema 下校验失败（已实测）。`validJournal` 于是返回 false，`desktop/main/novel-import.ts:536` 直接 `continue`。用户看不到报错，草稿就不见了。docs/572 写的是“旧会话没有这两个字段，行为不变”，代码与方案不一致。

docs/570 尚未提交，只影响已经跑过 docs/570 的隔离测试目录，但方案原文和实现必须一致。修法二选一：
- 接受旧形状，读入时去掉 `worldTimeline`，让第 17 步重排一次；发布时不能直接用旧形状，因为 `era.precisions` 不存在。
- 把方案改为“docs/570 会话不兼容，需重开”，并补一条用例证明旧形状被拒时有明确提示。

## 建议

- `timeFor`（`novel-import-wizard-timeline.ts:167`）：模型只给 `era:'第五纪'`、原文时间是“第五纪1198年”时，原文里的年份不会补上，因为只在 `text.month` 存在时才补。R“原文时间词解析”写的是“模型没给时使用”。建议纪元相同、`text.year` 存在时也补上年份。
- `worldTimelineTextTime('一千三百年前后')` 得到 `{year:1300}`。“N年前后”既可能是约数年份，也可能是“约 N 年前”。建议在 N 较大、又没有纪元时，按 `ago` 处理或干脆不取。
- 发布（`novel-import-publish.ts`）：锁定后仍在主世界线上的事件，精度默认为 `day`。按纪年显示时会出现精确到日的日期，但那不是导入时推定的值。建议锁定事件改用 `hour`，或者显示时不截断。
- `PlanningWorkspace.tsx:2043`：精度不是 `hour` 时，span 改为 `max(48, span)`。这对没有纪元的 fixed/自定义日历也生效。旧数据中由“仅同日”设成 `day` 的事件，在窄窗口下会从“小时”显示变为“天”。建议这个分支只用于 gregorian 日历，并在 EC-08/WT-55 中覆盖 fixed 日历加 `day` 精度的显示。
- 数值精度：`ago=1e6` 时值约 −8.77e9，`Math.round(v×1e6)/1e6` 已接近 2^53，相邻值差小于 1e-6 小时会重合。随机测试中没有出现，但建议在 `applyWorldTimeline` 写值后再检查一次严格递增，不满足时报错，不要静默写入。
- 随机测试脚本建议改成正式用例，例如 EC-43b，名次 ≤ 12，固定随机种子，跑 2000 组。
