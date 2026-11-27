# 600 · 世界线事件表随缩放分级 技术方案与测试用例审核

审核对象：`docs/600-worldline-table-zoom-plan.md`（下称“方案”）。基于 `1df2411` 加未提交的 docs/599 卡片编辑改动。只读审核，未改源码和测试。用户在方案表头确认的四项选择视为固定，不再讨论。

已执行（Node 24.18.0）：

- `tests/unit/worldline-layout.test.ts`：101 项全部通过（基线）。
- 仓库根目录临时脚本（已删除），用 F885 夹具（`tests/helpers/worldline-f885.ts`）直接调用纯函数：
  - `tableZoomBounds`：fit 1.0831、min 0.000256、max 60；`medianRootGap` = 36；745 个根，885 个事件，2 个时间段。
  - 复位 d = 36 × 1.0831 = 38.99，级别 2（一般事件显示为时间点）。d 只比 `ZOOM_POINTS = 40` 小 1.01。min 对应级别 6，max 对应级别 0。
  - `tableLayout` 全部收起约 0.76 ms，全部展开约 0.85 ms；`alignedRailMarks` 约 0.97 ms（Node 环境，每项 20 次取均值）。

## 结论

方向可行：复用 `zoomLevel / cardScale / zoomPlan`，ref 在 layout effect 中提交，`hidden / points / scale` 作为 `tableLayout` 的选项，这几处都与时间线的做法一致。两份布局的计算量在 F885 上约 2 ms，可以接受。但有五处在现有代码上不成立，或者与用户确认的选择冲突，要先改方案再进入 TDD：

1. 事件表卡片没有 ⌄ 按钮，收起走 `onToggle`。方案覆盖的 `onExpand` 在表格里截不到任何操作，用户收不起自动展开的卡片（P1-1）。
2. 卡片外面加 `data-card-zoom` 包层后，`.slot > .card` 这一类直接子选择器全部失效。包层宽度在缩放坐标下变成 slot / 0.75，实际折行与布局估算的行数也会对不上（P1-2）。
3. 级别 0 把拉伸上限提到 1200。夹具默认关闭分级，此时级别恒为 0，docs/586、588 的事件表用例全部跑在 1200 上。产品中在级别 1/0 的边界上，布局也会跳一下（P1-3）。
4. 自动展开的判定依赖 scrollTop，但事件表滚动时不重新渲染；判定用的视图区间也不是锚点恢复后的区间（P1-4）。
5. 家族内的子事件逐个堆叠，没有时间拉伸。家族里任何一张卡片展开，下面的兄弟卡都会被推下，这与用户确认的“不推动下方卡片”冲突（P1-5）。

## P1

### P1-1 自动展开期间，用户无法收起事件表里的卡片

- `EventCard.tsx:238-249`：⌄ 展开按钮只在 `variant === "timeline"` 时渲染。表格卡片的点击走 `ctx.onToggle(e.id, ev.detail)`（`:184-185`），调到 `PlanningWorkspace.tsx:2097-2121` 的 `toggle`。
- 方案 §3.3 写的是“`autoClosed`、`onAutoExpand`（memo 的 `WorldlineCardContext` 覆盖）与时间线 `EventTimeline.tsx:306-349` 相同”，覆盖的只是 `onExpand`（`EventTimeline.tsx:342-349`）。在表格里点一张自动展开的卡片：
  - 这张卡不在 `openCards` 里，`toggle` 走到 `:2120`，把它加进 `openCards`。界面上它本来就是展开的，所以看不出任何变化，也就收不起来，违反 T6 的“用户点收起的卡片保持收起”。
  - 退出自动展开后，这张卡仍留在 `openCards` 里，变成了手动展开。
- `EventTable.tsx:160` 的 `expanded={expanded.has(c.id)}` 读的是工作区的集合。自动展开时卡片的 `aria-expanded` 是 false，但布局按展开排版（`isOpen = c.expanded`，`:150`）。TZB-06 的 `aria-expanded=true` 断言会失败。
- 建议：
  - 表格的卡片上下文覆盖 `onToggle`。`on` 为真且卡片属于“自动展开、不在 `open` 中”时：`detail === 1` 切换本地 `autoClosed`，并保留 260 ms 延迟收起的语义（`COLLAPSE_DELAY_MS`，`PlanningWorkspace.tsx:119`），避免双击的第二次点击落空；`detail >= 2` 照常交给工作区进入编辑。
  - `expanded` 改为 `on ? shownOpen.has(id) : expanded.has(id)`，与 `EventTimeline.tsx:880` 相同。
  - 补用例：自动展开期间单击一张卡片，它收起，`openCards` 不变；双击进入编辑；退出自动展开后再进入，它重新展开。

### P1-2 缩放包层破坏表格卡片的 CSS，折行与布局行数不一致

- 方案 §3.2 在 `.slot` 内加 `<div data-card-zoom style={{ zoom: z }}>` 包住卡片。`worldline.module.css` 中表格卡片的规则都用直接子选择器：
  - `:223` `.slot:not(.slotOpen) > .card`（fit-content、min-width 220、max-width 100%）
  - `:232-235`、`:241-243` `.slot.slotHead > .card.groupHead`（分组头满宽、无边框、圆角、类型色边、hot/selected/hit 阴影）
  - `:391` `.slot.slotStack > .stackWrap > .card`（层叠卡满宽）
  
  加了包层，这些规则都匹配不上：缩小后的分组头会变回普通卡样式，与分组框脱开；普通卡失去 220 的最小宽度。时间线遇到过同样的问题，修法见 docs/592 code review P1-4（`:297-298` 的 `.header > .cardZoom > .card`）。
- 行数：方案 §2 写“行数按未缩放宽度估算（与时间线 §2.5 相同）”。时间线能做到，是因为包层设了明确宽度 `width: el.width / z`（`EventTimeline.tsx:905`）。表格的包层是自动宽度的块元素，在缩放坐标下宽度等于 slot 宽 / 0.75，`max-width: 100%` 跟着放宽。`linesOf`（`worldline-layout.ts:761-769`）判为两行的标题，实际可能排成一行。结果是卡片比布局给的高度矮，下面留出空隙；`data-lines` 与实际不符。
- 建议：
  - §3.2 写明包层宽度：普通卡的包层 `width: widths.slot(depth)px`，分组头和层叠卡的包层 `width: widths.group(depth)px`，都用未缩放值（在缩放坐标下宽度不变，视觉宽度 × z）。或者 `TableCard` 输出布局用到的宽度，渲染时直接用。
  - CSS 的三组选择器都改成同时匹配 `> .cardZoom > .card`，或者包层用 `display: contents` 以外的写法（`zoom` 对 `display: contents` 无效，不能用）。§6 文件范围已列出 `worldline.module.css`，§3.2 要列出具体改哪些规则。
  - 补用例：级别 1–3，分组头的 `getBoundingClientRect().width` 等于分组框宽，左边与框对齐（0px）；层叠卡与分组框同宽；每张收起卡片的实际高度等于 `TableCard.height`（±1px），覆盖一行和两行标题（`data-lines` = 2 的卡至少 1 张）。

### P1-3 级别 0 的拉伸上限 1200：夹具默认路径全部变化，级别切换时布局跳动

- `level = zoomOn ? zoomLevel(...) : 0`（方案 §3.1）。夹具默认 `zoomLevels: false`（`worldline-browser-fixture.ts:73`、`:121`），所以全部已有事件表浏览器用例都在级别 0，按方案会跑在 `max(GAP_MAX, 1200)` 上。下面这些依赖 240 的用例会变：
  - RL-B1–B5：数可见标签（`planning-worldline-table-rail.test.ts:66`、`:75`，`toEqual` 三个标签），按到下限的次数 30–40（`:77-78`）。
  - WU-45 的“根间距增大”和锚点（`planning-worldline-table-scale.test.ts:81-133`）、WU-47b、WU-83，以及 docs/588 对齐模式用例。
  
  这与 TZB-10 的“已有事件表用例全部不变”矛盾。单测 RL-02 直接调 `tableLayout`（`worldline-layout.test.ts:775-796`），不受影响，前提是上限作为选项传入。
