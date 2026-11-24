# docs/599 世界线事件卡片编辑形态：代码审核 r4（真实目标 r2，R4 编辑元信息行不换行）

审核范围：工作区未提交的 docs/599 real-target r2 (R4) 改动：`src/components/content/planning/worldline/worldline.module.css:464-470` 新增的 `.edBody > .meta`、`.edWhenHost` 规则，`src/components/content/planning/worldline/EventCardEditor.tsx:118-128` `TimePick` 的 `edWhenHost` 和 `title={text}`，`tests/browser/planning-worldline-card-edit.test.ts:899-927` 的 CE-85。依据是用户 2026-11-23 的选择：编辑元信息行不换行，时间文字省略号截断，完整文字放在按钮 title 和时间选择器预览；开放形态已换行的行保持原样（编辑卡片因此矮一行）。本次只读，除本文件外没有改源码、测试和文档。临时探测用例放在 `/tmp/rv599/probe.test.ts`（仓库外），用真实 `withWorldline` 夹具，`REVERT` 模式通过注入样式把上述规则恢复成 `flex-wrap: wrap`、`flex: 0 1 auto`、`overflow: visible`、`white-space: normal`，近似修复前的状态。

## 结论

修复本身正确，没有 P1。编辑行在 1440 / 520 / 400 视口、事件表和时间线、有无 ＋ 的组合下都是一行（18px）；开放形态的 `.meta` 行高与修复前完全一致；时间选择器、类型选择器的弹层不被按钮的 `overflow: hidden` 裁掉；焦点框不受影响；220px 卡片里固定宽度的项放得下。

有两条 P2。CE-85 的四个用例里只有“时间线 / wraps”一个在修复前会失败，真实目标里报告的“开放行一行、编辑行换行、卡片长 26px”这一条没有被任何用例复现（P2-1）。窄事件表里，修复把重要程度和 ＋ 固定在行尾，它们左对齐的弹层伸出滚动区右边（P2-2）。

## 运行结果

| 命令 | 结果 |
|---|---|
| `node --import tsx --test --test-name-pattern="CE-85\|CE-01\|CE-04\|TP-" tests/browser/planning-worldline-card-edit.test.ts`（Node 24.18.0，chromium-1217） | 15/15 通过，39.5 s |
| 探测：修复后，标签 `最初的几十年里` / `最初的几十年里（按先后推定）在王国的北方边境`，有无 ＋，table/timeline，视口 1440/520 | 16 组编辑行都是 18px；开放行一行的组卡片高度不变；开放行已换行的组卡片矮 (开放行 − 18)px；时间选择器 380×322，中心命中自身 |
| 探测：`REVERT`，同上 16 组 | 编辑行高度与开放行完全相同（18 / 44 / 80.78px），没有一组出现“开放一行、编辑换行” |
| 探测：`REVERT`，无 ＋ 改为有 ＋（无人物、转变、正文），时间线 1440，标签 `最初的几十年里按先` / `…按先后` / `…按先后推定` | 开放行 18px，编辑行 44px，卡片 96 → 122px（+26px，与真实目标一致）；修复后三组编辑行 18px，卡片 96px 不变 |
| 探测：修复后，事件表视口 400px（滚动区右边 388，卡片 234px） | 编辑行 18px；弹层右边：事件类型 315，重要程度 438，添加 533，时间选择器 585 |
| 探测：`REVERT`，事件表视口 400px | 弹层右边：事件类型 315，重要程度 315，添加 410 |

全量回归由主代理在跑，本次没有执行 `npm run build`，也没有跑全文件。

## P1

无。

## P2

### P2-1 CE-85 基本覆盖不到这次的回归：修复前 4 个用例里 3 个照样通过

- `tests/browser/planning-worldline-card-edit.test.ts:903-909` 的 `longTimeView` 在 `editView()` 的 e1 上改时间，e1 有人物、角色转变和正文，所以编辑行没有 ＋（`EventCardEditor.tsx:175` 只有缺项时才渲染）。真实目标里换行的正是 ＋ 加两个 caret 多出来的宽度。
- 标签 `最初的几十年里`（“fits”）太短：420px 时间线卡片和 894px 事件表卡片里，修复前编辑行也是一行（探测 `REVERT` fits 四组编辑行与开放行同高）。因此 `CE-85 (table, fits)`、`CE-85 (timeline, fits)` 在修复前也通过，正好是用例名所说的那条“the card keeps its size when the open row fits”没有被验证。
- “wraps”标签在 894px 事件表卡片里开放行只有一行（`openRow` 18px），`CE-85 (table, wraps)` 实际走的是 `openRow <= 20` 分支，修复前同样通过。只有 `CE-85 (timeline, wraps)` 在修复前会失败（`REVERT` 编辑行 80.78px > 20）。
- 第 922-923 行按测到的 `openRow` 选分支，没有断言前提。字体回退不同（另一台机器、字体更新）时，“fits”可能变成开放行换行而静默进入另一分支，用例仍绿，却不再测它想测的情形。

