# docs/599 世界线事件卡片编辑形态：代码审核

审核范围：工作区未提交的 docs/599 改动（`EventCardEditor.tsx`、`EventTimePicker.tsx`、`ParagraphEditor.tsx`、`CharacterHover.tsx`、`event-time-strip.ts`、`event-draft.ts`、`worldline-escape.ts`，`PlanningWorkspace.tsx` 的草稿生命周期、外部点击与 Esc、`createChild`、命令目标，`EventCard.tsx`、`EventTimeline.tsx`、`worldline.module.css`、`worldline-layout.ts`、`ChatPanel.tsx`、`use-entity-index.ts`、命令目录，夹具与相关用例）。依据是方案 §1–§11 和 §12–§15 修订（冲突处以修订为准）以及调研 R1–R18。行号按审核时的工作区文件。本次只读，除本文件外没有改源码、测试和文档；临时探测用例放在 `tests/browser/` 下运行后已删除。

## 结论

有 P1。卡片原位编辑形态、尺寸规则、Esc 分层与 `worldline.escape` / `ai.stop` 互斥、外部点击判定、焦点进入、未定位草稿的位置，这几部分实现与修订一致，新用例 45/45 通过。

问题在“取消之后接着做事”这条路径。`cancelEventEdit()` 发出 restore / delete 以后，后续请求用的是旧渲染闭包里的 `busy` 和 `query.data.version`，所以 §13.3 的 `afterCancel`、§12.5 的 409 回退实际上都不成立：鼠标点另一张卡片的“新建子事件”被静默丢弃，键盘触发则返回 409“版本已变化”，restore 409 后的 delete 也一定 409，子事件留下来（P1-1、P1-2）。CE-63 被改写成接受“被拒绝”，与 §14 P1-6 的期望相反；覆盖这条路径的 CE-26、CE-27、CE-33b 没有写（P2-1）。

## 运行结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 通过 |
| `node --import tsx --test tests/browser/planning-worldline-card-edit.test.ts` | 45/45 通过 |
| 临时探测 R-26（未修改的新子事件编辑中，鼠标点 e1 头部“新建子事件”） | posts = `["put@1","restore@2"]`，没有第二次 put，无编辑卡片，无提示 |
| 临时探测 R-26k（同上，焦点移到 e1“新建子事件”后按 Enter） | posts = `["put@1","restore@2","put@2"]`，第三个请求 409，提示“版本已变化” |
| 临时探测 R-33b（新建后 `externalEdit`，不 refetch，Esc） | posts = `["put@1","restore@2","delete@2"]`，restore 与 delete 都 409，子事件仍在，提示“版本已变化” |

其余全量回归由主代理在跑，本次没有并行加载。

## P1

### P1-1 `afterCancel` 后续操作读的是取消前的 `busy` 和版本，“先取消再执行”不成立

- `save()` 用闭包里的 `busy` 做守卫，用闭包里的 `query.data?.version` 作 `expectedVersion`（`PlanningWorkspace.tsx:619`、`:628`）。`readonly = query.data?.readonly || busy`（`:264`）。
- `afterCancel(action)`（`:1929-1933`）先 `cancelEventEdit()`，再 `await cancelPending.current`，然后执行 `action`。`action` 里的 `createChild` / `put` / `startEdit` 都是触发那次渲染的闭包，restore 完成后不会读到新的 `busy=false` 和新版本：
  - 鼠标路径：pointerup 捕获监听已经调用 `cancelRef.current()`（`:2063` 一带），restore 发出、`busy` 变 true 并重渲染。随后 click 走到的 `actions.current.menu`（`:2155`）来自这次 `busy=true` 的渲染，`afterCancel` 等完 restore 以后调 `createChild` → `put` → `save`，`if (busy) return false` 直接返回，没有请求也没有提示（R-26）。
  - 键盘路径：`afterCancel` 和 `save` 都来自 `busy=false`、`version=2` 的渲染，restore 把版本改成 3 后，put 仍带 `expectedVersion: 2`，服务端 409（R-26k）。
  - 双击另一张卡片（`:2086-2089`）同样是 `readonly` 旧值判断后进入 `afterCancel`；工具栏“＋ 事件”（`:2438`）、「…」→ 编辑 / 复制 / 删除 / 新建子事件（`:2151-2155`）都走这条路径。其中只调用 `startEdit` 或 `setDialog` 的不发请求，因此能工作（CE-64 通过）；凡是要保存的（新建子事件、复制）都失败。
