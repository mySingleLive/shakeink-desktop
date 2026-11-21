# 588 · 事件表时间轴对齐 / 等距两种模式 代码审核（独立子代理）

审核对象：`docs/588-worldline-table-rail-modes-plan.md`（修订 1，含审核第 2 轮建议 A～H）对应的未提交实现：`src/lib/planning/worldline-layout.ts`、`worldline/{EventTable,EventCard}.tsx`、`worldline.module.css`、`PlanningWorkspace.tsx`，以及 `tests/unit/worldline-layout.test.ts`、`tests/browser/planning-worldline-{table-rail,table-scale,canvas}.test.ts` 的迁移和新文件 `tests/browser/planning-worldline-table-rail-modes.test.ts`。`design/`、`docs/` 未审。审核期间 `worldline.module.css` 仍有人在改（`.railLabel.back.hot` 补了 `color: #fff`），本文按审核结束时的文件内容。

已执行（只读，Node v24.18.0）：
- `node --import tsx --test tests/unit/worldline-layout.test.ts`：62/62 通过（基线 53 + RM-01～08 共 9 条）。
- 新文件 `planning-worldline-table-rail-modes.test.ts`：10/10 通过。
- 世界线全部浏览器用例逐文件运行：table-rail 5/5、table-scale 12/12、canvas 15/15、table 10/10、regression 15/15、workspace 26/26、renders 3/3、editor 2/2、header 5/5、infinite 21/21、stamp 5/5、time 3/3、timeline 11/11，没有失败。方案基线记录的 WU-40b 失败这次没有出现。
- 临时探针（放在 `/tmp`，已删除）：一个单元脚本调用 `alignedRailMarks` 检查 compact、年精度回退和时期条；一个浏览器脚本读回退标签和按钮的计算样式、菜单与按钮的矩形、RM-B2/B5 实际选中的卡片。
- 没有运行 `npm run build`、Electron 和 E 层用例。

## 必须修改

### M1 窄栏（compact）下补年份的回退标签日期错误

`worldline-layout.ts:1072-1076`。`body` 是 compact 文字，补年份时直接把 `yearText` 拼在前面。hour 精度的 compact 文字没有月份（`5日 21:00`），拼接后得到错误的日期。探针数据：父 P 1339-08-01（dur 400 天），子 P1 1340-03-01，根 Q 1339-08-14 21:00，hour 精度：

```
非 compact：↺ 第五纪1339年8月14日 21:00
compact：   ↺ 第五纪1339年14日 21:00
```

“1339年14日”读起来像一个日期，但月份丢了。窄栏是常见布局（CSS 注释写明聊天栏旁约 470px）。改法：需要补年份时，正文改用非 compact 文字（`text(c, false)`），或者对回退卡片不用 compact。再补一个单元用例：`compact: true` 下跨年 hour 回退的文字。

### M2 RM-B8 的“菜单在按钮之上”断言恒为真

`planning-worldline-table-rail-modes.test.ts:250-262`。用例在 `scrollTop = 0` 时打开第一张卡片的菜单。卡片在 40px 留白下方，菜单向下展开，与按钮不相交，结果是 `"no overlap"`，而用例接受 `"no overlap"`。探针实测：按钮矩形 y 143–171，菜单 y 213–457。所以 z-index 9 高于 7 这一点没有被验证。改法：把某张卡片滚到头部行贴近滚动区顶部（头部中线在按钮上沿之上），让向下展开的菜单与按钮相交，并且只接受 `"menu"`。

### M3 RM-B4 没有验证“悬停中切换模式后旧高亮消失”

`planning-worldline-table-rail-modes.test.ts:167-169`。用例用鼠标点“等距”：指针从标签移到按钮，`.rail` 的 `onPointerLeave` 先清空了悬停。所以即使删掉 `EventTable.tsx:90` 的 `useEffect(() => setHover([]), [railMode])`，这一步也照样通过。方案 §2/§4 要处理的是指针不动、只换模式的情况。改法：悬停标签后用键盘切换（按钮先通过 Tab 获得焦点，指针留在标签上，再按 Space），然后断言卡片的 `data-hot`、`data-rail-guide` 都已清除。另外，用例标题里的“a cluster label lights all its cards”实际在 RM-B4b 里做，标题应删掉这一句。

