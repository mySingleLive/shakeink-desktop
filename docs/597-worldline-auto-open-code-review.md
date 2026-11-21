# docs/597 放大后自动展开事件卡片：代码审核

审核范围：工作区未提交的 docs/597 改动，包括 `worldline-layout.ts` 的 `autoOpenFits` / `AUTO_OPEN_GAP` / `AUTO_OPEN_KEEP`，`EventTimeline.tsx` 的两套 `TimelineState`、`on`、`prevOn`、`autoClosed`、`pinnedLocal` 和 `cardCtx`，`EventCard.tsx` 的 `renderProbe`，`tests/browser/planning-worldline-auto-open.test.ts`，`tests/helpers/worldline-zoom.ts` 的 `leavesOnly`，以及 `tests/unit/worldline-layout.test.ts` 的 AO-01..06。依据是方案 §6 修订 1（替代 §1–§2）和方案审核。行号按审核时的工作区文件。本次只读，没有改源码和测试。

## 结论

没有 P1。实现按修订 1 做了两套排版：判定在本次渲染里完成，不在 effect 里 setState 循环；`prevOn` 在 layout effect 中提交；空白处保持原状态；`autoClosed` 只在 on 从 true 变 false 时清空；离开级别 0 时 `openState` 复位。这几条都正确。在 F885 上，第二次 `timelineStep` 的开销可以忽略。

问题集中在测试上。ZB-43（锚点卡片不动）和 ZB-40 的“收起后 top 不变”用的是只有叶子的夹具，在这个夹具里所有卡片收起和展开都排在 y = 28 的同一行，所以即使锚点或 `pinnedLocal` 坏了，这两条也会通过（P2-1）。另外，展开卡片的高度量测只在 `openKey` 变化时登记，纵向滚动进入渲染带的展开卡片不会被量测。这是原有问题，但自动展开让展开卡片多了很多，A2 的不重叠更依赖它（P2-2）。

## 运行结果

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `node --import tsx --test tests/unit/worldline-layout.test.ts` | 100/100 通过（含 AO-01..06） |
| `node --import tsx --test tests/browser/planning-worldline-auto-open.test.ts` | 10/10 通过（ZB-37..46） |
| `node --import tsx --test tests/browser/planning-worldline-card-zoom.test.ts` | 37/38，ZB-20 失败一次（p95 计时）。单独重跑两次都通过。当时另有一轮浏览器全量测试在跑，判断为负载造成的计时波动。ZB-20 在级别 4/5，此时 `openAll` 为 null，不计算第二套排版 |
| `--test-name-pattern CP-07 tests/browser/planning-worldline-canvas.test.ts` | 通过，长任务 1 次（上限 2） |

/tmp 下的临时探测脚本，已删除：

- **F885 开销**（`timelineStep` 30 个缩放帧，每帧都是全量打包；然后 30 个平移帧；再调 `autoOpenFits`）。宽 1412，以中间根为中心：

  | d | 元素数 | 收起：缩放 / 平移 ms | 全部展开：缩放 / 平移 ms | `autoOpenFits` ms |
  |---|---|---|---|---|
  | 160 | 102 | 0.19 / 0.011 | 0.16 / 0.014 | 0.002 |
  | 445 | 38 | 0.06 / 0.003 | 0.05 / 0.003 | 0.001 |
  | 1000 | 13 | 0.03 / 0.001 | 0.03 / 0.001 | 0.001 |

  级别 0 时 d ≥ 160，构建范围内元素不多，第二次排版每帧不到 0.2ms。
- **两套排版的行位**（以 r6 为中心）：
  - `zoomView(24, { leavesOnly: true })`：d = 444、450、900 时，收起和全部展开的卡片 top 都只有 `[28]` 一行。
  - 默认 `zoomView`：两套排版第二行起的行位不同（收起为 28/84/102/144…，展开为 28/128/156/232…）。
- **ZB-41 计数**：在测试副本里加打印，副本放在 `tests/browser/` 下临时运行，已删除。30 个平移帧中 `entered = 0`，EventCard 渲染 0 次，PlanningWorkspace 0 次，Ruler 30 次。之后缩放一步时 EventCard 渲染 1 次。

## P2

### P2-1 ZB-43 和 ZB-40 的“top 不变”在只有叶子的夹具上测不出问题

- 方案审核 P2-4 要求进入和退出那一帧锚点卡片不跳，P2-2 要求收起时被点的卡片不动。对应的实现分别是：锚点 effect 读 `step`，即 `on ? openStep : closedStep`（`EventTimeline.tsx:322`、`:508-510`）；`pinnedLocal` 传给两次 `timelineStep`（`:292-293`、`:297`、`:341`）。
- 两条测试都用 `leaves()`（`planning-worldline-auto-open.test.ts:70`）。探测结果是：d ≥ 444 时，收起排版和展开排版里所有卡片都在 y = 28 的同一行。r6 在两套排版里 top 都是 28，view.y 也不需要调整，所以：
  - ZB-43（`:188-208`）：即使锚点 effect 改成读 `closedStep`，或者被放到判定之前，或者整个删掉，进入和退出那一步 r6 都不会动，断言 `moved <= 1` 照样成立。
  - ZB-40（`:124-127`）：收起 r6 以后，叶子都在同一行，不存在上移的空间。即使去掉 `pinnedLocal`，这条也通过。