建议：用一个无人物、无转变、无正文的事件（编辑行带 ＋），标签取探测里复现 +26px 的长度（如 `最初的几十年里按先后推定`，时间线 420px 卡片）；每个 kind 先断言前提（fits：`openRow <= 20`；wraps：`openRow > 20`），并在 `REVERT` 状态下确认至少 fits 组失败。事件表若也要覆盖，用 `withWorldline` 的 `width` 选项把卡片收到能复现的宽度，不要依赖 1440 视口。

### P2-2 窄事件表里重要程度和 ＋ 的弹层伸出滚动区

- 修复前，窄卡片的元信息行会换行，重要程度和 ＋ 落到第二行左侧，弹层（`.edPop`，`worldline.module.css:524`，`left: 0`，`min-width: 140px` / `.edPopWide` 190px）从卡片左边开始向右展开。现在 `flex: none`（`worldline.module.css:467`）把它们固定在行尾，弹层从卡片右端向右展开。
- 400px 视口（滚动区 `.scroller` 右边 388，卡片 234px，接近 `.slot:not(.slotOpen) > .card` 的 220px 下限）：重要程度弹层右边 438，添加弹层 533，都超出 388；修复前分别是 315、410。`.scroller` 是 `overflow: auto`（`:199`），超出部分被裁掉或需要横向滚动才能看到，“添加”弹层里的角色名和“＋ 角色转变 / ＋ 正文”会被截。
- 时间选择器在同一宽度下也超出（右边 585），但它挂在时间按钮上，修复前位置相同，是原有问题，不是这次引入的。
- 宽面板（520px 视口以上、时间线 420px 卡片）没有这个问题。

建议：行尾这两个弹层在 `.edBody > .meta` 里改为右对齐（`right: 0; left: auto`），或按触发器到滚动区右边的剩余空间翻转方向；补一个 `width: 400` 的用例，断言弹层右边不超过 `.scroller` 右边。

## P3

### P3-1 时间按钮的虚线下划线可能被 `.when` 的 `overflow: hidden` 裁掉

`.meta .edPick.edWhen`（`worldline.module.css:460`）用 `text-decoration: underline dotted` 加 `text-underline-offset: 3px` 表示可点。现在 `.when` 是 `display: block; overflow: hidden`（`:470`），下划线画在它的行盒内，偏移 3px 后若超出行高就会被裁。本次截图（`/tmp/rv599/table-400.png`、`timeline-1440.png`）分辨率太低，看不清下划线是否完整。建议在真实目标截图里放大确认；若被裁，可给 `.when` 加 `padding-bottom` 并用等量负 `margin-bottom` 抵消，行高不变。

### P3-2 220px 卡片里时间文字只剩约 40px

固定项宽度：类型（两字 + caret）约 50px，重要程度约 37px，＋ 18px，间距 3×8px，合计约 130px；220px 卡片的元信息行宽 220 − 30 − 16 − 2 = 172px，时间文字剩约 40px。400px 视口探测（行宽 186px）里时间显示为“后24小…”，4 列不溢出（＋ 右边 361，行右边 361）。`EVENT_CATEGORIES` 和 `IMPORTANCE_LABELS` 都是两字，所以不会挤出卡片。完整文字可从 title 和选择器预览看到，符合用户选择，记录在此，不需要改。

## 逐项检查

| 检查项 | 结论 | 依据 |
|---|---|---|
| 时间选择器弹层是否被裁 | 不裁。`overflow: hidden` 只在按钮（`:469`）和 `.when`（`:470`）上，`EventTimePicker` 是 `.edPickHost.edWhenHost` 的子元素、按钮的兄弟（`EventCardEditor.tsx:123-127`），宿主是 `min-width: 0` 但没有 overflow | 探测 16 组 `timePop` 380×322，`elementFromPoint` 命中自身 |
| 其他弹层 | 类型、重要程度、添加的宿主都没有 overflow，不被按钮裁；窄事件表里行尾两个伸出滚动区 | P2-2 |
| 焦点框 | `.meta .edPick:focus-visible { outline: 2px; outline-offset: 1px }`（`:462`）。元素自己的 `overflow` 不裁自己的 outline，宿主、`.meta`、`.body` 都没有 overflow | 按 CSS 规则推断，未截图 |
| 窄面板 / `@container ≤ 640px` | 640px 规则只改轨道宽度和 `.cards` 边距（`:340-357`），不碰 `.meta`；400px 视口编辑行一行、不溢出 | 探测 width 400 / 520 |
| 只读、冻结卡片 | 不受影响。只读或冻结时“编辑”被禁用（`EventCard.tsx:261`），不会渲染 `.edBody`，新规则都在 `.edBody > .meta` 或 `.edWhenHost` 下 | 源码 |
| 开放形态 `.meta` | 不变。新规则选择器都要求 `.edBody` 或 `.edWhenHost`；开放行高度在修复前后 32 组探测里逐一相同 | 探测 `open.row` |
| `flex: none` 是否溢出 | 220px 卡片下不溢出，时间约 40px | P3-2 |
| CE-85 修复前是否失败、是否不稳定 | 只有 1/4 失败；按测量值选分支，字体变化时可能静默换分支 | P2-1 |
| `title` | `title={text}`（`EventCardEditor.tsx:124`）与 `[data-card-time]` 文本一致，CE-85 第 924 行已断言 | 用例通过 |