## 建议

### S1 年精度回退标签没有纪元，与方案“已知取舍”的描述不一致

`worldline-layout.ts:1076` 只对 day / hour 补年份，符合方案 §3“month / year / era 精度不补”。但年精度的 `railText` 文字只有 `1339年`，没有纪元（探针：`↺ 1339年`、`↺ 1339年5月`），方案“已知取舍”却写“回退标签多为 `↺ 第五纪X年`”。真实数据 1049/1061 是年精度，所以 61 张回退卡片大多会显示 `↺ X年`。回退跨纪元时（如回到第四纪），没有纪元的年份有歧义。建议二选一：修改方案的描述；或者年 / 月精度的回退标签在 `yearText(t)` 与当前徽章年的纪元不同时改用 `yearText`。

### S2 迁移表与实际改动不一致（没有放宽断言）

- **WU-30**（`planning-worldline-table.test.ts:15-20`）：方案要求改为“非标题栏 34px、标题栏 36px”，实际没有改。它能通过，只是因为 F60 前 20 张卡片里没有标题栏（探针计数为 0），标题栏 36px 在这里没有被断言。RM-B5 断言了 36px，可以作为替代，但应在方案中写明，或者照方案修改 WU-30。
- **WU-46**：方案要求开始时点“等距”，实际仍在对齐模式下运行。对齐模式的年徽章也是单调的（只有非回退卡片会更新 `year`），用例能通过，含义也成立。建议在迁移表中改写为“不变，两种模式都适用”，或者照方案补上点击。
- **CW-11**（`planning-worldline-canvas.test.ts:96-98`）不在迁移表里。改动是从 220～880 宽度检查中排除标题栏，同时新增“标题栏宽 = 框宽 ±1”的断言，属于替换，没有放宽。请补进迁移表。
- WU-19j、RL-02 的新值与方案和审核手算一致（`p.top − g.top = 0`、`c1.top − p 底 = 4`、折叠框高 36、框高 124、`qTop` 为 130/216/240）。WU-44/44b 两种模式各跑一次，“存在无可见标签的圆点”仍是硬断言，对齐模式下也成立。

### S3 单元用例缺口与一条走不到的规则

- 审核第 2 轮建议 E（“段内全是 era 精度时不加年徽章”）没有单元断言。代码 `worldline-layout.ts:1059` 在这种情况下 `firstYear` 为 undefined，结果正确，只是没有用例锁定。
- 方案 §3 / RM-08 的“`hasEras && !hasYears` 产生纪元徽章”永远不会触发：`hasEras` 要求 gregorian 日历带纪元，这时 `civilGregorian` 为真，`hasYears` 也就为真（`worldline-layout.ts:157-163`）。`alignedRailMarks` 也从不产生 era 徽章。建议在方案中写明这条规则走不到，并删掉 RM-08 的这半句。
- `firstYear = cards.find(c => c.precision !== "era")`（`:1059`）没有排除回退卡片，方案写的是“第一张非回退、非 era 精度卡片”。只有段首是带子事件的 era 精度父卡、后面紧跟一张回退卡时才会不同，影响很小。建议照方案过滤，或者修改方案的措辞。

### S4 浏览器用例与方案口径的差异

- RM-B1：方案写“Tab 聚焦后 Space 切到等距”，用例用的是 `.focus()`，也没有检查 `:focus-visible` 焦点环。建议改用 `keyboard.press("Tab")` 走到按钮（可以与 M3 共用这段操作）。
- RM-B8 定位：方案写“WU-62 口径”，即 `|y − h/3| ≤ 4`，用例用的是 `0.2 < y/h < 0.45`，宽得多。建议使用同一口径。
- RM-B6 没有悬停回退标签，`.railLabel.back.hot` 的白字和正体没有用例覆盖。审核期间这条规则刚刚补上 `color: #fff`：如果没有它，`.railLabel.back`（0,2,0，声明在后）会盖掉 `.railLabel.hot` 的颜色。探针确认当前悬停时为白字、正体、类型色底。建议在 RM-B6 中加一次悬停并断言。

