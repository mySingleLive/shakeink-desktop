# 599 · 世界线事件卡片编辑形态 测试用例独立审核

审核对象：`docs/599-worldline-card-edit-plan.md` §10 测试用例，按 §12 修订 1、§13 修订 2、§14 修订 3 覆盖（后者优先）。需求：`docs/599-worldline-card-edit-research.md` R1–R18、第 4–6 轮时间浮层；设计稿 `design/worldline-card-edit/index.html`。只审测试覆盖与测试质量，不重审架构。

本轮实际执行（只读，Node v24.18.0）：

- `node --import tsx --test tests/unit/worldline-layout.test.ts`：100 / 100 通过（基线）。
- 在 `/tmp` 的副本里给 `HEAD` 加 `addKid: 24` 并在 `collapsedHeadChrome` 的 `parts` 中加入（即 §6.1 的改动），同一组 100 个单元用例仍然 100 / 100 通过；空标题头部宽度 70 → 103，“王立大学”收起卡宽 150 → 159，10 个汉字 204 → 237。副本已删除。
- `grep` 了 `tests/browser/planning-*.test.ts`、`tests/unit/*.test.ts` 中的受影响选择器与行为（结果见 P1-1、P1-2、P2-9）。

## 结论

用例主体扎实：§10 的单元期望（TS-01~06）与计划规则一致，TP-02/03/03b 的数值、CE-31 的 `createdVersion − 2` 撤销目标都按 `planningUndoTarget`（`src/lib/planning/domain.ts:853-866`）推导正确；§12.9 的“保存事件”等文案清单与 grep 结果一致（10 个文件 20 处）。

但有两处会让用例写不出来或在改夹具后直接失败：`ai.stop` 互斥的验证方式测不到真实注册，而且漏列了会被这次改动打断的 ChatPanel 单元用例；§13.6 的夹具历史格式会让现有 IC-24 的撤销按钮变成禁用。另外有一批规则（pointerup 外部判断的排除条件、R16 的边界、悬浮框关闭条件、未定位草稿在编辑中换位置等）没有对应用例，还有几条用例在现有夹具里会空转（`.worldEventEditor` 类名、Cmd+B、组字中 Esc）。

## 追溯表

| 需求 / 规则 | 用例 | 判定 |
|---|---|---|
| R1–R3 同卡同布局、两个视图 | CE-01、CE-02、CE-03、CE-06 | 只断言尺寸和控件存在，“文字与样式一致”没有断言（G11） |
| R4 尺寸不变 | CE-01~05、CE-03 分组框 | 有；“新增角色转变”后变高应等于保存后展开高度，没有用例（G13） |
| R5 角色“＋”在最后一个角色后 | CE-14 | 只测功能，不测位置（G10） |
| R6 “保存” | 所有用例的定位器 | 有 |
| R7 最后一行“新增角色转变” | CE-15 | 只测功能，不测“只在最后一行”（G10） |
| R8 点外部取消 | CE-20、22、23、25、26、27、28、29、CE-63/64 | 主路径有；排除条件缺（G3） |
| R9 胶囊打开角色详情 | CE-40 | 有；需要读 tabs 的夹具钩子（P3-2） |
| R10 编辑中换角色 | CE-13 | 有 |
| 第 4 轮 时间浮层两问 + 填空 | TP-01~05、TP-03b、§12.14 补充 | 有；“完成”与点浮层外关闭缺（G9） |
| 第 5 轮 可拖动时间轴 | TS-01~06、TP-06、07、08′ | “只知道哪天”拖框、拖完换单位、拖动后尺寸不变缺（G9） |
| 第 6 轮 步进框 | TP-09 | 有；“时长减到 0 变为瞬间”缺（G9） |
| R13 父子卡同一编辑形态 | CE-03、CE-38 | 有；编辑中父卡保存条压在子卡之上缺（G12） |
| R14 新建子事件 | CE-30、30b、37、39′、WL-addKid | 有 |
| R15 删光子事件变回普通 | CE-35、36 | CE-35 的“foldedEvents 无残留”不可观察（P3-3） |
| R16 未修改即删除 | CE-31、32、33、33b、34、26、63、64 | restore 非 409 失败、undoTo 缺失、再次进入编辑不删除缺（G2） |
| R17 Esc 取消 | CE-20、21、60、61、65、DC-01′~05′ | 有；层序第 1 层（拖动中）和第 5 层（搜索框有内容）缺（G8） |
| R18 悬浮简介 | CE-41~46 | 部分关闭条件缺（G6） |
| §12.2 / §13.3 / §14 afterCancel 与保存 | CE-26、27、63、64 | 有；CE-63 需要夹具挂起响应（P2-3） |
| §12.3 / §13.1 Esc 互斥 ai.stop | DC-04′ 类用例 | 测的是模拟目标，不是真实 ChatPanel 注册（P1-1） |
| §13.1 进入编辑时焦点 | CE-60（间接）、CE-30 | 显式断言缺（G4） |
| §13.5 未定位草稿按视图 | CE-30b（两个视图）、CE-28 | 编辑中改为“未定”而换位置缺（G5） |
| §12.14 / CE-29、CE-62 两面板 | CE-29、CE-62 | 有 |
| §12.3 IME | CE-12、DC-05′ | 缺正向对照（P2-5） |
| §12.6 / §13.7 粘贴 adapter | CE-11、11b、11c | 夹具缺 `readClipboardText` 参数与 `showTextContextMenu`（P2-4） |
| §12.7 / §13.8 渲染与按键开销 | CE-50、WU-56c、renders | 阈值与构建方式未定（P2-6） |
| §13.9 冲突判定 | 无 | 缺（G7） |
| §12.13 宽度 +33px 重取基线 | §11 | 有（见 P2-9） |
| C1 不写入作品 | CE-20“无请求” | 有 |