- 产品中：从级别 1 放大到 0 要越过 d = 160 × 1.15 = 184。那一帧里，Δt·k 在 240 到 1200 之间的根间隔同时被放开，指针下的卡片由锚点固定，其余内容一下子拉开；缩小回级别 1 时又一下子收回。在回差区间 d ∈ [160, 184) 内，同一个 k 因为来路不同（prevLevel）会得到两种布局。
- 建议：
  - 上限作为 `TableOptions.gapMax` 传入，默认 `GAP_MAX`。只在 `zoomOn` 时放开，关闭分级时保持 240。TZ-08 改为验证这个选项。
  - 上限随 k 连续增长，不按级别跳变，例如 `gapMax = clamp(GAP_MAX × d / ZOOM_FULL, GAP_MAX, OPEN_STRETCH_MAX)`。d = 160 时为 240，d 越大越宽。这样级别 1/0 之间没有跳变，布局也不依赖 prevLevel。
  - 补用例：分级关闭时 F885 的根间距与改动前逐项相同；分级打开时从 d = 150 每步放大到 d = 400，中位根间距单调不减，且任意相邻两步的变化不超过 1.15 倍。

### P1-4 自动展开的判定依赖滚动位置，但事件表滚动时不重新渲染

- 时间线的视图是 `useSyncExternalStore` 状态（`EventTimeline.tsx:164`），平移一帧就重新渲染一次，`autoOpenFits` 在渲染中用 `view.y` 判定（`:320-322`）。
- 事件表的滚动只调用 `sync.current()`（`EventTable.tsx:283-286`），`setWin` 按 1/4 屏的步长变化（`:117-120`），`setSticky` 只在年份文字变化时才 set。非虚拟模式（≤ 300 个事件）下，`win` 恒为 `[-Infinity, Infinity]`，滚动根本不触发渲染。方案 §3.3 的视图区间 `[scrollTop − TABLE_TOP, …]` 在渲染中只能读 `scrollerRef.current.scrollTop`。这个值不是 React 状态：
  - 滚进拥挤区域时，自动展开不会退出，滚出时也不会进入。
  - 在渲染中读 DOM，StrictMode 或中断的渲染会拿到不一致的值。
- 判定用的区间也不对。判定在 `openLayout` 上进行，用的是当前 scrollTop；但切换后 §3.3 会按锚点恢复 scrollTop（`EventTable.tsx:227-234`），恢复后真正可见的区间不是判定时的那一段。docs/597 审核 P1-1 讨论的就是这个问题（判定的布局 ≠ 显示的布局，effect 中来回切换）。
- 建议：
  - 增加一个滚动带状态 `band`，在 `sync.current()` 中按步长量化后 set（例如沿用 `step`）。非虚拟模式也要 set。判定只依赖 `band`、两份布局与 `prevOn`。
  - 判定区间按锚点换算：先在当前显示的布局上取锚点（`zoomAnchor` 或 `firstVisible`）及其屏幕偏移，再用 `openLayout.byId.get(anchor).top − 偏移` 得到切换后的 scrollTop，在这一区间上判定，保证判定的就是切换后可见的那一段。
  - 锚点的捕获点要写明。当前的 `anchorNow` 由事件处理（wheel、ResizeObserver）在旧布局上调用。自动展开切换由渲染决定，需要在 layout effect 中用“上一次提交的布局”（ref）加当前 scrollTop 计算锚点，再在新布局上恢复，不要在渲染中写 `anchor.current`。
  - 补用例：级别 0 自动展开开启时，滚到两个同刻事件附近，自动展开退出；滚回宽松区域，自动展开重新进入。每次切换时，视图中线处卡片的屏幕位置变化 ≤ 2px。用 300 个以内的夹具（非虚拟）和 F885（虚拟）各跑一次。

### P1-5 判定只比较根块，家族内的卡片展开时仍会推动下方卡片

- `tableLayout` 只对根块做时间拉伸（`worldline-layout.ts:832`）。子事件 `block(c, depth + 1, segment)` 没有 `atLeast`（`:817`），家族头、子事件依次堆叠。分组头或任何一个非末尾的子事件展开，同一家族里在它下面的卡片都会下移，与时间无关。
- 方案 §3.3 的判定是“每个根块的底部 + gap ≤ 下一个根块的拉伸起点”，把整个家族当成一块。在这个判定下，家族全部展开后整体下推的情况没有算进去。用户确认的是“视图内每张卡片展开后都放得下、不推动下方卡片”。
- 建议：方案二选一，写进 §3.3 与 §4：
  - 家族不参与自动展开：有可见子事件的分组（头和子事件）保持收起，只展开叶子根卡。这样严格满足“不推动”，但父事件多的作品里自动展开的卡片会少。
  - 家族内也按时间拉伸：子事件块使用 `atLeast = 上一子块起点 + min(gapMax, Δt·k)`，判定扩展到家族内的相邻块。这会改动级别 0 以外的表格布局，影响 RL-02 中 grouped 的 124px 断言（`worldline-layout.test.ts:787-790`），需要单独说明。
  
  这两种做法都偏离了时间线（时间线的家族按行打包，不比较祖孙），需要让用户确认。补用例：一个父事件带两个子事件、间隔足够，验证所选规则（不展开，或展开后兄弟卡屏幕位置不变）。

## P2

### P2-1 指针下的卡片在下一级被隐藏或变成时间点时，锚点丢失

- 滚轮锚点 `under` 是 `l.cards` 中指针所在的卡（`EventTable.tsx:249`），恢复时 `layout.byId.get(a.id)`（`:231`）。从级别 3 缩小到 4 时，一般事件被隐藏，它不在新布局里，`card` 为 undefined，不恢复 scrollTop。新布局变短，视图跳到别处。隐藏还会让该卡的家族一起消失（`zoomPlan` 的 `hidden` 是最上层的隐藏事件）。
- ResizeObserver 路径（`:214-215`）在 400 ms 内同样用 `z.id`，会遇到同样的问题。
- 建议：锚点记录一组备选（指针卡、它的根、它前后最近的重要度 ≥ 下一级 hide 线的根），或者记录时间 t 与屏幕偏移，恢复时取新布局中 `start ≤ t` 的最后一张卡。补用例：指针放在一张一般卡上，从级别 3 缩小到 4，指针处的时间（按轨道标签读）变化不超过一个相邻根。

### P2-2 状态行提示：切换视图时被时间线的卸载清理清空

- 时间线在 layout effect 中写提示（`EventTimeline.tsx:353-357`），在被动 effect 的清理中执行 `actions = null; set(null)`（`:358-362`）。两种视图共用同一个 store（`PlanningWorkspace.tsx:211-212`、`:2348`）。
- 从时间线切到事件表：React 先执行事件表的 layout effect（写入提示），再在被动阶段执行时间线的卸载清理（清空提示），最后执行事件表的 `useEffect`（写入 actions）。结果是提示为 null，要等事件表下一次渲染才恢复。非虚拟模式下滚动不触发渲染，提示可能一直缺失，直到下一次缩放。反过来切换也一样。
- 建议：store 记录写入者，清理时只清除自己写入的提示（`if (owner === me) set(null)`）；或者 `set` 放到没有依赖的 layout effect 里，并在被动 effect 挂载时再写一次。`PlanningWorkspace.tsx:2481` 的 `table ? undefined` 改为两种视图都显示。补用例：时间线级别 2 有提示，切到事件表（同样是级别 2）后提示立即显示，计数是表格自己的；再切回时间线，计数变回时间线的。

### P2-3 时间点的单击、双击没有经过验证

- 方案 §3.2 让 `[data-event-point]` 的 pointerdown 调 `ctx.onSelect(id, e.detail, mods)`，理由是“表格没有 lane 指针捕获，不需要时间线的双击转发”。有三个问题：
  - `onSelect` 是时间线的多选逻辑（`PlanningWorkspace.tsx:2126-2140`），会写入 `selection`，Shift / ⌘ 会累加。事件表不显示多选（`:2479` `selected={table ? 0 : …}`），切回时间线后才出现。
  - 时间线没有用 pointerdown 的 `detail`，而是自己用 `POINT_DOUBLE_MS` 判定连续两次按下（`EventTimeline.tsx:782-788`）。原因是第一次按下后，点在下一帧变成卡片：第一次 click 的 pointerdown 和 pointerup 落在不同元素上，第二次点击落在新卡片上，click 计数不可靠。表格里同样会变（18px 的点变成 34px 的卡，下面的内容整体下移 16px），而且单击卡片在表格里是展开或收起（`onToggle`），与时间线语义不同。
  - 方案没写单击后的结果：变成收起的卡片，还是直接展开（与单击表格卡片一致）？
