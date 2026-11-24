# 599 · 世界线事件卡片编辑形态 技术方案与测试用例审核

审核对象：`docs/599-worldline-card-edit-plan.md`（下称“方案”），对照 `docs/599-worldline-card-edit-research.md`（R1–R18、第 4–6 轮）与 `design/worldline-card-edit/index.html`。基于 `1df2411` 工作区（方案、调研、设计稿未提交）。只读审核，未改源码和测试。

已执行（Node 24.18.0）：

- `tests/unit/worldline-layout.test.ts`、`desktop-command-controller.test.ts`、`worldline-command-scope.test.ts` 与 `tests/browser/planning-worldline-editor.test.ts`、`planning-worldline-header.test.ts`：125 项全部通过。
- 全部 `tests/browser/planning-worldline-*.test.ts`：213 项，212 项通过。CP-07 在全量运行时失败（long tasks 4 > 2），单独重跑通过（1 个）。这是负载下的性能抖动，与本方案无关，但实现后回归时要按单独重跑判断。
- /tmp 临时脚本（已删除）：
  - 直接调用 `ShortcutDispatcher`：Escape 在 `worldline`、`input`、`worldline-search` 三种焦点范围、没有任何命令 enabled 时，结果都是 `blocked`。加入方案的 global `worldline.cancelEdit` 后，`bindingConflicts` 列出 `md.selectionCancel`、`ai.stop`、`ai.mentionClose`、`input.cancel`。
  - 直接调用 `applyPlanningOperations`：按 §6.2 的默认子事件（锚定父事件开始、`value 0`、`duration 0`）保存。父事件为瞬间、持续 6h、时间窗口、时间待定时都能保存；父事件 `duration: null`（结束未定、持续中）时报错“父事件范围尚未明确，请先保留为待定位事件”。
  - Chromium 探针：
    - 祖先元素 `setPointerCapture` 后，click 落在祖先元素上，内部元素的 onClick 不触发。
    - 点击 disabled 按钮时只有 pointerup，没有 click（document 捕获阶段也收不到）。
    - 在 contenteditable 中 `execCommand("insertText", "A\n\nB\nC")`，结果是 `<p>oneA</p><p><br></p><p>B</p><p>C</p>`，每个 `\n` 都变成一个段落。

## 结论

方向可行：同一张卡原位编辑、草稿仍放在 PlanningWorkspace、时间浮层的纯函数拆分、撤销用 restore，都与现有代码相容。需求表覆盖 R1–R18，大部分行号核对无误。但有四处不成立或与已批准需求冲突，要先改方案再进入用例审核和 TDD：

1. 时间线 lane 会对卡片内的按下 `setPointerCapture` 并启动框选（P1-1）。编辑卡片里非 button/input 的元素收不到 click，在正文里拖选文字会变成框选。
2. 用 `click` 判断“点卡片外部”，点到 disabled 控件时不会触发。方案又把其他卡片的“新建子事件”和工具栏“＋ 事件”都设为禁用，结果与 R8 和设计稿相反（P1-2）。
3. Electron 中 Esc 的处理：生成进行中按 Esc 什么都不做，违反 R17，同时让原本可用的“停止生成”失效。浮层、「…」菜单、R18 悬浮框这几层 Esc 在 Electron 中都没有路径（P1-3）。
4. 默认子事件在父事件“结束未定 / 持续中”时保存失败。父事件是时间窗口或时间待定时，子事件进入“待定位”，不在父事件框内。现有菜单项今天能用，改后会退化（P1-4）。

## P1

### P1-1 时间线 lane 截走编辑卡片内的按下：click 不到达编辑器，拖选文字变成框选

- `EventTimeline.tsx:767-784`：lane 的 `onPointerDown` 只排除 `button,summary,input,select,textarea,a,[data-minimap],[data-card-title],[data-card-menu]`（`:770`），其余按下都会记录 `box.current`，并执行 `e.currentTarget.setPointerCapture(e.pointerId)`（`:784`）。
- 编辑卡片里的正文预览 `div[role=textbox]`、contenteditable 段落、`.change` 行、`.meta` 中不是 button 的部分，都不在排除列表里。后果：
  - 指针被 lane 捕获后，click 的 target 是 lane（探针结果）。正文预览上的“点击进入段落编辑”（方案 §3 表“正文”行）在时间线里永远不会触发。事件表没有这个问题，所以只看事件表的用例发现不了。
  - 在段落编辑器里按下后拖动超过 5px，`b.active = true`，随后 `getSelection()?.removeAllRanges()`（`:791`），文字选区被清掉；松开时 `onBoxSelect` 选中框内卡片（`:800-806`）。CE-22 的“在正文拖选到卡片外松开不取消”在时间线上测不出这一点，因为编辑本身确实没有取消，只是选区丢了。
- 建议：
  - lane 的排除列表加入 `[data-editing]`（编辑卡片整张不参与框选和平移以外的路由），或者至少加入 `[contenteditable="true"],[role=textbox],[data-ed]`。中键平移和 Space 平移在 `onPointerDownCapture`（`:704-716`）里处理，不受影响。
  - §5.2 写明这一改动，并补用例：时间线上点正文预览进入段落编辑；在段落编辑器内拖选 80px，`getSelection().toString()` 非空、`[data-selection-count]` 不出现、选择集合不变。

### P1-2 “点击外部”用 click 判断，漏掉 disabled 控件；“编辑中禁用其他卡片的新建子事件”与 R8 和设计稿相反

- 浏览器不对 disabled 按钮派发 click，document 捕获阶段也收不到（探针：只有 `pointerup`）。编辑中下面这些控件都是 disabled：
  - 工具栏“＋ 事件”：`disabled={readonly || !!eventDraft || !worldId}`（`PlanningWorkspace.tsx:2631`）。
  - 其他卡片「…」里的编辑、新建子事件、复制、删除（`EventCard.tsx:236-239`）。
  - 方案 §6.1 新增的头部“新建子事件”按钮，`disabled = … || hasDraft`。
  
  点这些控件时编辑不会取消，违反 R8（“点击这张卡片以外的任意区域，编辑自动取消”）。