- 这违反 §12.2 / §13.3 /§14 P1-6：“`save()` 的 `busy` 守卫因此不会吞掉第二个请求”，CE-26 期望 posts 为 restore、put，最终编辑新的子事件。
- 处理：`save()` 改为读 ref（`busyRef`、`versionRef` 或 `qc.getQueryData(["planning", novelId])?.version`），`busy` 守卫用 ref；`afterCancel` 里的 `action` 通过 `actions.current` / ref 取最新函数后执行。补 CE-26（鼠标与键盘各一次）、CE-27（编辑中点工具栏“＋ 事件”，这条不发请求，但要固定行为）。

### P1-2 R16 的 409 回退必然失败，未修改的新子事件被留下

- `cancelEventEdit()` 的 409 分支（`:1916-1920`）先 `await query.refetch()`，然后调 `del()`，即 `save([{ kind: "delete", … }])`（`:1912`）。`save` 是本次渲染的闭包，`expectedVersion` 仍是 refetch 之前的版本，所以 delete 一定再 409（R-33b：`delete@2`，服务端版本 3）。子事件留下，用户看到“版本已变化”。
- 这是 §12.5 的明确要求（“restore 返回 409：`await refetch()`，若事件仍存在且仍等于 `draftBase` → delete”）。§15.12 把它列为只靠浏览器夹具证明的项，现在夹具里也没有用例（CE-33b 缺失），所以没被发现。
- 处理：与 P1-1 同一修法（版本从 refetch 结果或 query cache 读，或给 `save` 增加 `expectedVersion` 参数，`del` 传 `r.data.version`）。补 CE-33b，断言 posts `[put, restore(409), delete]` 且子事件消失。

## P2

### P2-1 用例缺口，CE-63 的期望与方案相反

- CE-63（`planning-worldline-card-edit.test.ts:523-547`）断言“restore 未返回时双击另一张卡片不进入编辑”，posts 为 `[put, restore, put]`，其中第二个 put 是之后手动再进入编辑保存的。§13.3 / §14 P1-6 要求的是：这次双击的新编辑保留，`afterCancel` 等 restore 结束后打开它。现在用例把 P1-1 的缺陷固定成了预期行为。
- 方案中列出、但用例文件里找不到的编号：CE-03（父 / 子 / 孙尺寸）、CE-06（截图）、CE-11c（右键菜单粘贴）、CE-23（双击另一张卡片进入编辑）、CE-24（Ctrl+滚轮不取消）、CE-25（时间线正文拖选，§12.1 P1-1）、CE-26、CE-27、CE-28（未定位编辑卡的 R8 / Esc / 保存）、CE-31e、CE-33b、CE-38、CE-39′、CE-45、CE-46、CE-48、CE-50b（F885 按键耗时）、CE-52、CE-65（listbox 内 Esc）、TP-03b（窗口“前”）、TP-08′（外层 `zoom: 1.25`）。其中 CE-23 / CE-26 / CE-33b 正好覆盖 P1-1、P1-2。
- CE-66 的标题写了 CE-66，但用例（`:189-199`）只测“浮层 → 编辑”两层，没有“拖动中 Esc 只取消拖动”（§15.7 要求圆点、标题拖动、框选、小地图）。
- 处理：CE-63 恢复 §14 的期望；按上面的清单补齐，或在台账里逐条标为未执行，不能记为通过。

### P2-2 时间轴圆点拖动中按 Esc 不是“先取消拖动”

- `escapeRef.current` 第 1 层只看 `dragLive()`，也就是 `temporalDrag`（`PlanningWorkspace.tsx:2001-2002`）。`EventTimePicker` 的拖动状态在组件内部 `drag` ref（`EventTimePicker.tsx:66`、`:90-105`），没有注册到 Esc 分层，`wantsEscape` 也不知道它。
- 结果是拖动圆点时按 Esc 会走到第 4 层，关闭整个时间浮层。浮层卸载时 pointer capture 被丢掉，已经写入草稿的拖动值不会回到拖动前。§13.2 第 1 层明确列了“时间轴圆点”。
- 处理：拖动期间 `onKeyDown` 处理 Esc（恢复 `drag.current.o` 并 `preventDefault`），或者把它注册进 `dragLive`。用例并入 CE-66。

## P3

