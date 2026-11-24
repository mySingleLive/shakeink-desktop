# docs/600 世界线事件表随缩放分级：代码审核

审核范围：工作区未提交的 docs/600 改动（`git diff HEAD` 与未跟踪文件）：`worldline-layout.ts`、`EventTable.tsx`、`worldline-viewport.ts`、`EventTimeline.tsx`、`EventCard.tsx`、`PlanningWorkspace.tsx`、`worldline.module.css`，新增单元 / 浏览器用例、`tests/helpers/worldline-zoom.ts`、`table-layout-600-snapshot.ts`、`table-layout-600-before.json`，以及 card-zoom / auto-open 用例的修改。依据是方案 §1–§7 与 §8–§14 修订（冲突处以后面的修订为准），以及 `docs/600-worldline-table-zoom-plan-review.md`、`docs/600-worldline-table-zoom-test-review.md`。行号按审核时的工作区文件。本次只读，除本文件外没有改源码、测试和文档；CSS 选择器探测用的临时脚本运行后已删除。

## 结论

有 P1。分级计算、时间点、隐藏、缩小卡、拉伸上限、子块拉伸、`projectAnchor`、程序滚动判定、闩锁纯函数、提示 owner、静止后判定的主流程与修订一致，新单元 13/13、新浏览器用例 17/17 通过，`tsc` 通过。

P1 是 CSS：新增的 `:is(.card, .tableZoom > .card)` 写法在 `.slot > …` 之后永远匹配不到包层里的卡片，所以缩小后的分组头、层叠卡没有拿到分组头 / 层叠样式（P1-1）。这是产品默认（分级打开）的复位视图就会出现的问题，而 TZB-11 只量了分组头的 x / 宽度，没有发现。P2 主要是规则偏离：工具栏缩放不清闩锁；“全部展开”含待定位卡片；点另一张卡片会取消自动展开卡片的待收起，而不是先执行它。另外，测试审核 P1/P2 列出的用例有约一半没写，已写的几条断言过弱。

## 运行结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 通过 |
| `node --import tsx --test tests/unit/worldline-table-zoom.test.ts` | 13/13 通过 |
| `node --import tsx --test tests/browser/planning-worldline-table-zoom.test.ts` | 17/17 通过（44 s） |
| 临时探测：Chromium 中 `.slot.slotHead > :is(.card.groupHead, .tableZoom > .card.groupHead) { border: 0; color: red }`，DOM 为 `.slot.slotHead > .tableZoom > .card.groupHead` | 不匹配：`color` 仍为黑、`border-top-width` 仍为 2px；对照规则 `.slot.slotHead > .tableZoom > .card.groupHead` 生效 |

全量回归由主代理在跑，本次没有并行加载。

## P1

### P1-1 `:is(... .tableZoom > .card ...)` 选择器对包层内的卡片不生效

- `worldline.module.css:223`、`:239`、`:241`、`:248-250`、`:398` 把 `.slot… > .card…` 改成了 `.slot… > :is(.card…, .tableZoom > .card…)`。`A > :is(B > C)` 要求被选中的元素同时满足“父元素是 A”和“匹配 `B > C`”。包层里的卡片，父元素是 `.tableZoom`，不是 `.slot`，所以第二个分支永远不成立。上面的探测在 Chromium 中证实了这一点。
- 只有另写的直接规则生效：`:227`（`.slot:not(.slotOpen) > .tableZoom > .card` 的宽度）和 `:399`（`.tableZoom > .stackWrap` 的宽度）。
- 结果是，级别 1–3 中 `z < 1` 的分组头（`EventTable.tsx:404` 包层）丢失了 `:239-241`、`:248-250` 的全部样式：`border: 0`、上圆角、内阴影画的 3px 类型边、着色背景、隐藏 `::before`，以及 hot / selected / hit 的阴影。分组头会画成一张普通卡片（带边框），不再是框头。
  - 高度也会出错：布局按“分组头无边框”算 36 × z（`worldline-layout.ts` 中 `linesOf` 的注释、`collapsedCardHeight`），而带 1px 上下边框时实际高度是 38 × z，在 0.75 下比布局多 1.5px，会压住第一个子卡片。标题可用宽度也少了 2px，`linesOf` 给分组头加的 2px 余量就不准了，长标题可能多折一行。
  - 层叠卡：`:398` 的 `.slot.slotStack > :is(.stackWrap, .tableZoom > .stackWrap) > .card { width: 100% }` 同样不生效。`.stackWrap` 本身 100%（`:399`），但其中的 `.card` 只能拿到 `:223` 那条（同样不生效）之外的默认宽度，层叠卡可能与分组框不同宽。