## P1

### P1-1 `ai.stop` 互斥测的是模拟目标，且会打断现有 ChatPanel 单元用例（§12.9 漏列）

- §12.3 写的是“模拟一个 enabled 的 `ai.stop` 目标”（plan:385）。这样的用例只能证明 `worldline.escape` 的 enabled 判断正确，证明不了真实 `ChatPanel` 的 `ai.stop` 加上了 `!worldlineEscapeOwner(...)`。互斥是两边一起成立的：只改世界线一侧时，两条命令同时 enabled，dispatcher 返回 `blocked`，Esc 两边都不执行。这正是 §8 已知限制 1 要消除的情况，而模拟目标看不出来。
- 仓库里已有执行真实注册代码的办法：`tests/unit/composer-command-review.test.ts:17-23,63-64` 从 `ChatPanel.tsx` 取出 `useDesktopCommands(...)` 的源码，用 `new Function` 在固定参数表下执行，再接上真实的 `DesktopCommandController`。DC 用例应当照这个办法测一次真实的 `ai.stop`：生成中、焦点在世界线编辑卡片内按 Esc，`stop` 不被调用；焦点在 composer 时 `stop` 被调用。
- 同一个文件会被这次改动打断，§12.9 没有列：
  - `:64` 的 `new Function(...)` 参数表里没有 `worldlineEscapeOwner`。ChatPanel 的 `ai.stop` enabled 引用它以后，第一次求值就会抛 `ReferenceError`，CMP47-15、CMP47-16 会失败。参数表与依赖要同步补上。
  - `:130` CMP47-17 断言 `ai.stop` 的 `contexts` 深等于 `{ mention: false }`。§12.3 在 `command-registry.ts:12` 给它加了 `worldlineEdit: false`，这条断言会失败。
- 要求：DC 用例里加一条“真实 ChatPanel 注册”的用例；§12.9 补上 `composer-command-review.test.ts:64`、`:130`。

### P1-2 §13.6 的夹具历史格式会让 IC-24 的撤销按钮变成禁用（§13.6 的影响判断不准）

