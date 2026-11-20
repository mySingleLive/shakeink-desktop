# 596 · 小地图上下左右移动视口 技术方案审核

审核对象：`docs/596-worldline-minimap-2d-plan.md`（下称“方案”）。基于工作区当前代码（含 docs/595 未提交修改）。只读审核，未改源码和测试。

已执行：`node --import tsx --test tests/browser/planning-worldline-minimap.test.ts`，MM-B1 两个宽度通过（基线）。另用 /tmp 临时脚本在 F60 夹具上量了尺寸，已删除。结果：1440 / 820 / 560px 三个宽度下 lane 高 693px，plane 高 3998–4126px，打开后 `view.y = −4`，lane 宽 1140 / 580 / 536px，小地图 420×44，左边距分别为 702 / 142 / 12px。可见卡片中，被现在 44px 高的小地图挡住的有 1 张，换成 120px 后有 2 张。夹具中没有人物变化行（lane item 数为 0）。

## 结论

方向可行，用户选定的“全时间轴 + 当前排版纵向”和 120px 高度可以实现。但纵向模型有两处会造成可见的错误。一是内容高度 H 没有算人物变化行。二是把 y 夹到 `[laneH − H, 0]` 与画布 y 不设上下界的现状冲突，作品较小时点一下小地图会把卡片上移。这两处修正后再进入测试用例审核。

## P1

### P1-1 H 没有包含人物变化行，夹住后这些行用小地图到不了

- 方案 §2.1（第 27 行）取 `H = max(laneH, packed.bottom + 120)`，理由是与 plane 高度一致（`EventTimeline.tsx:706`）。
- 实际内容的底部不是 `packed.bottom`。人物变化行从 `laneTop = layout.bottom + LANE_GAP` 开始（`worldline-layout.ts:1602-1604`）。每个人物组再占 `packed.height + 40`（`EventTimeline.tsx:238-253`，`top += packed.height + 40`）。行数多的时候，底部远超 `bottom + 120`。plane 的 `height` 现在只是装饰值（lane 为 `overflow: clip`，`worldline.module.css:278`），以前算错没人看出来。小地图若拿它做比例和夹住上界，就有两个后果。
  - 用小地图拖到最底时，y 停在 `laneH − H`，下面的人物变化行到不了。
  - 用画布平移到人物行以后，`toMY(−view.y)` 被夹到 1，视窗框贴在绘图区底部不动，看不出视口在哪里。
- 建议：`H = max(laneH, contentBottom + 40)`，其中 `contentBottom = max(packed.bottom, laneTop + max(item.top + item.height))`，人物行 item 取 `step.elements` 里 `kind === "lane"` 的，或者 `lanePack.items`（它们的 top 是相对 laneTop 的）。plane 的 `height` 可以顺便改成同一个值，但这超出 C1“只改小地图”的范围，要在方案里写明是否一起改。
- 测试：要有一个带人物变化行的用例（`lanes` prop 非空），断言拖到小地图底部时，最后一个 `laneItem` 进入 lane 可见范围。F60 和 mm30 都没有人物变化行（实测 lane item 为 0），现有的 MM-B2..B7 覆盖不到。

### P1-2 把 y 夹到 [laneH − H, 0] 改变了画布的现有行为，点一下小地图就会让纵向跳动