- 建议：表格的点用 `onToggle` 语义，不传 mods：单击是选中并变成收起卡片，还是直接展开，由方案选定一种。双击照搬时间线 `lastPointPress` 的做法，第二次按下落在新卡片上时只编辑一次，并吞掉随后的 click。TZB-04 的用例分别断言：单击后 `selection` 为空集、`openCards` 是否变化；双击只发出一次进入编辑；第二次点击后卡片不再收起。
- 悬停：卡片列的 `onPointerOver` 只找 `[data-event-card]`（`EventTable.tsx:411-413`），要加上 `[data-event-point]`，否则时间点悬停时轨道上的圆点和引线不会高亮。

### P2-4 父事件的子事件全部隐藏时，方案没写它画成什么

- 时间线：`family(n) = visibleKids(n).length > 0`，子事件全部隐藏时 `stackedOf` 为真，画成层叠卡（`worldline-layout.ts:1360-1363`）。
- 方案 §2 只说“`hidden` 中的事件（含子孙）不进入布局”。`tableLayout` 当前只要 `n.children.length` 不为 0 就建分组（`:802-818`）。如果照搬，会出现只有一个头、没有子事件的分组框；部分子事件隐藏时，`descendantCount`（`EventTable.tsx:167`）显示的仍是全部子孙数。
- 建议：`tableLayout` 引入与时间线相同的 `visibleKids`，没有可见子事件的父事件画成层叠卡（与时间线一致），或者画成普通卡，由方案选定一种。TZ-04 增加这一种情况：家族头 `stacked: true`，不进入 `groups`。

### P2-5 `tableZoomBounds` 改动会让 RL-03 失败；无月历分支没有写明

- RL-03 的 yb 用例：years 历，3 个根，间隔 1，当前 min = 5（`worldline-layout.test.ts:811-812`）。按方案，min = min(5, 0.15 × 0.8 / 1) = 0.12，`assert.ok(Math.abs(yb.min-5)<1e-12)` 失败。§5.1 TZ-06 没有提到要改这条断言。
- `if (!u) return { fit, min: fit / 8, max: fit * 8 }`（`worldline-layout.ts:737`）提前返回。方案没说无月历时是否也放宽下限，不放宽的话，这类历法到不了级别 6。
- 分级关闭时，下限放宽没有意义，还会让“按到下限”的次数变化（RL-B3 `:77-78` 在 view("year") 上不受影响，gap 72 → 0.0017 > 0.000256，但其他夹具可能受影响）。
- 建议：TZ-06 列出 RL-03 中要更新的断言，算出新值；无月历分支同样处理；写明下限放宽是否只在分级打开时生效（PlanningWorkspace 能读到 `TimelineZoomLevelsContext`）。补一条：F885 的 min 不变（36 × min = 0.0092 < 0.12，已经低于级别 6 的阈值）。

### P2-6 级别 ≥ 3 时的折叠按钮回调要保持引用稳定

- `EventCard` 是 memo（`EventCard.tsx:138`）。时间线的 `foldClick` 用 ref 保持引用稳定（`EventTimeline.tsx:410-419`），注释写明了原因：每帧换一个新函数，每个缩放帧都会重渲染全部卡片，Markdown 正文会重置（CP-06）。
- 方案 §3.1 只写“级别 ≥ 3 时切换本地 `unfolded`，不调用 `onFold`”。表格当前直接传 `onFold`（`EventTable.tsx:175`），这个函数是稳定的。改成按级别分支的内联闭包，就会退化成每帧重渲染。
- 建议：写明照搬 `foldLive` + `useRef` 的做法；`cardCtx` 的覆盖也用 `useMemo`。TZB-09 加一条：滚轮缩放一步，展开卡片的 Markdown 正文元素不重建（节点引用相同）。

### P2-7 测试夹具的数值离阈值太近，缺少几类用例

- F885 复位在 d = 38.99，只比级别 2 的阈值 40 小 1.01。任何 `zoomLevels: true` 的 F885 用例都从级别 2 开始，一步滚轮（×1.15）就会到 44.8，但要回到级别 1 必须越过 46（回差）。用例要按这个数算，否则断言很脆弱。建议 TZB 用 `tests/helpers/worldline-zoom.ts` 的 zoomView 作主夹具，只用 F885 测虚拟化和性能。
- 缺少的用例：
  - 虚拟化（> 300 个事件）下：级别 6 时定位一个被隐藏的事件，它显示出来、滚入视图并闪烁；搜索命中一个被隐藏的事件，同样如此。
  - 轨道：隐藏的事件没有圆点、标签和引线；时间点的圆点在对齐模式下与点的中线对齐；等距模式下时间段断开（`breaks`）的数量和“相隔”文字，按过滤后的根计算。
  - 待定位块：级别 ≥ 2 时待定位块里的卡片不变成时间点，也不隐藏（`zoomPlan` 只遍历 `tree.roots`，`worldline-layout.ts:2003`），提示的计数不含它们。
  - 工具栏的“放大 / 缩小”按钮（每步 ln 1.25，`PlanningWorkspace.tsx:2414`）同样会改变级别；“复位”回到 fit 对应的级别。
  - 性能：F885 在分级打开时，每一步滚轮缩放（含级别切换的那一步）的渲染时间 < 100 ms，与 WU-81 同一预算；级别 0 时两份布局同时存在的那一步也要测。
- §5.3 的回归对比 HEAD：按记忆中的做法，HEAD 工作树要链接 `src/generated` 才能跑起来，方案应写明。

## P3

- 时间点的日期和标题宽度：时间线的点用 `stamps`（轴精度的卡片日期），标题截到 94px（`POINT_TITLE_MAX`，因为横向会重叠）。表格横向空间充足，对齐模式下轨道标签已经在同一行显示日期。方案要写明表格的点用哪种日期文字、标题是否放宽到 slot 宽度。用户的原话是“收缩成一行标题”，截到 8.5 个字可能不符合预期，建议实现后截图给用户确认。
- `alignedRailMarks` 的注释“cards are ≥ 39px apart, so labels never collide”（`worldline-layout.ts:1146`）不再成立：时间点之间相距 18 + 6 = 24px，缩小后的卡片相距 25.5 + 6 = 31.5px。两者仍大于 `LABEL_MIN_GAP = 18`，标签不会重叠，但注释要更新，并在 TZB-08 中加一条“相邻标签不重叠”。
- TZ-05 漏了分组头：36 × 0.75 = 27，`cardHeadOffset` 18 × 0.75 = 13.5。高度带小数（25.5、13.5），对齐用例的 0px 断言要允许 ±0.5px。
- 待定位事件不在 `tree.byId` 里（`EventTable.tsx:146`）。§3.3 的“全部展开”要写明是否包含待定位块；视图只落在待定位块时，按“视图内没有卡片”处理。
- 用户折叠的父事件（`foldedEvents`）在“全部展开”下会变成展开的分组头（`worldline-layout.ts:807` 的 `!expanded.has` 分支）。方案要写明：把它排除在自动展开之外，还是允许展开。
- §4 已知限制 2“最多 1200px 空白”：按 P1-3 改为连续上限后，要重写这一条。

## 结论

P1-1 到 P1-5 修正后，方案可以进入用例审核和 TDD 实现。其中 P1-5 的规则要先请用户确认。P2 各项应在同一版方案里一并改正。

## 第 2 轮

审核对象：方案 §8“修订 1”。基于同一工作区（`1df2411` 加未提交改动），只读，未改源码和测试，未跑单元 / 浏览器套件（全量运行另行进行）。对照的代码：`EventTable.tsx`、`worldline-layout.ts`（`tableLayout` `:745-857`、`buildFamilies` `:1348-1365`、`zoomPlan` `:1950-2010`）、`EventTimeline.tsx`（`:186-362`、`:775-800`）、`PlanningWorkspace.tsx`（`:224`、`:303-339`、`:2097-2140`、`:2481`）、`worldline-viewport.ts:47-68`、`worldline.module.css:221-243`、`:385-396`、`tests/helpers/worldline-zoom.ts`、`worldline-f885.ts`。

### 上一轮各项