- 处理：给 ZB-43 和 ZB-40 换一个锚点卡片在两套排版中 y 不同的夹具，并先断言前提成立。例如在 `leavesOnly` 的基础上，给 r5 加一个长时长条（`duration` 大于 720 h），让 r6 在收起排版中落到第二行：r6 的 y 等于 r5 的 y 加收起高度加 30，展开后等于 r5 的 y 加展开高度加 30，两者相差几十 px。用例里先断言“打开前后 r6 的 plane top（读 `[data-event]` 的 `style.top`）不同”，再断言屏幕 top 变化 ≤ 1px。ZB-40 同样以第二行的卡片为点击对象，并断言它下面的卡片收起后不上移，或者被点卡片的 plane top 不变。

### P2-2 纵向滚动进入渲染带的自动展开卡片不会量测高度（原有问题，被放大）

- 量测只在 `openKey` 变化时登记（`EventTimeline.tsx:384-390`）。`openKey` 由 `step.elements` 中展开的卡片组成，包括渲染带（vband，`:566-569`、`:808-810`）以外的卡片。
- 用 ⌘ + 滚轮纵向滚动只改 `view.y` 和 vband，不改 `openKey`。新挂载的展开卡片不会被 `ResizeObserver` 观察，`heights` 里只有 `estimateCardHeight` 的估算值（`worldline-layout.ts:1372`、`:696-710`）。估算值比实际矮时，卡片会伸进下面家族 30px 的间隔，甚至盖住它，这违反 A2。
- 手动展开原来就有这个问题，但手动展开的卡片很少。级别 0 自动展开时，视图里的卡片全部展开，问题更容易出现。这一条我没有在浏览器中复现，属于根据代码路径的推断。
- 处理：`openKey` 只取实际渲染的卡片（在 vband 内的，以及始终渲染的 selected、hit、editing 卡片），或者把 `vband` 加进量测 effect 的依赖。补一条浏览器用例：自动展开后用 ⌘ + 滚轮把渲染带以外的一行展开卡片滚进视图，等 2 帧后断言 `[data-event]` 的 `style.top` 与上一张卡片底边至少相距 30px（`FAMILY_V_GAP`）。

## P3

### P3-1 ZB-41 的 `entered * 2` 上限

`planning-worldline-auto-open.test.ts:167`：实测 `entered = 0`，所以断言实际上是“EventCard 渲染 0 次”，这能证明 `cardCtx` 没有每帧换引用（`EventTimeline.tsx:344`）。但这一点是因为恰好没有卡片进入，不是用例设计出来的。一旦平移让卡片进入，允许 2 倍渲染就宽了。建议直接 `assert.equal(entered, 0)` 加 `assert.equal(EventCard ?? 0, 0)`，如果要覆盖进入的情况，就单独写一段，上限为 `entered`。另外，6 个缩放步过程中没有检查 on 一直为真，只在最后检查了一次。

### P3-2 切到其他内容标签页会清空 `autoClosed`

标签页隐藏时 `hidden` 让 lane 的 `clientHeight` 变成 0（`ContentTabs.tsx:26`），`laneH = 0`。这时 `fits` 走的是 `false` 分支，不是 null 分支（`EventTimeline.tsx:317-321`），`on` 从 true 变成 false，layout effect 随之清空 `autoClosed`（`:330`）。回到标签页后，用户收起过的卡片又会自动展开。方案只说事件表往返（卸载）会丢失，没有提到切换标签页。建议在 `!(laneH > 0) || !(width > 0)` 时让 `on = prevOn.current`，或者把这种情况写进已知限制。

### P3-3 `pinnedLocal` 在工作区 pinned 没有变化时不会失效

`pinnedNow` 的规则是 `pinnedLocal.base === pinned` 时用 `pinnedLocal.id`（`:293`）。用户收起自动展开的卡片 A（`base = P`）后再点卡片 P 本身，`setPinnedCard(P)` 不改变值，`pinnedLocal` 仍然生效，P 的家族就不会被钉住。影响只是增量打包的放置顺序，范围很小。可以在 `onSelect` / `onToggle` 的覆盖中同时清掉 `pinnedLocal`，或者记作已知限制。

### P3-4 与方案文字的出入（等价）

