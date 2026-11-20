# docs/596 小地图上下左右移动：代码审核

审核范围：`EventTimeline.tsx` 中标有 docs/596 的改动、`worldline.module.css` 的 `.minimap` 规则、`planning-worldline-minimap.test.ts` 的 MM-B2..B8 和 MM-B4b、ZB-30、WU-66f 的 ↑↓。依据：方案 §6 修订 1。行号按 2026-11-20 20:33 的工作区文件（审核期间 `EventTimeline.tsx` 在 20:33 被改过一次，加入了 `sameLayout`，见 P1-1）。

## 运行结果

| 命令 | 结果 |
|---|---|
| `node --import tsx --test tests/browser/planning-worldline-minimap.test.ts`（20:33 改动前） | 10/10 通过 |
| 同上（20:33 改动后） | 9/10，**MM-B4 失败**：`centre 190.5 vs 411.4` |
| `npx tsc --noEmit` | 通过（两次） |
| ZB-19、ZB-20、ZB-30（`planning-worldline-card-zoom.test.ts`） | 3/3 通过 |
| WU-66f（`planning-worldline-regression.test.ts`） | 通过 |

另外用 /tmp 下的临时探测脚本（已删除）读取了 MM-B5/B6/B7 实际运行时的状态，结论见 P2-2。

## P1

### P1-1 工作区当前版本 MM-B4 失败，`sameLayout` 规则不在修订 1 里

- `EventTimeline.tsx:855-856`：框外点击只在“新视窗仍在当前构建范围内”（`start >= built.lo && start + span <= built.hi`）时才改纵向。修订 1 的规则是“`H > laneH` 时把框中心移到点击处”，没有这个条件。
- 构建范围是 7 个视窗宽（`worldline-layout.ts:1649-1651`），而小地图横向是整条时间轴。放大后，几乎所有离框稍远的点击都会落到构建范围外，纵向居中实际上就不起作用了。MM-B4 选的点离框 30px 以上，因此失败。
- 理由（新范围会重新排版）也不完全成立。范围外重建走的是非 full 的 `packFamilies(families, packed)`（`worldline-layout.ts:1700`）：已知家族保留原来的 `home` y（`:1504-1507`），只有新家族重新落位。所以老家族的纵向位置在跳转后仍有意义。另外这个条件和真实的重建条件不一致：真实条件是 `start − span ≥ lo && start + 2·span ≤ hi`（`:1690`），比 `sameLayout` 严。所以 `sameLayout` 为真时也可能重建。
- 处理：二选一，都要写进方案并同步测试。一是去掉 `sameLayout`，回到修订 1；二是保留它，但在方案 §6 写明，改 MM-B4（点击点要在构建范围内），再补一个“跳出范围时 y 不变”的用例。在这之前，这个改动不能算通过。

## P2

### P2-1 修订 1 P2-1 的编辑器显示边距没有做

- `EventTimeline.tsx:529`：`reveal` 的下边距仍然是 `m = 12`。修订 1 要求编辑卡片和小地图横向重叠时，下边距改为 `12 + 120 + 14`。
- 结果：编辑中的卡片在右下角时，保存/取消按钮会被 120px 高的小地图（`z-index: 12`）盖住。原来小地图高 44px，现在高 120px，被盖住的区域大了很多。
- 也没有对应用例（修订 1 没有列出，但方案审核 P2-1 要求断言按钮与 `[data-minimap]` 不相交）。

### P2-2 MM-B5、MM-B6、MM-B7 的纵向部分实际上没有测到

探测时把 MM-B5/B6/B7 的步骤原样执行一遍（F60，缩放到 ≤ 6 个月，视口 1440×560），读到的状态是 `laneH = 373, H = 373, y = -4`。内容正好一屏放得下，所以：

- MM-B5（`planning-worldline-minimap.test.ts:166-183`）：`lo = min(-4, 373 − 373) = -4`，`yWant = max(-4, ...) = -4`。断言的 y 就是 y 不动，这样无论纵向拖动有没有实现都能通过。横向也只断言 `start > sp.start`，标题里说的“40 个小地图 px”没有验证。
- MM-B6（`:185-197`）：↓ 两次以后 y 仍是 -4，与期望值相等，`aria-valuetext` 是“第 1 / 1 屏”。这个用例证明不了“↓ 下移半屏”。
- MM-B7（`:199-211`）：`mid` 只断言 start 或 y 有一个变化。实际只有 start 变了，所以 Esc 恢复 y 的逻辑没有被测到。
- 用 `withChanges()` 夹具、视口 560 高、缩放到 20 天时 `H = 484 > laneH = 373`。在这个条件下，↓ 两次得到 -111，等于期望值；拖动 (+10, +10) 时被限制到 `laneH − H`；Esc 能恢复 start 和 y。说明代码在这些情况下是对的，只是现有用例没有覆盖到。
- 处理：MM-B5/B6/B7 改用内容高于一屏的条件（比如 `withChanges()` 加 20 天缩放，或者把视口调得更矮），并先断言 `s.H > s.laneH + 拖动量 × H / 90`，保证纵向移动不会被限制吞掉。MM-B5 再补一条：`frameLeft` 增加 40 ± 1。

