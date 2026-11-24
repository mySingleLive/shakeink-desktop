# 599 · 世界线事件卡片编辑形态 技术方案与测试用例

来源：用户 2026-11-22 修改要求，UI/UX 设计稿 `design/worldline-card-edit/index.html` 经 10 轮审核，用户“UI/UX 设计通过，可以继续”。调研与需求编号（R1–R18）见 `docs/599-worldline-card-edit-research.md`。基于 `1df2411`。

## 0 需求汇总

| # | 内容（详见调研文档对应小节） |
|---|---|
| R1–R3 | 编辑形态 = 展开形态的同一张卡，同布局同文字，各信息原位可改（事件表、时间线） |
| R4 | 进入编辑的瞬间卡片尺寸不变 |
| R5–R7 | 添加角色“＋”在最后一个角色后；按钮文案“保存”；最后一条角色转变行尾“新增角色转变”图标 |
| R8 | 编辑中点击卡片外部 = 取消编辑（丢弃草稿） |
| R9 / R10 | 展开形态角色胶囊点击打开角色详情；编辑形态点击弹出可搜索列表并原位替换 |
| 第 4–6 轮 | 时间浮层：开始 / 结束两问 + 一句话填空 + 预览；可拖动时间轴；主题化数字步进框 |
| R13–R15 | 父子事件卡片同一编辑形态；每张卡“新建子事件”图标；删光子事件自动变回普通事件 |
| R16 | 新建子事件未修改就取消（取消 / Esc / 点外部）→ 删除该子事件 |
| R17 | 任何卡片编辑中 Esc = 取消并退出编辑（有浮层时先关浮层） |
| R18 | 非编辑状态角色胶囊悬停 400ms 弹出角色简介悬浮框 |
| C1 | docs/577–598 已通过功能不变；界面状态不写入作品；平移 / 缩放帧不渲染 PlanningWorkspace（WU-56c 等） |

## 1 总体结构

### 1.1 现状

- `EventCard.tsx:245-246` 编辑时把卡身换成 `EventEditorSlot` → `PlanningWorkspace.renderEventEditor()`（`:1624-2063`），一个独立的 `.card.editor.worldEventEditor` 表单盒子。
- 草稿 `eventDraft` 与 `endTimeMode / startUnit / durationUnit` 在 PlanningWorkspace（`:156-158`）。`ctx.hasDraft` 禁用其他卡片的编辑类菜单。
- 新建子事件 / 被筛选隐藏的草稿在视图上方裸渲染编辑器（`:2754-2756`）。

### 1.2 目标

新增组件 `src/components/content/planning/worldline/EventCardEditor.tsx`，渲染编辑形态卡身（与 `EventCard` 展开卡身 `.body` 同结构、同 class）。EventCard 在 `editing` 时：

- 头部标题 `h3` 内换成 `textarea`（同字号），其余头部元素不变，新增“新建子事件”按钮（展开与编辑都在）。
- 卡身渲染 `<EventEditorSlot />`，Slot 改为渲染 `EventCardEditor`（通过 `EventEditorContext` 提供 draft 与回调，见 §2）。
- 卡片根加 `data-editing` 与 `.editing`（类型色边框）。

`renderEventEditor()` 删除；视图上方的“裸编辑器”改为渲染一张独立的 `EventCard`（`editing`、宽 420px，`variant` 随当前视图），即同一编辑形态。

PlanningWorkspace / planning.module.css 属于“reuse”文件（`docs/reuse-manifest.json:1026`），本仓库已多次按 docs/577–598 修改，此次照例记录在台账；manifest 的 sha 字段只由 `scripts/import-web-baseline.py` 使用，不做运行时校验。

## 2 草稿状态与上下文

- 草稿仍是 PlanningWorkspace 的 `eventDraft`（保存、校验、`ctx.hasDraft` 规则不变）。新增：
  - `draftBase: PlanningEvent | null`：进入编辑时的快照，用于“是否修改过”（R16）与取消。
  - `freshChild: { id: string; version: number } | null`：本次“新建子事件”创建的事件 id 与创建后的作品版本（R16）。
  - 保留 `endTimeMode / startUnit / durationUnit`；进入编辑时按 §4.4 规则初始化单位。
- `EventEditorContext` 的值从 `() => ReactNode` 改为对象（`useMemo`，只有编辑中的卡片订阅，docs/580 §7.1 P3 不变）：

```ts
interface EventEditorValue {
  draft: PlanningEvent;
  setDraft(update: (d: PlanningEvent) => PlanningEvent): void;
  units: { start: number; duration: number; endMode: boolean; set(p: Partial<{ start: number; duration: number; endMode: boolean }>): void };
  message: string;           // 校验 / 保存失败提示，显示在保存条
  busy: boolean;             // 保存中：保存按钮禁用
  anchors: readonly { id: string; title: string }[];  // 同线其他事件（时间参考）
  calendar: Calendar; adapter: CalendarAdapter;
  onSave(): void; onCancel(): void;
}
```

- 保存：沿用现 `:2039-2056` 校验与文案（“请填写事件名称。”等），成功后 `setEventDraft(null)`、`revealEvent`，清 `draftBase / freshChild`。
- 编辑中的卡片总是展开（现规则）；时间线 ⌄ 在编辑中 `disabled`。

## 3 卡身各元素（`EventCardEditor.tsx`，样式在 `worldline.module.css`，前缀 `.ed*`）

尺寸规则（R4）：每个可编辑盒子用负外边距抵消自身内边距、行高沿用展开形态；×、行尾按钮、浮层、保存条全部绝对定位，不占布局。

| 元素 | 实现 | 可访问名 |
|---|---|---|
| 标题 | 头部 `h3` 内 `textarea rows=1`，`field-sizing: content`，`font: inherit`；Enter 不换行（`preventDefault`），粘贴去换行 | `事件标题` |
| 类型 | `.tag` 同胶囊 + 9px ⌄，`button aria-haspopup="listbox"`；浮层 7 项（色点 + 名，当前项 ✓） | 按钮 `事件类型`，浮层 `role=listbox` |
| 时间 | `.when` 同文字（`timeText(draft)` 实时）+ 点状下划线，`button aria-haspopup="dialog"`；浮层见 §4 | 按钮 `事件时间` |
| 重要度 | 文字 + ⌄；浮层三项 `role=radio`（`一般/重要/关键`，现用例 `getByRole("radio", { name: "关键" })` 继续可用） | 浮层 `role=radiogroup` `重要程度` |
| 元信息“＋” | 只在缺角色 / 缺角色转变 / 缺正文时显示（18px）；菜单：参与角色（搜索 + 列表）、＋ 角色转变、＋ 正文 | `添加` |
| 正文 | 平时 `MarkdownPreview`（同 `.fact`）外包 `role=textbox tabIndex=0`；点击 / Enter 换成段落编辑器（§3.1）；失焦恢复预览 | `事实正文` |
| 角色胶囊 | 同 `.who`；点击弹出可搜索列表，选择后 `people[i] = id`（当前项 ✓，已参与项禁用“已参与”）；右上角 × 移除；末尾 24px 虚线“＋”胶囊 | `更换角色 {名}`、`移除{名}`、`添加参与角色` |
| 角色转变 | 同 `.change` 行：角色名按钮（列表换角色）、`input` 维度 / 变化前 / 变化后（`field-sizing: content`，18px 行高）；行尾悬浮“开始时/结束时 ⇄”“×”；最后一行行尾 20px“＋” | `变化角色`、`维度`、`变化前`、`变化后`、`生效时机`、`移除角色转变`、`新增角色转变` |
| 叙事引用 | 不变，编辑中禁用（现规则） | — |
| 保存条 | 卡片右下外侧 `position:absolute; top:calc(100% + 6px)`；校验提示（`role=alert`）+“取消”“保存” | `取消`、`保存` |

### 3.1 正文段落编辑器

两种做法比较：

| | contenteditable 段落块 | 每段一个自动增高 textarea |
|---|---|---|
| 段距 8px、尺寸不变 | 是（`<p>` margin） | 是（块间 gap 8px） |
| 跨段选择、Shift+方向键 | 原生支持 | 不能跨框选择 |
| 粘贴 | 需拦截 `paste` 只插纯文本、按空行拆段 | 原生纯文本；含空行需拆段 |
| IME、撤销 | 原生（`insertText` 进撤销栈） | 原生，但撤销只在单框内 |
| docs/598 复制粘贴快捷键 | `textContextSourceAt` 已支持 `[contenteditable="true"]`（`text-context-selection.ts:10`），`commandScope` 识别为 `input`（`command-scope.ts:10`） | 已支持 textarea |
| 回车分段 / 退格合段 | 原生（`defaultParagraphSeparator=p`） | 要自写焦点移动 |