- 触发条件：产品默认分级打开，zoomView 复位就是级别 1（d = 40），真实数据复位是级别 3；只要有家族框并且 `cardScale < 1` 就会出现。
- TZB-11（`planning-worldline-table-zoom.test.ts:289-295`）只量了级别 2 第一个分组头的 x 和宽度。宽度来自 `:227`，所以用例能通过。§14.3 要求的“层叠卡与框同宽、每张收起卡实际高 = 布局高 ±1、含两行卡、级别 1 / 2 / 3 各一次”都没写，因此没有发现这个问题。
- 处理：去掉 `:is` 里的复合分支，改成两条并列选择器，例如 `.slot.slotHead > .card.groupHead, .slot.slotHead > .tableZoom > .card.groupHead { … }`，`:223`、`:241`、`:248-250`、`:398` 同样改。然后按 §14.3 补齐 TZB-11：分组头 `border-top-width` 为 0、背景与未缩放时相同，层叠卡宽 = 框宽，每张收起卡 `getBoundingClientRect().height` = `TableCard.height` ±1，级别 1 / 2 / 3 各测一次。

## P2

### P2-1 工具栏缩放不算用户输入，闩锁后放大到级别 0 也不会自动展开

- §12.1 规定清除 `latched` 的用户输入包括“Ctrl + 滚轮 / 工具栏缩放（`scale` 变化）”，§12.3 P3-l 规定 `scale` 变化要调用 `scheduleDecide()`。实现中，只有滚轮处理（`EventTable.tsx:494`）、`onScroll`（`:534`）和 `worldline-locate`（`:305`）调用 `scheduleDecide(true)`。工具栏 − / + / 复位改的是 `PlanningWorkspace` 的 `tableZoom`（`PlanningWorkspace.tsx:2420-2421`），表格里只有恢复 effect 的 `scheduleDecide(false)`（`EventTable.tsx:473`）会响应。
- 失败场景：级别 0 自动展开，测量后保持判定失败而退出，`latched = true`。用户用工具栏“放大”把间隔拉开，此时 `fits` 为真，但 `decideAutoOpen({ latched: true, input: false })` 返回不进入。直到用户滚动一下，才会展开。离开级别 0 会清闩锁（`:297`），但在级别 0 内用工具栏放大不会。
- 处理：加一个依赖 `[scale]` 的 effect（跳过首次挂载）调用 `scheduleDecide(true)`；或者滚轮处理不再自己调用，统一由这个 effect 处理。补一条用例：构造闩锁后点工具栏“放大”，自动展开重新进入。

### P2-2 “全部展开”包含待定位卡片

- `openAll`（`EventTable.tsx:163-172`）遍历 `tree.byId`，其中包括 `tree.pending` 的节点（`worldline-layout.ts` 的 `eventTree` 中，`pending` 与 `roots` 都来自 `byId`）。待定位叶子因此进入 `openAll`，`on` 为真时“时间待定位”区的所有卡片全部展开。
- §8.7 规定“全部展开不含待定位块”。`tableAutoOpenFits` 跳过待定位块（`:2097`），所以这些卡片展开时根本没有做空间判定。只有待定位块在视图内时 `fits` 为 null，状态保持（§8.7 的“视图只在待定位块时按视图内没有卡片”），于是用户从上面滚到待定位区时，看到的是一整片展开的卡片。
- 处理：`openAll` 跳过 `node.start === null` 的节点（待定位根与无时间子事件）。TZB-17 增加：级别 0 自动展开时，待定位卡片 `aria-expanded = false`。

### P2-3 点另一张卡片会取消自动展开卡片的待收起，而不是先执行它

