# 588 · 世界线事件表视图：对齐 / 等距两种时间轴模式 技术方案与测试用例（修订 1）

来源：用户 2026-11-18 修改要求（调研 `docs/588-worldline-table-rail-modes-research.md`），设计稿 `design/worldline-rail-modes/index.html` 经三轮修改后同日审核通过。基于 `7b89b23`。修订 1 按审核 `docs/588-worldline-table-rail-modes-plan-review.md` 第 1～20 条修改（文中以“审 n”标注）。

## 需求（含设计稿审核结论）

| # | 内容 |
|---|---|
| R1 | 事件表时间轴两种模式：**对齐**（圆点、日期与卡片头部中线同一水平线）与 **等距**（docs/586 现状） |
| R2 | 切换按钮“时间轴 对齐 / 等距”在事件表区域右上角，随时切换 |
| R3 | 默认对齐 |
| R4 | 父事件卡片占满分组框宽度并贴住框顶 |
| R5 | 悬停时间轴左侧日期标签时，标签、圆点、引线、对应卡片一起高亮 |
| R6 | 落点为卡片头部中线；时间回退用 `↺` 前缀 + 弱色斜体 + 空心圆点 + 虚线轴 |

## 1 分组框与标题栏（R4；审 1、2、3、15）

**布局**（`tableLayout`）：新常量 `GROUP_HEAD_HEIGHT = 36`、`GROUP_HEAD_GAP = 4`；`GROUP_PADDING = 10` 只用于框底。有子事件的节点：
- `group.top = y`；父卡片 `top = y`，收起高 36（展开用测得高度或估算；标题栏无上下边框，估算为 `estimateCardHeight` − 2，审核第 2 轮 G）。
- 父卡片之后 `y += 父卡片高 + GROUP_HEAD_GAP − CARD_GAP`，因为子事件的 `block()` 开头会再加 `CARD_GAP`（`worldline-layout.ts:702`）。于是首个子卡 `top = 父底 + 4`。
- 未折叠：子事件排完后 `y += GROUP_PADDING`；折叠：`group.bottom = 父底`。
- `TableCard` 新增 `groupHead: boolean` 与 `head: number`（卡片头部中线的绝对 y）：

| 卡片 | 收起 | 展开 |
|---|---|---|
| 叶子 / 子卡（1px 边框 + `.head` 32 / 42） | top + 17 | top + 22 |
| 标题栏（无边框，`.head` 36 / 42） | top + 18 | top + 21 |

  `TableSegment.heads`、`railMarks` 的插值端点、`EventTable` 引线终点都读 `card.head`。等距模式的圆点因此随展开移动 0～5px。

**渲染**：
- 分组框不再用 `border`，改为 `box-shadow: inset 0 0 0 1px <原边框色>, inset 3px 0 0 var(--ec)`（设计稿 `.group` 有 3px 类型色左边）。这样框内绝对定位的坐标与布局坐标一致，嵌套不再逐层偏 1px（审 2）。
- 父卡片 slot 加 `s.slotHead`；`EventCard` 新增可选 prop `groupHead`（仅 `variant="table"` 传），`article` 加 `s.groupHead`。选择器：
  - `.slot.slotHead { left: 0; right: 0; max-width: none }`（`.slot.slotHead.slotOpen` 同样 `max-width: none`）
  - `.slot.slotHead > .card.groupHead { width: 100%; min-width: 0; border: 0; border-radius: 12px 12px 0 0; box-shadow: inset 0 -1px 0 var(--border); background: color-mix(in srgb, var(--ec) 12%, var(--card)) }`
  - `.groupHead .head { height: 36px }`、`.groupHead.open .head { height: 42px }`、`.groupHead .title { font-weight: 600 }`
  - 悬停 / 选中 / 命中的边框样式在标题栏上改为 inset box-shadow，保持 36px 不变。
- 时间线视图、事件目录不变。

## 2 模式状态与切换按钮（R2、R3；审 6、12、16、17）