- 现在的夹具（`tests/helpers/worldline-browser-fixture.ts:53-54`）保存时追加一行 `{ id: "h"+旧版本, version: 旧版本 }`。`planningUndoTarget(history, 新版本)` 找不到新版本那一行，就返回 `version === 新版本 − 1` 的行，也就是刚追加的那一行，所以撤销可用。
- §13.6 改成追加 `{ id: "h"+新版本, version: 新版本 }`（与 `src/lib/services/planning.ts:344-356` 一致）以后，`planningUndoTarget`（`domain.ts:860-862`）先找到新版本那一行（reason“修改”），再找 `新版本 − 1`。F60 起始为 `version: 1, history: []`（`tests/helpers/worldline-f60.ts:74`），第一次保存后 history 只有 `h2`，`version === 1` 的行不存在，撤销按钮禁用。`IC-24`（`planning-worldline-infinite.test.ts:370`）点“撤销上次规划修改”就会超时失败。§13.6 只说“WU-39e、IC-24 随之更新快照 id 期望”，但 IC-24 并不断言 id，它失败的原因是按钮禁用。
- 真实服务端的作品在建立时就有初始版本那一行，所以夹具要在挂载时补一行：没有初始版本行时，加 `{ id: "h"+version, version, reason: "初始" }` 并把 `snapshots` 设为初始数据。补上后我按 `planningUndoTarget` 推了 CE-31：初始 v1，两次修改到 v3，新建到 v4（`createdVersion = 4`），restore `h3` 到 v5，reason 为“恢复规划版本：3”。撤销目标 = v2 = `createdVersion − 2`，与 §14 P2-J 一致；`undoTo` 取 `h3` 的快照，即新建前的数据，与 §12.5 一致。
- WU-39e（`planning-worldline-header.test.ts:38-45`）在新格式下请求 `snapshotId: "h2"`，这个 id 不在 `snapshots` 里，夹具回退到 `state.data`（`:52`），用例仍然通过，但它实际上没有验证恢复内容。建议顺便断言恢复后的数据。
- 要求：§13.6 写明初始版本行的补法；实施顺序是先改夹具，再跑一遍全部 `planning-worldline-*`，确认基线后再写 CE 用例。

## P2

### P2-1 空转或断言恒真的用例

- CE-01“无 `.worldEventEditor`”：CSS 模块编译成局部类名（夹具 `loader: { ".css": "local-css" }`，`worldline-browser-fixture.ts:71`），字面类名 `.worldEventEditor` 本来就不存在，这条断言永远成立。改用 `[class*="worldEventEditor"]`（与 `planning-worldline-*.test.ts` 里 `[class*="dot"]` 等写法相同），或者断言编辑卡片内没有 `fieldset`、`select`。
- CE-11“Cmd+B 无 `<b>`”：在没有 `controller` 的夹具里，Chromium 对 `contenteditable` 的 Cmd+B 是否执行 `formatBold` 取决于平台与 headless 设置。没有正向对照时，这条断言可能在拦截代码不存在时也成立。要求加对照：在同一页面放一个不拦截的 `contenteditable`，先确认 Cmd+B 会在里面产生 `<b>`；或者直接派发 `beforeinput`（`inputType: "formatBold"`），断言 `defaultPrevented === true`。
- CE-12、DC-05′“组字中 Esc 不取消”：缺正向对照。要先确认组字期间派发的 Esc 确实带 `isComposing` 或 `keyCode 229`（例如在页面上监听 keydown 并记录），否则在“Esc 根本没送到页面”的情况下用例也会通过。CDP 的 `Input.imeSetComposition` 在仓库里还没有用过（`grep imeSetComposition tests` 无结果），`text-shortcuts.test.ts` 只用了 `Input.dispatchKeyEvent`（`:82-83`）。实现时先写一条“组字后提交，文本进入 `fact`”的正向用例，再测 Esc。
- TP-10“重叠处 `elementFromPoint` 是浮层”：要指定取点方法（取浮层与保存条两个矩形的交集中心），并先断言交集非空。否则浮层与保存条不重叠时，用例取不到点或者取到别的元素也照样通过。

### P2-2 R8 外部判断的排除条件没有用例（§12.2、§13.9）

§12.2 与 §13.9 规定了几种不算“点外部”的情况，CE-22 只覆盖了拖选、浮层、保存条、确认框，以下缺用例：

- 右键（`button !== 0`）点画布不取消；
- 按下后移动 ≥ 4px（例如在画布空白处拖动平移）不取消，< 4px 取消；
- 在可滚动元素的滚动条上按下不取消（§13.9 `offsetX ≥ clientWidth`）；
- 时间轴拖动结束后的那次 click 被吞掉：TP-06 只断言“拖完卡片仍在编辑”，要再加一种情况，把圆点拖到浮层与卡片之外再松开，断言仍在编辑。§12.2 改为 pointerup 判断后，这是唯一需要靠吞 click 的路径；
- 禁用按钮上的 pointerup 也会取消（§12.2 说明了这个理由，CE-39′ 的禁用按钮可以顺便断言：点它不取消，因为它在编辑卡片内部；点另一张卡片上的禁用按钮会取消）。