- `onAutoToggle`（`EventTable.tsx:319-330`）一进入就 `clearTimeout(pendingAuto)` 并清空，没有执行那次收起。`PlanningWorkspace.toggle` 的规则是“同一卡片双击取消待收起，其他任何点击先执行它”（`PlanningWorkspace.tsx:2107-2111`）。
- 失败场景：自动展开中单击 A（260 ms 后应收起），260 ms 内单击 B（自动展开或手动展开的卡片都一样）。A 的计时器被清掉，A 一直展开，与 §8.1 / TZB-06b“单击后收起”相反。
- 另一方向是对的：时间点的单击（`pointDown`）和 PlanningWorkspace 的点击都不碰 `pendingAuto`，A 会照常收起。所以只有“快速点下一张卡片”这条路径出错。
- 处理：`pend && !(pend.id === id && detail >= 2)` 时立刻执行 `setAutoClosed(add pend.id)`，与 `toggle` 的 `keep` 判定相同。TZB-06b 增加：单击 A，100 ms 内单击 B，A 最终收起。

### P2-4 用例缺口与弱断言（对照测试审核 P1/P2 与 §14.3）

缺失的用例（文件中找不到）：

- **TZB-06 GAP / KEEP 边界**：`fact` 使估算高度落在 [可用 − 24, 可用 − 12) 的那一处，不进入；已进入状态下滚到该处保持。滞回只在单元 TZ-07 中测过，组合结果没有浏览器证据。
- **TZB-06 其他部分**：`openCards` 不变、相邻卡 top 与收起时相同（±0.5）、“缩小到级别 1 再放大回来重新展开”都没写；现在只量了 r0→r1 的间距。
- **TZB-06b 负向**：手动展开（在 `openCards` 中）的卡片单击，应正常收起并移出 `openCards`。
- **TZB-06c**：家族子事件展开、分组头保持收起、兄弟卡 top 不变。
- **TZB-08**：对齐模式下时间点中线、缩小卡卡头与圆点 ±0.5px，相邻标签间距 ≥ 18。
- **TZB-09**：每个 wheel 事件 PlanningWorkspace 渲染 1 次、Markdown 正文节点引用不变、作品版本不变。`cardCtx` / `foldClick` 的身份稳定没有用例证明。
- **TZB-13**：(a) 停在边界不动、(b) 边界处 10 步 Ctrl + 滚轮、(c) 程序恢复滚动后 1 s 无变化、F885 虚拟版本都没写；只写了 (d) 连续滚动。
- **TZB-13e**：闩锁后经事件目录定位，重新进入。P2-1 同类的问题正好要靠这条和工具栏用例发现。
- **TZB-14**：插值锚点（级别 3→4 指针处时间回退，级别 0 两卡相距 > 600px 时缩放一步时间变化 ≤ 5%）。`onZoom` 的第二个参数仍是 `{ id, offset }`，`PlanningWorkspace` 不读它（`:2642` 只用 `step`），插值锚点只在表格内部恢复，这一点也只有 TZB-14 能证明。
- **TZB-15**：F885 级别 6 定位 / 搜索隐藏事件后显示、滚入、闪烁；级别 0 定位后自动展开，目标卡位置变化 ≤ 2px。
- **TZB-21**：时间点悬停时，对应圆点 / 标签高亮。
- TZB-16 的 `farRoot` 断点对比、TZB-17 的“提示计数不含待定位”、TZB-04 的“切到时间线读 `openCards`、`selection` 不变、F885 指针下 ±2px”、TZB-03 的“`foldedEvents` / 事件目录 / 时间线不变、退到级别 < 3 后本地展开清空”也没写。

规则写错也能通过的断言：

- **TZB-12**（`:211-212`）：if / else 两个分支断言相同（`> 240`），等于没有分支。也没有 §14.3 要求的“d 400 时根间距 = 400”和“单调、相邻两步比 ≤ 1.15”。`gapFor` 公式写错（例如固定 1200）也能通过。
- **TZB-19**（`:297-308`）：预算 250 ms，§8.6 / §14.3 要求 p95 < 100 ms。测的是包括 Playwright 往返、鼠标移动、按键和两帧等待在内的墙钟时间，不是 profiling 构建的渲染耗时；也没有把跨级步与级别 0 步（两份布局）分开统计。
- **TZB-01**：`:60` 带“或 d ≥ 160”的退路；`:74` 的 `toBeDisabled(...).catch(() => {})` 吞掉了失败，“级别 6 之后才禁用缩小”实际上没有断言。分级关闭时在原下限禁用这一半也没写。
- **TZB-18**（`:273`）：`[1, 2].includes(level)` 只要求两者之一。§14.3 要求从下方复位为 2、从上方复位为 1，两种都断言。
- **TZB-11**：见 P1-1。
- **TZ-07/10**：标题写了“group heads never open”，但分组头排除在组件的 `openAll` 中，单元里没有对应断言；也没有“家族在视图内、间隔足够 → true 且兄弟 top 不变”的正向例子。TZ-04 没有断言无时间子事件“排最后、不拉伸”。