| 项 | 结论 | 说明 |
|---|---|---|
| P1-1 收起走 `onToggle` | 已修正 | 覆盖 `onToggle`、本地 260 ms 延迟、`detail >= 2` 交给工作区进入编辑，`expanded = on ? shownOpen : expanded`，与 `EventCard.tsx:184-185` 的表格点击路径一致。遗留一点见 P3-a。 |
| P1-2 包层与 CSS | 已修正 | 包层显式宽度取布局的未缩放宽度，与时间线 `EventTimeline.tsx:905` 同理；三组直接子选择器都列入改动。实现时注意层叠卡是 `.slot.slotStack > .tableZoom > .stackWrap > .card`（`:391`），比另外两组多一层。 |
| P1-3 拉伸上限 | 已修正 | `gapMax` 为选项，分级关闭恒为 240。补充一个对锚点有利的性质：d ∈ [160, 800] 时 `gapMax = 1.5 × gap × k`，`min(gapMax, Δt·k) = k × min(1.5·gap, Δt)` 对 k 线性，根间距整体按 k 缩放，缩放连续、无跳变，TZB-12 的 ≤ 1.15 倍必然成立。代价见新 P2-c。 |
| P1-4 滚动带与判定区间 | 未完全修正 | `band` 状态解决了“滚动不渲染”。但判定区间由量化后的 `band` 推出，与真实可见区间相差最多一个步长，进入 / 保持两次判定用的区间不同，可能来回切换，见新 P1-A。“候选布局取与当前相反的那份”在 `on` 为真时也写错了，见同条。 |
| P1-5 家族内拉伸 | 规则已按用户选择写入，但不完整 | 子块之间的拉伸与判定成立；分组头与第一个子块之间不拉伸、又“祖先与子孙不比较”，分组头展开会推动整个家族，见新 P1-B。 |
| P2-1 锚点 | 已修正 | `{ id, t, offset }` 与回退规则可行。大间隔下锚点卡可能远在指针下方，见新 P2-c。 |
| P2-2 提示 owner | 方向正确，有一处漏洞 | store 的 `set` 在内容相同时提前返回（`worldline-viewport.ts:62`），若照此实现 owner 不会更新，见新 P2-a。 |
| P2-3 时间点交互 | 语义已选定，单击路径有问题 | 选定“单击 = `onToggle(id, 1)`，变为展开卡”可以接受。但只在第二次按下后吞掉 click，第一次按下后的 click 可能落到新卡片上又触发一次 `onToggle`，见新 P2-b。 |
| P2-4 子事件全隐藏 | 已修正，需澄清一点 | 时间线的 `visibleKids` 还排除了 `start === null` 的子事件（`worldline-layout.ts:1361`）。表格照搬会让无时间的子事件在分级打开时从表格消失，见 P3-b。 |
| P2-5 `tableZoomBounds` | 已修正 | `{ levels }` 参数、两个分支都放宽，RL-03 不变；years 历 gap 1 时 min = 0.15 × 0.8 = 0.12，数值正确。 |
| P2-6 回调稳定 | 已修正 | 照搬 `foldLive` / `autoLive` 的 ref 写法，`cardCtx` 为 `useMemo([ctx])`。 |
| P2-7 用例 | 已修正 | 主夹具改为 zoomView（gap 720），补齐虚拟化、轨道、待定位、工具栏、性能和 HEAD 链接 `src/generated` 的说明。 |
| P3 各项 | 已修正 | 日期文字、注释、TZ-05 分组头、待定位块、用户折叠、§4 文字都已写入。 |

### 新发现

#### P1-A 自动展开的判定区间来自量化的 `band`，进入与保持判定用的区间不同，可能来回切换

- §8.3 要求渲染中不读 DOM，所以渲染中能用的滚动位置只有 `band`（按 `max(100, h/4)` 量化）。锚点的屏幕偏移 `off`、候选布局上的视图顶，都只能由量化值推出，误差最多一个步长。
- 可以构造出循环：关闭状态，`band` = B0，在展开布局上按锚点换算出区间 V1，V1 不含某对同刻事件，判定为进入。layout effect 用真实 scrollTop 恢复锚点，`sync` 写入新的 `band` = B1（在展开布局上独立量化）。下一次渲染在 B1 推出的区间上做保持判定，B1 的区间比 V1 多出最多一个步长，包含了那对同刻事件，判定为退出。退出后锚点恢复回到接近原来的 scrollTop，`band` 又是 B0，再次判定为进入。每一轮都是 layout effect 里同步 setState，最终触发 React 的 “Maximum update depth exceeded”，或者画面持续闪动。`AUTO_OPEN_GAP / KEEP` 的 24 / 12 回差只针对间隔大小，挡不住区间边界上的进出。
- §8.4 写“候选布局（展开或收起，取与当前相反的那份）”。`on` 为真时，判定的仍然是展开布局能否放下（保持判定），应当在当前显示的展开布局、当前视图上进行，与收起布局无关。照字面实现会在收起布局上检查“展开后是否放得下”，结论没有意义。
- 建议（任选其一，写进方案）：
  1. 判定放到事件里，不放在渲染中：`sync.current()`（滚动、ResizeObserver）和布局提交后的 layout effect 用真实 scrollTop 计算 `fits`，结果作为 state（`on`）只在变化时 set。进入判定在锚点换算后的区间上做，保持判定在当前真实区间上做。
  2. 保留渲染中判定，但加空间回差：进入用 `band` 区间上下各扩一个步长，保持只用 `band` 区间本身（不扩）。这样进入时检查过的范围总是包含保持时的范围，不会在边界上来回切换。
  
  另外写明锚点的优先级：同一次提交中既有滚轮锚点（`anchor.current`）又发生 `flipped` 时，只用滚轮锚点恢复（它已经记录了旧布局上的偏移，对新布局同样适用），不再计算一次切换锚点。
- 用例：TZB-13 增加“在判定边界附近停住（同刻事件对刚好在视图边缘），连续 1 s 内 `on` 最多变化 1 次，控制台无 maximum update depth 报错”。非虚拟、虚拟各一次。

#### P1-B 分组头展开会推动整个家族，与“不推动下方卡片”和 TZ-10 冲突

- §8.5 规定“分组头之后第一个子块不拉伸（紧跟头）”，并且“祖先与子孙不比较”。第一个子块的起点 = 分组头底部 + `GROUP_HEAD_GAP`，之后每个子块的 `atLeast` 都以前一子块为基准。分组头展开（36 → 150–400px）时，所有子块整体下移，这正是“推动下方卡片”。TZ-10 / TZB-06c 断言的“兄弟块 top 不变”在收起布局与展开布局之间比较时会失败。
- 方案二选一，需要写明：
  1. 自动展开不包含有可见子事件的分组头（分组头保持收起，只展开子事件与叶子根）。规则简单，分组头在展开布局里高度不变。
  2. 第一个子块也按时间拉伸：`atLeast = 分组头起点 + min(gapMax, (子.start − 父.start) × k)`，判定增加“分组头底部 + gap ≤ 第一个子块拉伸起点”。但子事件与父事件同一时刻很常见（Δt = 0），这时这个家族永远放不下，只要它在视图内，整个视图都不自动展开。
  
  建议选 1，并在 TZ-10 中明确比较的是收起布局与展开布局中各块的 top。
- 同时写明根层判定比较的是分组底（展开布局）+ gap 与下一个根块的 `atLeast`。收起状态下家族本身就可能超过下一个根的 `atLeast`（子事件按时间拉伸后家族变高），此时这一处在收起时已经推动下一个根，判定恒为假。这个结果符合规则，但应写进 §4 已知限制：时间上跨度大于相邻根间隔的家族在视图内时，不会自动展开。

#### P2-a owner 记录要在内容相同的 `set` 中也更新

- `createZoomNoteStore().set` 在新旧内容相同时直接返回（`worldline-viewport.ts:62`）。时间线与事件表在同一级别、同样的点数时，两者的提示内容完全相同（同一棵树、同一套 `zoomPlan` 规则，计数相同很常见）。切换视图时，事件表写入相同内容被提前返回，owner 仍是时间线，随后时间线的卸载清理 `clear(timeline)` 会把事件表的提示清掉。这正是 P2-2 要修的问题。
- 建议：owner 在提前返回之前更新（内容相同只跳过通知，不跳过 owner）。TZB-05b 用两边计数相同的场景（同一 zoomView、同一级别）测一次。

#### P2-b 时间点单击后的第一次 click 可能落到新卡片上，卡片在 260 ms 后收起