### P2-3 CE-63 需要夹具能挂起响应；CE-33 需要的 `externalEdit` 要写清行为

- CE-63“restore 未返回时双击另一张卡片”需要让 restore 请求停在半路。现在的夹具 `fetch` 是同步算完就返回（`worldline-browser-fixture.ts:44-56`），没有挂起的办法。要加 `holdNext()`：返回一个由测试手动放行的 Promise。不加的话，restore 在双击之前就结束了，用例测不到 `await cancelPending` 的顺序。
- CE-33 的 `externalEdit(ops)` 应在夹具里直接应用操作、版本加 1、追加一行 history，并且不写入 `posts`；CE-33 断言 `posts` 只有 `[put(新建), delete]`。CE-33b 断言 `posts` 为 `[put, restore, delete]`，restore 收到 409。

### P2-4 粘贴 adapter 的用例需要夹具支持

- CE-11b 需要 `readClipboardText` 返回固定文本，但现在 `mount.controller` 时它固定返回 `''`（`worldline-browser-fixture.ts:37`）。要加挂载参数（例如 `clipboard: string`），并记录读取次数，用来证明 Cmd+V 走的是 adapter，而不是浏览器原生粘贴。
- CE-11c“右键菜单粘贴”需要 `window.desktop.showTextContextMenu`，夹具里没有。参照 `text-shortcuts.test.ts:23` 加一个返回指定命令的实现。
- CE-11 加的“全选删除后输入，再 Cmd+Z 恢复”：在没有 controller 的夹具里 Cmd+Z 是浏览器原生撤销；在 `controller: true` 下走 Controller → `execCommand("undo")`。两种都要测，Electron 只走后一种。

### P2-5 Esc 层序第 1 层、第 5 层没有用例（§13.2）

- 第 1 层：编辑中开始拖动（时间轴圆点、时间线卡片标题拖动 `temporalDrag`、框选、小地图拖动），按 Esc 只取消拖动，编辑保留；再按 Esc 才取消编辑。现有 CP-02、IC-15、MM-B7、WU-56d 都是在没有草稿时测的。
- 第 5 层：编辑中焦点在搜索框且有内容，Esc 清空搜索、编辑保留（§12.3 有这条，但没有分配用例编号）；搜索框为空时 Esc 取消编辑（`wants()` 的第三条，§13.1）。
- §13.2 第 5 层同时修复了 Electron 中搜索框 Esc 无效的问题，应加一条 `controller: true` 下没有草稿时搜索框 Esc 清空的用例。现有 `planning-worldline-table.test.ts:167`、`table-scale.test.ts:179` 都在没有 controller 的夹具里。

### P2-6 渲染与按键开销用例的阈值、构建方式没有写清（§12.7、§13.8）

- CE-50 有两个版本：§12.7 断言 `renders.EventCard` 增量 ≤ 24，§13.8 改用 F885 测 keydown → 下一帧 ≤ 16ms。§13.8 没说是否保留 §12.7 的渲染次数断言。两者测的东西不同，应该都保留。
- 渲染次数只能在 profiling 构建里数（`renderProbe` 在 production 构建里被编译掉，`src/lib/planning/render-probe.ts:5`），而 profiling 构建是 development 模式，测时间不准。CE-50 要拆成两条：渲染次数（`profiling: true`）和按键耗时（production 构建）。`planning-worldline-renders.test.ts` 的写法是先做正向对照，确认计数器在工作。
- 16ms 在 headless Chromium 的 CI 抖动下可能偶发失败。参照 ZB-20 的写法（`card-zoom.test.ts:489`，“p95 under 20ms”）写成 P95 的阈值，并记录 P50 / P95。
- “WU-56c 拖动路径经过有胶囊的卡片”（CE-45）：WU-56c 的路径是从 `emptyPoint` 水平移动 360px（`renders.test.ts:38-41`），不保证经过胶囊。CE-45 要自己选一条经过胶囊的路径，并先断言路径上确实有 `[data-character-pill]`。

