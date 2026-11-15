# 580 · 世界线界面改版 技术方案（修订 2）

依据：`577-worldline-ui-product-design.md`（§1–§15，2026-11-15 设计稿 v9 审核通过）、`design/worldline-redesign/`（只作视觉参考，不进入产品）。基础：`fix/worldline-chronology`（docs/570–582，纪元历法）通过复审并提交后的代码。

修订 2 回应 `580-worldline-ui-plan-review.md`：必须修改 M1–M9 全部处理，建议修改 S1–S14 全部采纳或说明理由。每处在方括号中标注对应编号。下文中的行号指 chronology 工作树。

## 1. 范围与原则

- 改动范围：世界线面板（`WorldlinePanel`，即 `PlanningWorkspace` 中 `mode="world"` 的分支）的样式、纯函数库、事件字段、事件编辑器和导入契约。叙事线和大纲投影面板不受影响；三个面板共用的头部只在世界线模式下改变 [S9]。
- 遵循 AGENTS.md：复用 Web 真实 React 组件；设计稿中的示例数据和评审工具条不进入产品；界面文案来自真实状态。
- 布局计算放在可单元测试的纯函数中（`src/lib/planning/worldline-layout.ts`），不依赖 DOM。React 组件只负责渲染和事件处理。
- 以下都是界面状态，不写入作品，也不产生版本：展开/折叠、目录开关、缩放、选中项、搜索词、类型筛选。

## 2. 数据模型（`src/lib/planning/domain.ts`）[M6、S14]

`eventSchema` 新增两个字段。都有默认值，旧作品不需要迁移：

```ts
export const EVENT_CATEGORIES = ["冲突","谋划","揭示","关系","成长","变故","其他"] as const;
category: z.enum(EVENT_CATEGORIES).default("其他").describe("事件类型，决定颜色"),
importance: z.number().int().min(1).max(3).default(1).describe("重要程度：1 一般 / 2 重要 / 3 关键，决定圆点大小"),
```

- 字段写在 `eventSchema` 中，因此 `planningSchema.parse`、历史快照、AI 规划工具的 put、分叉冻结副本（`worldline.fork.events`）和导入发布都会自动带上。
- `forkChanged` 按字段逐一比较事实、标题、时间、时长和角色变化，不比较新字段。所以只改颜色或重要度时，不会提示“源事实已有变化”。WU-03 覆盖这一点。
- **事件编辑器**（`renderEventEditor`，`PlanningWorkspace.tsx:1504`）新增“类型”和“重要度”两项。类型用 `Select`，7 个选项前各有一个色点；重要度用三段 `Tabs`（一般 / 重要 / 关键）。冻结前史的事件中，这两项和其它字段一样只读。事件详情对话框（`:3529`）的时间行后显示“类型 · 重要度”。[M6]
- `planning-tools.ts` 的工具说明补充这两个字段的含义。put 不带这两个字段时，保留原值；这与现有的合并规则（`applyPlanningOperations` 以 `{...list[at], ...entity}` 为准）一致。
- **差异与哈希检查** [S14]：已用 grep 核查 chronology 工作树。规划服务（`src/lib/services/planning.ts`）中，`syncProjection` 只按卷和章节同步，不对 `data.events` 做哈希或全量比较。`desktop/service/novel-import-world-repair.ts:21` 的 `worldRepairHash` 只用于世界观设定行（`rows.worlds`），与规划事件无关。旧文档解析后补上默认值，第一次保存时每个事件会多出两个键。这只是普通的版本保存，不会触发冲突，WU-01 验证保存后读回不变。

## 3. 导入（第 17 步世界线提取）[M1、S13]