- 时间线在 lane 上捕获指针（`EventTimeline.tsx:797`），click 总是落在 lane 上，所以第一次按下只需在 pointerdown 中 `onSelect`。表格没有指针捕获：pointerdown 时把点换成展开卡（下一帧），pointerup 落在新卡片上，click 派发到按下目标与抬起目标的共同祖先上。按下的点已从 DOM 移除，Chromium 实际派发到哪个元素取决于实现，可能是 slot、卡片列，也可能是新卡片本身。若到了新卡片，`EventCard` 的 `onClick`（`EventCard.tsx:177-185`）会再调一次 `onToggle(id, 1)`。这时卡片已在 `openCards` 中，`toggle` 安排 260 ms 后收起（`PlanningWorkspace.tsx:2116-2121`），结果是单击后卡片闪开又收起。
- 建议：在时间点的 pointerdown 中处理单击，并同时设置 `swallowClick`，吞掉随后的那一次 click（第一次和第二次按下都吞）。或者单击改在 click 上处理，pointerdown 只记录 `lastPointPress`。TZB-04 增加断言：单击后 400 ms 卡片仍为展开，`openCards` 含它，只调用过一次 toggle。
- 另外写明单击的选择语义：`toggle` 会 `setEventSelection(id)`（主选中），`selection`（多选）为空。TZB-04 应同时断言主选中为该事件，避免实现者把“`selection` 为空”理解成不选中。

#### P2-c 拉伸上限变大后，滚轮锚点可能是视图外的卡片

- 滚轮锚点取“指针下方第一张底部低于指针的卡片”（`EventTable.tsx:249`）。上限到 1200px 后，指针常落在两张卡之间的空白处，锚点卡可能在指针下方几百像素甚至视图之外。缩放时被固定的是这张卡，指针附近的内容按 (1.15 − 1) × 距离移动，每步最多约 150px，指针处的时间会漂移。docs/586 时上限是 240，这个问题不明显。
- 建议：锚点取离指针最近的卡（上方或下方），或者按上下两张卡的 `head` 线性插值出指针处的时间 t 与偏移，恢复时按 t 在新布局中插值。TZB-14 增加一条：级别 0、指针位于两张相距 > 600px 的卡片之间，缩放一步，指针处的轨道时间变化不超过相邻两卡时间差的 5%。

### P3

- P3-a：自动展开卡片的本地单击不经过工作区 `toggle`，所以不会 `setEventSelection` / `setPinnedCard`。普通卡片单击会选中，自动展开的卡片单击不选中，行为不一致。建议本地收起时仍调用工作区的选中（例如新增只选中不切换的上下文方法，或复用 `onSelect(id, 1, {})` 但不写多选），由方案说明取舍。
- P3-b：表格的 `visibleKids` 只排除 `hidden` 与时间点之下的子孙，不要照搬时间线的 `start !== null` 过滤。当前表格会显示无时间的子事件（`tableLayout` 遍历全部 `n.children`，`eventTree` 把它们排在最后），§8.5 也写了“待定位或无时间的子事件不拉伸”，说明它们仍在表格里。
- P3-c：`band` 在非虚拟模式下每 1/4 屏渲染一次事件表。只在需要判定时才 set（`zoomOn` 且级别 0），其余情况保持现在的滚动不渲染，WU-81 等性能基线不变。若采用 P1-A 的方案 1，`band` 可以完全不要。
- P3-d：自动展开首帧用估算高度，测量后可能从“放得下”变成“放不下”而退出一次。这是一次性的（测得的高度保留在 `heights` 中），不构成循环，但 §4 第 1 条应补上“可能因此退出自动展开一次”。

### 结论

仍有阻塞：P1-A（判定区间与可见区间不一致，可能来回切换）和 P1-B（分组头展开推动家族，需要在“分组头不参与自动展开”和“首个子块按时间拉伸”中选定一种）要在方案中写明。P2-a 到 P2-c 改动小，应在同一版中一并修正。这几项修正后，可以进入测试用例审核与 TDD。

## 第 3 轮

审核对象：方案 §9“修订 2”。同一工作区，只读，未改源码和测试，未跑任何套件（全量运行另行进行）。对照的代码：`EventTable.tsx`（`:107-121` `sync`、`:131-137` `anchorNow`、`:199-225` 高度测量、`:227-234` 锚点恢复、`:239-257` 滚轮、`:302` 底部留白、`:453-456` `firstVisible`）、`worldline-layout.ts`（`:745-857` `tableLayout`，`:807` 折叠分支，`:832` 根块拉伸链）、`worldline-viewport.ts:56-68`、`PlanningWorkspace.tsx`（`:2097-2124` `toggle`、`:2414` 工具栏缩放、`:2635` `onZoom`）、`EventCard.tsx:177-185`、`EventTimeline.tsx:421-423`、`:780-788`、`:838`。渲染端 `src` 未使用 `StrictMode`（只有 `EventTimeline.tsx:265` 一处注释），开发环境不会重复执行挂载 effect；即使启用，§9.1 的 `decide()` 只在结果不同才 set，锚点“已存在不覆盖”，重复执行也不改变结果。

### 第 2 轮各项

| 项 | 结论 | 说明 |
|---|---|---|
| P1-A 判定区间 | 方向已修正，仍有一处缺口 | 删除 `band`，在 `sync` 与提交后的 layout effect 中读真实 `scrollTop` 判定，进入在预测区间、保持在真实区间，`KEEP ≤ GAP`。“不会循环”的论证依赖“预测区间 = 恢复后的真实区间”，但方案没有保证两者用同一换算，且 §9.5 把滚轮锚点改成插值后两者已经不同，见新 P1-C。 |
| P1-B 分组头 | 已修正 | 按用户选择，分组头不进入“全部展开”，分组头高度在两份布局中相同，家族内子块与根块分别比较。§4 增加了跨度大的家族不自动展开。文字上的一处矛盾见 P3-e。 |
| P2-a owner | 已修正 | 先更新 owner，内容相同只跳过通知，`clear(owner)` 只清自己。实现时 `actions` 也按同样规则（先改 owner）。 |
| P2-b 时间点单击 | 基本修正，有两处要写明 | 单击、双击都在 pointerdown 处理并吞 click，语义改为 `onToggle(id, 1)`（主选中 + 展开）。遗留：吞 click 的标记可能残留，第二次按下的处理位置未写明，见新 P2-d。 |
| P2-c 滚轮锚点 | 规则可行，未接入现有路径 | 插值 `{ a, b, f, offset }` 能固定指针处的时间。但现有锚点恢复与 400 ms 测量路径都只认 `{ id, top }`，方案没写怎样改，见新 P2-e。 |
| P3-a | 已修正 | `onSelectOnly(id)` 只选中不切换展开。 |
| P3-b | 已修正 | |
| P3-c | 不适用 | `band` 已删除。 |
| P3-d | 已修正 | |

### 新发现

#### P1-C 进入判定的预测区间与锚点恢复后的真实区间不是同一个换算，切换后可能立即退出，在 layout effect 中来回切换

§9.1 的稳定性论证是：进入判定用的区间，就是切换后锚点恢复得到的区间，所以保持判定第一次看到的是同一区间。代码和方案在三处不满足这个前提：

1. 换算不同。进入判定按单卡换算（`openLayout.byId.get(anchor).top − off`）。§9.5 之后滚轮锚点改为 `{ a, b, f, offset }` 插值恢复，恢复所得的 scrollTop 与单卡换算不同。在 a、b 之间有卡片自动展开时，两者可相差几百 px。
2. 浏览器夹紧。恢复是 `sc.scrollTop = card.top − a.top`（`EventTable.tsx:232`），浏览器会把它夹到 `[0, scrollHeight − clientHeight]`。预测区间没有夹紧。退出时布局变短，靠近顶部或底部时（底部留白只有 `max(80px, 67%)`，`:302`），真实 scrollTop 会偏离预测值。
3. 调用时机。§9.1 写了在“布局提交后的 layout effect”中调用 `decide()`，但没写它与恢复 effect（`:227-234`）的先后。如果它是单独的 effect，并且声明在恢复 effect 之前，它读到的是新布局上未恢复的 scrollTop，判定的区间是错的。

后果：进入后，第一次保持判定在另一个区间上进行。若该区间含一对放不下的块，就会退出。退出后的布局提交又在预测区间上做进入判定，可能再次进入。每一轮都是 layout effect 中同步 setState，这正是第 2 轮 P1-A 要排除的 “Maximum update depth exceeded”。缩放中途（`zoomAnchor` 有效的 400 ms 内）最容易出现。