- **旧编辑器 CSS 未删**：`planning.module.css:880-960` 一带的 `.worldEventEditor` 规则有 10 条，`renderEventEditor` 删除后已经没有引用（`grep worldEventEditor src` 只剩 CSS）。`pointerInside` / `editor` ref 与 `MarkdownEditor` 导入仍被叙事线卡片编辑器使用（`:341-361`、`:1064`、`:1183`），不是死代码。
- **`ctx.hasDraft` 已无读取方**：`EventCard.tsx` 菜单改为看 `!!p.editor`，`hasDraft` 只剩上下文字段（`PlanningWorkspace.tsx:320`），每次进入 / 退出编辑仍让 `wCardContext` 换引用、全部卡片重渲染一次。可以从上下文去掉，或者留着并注明用途。
- **`ParagraphEditor` 失焦时挂的一次性 click 监听**（`ParagraphEditor.tsx:115`）：焦点移到同卡按钮后如果没有 click（例如按下后拖出按钮松开），监听不会触发，段落编辑器停留在打开状态直到下一次点该按钮。影响小，可以改为 `pointerup` 或者加一次 `setTimeout` 兜底。
- **CSS 特异性**：新规则多用 `.meta .edPick`、`.edPop .edItem`、`.edSaveBar .edPrimary`、`.change .edInline`、`.title .edTitle`（0,2,0），能压过 `.workspace button/input`（0,1,1），已逐条核对。`.edSearch` 与 `.timePop .stepper > input` 也在两级以上。
- **悬浮框 Esc / 第 1 层判断**：`characterHover.isOpen()` 与 `details[data-card-menu][open]` 都是同步读取，无草稿时 `worldline.escape` 因菜单打开 enabled（WU-71 路径），实现与 §15.11 一致。
- **台账**：`docs/requirements-traceability.json` 里还需要 `WL-599`，并写明正文段落编辑器是用户批准的偏离（§12.6）。

## 已核对、没有问题的部分

- **R4 尺寸**：标题 textarea、类型 / 时间 / 重要度按钮、正文预览盒、胶囊、角色转变行都用负外边距抵消内边距；×、行尾按钮、浮层、保存条都是绝对定位。CE-01/02（两视图）、CE-04、CE-05、CE-73、CE-75 在本次运行中通过。`EventTimeline` 的 ResizeObserver 跳过已脱离的元素、依赖加 `editing`（`EventTimeline.tsx:372-396`），解决了重新挂载时报 0 高度的问题。
- **R8 外部点击**：捕获阶段 pointerdown / pointerup，只认左键、位移 < 4px、按下和松开都在外，排除对话框、悬浮框和滚动条（`PlanningWorkspace.tsx:2040-2069`）。内部判断用本面板的 `editingCardRef`，两面板 CE-29 通过。时间线 lane 的框选排除了 `[data-editing]`（`EventTimeline.tsx:773`）。
- **R17 Esc 与互斥**：`worldlineEscapeOwner()` 被 `worldline.escape` 的 enabled / run 和 `ai.stop` 的 enabled（`ChatPanel.tsx:1692`）共用，body 回退到 `desktopCommandTarget()`，同一时刻只有一个 enabled。命令 contexts（`command-registry.ts:13`）让设置页不判冲突。页面冒泡监听检查 `defaultPrevented / isComposing / 229` 与对话框。CE-12 先确认组字中的 Esc 带 `isComposing` 或 229 再断言不取消，满足 §15.3。DC-10、CE-76 在单元用例里。
- **焦点**：普通编辑在 rAF 中聚焦卡片根（`tabIndex=-1`），新子事件 / 新事件在 `EditorTitle` 的 layout effect 中聚焦并全选，`preventScroll`。浮层选择后焦点回到触发按钮（CE-70）。
- **§13.5 未定位草稿**：`standaloneDraft` = 不在数据中、被筛选隐藏、或时间线上未定位（`:1866-1870`）；事件表里未定位事件在“待定位”区原位编辑。CE-71 往返通过，草稿保留，浮层不关。
- **§14 保存不走 `afterCancel`**：`saveEventDraft` 只等 `cancelPending`，不取消（`:1934-1942`）。
- **R16 正常路径**：`sameEvent` 与键序无关、数组有序、`undefined` 等于缺键；`undoTo` 取 `createdVersion - 1` 的行；夹具历史与服务端同口径。CE-31 三种取消方式、CE-32、CE-33、CE-34、CE-31c/d 通过。
- **渲染开销**：`EditingEventCard` 是唯一订阅 `EventEditorContext` 的组件，`toggleFold` 稳定，CE-50a 通过；“新建子事件”图标用 CSS mask，每张卡只多一个节点（CP-07 的约束）。
- **contenteditable**：React 不渲染子节点，进入时一次写 DOM，`beforeinput` 拦截 `format*`，粘贴 / 拖放 / Controller 粘贴都走 `execCommand`，复制、剪切、撤销沿用 `captureDOMTextContext`。

## P1 / P2 摘要

