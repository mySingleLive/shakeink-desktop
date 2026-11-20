# 594 · 世界线时间点悬停显示完整标题：代码审核

审核范围只包括两处：`src/components/content/planning/worldline/worldline.module.css:407-413` 的 docs/594 规则块，和 `tests/browser/planning-worldline-card-zoom.test.ts:699-784` 的 ZB-34 到 ZB-36。工作区里 docs/593 的其他改动不在本次审核范围内。本次审核没有修改源码和测试。

## 实测依据

- 用 Node v24.18.0 运行 `node --import tsx --test --test-name-pattern="ZB-3[456]" tests/browser/planning-worldline-card-zoom.test.ts`。结果 4 个用例全部通过：ZB-34 (r3)、ZB-34 (r8)、ZB-35、ZB-36。连续再跑 5 次，每次都是 pass 4 / fail 0。
- 写了一个临时探针 `/tmp/probe594.test.ts`，用完已删除。它在 zoomView 夹具和 `zoomLevels: true` 下，分别用 ink 和 paper 主题缩放到 d∈[20,26)，然后悬停 r3，读到的结果如下：
  - 悬停时 `.tpoint` 的背景色是 ink `rgb(13, 11, 10)`、paper `rgb(244, 237, 218)`，与画布实际底色（`planning_worldWorkspace` 的背景）一致。外层 `.tcard` 的 `z-index` 为 8，标题右端 822px，没有超出画布右边缘（1420px）。
  - 按 ZB-36 的步骤逐步记录 `[data-hot]`：`zoomTo` 之后是 r3，填写搜索之后是 r3，`revealTimelineCard` 刚返回时还是 r3，此时 opacity 为 1。再等 20 帧后才变成 r2c2，opacity 变为 0.3。详见 P2-1。

## CSS 检查结论

下面这些项与需求和方案 §4 修订 1 一致：

- **左边缘不动**：`.tpoint.hot` 只加了背景、圆角和 `box-shadow`，没有 padding、border 或 margin。标题只改了 `max-width` 和 `overflow`，所以只有右端变长。ZB-34 量过圆点、日期、标题的 x/y，前后差 ≤ 0.5px。
- **衬底不透明，并且盖住 "▸ N"**：背景加在整行 `.tpoint` 上。`.tpoint` 是绝对定位、宽度随内容收缩，标题变长后行宽跟着变宽，`<b>▸ N</b>` 在衬底内。
- **淡化**：`.tpoint.hot.dim`（0,3,0）高于 `.tpoint.dim`（0,2,0），悬停时 opacity 为 1。0.15s 的过渡保留，测试用轮询等待过渡结束。
- **层叠**：`.plane` 设置了 `will-change: transform`，自成层叠上下文。z 8 高于卡片（2）和展开的卡片（5），低于打开菜单的卡片（`.tcard:has(details[open])` 为 9）。时间点所在的 `.tcard` 里没有 `details` 和 `aria-expanded`，两条 `:has` 规则不会同时作用在同一个元素上。选择框、空视图提示、小地图在 `.plane` 之外，不受影响。
- **选中与悬停**：被选中的时间点没有单独样式（只有 `data-selected`），按下后它会变成卡片，所以衬底不会和选中态冲突。拖动时间时 `shownHover` 为 null（`EventTimeline.tsx:553`），标题收回。
- **主题**：衬底用 `var(--background)`，`.paper` 和 `.ink` 各自定义了这个变量（`globals.css:127`、`globals.css:206`）。探针确认两种主题下衬底都等于画布底色。

## P1

无。

## P2

**P2-1 ZB-36 的"悬停前已淡化"这一步，靠的是浏览器在画布平移后补发的悬停事件，存在不稳定风险。**
位置：`tests/browser/planning-worldline-card-zoom.test.ts:775-779`

- `zoomTo(page, 20, 26, "r3")` 会把鼠标停在 r3 上（见 `:44-45`），所以 r3 处于悬停状态。ZB-34（`:713-714`）和 ZB-35（`:744`）在这之后都用 `page.mouse.move(5, 5)` 把鼠标移开，ZB-36 没有这一步。
- 探针显示，`revealTimelineCard` 刚返回时 r3 仍然是 `[data-hot]`，opacity 为 1。之后是因为画布在不动的鼠标下面移动了，Chromium 补发了一次 pointerover，悬停才换到 r2c2，r3 的 opacity 才降到 0.3。`:779` 的 `expect.poll(op).toBeLessThanOrEqual(0.35)` 能通过，就是在等这个补发事件。
- 只要出现下面任一情况，鼠标就会一直停在 r3 上，r3 一直悬停，opacity 一直是 1，这一步会超时失败：`revealTimelineCard` 不需要滚动就返回；滚动后 r3 仍在鼠标下；或者 Chromium 没有补发这次事件。这一步测的也是"悬停前已淡化"，不应该依赖悬停意外转移。
- 建议：在 `revealTimelineCard` 之后、`:779` 之前加 `await page.mouse.move(5, 5); await frames(page)`，与 ZB-34、ZB-35 的写法一致。