选 **contenteditable**：`<div contenteditable="true" role="textbox" aria-multiline="true" aria-label="事实正文">`，每段一个 `<p>`，内容是该段 Markdown 源码。规则：

- 进入时把 `fact.split(/\n{2,}/)` 渲染为 `<p>`；空正文渲染一个空 `<p>` 并显示占位“客观发生的事实”（CSS `::before`）。
- `input` 事件：`fact = [...root.children].map(p => p.innerText.replace(/\n$/, "")).join("\n\n")`（段内 Shift+Enter 产生的单换行保留）。受控只在进入时写 DOM，输入期间不重渲染内容（避免光标跳动）；`setDraft` 只更新数据。
- `paste`：`preventDefault`，取 `text/plain`，按 `\n{2,}` 拆段，用 `document.execCommand("insertText")` 插入首段、`insertParagraph` 分隔（保留撤销栈）。
- `drop` 只接受纯文本；禁止 `beforeinput` 的 `formatBold` 等格式化（Cmd+B 不加 `<b>`）。
- 失焦：恢复 `MarkdownPreview`。

## 4 时间浮层（`EventTimePicker.tsx`）

### 4.1 结构

预览（`timeText(draft)` + 可拖动时间轴 §4.3）→ 开始（四选一 + 一句话）→ 结束（仅开始为“确定”时）→ “完成”。修改即时写入草稿。

### 4.2 控件 ↔ 字段（与现 `renderEventEditor` `:1694-1886` 同一套写法，只换容器）

| 控件 | 写入 | 现代码对应 |
|---|---|---|
| 开始 确定 / 只知道哪天 / 某段时间内 / 未定（`role=radiogroup` `开始时间类型`） | `time.kind` exact / window+`label="仅同日"`+`precision="day"` / window / unknown；`end` 同现规则 | `:1702-1718` |
| 参考（`select` `时间参考`，首项显示 `calendar.epoch`，缺省“故事开始”） | `time.anchor` | `:1733-1748`，原首项“本线零点” |
| 开始 / 结束（`select` `参考边界`，有参考时） | `time.boundary` | `:1749-1766` |
| 前 / 后（`button` `之前或之后`）+ 数值（`开始时间偏移`，非负）+ 单位（`开始时间单位`） | `time.value = sign × |v| × unit`；切换前后翻转 `value` 与 `end` 的符号 | `:1767-1791` |
| 至 [止]（`窗口结束`） | `time.end = sign × |v| × unit` | `:1792-1804`（原为小时数，无单位） |
| 结束 瞬间 / 持续一段时间 / 未定（`role=radiogroup` `事件持续类型`） | `duration` 0 / `d.duration || 1` / null，`ongoing=false` | `:1805-1837` |
| 持续 [数值]（`事件时长`）[单位]（`持续时间单位`）·“改填结束时间” | `duration = v × durationUnit` | `:1857-1886` |
| 到 … [数值]（`结束时间点`）·“改填时长” | `endTimeMode=true`，`duration = sign×v×startUnit − value` | `:1838-1855` |
| 至今仍在持续（checkbox） | `ongoing` true/false（`duration=null`） | `:1823` |

`updateTime` 的“结束时间模式下改开始，保持结束不动”规则（`:1638-1649`）保留。窗口结束现在随开始单位换算（原来是裸小时数），属行为修正，用例 TP-03 覆盖。

### 4.3 可拖动时间轴

- 纯函数放 `src/lib/planning/event-time-strip.ts`：
  - `stripEnds(draft, data)` → `{ a, b, kind }`（相对锚点的值，与 `time.value` 同坐标；不解析锚点，拖动只改相对值）。
  - `fitStrip(a, b, kind)` → 可见范围 `[lo, hi]`（左 30% 留白，右 60% / 未定与持续中 110%）。
  - `stripStep(range, calendar, kind)`：候选步长 = 1 小时、1 天（`hoursPerDay`）、1 月（`hoursPerDay × daysPerMonth`）、1 年（再 × `monthsPerYear`）；`years` 历法只有年（单位 1）；取 ≤ 范围/30 的最大值；“只知道哪天”固定 1 天。无 `hoursPerDay` 的历法只有小时。
  - `moveStrip(handle, origin, dh, step, kind)` → 新 `{ value, end, duration }`；开始点不越过结束点，结束点不越过开始点；整体平移保持长度。
  - `wholeUnit(value, units)` → 能整数表示的最大单位（拖完换单位）。
- 组件：`pointerdown` 在圆点 / 线段上 `setPointerCapture`，记录起点与范围；`pointermove` 按 `dx / stripWidth × (hi − lo)` 换算（`stripWidth` 读 `getBoundingClientRect().width`，时间线 `.cardZoom` 的 `zoom` 已体现在里面）；`pointerup` 吞掉随后的 click（防止“点外部取消”）。范围在打开浮层、切换类型、或值超出范围时重算，拖动中不变。
- 圆点 `role=slider`、`aria-valuetext` 为 `adapter.label` 文本，← → 一步、Shift 十步。可访问名：`开始时间 / 结束时间 / 发生时间 / 时间窗口开始 / 时间窗口结束`。
- 标签：两端范围值、拖动中被拖点的值，用 `adapter.label(value, step, precision)`。

### 4.4 数字步进框（`NumberStepper`，同文件）

`<span class="stepper"><input type="number" inputMode="decimal"/><span aria-hidden>▴▾</span></span>`；隐藏 `::-webkit-inner-spin-button`；输入框右内边距 22px；按钮 `tabIndex=-1`，按下 400ms 后每 60ms 重复，`pointerup / pointercancel / blur` 停；↑↓ 键（Shift 十）；`min` 时 ▾ 禁用。可访问名在 input 上，现用例 `getByLabel("开始时间偏移")` 不变。

进入编辑时单位：开始单位 = `wholeUnit(|value|)`，时长单位 = `wholeUnit(duration)`（原来恒为 1 小时）。

## 5 取消：按钮 / Esc / 点击外部（R8、R16、R17）

### 5.1 统一入口 `cancelEventEdit()`（PlanningWorkspace）

1. 若 `freshChild?.id === eventDraft.id` 且 `deepEqual(eventDraft, draftBase)` 且作品版本仍为 `freshChild.version`：`save([], { action: "restore", snapshotId: 新建前快照 id })`——撤销那次新建，历史不留“新建 + 删除”。版本已变（例如对话区 AI 同时改了规划）则改用 `save([{ kind: "delete", collection: "events", id }])`。
2. 否则只 `setEventDraft(null)`。
3. 清 `draftBase / freshChild / message`；浮层关闭。

`deepEqual` 用结构比较（`JSON.stringify` 对 zod 解析后的同形对象稳定）；改了再改回视为未修改。

### 5.2 点击外部

改写 `PlanningWorkspace.tsx:327-347` 的全局监听：`pointerdown`（捕获）记录按下是否在“编辑卡片区域”内；`click`（捕获）在按下与松开都在外部时调用 `cancelEventEdit()`。“编辑卡片区域” = `[data-event-card][data-editing]` 及其浮层（浮层都渲染在卡片 DOM 内，不用 portal）。不算外部：

- `[role="dialog"]` / `[role="alertdialog"]` 内（现规则，例如删除确认）；
- 拖动时间轴后的那次 click（被吞掉）；
- 文字拖选：按下在内、松开在外。

会取消：画布空白、其他卡片、工具栏、事件目录、对话区、标签栏。点击另一张卡片时：取消先在捕获阶段完成，之后卡片自己的 click / dblclick 照常执行（双击直接进入那张卡片的编辑；“请先保存或取消”提示只剩视图切换等少数入口）。

原注释“World events keep their draft while the canvas is inspected”与 docs/584 以来的保留草稿行为由 R8 取代。依赖它的现有用例见 §9。

### 5.3 Esc