| 位置 | 修改 |
|---|---|
| `desktop/core/novel-import-semantics.ts:57` `IMPORT_SEMANTIC_FACT_FIELDS.worldline` | 加入 `category`、`importance`。不加的话，strict 校验（`:232-233`）会拒收回复 |
| `novel-import-semantics.ts:264-270` worldline 校验分支 | 值域校验：`category` 必须是 7 个取值之一，`importance` 必须是 `"1"`/`"2"`/`"3"`。不合法时删掉这个字段，不拒收整个事件 |
| `desktop/service/novel-import-ai.ts:1439` `normalizeLinesReply` worldline 分支 | 先做规整：去掉首尾空白；`importance` 为数字时转成字符串；不合法的值删掉 |
| `desktop/core/novel-import.ts:308-322` 跨批合并 | `importance` 取较大值；`category` 保留先出现的值。两者都不产生冲突，也不进入 `WIZARD_REVIEW_STRUCTURAL` 或人工复核 |
| `desktop/shared/novel-import-field-labels.ts:6` | 增加中文标签：类型、重要程度 |
| `desktop/core/novel-import-ai-payload.ts:79` `referenceContract` 与 `:145` `wizardLinesContract` | 两处都写明：`category` 取 7 个值之一，`importance` 取 1–3，按事件在全书情节中的分量判断，拿不准时写 1 |
| `tests/fixtures/novel-import-prompt-golden.json` | 按新的提示文本更新 |
| `desktop/service/novel-import-publish.ts:168` | 发布前把 facts 中的字符串转成 `category` 和整数 `importance`，再交给 `eventSchema.parse`；值不合法时用默认值，不能抛错。续写拆分出的 `-part-N` 片段沿用原事件的值 |

- 已导入的作品（包括《诡秘之主》）没有这两个值，显示为“其他 / 一般”。
- **导入性能** [S13]：第 17 步每个事件多输出两个字段，提示词前缀也变了，缓存会失效。按 120 秒的世界线 + 叙事驱动重新测基线，只看第一次运行（记忆：重复运行会抬高缓存命中率）。结果记入 docs/584 的验收记录。

## 4. 历法与时间基准 [M8]

所有年、月、日都通过一个 `CalendarAdapter` 从当前历法取得（新增在 `worldline-layout.ts` 中，由 `activeWorld.calendar` 和当前时间基准构造）。布局函数只调用适配器，不写死 360 天或 30 天。

| 历法 | 年 / 月边界 | 断轴阈值的单位 | 短时间（目录） | 刻度 |
|---|---|---|---|---|
| gregorian + 纪元 | `era-calendar.ts` 的 `civilFromDays`，真实月界 | 30 天 = 720 小时 | `M-DD` | 纪元徽章、年徽章、月刻度 |
| gregorian 无纪元 | `Date` 公历（现有 `formatTime`） | 720 小时 | `M-DD` | 年、月 |
| fixed | `hoursPerDay`、`daysPerMonth`、`monthsPerYear` 都有时按其计算；`hoursPerDay` 为 null 时只有小时 | 有日长时为 30 日，否则 720 小时 | 有月时为 `M-DD`，否则 `formatTime` 的短格式 | 有年时显示年徽章，有月时显示月刻度；都没有时只按 `timelineTicks` 的数值刻度 |
| years | 单位就是年 | 30 天 ÷ 365.2425 年 | `formatTime` 的值 | 只有数值刻度，没有年徽章、月刻度 |

- 卡片、目录、时间带标签、搜索中的“时间说明”，统一使用 `formatTime(value, calendar, span, precision)`，以及 chronology 已提供的 `eraLabel`。`precision: 'era'` 的事件显示纪元名（如“第四纪”）；时间带上画在该纪元区间的位置，标签只显示纪元名。
- **时间基准**：切换后，所有标签和刻度都按 `timeBaseValue` 转换后的值重新计算（现有逻辑在 `:2327-2340`）。分段和排布用世界线自身的小时值，不重排。
- **视窗函数**：首次进入和“复位”使用 `fitDenseTimelineWindow`（与 chronology 一致）；时期下拉的“全部时期（全貌）”使用 `fitTimelineWindow`。

## 5. 布局模型（`src/lib/planning/worldline-layout.ts`）[M2、M3、S12]

### 5.1 事件表高度模型（不依赖 DOM）[M3、S12]