- `PlanningWorkspace` 新增界面状态 `tableRail: "aligned" | "linear"`，初值 `"aligned"`，不写入作品；切换视图、世界线不重置。
- `tableView` 增加 `e`（夹紧后的值）。工具栏缩放值：对齐模式 `${Math.round(exp(e) × 100)}%`；等距模式不变（档位名 / 按事件）。
- `EventTable` 新增 props `railMode`、`onRailMode(mode)`。滚动区内、`stickyYear` 之后放 `position: sticky; top: 0; height: 0; z-index: 7` 的容器，内含：
  - `role="group" aria-label="时间轴模式" data-rail-mode-toggle=""`，前缀“时间轴”（窄栏 ≤ 640px 隐藏前缀），按钮“对齐”“等距”带 `aria-pressed`，原生 `<button>` 可 Tab 聚焦、Enter / Space 切换，`:focus-visible` 有焦点环。
  - 绝对定位 `top: 8px; right: 24px`（窄栏 10px），底色 + 阴影。title 同设计稿。
  - z-index 依据：`.cards`、`.slot`、`.groupBox` 都不建立层叠上下文，打开菜单的卡片 `z-index: 9`（`worldline.module.css:109`）高于 7，目录浮层 15 也高于 7。
- **顶部留白**：滚动区内、`[data-event-table]` 之前加一个 `TABLE_TOP = 40` px 高的占位块，`scrollTop = 0` 时按钮不压住首张卡片（设计稿 `.table { margin-top: 32px }`）。`EventTable` 里由 scrollTop 换算布局 y 的地方都减去 `TABLE_TOP`：`firstVisible`、吸顶年份、虚拟窗口、Ctrl + 滚轮指针位置；`anchorNow` / 恢复是同一坐标系内的差，不变。
- 切换只换时间轴，`tableLayout` 不接收模式参数，卡片位置与 `scrollTop` 不变，不需要锚点（与调研“恢复 firstVisible”的设想不同，理由同此）。切换时清空悬停状态。

## 3 对齐模式时间轴（R1、R6；审 4、5、7、9、10、11、19、20）

新纯函数 `alignedRailMarks(layout, adapter, { selected, periods, compact })` 返回 `RailMarks & { backs: RailBack[] }`，`ticks` 为空；`RailDot`、`RailLabel` 新增 `back: boolean`，`RailLabel.level = null`。`EventTable` 在对齐模式调用它，等距模式调用原 `railMarks()`。

每段按 head 升序处理（`layout.segments[].heads`），维护段内最大时间 `max`、当前徽章年 `year`（`yearText`，含纪元）、去重键 `prev`：
- **圆点**：每个已定位卡片一个，`y = head`，无聚合（卡片头最小间距 39px，见 RM-01b）；`points` 同此。
- **回退**：`t < max` 为回退。回退卡片：圆点空心（`s.back`）、标签总可见、文字 `↺ ` + 正文；不更新 `prev`、不产生徽章。连续回退合成 `RailBack { top: 上一张非回退卡 head, height: 末张回退 head − top }`。
- **正文（用户验收 2026-11-19 修改）**：与事件目录同一函数 `treeTime`：总是显示到月日，粗于“日”的记录加“约”（`约7月22日`），hour 记录带时:分；卡片年份与当前年徽章相同时不写年份，不同时（回退到另一年）写年份（`↺ 1339年8月14日`）。窄栏：不写年份时省略时间前的月份（`22日 14:05`），写年份时只到月（`↺ 1339年8月`）。下列原规则作废：
- ~~**正文**（显示精度 = 记录精度）~~：有 `railUnits` 时 `railText(t, L(p), time, compact)`，`L`：year→year、month→month、day→day、hour→minute；era 由 `railText` 给纪元名；无 `railUnits` 用 `railLabel(t, p)`。只有 `window` 事件带“约”。
  - 回退卡片且精度为 day / hour、`yearText(t) ≠ year` 时，正文前补 `yearText(t)`（例 `↺ 第五纪1339年8月14日`）；`window` 事件的“约”放在年份前（`↺ 约第五纪1339年8月14日`，审核第 2 轮 D）。month / year / era 精度不补（文字自带年份或纪元）。
  - 一段内全为 era 精度时没有年徽章（审核第 2 轮 E）。