- 浏览器夹具与 Web：编辑卡片根 `onKeyDown`：浮层打开 → 关浮层；否则 → `cancelEventEdit()`。焦点在卡片外（例如点了工具栏按钮）时由 PlanningWorkspace 的 `keydown` 监听处理（只在有草稿、无对话框时）。
- Electron：`setIgnoreMenuShortcuts(true)`（`desktop/main/index.ts:930`），按键先经 `DesktopCommandController.keydown`（捕获）。Esc 现有绑定：`ai.stop`（global）、`input.cancel`（input）、`md.selectionCancel`（markdown）。正文段落编辑器是 contenteditable，`commandScope` 判为 `input`，但 `installInputCommands` 只接管 input / textarea（`input-commands.ts:70`），所以不能靠 `input.cancel`。处理：
  - 新命令 `worldline.cancelEdit`（`desktop/shared/commands.json`，scope **global**，默认 Escape，group “世界线”，label “取消事件编辑”），重新生成 `command-catalogs.generated.json`。global 才能在 input / worldline 两种焦点范围都生效（`shortcutScopeEnables`，`desktop/core/shortcuts.ts:76-81`）。
  - PlanningWorkspace 的 `registerDesktopCommandTarget`（`:496-502`）加 `"worldline.cancelEdit": { enabled: () => !!eventDraftRef.current, run: escapeInEditor }`；`accepts` 仍是“目标在世界线面板内”，面板外按 Esc 不取消编辑。
  - 编辑卡片内的 textarea / input 不提供 `input.cancel` 动作，避免同键两条命令都 enabled 时 dispatcher 返回 `blocked`（`shortcut-dispatch.ts:34-39`）。
  - 对话框打开时 Controller 已提前返回（`DesktopCommandController.tsx:116`），Esc 归对话框。
  - 生成中 `ai.stop` 也 enabled，两条同时匹配 → `blocked`，Esc 两者都不执行。列为已知限制（§8），用户可改绑。
  - `escapeInEditor`：浮层打开 → 关浮层；否则 `cancelEventEdit()`。浏览器里卡片 `onKeyDown` 调同一函数；Controller 在 Electron 中 `preventDefault + stopImmediatePropagation`，不会触发两次。

## 6 父子事件（R13–R16）

### 6.1 “新建子事件”按钮

- EventCard 头部，时间线 ⌄ 与「…」之间，`button.btn24` + `lucide-react` `GitBranchPlus`（1.52.0 有），`aria-label="新建子事件"`；`disabled = readonly || frozen || hasDraft`（与菜单同规则；编辑中的卡片自身也禁用）。收起卡片上 55% 不透明、悬停 100%，占自己的位置。
- 宽度：`collapsedHeadChrome`（`worldline-layout.ts:1261-1271`）`parts` 加 `HEAD.addKid = 24`；`HEAD` 增字段。时间线收起卡宽、`collapsedTitleLines`、事件表 `tableCardInput` 走同一函数，自动一致。`tests/unit/worldline-layout.test.ts` 中按宽度断言的用例同步 +33px（24 + gap 9）。
- 点击 → `ctx.onMenu("newChild", id)`；菜单“新建子事件”同一路径。

### 6.2 新建流程（替换 `:2349-2350`）

```ts
async function createChild(parent: PlanningEvent) {
  const before = query.data!.version;
  const child = eventSchema.parse({ id: uid(), line: worldId, parent: parent.id, title: "未命名事件",
    time: { kind: "exact", anchor: parent.id, boundary: "start", value: 0 }, duration: 0 });
  if (!(await put("events", child))) return;           // 失败：提示沿用 save()，不进入编辑
  setFoldedEvents(v => { const n = new Set(v); n.delete(parent.id); return n; });
  setOpenCards(v => new Set(v).add(parent.id));
  revealEvent(child);
  setEventDraft(structuredClone(child)); setDraftBase(structuredClone(child));
  setFreshChild({ id: child.id, version: before + 1, undoTo: before });
  selectTitleOnMount.current = child.id;               // EventCard 标题 textarea 挂载后 focus + select
}
```

- `undoTo` 用于 §5.1 的 restore：取 `history` 中 `version === undoTo` 的快照 id（`planningUndoTarget` 同口径）。
- 时间线：新子事件进入编辑后，现有“编辑卡片露出”逻辑（`EventTimeline.tsx:586-608`）把它移进视图；保存条高度（34px）计入下边距 `m`。

### 6.3 删光子事件 → 普通事件

父子关系只由 `parent` 推导（`buildEventTree`），删除最后一个子事件后树里自然没有子节点。需要处理的界面状态：

- `foldedEvents` 里残留该父 id：删除成功后清掉（否则以后再加子事件会是折叠的）。
- 闪一下：删除成功后 `flashCard(root, parentId)`（`:2364` 现有函数）。
- 删除仍走现确认框；有子事件的事件不可删除的规则在 `applyPlanningOperations`（服务端校验，删除文案 `:3705`）不变；「…」→ 删除在 `childCount > 0` 时 `disabled` 并带 `title="先删除子事件"`。

## 7 角色胶囊（R9、R10、R18）

- 展开形态 `.who` 改为 `<button type="button" data-character-pill>`；`onClick` → `openEntityRef({ kind: "character", id, name }, novelId)`（`entity-refs.ts:78`）。EventCard 根 `onClick` 已跳过 button（`EventCard.tsx:166`）。`ctx` 增 `novelId`。
- 悬浮框：从 `EntityHoverCard.tsx` 导出 `CharacterHoverBody`（现 `EntityBody` 的角色分支 `:198-233`，不改内容）与延迟常量；新增 `useCharacterHover()`（同 400 / 200ms，`fixed` 定位、下方放不下翻到上方），数据 `useEntityIndex(novelId).hoverInfo("character", id)`——共享 `["characters", novelId]` 查询缓存。比较“给胶囊加 `.entity-ref` 并在面板根挂 `EntityHoverCard`”：后者会把对话区的设定 / 章节等分支也挂进来，且 `EntityHoverCard` 依赖 `containerRef` 的 mouseover 冒泡、与卡片 memo 无关，可行但带入不需要的范围；选导出组件。悬浮框渲染在 PlanningWorkspace 层（一个实例），卡片只在胶囊上派发 `onPointerEnter / Leave`（经 ctx 的稳定回调），不让每张卡片订阅悬浮状态（WU-56c 渲染次数约束）。
- 编辑形态胶囊不挂悬浮框，点击弹出换角色列表（§3）。

## 8 层级、滚动与已知限制

- 层级：卡片内浮层 `z-index 40` > 保存条 `31`（同一层叠上下文）。时间线 `.tcard:has([data-editing])` z 10（高于展开 5、悬停点 8、菜单 9）；事件表 `.slot:has([data-editing])` z 10。
- 事件表槽位绝对定位（`EventTable.tsx:155`），保存条会盖住下一张卡片的上沿，属设计预期。
- 时间线编辑露出（`EventTimeline.tsx:593-603`）：`r.bottom` 改为卡片底 + 保存条（40px）；小地图下边距规则不变（docs/596 P2-1）。
- 已知限制：
  1. Electron 中生成进行时按 Esc，`ai.stop` 与 `worldline.cancelEdit` 同时 enabled → dispatcher `blocked`，两者都不执行（§5.3）。
  2. 点击外部丢弃草稿不再确认（用户 2026-11-22 选择，调研文档 R8）。
  3. 正文编辑器是纯文本段落，不做 Markdown 高亮。

## 9 受影响的现有用例

| 文件:行 | 现依赖 | 改为 |
|---|---|---|
| 全部 `{ name: "保存事件" }`（约 20 处，`grep -n 保存事件 tests/browser`） | 按钮文案 | `"保存"`，`exact: true`；必要时限定在 `[data-editing]` 内 |
| `planning-worldline-editor.test.ts:34` | `getByLabel("事件类型").selectOption` | 点类型按钮 → 选 `option` “揭示” |
| `planning-worldline-timeline.test.ts:155`、`workspace.test.ts:398` | `getByLabel("开始时间偏移").fill(old + x)` | 先点“事件时间”打开浮层；值为非负数（符号在“前 / 后”） |
| `card-zoom.test.ts:395-400`（ZB-17） | 编辑中缩放画布后草稿仍在 | 缩放用滚轮（不是点击），草稿保留，不改 |
| `workspace.test.ts:459-468`（LF-B7b） | 编辑中点图例，草稿保留 | R8：点图例即取消。改为先保存再点图例，或断言草稿被丢弃 |
| `card-zoom.test.ts:248-263`（ZB-10） | 取消后无编辑器 | 不变（文案改“保存”） |
| `workspace.test.ts:44-62`（WU-32） | 取消后卡片仍展开 | 不变 |
| 新建子事件相关（`grep -n 新建子事件 tests`） | 草稿在视图上方、时间待定 | 改为立即保存、卡片内编辑（§6.2） |

实现阶段按 `grep` 结果逐条列入 code review。

## 10 测试用例

合成数据，内存 API 夹具（`tests/helpers/worldline-browser-fixture.ts`）。浏览器用例新文件 `tests/browser/planning-worldline-card-edit.test.ts`（CE-*），单元 `tests/unit/event-time-strip.test.ts`（TS-*）与 `tests/unit/worldline-layout.test.ts`（补充）。

### 10.1 单元