建议写进方案：

- 预测和恢复用同一个函数 `project(anchor, layout, clientHeight) → scrollTop`。插值、时间回退和夹紧（上限 `layout.height + 底部留白 + TABLE_TOP − clientHeight`）都在这个函数里，进入判定的区间由它算出。
- `decide()` 只在恢复 effect 内、设置 scrollTop 之后调用（`sync.current()` 已在 `:233`），不再单独加 effect。没有锚点要恢复时，也要在同一位置调用。
- 加一个硬性保证：切换后的第一次 `decide()`（同一提交链中）只允许保持，不允许再次切换。之后要等真实的滚动、尺寸变化或高度测量（ResizeObserver 帧）才能再次切换。这样即使换算有误差，最多每帧切换一次，不会在同一帧内连续 setState。
- TZB-13 增一条：自动展开边界上逐步滚轮缩放（a、b 之间有可展开卡片），每步 `on` 最多变化 1 次，控制台无报错。

#### P2-d 吞 click 的标记要在每次按下时复位，第二次按下的处理位置要写明

- 时间线在每次 lane 按下时先复位 `swallowClick = false`（`EventTimeline.tsx:786`），再按需要设为 true。§9.4 只写了“设置 `swallowClick`”。表格的时间点按下后如果没有 click（拖动超过 4px、pointercancel、在卡片列外抬起），标记会留下来，吞掉下一次无关的卡片单击，那张卡片的展开或收起就丢了。
- 第二次按下时，时间点已经换成卡片，处理函数不能挂在 `[data-event-point]` 上。要写明：放在卡片列的 `onPointerDownCapture`，每次按下先复位标记，再判断 `lastPointPress`（同一事件、`POINT_DOUBLE_MS` 内、位移 < 4px），命中就调用 `ctx.onToggle(id, 2)` 并吞掉随后的 click；没有命中就只在目标是时间点时处理单击。这样新卡片的 `EventCard` `onClick`（`EventCard.tsx:177-185`）不会再调一次 `onToggle`。
- TZB-04 增一条：在时间点上按下并拖出 10px 后抬起，再单击另一张卡片，那张卡片能正常展开。

#### P2-e 插值锚点要接入现有的两条恢复路径，并与切换锚点合并

- 现有代码中锚点只有 `{ id, top }` 一种（`anchor`，`EventTable.tsx:131-137`），400 ms 的测量路径用 `zoomAnchor.id` 重新调用 `anchorNow`（`:215`），恢复 effect 只认 `byId.get(a.id)`（`:231-232`）。§9.5 要求“测量引起的重排沿用同一锚点”，所以 `zoomAnchor` 必须保存插值形式 `{ a, b, f, offset, until }`，恢复 effect 也要能处理两种形式。方案要写明这两处改动，以及 §9.1 的切换锚点（`{ id, top }`）和插值锚点是否合成同一个类型。
- 优先级要写明：400 ms 内滚轮锚点优先，`decide()` 不覆盖它（§9.1 已写）。高度测量的 rAF 回调（`:215`）也不能用 `firstVisible` 覆盖切换锚点。切换锚点只对下一次布局提交有效，恢复后就清空（`:229` 已经如此）。
- `under` 的查找（`:249`）改为按 `head` 找上下两张卡。布局是全量的，不需要考虑虚拟化窗口。但断点（`breaks`）或待定位块两侧的两张卡不在同一段，不能插值。方案要补上“a、b 不在同一 `segment` 时退回单卡”。

### P3

- P3-e：§9.2 写“层叠卡可以自动展开”，但在级别 0 实际不会出现这种卡。级别 0 时 `autoFolded` 为空，`hidden` 为空（级别 4 起才隐藏），剩下的层叠卡只有用户折叠的父事件，而 §8.7 已把它们排除在外。另外，层叠卡展开后在 `tableLayout` 中走分组头分支（`worldline-layout.ts:807` 不成立，`push(true)`，高度按分组头估算）。建议把这句改为“级别 0 下没有可自动展开的层叠卡”，避免实现者另写分支。
- P3-f：§9.1“级别离开 0 时在渲染中派生为 false，layout effect 中清 state”。派生为 false 的那次提交也要清空 `autoClosed`（§3.3），并且用滚轮锚点恢复（这时一定有缩放锚点）。方案写明清空 `autoClosed` 与清 `on` 在同一个 effect 中进行。
- P3-g：`decide()` 读的“两份布局”中，展开布局里未测量的卡片用估算高度，与实际渲染的展开卡不一致。虚拟化下窗口外的展开卡从不测量，滚入后测量，可能触发一次退出（同 P3-d，不循环）。§4 第 1 条把“滚入未测量的卡片”也写进去。

### 结论

仍有阻塞：P1-C（进入判定的预测区间与锚点恢复后的真实区间要用同一换算并夹紧，`decide()` 要放在恢复之后调用，切换后的同一提交链只允许保持）。P2-d、P2-e 改动小，应在同一版中写明。这几项写进方案后，可以进入测试用例审核与 TDD。

## 第 4 轮

审核对象：方案 §10“修订 3”。同一工作区，只读，未改源码和测试，未跑任何套件。对照的代码：`EventTable.tsx`（`:110-121` `sync`、`:122-129` 挂载与滚动容器 ResizeObserver、`:131-137` `anchorNow`、`:210-221` 测量 rAF、`:227-234` 恢复 effect、`:249-252` 滚轮锚点、`:283-286` `onScroll`、`:300` `TABLE_TOP` 占位、`:302` 底部留白、`:453-456` `firstVisible`）、`worldline.module.css`（`:199` `.scroller` 无 padding、`:220` `.cards`、`:245` `.railModeDock` 与 `:263` `.stickyYear` 均为 `height: 0` 的 sticky）、`EventCard.tsx:176-187`、`:208`、`worldline-layout.ts:594-648`（`TableCard.segment`、`TableLayout`）。

### 第 3 轮各项

| 项 | 结论 | 说明 |
|---|---|---|
| P1-C 换算与夹紧 | 已修正 | 预测与恢复都走 `projectAnchor`，夹紧在函数内，进入判定区间由它算出。`maxScroll` 与 DOM 一致，核对见下文“`maxScroll` 核对”。小缺口见 P3-h。 |
| P1-C `decide()` 时机 | 已修正，一处要写明 | 只在恢复 effect（恢复之后）和 `sync.current()` 中调用。现有恢复 effect 在没有锚点时提前返回（`:230`），要改成“无锚点也调用 `sync` 与 `decide`”。另外 `sync.current()` 本身要调用 `decide()`，恢复 effect 里“然后 `sync.current()`，然后 `decide()`”会连调两次，见 P3-i。 |
| P1-C 每条提交链只切换一次 | 未修正 | 规则的边界没有定义，按现有代码实现会失效，或者让 `on` 停在错误状态，见新 P1-D。 |
| P2-d 吞 click | 已修正 | 每次按下先复位，第二次按下在卡片列捕获阶段处理，吞一次后复位。遗留一点见 P3-j。 |
| P2-e 锚点统一 | 基本修正 | 统一为 `TableAnchor`，两条恢复路径都调用 `projectAnchor`。测量路径复用滚轮锚点时偏移要重算，`decide()` 也要用滚轮锚点，见新 P2-f。 |
| P3-e | 已修正 | |
| P3-f | 已修正 | 清 `on` 与 `autoClosed` 在同一 layout effect 中。 |
| P3-g | 已修正 | |

### `maxScroll` 核对

- 滚动内容自上而下：`stickyYear`、`railModeDock`（都是 `height: 0` 的 sticky，不占高度）、`TABLE_TOP` 占位（40px，`:300`）、`data-event-table`（`calc(layout.height + max(80px, 67%))`，`:302`）。所以 `scrollHeight = TABLE_TOP + layout.height + max(80, 0.67 × H)`。
- 67% 按滚动容器内容盒的高度解析。`.scroller` 没有 padding（`:199`），内容盒高度等于 `clientHeight`，两者都不含滚动条。方案的公式与 DOM 一致。
- `.cards` 的 `padding-bottom: 80px` 在 `height: layout.height` 之内（Tailwind preflight 为 border-box），不增加滚动高度。绝对定位的卡片也会撑大滚动区域，但只有在实际高度超过估算、底部又超出 67% 留白时才会。这种情况只出现在未测量的展开卡上，测量后布局即修正。
- 虚拟模式与非虚拟模式使用同一个容器和同一个高度公式。虚拟模式下窗口外的卡片不在 DOM 中，不影响滚动高度。两种模式都成立。
- 差异只来自舍入：`0.67 × H` 可能是小数，`scrollHeight` 与 `scrollTop` 按设备像素取整，差值 ≤ 1px。这个误差落在区间边界上仍可能改变“相交的块”，见 P1-D 的建议 3。