- §6.4 写的是 `useMemo(..., [ctx])`，实现是 `[ctx, onAutoExpand]`。`onAutoExpand` 来自 `useRef(...).current`，身份不变，所以二者等价。
- `autoLive.current` 在渲染中赋值（`:335-336`）。这和现有的 `foldLive` 写法一致，被丢弃的渲染可能留下一份未提交的 `on`，但下一次渲染会覆盖，点击时读到的是最近一次渲染的值。

### P3-5 验收台账

`docs/requirements-traceability.json` 里还没有 WL-597，方案 §4.3 的真实应用驱动（`drivers/auto-597.mjs`）也还没有证据。这不属于代码缺陷，但按 AGENTS.md 的要求，验收前必须补齐。夹具用例只能记为夹具通过。

## 已核对、没有问题的部分

- **`step` 的下游使用**：画布、缩放锚点（`:508-520`）、框选命中（`:790-791`）、首次居中（`:594-613`）、`emptyView`（`:615-619`）、小地图 `contentH` / `lanesBottom`（`:553-554`）、标记（`:627`）、`openKey`（`:384`）都使用当前显示的那一套排版，与画面一致。编辑器 `reveal` 读的是 DOM，不受影响。
- **共享 `heights`**：`buildFamilies` 只对 `expanded` 中的 id 读 `heights`（`worldline-layout.ts:1372`），所以自动展开时量测到的高度不会改变收起排版的卡片尺寸。它唯一的影响是 `heights` 换引用后收起排版也做一次增量重排，代价见上面的开销表。以后手动展开同一张卡片时，可以直接用已经量测的高度。
- **`openState` 复位**：级别不为 0 或 `!zoomOn` 时 `openStep = null`，layout effect 把 `openState` 置为 `emptyTimeline()`、`openSizes` 置为 null（`:327-328`）。重新进入时第一次是全量打包，不会从过期的 home 出发做增量打包。级别 0 下即使 on 为假也一直计算并提交 `openStep`，所以进入的那一帧有最新的 state。收起排版在 on 期间同样每帧提交，退出时直接显示它，没有展开时留下的稀疏行位（方案审核 P2-5）。`timelineStep` 在宽度为 0 时原样返回 state，隐藏期间两份 state 都保留。
- **回差与 StrictMode**：`prevOn` 只在 layout effect 中写入（`:331`），渲染中只读。StrictMode 下重复渲染读到的是同一个值，重复执行的 effect 第二次因为 `prevOn === on` 不会再 setState。被丢弃的渲染不会改 ref。判定与 setState 之间没有循环，原因有三：`heights` 在 rAF 中更新；`autoClosed` 只在状态切换时清空；清空后 `openAll` 只会更大，判定只会更难通过，结果单调。ZB-38 能区分 KEEP 和 GAP；ZB-40 的空白处段落能区分“null 保持”和“null 当作 false”。这两条有效。
- **`autoOpenFits`**（`worldline-layout.ts:1723-1744`）：视图换算与 `emptyView` 相同（`dx = translateX + PAD`，`dy = view.y`）。按 left 排序后的 `break` 成立，因为后面的卡片 left 更大。`related` 只排除祖孙，同一 id 的 bar 已被 `kind` 过滤。AO-04 和 AO-06 删掉相应逻辑会失败，测试有效。`AUTO_OPEN_KEEP = FAMILY_PAD_LEFT + FAMILY_H_GAP`，AO-05 同时检查了 440/439 处的打包同行条件。
- **上下文覆盖**：Provider 放在 plane 外层（`:802`、`:877`），EventTimeline 自己的 `ctx` 来自第 161 行，读的是外层值。`cardCtx` 只在工作区 `ctx` 变化时换引用。plane 内的其他节点（EventPoint、lane 节点）不读这个上下文。EventCard 是 memo，ZB-41 实测平移帧渲染 0 次。
- **展开钮**：on 时切换 `autoClosed`；如果卡片同时在工作区 `expanded` 中，再调 `ctx.onExpand` 把它移出（`:337-343`），之后两套排版里它都是收起的。`openAll` 去掉 `autoClosed − open`，编辑中的卡片始终展开。EventCard 的 `expanded` 属性在 on 时取 `openAll`，否则仍取 `expanded`（`:841`）。
- **开销**：见上面的开销表。`openAll` 的 Set 只在 tree、`autoClosed`、`open` 或级别变化时重建。CP-07 通过。

## P1 / P2 摘要

- P1：无。
- **P2-1**：ZB-43 和 ZB-40 的“top 不变”在 `leavesOnly` 单行夹具上无论实现对错都会通过。锚点读 `openStep` 和 `pinnedLocal` 实际上没有被测到。应换用锚点卡片在两套排版中 y 不同的夹具，并先断言这个前提。
- **P2-2**：量测只随 `openKey` 登记，纵向滚动进入渲染带的自动展开卡片只有估算高度，可能与下方家族重叠（推断，未复现）。应让 `openKey` 只取实际渲染的卡片，或加上 `vband` 依赖，并补用例。