- 设计稿只禁用编辑中那张卡片自己的按钮：`head(e, col, editing)` 里的 `editing` 指本卡（`index.html:387`）。调研第 7 轮要求“点它会先触发点卡片外部取消编辑，再新建（技术方案确认顺序）”。方案 CE-39 写成“编辑中其他卡片的新建子事件禁用”，既没有确认顺序，也与设计稿不一致。
- 顺序还牵涉 R16：如果当前编辑的是未修改的新子事件，取消会发出 restore 请求，期间 `busy = true`。紧接着的新建请求走 `save()`，会因为 `if (busy) return false`（`:590`）直接返回 false，用户什么提示都看不到。
- 建议：
  - 外部判断改为“`pointerdown` 与 `pointerup` 都在外部、主键、位移 < 4px”，在 `pointerup` 捕获阶段执行。pointerup 在 disabled 按钮上也会派发。保留 click 只用于吞掉时间轴拖动后的那一次点击。
  - 其他卡片的“新建子事件”不再因 `hasDraft` 禁用。点击时先 `await cancelEventEdit()`，再新建。`cancelEventEdit` 返回 Promise，新建等它完成后再开始。「…」里的其他项是否同样改为“先取消再执行”，方案要逐项写明。
  - 用例改为：编辑中点其他卡片的“新建子事件”，先取消（若当前是未修改的新子事件，则先 restore，posts 依次为 restore、put），再新建并进入新卡片的编辑。编辑中点工具栏“＋ 事件”同理。

### P1-3 Electron 中的 Esc：生成中按 Esc 两者都不执行；浮层、菜单、悬浮框没有 Esc 路径

- 现状比方案描述的更严：dispatcher 对“有绑定匹配但没有一个 enabled”的按键也返回 `blocked`（`shortcut-dispatch.ts:45`），Controller 随后 `preventDefault + stopImmediatePropagation`（`DesktopCommandController.tsx:145-148`）。`ai.stop` 是 global 的 Escape（`commands.json:1085-1089`），所以在世界线面板内，只要焦点不在对话框或 listbox 里，Esc 都到不了页面（脚本已验证三种范围都是 `blocked`）。记忆里“菜单加速键拿走 Esc”的说法不准确：主进程已经 `setIgnoreMenuShortcuts(true)`（`desktop/main/index.ts:930`），是 renderer 的 dispatcher 吞掉了 Esc。直接后果：
  - 方案 §5.3 的“浏览器夹具与 Web：编辑卡片根 onKeyDown，浮层打开 → 关浮层”在 Electron 中从不执行。所有分层只能放在 `escapeInEditor` 里。
  - 编辑卡片内的「…」菜单（`details[data-card-menu]`，不是 `role=menu`，`:352-366` 的关闭逻辑同样收不到 Esc）、R18 悬浮框（设计稿要求“Esc 只关悬浮框，不影响其他卡片的编辑”）都要进 `escapeInEditor`，按“悬浮框 → 「…」菜单 → 选择浮层 → 取消编辑”的顺序处理。方案只写了“浮层打开 → 关浮层”。
  - 没有草稿时，R18 的“Esc 关闭悬浮框”在 Electron 中同样无法生效，需要单独的命令，或者把悬浮框关闭并入 `worldline.cancelEdit` 的 enabled 条件（例如改名为 `worldline.escape`）。
- 生成进行中，`ai.stop`（`ChatPanel.tsx:1690`，enabled = `isGenerating && !mention`）与 `worldline.cancelEdit` 同时 enabled，ids.size = 2，结果是 `blocked`（`shortcut-dispatch.ts:39`）。两者都不执行，而今天在世界线面板按 Esc 能停止生成（CMP47-03 的语义）。方案把它列为“已知限制”，并让 DC-04 固定这一行为，等于把违反 R17 的缺陷写进用例。
- 项目里有现成的做法：`ai.mentionClose`（Escape，composer）与 `ai.stop` 用 contexts 区分冲突检测（`command-registry.ts:11-12`，`{mention:true}` / `{mention:false}`），运行时由 enabled 互斥（`!mention`）。建议照此处理：
  - `worldline.cancelEdit` 带 `contexts: { worldlineEdit: true }`，`ai.stop` 加 `worldlineEdit: false`。这样设置页和配置导入不把两者当作冲突。
  - `ai.stop` 的 enabled 增加“焦点不在有草稿的世界线面板内”。ChatPanel 是 reuse 文件，要记入台账；可以读一个由 PlanningWorkspace 维护的模块级标志，或者用 `document.activeElement?.closest('[data-worldline-root][data-event-editing]')`。
  - 结果：编辑中、焦点在面板内按 Esc，取消编辑；焦点在其他位置按 Esc，停止生成。§8 的已知限制 1 删除，DC-04 改为断言 `run worldline.cancelEdit`。
- 另一种思路是让 dispatcher 在“匹配但全部 disabled”时对 Escape 放行（返回 none），页面的所有 Esc 处理都能恢复。这会影响全部 Esc 用户和 docs/598 的 removedDefault 规则，范围超出本任务，不建议在 599 里做，可以在已知限制里注明。
- IME：Controller 遇到 `isComposing` 会跳过（`:93`）。浏览器路径的卡片 `onKeyDown` 也要检查 `e.nativeEvent.isComposing`，否则输入法候选框按 Esc（取消组字）会同时取消编辑。方案没写，CE-12 也没有覆盖。
- 搜索框：编辑中按 Cmd+F 聚焦搜索框（不经过点击，不会取消编辑），再按 Esc，`worldline.cancelEdit` 先执行，`WorldlineToolbar.tsx:84` 的“清空搜索”不再执行。应写明这是有意为之，或者在 enabled 条件里排除 `[data-worldline-search]`。

### P1-4 默认子事件在部分父事件下保存失败或落入“待定位”

- 方案 §6.2 的默认子事件：`time: { kind: "exact", anchor: parent.id, boundary: "start", value: 0 }, duration: 0`。
  - 父事件 `duration: null`（结束未定、持续中）时，`validatePlanning` 走到 `domain.ts:504-508`：子事件有 start，但父事件 `end === null`，报错“父事件范围尚未明确，请先保留为待定位事件”（已用脚本复现）。按方案，`put` 失败后“不进入编辑”，用户只看到一条错误。今天菜单里的“新建子事件”会建一个时间待定的草稿（`:2349-2350`），对任何父事件都能用。
  - 父事件是时间窗口时，`resolveTime` 规定窗口不能作为精确锚点，返回 `start: null`（`domain.ts:332-334`）。父事件时间待定时，同样 start 为 null。这两种情况下子事件进入 `tree.pending`（`worldline-layout.ts:516`），不在分组框或家族框里，CE-30 的“出现分组框 / 家族框”不成立，R14 的“原事件变为父事件”在界面上也看不到。