| ID | 内容 |
|---|---|
| TS-01 | `stripEnds`：exact+duration → a=value, b=value+duration；exact 瞬间 a=b；window → b=end；仅同日 → b=a+hoursPerDay；unknown → null |
| TS-02 | `stripStep`：fixed 历法范围 60h → 1；范围 2000h → 24；范围 1e5 → 720；years 历法 → 1；无 hoursPerDay → 1；仅同日固定 hoursPerDay |
| TS-03 | `moveStrip` 开始点：持续 6h，开始 +3h → value+3、duration 3；拖过结束点被夹在结束点（duration 0） |
| TS-04 | `moveStrip` 结束点：不越过开始点；window 改 end |
| TS-05 | `moveStrip` 整体：value、end 同移，duration 不变；吸附到步长 |
| TS-06 | `wholeUnit`：29h → 小时；48h → 天；720h → 个月；0 → 当前单位不变 |
| WL-addKid | `collapsedHeadChrome` 比原值大 33；`collapsedCardWidth` 上限不变；`collapsedTitleLines` 在同宽下可能从 1 变 2（给一个固定标题断言） |

### 10.2 浏览器：形态与尺寸

| ID | 步骤 | 期望 |
|---|---|---|
| CE-01 | 事件表展开卡片（有正文 2 段、2 个角色、1 条角色转变），双击 | 卡片 `getBoundingClientRect` 宽高与双击前相差 ≤ 0.5px；出现 `textarea[aria-label=事件标题]`、`事实正文`、`保存`；无 `.worldEventEditor` |
| CE-02 | 同 CE-01，时间线（`revealTimelineCard`） | 同上 |
| CE-03 | 父事件（分组框标题栏）、子事件、孙事件各双击 | 各自尺寸不变；分组框高度不变 |
| CE-04 | 无正文、无角色的事件双击 | 尺寸不变；元信息行有“添加”按钮；无空角色行 |
| CE-05 | 正文点击进入段落编辑 | 卡片高度不变；`[contenteditable]` 内 `p` 数 = 段数 |
| CE-06 | 玄墨、宣纸各截图 | 证据（不断言像素） |

### 10.3 浏览器：字段编辑

| ID | 步骤 | 期望 |
|---|---|---|
| CE-10 | 改标题、类型（浮层选“揭示”）、重要度（radio “关键”），保存 | 保存的事件 `{ title, category:"揭示", importance:3 }`；卡片回展开形态 |
| CE-11 | 正文：末尾输入、Enter 新段、Shift+Enter 段内换行、粘贴含空行的文本、Cmd+B | `fact` 为预期 Markdown 源码；无 `<b>` 写入 |
| CE-12 | 正文 IME：`page.keyboard.insertText` + compositionstart/end | 文本进入 `fact` |
| CE-13 | 角色：点胶囊 → 搜索 → 选另一角色 | `people[i]` 被替换、顺序不变；已参与项禁用 |
| CE-14 | 角色 × 移除；末尾“＋”添加 | `people` 正确；无角色时“＋”在元信息行 |
| CE-15 | 角色转变：改维度 / 前 / 后、换角色、切“开始时 / 结束时”、×、行尾“新增角色转变” | `changes` 正确；新增项 `dimension:"境界", at:"end", character: 第一个角色` |
| CE-16 | 校验：清空标题保存 | 保存条出现“请填写事件名称。”（`role=alert`）；不发请求 |
| CE-17 | 保存失败（`failNextSave`） | 保存条显示错误；草稿保留；再保存成功 |

### 10.4 浏览器：时间浮层

| ID | 步骤 | 期望 |
|---|---|---|
| TP-01 | 打开时间浮层；切 确定 / 只知道哪天 / 某段时间内 / 未定 | `time.kind/label/precision/end` 与现编辑器同值；“结束”组只在“确定”时存在 |
| TP-02 | 参考选同线另一事件、边界“结束”、“前”、数值 3、单位天 | `time = { anchor, boundary:"end", value: -3×hoursPerDay }`；预览文字与卡片 `.when` 相同 |
| TP-03 | 某段时间内：起 2 至 5，单位天 | `value = 2×24, end = 5×24` |
| TP-04 | 结束 持续一段时间 6 小时 → 改填结束时间 30 → 改开始 | 结束保持 30（`updateTime` 规则）；duration 随之变 |
| TP-05 | 结束 未定 / 至今仍在持续 | `duration:null, ongoing:false/true` |
| TP-06 | 拖结束点 +80px、开始点 −60px、线段 +50px | 值按 `stripStep` 吸附；结束不早于开始；拖完浮层仍开、卡片仍编辑 |
| TP-07 | 圆点聚焦 ← → / Shift | 一步 / 十步 |
| TP-08 | 时间线缩放（`zoomLevels:true` 缩放到卡片 zoom < 1）后拖动 | 拖动量按实际宽度换算（同一 dx 的结果与 zoom=1 时一致） |
| TP-09 | 步进框 ▴ 单击、按住 900ms、↑ / Shift+↓、min=0 时 ▾ 禁用 | 值变化符合；数字与按钮不重叠（`input` 内容右边界 < 按钮左边界） |
| TP-10 | 浮层与保存条重叠处 `elementFromPoint` | 是浮层 |

### 10.5 浏览器：取消、Esc、点外部

| ID | 步骤 | 期望 |
|---|---|---|
| CE-20 | 改标题后点“取消” / Esc / 点画布空白 / 点工具栏 / 点另一卡片 | 五种都退出编辑、标题恢复、无请求 |
| CE-21 | 浮层打开时 Esc | 只关浮层；再 Esc 退出编辑 |
| CE-22 | 在正文拖选到卡片外松开；在浮层内点击；在保存条上点击；删除确认框内点击 | 都不取消 |
| CE-23 | 编辑中双击另一张卡片 | 当前取消、另一张进入编辑；不出现“请先保存或取消” |
| CE-24 | 编辑中缩放（Ctrl+滚轮） | 不取消（滚轮不是点击）；ZB-17 继续通过 |

### 10.6 浏览器：父子事件

| ID | 步骤 | 期望 |
|---|---|---|
| CE-30 | 普通事件点“新建子事件” | 1 次 POST，新事件 `parent`、`time.anchor` 为该事件、`duration:0`、标题“未命名事件”；出现分组框（事件表）/ 家族框（时间线）；新卡片编辑中，焦点在标题且全选 |
| CE-31 | CE-30 后不修改，分别 取消 / Esc / 点外部 | 发出 `action:"restore"` 请求；事件消失；父事件变回普通（无 `[data-event-group]`、无折叠钮）；history 无“删除”条目 |
| CE-32 | CE-30 后改标题再取消 | 子事件保留，标题“未命名事件” |
| CE-33 | CE-30 后在另一来源（夹具直接改 state.version）改动作品，再取消 | 走 delete 操作而不是 restore；事件消失 |
| CE-34 | 改重要度又改回，取消 | 视为未修改，删除 |
| CE-35 | 父事件有 2 子，逐个删除（确认框） | 删第 1 个后仍是父；删第 2 个后变普通事件、卡片闪一下、`foldedEvents` 无残留 |
| CE-36 | 有子事件的事件「…」→ 删除 | 禁用，title “先删除子事件” |
| CE-37 | 收起的父事件头部 | “新建子事件”按钮与 ▸N、标题、⌄、「…」两两不相交 |
| CE-38 | 孙事件层级：折叠 / 展开中间层 | 子事件随之隐藏 / 出现 |
| CE-39 | 编辑中其他卡片的“新建子事件” | 禁用 |

### 10.7 浏览器：角色胶囊

| ID | 步骤 | 期望 |
|---|---|---|
| CE-40 | 展开卡片点胶囊 | `useTabsStore` 打开 `character:{id}` 标签；卡片不展开 / 收起 / 选中 |
| CE-41 | 悬停 200ms / 500ms | 无 / 有 `role=tooltip`，内容 名、身份 · 职业、简介首句、“打开角色卡 ›” |
| CE-42 | 移到悬浮框上 / 移开 | 保持 / 200ms 后消失 |
| CE-43 | 编辑卡片胶囊悬停 600ms | 无悬浮框 |
| CE-44 | 夹具 `/api/novels/:id/characters` 请求次数 | 悬浮多个角色只请求一次（缓存） |

夹具需要扩展：`/api/novels/:id/characters` 返回固定角色记录（含 `roleType / occupation / bio`）。

### 10.8 Electron 命令（单元 `tests/unit/desktop-command-controller.test.ts` 补充）

| ID | 期望 |
|---|---|
| DC-01 | 焦点在世界线面板 textarea，Esc → 运行 `worldline.cancelEdit`（有草稿时） |
| DC-02 | 无草稿 → `worldline.cancelEdit` 不 enabled，Esc 交给 `ai.stop`（生成中）或不处理 |
| DC-03 | 对话框打开 → Controller 不处理 |
| DC-04 | 生成中 + 编辑中 → `blocked`（已知限制，断言行为固定） |

### 10.9 回归与性能

- 全部 `tests/browser/planning-worldline-*.test.ts`（按 §9 改后）、`tests/unit/worldline-layout.test.ts`、`npm test`。
- WU-56c：30 帧拖动 PlanningWorkspace 渲染 0 次（悬浮框、编辑上下文不增加渲染）。
- `planning-worldline-renders.test.ts`：展开 / 进入编辑只重渲染编辑中的卡片。