### 新发现

#### P1-D “同一提交链只切换一次”没有定义链的边界：恢复时写入的 scrollTop 会触发 scroll 事件，被当成真实滚动

§10.1 写的是：用 `flipAt = 布局提交序号` 标记切换，切换后的下一次恢复 effect 中，保持判定结果为“退出”时不 set，然后“等下一次真实滚动或布局输入变化”。对照代码，有四处问题：

1. 恢复写入会产生自己的 scroll 事件。恢复 effect 设置 `sc.scrollTop`（`:232`）后，浏览器在下一帧派发 scroll 事件，`onScroll` 调用 `sync.current()`（`:283-284`），也就调用了 `decide()`。按方案的定义，这次调用是“真实滚动”，限制已经解除。如果第一次保持判定本来就会误判为退出（这正是限制要挡住的情况），下一帧就会退出。退出时的恢复写入又产生 scroll 事件，在预测区间上再次进入。结果是每帧切换一次，画面持续闪动。这里不会出现 “Maximum update depth”，因为每次 setState 来自不同的事件，但 TZB-13 的“每步 `on` 变化 ≤ 1 次”会失败。
2. 被拦下的退出没有补做，`on` 可能停在错误状态。保持判定说“放不下”却不 set，`on` 仍为真，展开卡正在推动下方卡片，违反“不推动下方卡片”。要等用户下一次滚动才纠正。用户停手时，这个错误状态会一直留在屏幕上。
3. 只拦了退出，没拦进入。退出后的那次提交里，进入判定照常执行，所以同一条链里可以“退出 → 进入”两次切换，与“只允许一次切换”的写法不符。
4. “布局提交序号”与恢复 effect 的触发条件不一致。恢复 effect 只在 `layout` 引用变化时运行（`:234`）。如果切换 `on` 没有改变布局（例如候选卡片全部已被用户展开，`shownOpen` 的 memo 返回同一引用），这一次切换就没有对应的恢复 effect，“下一次恢复 effect”会落到之后一次无关的提交上，把那一次的判定错误地拦下。高度测量引起的提交算“同一链”还是“布局输入变化”，方案也没写。如果算输入变化，切换后测量那一帧就可以再切换。

建议写进方案：

1. 定义“切换提交”：`on` 的提交值与上一次提交值不同的那次提交（同 `flipped`，与布局序号无关）。在这次提交的恢复 effect 中，`decide()` 不切换（进入、退出都不切换）。
2. 程序写入不算滚动。恢复 effect 记下写入后的 `sc.scrollTop`（`restoredTop`）。`onScroll` 中如果 `|scrollTop − restoredTop| < 1`，就只做 `sticky` 和虚拟窗口的同步，不调用 `decide()`，并清空 `restoredTop`。
3. 被拦下的退出不丢掉，改为延后执行，并加一道闩锁：在 rAF 中重新判定一次。rAF 不在 layout effect 链内，不会触发 “Maximum update depth”。如果这时仍是“退出”就执行，同时置 `latch = true`，在用户输入（滚动事件且不是 `restoredTop`、Ctrl + 滚轮、滚动容器尺寸变化）之前不再允许进入。这样每次用户输入最多“进入 → 退出”两次切换，不会循环，也不会停在推动下方卡片的状态。另一种做法是进入判定把区间上下各扩 8px，覆盖 1px 的舍入误差；可以与闩锁同时采用。
4. 高度测量引起的提交按普通布局输入处理，允许判定，但受第 3 条的闩锁约束（P3-d、P3-g 的“退出一次”正好落在这里）。
5. 用例：TZB-13 补两条。(a) 构造恢复后保持判定为“退出”的情况（例如进入后测得的高度比估算高 30px），500 ms 内 `on` 最多变化 2 次，最终 `on = false`，视图内兄弟块的 top 与收起布局相同（±0.5px）。(b) 自动展开进入后不再操作，1 s 内 `on` 不再变化，`scroll` 事件不超过 2 次。

#### P2-f 滚轮锚点在测量路径与 `decide()` 中的用法

- 测量路径（`:214-215`）现在的做法是每次都按当前 `scrollTop` 重新计算锚点偏移（`anchorNow`）。§10.3 写的是“`zoomAnchor` 有效时用它”。如果直接沿用滚轮时记下的 `{ a, b, f, offset }`，用户在 400 ms 内用普通滚轮滚动后，测量重排会把视图拉回滚轮时的位置。要写明：`a`、`b`、`f` 沿用，`offset` 按当前布局与当前 `scrollTop` 重算（`f` 插值得到的布局 y − `scrollTop` + `TABLE_TOP`）。如果用户在这期间已经普通滚动，就作废 `zoomAnchor`，改用 `firstVisible`。
- `decide()` 切换时写 `anchor.current`。§10.3 只写了“滚轮已写入时不覆盖”。但 `anchor.current` 在每次恢复后都会清空（`:229`），而 400 ms 内的后续提交（测量、恢复写入引起的 scroll）中，`zoomAnchor` 仍然有效。§9.1 规定这时进入判定要用滚轮锚点，所以 `decide()` 写入 `anchor.current` 时也要优先用有效的 `zoomAnchor`（偏移按上一条重算），否则判定用的是插值锚点，恢复用的却是 `firstVisible` 单卡锚点，两者不同，又回到 P1-C 的问题。

### P3

- P3-h：`maxScroll` 在内容不足一屏时为负，夹紧应为 `[0, max(0, maxScroll)]`。`clientHeight` 由组件在调用时读一次，预测与恢复用同一个值，不要在 `projectAnchor` 内各自读 DOM（它是纯函数，本来就不读，写明即可）。
- P3-i：写明 `decide()` 由 `sync.current()` 末尾调用，恢复 effect 只调用 `sync.current()`，不要再单独调用一次 `decide()`。否则同一提交中会判定两次，第二次看到的 `on` 还是旧值，可能重复 set。
- P3-j：第二次按下由卡片列的捕获阶段处理后，要 `stopPropagation()`。否则按下落在新卡片的时间徽标上时，`EventCard.tsx:208` 的 `onPointerDown` 还会开始一次时间拖动，同时进入编辑。

### 结论

仍有阻塞：P1-D。“每条提交链只切换一次”要按上面的写法定义切换提交，排除恢复写入引起的 scroll 事件，被拦下的退出改为在 rAF 中执行并加闩锁。P2-f 改动小，应在同一版中写明。这两项写进方案后，可以进入测试用例审核与 TDD。

## 第 5 轮

审核对象：方案 §11“修订 4”。同一工作区，只读，未改源码和测试，未跑任何套件。对照的代码：`EventTable.tsx`（`:107-121` `sync`、`:122-129` 滚动容器 ResizeObserver、`:131-137` `anchorNow`、`:199-226` 测量 rAF（`:215` 无条件覆盖 `anchor.current`）、`:227-234` 恢复 effect、`:238-257` 滚轮、`:283-286` `onScroll`）、`PlanningWorkspace.tsx`（`:2204-2234` `locateWorldEvent`，表格分支 `:2227-2233` 在两帧后直接写 `sc.scrollTop`；调用方 `:2184` 搜索首个命中、`:2255` 深链、`:2388` 目录、`:2427` 搜索上一个 / 下一个）、`EventCard.tsx:176`（`onPointerDownCapture` 记录按下）、`:177-187`（`onClick`）、`:208`（标题时间拖动）、`worldline.module.css:199`（`.scroller` 只有 `overflow: auto`，无 `scrollbar-gutter`）。

### 第 4 轮各项