- 建议：方案按父事件时间分情况写明默认值，并逐一加用例：
  - 父事件开始已确定、结束已确定（含瞬间）：沿用现方案。
  - 父事件结束未定或持续中：子事件也锚定父事件开始，同时设 `duration: null`。这同样过不了 `:504-508`。可选的做法有两种：改用 `time.kind: "unknown"`；或者在新建前提示“父事件结束时间未定，子事件为待定位”。由方案选定一种。
  - 父事件是时间窗口或时间待定：子事件为待定位，提示用户先定父事件的时间，或者禁用按钮并加 `title` 说明。
  
  这些都超出了设计稿的示例。若要偏离 R14 的“立即新建”，需要回到用户确认。

## P2

### P2-1 R16 撤销新建：判定可用，但提示、竞态与用例不完整

- 快照口径核对无误。服务端每次提交写入一行 `contentVersion`，`version` 为提交后的版本，`snapshot` 为提交后的数据（`services/planning.ts:344-356`）。`planningUndoTarget` 取 `version === current - 1` 的那一行（`domain.ts:853-866`）。夹具 `snapshots.set('h'+state.version, state.data)` 后再递增版本（`worldline-browser-fixture.ts:52-54`），口径相同。所以“`history` 中 `version === undoTo` 的快照”就是新建前的数据，用于 restore 是正确的。
- 历史并非“不留记录”：restore 本身会写一条“恢复规划版本：N”。真正的效果是 `planningUndoTarget` 沿着 restore 链跳过这一对记录（`:861-863`），撤销按钮回到新建之前。方案和 CE-31 应按这个效果描述。
- `history` 来源：POST 响应只有 `receipt + getPlanning`，不含 history（`desktop/handlers/novels/[id]/planning/route.ts:86`）。`save()` 先 `setQueryData` 合并，再 await `invalidateQueries` 重新 GET（`:613-617`）。所以 put 返回后 history 已刷新。实现时要在 `save` 之后、而不是 `setQueryData` 之后读取 history，方案应写明。
- 版本判断用的是 `query.data.version`。AI 在对话区改了规划但缓存还没刷新时，restore 会带着过期的 expectedVersion 发出，服务端返回 409“规划已有新版本”，子事件留下，用户只看到一条错误。建议：restore 失败时先 refetch，确认该事件仍存在、仍与 draftBase 相同，再走 delete；仍失败则保留子事件并提示。
- 缺少的界面反馈：R16 要求提示“未修改的新子事件已移除”；若它是唯一的子事件，父事件同时变回普通事件并闪一下（R15）。方案 §5.1 没有写提示，`save()` 成功后会显示“已保存”（`:619`）。§6.3 的 `flashCard` 只写在“删除成功后”，restore 路径没有。还要清掉 `foldedEvents` 中的父 id。
- `deepEqual` 用 `JSON.stringify`，依赖键的顺序。§4.3 的 `moveStrip` 返回新的 `{ value, end, duration }`，若实现时重新组装 `time` 对象，键顺序变了，“改了又改回”会被误判为已修改。建议改用不依赖键顺序的比较（对 zod 解析后的对象排序键再序列化，或写一个递归比较），TS 单元测试补一条键顺序不同的用例。
- 类型不一致：§2 写 `freshChild: { id; version }`，§6.2 的代码里是 `{ id, version, undoTo }`。

### P2-2 contenteditable 段落编辑器的实现细节没有落到可执行的规则

- React 托管：卡身随每次 `setDraft` 重渲染（编辑上下文的值会变）。若 `<p>` 由 React 作为 children 渲染，浏览器改动过的 DOM 会被 React 协调覆盖，或者在删除节点时抛 `NotFoundError`。方案只写了“受控只在进入时写 DOM”，应明确：contenteditable 根节点不渲染 React children，进入时在 layout effect 里用 DOM API 写入 `<p>`，并加 `suppressContentEditableWarning`。
- 序列化：`[...root.children]` 会丢掉根节点下的裸文本节点。全选删除、拖放、IME 都可能留下不在 `<p>` 里的文本。应遍历 `childNodes`，或者在每次 `input` 后把裸文本包回 `<p>`。另外 `innerText` 受 CSS `white-space` 影响，必须给编辑器设 `white-space: pre-wrap`（设计稿 `.factSrc` 有，`index.html:84`），否则 Markdown 缩进（嵌套列表的前导空格）在读回时丢失。
- docs/598 粘贴路径：Electron 中 Cmd+V 不派发 `paste` 事件。Controller 走 `captureDOMTextContext → nativeEdit → execCommand("insertText", 剪贴板全文)`（`text-context-selection.ts:77-82`，`native-text-edits.ts:94`），绕过了方案的 paste 拦截。探针显示 insertText 会把每个 `\n` 都变成一个段落，序列化后 `"B\nC"` 变成两段，空行变成空段落。方案要么注册一个 text-context adapter（`captureRegisteredTextContext`，`text-shortcut-source.ts:22`）让这个编辑器自己处理粘贴，要么让 insertText 之后的序列化与 paste 拦截的结果一致。用例应在 `controller: true` 的夹具里用 CDP 发 Cmd+V 验证。
- 撤销：Electron 中 Cmd+Z 走 `execCommand("undo")`，前提是所有写入都经过 execCommand。进入编辑时用 DOM API 写入不进撤销栈，这是对的。方案应写明不在输入期间用 DOM API 改正文。
- R4：段落编辑器显示 Markdown 源码，预览显示渲染结果。正文含标题、列表、代码块时，进入段落编辑后高度会变（标题字号、列表缩进、代码块边框）。CE-05 只能在纯文本段落上断言“高度不变”。方案应写明夹具使用纯文本段落，并把“富 Markdown 进入段落编辑会变高”列为已知限制，与调研第 1 轮的说法一致。
- 项目约定：AGENTS.md 和 `docs/implementation-boundaries.md:38` 规定正文与长文本复用 Web `MarkdownEditor`。本方案去掉了事件编辑器里的 MarkdownEditor，依据是用户在第 1 轮选定的方向。方案应明确写出这是用户批准的偏离，并记入台账（`WL-599`）。只写 reuse-manifest 不够。

### P2-3 渲染次数：现有上下文依赖会让每次按键重渲染全部卡片；头部的实时值需要单独订阅