## 11 真实目标验证

构建版应用 + 隔离根（`~/shakeink-test-roots/worldline-ui-583` 的 LOTM 作品，无模型调用）：

1. 事件表 / 时间线各进入编辑，截图对比展开与编辑尺寸（`getBoundingClientRect`）。
2. 改标题、类型、时间（拖动 + 输入）、角色、角色转变，保存后读回。
3. 新建子事件 → 未修改点外部 → 读回无该事件、历史无删除记录。
4. Esc：焦点在标题 / 正文 / 按钮三处各一次（菜单加速键已忽略，按键经 Controller，`sendInputEvent` 发键，见记忆 text-shortcut-598）。
5. 悬停角色胶囊截图；点击打开角色详情。

证据放 `~/shakeink-test-roots/worldline-ui-583-evidence/599/`，台账 `docs/requirements-traceability.json` 新增 `WL-599`。

## 12 修订 1（按 `docs/599-worldline-card-edit-plan-review.md`）

以下规则替换前文对应内容；冲突处以本节为准。

### 12.1 P1-1 时间线 lane 不接管编辑卡片内的按下

`EventTimeline.tsx:770` lane `onPointerDown` 的排除选择器加 `[data-editing]`：编辑卡片内的按下不记录框选、不 `setPointerCapture`。中键 / Space 平移在 `onPointerDownCapture`（`:704-716`）不受影响。新增用例 CE-25（时间线点正文预览进入段落编辑；段落内拖选 80px 后 `getSelection().toString()` 非空、无 `[data-selection-count]`、选择集合不变）。

### 12.2 P1-2 外部判断与“先取消再执行”

- 外部判断：捕获阶段 `pointerdown` 记录 `{ inside, x, y, button }`；捕获阶段 `pointerup` 在 `button === 0`、按下与松开都在外部、位移 < 4px 时调用 `cancelEventEdit()`（pointerup 在 disabled 按钮上也派发）。“内部” = 本面板的编辑卡片 ref（`editingCardRef`，见 12.9 两面板）及其浮层，`[role=dialog]`/`[role=alertdialog]`。click 监听只保留“吞掉时间轴拖动后的 click”。
- `cancelEventEdit(): Promise<boolean>`，完成（含 R16 的 restore / delete 请求）后 resolve。
- `ctx.hasDraft` 不再禁用其他卡片的操作。其他卡片的「…」编辑 / 新建子事件 / 复制 / 删除、头部“新建子事件”、工具栏“＋ 事件”：pointerup 先触发取消；按钮的 click 处理再 `await cancelPending()`（等取消请求结束）后执行。`save()` 的 `busy` 守卫因此不会吞掉第二个请求。编辑中的那张卡片自身的“新建子事件”仍禁用（设计稿）。
- 用例：CE-26 编辑未修改的新子事件时点另一张卡片的“新建子事件” → posts 依次 restore、put，最终编辑新的子事件；CE-27 编辑中点工具栏“＋ 事件” → 取消并打开新事件卡片。删除 CE-39，改为 CE-39′“编辑中的卡片自身的新建子事件禁用”。

### 12.3 P1-3 Esc（Electron 与浏览器同一路径）

- 新命令 `worldline.escape`（`commands.json`，scope global，Escape，group “世界线”，label “世界线：关闭浮层 / 取消编辑”）。`command-registry.ts:12` 的 contexts：`worldline.escape` → `{ worldlineEdit: true }`，`ai.stop` 增 `worldlineEdit: false`，设置页与配置导入不判冲突。
- 互斥：`worldline.escape` enabled = 焦点（`desktopCommandTarget()`）在世界线面板内 **且** （有草稿 或 有打开的浮层 / 「…」菜单 / 角色悬浮框）**且** 焦点不在搜索框（`[data-worldline-search]`，Esc 仍清空搜索）。`ai.stop` enabled 增加“不满足上一条”：读模块级 `worldlineEscapeActive()`（`src/lib/desktop/worldline-escape.ts`，PlanningWorkspace 注册判定函数）。ChatPanel 是 reuse 文件，改动记入台账。
- 结果：编辑中焦点在面板内 → Esc 归世界线；焦点在对话区等其他地方 → 停止生成照常。§8 已知限制 1 删除。
- `escapeInEditor()` 分层：角色悬浮框 → 「…」菜单（`details[data-card-menu][open]`）→ 编辑卡片内的选择浮层 → `cancelEventEdit()`。浏览器无 Controller 时，PlanningWorkspace 的 keydown 监听调用同一函数；Controller 存在时它已 `stopImmediatePropagation`，不会重复。
- IME：浏览器路径检查 `e.isComposing || e.keyCode === 229`（Controller 已检查，`:103`）。
- Cmd+F 聚焦搜索框后 Esc：按上面的 enabled 条件，归搜索框（清空搜索），不取消编辑。
- 用例改为浏览器 `controller: true`（DC-01′~05′）：标题 textarea、正文 contenteditable、类型按钮各按 Esc → 取消编辑；浮层 / 「…」菜单打开时第一次 Esc 只关它；模拟一个 enabled 的 `ai.stop` 目标，编辑中面板内 Esc 取消编辑且 `ai.stop` 不运行，焦点移到面板外 Esc 运行 `ai.stop`；搜索框内 Esc 清空搜索、编辑保留；组字中 Esc（CDP `Input.imeSetComposition`）不取消。删除原 DC-01~04 单元用例（单元夹具测不到真实注册），保留一条 `platformCommands` 的 contexts 单元断言。

### 12.4 P1-4 默认子事件（用户 2026-11-22 选择“建为待定位子事件”）

| 父事件时间 | 子事件默认 |
|---|---|
| 开始确定、结束确定（含瞬间） | `time: { kind: "exact", anchor: 父, boundary: "start", value: 0 }, duration: 0` |
| 结束未定 / 持续中，或开始为时间窗口 / 未定 | `time: { kind: "unknown", anchor: 父, boundary: "start", value: 0 }, duration: 0` |

判定用 `resolveTime(data, parent)` 与 `validatePlanning` 同一口径：`start !== null && end !== null`（瞬间按 `domain.ts:499-503` 视为 1 天）。

待定位子事件：仍立即保存并进入编辑（编辑卡片显示在视图上方的未定位区，与“＋ 事件”新根事件同一位置），卡片元信息行下方一行灰色提示“父事件时间范围未定，子事件暂为待定位”（不占位：放在保存条左侧，与校验提示同位置，`role=status`）。父事件此时在树里仍没有已定位子节点，因此不出现分组框；事件目录“待定位”组里出现该子事件。R16 照常适用。用例 CE-30b（父事件持续中 → 子事件 `time.kind=unknown`、保存成功、提示出现、目录待定位 +1）。

### 12.5 P2-1 R16 撤销新建

- `freshChild: { id; createdVersion; undoTo }`（统一类型）。`undoTo` 在 `await put()` 返回之后、从刷新后的 `query.data.history` 取 `version === createdVersion - 1` 的条目 id（`save()` 已 await invalidate，`:613-617`）。
- 取消时：未修改 且 `query.data.version === createdVersion` → restore；否则 → `delete` 操作。restore 返回 409：`await refetch()`，若事件仍存在且仍等于 `draftBase` → delete；仍失败 → 保留事件，提示沿用 `save()` 的错误文案。
- 历史描述改为：restore 会写“恢复规划版本：N”，`planningUndoTarget` 沿 restore 链跳过这一对，撤销按钮回到新建之前。
- 成功后：提示“未修改的新子事件已移除”（覆盖 `save()` 的“已保存”）；若父事件已无子事件，`flashCard(父)` 并从 `foldedEvents` 删除父 id。新建成功提示“已在「{父}」下新建子事件”。
- 比较：`sameEvent(a, b)` 递归比较（键顺序无关；`undefined` 与缺键等价），放 `src/lib/planning/domain.ts` 旁的新纯函数文件 `event-draft.ts`；TS 单元加键顺序不同、数组顺序不同（应判不同）的用例。

### 12.6 P2-2 段落编辑器细则

