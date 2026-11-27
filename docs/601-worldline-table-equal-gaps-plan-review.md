# 601 · 世界线事件表等间距 技术方案与测试用例 独立审核

审核对象：`docs/601-worldline-table-equal-gaps-plan.md`。依据源码：`src/lib/planning/worldline-layout.ts`（tableLayout 776–921、railMarks 1021、alignedRailMarks 1161–1240、zoomPlan/tableAutoOpenFits 1976–2112）、`EventTable.tsx`（110–190、471–490、566、597、721–733）、`worldline.module.css`（200–220、347–363），以及既有用例。只读审核，未改源码。

## 结论

方向正确：`zScale = 1` 去掉 0.75 包层，`equalGaps` 去掉根块、子块的时间拉伸，断档改成 6px，这三处能消除截图里家族内几百 px 的空隙和断档两侧 52px 的空隙。`first` 处理、断档 `height = CARD_GAP` 的算术是对的（断档后 `first = true`，下一块不再加 `CARD_GAP`，`worldline-layout.ts:819`、`:892`）。

但方案没有算清楚卡片只隔 6px、时间点只隔 6px 以后，时间轴列里徽章、日期标签、断档文字、圆点的垂直空间。真实数据的复位级别是 2，一般事件在这一级都是时间点，所以问题正好出在用户截图那个视图里。另有一处模式切换锚点在读 `scrollTop` 时已经被浏览器截断。下面的 P1 必须先改方案再实现。

## P1（必须修改）

### P1-1 “相隔”文字在有年份的历法里几乎永远被徽章取代，违背用户“保留相隔文字”

- 方案 §3：段首年份徽章 y = 上一段末卡头与本段首卡头的中点。收起卡头在卡顶下 17px（`cardHeadOffset`，`worldline-layout.ts:708-714`），卡高 34。断档中线 = 上一卡底 + 3。两卡头中点 = 上一卡底 − 17 + (17 + 6 + 17)/2 = 上一卡底 + 3。两者重合。上一段以家族结尾时（`GROUP_PADDING` 10），差 5px；末尾是时间点时，差也只有几 px。都小于 Q4 的阈值 12。
- `alignedRailMarks` 对每个有年份的段都会推一个段首徽章（`:1192-1198`，`firstYear` 只在全段都是纪元精度或回溯时缺失）。F60（固定历，有年）、F885（纪元历）和真实数据（公历）都有年份。
- 结果：Q4 的“无徽章时画断档文字”只在无年份历法上发生，用户看到的断档只有徽章，“相隔”文字只在 `title` 里。这与用户确认表第 2 行“保留‘相隔 N 年’文字，放进正常卡片间距里”直接冲突。
- 既有用例 `planning-worldline-table.test.ts:148` WU-43（F60、默认对齐）`expect([data-rail-break]).toContainText("相隔")` 会失败（文字被移到徽章 `title`），而 §6.3 写的是“其余用例不改”。
- 建议：两者都画，水平错开。徽章以 `left: 158px` 居中（`worldline.module.css:212`），按 11px 粗体“第五纪1340年”加 18px 内边距估算约 90px 宽，占 x ≈ 112–204。断档文字现在右对齐到 x = 144（`padding-right: 66px`，`:215`），会与徽章重叠。改成 `.railBreakTight` 右对齐到徽章左缘之前（如 `padding-right` = 210 − 徽章左缘 + 4，徽章宽度可在渲染后测量，或断档行与徽章用同一个 flex 行排布）。窄面板（rail 120px，徽章居中于 92，`:351-352`）放不下时再退回 `title`。用例 EGB-03 改为“宽面板文字可见且与徽章不相交；窄面板才允许进 `title`”。
### P1-2 时间点之间只隔 24px：年份徽章、断档文字与日期标签会互相压住，复位级别 2 下普遍发生