- `wCardContext` 的依赖里有 `eventDraft` 对象本身（`PlanningWorkspace.tsx:314`），而值只用到 `hasDraft: !!eventDraft`（`:307`）。每改一个字，草稿对象就换一次，上下文也跟着换，所有 `EventCard` 的 memo 失效。原位编辑之后，标题和正文每次按键都会更新草稿，LOTM（约 850 张卡）每按一次键就重渲染约 850 张卡。§10.9“展开 / 进入编辑只重渲染编辑中的卡片”在现在的代码下不会通过。应把依赖改为 `hasDraft` 布尔值，并加一条用例：在标题里输入 20 个字符，`EventCard` 渲染次数 ≤ 20 加上常数。
- 头部的实时值：设计稿要求重要度圆点随重要度实时变大小，类型色（`--ec`）、标题 textarea 都跟随草稿。方案把标题 textarea 放在 `EventCard` 头部，但 `EventCard` 读的是 `p.event`（已保存的事件），根节点的 `--ec` 和 `data-importance` 也取自它（`EventCard.tsx:155-160`）。若在 `EventCard` 里直接 `useContext(EventEditorContext)`，所有卡片都会订阅草稿，docs/580 §7.1 P3 失效。建议增加一个只在 `p.editing` 时渲染的包装组件 `EditingEventCard`：它订阅编辑上下文，把 `event={draft}` 传给内部的展示组件；或者把头部的标题、圆点、根节点的色值拆成订阅上下文的小组件。方案应选定一种。

### P2-4 R18 角色悬浮框：数据源、渲染位置、关闭条件

- 方案写的 `useEntityIndex(novelId)` 不存在，导出的是 `useNovelEntityIndex`（`use-entity-index.ts:309`）。它会同时发起 novels、worlds、attributes、items、scenes、characters、各世界设定、场景阵营共 8 类以上的查询（`:310-362`）。挂在 PlanningWorkspace 上，每打开一次世界线就多发这些请求。浏览器夹具对规划以外的路径一律抛错（`worldline-browser-fixture.ts:46`）。建议只用 `useQuery(["characters", novelId])`（与 `CharactersPanel` 共用缓存），并从 `use-entity-index.ts:271-281` 抽出一个“角色记录 → 悬浮信息”的纯函数共用。use-entity-index 和 EntityHoverCard 都是 reuse 文件，抽取时要记入台账。
- 渲染位置：悬浮状态放在 PlanningWorkspace，每次显示或隐藏都会渲染整个工作区。中键平移时胶囊从指针下经过，会触发 pointerenter 并启动 400ms 计时；计时到期就会 setState，违反 WU-56c。建议悬浮框放在一个独立的小组件里，用外部 store 管理状态（参照 `TimelineZoomNoteContext`）；在 `data-panning` 或 `data-space` 存在时不启动计时。WU-56c 的拖动路径要经过有角色胶囊的卡片。
- 关闭条件：R18 要求点别处、滚动、Esc 都关闭，“打开角色卡 ›”关闭并打开详情。方案只写了 400 / 200ms，没写平移、缩放（时间线平移是 transform，不产生 scroll 事件）、Esc（Electron 见 P1-3）。CE-41~44 也没有这些用例。
- 头像：设计稿在无图时显示名字首字，`EntityBody` 显示 User 图标（`EntityHoverCard.tsx:196-210`）。“复用、不改内容”与设计稿不一致，方案应二选一。

### P2-5 §9 受影响用例清单遗漏，另有一处说法不成立

- §3 表说 `getByRole("radio", { name: "关键" })` 继续可用，这不成立：radio 在“重要度”浮层里，浮层打开前不在 DOM 中。需要先点开浮层的用例有 `planning-worldline-editor.test.ts:35` 和 `planning-worldline-regression.test.ts:279`，§9 都没有列出。
- 依赖 `保存事件`、`事件标题` 或编辑器位置，但 §9 只用“约 20 处”一笔带过的用例，应逐条列出，因为其中几条依赖编辑器的位置和尺寸，不只是文案：
  - `planning-worldline-infinite.test.ts:93-109`（IC-11b）：保存按钮必须在 lane 内。保存条悬挂在卡片外，露出逻辑要把它算进去（§8 有写，但用例清单没有列）。
  - `planning-worldline-minimap.test.ts:241-262`（MM-B9）：保存按钮不被小地图遮挡。
  - `planning-worldline-auto-open.test.ts:230-247`（ZB-45）、`planning-worldline-header.test.ts:17-33`（WU-39d，保存失败后草稿保留）、`planning-worldline-canvas.test.ts:326-338`（CW-14）、`planning-worldline-infinite.test.ts:318-329`、`planning-worldline-regression.test.ts:213`（WU-71）、`planning-worldline-workspace.test.ts:448-457`（LF-B7，“＋ 事件”的独立卡片）。
  - `planning-worldline-workspace.test.ts:392-407`（WU-79）断言 `[role="status"]` 含“允许范围”。方案把 `message` 移到保存条的 `role=alert`，要写明头部 status 是否继续显示服务端错误。
- grep `新建子事件`、`输入已保留`、`本线零点`、`worldEventEditor` 在 tests 下都没有命中。§9 最后一行“新建子事件相关”没有对应用例，CE-30~39 都是新增用例。

### P2-6 时间窗口切换“前”时起止颠倒

- §4.2：“切换前后翻转 `value` 与 `end` 的符号”。时间窗口“后 2 至 5 天”是 `value = 48, end = 120`，翻转后 `value = −48, end = −120`，`end < value`，保存时报“时间窗口结束不能早于开始”（`:2047-2053`），领域校验也不通过（`domain.ts:482-486`）。设计稿的写法相同（`index.html:826`）。
- 建议：“前”时把一句话里的“起 / 至”解释为距参考点的远近，存储时 `value = −max(|a|, |b|)`，`end = −min(|a|, |b|)`；或者切换时交换两者。TP-03 补“前 2 至 5 天”一条，期望 `value = −120, end = −48`。

### P2-7 测试用例中无法按写法实现或断言不足的条目

- **CE-31**：“history 无‘删除’条目”是空断言，因为夹具的 reason 只有“修改”和“恢复规划版本：N”（`fixture.ts:54`）。应改为断言：
  - `posts.at(-1)` 为 `{ action: "restore", snapshotId: "h" + before }`；
  - `planningState().data` 与新建前的数据深相等；
  - `planningUndoTarget(history, version).version === before − 1`；
  - 出现“未修改的新子事件已移除”，父卡片 `data-flash`，不再有 `[data-event-group]`。