`tableLayout(tree, heights, zoom, adapter)` 返回每张卡片的 `top`、每段的范围、每个断轴的位置，以及总高度。
- 收起卡片 34px，间距 6px；分组框上下各加 10px，子事件缩进 18px；断轴 46px。
- 展开卡片和展开分组框使用 `heights[id]`（实测值，由 `ResizeObserver` 写入，每帧最多合并更新一次）；还没有测到时，按正文字数估算。
- `zoom`（1–4）：相邻两个根事件之间额外加 `min(240, Δ天 × 6 × (zoom−1))` px。
- 时间带圆点、引线、目录定位、滚动同步、搜索跳转、时期定位、吸顶年份、Ctrl + 滚轮的锚点，全部使用这个模型给出的位置，不读 DOM。
- **虚拟化**：只有一个条件，即卡片总数 > 300 时启用。只渲染视口上下各 1 屏内的卡片和时间带元素，其余位置由模型给出。《诡秘之主》（885 个）会启用虚拟化，性能测试在启用虚拟化的状态下进行。

### 5.2 时间线排布与原点 [M2]

`packFamilies(families, prev, { base, scale, pinned })`：
- 坐标 `x = (start − base) × scale`。`base` 是平移层的原点。
- **重定原点**：每次平移结束（以及每帧检查），只要 `|windowStart − base| × scale > 10⁶ px`，就令 `base = windowStart`，所有家族重新计算 x，y 保持原位。这样坐标的绝对值始终 < 10⁶ + 7 × 视窗宽度。小地图跳转、目录定位、搜索跳转都属于平移，同样执行这条规则。
- 只构建视窗前后各 3 个视窗宽度范围内的家族；平移超出这个范围时增量构建，已放置的家族 y 不变。
- 首次排布：按开始时间放到最高的空位，记录原位 y。展开或收起后，被点击的家族固定不动，其它家族回到原位，只有相撞时才下移；收起后回到原位。
- 只有缩放比例或面板宽度变化时才全量重排。

### 5.3 其它纯函数

| 函数 | 作用 |
|---|---|
| `eventTree(events)` | 整棵树，同层按开始时间排序；待定位事件单独列出；父事件不存在的子事件提到根层 |
| `familyEnd(e, tree)` | 父事件和所有后代中最晚的结束时刻 |
| `railSegments(roots, adapter)` | 相邻根事件间隔同时大于“30 天”（见 §4）和中位间隔的 20 倍时断开 |
| `railMarks(layout, segments, adapter)` | 段内严格按比例算圆点 y；4px 内合并为簇点；标签间距 < 18px 时省略；年份徽章、月刻度、时期竖条 |
| `minimapModel(roots, width, adapter)` | 分段规则同时间带，每段宽度按事件数分配；`toX` / `toT` 互为反函数 |
| `matchEvent(e, terms, ctx)` | 多个关键字须全部出现在标题、正文、角色名、类型名、`time.label` 或格式化后的时间中；英文不区分大小写 [S7] |
| `dimmedBy(e, filter)` | 被类型筛选隐藏，或搜索没有命中 → 淡化。两者是“或”的关系 [M7] |

`timeline.ts` 中的 `layoutTimelineCards` 保留，继续用于角色变化泳道。

## 6. 子事件层级 [M4]

577 §3 和 §13 规定，两个视图都显示整棵树；时间线用标题栏加框体表示父子关系。现有的“分层进入”模型改动如下：

| 现有代码 | 处理 |
|---|---|
| `eventParent` 状态、面包屑（`:2504-2525`） | **移除**。两个视图始终显示整棵树。原先“进入子层”的需求，由目录中的折叠和定位代替 |
| 菜单项“展开子事件”（`:2007`）、卡片按钮“展开 N 件子事件 ›”（`:2089`） | 菜单项改为“定位子事件”，它会展开这个家族（取消折叠），并定位到第一个子事件。卡片按钮被收起卡片上的 `▸ N` 和父事件标题行的折叠按钮 ▾ 取代 |
| 按层记忆视窗 `worldViews`/`fittedViews`（`:398-418`、`:2222`） | 改为按世界线记忆一个视窗（键为 `worldId`） |
| `refinementRange` 限制子层视窗（`:215-223`） | 视窗不再限制。函数本身保留，编辑器仍用它校验子事件时间是否落在父事件范围内 |
| “当前层 · N 件事件”（`:2728`） | 改为“N 件事件”。时间线视图中，目录头另外显示“视窗内 N 件” |
| “＋ 事件”新建时 `parent: eventParent`（`:2536`） | 默认新建根事件。选中某张卡片时，“＋ 事件”旁出现下拉项“在『…』下新建子事件”；父事件卡片的「…」菜单中加入“新建子事件” |
| `navigateWorldParent(next)` | 只保留切换世界线的功能，改名为 `switchWorld` |