- 时间点高 18（`POINT_HEIGHT`，`worldline-layout.ts:62`），点头在中线 9，相邻两点头距 = 9 + 6 + 9 = 24。真实数据复位是级别 2（memory table-zoom-600：d 21.657），一般事件全是时间点，所以这是截图视图里最常见的相邻关系。
- 对齐模式每张卡都显示日期标签（`alignedRailMarks` `:1210-1211` `visible = !!body`，注释依据是“卡片 ≥ 39px 远”）。标签 11px 字号加 1px 上下内边距（`worldline.module.css:209`），约 15–16px 高；徽章 11px 粗体加 2px 内边距和 1px 边框（`:212`），约 19px 高。
- 段内换年徽章放在两头中点（`:1203`）。两点之间时，徽章中心距两侧标签中心各 12px，而半高相加约 8 + 9.5 = 17.5，每侧重叠约 5px。卡与卡之间是 20px，刚好不重叠；所以 39px 注释的前提现在只对收起卡成立。
- 断档文字的中线 = 上一块底 + 3。上一块是时间点时，它的标签中心在底 − 9，相距 12px，同样重叠。下一段首是时间点时也一样。
- 现状下级别 2 的拉伸（`tableGapFor`、`:896`）把多数相邻点拉开，问题不明显；`equalGaps` 让它变成固定 24px，必然出现。TZB-08 只检查标签与标签不重叠（`planning-worldline-table-zoom.test.ts:399-400`），查不到徽章或断档文字。
- 建议二选一，并写进方案：(a) `equalGaps` 下，徽章或断档所在的那道缝加高到能放下它（例如缝 = max(CARD_GAP, 徽章高 + 2 × 标签半高 − 两侧头到边距离)），这会让少数缝不等于 6，需要用户确认；(b) 不加高，把冲突的那一侧日期标签隐藏（年份徽章本身已给出年份），并保证悬停时仍显示。无论哪种，EG-05、EGB-03 要加“徽章 / 断档文字与所有可见日期标签的 DOM 矩形不相交”，夹具必须包含点–徽章–点、点–断档–点、卡–断档–点三种相邻。

### P1-3 Q7 模式切换锚点读取的是已被截断的 scrollTop

- 方案 §4：恢复 effect 中用 `firstVisible(lastLayout, scrollTop)` 作锚点。这个 effect 是 `useLayoutEffect(..., [layout])`（`EventTable.tsx:471-490`），运行时 DOM 已换成新布局。表格高度是 `layout.height + max(80px, 67%)`（`:566`），对齐布局不拉伸后比等距短很多（真实数据级别 2 等距高约 6 万 px，见 600/r3 result.json）。等距 → 对齐时容器先变短，浏览器在 effect 读 `scrollTop` 前就把它截到新的最大值，`firstVisible(lastLayout, 截断值)` 指向错误的卡。
- 建议：在旧布局还在时记住锚点。`onScroll`（`:541`）和每次恢复写入后，把 `{ a: firstVisible(layout, scrollTop), offset: headOffset }` 存进 ref；模式切换时用这个 ref，而不是在 effect 里重算。还要写清优先级：用户操作写入的 `anchor.current`、`zoomAnchor` 和 `au.flipAnchor` 都在 effect 里先于模式锚点（`:474-476`）。等距下自动展开开着时切到对齐，同一次提交 `on` 变 false、`flipped` 为真，`au.flipAnchor` 是 null，会落到哪个锚点要明确。
- EGB-05 要覆盖截断场景：zoomLevels true，等距下滚到表格下半部（scrollTop 大于对齐布局的最大滚动），再切对齐；同时覆盖“自动展开开着时切对齐”。
## P2（应修改）

### P2-1 “卡片间距相等”的度量口径没写清，EGB-01 会因家族框失败或被放宽