### P2-7 R18 悬浮框的关闭条件缺用例（§12.8）

§12.8 列了 7 种关闭方式，CE-42 和 CE-46 覆盖了移开、Esc、滚动、平移。以下缺用例：

- 在悬浮框外 pointerdown；
- 缩放（Ctrl + 滚轮）；
- 点“打开角色卡 ›”：悬浮框关闭并打开 `character:{id}` 标签；
- Esc 关悬浮框时，另一张卡片的编辑保留（研究文档 R18：“Esc 只关悬浮框，不影响其他卡片的编辑”）；
- 悬浮框位置：下方放不下时翻到上方、左右不出视口（研究文档 R18）；
- 角色无职业时只显示身份、无简介时不显示简介、无头像时显示首字。

CE-44“只请求一次”：§13.9 写了“悬浮框角色查询在第一次悬停时启用”，CE-44 应同时断言挂载后、悬停之前 `/characters` 请求次数为 0。

### P2-8 R16 的边界没有用例（§12.5）

- restore 返回非 409 的失败（例如 500）：§12.5 只写了 409 的处理。要用例断言子事件保留、显示 `save()` 的错误文案、草稿已清（或保留，计划要先定）。`failNextSave` 可以直接用。
- 第二次进入编辑：新建子事件后保存一次，或取消（改过）后再双击进入编辑，不修改再取消，子事件保留。研究文档 R16“细节”第 1 条明确要求，现有用例里没有。
- CE-31 的“history 无‘删除’条目”在 restore 路径下恒成立（restore 不会产生“删除”条目）。改成断言 `history` 最新一行的 reason 为“恢复规划版本：{createdVersion − 1}”。
- “已在「{父}」下新建子事件”与“未修改的新子事件已移除”两条提示只在 CE-31 断言了后一条。CE-30 加前一条。

### P2-9 §12.9 受影响用例表要补的行

按 grep 结果，表里还缺：

| 文件:行 | 现依赖 | 原因 |
|---|---|---|
| `composer-command-review.test.ts:64`、`:130` | ChatPanel 注册参数表；`ai.stop` contexts | 见 P1-1 |
| `planning-worldline-infinite.test.ts:316-329`（IC-22） | `dblclick` 后“保存事件” | 文案；表里写的是 `:318-329`，范围对，但用例名应记 IC-22 |
| `planning-worldline-regression.test.ts:202-220`（WU-71） | 冻结事件的「…」→ 编辑 / 复制 / 删除禁用后按 Esc 关菜单 | §12.2 取消了 `hasDraft` 禁用，冻结规则仍在；Esc 关菜单要经过新的 `escapeInEditor` 第 3 层，没有草稿时 `worldline.escape` 是否 enabled 要与 CM-06（`planning-card-menu.test.ts:193`）一起确认 |
| `planning-card-menu.test.ts`、`planning-worldline-time.test.ts` | 自带 fetch 夹具，非 planning 路径抛错（`card-menu.test.ts:65-66`、`time.test.ts:67-68`） | §13.9 已列；还要注意这两个文件把 Monaco 换成了抛错的实现，CE 用例如果放进去会失败 |
| `planning-worldline-workspace.test.ts:351-362`（WU-76） | 待定位列表“编辑时间” | 进入编辑的入口之一（研究文档“编辑流程”），§13.5 改变了待定位事件的编辑位置（事件表原位、时间线视图上方），没有用例覆盖这个入口 |
| `tests/unit/worldline-layout.test.ts` CW-03、ZP-01 | 头部宽度 | 我在副本里加上 `addKid` 后这两条仍然通过，因为它们比较的是差值或用 `collapsedHeadChrome` 自己算阈值。§6.1“按宽度断言的用例同步 +33px”在单元层没有需要改的用例；WL-addKid 必须写绝对值（例如空标题头部 103，“王立大学”159），否则不能证明改动生效 |
| 浏览器 CW-10（`canvas.test.ts:68`）、`regression.test.ts:36-40` | 收起卡宽在 [150, 340] | 区间断言不会失败，但 “widths vary” 之类的统计会变；§12.13 要求真实目标重取基线，浏览器层也应先跑一次记录前后值 |