## P3

**P3-1 ZB-35 的缩放区间与方案写的不一致。**
位置：`:741`、`:743`、`:745`

用例标题和 `zoomTo` 用的是 17.5 ≤ d < 24.4，方案 §4（P3-1 一行）写的是 d∈[20,26)。`:745` 的注释写"r3 压住 r16 … r20"，并引用了 docs/594 §4，而 §4 只写了 r16。用例本身是在 DOM 里通用搜索相交的元素，找不到就用 `assert.ok(hit)` 明确失败，所以区间变了不会造成误通过。建议把方案、注释、标题统一成同一个区间和同一组卡片。

**P3-2 `[data-fade]` 遮罩靠规则先后顺序被覆盖，优先级相同。**
位置：`worldline.module.css:400` 和 `:413`

`.tpoint > span[data-point-title][data-fade]` 与 `.tpoint.hot > span[data-point-title]` 的优先级都是 (0,3,1)，现在悬停规则因为写在后面才生效。结果是对的，但以后如果有人把第 400 行挪到第 413 行之后，或者在后面再加一条遮罩规则，悬停时会重新出现渐隐。ZB-34 的 `:729` 能发现这个回归。可以在注释里说明依赖顺序，或者在悬停规则上加 `[data-point-title][data-fade]` 的同级写法提高优先级。不改也可以接受。

**P3-3 ZB-34 里 "▸ N 在衬底内" 的断言比较弱。**
位置：`:731-734`

`<b>` 是 `.tpoint` 的子元素，而 `.tpoint` 宽度随内容收缩，所以 `b` 的右端几乎一定在 `.tpoint` 的盒子内。这条断言只能证明衬底的盒子盖住了 `b`，不能证明 `b` 下面的卡片文字被遮住。真正的遮挡证明在 ZB-35，但 ZB-35 只取标题范围内的点。可以接受；如果要补，可以在 ZB-35 中对 `b` 的中心点做一次 `elementFromPoint`，前提是选中的时间点带子事件数。

**P3-4 方案审核建议的部分场景没有用例。**

- 打开卡片菜单（`details[open]`，z 9）时，悬停一个伸长后压在菜单上的时间点，菜单仍在上面。CSS 的数值是对的，但没有用例防止回归。
- paper 主题：ZB-34 只在 ink 下运行，`:730` 比较的是同一个变量的计算值，换主题也成立。本次探针确认 paper 正确，可以在 ZB-34 中用 `theme: "paper"` 再跑一次 r3。
- 悬停后滚轮缩放时，锚点 `elementFromPoint` 命中伸长的标题（方案审核中的可选项）。

这些都不是需求的硬性要求，标为可选。

**P3-5 ZB-35 的按下断言没有确认下面那张卡片没被选中。**
位置：`:769-770`

现在只断言 `hit.id` 变成了卡片。选择是单选，所以选中的就是 `hit.id`，结论基本成立。如果再断言 `selection` 中只有 `hit.id`（或者 `hit.card` 没有 `aria-selected`），可以把 C1 的修订"按在伸长的标题上选中该时间点"说得更完整。

## 测试是否证明了行为

- **ZB-34** 证明了 P1（完整文字、`scrollWidth ≤ clientWidth`、遮罩为 none）、P3（三部分坐标不变、宽度变大）、衬底颜色，以及移开后宽度和 `data-fade` 恢复（用了轮询）。悬停前先把鼠标移到 (5,5)，避免了 `zoomTo` 留下的悬停影响。缩放区间依赖夹具：r3 用 [20,26)，r8 用 [0.2,0.55)。夹具变化时 `zoomTo` 抛错，或者 `:716`、`:718` 断言失败，属于明确失败，不会误通过。
- **ZB-35** 用自然布局下的遮挡做对比：不悬停时该点落在卡片上，悬停后落在时间点上；同时比较了 z-index，按下后时间点变成卡片。这条能证明 P2 和修订后的 C1。
- **ZB-36** 的悬停中（opacity 为 1）和移开后（opacity ≤ 0.35）两步有效。悬停前那一步的问题见 P2-1。
- 调用方说明删掉 CSS 后这些用例会失败，本次审核没有改 CSS，没有复核这一点。按断言内容推算，删掉 CSS 后 ZB-34 的宽度和遮罩断言、ZB-35 的悬停后命中断言、ZB-36 的 opacity 为 1 断言都会失败，与调用方的说法一致。

## 结论

CSS 满足 P1–P3 和修订 1，没有 P1 级问题。合入前建议修复 P2-1，在 ZB-36 中移开鼠标。P3 各项可选。