- 块间距是 6，但家族框内外的缝隙不是：组头到第一个子块 `GROUP_HEAD_GAP` 4（`worldline-layout.ts:28`、`:873`），最后一个子块到框底 `GROUP_PADDING` 10，框底到下一根块 6（`:881`）。在 DOM 上量“上一张卡底到下一张卡顶”，跨出家族的那一对是 16，进入家族的那一对是 4。
- EG-01 写的是“相邻收起块（同层）top − 上一块 bottom”，按 `blocks` 量是对的；EGB-01 写“相邻两张可见卡片 / 时间点（同层、DOM 实测）”，没有说家族框按一个块算。建议 §1 Q2 明确：间距按块计算（家族框整体算一个块，框内是组头 4、内边距 10 的固定结构），并让 EGB-01 分别断言：块与块 6、组头与首子 4、末子与框底 10。还要把这个口径写进 §5 已知限制，让用户在真实目标截图里确认。

### P2-2 段线两端的 18px 渐隐会吃掉缩短后的延伸

- `.railLine` 的背景是 `linear-gradient(transparent, var(--input) 18px, …, transparent)`（`worldline.module.css:201`），按 22px 延伸设计。Q5 把段间延伸缩到 `min(22, 距离/2 − 4)`：两张卡之间是 16，两个时间点之间是 8，比渐隐长度短。结果段首段尾的圆点处线条已接近透明；只有一张卡的段，线条总长只有 16–32px，基本看不见。
- 建议：渐隐长度跟随延伸（用 CSS 变量传入 `--fade: min(18px, 延伸)`），并在 EG-05 / EGB-07 加一个单卡段、点–点断档的场景。

### P2-3 待定位断档同样挤在 6px 里，Q5 对最后一段向下 22 的规定与它冲突

- 待定位断档在最后一段之后（`worldline-layout.ts:899-905`）。`equalGaps` 下“时间待定位”文字中线 = 末块底 + 3，最后一段的竖线按 Q5 仍向下伸 22，即末卡头 + 22 = 末卡底 + 5，穿过文字并伸进待定位卡片旁边。末块是时间点时，它的日期标签中心距文字中线 12px，会重叠（同 P1-2）。
- 建议：有待定位块时，最后一段向下延伸也按 `min(22, 到待定位首卡顶距离 − 4)` 计算；EG-03 / EGB-03 增加“待定位断档文字与上方日期标签、竖线不相交”。

### P2-4 既有用例影响清单不完整

§6.3 说“其余用例不改”，以下用例会受影响：

| 用例 | 位置 | 影响 |
|---|---|---|
| WU-43 | `tests/browser/planning-worldline-table.test.ts:142-149` | F60 默认对齐，`[data-rail-break]` 要含“相隔”；按方案 Q4 文字被徽章取代后失败（见 P1-1） |
| TZB-01 | `planning-worldline-table-zoom.test.ts:59-60` | 方案已列；“级别 1 卡片 < 1”整段失去意义，需改为断言级别 1 无包层、卡高 34 |
| TZB-11 | 同文件 `:299-325` | 读第一个 `[data-card-zoom]`（`:302`），`Number(null)` 为 0；`:316` 选择器依赖包层，整条用例要重写，不只是改一行断言 |
| TZB-08 | 同文件 `:383-401` | `:393` 用 `data-card-zoom` 算头位；只查标签对标签，P1-2 的徽章 / 断档冲突查不到 |
| TZB-14 | 同文件 `:432-452` | 注释依据“上方一般行离开使内容变短”，对齐模式下内容只因隐藏而变短，仍成立，但锚点断言的上界 `y22 + 30` 依赖拉伸后的距离，需要在新布局下重新核算或切到等距 |
| ZB-37 / ZB-38 | `planning-worldline-auto-open.test.ts:78-80`、`:149-151` | 断言“事件表不自动展开”在对齐模式下永远成立，变成空检查；应切到等距再断言，否则保护不了 docs/600 的隔离规则 |
| RM-07 等 alignedRailMarks 单元用例 | `tests/unit/worldline-layout.test.ts:917-1010` | 全部用不带 `equalGaps` 的布局（46px 断档）。新的段首徽章中点规则会把徽章放到 46px 断档正中，与“相隔”文字同位；单元层需要新增 `equalGaps` 版本，并决定中点规则是否只在 `equalGaps` 布局下生效 |