## 7. 组件与渲染路径 [M5、M7、S1–S11]

### 7.1 组件

世界线部分拆进 `src/components/content/planning/worldline/`。保存、对话框、草稿等逻辑仍在 `PlanningWorkspace` 中，不改动。

| 文件 | 内容 |
|---|---|
| `WorldlineHeader.tsx` | 面板标题栏，只在 `mode==="world"` 时替换原头部 [S9]：`h2` 世界线；右侧依次是保存状态、版本 `Badge`、ghost 按钮“撤销上次规划修改”。保存状态来自现有的 `busy`/`message`/`query.isFetching`（保存中 / 已保存 / 保存失败），不引入 `use-autosave` |
| `WorldlineToolbar.tsx` | 目录开关；世界线 `Select`；视图 `Tabs`；时期选择 `DropdownMenu`（定位后让色带或竖条闪烁，并提示“已定位到时期「…」· N 件事件”）[S4]；全部展开/收起；缩放（− 值 ＋ 复位）；搜索 `Input`；待定位；延续事件；“更多” `DropdownMenu`；“＋ 事件”。窄窗口规则：≤1280px 时隐藏“复位”、⌘F 提示和计数为 0 的延续事件；≤1160px 时，时期、全部展开、待定位只显示图标和数字；搜索框最小 120px；始终单行 [S8] |
| `WorldlineLegend.tsx` | 状态行：时间范围、事件数；类型图例（7 类，各带计数；单击隐藏/显示，双击只看这一类）；重要度大小说明。隐藏的类型在图例中用空心圆点加删除线表示，不只靠颜色区分 [M7、S10] |
| `EventTree.tsx` | 左侧事件目录，`role="tree"`，两个视图共用：年份分隔、视窗内标记、当前行跟随；支持 ↑↓←→ 和 Enter [S10] |
| `EventCard.tsx`（`memo`） | 收起态：圆点、标题（溢出时淡出）、头像叠层、子事件数。展开态：复用现有 `eventCard()` 的内容（菜单、时间行、`MarkdownPreview`、人物、角色变化、引用）。props 只有 `event`、`expanded`、`selected`、`hit`、`dimmed`、`calendar`、`timeBase` 和稳定回调，不包含 `windowRange` [M5] |
| `EventTable.tsx` | 时间带（SVG 引线、圆点、标签、刻度、年份徽章、时期竖条、断轴、吸顶年份）和分组卡片列；Ctrl + 滚轮缩放；虚拟化 |
| `EventTimeline.tsx` | 刻度尺、时期色带（可拖动改时间，沿用 `:2930-2963`）[S4]、`#plane` 平移层（父事件标题栏和框体、卡片、角色变化泳道 [S3]）、小地图 |
| `worldline.module.css` | 只使用 `globals.css` 中的主题变量 |

**类型色** [S11]：`globals.css` 中，`:root, .paper` 和 `.ink` 下各定义 7 个变量 `--event-conflict` … `--event-other`，取值沿用设计稿 v9（亮色和深色各一套）。枚举值到变量名的映射只放在 `worldline-layout.ts` 的 `CATEGORY_VAR` 一处，组件中不出现颜色值。亮色主题下，类型色文字与背景的对比度实测须 ≥ 4.5:1，不达标时只调亮色主题那套变量。

### 7.2 平移帧不经过 React 状态 [M5]

- `EventTimeline` 内部用 `useRef` 保存 `{start, span, base}`。pointermove、方向键、Shift + 滚轮、横向滚轮（沿用 `:330-356`）、小地图拖动时，只做三件事 [S5]：
  1. 写 `#plane.style.transform`；
  2. 在 `requestAnimationFrame` 中重画刻度尺、时期色带和小地图方框（子组件局部 state）；
  3. 每 100ms 节流更新一次目录的“视窗内”标记。
