# 592 · 世界线卡片两行标题、缩放分级、时间点、层叠父事件 代码独立审核

审核对象：工作区未提交的 592 改动（`git diff` 与未跟踪的 `EventPoint.tsx`、`planning-worldline-card-zoom.test.ts`、`worldline-zoom.ts`）。对照方案 `docs/592-worldline-card-zoom-stack-plan.md`（修订 2 及实现中修订）、方案审核与设计稿 `design/worldline-card-zoom/index.html`。行号以当前工作区为准。

已运行：`tests/unit/worldline-layout.test.ts` 85/85 通过；`tsc --noEmit` 通过（Node 24）。用 `node --import tsx` 直接调用 `zoomPlan`、`buildFamilies` 核对了下文第 1、2 条。未运行浏览器用例。

结论：布局数学与 CSS 基本一致。`tableWidths` 的递推与 `.slot`/`.groupBox` 的 left/right/margin 一致，窄面板 inset 22 正确；头部 chrome 按变体区分；层叠卡高度、偏移和 `cardHeadOffset` 一致；`packFamilies` 的分对间距有断言，ZP-16 也用暴力解法做了对照；`foldClick` 引用稳定，`EventPoint`/`EventCard` 的 memo 没有被破坏；缩放、悬停和“显示为卡片”都不会让 PlanningWorkspace 重渲染。没有 P0。需要修复的 P1 有四条：时间点计数包含画布上没有的事件；选中的父事件在级别 ≥ 3 时折叠钮无效，而且单击选中就会展开家族；时间线折叠钮的状态读的是 `foldedEvents`，与画面不一致；时间线父卡的 `.header > .card` 样式因为多了一层 `zoom` 外包而失效。另有若干测试证明力不足。

## P1：应修复

### 1. 状态行“N 个…显示为时间点”多算了画布上没有的事件

`zoomPlan`（`worldline-layout.ts:1880-1884`）的 `walk` 只在级别 ≥ 3 的自动折叠处停止下探，其他情况会把子孙继续放进 `points`。但 `buildFamilies` 画到时间点就返回（`:1374-1377`），它的子孙不会出现在画布上。另外 `zoomPlan` 不知道用户在事件表中手动折叠的家族（`foldedEvents`），这些家族的子孙也会被计入。`EventTimeline.tsx:288` 用 `plan.points.size` 作为 N。方案 §2.4 的要求是“被折叠家族的子孙不在画布上，不计入”。

实测：级别 2，一般父事件 `p` 带两个一般子事件 `c1`、`c2`，`points = [p, c1, c2]`，画布上只有 `point:p`。级别 2 下，`a`（重要）在 `foldedEvents` 中、子事件 `a1`、`a2` 都是一般，`points = [a1, a2]`，画布上一个时间点也没有。在真实作品中，只有一般子事件的一般父事件很常见，状态行会多报很多事件。ZP-09 的期望值 `['n','p2','q','q1']` 把这个错误写成了正确结果：`q` 是时间点，`q1` 不会被画出来。`zoomView` 夹具在级别 2 下没有“一般父事件且子孙全是一般”的家族，所以 ZB-04 和 ZB-06 都发现不了。

建议：`walk` 遇到时间点后不再下探子孙（与 `buildFamilies` 的处理一致）；`zoomPlan` 接收时间线实际使用的 `foldedEvents`（或者让 `walk` 跳过 `folded` 中的节点）。同时改正 ZP-09 的期望值，再加一个“一般父事件 + 一般子事件、手动折叠家族”的单元用例，以及一个浏览器断言：N 等于画布上 `[data-event-point]` 的数量（取整个构建范围，或者用不裁剪的夹具）。

### 2. 选中的父事件在级别 ≥ 3 时折叠钮没有作用，而且单击选中就会展开它的家族

`zoomPlan` 构造 `kept` 时，从事件本身开始沿父链向上（`worldline-layout.ts:1866-1867`），所以 `keep.cards` 中的事件自己也算“祖先”。`:1883` 不会自动折叠 `kept` 中的节点。方案 §2.2 写的是“`keep.cards` 中某事件的**祖先**”。