- 视口 y 按设计不设边界：`worldline-viewport.ts:4-5` 的注释写明“unbounded, like start, so the canvas has no edge in any direction”。`check` 只要求 y 是有限数（`:22`）。中键或空格平移（`EventTimeline.tsx:611`）、⌘/Alt + 滚轮（`:409`）、编辑器露出逻辑（`:517`）、缩放锚点（`:455`、`:465`）都直接写 y，不做夹住。
- y 大于 0 是常见状态，不是例外。打开时的居中（`:540-543`）和“复位”在卡片放得进 lane 时写入 `y = laneH/2 − (top+bottom)/2`，结果是正数。所以凡是作品较小、内容不足一屏的情况，y 都大于 0。此时 `H = laneH`，按方案只能 `y = 0`。
- 后果是方案 §2.3 的按下即调用 move（与现有 `onPointerDown → moveMini(px)` 相同，`:806`）会把 y 从正数写成 0，卡片整体上移。即使用户只是想左右点一下也会这样。同理，用户用画布平移到内容上方（y > 0）或下方之后，第一次碰小地图也会让纵向跳回范围内。MM-B1 一类“点段框换时间”的用法从此附带了纵向跳动。
- 方案 §2.3 第 40 行“按在框内时偏移 = 按下点到框左上角”在这种情况下也不成立。框的 top 是夹住以后画的，与真实 y 不对应，按在框内同样会跳。
- 建议（任选其一，推荐 a）：
  - a. 纵向改用增量拖动：按下时记下 `y0` 和 `py0`，拖动时 `y = y0 − (py − py0) × H / mh`。按下但不移动时 y 不变。在框外点击才把框中心移到指针处。夹住范围取 `[min(laneH − H, y0), max(0, y0)]`，也就是包含当前 y，绝不因为按一下就把已经越界的 y 拉回来。
  - b. 保留绝对映射，但按下时只改时间，指针移动超过阈值（可复用 `PAN_THRESHOLD`）后才改 y。
  - 无论选哪个，内容不足一屏（`H ≤ laneH`）时小地图都不改 y。方案第 40 行“内容不足一屏时 y = 0 不动”应改为“y 保持原值不动”。
- 测试：补一个用例。F60 筛到只剩 3 个根事件（或者用小夹具），打开后 y > 0，在框内按下松开、在段框上点击，断言 `data-view-y` 不变，`data-view-start` 改变。再补一个：画布 ⌘ + 滚轮把 y 推到 `+300`，在小地图框内按下拖动 10px，断言 y 连续变化，没有跳到 0。

## P2

### P2-1 120px 高度挡住编辑器的保存/取消按钮和窄面板的大片区域

- 编辑器露出逻辑（`EventTimeline.tsx:511-517`）只让编辑器底部离 lane 底 12px（`l.bottom − m`）。小地图 `z-index: 12`，位置 `right: 18px; bottom: 14px`（`worldline.module.css:304`）。现在高 44px，已经能盖住右下角编辑器的按钮；改成 120px 后，右侧 420px 宽、底部 134px 高的范围都在小地图下面。正在编辑的卡片若靠右下，保存/取消按钮会被盖住。方案 §2.4 第 47 行说“emptyView、居中、锚点都基于 lane，不受影响”，这句话本身没错，但正因为它们基于 lane、不知道小地图的存在，才会被盖住，不能当作“无影响”的理由。
- 窄面板（容器 ≤ 640px，`worldline.module.css:365`）上小地图占满 lane 宽度（实测 560px 宽时为 536px 宽中的 420px，左边距 12px）。120px 约占 693px 高 lane 的 17%。lane 较矮时（小窗口、底部还有状态栏），`emptyView` 放在 `top: 45%`（`:283`），lane 高约 300px 以下就会与小地图重叠。小地图在上层，“复位”按钮可能被盖住。
- 建议：
  - 露出逻辑在小地图横向范围内把下边距改为 `小地图高 + 14 + 12`。这是对画布的修改，要在 C1 中写明例外；或者在“已知限制”中明确记下，交给用户决定。
  - 窄面板或 lane 高于某个阈值以下时降回较低高度，比如 `@container (max-width: 640px)` 用 72px，或 lane < 400px 时用 72px。用户只指定了 120px，降级需要写明并说明理由。
  - 测试：至少在 560px 宽和 1000×600 窗口下截图，断言 `[data-empty-view] button` 与 `[data-minimap]` 的 boundingBox 不相交。

### P2-2 “未排版”底行的含义和实际不完全一致