- 停止拖动或空闲 150ms 后，才把 `start` 同步回 `PlanningWorkspace` 的 `windowRange`，供保存视窗、时期定位等使用。
- 删除 `windowRange.y` 这个纵向偏移（`:2977`、`:3004`、`:3097`）。纵向只用原生滚动，并用 spacer 保证滚动位置不被浏览器截断。
- 取消平移（Esc、失焦，`:2120-2128`、`:2836`）：恢复拖动开始时 ref 中保存的 `start`，再写回 transform。
- 拖动改时间（`startTimeDrag`/`finishTimeDrag`）：预览期间，被拖的家族只改自己的 `translateX`，不全量重排；松开后保存，再按 §5.2 对该家族重新放置。

### 7.3 点击、双击与拖动 [S1]

- 单击卡片延迟 220ms 执行展开切换。在这期间如果发生 dblclick，就取消这次切换并进入原位编辑。编辑中的卡片强制展开。
- 按下标题后拖动超过 5px（与 `finishTimeDrag` 的阈值相同）时，视为拖动改时间；松开后不触发展开切换。

### 7.4 保留的现有交互

分叉冻结（不能拖动、编辑、删除）；时间基准切换；角色变化泳道和“视窗末端角色状态”折叠区（`:3148`）[S3]；“时期与连接列表”折叠区（`:3166`）和“查看时期”对话框 [S4]；待定位 / 延续事件弹层；时期对话框；↑↓ 纵向滚动 [S5]。底部的“查看事件详情”按钮（`:3138`）移除，因为卡片展开后已显示全部内容，「…」菜单中仍有“详情”[S5]。

### 7.5 定位、深链接与快捷键 [S2、S6]

- 目录、搜索、时间带圆点、待定位按钮、`panelFocus` 深链接，共用一个 `locateEvent(id)`：展开祖先，选中，按当前视图滚动或平移，然后闪烁。`panelFocus` 的 effect（`:269-325`）改为调用 `locateEvent`，并在首次视窗适配（`:398-418`）之后执行：首次适配完成时设置一个标志，`locateEvent` 等到这个标志后再运行，所以不会被首次适配覆盖。
- **Ctrl/⌘ + F** [S2]：原生“编辑”菜单的 `md.find` 已经绑定这个快捷键（`desktop/shared/commands.json:544-551`）。方案是在桌面命令注册表中新增命令 `worldline.search`，作用域为世界线面板，默认按键 `CmdOrCtrl+F`。这样它会遵守快捷键设置的规则（录制真实按键、允许多个绑定、冲突原子转移）。世界线面板获得焦点时，作用域过滤（`DesktopCommandController.tsx:51`）让这个命令优先于 `md.find`；焦点在编辑器中时，仍由 `md.find` 处理。真实 Electron 中验证两者的先后顺序。
- 搜索框的 Enter 先判断 `event.nativeEvent.isComposing`，输入法组字时不跳转 [S2]。
- **正文高亮** [S7]：`MarkdownPreview` 渲染完成后，用 `TreeWalker` 遍历文本节点，把命中的关键字包进 `<mark>`；不改 Markdown 源文本。搜索词变化时先移除旧的 `<mark>`，再重新包。

### 7.6 动效与可访问性 [S10]

- 小地图：`role="slider"`，带 `aria-valuemin`、`aria-valuemax`、`aria-valuenow`（视窗起点）和 `aria-valuetext`（格式化后的时间）。
- 时间点：`aria-label` = 标题 + 时间 + 重要度。卡片：`aria-expanded`。
- `prefers-reduced-motion: reduce` 时，关闭这些动效：闪烁、“关键”事件的扩散光环、180ms 下移过渡、平滑滚动（沿用 `globals.css:967` 的做法）。

## 8. 性能

目标（《诡秘之主》885 个事件，真实应用，事件表已启用虚拟化）：
- 事件表首次渲染 < 500ms；展开一张卡片到重排完成 < 100ms。
- 时间线拖动时每帧 < 16ms，不出现超过 50ms 的长任务；拖动过程中 `PlanningWorkspace` 的渲染次数为 0（用 React Profiler 计数）。

措施：收起状态不渲染 `MarkdownPreview`；`EventCard` 用 `memo`，props 保持稳定；事件表按 §5.1 虚拟化；平移按 §7.2 处理。