- ~~**去重键**~~（用户验收 2026-11-19 撤销）：对齐模式下**每张已定位卡片的日期都显示**，不再与上一个标签或年徽章去重；卡片头至少相隔 39px，标签不会重叠。只有文字为空时不显示。
- **年徽章**（`hasYears`）：段首徽章 `y = 最小 head − 22`，文字为段内第一张非回退、非 era 精度卡片的 `yearText`。之后非回退、非 era 精度卡片 `yearText(t) ≠ year` 时，在它与**紧邻上一张卡**（含回退卡）head 的中点加徽章；加徽章时 `year = yearText(t)`、`prev = yearKey(t)`。era 精度卡片不产生年徽章。
- **纪元徽章**：`hasEras && !hasYears` 时规则同上，文字 `eraOf(t).name`。
- 标题栏不透明，自己画 3px 类型色左边（`inset 3px 0 0 var(--ec)`），与框的左边连续（审核第 2 轮 B）。
- **时期条**：按 head 顺序，`start ≤ t ≤ end`（`end = null` 视为 +∞，与工具栏计数 `PlanningWorkspace.tsx:2530` 一致）的连续卡片合成一条 `[第一张 head, 末张 head]`。
- **轴线**：`top = 最小 head − 22`，`height = 跨度 + 44`。待定位区、段间断开不变。

渲染：回退标签 `s.back`（弱色、斜体，`title="早于上一事件"`，`.railLabel.back.hot` 恢复正体）；回退圆点 `s.back`（背景色填充）、`data-rail-back-dot`；回退段 `s.railBack`（先用背景色盖住实线，再画 2px 虚线），`data-rail-back`。

## 4 悬停联动（R5；审 13、14）

- `.railLabel` 改 `pointer-events: auto`。标签保留 `data-label-for`（现有用例依赖），另加 `data-ids` 供委托读取（审核第 2 轮 F）。`.rail` 上用 `onPointerOver` 委托：`closest("[data-rail-label],[data-rail-dot]")` 取 `data-ids` 设置 `hover`，`onPointerLeave` 清空；删除圆点上各自的 enter/leave。标签 key 改为 `ids.join(",")`。
- 等距模式的标签 `ids` 即所在聚合圆点的全部事件。
- 对齐模式参考线 `data-rail-guide`：任一来源悬停（卡片、圆点、标签）时，对每个悬停卡片画 1px 虚线，从 x = 0 到 `leadX + card.left`，y = head，类型色 60%，`pointer-events: none`；选中不画。

## 5 文件范围

`worldline-layout.ts`、`EventTable.tsx`、`EventCard.tsx`、`worldline.module.css`、`PlanningWorkspace.tsx`；测试 `tests/unit/worldline-layout.test.ts`、新建 `tests/browser/planning-worldline-table-rail-modes.test.ts`、迁移见下。不改时间线视图、事件目录。

## 已知取舍

- 对齐模式时间轴不单调。真实数据（`LOTM-587-wg-r1`）按段计有 61 张回退卡片（根 20、子 41，11 段连续回退）；1049/1061 为年精度，复位时可见标签多为年份。回退到另一年的标签带纪元年（年精度 `↺ 第五纪1282年`，日 / 时精度 `↺ 第五纪1339年8月14日`，窄栏同样保留月份，code review M1）；回退到徽章同年的标签不补年份。
- `hasEras && !hasYears` 的纪元徽章规则在现有日历下不会触发（有纪元的公历总有年），保留为防御。
- 缩放在对齐模式只改卡片间距，不改标签精度。
- 切换按钮浮在右上角：滚动中顶到视口顶部的分组标题栏，右端约 170px（含计数与“…”菜单）会被按钮遮住，滚动即可避开；`scrollTop = 0` 时有 40px 留白不遮挡。
- 等距模式圆点端点改读 `head`，展开卡片时圆点移动 ≤ 5px。

## 测试用例

### A 层 单元（期望值手算）