- **P1-1**：`afterCancel` 之后的保存用的是取消前渲染的 `busy` 和版本。鼠标点另一张卡片的“新建子事件”被静默丢弃，键盘触发返回 409（探测 R-26 / R-26k）。
- **P1-2**：restore 409 后的 delete 带的是 refetch 前的版本，必然 409，未修改的新子事件留下（探测 R-33b）。
- **P2-1**：CE-63 把 P1-1 固定成预期；CE-23/26/27/33b 等十余条方案用例缺失；CE-66 没测拖动层。
- **P2-2**：时间轴圆点拖动中 Esc 关闭整个浮层，不是只取消拖动。

仍需修改：P1-1、P1-2 修复并补 CE-26 / CE-33b，CE-63 按 §14 改回；P2-1 的缺失用例补齐或在台账中标为未执行；P2-2 修复。

## 第 2 轮

复核主代理按上文修改后的工作区。行号按复核时的文件。

### 运行结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 通过 |
| `node --import tsx --test tests/browser/planning-worldline-card-edit.test.ts` | 54/54 通过 |

主代理报告：HEAD 上 `npm test` 原有 43 个失败；工作区多出的 ROOT11-07、successful-child-pause-and-reopen、faulted-work-removal 单独运行 73/73 通过，判断为负载波动；浏览器 `planning-*` 只剩原有的 4 个 CM 失败。这些我没有重跑。

### 逐条复核

- **P1-1 已修复**：`save()` 的守卫改用 `busyRef`（`PlanningWorkspace.tsx:618-624`、`:663`），`expectedVersion` 从 `qc.getQueryData(["planning", novelId])` 读取（`:633`），链式调用拿到的是 restore 之后的版本。卡片上下文的 `readonly` 只取作品的只读标志（`:321`），所以 restore 进行中其他卡片的按钮仍然可用，`afterCancel` 会等 restore 完成。CE-26（鼠标、键盘）断言 posts 为 `[put, restore, put]`，新的子事件进入编辑；CE-63 已改回 §14 的期望（restore 放行后双击的那张卡片进入编辑，保存成功）。
- **P1-2 已修复**：restore 前的版本判断也改为读 query cache（`:1920`）。409 分支先 refetch，`del()` 经 `save()` 读到 refetch 后的版本（`:1922-1926`）。CE-33b 断言 `[put, restore, delete]`，子事件被删除，外部修改保留。
- **P2-1 已处理**：新增 CE-23、CE-25、CE-26 ×2、CE-27、CE-33b、CE-65、TP-03b / CE-66（时间轴 Esc）、TP-08′。CE-27 确认编辑被取消、标题恢复、新事件卡片出现在视图上方。方案中其余编号（CE-03、CE-06、CE-11c、CE-24、CE-28、CE-31e、CE-38、CE-45/46/48、CE-50b、CE-52，CE-66 中标题拖动、框选、小地图三种拖动）仍未写，需要在台账 `WL-599` 中标为未执行或改由真实目标覆盖，不能记为通过。
- **P2-2 已修复**：`stripDrag`（`EventTimePicker.tsx:61-62`）在按下时记录拖动前的 `time / duration` 和单位，Esc 第 1 层调用它恢复这些值并释放 pointer capture（`:96-102`），`wantsEscape` 也包含它（`PlanningWorkspace.tsx:2008`、`:2025`）。TP-03b / CE-66 断言 Esc 后浮层仍在、`aria-valuenow` 回到拖动前。
- **P3 已处理**：`planning.module.css` 中 `.worldEventEditor` / `.eventTitleInput` 已删（`grep` 计数 0）；上下文中的 `hasDraft` 已删。

### 新发现（P3）

- **`activeStripDrag` 在卸载时不清理**：模块级变量只在 pointerup 和 Esc 时清空（`EventTimePicker.tsx:113`、`:62`）。如果拖动中浮层或卡片被卸载（例如两面板时另一面板的操作，或 pointercancel 没有送达），它会留下一个指向旧组件的回调，下一次 Esc 会先执行这个回调，把旧草稿值写入当前草稿的 `setDraft`。触发条件很窄。建议在 `TimeStrip` 的卸载 effect 里，如果 `activeStripDrag` 是自己设置的就清空。
- **普通保存进行中的点击被静默忽略**：卡片 `readonly` 不再包含 `busy`，任何保存进行中「…」→ 复制、新建子事件按钮都可以点，但 `save()` 因 `busyRef` 返回 false，没有提示。原先这些按钮在保存期间是禁用的。可以在 `busyRef` 拒绝时给一句提示，或让这些操作也经 `afterCancel` 等当前保存结束。

### 第 2 轮结论

两个 P1 和 P2-2 已修复，并有用例证明；P2-1 补齐了覆盖 P1 的用例。剩余的只有 P3 和台账标注。

可以进入全量验证