“改动前失败、改动后通过”说明不了这几条用例本身有效：改动前它们失败，可能只是因为 `data-content-height` 等属性还不存在。

## P3

### P3-1 拖动过程中 contentH 变化，y 会跳

`moveMini`（`EventTimeline.tsx:509-516`）每帧都按 `y0 − (py − py0) × H / 90` 计算，其中 H 取的是当前这次渲染的值。横向拖动跨出构建范围后会重新排版，H 随之改变（探测中 484 → 518），已经拖过的纵向距离就会按新 H 重新换算，框会跳一下。可以在按下时把 H 存进 `miniDrag`，或者在 H 变化时把 `y0/py0` 重新定到当前点。影响不大，可以记作已知限制。

### P3-2 底行和“隐藏”的分类与构建范围的过滤条件不一致

`EventTimeline.tsx:584-586` 判断根事件是否在范围外，只看 `r.start` 是否落在 `[lo, hi]` 内。构建范围本身的过滤条件是 `familyEnd(r) >= lo && r.start <= hi`（`worldline-layout.ts:1696-1698`）。有一种情况两边会不一致：家族从 lo 之前开始、延续到 lo 之后，而且被缩放级别隐藏。这样的根事件算“在范围内的隐藏”，代码却把它画到底行。计数总数不变，ZB-30 仍然成立，只是分类错了。改成同样用 `familyEnd(r) < lo` 判断即可。

### P3-3 视窗框在内容范围外时的显示

- `-y > H` 时 `frameTop = 98`，`frameH = min(0, …) = 0`，但 CSS 的 `min-height: 8px`（`worldline.module.css:311`）会让框画进底行（98–106px）。
- `y > 0`（视口在内容上方）时，框顶被钳到 8px，框高却不缩短，看起来和视口位置不符。
- 判断“按在框内”时用的是 `frameTop + max(realH, 8)`（`EventTimeline.tsx:845`），没有用裁剪后的 `frameH`。框在底部附近时，按在框下方（底行）也算框内。
修订 1 只说最小 8px “只影响显示”，这几种边缘情况没有讨论。

### P3-4 隐藏标签页下的 aria-valuetext

`laneH = 0` 时，`aria-valuetext`（`EventTimeline.tsx:838`）用 `max(1, laneH)` 做除数，会读成“第 1 / {H} 屏”（比如 1/400）。其他地方都有保护：H ≥ 40，不会除以 0；`limitY` 和框高最小 8px 也不会出错。只有这里的文字不对。`laneH = 0` 时可以不加纵向说明。

### P3-5 WU-66f 的 ↑↓ 只断言时间不变

`planning-worldline-regression.test.ts:142-145`：先 ↑ 再 ↓，只检查 `aria-valuenow` 没变，没有检查 y 移动过。换了快捷键绑定以后，即使小地图的 ↑↓ 失效，这条也能通过。可以改成内容高于一屏，并断言 ↓ 后 `data-view-y` 变小。

## 已核对、没有问题的部分

- 内容高度（修订 1 P1-1）：`contentH = max(laneH, max(packed.bottom, lanesBottom) + 40)`（`:505-506`），`lanesBottom` 取 `lanePack.items` 的最大底边加 `step.laneTop`，和方案一致。浅灰横带画在 `<s data-mini-lanes>`（`:881`）。
- 相对纵向拖动：按下不改 y（`:846-849`），拖动按增量计算；`limitY(y, from)`（`:508`）的范围是 `[min(from, laneH − H), max(from, 0)]`，原本在范围外的 y 不会被拉回。只有内容高于一屏时才按点击居中（修订 1 原文）。
- ↑↓：`limitY(view.y ± laneH/4, view.y)`（`:870`）。时间线自己的方向键处理有 `e.target !== e.currentTarget` 判断（`:617`），小地图的按键不会让画布再移动一次。
- Esc：`cancel` 只在 `moved` 时恢复 `start0/y0`（`:382`）。框外按下会先设置 `moved`，所以恢复的是按下前的视窗。window blur 也会恢复，这和画布平移的行为一致。
- 指针：`setPointerCapture` 之后，`pointerup/pointercancel/lostpointercapture` 都会清空 `miniDrag`（`:864-866`）。
- ARIA：`role="slider"` 和 `aria-valuenow` 仍然表示时间，`aria-valuetext` 末尾加了纵向说明。aria-label 从“← → 平移”改成了“方向键平移”，测试里没有用旧文字。
- Hooks：`miniMarks` 的 `useMemo`（`:575`）之前没有提前 return，也没有条件调用的 hook。
- 渲染开销：依赖项 `dimmed` 来自 `PlanningWorkspace.tsx:304` 的 `useCallback([wTerms, wHitSet])`，只在搜索变化时更新。`packedFamilies` 和 `built` 只在重新排版时变化，`timelineStep` 在构建范围内平移时不重建 packed（`worldline-layout.ts:1690-1694`）。处理函数每次渲染都重新创建，读到的 `contentH/laneH` 是最新的。ZB-19、ZB-20 复跑通过。
- 计数：被隐藏的根事件不画标记，数量计入 `data-mini-hidden`，ZB-30 用“已画标记数 + 隐藏数”比较，通过。