### S5 模式切换后清空悬停晚一帧

`EventTable.tsx:90` 用 `useEffect`，在绘制之后才执行，切换后的第一帧仍按旧的 `hover` 画参考线和高亮。建议在 `onRailMode` 的点击处理里同时 `setHover([])`，或者改用 `useLayoutEffect`。影响只有一帧。

### S6 CSS 特异性依赖导入顺序

`.railMode button`（0,1,1）与 `planning.module.css:14` 的 `.workspace button`（0,1,1）特异性相同。现在按钮的样式是 `padding 0 12px`、`border 0`（探针读到的计算样式），靠的是 worldline 模块在 planning 模块之后打包。本文件 `:130-131` 对 `.head .expand` 已有先例：明确提高特异性，不依赖顺序。建议同样处理，例如 `.railModeDock .railMode button` 及其 `:hover`、`[aria-pressed]`、`:focus-visible` 变体（`.workspace :focus-visible` 是 0,2,0，目前不冲突）。

### S7 `TABLE_TOP` 两处各写一份

TS 常量 `TABLE_TOP = 40`（`EventTable.tsx:435`）与 CSS `.tableTop { height: 40px }`（`worldline.module.css:213`）必须一致，否则所有坐标换算都会偏。建议占位块直接写 `style={{ height: TABLE_TOP }}`，删掉 CSS 中的高度。

### S8 小问题

- 新用例 `backs()` 中的 `_CALENDAR` 与 `void _CALENDAR` 是没用的代码（`rail-modes.test.ts:68,76`）。
- `alignedRailMarks` 对每张卡片计算两次文字（compact 与非 compact）。非 compact 时两次结果相同，可以复用。千级卡片下可以忽略。
- `periods={allPeriods.map(...)}` 每次父组件渲染都生成新数组，使 `marks` 的 memo 失效。这在 HEAD 的等距模式就已存在，两种模式一样，不是本次回归。
- Ctrl + 滚轮传给 `onZoom` 的 `offset: under.top − sc.scrollTop` 没有减去 `TABLE_TOP`。`PlanningWorkspace` 不使用这个参数，所以没有影响；如果以后要用，需要先统一坐标系。

## 已核对、没有问题的点