| 项 | 结论 | 说明 |
|---|---|---|
| P1-D 提交链边界 | 已修正 | “每条链只切换一次”删除，改为静止 160 ms 后判定一次。恢复写入的 scroll 事件不算输入；被拦下的退出不再存在（每次判定都执行）；切换但布局引用不变时也不会留下错位的拦截（第 4 轮第 4 点随规则一起消失）；高度测量按普通输入处理。§11.1 自称“退出后不会再自动进入，直到下一次用户输入”，但规则里没有机制保证这一点，见 P2-g。外部程序滚动（定位 / 搜索）没有归类，见 P2-h。 |
| P2-f 锚点 | 已修正 | `decide()` 优先用有效的 `zoomAnchor`，并写入 `anchor.current`；测量路径重算 `offset`；用户滚动作废 `zoomAnchor`。`decide()` 用 `zoomAnchor` 时是否也重算 `offset` 没写，见 P3-k。 |
| P3-h | 已修正 | |
| P3-i | 已修正 | `decide` 只由计时器执行。还要写明 `sync.current()` 本身不调用 `scheduleDecide()`，由调用方决定，见 P3-l。 |
| P3-j | 已修正 | 卡片列捕获阶段 `stopPropagation()` 后，React 不再派发到 `EventCard.tsx:176` 与 `:208`；`press.current` 不更新，但随后的 click 被 `onClickCapture` 吞掉，`onClick` 不运行，无影响。 |

### 规则核对

- **定义清楚**：输入 → 重置计时器 → 160 ms 无输入后 `decide()` 读真实状态，结论与 `on` 不同才 set。`decide()` 不产生输入，只有它 set 引起的布局提交会再安排一次判定；那次判定结论相同就不 set，链在这里结束。sticky、虚拟窗口的 setState 不改 `layout` 引用，不进入恢复 effect，也就不安排判定。所以没有用户输入时，切换次数有限，不会自发循环。前提是 `layout` / `openLayout` 只在输入变化时换引用（P3-m）。
- **切换后保持成立**：`fits` 对区间单调（区间越大，参与比较的块越多，越难满足），且 `KEEP ≤ GAP`。进入区间放宽 8px 后包含恢复后的真实区间（误差 ≤ 1px 的舍入）。只要 `openLayout` 在进入与保持之间不变，保持判定必然成立。会变的情况只有两种：切换后新渲染的展开卡测量（估算偏小），以及锚点来源在两次判定之间改变（400 ms 内用 `zoomAnchor`，之后用 `firstVisible`）。测量后的高度留在 `heights` 中，退出后再做进入判定会用实测值，通常判为不进入。但锚点来源改变时，第三次判定可能在另一段区间上重新进入，所以“每次输入至多两次切换”没有保证，TZB-13(b) 可能偶发失败，见 P2-g。
- **不会卡在违反规则的状态**：每个改变 `on` 输入的结果都会在 160 ms 后得到一次如实的判定，没有被拦下的结论。剩下的偏差都是有意的：持续滚动或连续缩放期间，判定一直推迟，展开卡可以在这段时间推动下方卡片。这是 §11.4 的代价，应写进 §4，见 P3-n。
- **虚拟化**：滚动中窗口变化让新卡片进入 DOM，展开卡测量 → 布局提交 → 重新计时，与用户滚动合并为一次判定。没有问题。
- **测量路径**：测量的 rAF 回调是布局输入，按上面的规则处理。有一处竞态：`decide()` 写入 `anchor.current` 后调用 `setOn`，这次更新来自计时器，React 18 在之后的调度任务中才渲染。这段时间里如果测量 rAF 运行（`:215` 无条件 `anchorNow`），或者用户 / 定位写了 `scrollTop`，恢复 effect 会用过期的锚点，把视图拉回 `decide()` 时的位置。定位就会被撤销，见 P3-o。
- **卸载**：计时器在卸载时清掉，`decide()` 只读 ref。还要写明 `decide()` 在 `scrollerRef.current` 为 null 时直接返回（标签页隐藏时 `clientHeight` 为 0，区间内没有块，按“沿用上一状态”处理，没有问题）。

### 新发现

无 P1。

#### P2-g “退出后不再自动进入”只写在论证里，规则中没有对应的机制

§11.1 说退出之后“不会再自动进入，直到下一次用户输入”，但所述规则只有“输入 → 160 ms → 判定”。退出带来的布局提交照样安排一次判定。如果这次判定的锚点与进入时不同（进入在 `zoomAnchor` 有效的 400 ms 内，退出后的判定已经超过 400 ms，改用 `firstVisible`），或者测量只改了视图外的卡片，进入判定会在另一段区间上通过，于是出现“进 → 出 → 进”，TZB-13(b) 的“≤ 2 次”不再成立。

一行修正：`decide()` 执行一次退出后置 `latch = true`；`latch` 为真时 `decide()` 不做进入判定；用户输入（非程序滚动、Ctrl + 滚轮、工具栏缩放引起的 `scale` 变化、滚动容器尺寸变化、`tree` 变化）清 `latch`，高度测量与切换引起的提交不清。

#### P2-h 定位与搜索的滚动没有归类

`locateWorldEvent`（`PlanningWorkspace.tsx:2227-2233`）在两帧后直接写 `sc.scrollTop = top − clientHeight / 3`，搜索首个命中（`:2184`）、上一个 / 下一个（`:2427`）、目录点击（`:2388`）、深链（`:2255`）都走这里。按 §11.1，它的 scroll 事件与 `programmatic` 不相等，会被当作用户滚动，这个结果是对的，但方案应明说，避免实现者把“程序写入”扩大到所有非手势滚动。归类与后续处理：

- 归为**用户输入**：它改变了用户要看的区间，必须重新判定；它同时作废 `zoomAnchor`（与普通滚动相同），并清 `latch`（P2-g）。只有 EventTable 自己的恢复写入属于“程序写入”。
- 判定锚点优先用定位目标：160 ms 后的切换若用 `firstVisible` 作锚点，位于视图 1/3 处、刚闪烁过的目标卡会被上方自动展开的卡片推走。一行修正：锚点顺序改为“有效 `zoomAnchor` → 视图内的 `hitId` / `selected` 卡 → `firstVisible`”，进入判定与恢复用同一个。
- 用例 TZB-15 增：级别 0、自动展开边界附近搜索下一个命中，命中卡在 1 s 内与视图顶的距离变化 ≤ 2px，`on` 变化 ≤ 1 次。

### P3

- P3-k：`decide()` 用 `zoomAnchor` 时，`offset` 与测量路径同样按当前布局和当前 `scrollTop` 重算（§11.2 只写了测量路径）。
- P3-l：写明 `sync.current()` 只做 sticky 与虚拟窗口，不调用 `scheduleDecide()`；由 `onScroll`（非程序写入时）、滚动容器 ResizeObserver（`:126`）和恢复 effect 各自调用。
- P3-m：写明 `openLayout` 的 `expanded` 集合 memo 只依赖 `open`、`tree`、`folded`、`autoClosed`，不依赖 `on`；否则切换会换 `openLayout` 引用，多出一次与输入无关的判定。
- P3-n：§4 增：连续滚动或缩放期间判定推迟，展开卡可以暂时推动下方卡片，停手约 160 ms 后收起（§11.4 的代价写进已知限制）。
- P3-o：`decide()` 先写 `anchor.current` 再 `setOn`。计时器回调里的 setState 在之后的任务中才渲染，这期间测量 rAF（`:215` 无条件 `anchorNow`）或定位写入都可能先触发一次布局提交，用掉或覆盖这个锚点，视图会被拉回 `decide()` 时的位置。一行修正：`decide()` 只预测不写 `anchor.current`；恢复 effect 发现 `on` 的提交值改变（`flipped`）时，用上一次提交的布局与当前 `scrollTop` 按 P2-h 的锚点顺序现算锚点，再 `projectAnchor`。
- P3-p：`programmatic` 用写入后读回的 `sc.scrollTop`（已被浏览器夹紧）；写入前后值相同时不设置（不会有 scroll 事件，否则残留的值会把下一次 1px 的触控板滚动误判为程序写入）。
- P3-q：TZB-13(c)“spy `decide`”在浏览器用例中没有现成入口。改为断言可观察结果：只发生恢复写入时，160 ms 后 `aria-expanded` 无变化，且 `data-auto-open` 计数（或同等的 DOM 标记）不变。

### 结论

无 P1。P2-g（退出后的闩锁）与 P2-h（定位 / 搜索滚动按用户输入处理，判定锚点优先用定位目标）各是一两行规则，写进方案后即可进入测试用例审核与 TDD，不需要再审一轮方案；P3 在测试用例审核时一并核对。