- 方案 §2.2 把 `packed.families` 中 `built` 为真的当作已排版，其余都放底行。但构建范围内被缩放分级隐藏的根事件不在 families 里：`buildFamilies` 过滤了 `hidden`（`worldline-layout.ts:1379`），`timelineStep` 传入的是 `plan.hidden`（`:1699`）。它们会被画到底行，与真正在构建范围外的事件混在一起。另外，增量排版时范围外的家族以 `built: false` 保留在 families 里（`:1494`），它们有上一次的 y。方案选择不用它，这没问题，但要写明。
- 底行在 docs/595 的分段横轴上会很密。缩小到“适配全部”时构建范围覆盖全部，底行为空；放大后绝大多数根事件落到底行，上方只剩构建范围内的几列。用户看到的“纵向”只对七个视窗宽的一段有意义，这一点要写进 §3。
- 建议：§2.2 明确“隐藏的根事件按未排版处理”或“不画”。ZB-30（`planning-worldline-card-zoom.test.ts:630`）数的是 `[data-minimap] i`，要求 level 0 与 level 6 数量相同，因此必须继续每个根事件画一个 `<i>`，不能因为隐藏就不画。§4.1 回归列表已列 ZB-30，但方案应写明这个约束。

### P2-3 slider 的 ARIA 语义与 2-D 键盘冲突

- 小地图是 `role="slider"`（`EventTimeline.tsx:792`）。按 ARIA slider 惯例，↑/↓ 与 →/← 一样是增减值；方案用 ↑↓ 改纵向，读屏用户会以为在改时间。
- 测试和代码都依赖 `getByRole("slider", { name: /全局缩略/ })` 和 `aria-valuenow`：`planning-worldline-canvas.test.ts:17,189-191`（CP-03 用它算时间），`planning-worldline-workspace.test.ts:17`，`planning-worldline-regression.test.ts:136-157`（WU-66f）和 `:170-173`（WU-69），`planning-worldline-timeline.test.ts:128-130,199-207`。改 role 会牵动这些测试。
- 建议（最小改动）：保留 `role="slider"` 和 `aria-valuenow = 时间`，让 slider 继续代表时间；在 `aria-valuetext` 后追加纵向位置，比如“…，纵向 第 35%”；`aria-label` 保持匹配 `/全局缩略/`（方案的新文案满足）。键盘 ↑↓ 改纵向写进 `aria-label` 已经足够，因为它本来就是“方向键平移”。方案应明说选了这个折中，并在 WU-69 中加断言：`aria-valuetext` 包含纵向信息，按 ↓ 后 `aria-valuenow` 不变。

### P2-4 键盘与 Esc 的边界没有写清

- ↑↓ 冲突：小地图的 `onKeyDown`（`:812-816`）没有 `stopPropagation`，但根节点的方向键处理在 `if (e.target !== e.currentTarget) return;`（`:582`）之后，小地图获得焦点时不会重复移动。这一点方案可以直接写明“无冲突”。全局输入命令 `input.up/down` 只作用于文本控件（`src/lib/desktop/input-commands.ts:120-150`），不会截获。WU-66f（`regression.test.ts:136-157`）只验证了 ← →，应扩展为改绑后小地图的 ↑↓ 仍然有效。
- 步长不一致：根节点 ↑↓ 一次 80px（`:588`），小地图一次 `laneH / 4`（约 173px）。两种都可以接受，但要写明是有意不同（小地图 ← → 也是 span/4，与根节点的 span/10 不同，算是一致的思路）。
- Esc / 窗口失焦：`cancel()`（`:371-382`）只把 `miniDrag` 置空，不恢复 start（现有行为，`planning-worldline-timeline.test.ts:198-207` 只测了 Esc 后不再跟随）。改成 2-D 后，Esc 同样不会恢复 y。画布平移的 Esc 会恢复 start 和 y（`restorePan`，`:468-471`）。方案应说明小地图沿用“Esc 只停止，不恢复”，或者改成与画布一致；无论哪种都要在测试中写明。
- 按在底行时“纵向不变”（§2.3 第 42 行）只说了按下，没说按下后拖进绘图区怎么办。若采用 P1-2 的方案 a，可以把这条规则删掉：底行按下时直接按增量拖动处理，纵向只随移动变化。

## P3

### P3-1 每帧渲染的开销