### P2-10 真实目标验证（§11 + 修订）

整体诚实：§12.14 写明生成中 Esc 只在浏览器 `controller: true` 验证，§11 第 4 步不覆盖；§12.13 写明宽度变化后重取基线。还需要补的说明：

- 离线隔离根默认无模型，所以“对话区 AI 同时改了规划”（CE-33 的真实来源）在真实目标上无法复现，只能用夹具 `externalEdit` 验证。§11 应写明 R16 的 delete / 409 回退只有夹具证据。
- §11 第 4 步用 `sendInputEvent` 发 Esc；组字中的 Esc（IME）在 Electron 里没有可靠的发送办法，也应列为“仅浏览器”。
- §11 第 3 步“历史无删除记录”应改为读回 `history` 最新一行的 reason 为“恢复规划版本：N”，并且撤销按钮回到新建之前的那一版（与 CE-31 同口径）。
- LOTM 隔离根 `~/shakeink-test-roots/worldline-ui-583` 存在；按记忆 isolated-root-lease-receipt，复制隔离根时要先移走 inbox 租约收据，§11 没写复制还是原地使用，应写明。
- 台账 `WL-599` 应把每条需求标为“浏览器夹具”或“真实目标”，不要用一次真实目标冒烟覆盖全部 R1–R18（AGENTS.md）。

## P3

- P3-1 CE-06 截图只作证据，不断言像素，没问题；但应写明截图路径与两个视图 × 两个主题共 4 张，并截编辑中有浮层的一张（第 4 轮修复的浮层被保存条遮挡）。
- P3-2 CE-40 断言 `useTabsStore` 打开了 `character:{id}` 标签，但夹具没有暴露 tabs 状态。要加 `globalThis.openTabs = () => useTabsStore.getState().tabs.map(t => t.id)`（`buildTabId("character", ...)` 结果是 `character:{refId}`，`src/stores/tabs.ts:101`）。
- P3-3 CE-35“`foldedEvents` 无残留”是组件内部 state，测不到。改成可观察的断言：之后再给该事件新建子事件，新的分组框是展开的（子卡片可见）。
- P3-4 CE-35 的“卡片闪一下”：`flashCard` 设 `data-flash` 1200ms 后移除（`PlanningWorkspace.tsx:2367-2373`），断言要在 1200ms 内 poll。
- P3-5 TP-09“按住 900ms”：400ms 后每 60ms 一次，900ms 约 9 次，±1 的误差要写进期望（设计稿自测是 16 → 25，即 9 次）。
- P3-6 TS-02 应补“范围恰好等于 30 × 步长”的边界，以及 `years` 历法下“只知道哪天”禁用（§12.14）。
- P3-7 TS 单元里 `sameEvent` 的用例（§12.5：键顺序不同判相同、数组顺序不同判不同、`undefined` 与缺键等价）还没有编号，建议记为 TS-07。
- P3-8 新增命令 `worldline.escape` 后，`release-optimization.test.ts:77` 的 OPT-C01 会比较 `command-catalogs.generated.json`，要重新生成；§13.9 的冲突说明应有单元用例：`bindingConflicts(platformCommands("darwin"), {}, "worldline.escape", "Escape", 0)` 不含 `ai.stop`，含 `input.cancel`、`md.selectionCancel`、`ai.mentionClose`（参照 `composer-shortcuts.test.ts:18-23`）。
- P3-9 设计稿的“只知道哪天拖框按天移动”“拖动后单位自动换回小时（29 小时）”只有单元 TS-06，浏览器 TP-06 应补一次，并断言拖动过程中卡片尺寸不变（研究文档第 5 轮“拖动不改变卡片尺寸”）。
- P3-10 编辑卡片自身的“新建子事件”禁用（CE-39′）以外，研究文档 R14 写的“收起卡片 55% 不透明、悬停 100%”没有用例；可以用 `getComputedStyle().opacity` 断言。

## 缺口汇总