- **CE-33**：“夹具直接改 state.version”不可行。`state` 是夹具闭包内的变量，客户端缓存里的版本也不会变，结果是 restore 带过期版本返回 409，测不到 delete 分支。应给夹具加一个钩子（例如 `externalEdit(op)`，在页面内以当前版本应用一次操作），再 `refetchWorldline()`；另加一条“不 refetch、直接取消”的用例，覆盖 P2-1 的 409 处理。
- **CE-12**：`page.keyboard.insertText` 不产生组字事件，手动派发 `compositionstart/end` 也不经过真实 IME。应照 `tests/browser/text-shortcuts.test.ts` 的方式用 CDP `Input.imeSetComposition` + `Input.insertText`，并补“组字中按 Esc 不取消编辑”。
- **CE-11 粘贴**：Playwright 读写剪贴板需要权限，建议派发带 `DataTransfer` 的 `ClipboardEvent("paste")`，再另加 P2-2 的 Electron Cmd+V 路径。
- **TP-08**：编辑中的卡片总是展开，`zoom(n)` 对展开卡片为 1（`worldline-layout.ts:1389`），所以“缩放到卡片 zoom < 1 后拖动”无法构造。§4.3 关于 `.cardZoom` 的说明也可以删掉。若要验证缩放下的拖动换算，应改为对 `.timeline` 外层加 CSS `zoom`，模拟桌面外观缩放。
- **DC-01~04**：单元夹具的 `ElementFixture` 只能模拟 input、editor、button 三种元素，测不到 PlanningWorkspace 的真实注册和 `accepts`。浏览器夹具已经支持 `controller: true`（挂真实 `DesktopCommandController`，`fixture.ts:37-38`，LF-B5 已在用）。应增加浏览器用例：在标题 textarea、contenteditable、类型按钮、搜索框四处按 Esc；生成中（模拟一个注册 `ai.stop` 且 enabled 的目标）按 Esc 取消编辑、不停止生成；有浮层或「…」菜单时第一次 Esc 只关闭它们。DC-04 按 P1-3 改写。
- **CE-01/02**：要写明先展开再测量，并等待 ResizeObserver 稳定（时间线 `heights` 量测会重排）。断言除了卡片宽高，还应包括卡片 `top` 和相邻家族卡片的位置不变（调研 P7：编辑卡片变高会把下方家族推开）。
- **CE-03**：f60 没有三层事件。应写明新夹具（父、子、孙各一）。

### P2-8 时间浮层如果用 `role="dialog"`，会成为整个应用的模态屏障

- 方案中时间按钮是 `aria-haspopup="dialog"`，暗示浮层是 `role=dialog`。Controller 的 `dialogSelector` 不看 `aria-modal`（`DesktopCommandController.tsx:24`）。时间浮层打开期间：
  - `modal = true`，所有 global 快捷键失效（Cmd+W、Cmd+S 等，`shortcuts.ts:77`）；
  - 原生菜单命令被丢弃（`:85`）；
  - `commandScope` 对浮层内的元素不再返回 worldline（`command-scope.ts:7-8`）。
- 建议：浮层用 `role="group"` 加 `aria-label="事件时间"`，按钮的 `aria-haspopup` 改为 `true`。若坚持用 dialog，方案应写明上述影响并加用例。

### P2-9 新增“新建子事件”按钮使收起卡片变宽 33px，影响面不止单元测试

- `collapsedHeadChrome` 加 33px 后，所有收起卡片的标题可用宽度减少 33px（时间线根卡上限 340、子卡上限 300，`worldline-layout.ts:1272-1276`）。更多标题会变成两行或渐隐，家族变高，打包结果随之改变。事件表也通过 `tableCardInput`（`:674`）受影响。
- 浏览器用例 ZB-01、ZB-02、CW-*、ZB-04 由 DOM 推算期望值，应能自洽；但真实目标驱动的基线会变，例如记忆中 rail-588“61 次回退”、worldline-grouping-587 的分组统计。§11 应写明：按新宽度在同一个隔离根重新取基线，并记录变化，不能把旧基线判为失败或通过。
- 展开卡片的头部也多了一个 24px 按钮，420px 卡里的长标题会更早换行。R4 不受影响（展开和编辑相同），但 `estimateCardHeight` 的首帧估算会偏小，方案可以不改，写明即可。

## P3

- §6.2 `selectTitleOnMount` 聚焦标题时应使用 `focus({ preventScroll: true })`，否则会违反 IC-11b（聚焦字段不滚动 lane）。
- 第 4 轮细节没有写进方案：
  - “只知道哪天”的单位只有天 / 个月 / 年；
  - 每种开始类型下方一行灰色说明；
  - years 历法或没有 `hoursPerDay` 时禁用“只知道哪天”（现 `:1720-1725`）。
  
  TP-01 应覆盖。
- R14 的创建提示（设计稿：“已在「P」下新建子事件（已保存，可撤销）”），方案没有写。
- R8 生效以后，编辑中点图例会先取消编辑，所以“被筛选隐藏的草稿”这条分支只剩“＋ 事件”的新根事件会用到。§1.2 可以简化为“未保存的新事件显示在视图上方”，并加一条它的 R8 / Esc / 保存用例。
- 两个面板（`panels: 2`）：外部判断应只看本面板的编辑卡片（用 ref），不要用 `document.querySelector('[data-editing]')`，否则面板 A 会把面板 B 的编辑卡片当成“内部”。补一条参照 ZB-24 的用例。
- §8 的已知限制里应补上：Electron 中生成路径无法在离线隔离根里真实验证（默认无模型）。这一项只能在浏览器夹具 `controller: true` 中验证，§11 第 4 步不能宣称覆盖。
- 纠正记忆 minimap-595-596-drivers 的原因说明（是 dispatcher 的 `blocked`，不是菜单加速键），便于以后的驱动判断。审核只提出，不修改记忆。
- 基线：全量运行时 CP-07 会因负载失败，实现后回归要单独重跑这一条再判断。

## P1 摘要