## 9. 测试与验收（详细用例见 docs/581）[M9]

- **单元测试**：`worldline-layout.ts` 中的每个函数。包括设计稿中发现的问题：拖动时卡片不移位，展开只影响下方，**同一缩放下跳到远古再跳回**，原点重定，搜索多关键字，小地图 `toX`/`toT` 互逆。历法适配器覆盖 4 种历法和时间基准。
- **导入**：语义白名单、值域校验、规整、跨批合并、发布转换、提示词 golden。
- **浏览器测试**：沿用 `planning-card-menu.test.ts` 的方式，使用真实的 `WorldlinePanel` 和内存接口数据。内容见 docs/581 §3。家族标题栏、分组框、待定位切换只能由这些固定数据覆盖（见下）。
- **真实目标系统**：
  1. 把 `~/shakeink-test-roots/cache-522` 复制到新的隔离根 `~/shakeink-test-roots/worldline-ui-583`。复制时把 inbox 中的 lease 回执移出（参见记忆），并确认 `state.json` 存在。
  2. **旧作品**：不重新导入，直接打开根中已有的、导入后保存过的作品。两个视图都应显示“其他 / 一般”。编辑一个事件的类型和重要度并保存，然后读回。
  3. **新导入**：使用 LotmVerification.app，新开会话，只选第一卷“小丑”，目标为“角色 + 世界线”。保存后检查类型和重要度有值的比例、头像，并复测 docs/581 §5 中列出的用例和性能。
  4. 证据写入 `~/shakeink-test-roots/worldline-ui-583/evidence/<label>/`，不进入仓库，不包含原文和 Key。
- **台账**：在 `docs/requirements-traceability.json` 中追加 WU 系列需求，写明对应的模块、测试编号和状态。只能追加，不能 checkout 这个文件（参见记忆：这个文件常有未提交的条目）。《诡秘之主》第一卷的导入结果中没有父子层级，也没有待定位事件，所以这些项的真实数据验证状态如实标为“真实数据未覆盖，仅固定数据浏览器测试”。不能用一次启动冒烟测试覆盖整组功能。

## 10. 风险

| 风险 | 处理 |
|---|---|
| `fix/worldline-chronology` 复审尚未通过 | 实现从它的提交开始；复审通过前不合并界面改版 |
| 拆分组件时破坏现有交互 | 先补齐现有交互的浏览器测试（拖动改时间、双击编辑、菜单、分叉冻结、时间基准），再拆分 |
| 885 个事件下时间带重算过慢 | 时间带只依赖 §5.1 的高度模型；只有实测高度变化时才重算受影响的段 |
| 导入模型对类型、重要度的判断不稳定 | 字段可选，不合法的值丢弃；用户可以在编辑器中修改 |
| Ctrl/⌘ + F 与原生菜单冲突 | 接入桌面命令注册表，并在真实 Electron 中验证 |

## 11. 审核意见处理表

| 编号 | 处理位置 |
|---|---|
| M1 导入契约 | §3 |
| M2 远古坐标 | §5.2（重定原点）、§9（跳到远古再跳回） |
| M3 虚拟化与时间带 | §5.1 |
| M4 层级模型 | §6 |
| M5 平移渲染路径 | §7.1（EventCard props）、§7.2 |
| M6 编辑器字段 | §2 |
| M7 图例 | §5.3 `dimmedBy`、§7.1 `WorldlineLegend` |
| M8 历法退化 | §4 |
| M9 台账与旧作品 | §9 |
| S1 | §7.3 |
| S2 | §7.5 |
| S3 | §7.1 `EventTimeline`、§7.4 |
| S4 | §7.1 `WorldlineToolbar`、`EventTimeline`，§7.4 |
| S5 | §7.2、§7.4 |
| S6 | §7.5 |
| S7 | §5.3 `matchEvent`、§7.5 |
| S8 | §7.1 `WorldlineToolbar` |
| S9 | §1、§7.1 `WorldlineHeader` |
| S10 | §7.1 `WorldlineLegend`/`EventTree`、§7.6 |
| S11 | §7.1 类型色 |
| S12 | §5.1 |
| S13 | §3 |
| S14 | §2 |