由此产生两个问题：
- 级别 3/4 下单击一张层叠父卡（只想选中它），它进入 `keepCards`（`EventTimeline.tsx:186`），整个家族马上展开并重新打包，周围的家族跟着移动。
- 这个家族展开后，点击折叠钮会进入 `foldClick` 把 id 加入 `unfolded`，再点一次删除，两次都没有效果，因为它仍在 `kept` 中。父事件被选中期间，用户无法把它重新折叠。实测：`cards = {p}`，无论 `unfolded` 是否包含 `p`，`autoFolded` 都为空。“定位子事件”时，被展开的祖先家族的折叠钮也同样无效。

ZB-19（`planning-worldline-card-zoom.test.ts:435-439`）先用事件目录定位 `r2`（选中 `r2`），再点击它的折叠钮，然后统计 PlanningWorkspace 渲染次数为 0。这个点击本身就是空操作，所以断言总是成立，没有测到任何东西。

建议：自动折叠的例外只算严格祖先，`kept` 从 `parent` 开始收集；判断“是否画成卡片”时仍然包括事件自身。保留“选中的子事件可见”：被选事件的祖先展开，被选的父事件本身可以保持层叠。ZB-19 的折叠点击改用一张未选中的层叠卡，ZB-05 再补一个用例：先选中层叠卡，断言它仍然 `data-stacked`，点击折叠钮后展开，再点击后折叠。

### 3. 时间线折叠钮的状态和读屏文字读的是 `foldedEvents`，与画面相反

`EventTimeline.tsx:721` 传给 `EventCard` 的是 `folded={folded.has(n.id)}`，这里的 `folded` 是 PlanningWorkspace 的 `foldedEvents`，不是 `viewFolded`。`EventCard.tsx:179-181` 用它决定箭头方向（`foldClosed`）、`aria-label`（“展开 / 折叠…的子事件”）和 `aria-expanded`。

例子：级别 3 下，自动折叠的层叠卡箭头朝下，读屏读“折叠 X 的子事件”，`aria-expanded=true`，实际上家族是折叠的。ZB-05b 中，在事件表手动折叠的 `r2` 在时间线上被 `unfolded` 展开后，按钮仍显示“已折叠”。ZB-05 和 ZB-05b 只断言 `data-stacked`，没有检查按钮状态。

建议：改为 `folded={viewFolded.has(n.id)}`，ZB-05 和 ZB-05b 增加对 `[data-fold]` 的 `aria-expanded` 断言。

### 4. 时间线父卡的头部底色失效（`.header > .card` 不再匹配）

`worldline.module.css:295` 的 `.header > .card` 要求卡片是 `.tcard.header` 的直接子元素。592 在两者之间加了 `div.cardZoom`（层叠时还有 `div.stackWrap`）（`EventTimeline.tsx:733-740`），所以这条规则不再匹配任何元素。结果是所有展开家族的父卡在时间线上从“类型色渐变头部”退回普通卡片底色，缩放级别 0 时也一样。这是 docs/583 已批准的外观，属于 C1 回归。现有用例都不检查这个底色。

建议：改为 `.header .cardZoom > .card`（或 `.header .card:not(.stack)`），并在 ZB-15 或一个已有的时间线用例中断言父卡的 `background-image` 不为 `none`。修改前后各截一张图存证。

## P2：建议修复

### 5. 测试证明力不足