| ID | 内容 |
|---|---|
| RM-01 | FIXED24：`p`(0h) 子 `c1`(6h)、`c2`(12h)，`q`(72h)，k=0。`p.top = g.top`、高 36、`head = top+18`；`c1.top − p.top = 40`，`c1.head = c1.top+17`；`c2.top − c1.top = 40`；`g.bottom − c2.top = 44`（框高 124）；`q.top − g.bottom = 6`。折叠：`g.bottom − p.top = 36`。展开 `p`（测得 120）：`c1.top = p.top+124`，`p.head = p.top+21`；展开 `c1`：`c1.head = c1.top+22` |
| RM-01b | 深度 2：`p`(0h) 子 `c`(1h)、`d`(3h)，`c` 有子 `g`(2h)，k=0。`p.top=0`：`c.top=40`、`g.top=80`、`c` 框底 124、`d.top=130`、`p` 框底 174。head：p 18、c 58、g 97、d 147，差 40 / 39 / 50。折叠 `c`：`c` 框底 76、`d.top=82`、d head 99，c→d 41。所有相邻 head 差 ≥ 39 |
| RM-02 | 对齐：每个已定位卡片 `points` = 圆点 y = `card.head`；无聚合；`ticks` 空；待定位卡无圆点；`labels[i].level === null` |
| RM-03 | 记录精度文字：day `3月2日`、hour `4月5日 21:00`、month `1349年4月`、year 卡紧随徽章不可见、era `第四纪` 且不产生年徽章、window 带 `约`；同键相邻第二个不可见、选中则可见；compact 下 3/5 21:00 与 4/5 21:00 相邻都可见 |
| RM-04 | 回退（合法数据，父事件带足够持续时间：A 300 天、B 240 天，审核第 2 轮 A）：根 A 1340-04-01 子 A1 1340-12-20；根 B 1340-06-01 子 B1 1340-06-05、B2 1341-01-03（day 精度，ERA_CAL）。顺序 A, A1, B, B1, B2：B、B1 回退，文字 `↺ 6月1日`、`↺ 6月5日`（同年不补年），空心；`backs` 一段 `[A1.head, B1.head]`；B2 不回退，产生 `第五纪1341年` 徽章于 `(B1.head + B2.head)/2`。补年例：回退卡在上一年 → `↺ 第五纪1339年8月14日` |
| RM-05 | 年徽章：段首在最小 head − 22；跨年徽章在紧邻上一张卡与新年卡 head 中点；徽章后同年 year 精度卡不可见 |
| RM-06 | 时期 `[s, e]`：时期内连续三张一条（head→head）；中间插时期外一张分两条；恰在 `e` 上的卡计入；单卡一条 `y0 = y1` |
| RM-07 | 两段：各一条轴线（head 范围 ± 22）；`breaks` 与等距相同 |
| RM-08 | `years` 历用 `railLabel`；无年日历无年徽章；`hasEras && !hasYears` 产生纪元徽章 |
| RM-09 | 真实数据计数脚本 `588/backs-588.ts` 用 `alignedRailMarks` 计回退 = 61（E 层证据，不进仓库测试） |

### B 层 浏览器（新文件，F60 / F885 / 合成数据）