- 根节点 `<div contenteditable="true" suppressContentEditableWarning>` 不渲染 React children；进入时在 `useLayoutEffect` 里用 DOM API 写 `<p>`；输入期间 React 不改其内容；退出时卸载。
- 序列化遍历 `childNodes`：裸文本 / `<br>` / `<div>` 都按段处理；每次 `input` 后把根下裸文本包回 `<p>`（用 Range 保留光标）。CSS `white-space: pre-wrap`。
- 粘贴：注册 `registerTextContextAdapter`（`text-context-adapters.ts:17`），`capture` 命中该编辑器时返回自己的上下文：`paste(text)` 按 `\n{2,}` 拆段、段内 `\n` 用 `insertLineBreak`，全部经 `execCommand`（进撤销栈）。浏览器原生 `paste` 事件走同一函数。Electron Cmd+V 因此与浏览器一致。
- 撤销：输入期间只经 execCommand 改 DOM；Cmd+Z 走 Controller → `execCommand("undo")`。
- R4：段落编辑器只对纯文本段落保证高度不变；正文含标题、列表、代码块时进入段落编辑会变高，列入已知限制（§8 第 3 条扩写）。CE-05 夹具只用纯文本段落。
- 偏离说明：AGENTS.md / `implementation-boundaries.md:38` 要求正文复用 `MarkdownEditor`；本处按用户第 1 轮审核（尺寸不变，放弃 A/B 两案）改为段落编辑器，台账 `WL-599` 写明“用户批准的偏离”。

### 12.7 P2-3 渲染次数与草稿订阅

- `wCardContext` 依赖改为 `hasDraft` 布尔值（`:314`）。
- 新增 `EditingEventCard`：EventCard 在 `p.editing` 时渲染它；它订阅 `EventEditorContext`，以 `event={draft}` 渲染卡片（头部圆点、`--ec`、`data-importance`、标题 textarea 都取草稿）。其他卡片不订阅。
- 用例 CE-50：标题输入 20 字，`renders.EventCard` 增量 ≤ 20 + 4；PlanningWorkspace 渲染每键 1 次（草稿 state 在它里面，可接受；记录数值）。

### 12.8 P2-4 角色悬浮框

- 数据：`useQuery(["characters", novelId])`（与 CharactersPanel 共用），纯函数 `characterHoverInfo(record)` 从 `use-entity-index.ts:271-281` 抽出（两处共用）；头像无图按设计稿显示名字首字（悬浮框是世界线自己的小组件，不复用 `EntityBody`；对话区不变）。
- 状态：`src/components/content/planning/worldline/CharacterHover.tsx` 内部 `useSyncExternalStore` 小 store；卡片胶囊调用 store 的 `enter(id, rect) / leave()`（模块函数，稳定引用），PlanningWorkspace 不随悬浮框渲染。`[data-panning]`/`[data-space]` 存在时不计时。
- 关闭：移出 200ms、pointerdown 在悬浮框外、滚动（捕获）、视图平移 / 缩放（订阅 viewport store 变化）、Esc（`escapeInEditor` 第一层，无草稿时 `worldline.escape` 也 enabled，见 12.3）、点“打开角色卡 ›”。
- 夹具扩展 `/api/novels/:id/characters`（GET，返回 `{ characters: [...] }`）；其他路径仍抛错。
- 用例补 CE-45（平移时经过胶囊不弹出；WU-56c 拖动路径经过有胶囊的卡片，渲染 0 次）、CE-46（Esc / 滚动 / 平移关闭）。

### 12.9 P2-5 受影响用例（逐条）

| 文件:行 | 用例 | 改动 |
|---|---|---|
| `editor.test.ts:34-36` | WU-09c | 打开类型浮层选“揭示”；打开重要度浮层选 radio “关键”；“保存” |
| `regression.test.ts:279` | — | 先打开重要度浮层 |
| `regression.test.ts:213` | WU-71 | 文案 |
| `infinite.test.ts:93-109` | IC-11b | 保存条在 lane 内（露出含保存条）；聚焦标题不滚动 |
| `infinite.test.ts:318-329` | — | 文案 |
| `minimap.test.ts:241-262` | MM-B9 | 保存条不被小地图遮挡 |
| `auto-open.test.ts:230-247` | ZB-45 | 文案 |
| `header.test.ts:17-33` | WU-39d | 保存失败后草稿保留；错误在保存条 `role=alert` |
| `canvas.test.ts:326-338` | CW-14 | 文案 |
| `card-zoom.test.ts:248-263` | ZB-10 | 文案 |
| `card-zoom.test.ts:389-401` | ZB-17 | 不变（滚轮缩放不取消） |
| `timeline.test.ts:150-160` | TL-R1 | 先打开时间浮层；偏移为非负 + 前/后 |
| `workspace.test.ts:44-62` | WU-32 | 文案 |
| `workspace.test.ts:392-407` | WU-79 | 先开时间浮层；服务端范围错误仍在头部 `[role=status]`（`message` 同时显示在保存条与头部：头部 status 不变，保存条显示同一文字） |
| `workspace.test.ts:448-457` | LF-B7 | “＋ 事件”新卡片在视图上方，同一编辑形态 |
| `workspace.test.ts:459-468` | LF-B7b | 改为：编辑中点图例 → 编辑取消（R8） |

实现时再 `grep -n "保存事件\|事件标题\|开始时间偏移\|radio\", { name" tests/browser` 复核。

### 12.10 P2-6 时间窗口“前”

一句话“[参考] 前 a 至 b”表示距参考点 a 到 b 之前；存储 `value = −max(a,b)`，`end = −min(a,b)`；“后”为 `value = min(a,b)`，`end = max(a,b)`。切换前 / 后按此重算。TP-03b“前 2 至 5 天” → `value = −120, end = −48`。

### 12.11 P2-7 用例修正

- CE-31：断言 `posts.at(-1)` 为 `{ action: "restore", snapshotId: "h" + (createdVersion - 1) }`；`planningState().data` 深等于新建前；`planningUndoTarget(history, version)?.version === createdVersion - 2`；提示文字；父卡 `data-flash`；无 `[data-event-group]`。
- CE-33：夹具加 `externalEdit(ops)`（页内以当前版本应用一次操作），之后 `refetchWorldline()` 再取消 → delete 操作；另 CE-33b 不 refetch 直接取消 → restore 409 → refetch → delete。
- CE-12：CDP `Input.imeSetComposition` + `Input.insertText`（同 `tests/browser/text-shortcuts.test.ts`）；组字中 Esc 不取消。
- CE-11：粘贴用带 `DataTransfer` 的 `ClipboardEvent("paste")`；另 CE-11b `controller: true` 下 CDP 发 Cmd+V（夹具 `readClipboardText` 返回固定文本）。
- TP-08：删除；§4.3 关于 `.cardZoom` 的说明删除（编辑卡片 zoom 恒为 1）。改为 TP-08′：`.timeline` 外层 CSS `zoom: 1.25`（模拟外观缩放）下拖动，结果与 1.0 相同。
- CE-01/02：先展开、等两帧 + ResizeObserver 稳定再测；另断言卡片 `top` 与下一个家族卡片位置不变。
- CE-03：新夹具 `familyView()`（父 / 子 / 孙）。

### 12.12 P2-8 浮层角色

所有浮层 `role="group"`（类型 / 角色列表内部用 `listbox`，重要度 `radiogroup`），触发按钮 `aria-haspopup="true"`；不用 `role=dialog`，不触发 Controller 的模态屏障。

### 12.13 P2-9 宽度变化

§11 写明：收起卡片宽 +33px 后，真实目标在同一隔离根重新取基线（rail-588 回退次数、grouping-587 统计），记录前后值，不按旧基线判通过 / 失败。展开卡片首帧高度估算可能偏小，`heights` 量测后修正，不改。

### 12.14 P3

- 聚焦标题 `focus({ preventScroll: true })`。
- 时间浮层补：只知道哪天单位仅天 / 个月 / 年；每种开始类型下的灰色说明；years 历法或无 `hoursPerDay` 时“只知道哪天”禁用。TP-01 覆盖。
- §1.2 简化：视图上方只放未定位的编辑卡片（“＋ 事件”新根事件、待定位子事件），同一编辑形态；CE-28 覆盖其 R8 / Esc / 保存。
- 两面板：外部判断用本面板 `editingCardRef`；CE-29（`panels: 2`，面板 A 编辑，点面板 B → A 取消；参照 ZB-24）。
- §8 已知限制补：离线隔离根默认无模型，生成中 Esc 的路径只在浏览器 `controller: true` 验证，§11 第 4 步不覆盖。
- 记忆 minimap-595-596-drivers 的原因说明改为“renderer dispatcher 返回 blocked”（实现阶段更新记忆）。
- 回归中 CP-07 负载失败时单独重跑判定。

## 13 修订 2（按审核第 2 轮）

### 13.1 P1-5 焦点与 Esc 判定

- 进入编辑时焦点放进卡片：普通编辑 `editingCardRef.current.focus({ preventScroll: true })`（卡片根 `tabIndex=-1`）；新子事件 / 新事件聚焦标题并全选。浮层关闭时焦点还给触发按钮（选项按钮卸载前先 `trigger.focus({ preventScroll: true })`）。
- `src/lib/desktop/worldline-escape.ts`：
  ```ts
  type Owner = { panel: () => HTMLElement | null; wants: (target: HTMLElement) => boolean; run: (target: HTMLElement) => void };
  export function registerWorldlineEscape(o: Owner): () => void   // 多面板：Set
  export function worldlineEscapeOwner(target: HTMLElement | null): Owner | null
  // target 为 null / body / documentElement 时改用 desktopCommandTarget()；再找 panel() 包含它且 wants() 为真的唯一 Owner
  ```