处理：补齐上述用例，或在台账 `WL-600` 中逐条标为未执行；不能记为通过。TZB-12、TZB-19、TZB-01、TZB-18 按 §14.3 改断言。

## P3

- **`tableAutoOpenFits` 最后一个子块的比较是空的**：`worldline-layout.ts:2104` 中，最后一个子块的上限是 `groupEnd + gap`，而 `groupEnd = open.group.bottom − GROUP_PADDING`，也就是这个子块自己的底，所以 `b.bottom + gap ≤ limit` 恒为真。实际的约束来自上一层：父块的 `bottom`（分组底）与下一根块比较，加上下一块 top 的不变检查，结果是对的。建议删掉这个分支（`next` 缺失时直接 `continue`），注释也随之改写，免得以后误以为这里在保护分组底。
- **`gap` 为 null 时上限跳到 1200**：`tableGapFor(Infinity) = 1200`（`EventTable.tsx:125`）。只有不到两个已定位根时才会出现，这时根之间没有拉伸，但家族内的子块会按最多 1200px 拉开。可以在 `d` 非有限时用 `GAP_MAX`。
- **`onZoom` 的类型**：`EventTable.tsx:88` 的第二参数仍声明为 `{ id; offset }` 并传入 `{ id: pa.a, offset }`（`:495`），父组件不用。可以删掉，避免以后有人按单卡锚点去恢复。
- **离开级别 0 时没有清 `pendingAuto`**：`:293-300` 清了计时器、`on`、`autoClosed`，但没清 `pendingAuto`。260 ms 内离开级别 0 的话，计时器会把 id 写进 `autoClosed`；不过该 effect 依赖 `autoClosed`，在级别 ≠ 0 时会再次清空，实际没有影响。建议一并清掉，代码更直观。
- **`written` 可能残留**：恢复 effect 在 `|st − scrollTop| > 0.5` 时写入，并记下读回值（`:466-470`）。如果浏览器把写入截断成原值，就不会有 scroll 事件，`written` 会留到下一次用户滚动；那次滚动如果恰好落在 1px 内，会被当成程序写入。概率很低。可以在读回值等于写入前的值时不记录（§12.3 P3-p 已有此意）。
- **双击自动展开卡会写入 `openCards`**：第二击走 `ctx.onToggle(id, 2)`（`:324`），`toggle` 把 id 加进 `openCards`（`PlanningWorkspace.tsx:2113`）。编辑结束后，这张卡变成手动展开，退出自动展开后仍保持展开。这与时间线 docs/597 的行为一致，TZB-06b 也接受“取消后仍展开”，记录在此供确认。
- **台账**：`docs/requirements-traceability.json` 需要 `WL-600`，并写明 `EventCard.tsx` 上下文新增 `onSelectOnly` 属于 reuse 文件改动（§9.6 P3-a）。

## 已核对、没有问题的部分