| # | 缺口 | 位置 |
|---|---|---|
| G1 | 真实 ChatPanel `ai.stop` 互斥 | P1-1 |
| G2 | R16 非 409 失败、再次进入编辑不删除 | P2-8 |
| G3 | R8 右键、≥4px、滚动条、时间轴拖出后 click、禁用按钮 | P2-2 |
| G4 | 进入编辑时焦点在卡片根 / 标题，浮层关闭时焦点回到触发按钮（§13.1） | 新用例 |
| G5 | 编辑中把已定位事件改为“未定”，时间线上卡片移到视图上方、编辑不丢（§13.5） | 新用例 |
| G6 | 悬浮框关闭与位置的其余条件 | P2-7 |
| G7 | `worldline.escape` 默认绑定冲突判定 | P3-8 |
| G8 | Esc 层序第 1、5 层 | P2-5 |
| G9 | 时间浮层“完成”、点浮层外关闭、只知道哪天拖框、时长减到 0 变瞬间 | P3-9、追溯表 |
| G10 | R5 / R7 的位置（“＋”在最后一个角色后、只在最后一条转变行） | 新用例 |
| G11 | R3 文字与样式一致（标题、`.when`、重要度文字的 `font`、颜色与展开形态相同） | 新用例 |
| G12 | 编辑中父卡保存条在子卡之上（R13）、事件表编辑卡 `z-index` 高于下一张卡片（§8） | 新用例 |
| G13 | 新增角色转变后高度等于保存后展开高度 | 新用例 |
| G14 | 待定位列表“编辑时间”入口 | P2-9 |

共 14 项。

## 判定

仍需修改：P1-1（DC 用例改为执行真实 ChatPanel 注册，§12.9 补 `composer-command-review.test.ts:64,130`）、P1-2（§13.6 夹具补初始版本行并先跑全部 `planning-worldline-*` 定基线）；P2-1 的空转断言改为有正向对照；P2-2~P2-8 的缺口补用例编号，P2-3、P2-4 的夹具扩展写进 §10。

## 第 2 轮审核

只审 `docs/599-worldline-card-edit-plan.md` §15。

| 项 | 判定 | 说明 |
|---|---|---|
| P1-1 | 已解决 | DC-10 执行真实 ChatPanel 注册；`:64`、`:130` 列入 §12.9（15.1、15.11） |
| P1-2 | 已解决 | 初始版本行 + 先跑基线（15.2）；按 `planningUndoTarget` 复核，CE-31 新的 `history[0].reason === "恢复规划版本：" + (createdVersion − 1)` 与 `createdVersion − 2` 撤销目标一致 |
| P2-1 | 已解决 | 四条都有正向对照；组字 Esc 无法送达时标“无法验证”（15.3） |
| P2-2 | 部分解决 | CE-22a~d 可行。CE-22e 要先点 summary 打开冻结事件的「…」菜单，这一下 pointerup 已经取消了编辑，测不到“禁用按钮上的 pointerup”。改用冻结事件头部的“新建子事件”按钮（`disabled = readonly || frozen || hasDraft`，§6.1），直接在它上面按下松开 |
| P2-3 | 已解决 | `holdNext()`、`externalEdit` 行为与 posts 期望写清（15.5） |
| P2-4 | 已解决 | 15.6 |
| P2-5 | 已解决 | CE-66~68 |
| P2-6 | 已解决 | CE-50a / 50b 拆开，P95 ≤ 20ms；CE-45 先断言路径经过胶囊 |
| P2-7 | 已解决 | CE-44、47~49、51~53 |
| P2-8 | 已解决 | CE-31c~e、CE-30 提示 |
| P2-9 | 已解决 | 15.11 补齐 |
| P2-10 | 部分解决 | 15.12 可接受；“真实目标补一次手动粘贴截图”中的“手动”要改为可重复的步骤（主进程写剪贴板 + `sendInputEvent` 发 Cmd+V，同 text-shortcut-598 驱动），否则不能记为真实目标通过 |
| G1、G2、G3、G6、G8、G14 | 已解决 | 见上 |
| G4、G5、G9~G13 | 已解决 | CE-70~75、TP-11 |
| G7 | 已解决 | CE-76 |
| P3-1~P3-10 | 已解决 | 15.13 逐条对应（P3-8 在 15.11 与 CE-76，P3-9 在 TP-11） |

新的 P1：无。

上面两条“部分解决”都是 P2，只要在实现 CE-22e 和写 §11 驱动时照改即可，不影响开始实现。

可以进入 TDD 实现