- **P1-1**：时间线 lane 对编辑卡片内的按下执行 `setPointerCapture` 并进入框选（`EventTimeline.tsx:770-791`）。正文预览的点击在时间线上不会触发，拖选文字会被 `removeAllRanges` 清掉并变成框选。lane 的排除列表要加 `[data-editing]`。
- **P1-2**：外部判断用 click，点到 disabled 控件时不会触发；方案又禁用了其他卡片的“新建子事件”和“＋ 事件”，与 R8 和设计稿相反。应改为 pointerdown 加 pointerup 判断，并实现“先取消（含 R16 restore）再新建”的顺序。
- **P1-3**：global 的 Escape 命令在生成中与 `ai.stop` 同时 enabled，结果是 blocked，R17 失效，停止生成也失效；Electron 中页面级的 Esc 都被 dispatcher 吞掉，浮层、菜单、悬浮框的 Esc 只能放进命令里处理。应照 mention 的做法用 contexts 加 enabled 互斥，`escapeInEditor` 负责全部分层，并处理 IME。
- **P1-4**：默认子事件在父事件结束未定或持续中时保存失败，在父事件为时间窗口或时间待定时进入待定位、不在父事件框内，现有的“新建子事件”会退化。方案要分情况定默认值，偏离 R14 的部分需要用户确认。

## 第 2 轮审核

审核对象：方案 §12“修订 1”（`docs/599-worldline-card-edit-plan.md:362-482`）。只读。另用 /tmp 脚本（已删除）按夹具和服务端两种历史写法模拟了“新建 → restore”之后的 `planningUndoTarget`。

### 原条目状态

| 条目 | 状态 | 理由 |
|---|---|---|
| P1-1 lane 截走按下 | 已解决 | §12.1 排除 `[data-editing]`；中键 / Space 平移在 capture 阶段，不受影响；CE-25 覆盖 |
| P1-2 外部判断与禁用 | 部分解决 | pointerup 判断正确；但键盘激活没有 pointerup，`await cancelPending()` 为空，旧草稿被直接覆盖（新 P2-B）；异步取消与双击进入编辑有先后问题（新 P2-A） |
| P1-3 Esc | 部分解决 | contexts 加 enabled 互斥的思路正确；但焦点落在 body 时两条命令都不 enabled，Esc 无效（新 P1-5）；搜索框“Esc 仍清空搜索”在 Electron 中不成立（新 P2-C）；listbox 内 Controller 直接返回，要靠页面监听（新 P2-D） |
| P1-4 默认子事件 | 部分解决 | 按用户选择建为待定位，数据可以保存；但时间线视图中这张卡片没有渲染位置，`:2755` 的条件不覆盖（新 P2-E） |
| P2-1 R16 撤销 | 部分解决 | 快照、409、提示、比较都已补上；CE-31 的 `planningUndoTarget` 期望值在夹具上不成立（新 P2-F）；异步清理的顺序见新 P2-A |
| P2-2 段落编辑器 | 部分解决 | 托管、序列化、R4、偏离说明已补；adapter 只写了粘贴，接管范围不完整；“每次 input 后用 Range 包回裸文本”与“只经 execCommand 改 DOM”矛盾（新 P2-G） |
| P2-3 渲染次数 | 部分解决 | `hasDraft` 与 `EditingEventCard` 正确；但每次按键都会渲染 PlanningWorkspace、EventTree、EventTimeline/EventTable，没有量化（新 P2-H） |
| P2-4 悬浮框 | 已解决 | 数据源、store、关闭条件、头像都已明确；夹具与懒加载的建议见 P3 |
| P2-5 受影响用例 | 已解决 | 逐条列出，与 grep 结果一致 |
| P2-6 窗口“前” | 已解决 | 存储规则正确；输入中交换起止的问题见 P3 |
| P2-7 用例 | 部分解决 | CE-33/33b、CE-12、CE-11b、TP-08′、CE-01/02、CE-03 可行；CE-31 见新 P2-F |
| P2-8 浮层角色 | 已解决 | 不用 dialog，没有模态屏障；listbox 的副作用见新 P2-D |
| P2-9 宽度 | 已解决 | 重新取基线并记录前后值 |

### 新 P1

#### P1-5 Esc 判定以焦点为准，事件表里双击进入编辑后焦点在 body，Electron 中 Esc 无效

- 事件表的卡片和外层容器都没有可聚焦元素（`EventTable.tsx`、`EventCard.tsx` 没有 tabIndex）。双击 h3 进入编辑后，`document.activeElement` 是 body。在类型 / 角色 / 重要度浮层里选中一项，浮层关闭，获得焦点的选项按钮被卸载，焦点同样回到 body。时间线有 `tabIndex=0` 的 host（`EventTimeline.tsx:680`），按下时浏览器默认把焦点给它，所以时间线不受影响。
- Electron 中：Controller 的 `target = event.target`（body），`commandScope(body) = "none"`。`worldline.escape` 的 accepts 判断 `worldPanel.contains(body)`，结果为 false，不 enabled。`ai.stop` 按 §12.3 的写法读模块级 `worldlineEscapeActive()`，它依据 `desktopCommandTarget()`（最后一次 pointerdown 的目标，在面板内），于是 `ai.stop` 也不 enabled。dispatcher 返回 `blocked`（`shortcut-dispatch.ts:45`），Esc 什么都不做。这正是 R17 最基本的场景：事件表里双击编辑，然后按 Esc。
- 两条命令读的目标不同（一个读 `event.target`，一个读 `desktopCommandTarget()`），还会出现两者都 enabled（blocked）或都不 enabled 的组合。
- 建议：
  - 进入编辑时把焦点放进卡片：普通编辑聚焦卡片根（`tabIndex=-1`，`focus({ preventScroll: true })`），新子事件聚焦标题；浮层关闭时把焦点还给触发按钮。
  - 导出一个判定函数 `worldlineEscapeOwner(target)`：target 为 body 或 null 时改用 `desktopCommandTarget()`。`worldline.escape` 的 accepts / enabled 与 `ai.stop` 的 enabled 调用同一个函数，并且同一次按键传入同一个目标（Controller 的 target）。`ai.stop` 的 `enabled()` 没有参数，可以由函数内部按同样规则取 `document.activeElement`。
  - 模块级的判定要能注册多份（两面板、多个标签页），用 Set 取 OR，每一份只判断自己的面板。
  - 补用例（`controller: true`）：事件表双击后立即按 Esc；在类型浮层选“揭示”后按 Esc。两条都应退出编辑。

### 新 P2

#### P2-A 异步取消与随后的操作有先后问题