| ID | 内容 |
|---|---|
| RM-B1 | 默认“对齐”`aria-pressed=true`；按钮组右缘距滚动区右缘 ≤ 30px、上缘距滚动区顶 ≤ 16px；滚动 1000px 后屏幕位置不变；`scrollTop=0` 时与任何卡片矩形不相交；时间线视图无此按钮组；Tab 聚焦后 Space 切到等距 |
| RM-B2 | 对齐：F60 视口内每个收起与展开卡片（含孙级）的圆点中心 y 与卡片 `.head` 中线屏幕 y 相差 ≤ 1px；引线起止 y 相差 ≤ 1px。F885（虚拟化）滚到中部同样成立 |
| RM-B3 | 切等距再切回：`scrollTop` 与视口内卡片屏幕位置不变；缩放值对齐 `100%`，按 + 一次 `125%`，Ctrl + 滚轮一次 `144%`（1.25 × 1.15）；等距显示档位名；切到时间线再回事件表仍为所选模式 |
| RM-B4 | 悬停对齐模式标签：标签 `.hot`、圆点 `.hot`、引线 `.hot`、卡片 `data-hot`，出现 `data-rail-guide`；移开全部清除；悬停中切换模式后旧高亮消失；等距模式悬停聚合标签时其全部卡片 `data-hot` |
| RM-B5 | 分组框：标题栏宽 = 框宽（±1px），上缘 = 框上缘（±1px），高 36；首个子卡上缘 = 标题栏下缘 + 4（±1px）；折叠后框高 36；展开标题栏仍占满框宽 |
| RM-B6 | 回退：合成数据的回退标签以 `↺` 开头、`title="早于上一事件"`；存在 `data-rail-back` 与 `data-rail-back-dot` |
| RM-B7 | 窄栏：按钮组完整在滚动区内、无“时间轴”前缀，与吸顶年份矩形不相交；标签不超出滚动区 |
| RM-B9 | 用户验收：默认对齐，视口内每张已定位卡片都有日期标签，与卡片头部中线相差 ≤ 1px（F60，三个滚动位置）；每个非回退标签文字与事件目录同一事件的时间相同（≥ 20 个） |
| RM-B8 | 对齐模式从目录定位标题栏与孙级卡片，落在视口上三分之一（WU-62 口径）；顶部卡片打开“…”菜单时菜单在按钮之上（`elementFromPoint`） |

### 现有用例迁移（逐条，均不放宽断言）

| 用例 | 处理 | 理由 |
|---|---|---|
| WU-19j | 常量增加 36 / 4；父卡片 `top − g.top` 10 → 0，`c1.top − p.bottom` 6 → 4，折叠框高 44 → 36 | R4 改了几何 |
| RL-02 | 框高 134 → 124；`qTop(1)` 140 → 130；`qTop(3) = 216`、`qTop(4) = 240` 不变（`max(130, min(240, 72k))`，审核第 2 轮 C） | 同上 |
| WU-13 / 13b / 13c / 14 / RL-01..07 | 端点由 `top + 17` 改 `head`，叶子收起数值不变 | 只换读法 |
| WU-30 | 未改：F60 前 20 张卡中没有标题栏，断言原样成立（code review 建议；标题栏 36px 由 RM-B5 断言） | — |
| WU-44 / WU-44b | 两种模式各跑一次；前提“存在无可见标签的圆点”为硬断言，对齐模式下 F60 实测成立（审核第 2 轮 H） | 悬停联动两种模式都要成立 |
| WU-45、RL-B1..B5 | 开始时点“等距” | 断言的是等距几何与档位 |
| WU-46 | 未改：吸顶年份读年徽章，对齐模式下原断言仍成立 | — |
| CW-11 | 宽度 [220, 880] 规则排除标题栏；另断言每个标题栏宽 = 框宽（±1px） | R4：标题栏占满框宽 |
| 其余（按 F60 运行） | 先跑，若有失败逐条补入本表再改 | — |

### E 层 真实目标（Electron + 隔离根 `worldline-ui-583`，作品 `LOTM-587-wg-r1`，无模型调用）

| ID | 内容 |
|---|---|
| RM-E1 | 默认对齐；在 0/25/50/75/100% 滚动位置测视口内圆点与卡片 `.head` 中线距离，最大 ≤ 1px（调研前中位 173px） |
| RM-E2 | 切等距再切回卡片位置不变；等距复位为年档 |
| RM-E3 | 找视口内第一个可见 `[data-rail-label]` 悬停，其卡片 `data-hot`；标题栏几何同 RM-B5；截图 `588/e1/` |
| RM-E4 | 页面中滚动全表累计 `[data-rail-back-dot]` 去重 id 数 = 61（与 RM-09 一致） |

全量：`npm test` 与全部世界线浏览器用例；对比基线（本次改前：worldline-layout 53/53；世界线浏览器 130/131，WU-40b 改前即失败），不新增失败。台账新增 `WL-588`。