- ZB-20（`:460-470`）：Long Tasks API 只上报 50ms 以上的任务，所以 `e.duration > 16` 永远等价于 `> 50`，方案要求的“每帧 < 16ms”没有被测到。用例还允许 2 次长任务。方案要求的“平移期间 `data-pack-mode` 不出现 full/incremental”没有实现。`:459` 的 `void l` 和未使用的 `l` 是遗留代码。建议按 WU-56c / WU-82 的方法用 rAF 时间戳计算每帧耗时，并读取 pack mode。
- ZB-15（`:361-363`）：宽度只断言在 `[150, 340]` 之间，方案要求等于折叠前它作为叶子时的宽度（`collapsedCardWidth`）。用例只在 c = 1 下测量，“48 × c”没有覆盖（ZB-23 只检查中线）。截图失败被 `.catch(() => {})` 吞掉，证据可能悄悄缺失。用 `document.documentElement.className = t` 切换主题是否与产品的主题切换机制一致，需要确认。
- ZB-16（`:374`）：方案要求“打开时就处于级别 4，首次居中执行”。用例却是先打开、再滚轮缩放、再尝试点击“复位”，而且失败被吞掉。首次居中（`takeCenterRequest` 改为包含 point）实际没有测到。建议构造一个打开时的适配视窗就落在 d < 2.5 的夹具（例如 `zoomView(60)` 加一个很远的根事件），并直接断言。
- 两行标题仍然溢出时第二行末尾渐隐（`.title[data-lines="2"][data-fade]`，`useFade` 中 `scrollHeight` 的分支）没有任何用例。WU-35 删掉了原来“溢出渐隐”的断言（方案审2 2 同意），这条路径就完全没有测试保护了。建议在 ZB-01 或 ZB-02 中构造一个窄到放不下两行的标题，断言 `data-fade` 存在且 `mask-image` 有两层。
- ZB-01 只检查 ⌄ 和 … 在第一行，没有检查方案要求的圆点（`.dot`）。
- ZB-06 与方案不一致：方案 §6.2 写 N = 16，用例按 `zoomPlan` 的结果写成 17（注释说明了 r2、r8 也计入）。按夹具手算，关键事件是 r4、r5、r11、r14、r17、r20、r23，其余 17 个根都是时间点，17 是对的。请修正方案原文，不要只在用例注释里说明。注意第 1 条修复后，级别 4 下这个数不变，因为所有父事件都已自动折叠。
- `revealTimelineCard`（`worldline-browser-fixture.ts:122-131`）在 `boundingBox()` 为 null 时直接返回。卡片离当前 y 超过一屏时会被 vband 裁掉，不在 DOM 中（`EventTimeline.tsx:681-683`），这时函数什么也不做，后面的点击要等到超时才失败，报错位置会误导排查。60 次后仍未进入视野也不报错。建议遇到 null 时也继续按方向键（方向由 `data-view-y` 与布局推断），或者在循环结束时抛错。

### 6. 第二次按下后如果没有 click，`swallowClick` 会残留

`EventTimeline.tsx:638` 设置 `swallowClick.current = true`，只在 `:672` 的 click 捕获中清除。如果第二次按下之后触发 `pointercancel`，或者变成平移、失焦，没有产生 click，这个标志会一直保留，吞掉下一次正常的点击，例如单击另一张卡片却没有选中。建议在 `onPointerDown` 开头和 `onPointerCancel` 中清除这个标志，或者记录时间戳，只吞掉 400ms 内的那次 click。

### 7. 拖动时保留拖动前的悬停高亮

`hoverAt`（`:333-337`）在平移、框选、时间拖动期间直接返回，但不会清空 `hover`。按下标题开始时间拖动时，`hover` 就是这张卡片，拖动全程卡片保持 `data-hot`，时间戳也是类型色底白字，只有标尺胶囊因为 `!timeDrag.preview` 被隐藏。方案 §4 写的是“进行中不更新（保持 null）”。建议在开始拖动、平移或框选时 `setHover(null)`，ZB-12 补一条断言：拖动中没有 `[data-event] [data-hot]`。

### 8. 每次渲染都完整执行一遍 `zoomPlan`

`EventTimeline.tsx:187` 没有缓存，平移的每一帧、每次悬停变化都会对整棵树执行一次 `zoomPlan`，再执行两次 `sameSet`，都是 O(n)。F885 下每次大约 1ms，不影响正确性，但它处在 ZB-20 测量的平移路径上。建议 `useMemo([tree, level, scale, keepCards, unfolded, showAll])`，`prevPlan.current` 作为参数传入但不放进依赖。

### 9. 渲染中写入的 ref

`foldLive.current`（`:343`）和 `toggleShowAll.current`（`:284`）在渲染中赋值。被 React 丢弃的渲染可能留下这次渲染的 `level`，导致下一次点击按错误的级别决定走 `onFold` 还是 `unfolded`。方案 §2.1 对 `prevLevel` 明确要求只在 layout effect 中写入，这两个 ref 也应该在 layout effect 中写入。目前没有使用并发特性，实际触发的概率很低。

### 10. 分组标题行数估算多算了 2px 边框