### P2-5 Q4 匹配阈值没有按布局几何推出

`|y − 断档中线| < 12` 是经验值。P1-1 已算出卡–卡为 0、家族结尾为 5、时间点结尾为 0；家族嵌套多层时，每层加 10 的内边距，第二层结尾差 10，第三层差 15，会出现“徽章和断档文字都画、只差 15px、仍重叠”的情况（徽章半高约 9.5 加文字半高约 8）。如果保留取舍规则，阈值至少要 18；更好的是按 P1-1 横向错开，阈值问题就不存在。

## P3（建议）

- **P3-1** `.railBreakTight` 同时写了 `height: 0`、flex `align-items: center`（继承 `.railBreak`，`worldline.module.css:215`）和 `translateY(-50%)`。高度为 0 时 `translateY(-50%)` 不移动，居中靠的是 flex 溢出。两者择一并写明，避免实现时文字偏半行。
- **P3-2** 真实数据复位仍是级别 2，一般事件仍是 18px、11px 字的时间点（`tpoint`，`worldline.module.css:406`）。用户说的“卡片太小”对收起卡已修复；若截图里的小字主要是时间点，用户可能仍觉得小。真实目标截图应同时记录可见卡片数与时间点数，在总结里说明。
- **P3-3** EGB-02 的 12.8px 是硬编码；建议与同一卡在级别 0 的计算字号比较，避免以后字号调整时误报。
- **P3-4** 缺少截图同形的浏览器用例：`zoomView(24)` 里 r3 / r9 是带 3 个子事件的家族（`tests/helpers/worldline-zoom.ts:3-4`），复位（级别 1/2）对齐模式下断言子块间距 6、组头到首子 4，并对比修改前的拉伸距离，作为“家族内大空隙”的回归。
- **P3-5** 方案 §2 说“`atLeast` 一律为 `-Infinity`”。`TableBlock.stretch` 全为 `-Infinity` 时，`tableAutoOpenFits` 对所有块都 `continue`，会返回 `true`（`worldline-layout.ts:2102-2110`）。对齐模式不会调用它，但应在注释里写明“`equalGaps` 布局不得用于自动展开判断”，并加一个单元断言，防止以后误用。
- **P3-6** 真实目标验证（§6.4）需加：时间轴列 DOM 矩形相交检查（徽章、断档文字、日期标签、竖线端点），覆盖复位级别 2 和级别 0；以及等距 → 对齐在表格下半部切换的位置记录（P1-3）。

## 已核对、无问题

- `first` 与断档：断档后 `first = true`，下一块不加 `CARD_GAP`，所以断档 `height = 6` 后两侧间距正好 6（`worldline-layout.ts:819`、`:889-893`）。
- `TableBreak.to` 与 `RailBadge.segment`：两者都是 `railSegments` 的连续下标（`:584`、`:1197`），Q4 的 `segment === b.to` 匹配成立。
- 虚拟化窗口、`forcedTops`、`renderLevel` 只读 `top/bottom`，布局变短不影响；定位走 DOM（`PlanningWorkspace.tsx:2235-2238`），不受影响。
- `pointerAnchor` / `projectAnchor`：对齐模式下卡头不随 k 移动，锚点按头位插值仍成立；级别变化隐藏卡时的时间回退照旧。
- Q6：对齐模式 `autoLevel` 为 false，`openAll`、`openLayout` 为 null，`decide` 提前返回（`EventTable.tsx:259`），清理 effect（`:295-302`）关掉 `onRaw` 并清空 `autoClosed`。
- C1：不传 `equalGaps` 时布局路径不变，TZ-02 快照（`tests/unit/worldline-table-zoom.test.ts:7-10`）可继续作为等距模式的保护。
- 窄面板：rail 120、徽章居中于 92、断档右缘 82（`worldline.module.css:351-356`），宽度更紧，P1-1 的横向错开在窄面板放不下时退回 `title` 是合理的折中，需在方案中明确。