- `step.state.packed` 是同一次渲染里已经算好的对象，读取不额外花钱。每个根事件做一次 `families.get(id)` 是 O(根事件数)。F885 约 885 个根事件、真实数据约 995 个，每个 pan 帧多出这些 Map 查找和 style 对象，与现在每帧重建这些 `<i>` 的成本同级。按理不会使 ZB-20（`card-zoom.test.ts:489-499`，p95 < 20ms）超标，但现在每帧都会重建全部 `<i>` 的 style 对象，这本身就是浪费。
- 建议：把标记列表放进 `useMemo`，依赖 `[tree, mini, packed, H, dimmed]`。`packed` 只在重新排版时换引用，平移帧可以复用同一组 React 元素。要确认 `dimmed` 引用是否稳定（PlanningWorkspace 传入的是 `wDimmed`，`PlanningWorkspace.tsx:2766` 附近）；如果不稳定，就把 opacity 留在 memo 外。ZB-20 应在实现后照常复跑；如果给小地图加了 memo，最好再对比一次 p95。

### P3-2 视窗框最小高度和夹住范围不一致

- `height = max(8, laneH / H × mh)`（方案第 29 行）。真实数据中 H 可能有几万 px，框的真实高度不足 2px，被放大到 8px。y 到下界时 `top = toMY(H − laneH)`，框底超出绘图区约 6px，方案用“上限到绘图区底”截掉。点击“使框中心在指针处”的目标仍然是按真实高度的一半算，还是按显示的 8px 的一半算，方案没写清；MM-B4 的期望值也因此不确定。建议统一为：映射只用真实比例，框的显示高度单独取 max(8)，并以框的真实中心为准。

### P3-3 测试用例的可执行性

- MM-B2：“`top` 与 `toMY(family.y)` 相符”在浏览器里读不到 family.y。建议给 `<i>` 加 `data-mini-root={id}`，按 id 取对应根卡片 `[data-event-card][data-event-id=id]` 外层的 `style.top`，再比较顺序（非严格单调，同 y 不同列的家族会并列）。另外，F60 和 mm30 打开时都是适配全部、全部已排版，底行为空。“未排版根事件在底部一行”必须先放大（参照 MM-B1 的滚轮循环），断言里也要先确认底行数量大于 0。
- MM-B4：85% 处的期望值要按夹住后的结果计算。F60 下 H ≈ 4000、laneH = 693，85% 对应 `−y ≈ 3052`，下界 3305，这次刚好没碰到；换一个夹具就可能碰到。容差 `±H/90 × 2` 在 H = 4000 时约 ±89px，偏松，可以改成 ±(H/mh × 1.5)。
- MM-B5：“拖到底部以下时 y 夹在 laneH − H”应同时验证 P1-2 的规则：起始 y 越界时不跳。
- MM-B6：起始 y 为 −4，按 ↓ 两次应得 `−4 − laneH/2`；按 ↑ 恢复时会被上界 0 夹住，得到 0 而不是 −4。用例要写明期望值，不能写“恢复”。
- 缺少的用例：P1-1 人物变化行；P1-2 内容不足一屏 / y 越界时按下不跳；P2-1 窄面板与矮 lane 的遮挡；P2-3 aria-valuetext 与 ↓ 后 valuenow 不变；P2-4 WU-66f 扩展到 ↑↓、Esc 中断 2-D 拖动；ZB-20 复跑。MM-B1 在 120px 高度下用 `box.y + box.height / 2` 点击，会落在绘图区中部。若纵向是绝对映射，点击会同时改 y；MM-B1 只断言时间，仍会通过，但最好补一个断言，证明 y 的变化符合 2-D 规则。

## 简化建议

1. 纵向改用增量拖动（P1-2 方案 a）。“框内偏移 / 框外居中 / 底行不改纵向”三条规则可以合并成两条：框外点击把框中心移到指针，之后一律按增量拖动；底行规则可以删除。
2. 夹住范围用“包含当前 y 的内容范围”，不新增“内容不足一屏时 y = 0”这样的特例。
3. 标记用 `useMemo` 依赖 `packed`，平移帧不重建。
4. ARIA 保留 slider = 时间，只在 `aria-valuetext` 加纵向说明，测试改动最小。