分组标题卡 `border: 0`（`worldline.module.css:230`），`collapsedHeadChrome` 却总是加上 `HEAD.border = 2`（`worldline-layout.ts:228`）。标题刚好放得下一行时会被估成两行，第二行是空的，卡片高 54。这是方案允许的“估算偏大”，但没有必要。建议 `tableLayout` 对 `groupHead` 的宽度加 2，或者给 chrome 传一个 `border` 参数。

### 11. 遗留与死代码

- `worldline.module.css:392` 的注释“The stamp keeps its 10.5px at any card zoom (its inline zoom undoes the card's)”下面没有对应的规则。时间戳已经移到 `zoom` 外包之外，这条注释描述的是已放弃的方案，应删除。
- `EventPoint.tsx:29` 加了 `s.selected`，但没有 `.tpoint.selected` 规则。时间点被选中后会变成卡片，这个类不会生效，可以删除。
- 方案 §2.4 定义的提示结构是 `kind: "points" | "pointsKey"`，实现是 `key: boolean`（`worldline-viewport.ts:579`）。功能等价，建议同步更新方案文字。

## 已核对、没有问题

- **`tableWidths`**：`.slot`/`.groupBox` 以 `.cards` 的内边距盒为参照，`left 12 / right 24`（窄面板 `right 10`），组内再加 `marginLeft = 18`，递推与 CSS 一致。层叠卡 `.slotStack` 最大宽度 940，等于 `group(depth)`。ZP-04 的数例与手算一致。
- **头部 CSS 与偏移**：选择器优先级按顺序覆盖：`.card:not(.open) > .head`（0,3,0）覆盖 `.groupHead .head`；`.card.groupHead:not(.open) > .head` 和 `.card.stack:not(.open) > .head`（0,4,0）覆盖 7px 内边距。34/52、36/54、40/58（+8）与 `collapsedCardHeight`、`cardHeadOffset` 一致。
- **缩放外包**：`.tcard` 保持布局给出的 left/top/width；`.cardZoom` 设置 `zoom` 和 `width: w / z`；时间戳和剪切标签在外包之外，按 `.tcard` 定位，不受缩放影响。展开卡和编辑卡的 `zoom` 为 1，测量高度不需要换算。
- **`zoomLevel`、`cardScale`**：回差的 `max(down, min(prev, at(1.15)))` 在跨多级时也正确，ZP-06/07 覆盖了这些情况。`prevLevel`、`prevPlan` 只在 layout effect 中写入。
- **集合沿用**：`keepCards` 每次变化都会新建集合，但 `zoomPlan` 在内容相同时返回 `prev` 的 `points`/`autoFolded`。`viewFolded` 的依赖是稳定的。平移时 `relayout` 为 false。
- **间距与 settle**：模块加载时的断言与 ZP-16 的暴力解法对照都成立。时间点家族的 `left` 已减去 6。
- **Memo**：`foldClick` 引用稳定；`EventPoint` 的 props 都是基本类型或稳定对象；悬停只让两张卡片重渲染。`ZoomNoteLine` 订阅自己的 store，PlanningWorkspace 不会因为缩放而重渲染。两个面板各有一个 store，卸载时清空提示和回调，StrictMode 下重复挂载的顺序也正确。
- **交互**：时间点按下时焦点交给时间线根节点（ZB-09）；框选、空视图和首次居中都已把 `point` 计入；时间拖动预览对时间点子事件同样应用 `translateX`；滚轮锚点能找到时间点；编辑中的卡片和当前搜索命中在 `keep.cards` 中；角色变化轨道和小地图没有改动。
- **已有用例的修改**：WU-41/42/48、RM-B5 和 `worldline-layout.test.ts` 中三处折叠断言，都按方案 §6.3 改为断言层叠卡，期望值收得更紧（48、`head + 20`、`d.top = 94`），没有放宽。WU-35 删除“溢出渐隐”是方案批准的修改，但这条路径从此没有测试保护（第 5 条）。其他用例新增的 `revealTimelineCard` 只移动画布的 y，不选中、不定位，没有改变这些用例原本验证的内容。

## 第 2 轮

核对对象：主代理按方案 §9 修改后的工作区。逐条读了代码，没有只看说明。已运行：`worldline-layout` 单元 85/85 通过；用 `node --import tsx` 重跑了第 1 轮的三个反例。浏览器用例没有重跑，191 项通过是主代理的结果。

结论：P1-1 到 P1-4 都已修复，没有引入新的 P0 或 P1。剩下的都是 P2/P3。

| 项 | 核对结果 |
|---|---|
| P1-1 计数 | `walk`（`worldline-layout.ts` `zoomPlan`）遇到时间点就 `return`，`userFolded`（`keep.folded`）中的家族不再下探，`EventTimeline.tsx:187` 传入了 `folded`。重跑反例：一般父事件带一般子事件，`points = [p]`；手动折叠的家族 `points = []`。ZP-09/10/11 的期望值已改为只计画出的事件，并新增手动折叠的情况。 |
| P1-2 选中父事件 | `kept` 只包含事件自身，`opened` 只包含严格祖先，自动折叠的例外只看 `opened`。重跑：选中 `p` 时 `autoFolded = [p]`，加入 `unfolded` 后为 `[]`，折叠钮可以切换。ZP-11 新增断言；ZB-19 在点击后断言 `data-stacked` 消失，那次点击不再是空操作。 |
| P1-3 折叠钮状态 | `EventTimeline.tsx:724` 改为 `folded={viewFolded.has(n.id)}`。ZB-26 断言了 `aria-expanded` 和 `aria-label` 在点击前后的变化。 |
| P1-4 父卡头部 | `worldline.module.css:296` 改为 `.header > .cardZoom > .card`。ZB-27 在 c = 1 和 c < 1 两种情况下断言父卡与叶子卡的 `background-image` 不同。层叠父卡外面多一层 `.stackWrap`，这条规则匹配不到，所以层叠卡用的是自己的 `.card.stack` 渐变，与设计稿一致。 |
| P2 已处理 | ZB-20 改为用 rAF 帧间隔取 p95；ZB-15 与家族框宽度比较；ZB-25 覆盖两行仍溢出时的渐隐；`revealTimelineCard` 在卡片不在 DOM 时 3 秒内失败；每次按下都清除 `swallowClick`；`shownHover` 在时间拖动预览期间隐藏卡片、时间点、时间戳和标尺上的高亮；分组标题行数估算加回 2px；删除了无效注释；`EventPoint` 改为输出 `data-selected`。 |

### 修复后剩余的问题（P2/P3，不阻塞）

- **P2 只在时间拖动时清空悬停。** `shownHover` 只在 `timeDrag.preview` 存在时为 null。平移和框选进行中 `hoverAt` 不更新，`hover` 保持按下前的那张卡片，平移时它和画布一起移走，高亮仍然留着。方案 §4 写的是“平移、框选、时间拖动进行中保持 null”。建议在 `drag.current.active` 或 `box.current.active` 置为 true 时调用 `setHover(null)`。
- **P2 自动折叠现在也会折叠已展开的父卡。** P1-2 修复后，`open`（已展开卡）仍在 `keep.cards` 中，但不再进入 `opened`。所以在级别 ≥ 3 下展开一张父卡的正文，它的家族仍然是折叠的：只显示正文，不显示子事件。这是“选中不展开家族”这条规则的直接后果，可以接受，但方案 §2.2 中“已展开”的含义需要写清楚：正文展开，家族不展开。
- **P2 第 1 轮第 5、8、9 条中仍未处理的部分：**
  - ZB-16 仍是“滚轮缩放后点击复位（失败被吞掉）”，首次居中没有测到。
  - ZB-15 只在 c = 1 下测量，截图失败仍被 `.catch(() => {})` 吞掉。
  - ZB-20 没有检查 pack mode，`void l` 仍在（`planning-worldline-card-zoom.test.ts:463`）。
  - `zoomPlan` 每次渲染都执行，没有缓存（`EventTimeline.tsx:187`）。
  - `foldLive` 和 `toggleShowAll` 两个 ref 仍在渲染中写入（`:284`、`:343`）。
- **P3** ZB-20 的阈值“p95 < 20ms”比方案的“每帧 < 16ms”宽松，用例名称仍写“under 16ms each”。建议把名称改成与断言一致。