- `worldline.escape` 注册为一个全局命令目标：`accepts: t => !!worldlineEscapeOwner(t)`，`run` 调 owner.run(t)。`ai.stop` 的 enabled 增加 `!worldlineEscapeOwner(document.activeElement as HTMLElement)`——两者用同一函数，body 时同一回退目标，互斥成立。
- `wants(target)`：有草稿、或有打开的浮层 / 「…」菜单 / 悬浮框、或 target 在搜索框且搜索框有内容、或有拖动进行中。
- 用例（`controller: true`）：CE-60 事件表双击后立即 Esc → 退出；CE-61 类型浮层选“揭示”后 Esc → 退出；CE-62 两面板 A 编辑时焦点在 B，Esc 不取消 A。

### 13.2 `escapeInEditor` 层序（最终）

1. 拖动进行中（时间轴圆点、时间拖拽 `temporalDrag`、框选、平移、小地图拖动）→ 取消该拖动；
2. 角色悬浮框；
3. 「…」菜单；
4. 编辑卡片内的选择浮层；
5. 焦点在搜索框且有内容 → 清空搜索（修复 Electron 中现有的“搜索框 Esc 无效”，P2-C）；
6. 有草稿 → `cancelEventEdit()`。

### 13.3 P2-A / P2-B 取消与后续操作

- `cancelEventEdit()` **同步**清 `eventDraft / draftBase / freshChild`、关浮层，返回的 Promise 只包含 restore / delete 请求，存入 `cancelPending` ref，完成后置空。
- 统一入口 `afterCancel(action)`：有草稿 → `cancelEventEdit()`；然后 `await cancelPending.current`；再执行 action。工具栏“＋ 事件”、其他卡片「…」各项与“新建子事件”、双击进入编辑（`actions.toggle` detail ≥ 2）、保存按钮都走它。指针路径的 pointerup 已取消时，`afterCancel` 只等待不再取消。
- 键盘激活（Enter / Space）同一处理函数，不依赖 pointerup。
- 用例：CE-63 restore 未返回时双击另一卡片 → 新编辑保留，posts = [restore, …]，之后保存成功；CE-64 Tab 到“＋ 事件”按 Enter → 旧的未修改新子事件被 restore，新事件进入编辑。

### 13.4 P2-D 页面 Esc 监听始终注册

PlanningWorkspace 的 keydown（冒泡）始终注册：`!e.defaultPrevented && !e.isComposing && e.keyCode !== 229 && e.key === "Escape"` 且 `worldlineEscapeOwner(e.target)` 为本面板 → `run`。Controller 处理过的已 `stopImmediatePropagation`；listbox 内 Controller 直接 return，由此处处理。用例 CE-65（`controller: true`，焦点在类型选项上 Esc → 只关列表）。

### 13.5 P2-E 未定位草稿的渲染位置

- 时间线：草稿事件 `resolveTime(data, draft).start === null`（含“＋ 事件”、待定位子事件、原事件改为未定）→ 显示在视图上方的独立编辑卡片；`EventTimeline` 的 `editing` 只传已定位的草稿 id。
- 事件表：待定位事件已画在底部“待定位”区（`worldline-layout.ts:835-841`）→ 原位编辑，进入时 `locateWorldEvent` 滚动到可见；视图上方不再渲染。
- `:2755` 条件改为：`(视图为时间线 && 草稿未定位) || 草稿不在数据中 || (筛选隐藏)`。CE-30b 两个视图各一次。

### 13.6 P2-F 夹具历史与服务端一致

夹具 POST 改为：提交后新增一行 `{ id: "h" + newVersion, version: newVersion, reason }`，`snapshots` 以该 id 存提交后的数据；restore 的 reason 写在新行上，为 `恢复规划版本：{被恢复行的 version}`。与 `services/planning.ts:344-356` 相同。

- 依赖历史的现有用例 WU-39e、IC-24 随之更新快照 id 期望，实现阶段先跑旧用例确认基线、改夹具后再跑。
- `undoTo` 口径：新建前的数据 = `version === createdVersion - 1` 那一行的快照（两边一致）。
- CE-31 断言 `planningUndoTarget(history, version)?.version === createdVersion - 1`（回到新建之前的那一版）与数据深等于新建前。

### 13.7 P2-G 段落编辑器

- adapter 内部 `captureDOMTextContext(root, options)` 取得默认上下文，只覆盖 `text.paste / text.pastePlain` 的 execute（拆段 + execCommand）；复制、剪切、全选、撤销、重做照原样。右键菜单粘贴同一路径，用例 CE-11c。
- 输入期间不改 DOM；序列化容忍裸文本、`<br>`、`<div>`；退出段落编辑时整理一次。CE-11 加“全选删除后输入，再 Cmd+Z 恢复”。

### 13.8 P2-H 按键开销

CE-50 改用 F885 夹具：标题输入 20 字，测每次 keydown → 下一帧耗时，上限 16ms，记录 P50/P95。若超出，标题与正文草稿下放到 `EditingEventCard` 本地 state（外部 `draftStore`，保存 / 取消时读取），工作区只在非文本字段变化时更新。实现时先测，再决定。

### 13.9 P3

- 冲突说明改为：`worldline.escape` 与 `ai.stop` 用 contexts 区分；与 `input.cancel`、`md.selectionCancel`、`ai.mentionClose` 仍算冲突，与现有 `ai.stop` 的情况相同。
- 悬浮框角色查询在第一次悬停时启用；`planning-card-menu.test.ts`、`planning-worldline-time.test.ts` 的 fetch 夹具加 characters 路径。
- 窗口“前 a 至 b”按位置映射：`value = −b, end = −a`（“后”：`value = a, end = b`），顺序不对由保存校验提示。替换 §12.10 的 min/max。
- `EditingEventCard` 根 `aria-label` 保留已保存标题；新用例按 `data-event-id` 定位。
- 待定位子事件的提示文案补“父事件时间确定后才能为子事件设定时间”。
- 外部判断在 pointerdown 时排除滚动条（`offsetX ≥ clientWidth || offsetY ≥ clientHeight` 于可滚动元素）。

## 14 修订 3（按审核第 3 轮）

- **P1-6**：保存按钮不走 `afterCancel`。两个入口：
  - `afterCancel(action)`：只用于离开当前编辑的操作（“＋ 事件”、其他卡片「…」各项与“新建子事件”、双击其他卡片）。
  - 保存：只 `await cancelPending.current`，不取消。CE-63 断言 posts 为 `[restore, put]`，put 内容是新编辑的草稿。
- **P2-I**：「…」菜单（`PlanningWorkspace.tsx:358`）、时间线拖动（`EventTimeline.tsx:442`）、时间拖拽（`:2126`）的 Esc 监听处理后 `preventDefault()`；§13.4 的冒泡监听在 `defaultPrevented` 时不处理。CE-21 在无 Controller 与 `controller: true` 两种夹具各跑一次。
- **P2-J**：CE-31 期望 `planningUndoTarget(history, version)?.version === createdVersion - 2`（撤销新建之前的那次修改）；夹具在新建前先做两次修改，保证有该行。§13.6 的 `−1` 更正为 `−2`。

## 15 用例修订（按 `docs/599-worldline-card-edit-test-review.md`）

### 15.1 P1-1 真实 ChatPanel 的 `ai.stop` 互斥

- 新单元用例 DC-10（`tests/unit/composer-command-review.test.ts` 同法：取 `ChatPanel.tsx` 的 `useDesktopCommands(...)` 源码，`new Function` 执行，接真实 Controller）：生成中、`worldlineEscapeOwner` 返回本面板时按 Esc → `stop` 未调用、`worldline.escape` 运行；返回 null 时 → `stop` 调用。
- `composer-command-review.test.ts:64` 参数表加 `worldlineEscapeOwner`；`:130` CMP47-17 期望改为 `{ mention: false, worldlineEdit: false }`。列入 §12.9。

### 15.2 P1-2 夹具初始版本行

夹具挂载时若 history 中无 `version === view.version` 的行，补 `{ id: "h"+version, version, reason: "初始" }` 并 `snapshots.set(id, 初始数据)`。实施顺序：先改夹具（初始行 + §13.6 格式）→ 全量 `planning-worldline-*` 与 `planning-card-menu`、`planning-worldline-time` 确认基线 → 再写 CE 用例。WU-39e 补断言恢复后的数据。

### 15.3 P2-1 空转断言