- R16 的 restore 是异步的。`cancelEventEdit()` 如果在 `await` 之后才清 `eventDraft / draftBase / freshChild`，用户在请求返回前双击另一张卡片（这条路径不 await `cancelPending`），新进入的编辑会被清掉。还有一种情况：请求期间 `busy = true`，新编辑的“保存”被 `save()` 的守卫吞掉（`:590`），用户看不到提示。
- 建议：`cancelEventEdit()` 先同步清掉全部编辑状态，只把请求留在 Promise 里；保存按钮在 `cancelPending` 存在时先 await。补一条用例：在 restore 完成前双击另一张卡片，新编辑保留，posts 为 restore 后接 put。

#### P2-B 键盘激活不经过 pointerup

- 用 Tab 移到工具栏“＋ 事件”或其他卡片的“新建子事件”，按 Enter 或 Space，不会派发 pointerup，`cancelPending` 为空，处理函数直接设置新草稿，旧草稿被覆盖。如果旧草稿是未修改的新子事件，它会留在作品里，绕过了 R16。
- 建议：这些按钮的处理函数改为“有草稿就 `await cancelEventEdit()`，否则 await `cancelPending`”，与指针路径共用一个函数，取消只执行一次。补用例：键盘激活“＋ 事件”。

#### P2-C 搜索框内的 Esc 在 Electron 中本来就不会清空搜索

- §12.3 把 `[data-worldline-search]` 排除在 `worldline.escape` 之外，理由是“Esc 仍清空搜索”。但没有生成任务时，`worldline-search` 范围内没有任何 Escape 命令 enabled，dispatcher 返回 `blocked`，事件被拦截，`WorldlineToolbar.tsx:84` 收不到（第 1 轮已验证三种范围都是 blocked）。这是现有缺陷，DC′ 里“搜索框 Esc 清空搜索”的用例按现写法会失败。
- 建议：搜索框也由 `worldline.escape` 处理，第一层就是“焦点在搜索框且有内容 → 清空搜索”，编辑保留。这样同时修好现有缺陷。

#### P2-D 焦点在 `role=listbox` 内时 Controller 不处理 Esc

- `DesktopCommandController.tsx:106`：焦点在 `[role="listbox"]` 内时直接 `return`，不调用 dispatcher，也不 preventDefault。类型列表、角色列表按 §12.12 是 listbox，焦点在选项上按 Esc，只能由页面的 keydown 处理。§12.3 写的是“浏览器无 Controller 时 PlanningWorkspace 的 keydown 监听调用同一函数”。如果这个监听只在没有 Controller 时注册，Electron 中列表里的 Esc 什么都不做。
- 建议：页面监听始终注册，在 `!e.defaultPrevented && !isComposing` 时调用 `escapeInEditor()`；Controller 处理过的事件已经 `stopImmediatePropagation`，不会重复执行。补用例：`controller: true` 下，焦点在类型列表选项上按 Esc，只关闭列表。

#### P2-E 待定位子事件在时间线视图里没有渲染位置

- 时间线只画已定位的事件，待定位事件不出现在 `tree.roots` 中。工作区“视图上方”的卡片只在“事件不在数据里”或“被筛选隐藏”时渲染（`PlanningWorkspace.tsx:2755`）。新的待定位子事件已经在数据里，也没有被筛选，因此在时间线视图里哪里都不显示，`editing` 指向一张不存在的卡片。
- 事件表把待定位事件画在底部的“待定位”区（`worldline-layout.ts:835-841`）。如果把条件简单改为“start 为 null”，事件表里就会出现两张编辑卡片。
- 建议：条件按视图区分。时间线：草稿事件 `resolveTime().start === null` 时显示在视图上方；事件表：在待定位区原位编辑，并滚动到可见。CE-30b 两个视图各测一次。

#### P2-F CE-31 的 `planningUndoTarget` 期望值在夹具上不成立

- 服务端：每次提交写一行，`version` 为提交后的版本，restore 的 reason 写在新行上，内容是被恢复快照的版本（`services/planning.ts:344-356`）。`planningUndoTarget` 沿 restore 链跳到 `createdVersion - 2`，这与方案一致。
- 夹具：最新版本没有对应的历史行，restore 的 reason 写在旧版本那一行上（`worldline-browser-fixture.ts:53-54`）。模拟结果是 `planningUndoTarget(history, createdVersion + 1)` 返回 `createdVersion` 那一行，它的快照里还有子事件。CE-31 按现写法会失败；即使改断言，夹具上也无法验证“撤销回到新建之前”。
- 建议：把夹具的历史改成与服务端相同（每个新版本一行，restore 的 reason 写在新行上，写明恢复自哪个版本），并重跑依赖历史的 WU-39e 和 IC-24；或者 CE-31 只断言 `snapshotId` 和数据，另用单元测试按服务端写法验证 `planningUndoTarget`。`undoTo` 的查找（`version === createdVersion - 1`）在两边都成立，不受影响。

#### P2-G 段落编辑器：adapter 接管的范围；包回裸文本会破坏撤销栈

- `captureRegisteredTextContext` 同时被快捷键（`text-shortcut-source.ts:22`）和右键菜单（`text-context-menu.ts:45`）使用。adapter 一旦命中，复制、剪切、全选、撤销、重做、删除、引用都由它负责，状态也由它提供（参照 `monaco-text-context.ts`）。§12.6 只写了 `paste`。建议 adapter 内部调用 `captureDOMTextContext`（剪贴板走 `window.desktop`），只覆盖 `text.paste / text.pastePlain` 的 execute，其余照原样；补一条右键菜单粘贴的用例。
- “每次 input 后用 Range 把裸文本包回 `<p>`”属于脚本直接改 DOM，Chromium 的撤销栈遇到这种改动后，Cmd+Z 的结果会错位，与同节“输入期间只经 execCommand 改 DOM”矛盾。建议：输入期间不改 DOM，序列化本身容忍裸文本、`<br>`、`<div>`；只在退出段落编辑时整理一次。CE-11 加“全选删除后输入，再 Cmd+Z”。

#### P2-H 每次按键的渲染开销没有量化

- 草稿仍放在 PlanningWorkspace。每次按键都会渲染整个工作区，以及没有 memo 的 EventTree（真实作品约 1000 行）、EventTimeline / EventTable（都会重新计算 step 和元素列表）。CE-50 只统计 EventCard 的渲染次数，并且“接受”工作区每键渲染一次，没有给出耗时上限。用 IME 输入长标题时可能感到卡顿。
- 建议：CE-50 改用 F885 夹具，测 20 次按键里每次 keydown 到下一帧的耗时，上限 16ms，并记录数值。超出时，把标题和正文的草稿放进 `EditingEventCard` 的本地 state 或一个外部 store，保存和取消时再交给工作区。