- **分组几何**：`push(true)` 位于 `group.top`，收起高 36；`y += GROUP_HEAD_GAP − CARD_GAP` 只在未折叠时执行；折叠时 `group.bottom` 等于标题栏底边。展开标题栏的估算值是 `estimateCardHeight − 2`（建议 G）。`cardHeadOffset` 的 17/22/18/21 与 CSS 一致，RM-01、RM-01b 的手算值全部被断言。
- **`card.head` 处处使用**：`segments[].heads`、对齐模式的圆点和 `points`、时期条、轴线、回退段、引线终点（`EventTable.tsx:319`）、参考线都读 `card.head`。`CARD_HEAD` 只剩 `cardHeadOffset` 一处引用，EventTable 已不再导入。RM-B2 在 F60 顶部、孙级、展开叶子和展开标题栏，以及 F885 虚拟化中部都实测 ≤ 1px（探针确认“展开”这一步视口内确实有展开的叶子和展开的标题栏）。
- **TABLE_TOP 换算**：吸顶年份、虚拟窗口、`firstVisible`、Ctrl + 滚轮指针 y 四处都减了 40；`anchorNow` 与恢复是同一坐标系内的差；定位读 DOM 矩形。WU-45、WU-46、WU-47、WU-62 全部通过。
- **回退规则**：`back = t < max`；回退卡片不更新 `prev` 和 `year`，标签总是可见；连续回退合成一段，起点是上一张非回退卡片的 head。跨年徽章位于与紧邻上一张卡片（含回退卡片）的中点。补年份时“约”放在年份前（建议 D）。RM-04 的数据现在合法（A 300 天、B 240 天，建议 A）。
- **去重键** 用非 compact 文字去掉“约”，`3月5日 21:00` 与 `4月5日 21:00` 在 compact 下都可见（RM-03）。年精度卡片与徽章同年时隐藏，与等距模式的 yearShown 一致。
- **时期条**：按 head 顺序合并连续命中的卡片，`end = null` 视为无穷大；探针确认中间夹一张时期外的卡片时分成两条。
- **悬停委托**：`.rail` 是 `pointer-events: none`，只有标签和圆点是 `auto`，所以 `pointerover` 只来自这两类元素。离开整个 rail 子树时触发 `pointerleave`。圆点和标签都有 `data-ids`，`data-label-for` 保留（建议 F）。标签 key 改为 `ids.join(",")`。对齐模式的标签与圆点一一对应且顺序相同，`marks.dots[i]` 取色正确。RM-B4b 证明等距模式悬停聚合标签时 3 张卡片都高亮。
- **参考线**：只在对齐模式、对悬停的已渲染卡片绘制，`pointer-events: none`，宽度 `leadX + card.left`，与设计稿 `222 + depth × 18` 相同；选中不画。
- **切换按钮**：原生 `<button>`，带 `aria-pressed`，外层是 `role="group"` 加 `aria-label`。`sticky` 容器的 z-index 7 位于吸顶年份（6）之上，低于打开菜单的卡片（9）和目录浮层（15）。`.cards`、`.slot`、`.groupBox` 都不建立层叠上下文，所以比较发生在滚动区这一层（由 M2 在实际界面上验证）。窄栏隐藏前缀、`right: 10px`，RM-B7 通过。模式是界面状态，切到时间线再回来仍保留（RM-B3）。
- **工具栏缩放值**：对齐模式显示 `Math.round(exp(e) × 100)%`，`e` 是夹紧后的值；RM-B3 实测 100% → 125% → 144%。等距模式仍显示档位名。
- **CSS 特异性**：`.slot.slotHead`（0,2,0，声明在后）和 `.slot.slotHead.slotOpen`（0,3,0）都盖过 `.slot.slotOpen` 的 max-width，也盖过窄栏 `.slot { right: 10px }`。`.slot.slotHead > .card.groupHead`（0,4,0）盖过 `.slot:not(.slotOpen) > .card`（0,3,0）和 `.card.open` 的阴影。hot / selected / hit 都改用 inset 阴影，都带 3px 左边（建议 B），`::before` 已隐藏。分组框改用 inset 阴影后嵌套不再逐层偏移，孙级对齐在 RM-B2 中实测成立。
- **虚拟化**：标题栏的 `top` 等于 `group.top`，`renderLevel` 的 `inGroup(c.top)` 和 `header` 判断让标题栏只在自己的分组内渲染一次；`forcedTops` 的判断不变。圆点、标签、徽章仍按 `inWin` 裁剪，引线和参考线只画已渲染的卡片。
- **等距模式与时间线**：`railMarks` 只把端点改为 `card.head`，叶子收起时数值不变（RL-01～07 全部通过）。`groupHead` 只在 `variant="table"` 时传入。时间线和事件目录的代码没有改动，浏览器用例全部通过。

## 结论

**修改后通过。** 布局、对齐规则、回退、徽章、时期条、坐标换算和悬停委托都符合方案，迁移的断言没有被放宽，全部单元和世界线浏览器用例通过。进入全量与真实目标验证之前需要处理三处：
1. **M1**：窄栏下补年份的回退标签丢了月份，正文要改用非 compact 文字，并补单元用例。
2. **M2**：RM-B8 的菜单层级断言恒为真，要构造菜单与按钮相交的场景，并只接受 `"menu"`。
3. **M3**：RM-B4 要在指针不动的情况下用键盘切换模式，这样才真正验证切换后清空悬停。

S1～S8 可以在本轮一并处理，或者在方案中写明。其中 S1（年精度回退标签的纪元）和 S2（迁移表）需要同步修改方案文字。