- CE-01：改为编辑卡片内无 `fieldset`、无 `select`、无 `[class*="worldEventEditor"]`。
- CE-11 Cmd+B：派发 `beforeinput { inputType: "formatBold" }`，断言 `defaultPrevented === true`，并以同页不拦截的 contenteditable 为对照。
- CE-12 / DC-05′：先写正向用例（CDP `Input.imeSetComposition` → `Input.insertText` 提交后文本进入 `fact`），并在页面记录组字期间 keydown 的 `isComposing / keyCode`，确认 Esc 确实带 229 或 isComposing，再断言不取消。若 CDP 无法在组字期间送达 Esc，此条标为“无法验证”，不记通过。
- TP-10：取浮层与保存条矩形交集中心，先断言交集非空。

### 15.4 P2-2 外部判断排除（CE-22 拆分）

CE-22a 右键画布不取消；CE-22b 画布按下拖动 ≥ 4px（平移）不取消、< 4px 取消；CE-22c 事件表滚动条按下不取消；CE-22d 时间轴圆点拖到浮层与卡片外松开，仍在编辑；CE-22e 点另一张卡片上的禁用按钮（冻结事件「…」→ 编辑）→ 取消。

### 15.5 P2-3 夹具挂起与外部修改

- `holdNext()`：下一次 POST 返回一个由测试 `release()` 放行的 Promise。CE-63 用它。
- `externalEdit(ops)`：页内以当前版本应用、版本 +1、追加 history 行，不写 `posts`。CE-33 断言 posts `[put, delete]`；CE-33b 断言 `[put, restore(409), delete]`。

### 15.6 P2-4 粘贴夹具

挂载参数 `clipboard: string`，`readClipboardText` 返回它并计数；`window.desktop.showTextContextMenu` 参照 `text-shortcuts.test.ts:23` 返回指定命令。CE-11b 断言读取次数 1、fact 为拆段结果；CE-11c 右键菜单粘贴同结果；CE-11d 撤销在无 Controller（原生）与 `controller: true`（`execCommand("undo")`）各测一次。

### 15.7 P2-5 Esc 第 1、5 层

- CE-66：编辑中开始拖动（时间轴圆点 / 时间线卡片标题拖动 / 框选 / 小地图），Esc 只取消拖动，编辑保留；再 Esc 取消编辑。无 Controller 与 `controller: true` 各一次（拖动用 4 种中的两种：圆点、标题拖动；另两种各一条短用例）。
- CE-67：编辑中焦点在有内容的搜索框，Esc 清空搜索、编辑保留；搜索框为空时 Esc 取消编辑。
- CE-68：`controller: true`、无草稿，搜索框 Esc 清空（修复现有缺陷）。

### 15.8 P2-6 性能用例拆分

- CE-50a（`profiling: true`）：正向对照后，标题输入 20 字，`renders.EventCard` 增量 ≤ 24。
- CE-50b（production，F885）：20 次按键 keydown → 下一帧 P95 ≤ 20ms（同 ZB-20），记录 P50 / P95。
- CE-45：自选经过胶囊的拖动路径，先断言路径上有 `[data-character-pill]`；拖动期间无 `role=tooltip`、PlanningWorkspace 渲染 0 次。

### 15.9 P2-7 悬浮框

CE-47 悬浮框外 pointerdown 关闭；CE-48 Ctrl+滚轮缩放关闭；CE-49 点“打开角色卡 ›” → 关闭且 `openTabs()` 含 `character:{id}`；CE-51 另一张卡片编辑中，Esc 只关悬浮框；CE-52 胶囊在视口底部时悬浮框在上方，靠右时不出视口；CE-53 无职业只显示身份、无简介不显示、无头像显示首字；CE-44 补：挂载后悬停前 `/characters` 请求 0 次，悬停多个角色共 1 次。

### 15.10 P2-8 R16 边界

- restore 返回 500（`failNextSave`）：子事件保留，显示 `save()` 错误文案，草稿已清（§13.3 同步清状态），CE-31c。
- CE-31d：新建后保存一次，再进入编辑、不改、取消 → 子事件保留；CE-31e：新建后改过取消，再进入、不改、取消 → 保留。
- CE-31：去掉“无删除条目”，改为 `history[0].reason === "恢复规划版本：" + (createdVersion - 1)`。
- CE-30 断言“已在「{父}」下新建子事件”。

### 15.11 P2-9 §12.9 补行

| 文件:行 | 用例 | 改动 |
|---|---|---|
| `composer-command-review.test.ts:64`、`:130` | CMP47-15/16/17 | 见 15.1 |
| `infinite.test.ts:316-329` | IC-22 | 文案 |
| `regression.test.ts:202-220` | WU-71 | 冻结规则不变；Esc 关「…」菜单经 `escapeInEditor` 第 3 层，无草稿时 `worldline.escape` 因菜单打开 enabled；与 `planning-card-menu.test.ts:193` CM-06 一起跑 |
| `planning-card-menu.test.ts`、`planning-worldline-time.test.ts` | 自带 fetch 夹具 | 加 characters 路径；CE 用例不放入这两个文件（Monaco 抛错替身） |
| `workspace.test.ts:351-362` | WU-76 待定位“编辑时间” | 按 §13.5：事件表原位、时间线视图上方；补断言编辑形态（G14） |
| `tests/unit/worldline-layout.test.ts` | CW-03、ZP-01 | 不需改；WL-addKid 断言绝对值（空标题头部 103，“王立大学”159） |
| `canvas.test.ts:68`（CW-10）、`regression.test.ts:36-40` | 收起卡宽 | 改前后各跑一次，记录宽度分布变化 |
| `release-optimization.test.ts:77` | OPT-C01 | 重新生成 `command-catalogs.generated.json` |

### 15.12 P2-10 真实目标

§11 改为：

1. 隔离根：复制 `~/shakeink-test-roots/worldline-ui-583` 到新目录 `worldline-ui-599`，按记忆 isolated-root-lease-receipt 先移走 inbox 租约收据；原根不动。
2. 第 3 步读回：`history` 最新一行 reason 为“恢复规划版本：N”，撤销按钮目标为新建之前那一版。
3. 只有浏览器夹具证据（台账标“浏览器夹具”）：R16 的 delete / 409 回退（需外部修改，离线无模型无法复现）；生成中 Esc；组字中 Esc；粘贴的剪贴板路径以夹具为准、真实目标补一次手动粘贴截图。
4. 台账 `WL-599` 逐条把 R1–R18 标为“浏览器夹具”或“真实目标”，不以一次冒烟覆盖。

### 15.13 缺口 G4、G5、G9–G13 与 P3

| ID | 内容 |
|---|---|
| CE-70（G4） | 进入编辑后 `activeElement` 为卡片根（普通）/ 标题（新子事件且全选）；类型浮层选择后焦点回到类型按钮 |
| CE-71（G5） | 时间线编辑中把开始改为“未定” → 卡片移到视图上方编辑卡、草稿内容不丢；改回“确定”回到画布 |
| TP-11（G9） | “完成”关闭浮层；点浮层外（卡片内）关闭浮层、编辑保留；只知道哪天拖框按天移动；时长减到 0 变“瞬间”；拖动中卡片尺寸不变；拖到 29 小时单位换回小时 |
| CE-72（G10） | 添加角色“＋”的 left ≥ 最后一个胶囊 right；“新增角色转变”只在最后一条转变行内 |
| CE-73（G11） | 标题、`.when`、重要度文字、正文首段的 `font-size / font-weight / line-height / color` 与展开形态相同（`getComputedStyle`） |
| CE-74（G12） | 父卡编辑时保存条交集中心 `elementFromPoint` 为保存条（不是子卡）；事件表编辑卡的保存条盖在下一张卡片之上 |
| CE-75（G13） | 新增角色转变后编辑卡高度 = 保存后展开卡高度（±0.5px） |
| CE-76（G7/P3-8） | `bindingConflicts(platformCommands("darwin"), {}, "worldline.escape", "Escape", 0)` 不含 `ai.stop`，含 `input.cancel / md.selectionCancel / ai.mentionClose` |
| P3-1 | CE-06：两视图 × 两主题 4 张 + 一张浮层打开，存 `599/shots/` |
| P3-2 | 夹具加 `openTabs()` |
| P3-3/4 | CE-35 改为：再给该事件新建子事件，分组框展开；`data-flash` 在 1200ms 内 poll |
| P3-5 | TP-09 按住 900ms 期望 9 ± 1 次 |
| P3-6/7 | TS-02 补边界 = 30 × 步长、years 历法禁用只知道哪天；TS-07 `sameEvent`（键序不同 → 相同；数组顺序不同 → 不同；`undefined` 与缺键 → 相同） |
| P3-10 | CE-37 补收起卡上按钮 `opacity` 0.55、悬停 1 |