- **自动展开判定没有循环**：`decide()` 只经 160 ms 计时器执行（`:285-290`），恢复 effect 与 `onScroll` 只负责调度。`decideAutoOpen` 一次最多切换一次，退出后上闩锁；恢复 effect 的写入用 `isProgrammaticScroll` 排除。进入时用 `projectAnchor` 在展开布局上预测区间（±8px），保持时用真实区间和 KEEP 12。TZB-13(d) 中滚动期间翻转 ≤ 1 次、停手后稳定，没有 “Maximum update depth”。
- **`worldline-locate`**：`locateWorldEvent` 先同步派发事件（监听器清 `zoomAnchor`、`written`，`scheduleDecide(true)`），再写 `scrollTop`。随后的 scroll 事件因为 `written` 为 null，同样按用户输入处理，两次调度合并成一次判定，闩锁被清。`decide()` 的锚点优先级是视图内的 `hitId` / `selected`、有效的 `zoomAnchor`、`firstVisible`（`:264-269`），符合 §12.2。
- **锚点**：滚轮写入插值锚点 `{ a, b, f, offset }`，`zoomAnchor` 保留 400 ms（`:490-492`）。高度测量路径在 `zoomAnchor` 有效时复用它，单卡锚点按当前 scrollTop 重算 offset（`:443`）；用户滚动会丢弃它（`:533`）。翻转时用 `flipAnchor`，滚轮锚点优先（`:461`）。`projectAnchor` 的跨段、待定位、截断规则在 TZ-11 中都有断言。
- **`openAll` 集合**：有子事件且未被用户折叠的父事件（分组头）被排除，用户折叠的父事件被排除，`autoClosed` 被排除，工作区 `open` 并入（`:163-172`），符合 §9.2 与 §10.4（待定位卡片例外，见 P2-2）。
- **`stretchChildren` / `gapMax`**：收起布局在 `zoomOn` 时为 `stretchChildren: zoomOn`、`gapMax: tableGapFor(d)`，展开布局只在 `zoomOn` 时存在，两份布局参数一致。分级关闭时不给选项，TZ-02 快照（9dca205 生成）与 TZB-12b 的 240 都成立。
- **时间点**：`EventPoint` 日期用 `ctx.adapter.label(start, 1, precision)`（§8.7）。圆点与引线用 `card.head = top + 9`，对齐模式下落在时间点中线。按下即处理，随后的 click 被吞掉；第二次按下 `preventDefault` + `stopPropagation`，不会触发标题时间拖动（TZB-04 posts 为 0）。
- **`foldClick` 与 `onAutoToggle`**：都用 `useRef(...).current` 加 live ref，身份稳定，`cardCtx = useMemo([ctx, onAutoToggle])`，`EventCard` 的 memo 不会因缩放失效。级别 ≥ 3 只切换本地 `unfolded`，级别 < 3 时由 layout effect 清空（`:129`），与时间线相同。
- **虚拟化**：时间点也经 `cardShown`，并加入 `rendered`；`forced`（selected / hit / editing）在 `keepCards` 中，永远是卡片，定位能找到 DOM。测量只观察 `data-measure-id`（展开卡），展开卡不包缩放层，测得高度与布局同坐标。
- **提示 store**：`set(note, owner)` 先改 writer，内容相同只跳过通知；`clear(owner)` 只清自己写的。视图切换时，表格的 set / register 在 layout 阶段执行，时间线的 `clear` 在随后的 passive 阶段执行；此时 writer 已经是表格，所以不会把表格刚写的提示清掉。反方向（表格的 layout cleanup 先清，时间线随后写入）同样成立。TZB-05b 往返后文字不变，证明了前一种顺序。
- **性能**：两份布局只在 `autoLevel`（分级打开且级别 0）时计算，`openLayout` 的 memo 不依赖 `on`（§12.3 P3-m）。级别 > 0 每帧仍只算一份。级别 0 在 F885 上每步两份布局的实际耗时，要等 TZB-19 按 §14.3 改成 profiling 测量后才有数据。
- **`tableZoomBounds`**：只在 `{ levels: true }` 时放宽 `min`，`PlanningWorkspace` 读 `TimelineZoomLevelsContext` 传入；不传参时与 docs/586 相同（RL-03、TZ-06）。

## P1 / P2 摘要

- **P1-1**：`.slot > :is(.card, .tableZoom > .card)` 匹配不到包层内的卡片（Chromium 探测证实）。缩小后的分组头丢失无边框、类型边、背景和 hot / selected / hit 样式，高度比布局多 2 × z px；层叠卡不再与框同宽。默认复位视图即出现，TZB-11 太弱，没有发现。
- **P2-1**：工具栏缩放不调用 `scheduleDecide(true)`，闩锁后用工具栏放大不会重新自动展开。
- **P2-2**：`openAll` 含待定位卡片，自动展开时“时间待定位”区全部展开，没有做空间判定。
- **P2-3**：自动展开卡片单击后 260 ms 内点另一张卡片，前一张的收起被取消，它一直展开。
- **P2-4**：TZB-06 边界 / 06b 负向 / 06c、TZB-08、09、13(a–c, F885)、13e、14、15、21 缺失；TZB-12 的 if / else 断言相同，TZB-19 用 250 ms 墙钟代替 100 ms profiling，TZB-01 的禁用断言被 `.catch` 吞掉，TZB-18 两种复位结果只要求其一。

仍需修改：P1-1 修复，并按 §14.3 补强 TZB-11；P2-1、P2-2、P2-3 修复并各补一条用例；P2-4 的缺失用例补齐或在台账 `WL-600` 中标为未执行，弱断言按 §14.3 改写。