### P3

- §12.3“设置页与配置导入不判冲突”只对 `ai.stop` 成立。`worldline.escape` 与 `input.cancel`、`md.selectionCancel`、`ai.mentionClose` 仍算冲突（`bindingConflicts` 已验证），与现在 `ai.stop` 的情况相同。改写这句话即可。
- 编辑中平移、框选、拖动小地图或拖动时间时按 Esc：Controller 先处理，取消编辑，不会还原平移（`EventTimeline.tsx:442`、`PlanningWorkspace.tsx:2126` 在 Electron 中本来就收不到 Esc）。建议在 `escapeInEditor` 最前面加一层“有拖动进行中 → 取消拖动”。
- 悬浮框的角色查询最好懒加载（第一次悬停时 `enabled`），避免每次打开世界线都多发一个请求。`planning-card-menu.test.ts`、`planning-worldline-time.test.ts` 的 fetch 夹具对未知路径会抛错，也要同步加上 characters 路径。
- §12.10 用 min / max 存储，会在输入过程中交换两个框的内容（先输入 1 再输入 5 时）。建议按位置映射（“前 a 至 b” → `value = −b, end = −a`），顺序不对时由保存校验提示。
- 编辑中，`EditingEventCard` 根节点的 `aria-label` 会跟随草稿标题变化，按标题定位卡片的用例（`article[aria-label=…]`）在输入后会失配。建议保留已保存的标题，或者在用例里改用 `data-event-id` 定位。
- 父事件为“持续中”时生成的待定位子事件，如果用户把开始改为“确定”，保存时仍会报“父事件范围尚未明确”。这是领域规则，在提示文案里说明即可。
- 点击事件表的滚动条也会派发 pointerdown / pointerup，按 §12.2 会取消编辑。可以在 pointerdown 时排除滚动条区域（`offsetX ≥ clientWidth`）。

### 第 2 轮结论

§12 解决了第 1 轮的大部分问题。仍需修改后再进入用例审核：新 P1-5（事件表里焦点在 body，Esc 无效）；P2-A~H 中影响正确性的 A、B、C、D、E、F。G、H 可以与用例一起修改。

## 第 3 轮审核

审核对象：方案 §13“修订 2”。只读。

### 第 2 轮条目状态

| 条目 | 状态 | 理由 |
|---|---|---|
| P1-5 焦点在 body 时 Esc 无效 | 已解决 | 进入编辑时把焦点放进卡片；两条命令都调用 `worldlineEscapeOwner`，body 时用同一个回退目标；CE-60~62 覆盖 |
| P2-A 异步取消的先后 | 部分解决 | 同步清状态加 `cancelPending` 正确；但保存按钮也走 `afterCancel`，见新 P1-6 |
| P2-B 键盘激活 | 已解决 | 键盘与指针共用 `afterCancel`；CE-64 覆盖 |
| P2-C 搜索框 Esc | 已解决 | 并入第 5 层，同时修好 Electron 中的现有缺陷 |
| P2-D listbox 内的 Esc | 部分解决 | 页面监听始终注册；但在浏览器路径会与现有的 Esc 监听重复执行，见下文 P2-I |
| P2-E 未定位草稿的位置 | 已解决 | 按视图区分；CE-30b 两个视图都测 |
| P2-F 夹具历史 | 部分解决 | 夹具改法正确；CE-31 的期望值错误，初始版本没有快照，见下文 P2-J |
| P2-G 段落编辑器 | 已解决 | adapter 只覆盖粘贴；输入期间不改 DOM |
| P2-H 按键开销 | 已解决 | F885 夹具，每键 16ms 上限，先测量再决定是否下放草稿 |
| P3 | 已解决 | 逐条写入 §13.9 |

### 新 P1

#### P1-6 保存按钮走 `afterCancel`，会先丢弃草稿再保存

- §13.3：`afterCancel(action)` 的规则是“有草稿 → `cancelEventEdit()`；然后 `await cancelPending.current`；再执行 action”，并写明“保存按钮都走它”。保存时一定有草稿，所以每次保存都会先同步清空 `eventDraft`。如果是未修改的新子事件，还会先发出 restore，再执行保存，结果什么都存不下来，或者存的是已被撤销的事件。双击正在编辑的那张卡片同理，但 `EventCard` 的 onClick 对 `p.editing` 直接返回（`EventCard.tsx:167`），不受影响。
- 修改：拆成两个入口。`afterCancel(action)` 只用于“离开当前编辑”的操作（“＋ 事件”、其他卡片的「…」各项、“新建子事件”、双击其他卡片）。保存按钮只 `await cancelPending.current`，不取消。CE-63 的“之后保存成功”按此断言 posts 为 `[restore, put]`，并且 put 中是新编辑的内容。

### 补充 P2（简述）

- **P2-I 浏览器路径中一次 Esc 执行两层**：`「…」` 菜单（`PlanningWorkspace.tsx:358`）、时间线拖动（`EventTimeline.tsx:442`）、时间拖拽（`:2126`）的 Esc 监听都不调用 `preventDefault`。它们处理完之后，§13.4 的冒泡监听看到菜单已关闭、拖动已结束，就继续执行下一层，于是一次 Esc 既关菜单又取消编辑。Electron 中 Controller 在 window 捕获阶段 `stopImmediatePropagation`，不受影响。修改：这些监听处理 Esc 后调用 `preventDefault`，或者统一交给 `escapeInEditor`。CE-21 在不挂 Controller 的夹具里也要跑一遍。
- **P2-J CE-31 的期望值**：按服务端和改后夹具的写法，restore 行的 reason 是“恢复规划版本：createdVersion−1”。`planningUndoTarget` 跳到 createdVersion−1 后，返回 `version === createdVersion − 2` 的那一行，也就是撤销新建之前的那次修改。§13.6 写的 `createdVersion − 1` 不对，第 1 轮写的 `−2` 是对的。夹具要提供新建前至少两条历史；否则期望值应为 `undefined`，撤销按钮禁用。

### 第 3 轮结论

仍需修改：P1-6（保存按钮不能走 `afterCancel` 的取消分支），改一句话即可。P2-I、P2-J 在用例审核中一并修改。改完 P1-6 后可以进入测试用例审核，不需要第 4 轮方案审核。
