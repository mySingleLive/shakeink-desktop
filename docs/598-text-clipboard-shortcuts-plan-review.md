# 598 · 文本复制粘贴快捷键 技术方案与测试用例审核

审核对象：`docs/598-text-clipboard-shortcuts-plan.md`（下称“方案”）。基于 `64255ae` 工作区（方案文件未提交）。只读审核，未改源码和测试。

已执行：Node v24.18.0 下 `node --import tsx --test tests/unit/desktop-command-controller.test.ts tests/unit/native-command-priority.test.ts tests/unit/clipboard-ipc.test.ts tests/unit/monaco-command-controller-review.test.ts`，21 项全部通过（基线）。另读了 `node_modules/monaco-editor`（0.56.0）和 `@base-ui/react` 的键盘处理源码，结论里引用的行号都来自这两处已安装版本。

## 结论

根因分析的方向对：macOS 上 `setIgnoreMenuShortcuts(true)`（`desktop/main/index.ts:930`）加上菜单项没有 `role`，原生复制粘贴没有来源；捕获阶段 `DesktopCommandController.tsx:95` 又把未改动的键交还给“原生”。补一个兜底是必要的。

但方案有三处要先改再实现：

1. 新增的 `desktop:native-edit` 正是代码里明确禁止的做法：异步 IPC 到达主进程时，再对“当时聚焦的控件”执行编辑。
2. “static” 表面按“文档里有非折叠选区”判断，不看选区归属。会越过已有的对话框屏障，也和右键菜单的复制规则不一致。
3. “目标未启用就走原生”把“目标拒绝”变成了“原生执行”，在只读 Monaco、正文预览上直接违反 R4 和 E4。

另外，Windows 的现状没有证据，兜底会替换 Windows 上原本可用的原生路径；几处 React `stopPropagation` 会让冒泡兜底不执行；测试用 Playwright `keyboard.press` 在 macOS 上分不出修复前后。

## P1

### P1-1 `desktop:native-edit` 违反主进程已有的约束：不对 IPC 到达时的焦点执行文本编辑

- `desktop/main/index.ts:866-869`：`executeCommand` 拒绝渲染进程发来的 `text.*`，注释写明原因：“Editing is owned by the retained renderer target; never queue native edits against whichever field happens to be focused when IPC reaches main.” 理由是时序竞争，跟“菜单命令 ID”没有关系。方案 §1.3 说“那条路径是菜单命令 ID，语义不同”，不成立。
- 方案的流程是先 `preventDefault`，然后 `await window.desktop.nativeEdit(op)`，主进程再执行 `webContents.paste()/cut()/undo()`。这中间有一次 IPC 往返，用户可能已经按了 Tab，焦点也可能被程序移走（对话框打开、`initialFocus`、标签切换），这样 paste/cut 就落在另一个控件上。主进程只检查 `trusted()` 和 `isFocused()`（窗口级），不知道渲染进程按键时焦点在哪个控件。已有的剪贴板路径都做了快照比对（`native-text-edits.ts:45-79`、`text-context-menu.ts:61-65`），新路径没有。
- 方案需要原生编辑的地方，代码里已经有同步、在渲染进程执行的办法：
  - 静态文字、只读文字的复制：在 keydown 处理里同步调用 `document.execCommand("copy")`。keydown 带用户激活，`native-text-edits.ts:106-107` 对输入框已经这样用，Monaco 自己的复制也是 `execCommand('copy')`（`clipboard.js:178`）。
  - Monaco 复制、剪切：`editor.trigger(..., 'editor.action.clipboardCopyAction'/'editor.action.clipboardCutAction', {})`。右键菜单已经这样做（`monaco-text-context.ts:36-37`），`docs/reviews/2026-10-13-text-context-menu-code-review.md:31` 记录过它能沿 Monaco 命令分发链执行。
  - Monaco 粘贴：`readClipboardText()` 读剪贴板，确认未变化后 `editor.trigger(..., 'type'/'paste', {text})`（`monaco-text-context.ts:39-41`）。浏览器版 Monaco 的粘贴动作依赖 `navigator.clipboard.readText()`（`clipboardService.js:152`），本应用的权限处理只放行 `local-fonts`（`index.ts:430-432`），走不通，所以只能用桥接读取。
- 建议：
  - 快捷键直接复用右键菜单的取源与执行逻辑（`captureRegisteredTextContext` / `captureDOMTextContext` 加 `source.execute`）。这样能力判断、选区裁剪、密码与 API Key 规则、对话框屏障、禁用输入框的 `nativeSelectionOwned` 都和右键菜单保持一致。区别只有一点：快捷键在 keydown 内同步捕获，不需要等菜单返回。
  - 如果坚持保留 IPC，最多只开放 `copy`（不改内容），并在文档里说明它和 `index.ts:866` 的约束为什么不冲突。`cut/paste/pasteAndMatchStyle/undo/redo/selectAll` 不进 IPC。
- 测试：IPC598-01 断言“7 个 op 各调用一次”，按上面的建议就不再成立，要随方案一起改。新增一条用例：按下 Cmd+V 后在 IPC 未返回前把焦点移到另一个输入框，原输入框和新输入框都不变（或给出明确提示）。

### P1-2 “static” 只看文档有没有选区，越过对话框屏障，和右键菜单规则不一致

- 方案 §1.1：“static：其他元素，且文档有非折叠选区”。§1.2 最后一条：“对话框：焦点被对话框锁住，原生编辑只作用于焦点元素；不额外判断。”第二句不对：焦点在按钮或对话框容器这类不可编辑元素上时，`copy` 作用的是文档选区，不是焦点元素。
  - 情形：用户先在正文预览或对话消息里选中文字，再打开设置、模型编辑等对话框。Base UI 用 `initialFocus` 程序化聚焦，不会清掉原选区。此时按 Cmd+C，`event.target` 是对话框里的按钮，`textSurface` 返回 static，复制的是对话框背后的文字。
  - 已有代码在两处明确禁止跨对话框操作文本：菜单命令路径 `DesktopCommandController.tsx:50`（`text.*` 的目标必须在对话框内），右键菜单 `text-context-menu.ts:44`（`activeTextDialogs` 不包含目标就不开）。
- 右键菜单对“静态文字”的定义比方案严格（`text-context-selection.ts:5-13`）：只认 `[data-text-preview]`/`[data-text-input]`，`user-select:none` 的目标直接返回 null，复制文本按来源根节点裁剪（`readTextContextRange`，`:17-31`）。方案的 static 不做裁剪，选区跨过面板 UI 时，键盘复制和右键复制会得到不同的文字。
- 方案的定义和测试也自相矛盾：§1.1 说“其他元素 + 有选区”算 static，TS-01 却写“button → none”。
- 建议：
  - static 改为“选区的两端都在同一个 `textContextSourceAt` 根内”。有对话框时，这个根还必须在 `activeTextDialogs(document)` 里的某个对话框内。
  - 复制内容用 `readTextContextRange` 的结果，和右键菜单一致。
  - 测试补：对话框打开且背景有选区时 Cmd+C 不复制；选区跨 `[data-text-preview]` 和 UI 时，复制结果和右键菜单一致。

### P1-3 “目标未启用 → 原生执行”把拒绝变成执行

- 方案 §1.2：`desktopCommandTargets.enabled(id, target)` 为真就执行目标，否则调用 `nativeEdit`。`CommandTargets.resolve` 在两种情况下都返回 null（`command-targets.ts:8-13`）：没有目标接受这个焦点，或者有目标接受但 `enabled()` 为假。方案把这两种情况当成一种。后者是目标明确拒绝，原生执行会绕过它的判断：
  - **正文预览**：`preview-text-commands.ts:14-19` 在 `handle` 缺失或 `hasSelection` 为假时禁用 `text.copy`。预览目标被禁用后，兜底会用原生复制整段 DOM 选区，批注、伏笔标记这些界面文字也会被复制进去，和 E4“只复制正文”直接冲突。
  - **只读 Monaco**：`createMonacoCommandTarget` 对只读编辑器屏蔽剪切和粘贴（`monaco-commands.ts:129`、`:189`）。而 TS-01 把 `.native-edit-context` 一律归为 editable，不看 `readOnly`。只读编辑器存在于 `StoryTaskNavigationPanel.tsx:119`（`readOnly={busy}`）和预览模式中。Cmd+V、Cmd+X 会经原生路径进入 Monaco 的粘贴、剪切事件，违反 R4。
  - **消息输入框**：`composer-text-commands.ts:11-17` 在输入法组合中禁用全部命令。keydown 已检查 `isComposing`，这条风险较低，但规则同样应该是“目标拒绝就不执行”。
- 方案的根因表里“正文预览选中文字 Cmd+C 不复制”这一行没有解释。捕获阶段已经有 `previewMatch`（`DesktopCommandController.tsx:88`），单元测试 MONACOCTRL48-06（`monaco-command-controller-review.test.ts:103-116`）断言预览 Cmd+C 被拦截并执行。真实应用里没复制，说明 `previewMatch` 为假：要么预览目标未启用，要么焦点不在预览正文内。原因不弄清楚，兜底只会把它改成原生复制，掩盖问题。
- 建议：
  - `CommandTargets` 增加“是否有唯一目标接受该焦点”的查询。有目标接受但未启用时，不执行，也不走原生；是否 `preventDefault` 按 R4 决定，见 P2-1。
  - 只有没有任何目标接受时，才进入 P1-1 说的同步原生路径。
  - textSurface 对 Monaco 用 `editor.getRawOptions().readOnly` 判断（可以从已注册的 Monaco 目标查询），只读时归为 readonly。
  - 根因表补上预览一行的实测原因（焦点元素、`commandScope` 结果、`available("copy")` 的值）。

## P2

### P2-1 Windows 现状没有证据，兜底会替换 Windows 上的原生路径；R4 与 C1 在 Windows 上仍不成立

- 方案第 31 行：“Windows 上 Chromium 在渲染进程自己处理 Ctrl+C，但同样走不到我们的命令目标。”根因表只有 macOS 的结果。Windows 主窗口 `setMenu(null)`（`index.ts:960`），Ctrl+C/V/X/A/Z/Y 由 Blink 作为 keydown 的默认动作处理。`setIgnoreMenuShortcuts` 不影响这一层。所以 Windows 上这些键现在很可能本来就能用。
- 关于“会不会重复执行”：Blink 的编辑命令在 keydown 派发全部结束后才执行，冒泡阶段调用 `preventDefault` 能抑制它，不会重复粘贴或复制。问题在另一面：
  - 方案在 Windows 上把可用的同步原生路径换成了异步目标或 IPC 路径，多出 `isFocused()` 失败、焦点竞争、提示条这些新的失败方式，而且没有 Windows 真实验证（方案第 145 行）。
  - **R4**：不允许的表面方案“不 preventDefault”。Windows 上 Ctrl+A 在静态文字处仍会由 Blink 全选整页，Ctrl+Z 也照常交给原生，和 R4“不可编辑文本只复制”不一致。macOS 上这些键本来就什么都不做，所以只有 Windows 有这个问题。
  - **C1**：作用域 none 时，捕获阶段的 `active` 和 dispatcher 的 `configurationFor` 都会滤掉 `text` 作用域的命令（`shortcuts.ts:80`、`shortcut-dispatch.ts:10`），`removedDefault` 为假，结果是 `none`，不会 `preventDefault`。用户删除 `text.copy` 的 Ctrl+C 以后，Windows 静态文字上 Blink 仍会复制。方案 §1.2 说“删除的默认键：捕获阶段 removedDefault → blocked → preventDefault”，这句只在 input、composer、markdown 作用域成立，在 none 下不成立。macOS 结果碰巧正确，是因为 `matchTextShortcut` 遇到空绑定返回 null，不是因为捕获阶段拦截了。
- 建议：
  - 先用真实按键在 Windows 上测一次现状。
  - 兜底匹配到文本命令的默认键或旧键、但表面不允许时，统一 `preventDefault`（不执行）。这样 R4 和 C1 在两个平台一致。
  - 方案改正 C1 的推理，CTRL598-07 增加 win32 一组。

### P2-2 冒泡兜底会被 React 的 `stopPropagation` 挡住；各处键盘处理的核对结果

React 的合成事件调用 `stopPropagation()` 时也会停止原生事件，事件不会冒泡出 React 根容器，window 冒泡监听收不到。按方案逐项核对如下。

不调用 `preventDefault`、只调用 `stopPropagation`，而且对所有键生效的有：

| 位置 | 元素 | 影响 |
|---|---|---|
| `src/components/layout/ChatPanel.tsx:1964` | 选择小说下拉里的“搜索小说”输入框，在 `DropdownMenuContent`（role=menu）内 | Cmd+C/V/X/A/Z 全部仍然失效，R2 未满足 |
| `src/components/layout/SidebarTree.tsx:318` | 侧栏节点操作区 span | 焦点在操作按钮上时，Cmd+C 复制选区不执行 |
| `src/components/content/LevelSystemEditor.tsx:285`、`:418` | 菜单触发按钮 | 同上 |
| `src/components/content/character-arc/arc-chain.tsx:203` | 菜单触发按钮 | 同上 |

只对特定键调用 `stopPropagation`、不影响这 7 个文本键的有：Base UI `DialogPopup.mjs:73-76`、`MenuPopup.mjs:91-94`（只处理方向键和 Home/End）；`NumberFieldInput.mjs` 遇到 Ctrl/Meta 先 return（`:287`）；`ComboboxInput.mjs:305-318`（方向键和 Escape）；`ModelChoiceSelect.tsx:12-16`、`TaskReferenceInput.tsx:29-31`、`CommentComposer.tsx:56`、`AppearanceNumber.tsx:15`、`DesktopPromptHost.tsx:43-46`（Escape 或 Enter）。

故意同时调用 `preventDefault` 和 `stopPropagation` 的有：Monaco 键位服务，只在自己处理了这个键时才调用（`standaloneServices.js:262-268`）；录制快捷键（`ShortcutSettings.tsx:44-51`、`:127-130`）。

为无关原因对这 7 个键调用 `preventDefault` 的：没有找到。全仓库没有对 `c/v/x/a/z/y` 键单独处理的 keydown；Base UI 的类型搜索遇到 Ctrl/Meta 会跳过（`useTypeahead.mjs:81`）。

Monaco 查找框（input，作用域为 input）：Cmd+Z、Cmd+A 由 Monaco 的 `undo`、`editor.action.selectAll` 处理，这两个命令没有 when 条件，在输入框上走 `generic-dom-input-textarea` 实现（`coreCommands.js:237`），处理后 `stopPropagation`，兜底收不到，结果正确。Cmd+C/V 由 `installInputCommands` 接手，查找框不在排除列表 `input-commands.ts:18` 里。

建议：

- 核对结果说明，除 Monaco 外没有组件消费这 7 个键。所以作用域为 none、input、composer、preview、worldline-search 时，可以直接在**捕获阶段**处理，不受 `stopPropagation` 影响。只有 markdown（含 Monaco 查找框所在的编辑器容器）留在冒泡阶段，因为要让 Monaco 先处理。
- 如果仍放在冒泡阶段，要逐个修改上表四处，并加浏览器用例。
- 方案要明确：捕获阶段跳过 `[role="menu"],[role="listbox"],[data-slot="select-content"]`（`DesktopCommandController.tsx:62`），兜底要不要也跳过。上表第一行正好是菜单里的输入框，应该允许编辑。

### P2-3 焦点在 body 时用 `activeElement` 补位没有作用；禁用输入框的选区处理不到

- keydown 的 `event.target` 就是 `document.activeElement`，target 是 body 时 activeElement 也是 body。方案“不是 body/html 就用 event.target，否则用 activeElement”实际上不起作用。
- 禁用的输入框不能获得焦点。TS-01“disabled input → readonly”假设 target 是那个输入框，keydown 里不会出现这种情况。禁用框里的选区在内部影子 DOM 中，`document.getSelection()` 看不到它的内容。右键菜单为此专门记录了 `nativeSource`（`text-context-menu.ts:14-28`）。
- 建议：复用 `nativeSelectionOwned` 的做法，或者在方案里写明禁用输入框不支持快捷键复制。TS-01 改成可以实现的输入。

### P2-4 测试分辨不出修复前后，已有断言的含义会变

- 方案第 27 行已经指出，macOS 上 Playwright `keyboard.press` 会带上编辑命令，绕过问题。TSB-01 的 Meta+a、Meta+z 在修复前也能通过，TSB-02、TSB-03 也只在“内存剪贴板有没有写入”这一点上有区分。建议浏览器用例用 CDP `Input.dispatchKeyEvent`、不带 `commands` 字段，或者同时断言 `defaultPrevented` 和目标调用次数。
- 控制器单元测试的事件派发在 window 上，Node 的 `EventTarget` 没有捕获和冒泡阶段，监听按注册顺序执行（`desktop-command-controller.test.ts:50` 一类的 `window.dispatchEvent`）。CTRL598-04 只能用“中间插一个监听”模拟，模拟不了 P2-2 的 `stopPropagation`。P2-2 要有浏览器用例（真实 React 组件加 Monaco 查找框）。
- 已有断言里，“未改动的键交给原生”这条含义会变，方案应逐条列出并说明新的期望：
  - `tests/browser/api-key-clipboard.test.ts:8`、`:49-57`（K01/K04 的“undo/redo stay native”），改动后会经过 `installInputCommands` 目标执行。
  - `tests/unit/monaco-command-controller-review.test.ts:126`（普通输入框 Cmd+C 断言 `defaultPrevented === false`），兜底后会变成 true。
- TS-03 的期望应基于 `desktopCommandCatalog`，不是静态的 `platformCommands`。Monaco 运行时会把自己的绑定合并进 `text.*` 的默认值（`command-runtime.ts:33-39`）。例如 win32 上 Monaco 的 redo 有第二绑定 Ctrl+Shift+Z（`editorExtensions.js:441-443`），合并后 Ctrl+Shift+Z 在任何文本表面都会匹配 `text.redo`。

### P2-5 真实目标验证不满足 AGENTS.md

- E6 用面板文字代替 AI 对话消息，AGENTS.md 不允许把替代验证记为通过。驱动目录里已有 `conv.mjs`，可以在隔离根里写入一条已存储的对话（含 assistant 消息），不需要模型，就能验证真实的对话消息渲染（`ChatPanel.tsx:333` 的 `data-text-preview`）。
- `BrowserWindow.prototype.isFocused` 是打桩，主进程的聚焦检查在真实目标上没有验证。台账要记为“模拟”。如果采用 P1-1 的建议，这一项就不再需要。
- 方案没有覆盖的真实场景：Cmd+Shift+V、Cmd+Shift+Z、世界线搜索框、Monaco 查找框、只读 Monaco、`type=number` 输入框、API Key 遮罩框（K01）、设置里改绑或删除后（C1）、录制中、对话框背后有选区、P2-2 的下拉搜索框。
- Windows 只有单元测试和浏览器夹具。按 P2-1，Windows 行为会变，台账要写明“Windows 未在真实目标验证”。

## P3

### P3-1 安全：增量风险不大，但现有的 HTML 渲染要另外记录

- `trusted()`（`index.ts:147-149`）只放行主窗口主框架、`shakeink://app`，再加上 `isFocused()`。外部页面不能调用这个 IPC。
- 已有的风险：`src/lib/markdown.ts:22` 明确不做 sanitize，AI 回复经 `dangerouslySetInnerHTML` 渲染（`ChatPanel.tsx:284`、`:333`，`MarkdownPreview.tsx:27`，`CommentablePreview.tsx:144`）。CSP 是 `script-src 'self' 'unsafe-inline'`（`desktop/main/static-ui.ts:14`），`<img onerror>` 这类内联处理器能执行。也就是说，模型输出的 HTML 本来就能在主框架里调用 `window.desktop.readClipboardText()`。`nativeEdit` 在此基础上增加了对当前焦点控件 cut/paste/undo/selectAll 的能力。增量不大，但这个问题应单独记录，不在本方案里扩大。
- 保留 IPC 时，主进程处理再加两项检查：`closingFlow || businessGate.closed` 时拒绝（和 `desktop:input-context-menu` 一致，`index.ts:645-650`），用 `webContents.isFocused()` 代替只检查窗口级 `isFocused()`。

### P3-2 世界线作用域的规则例外要写明

`shortcuts.ts:72-80` 注释说“dispatcher 与 controller 共用这一条规则”：世界线画布上 `text` 命令不启用。兜底不经过 `shortcutScopeEnables`，等于在世界线画布、卡片上启用了文本命令。实际影响很小（只有有选区时复制），但方案应写明这是有意的例外，或者在 worldline 作用域内跳过兜底。

### P3-3 多键组合绑定

`matchTextShortcut` 不处理多键组合。用户把 `text.copy` 改绑成 `Cmd+K C` 后，作用域 none 下捕获阶段不处理 text 命令，兜底也不认组合键，这个绑定在静态文字上永远不生效。设置界面允许录制组合键，所以方案要么支持组合键，要么在 C1 里写明这个限制。

## 复审（修订 1）

审核对象：方案 §3（修订 1，第 147–271 行），同时审技术方案和 §3.6 测试用例。只读，未改源码和测试。

已执行：
- Node v24.18.0 下 `node --import tsx --test tests/browser/api-key-clipboard.test.ts`，4/4 通过（基线）。
- 临时探针 `/private/tmp/review-598/probe.mjs`、`probe2.mjs`（仓库外），macOS arm64，Playwright headless Chromium 153.0.8010.12：
  - CDP `Input.dispatchKeyEvent` 不带 `commands` 发 Meta+C/A/X：没有 copy/cut/beforeinput 事件，值和选区都不变。
  - 带 `commands:["copy"]`、`["cut"]`：copy、cut 都发生。
  - Playwright `keyboard.press("Meta+a")`、`("Meta+z")`：发生全选和 `historyUndo`。
  - keydown 捕获阶段 `preventDefault` 后，Playwright 的 Meta+C/X/A/Z 都不再执行。
  - 结论：不带 `commands` 的 CDP 按键在本机能重现 macOS 的缺陷，P2-4 的测试手段成立。

### 结论

第一次审核的 3 个 P1 都已按建议处理：不新增 IPC；取源规则改为同一来源根加对话框屏障；目标拒绝时不再走原生。但修订 1 带来 1 个新的 P1：没有 `data-text-preview` 标记的可选文字，复制会被拦下且什么都不做，Windows 上会比现在更差。这一条要先改。另有 5 个 P2，涉及 Monaco 改绑、粘贴撤销粒度、菜单内输入框的删除键、测试观测点和多目标回退。

### 初审各项的处理情况

| 初审项 | 状态 | 说明 |
|---|---|---|
| P1-1 原生编辑 IPC | 已解决 | 不新增 IPC。DOM 来源的复制走已有的 `writeClipboardText`（`text-context-selection.ts:69`），写入的是 keydown 时捕获的文本，不依赖 IPC 返回时的焦点。主进程的 `isFocused()` 检查（`desktop/main/index.ts:638`）在用户真实按键时成立，可以接受 |
| P1-2 static 越过对话框 | 基本解决 | 同一来源根加 `activeTextDialogs`（§3.2 第 166–169 行）。TSB-03 的期望和这条规则冲突，见 P2-6。规则收窄后带来新的 P1-A |
| P1-3 拒绝变成执行 | 已解决 | `owner()` 返回 disabled 时不执行。预览一行已补实测原因（§3.1）。只读 Monaco 由适配器拒绝（`monaco-text-context.ts:23-24`）。“两个注册都接受时返回 none”是新问题，见 P2-5 |
| P2-1 Windows / R4 / C1 | 部分解决 | 不允许的命令和 `removed` 都会 `preventDefault`，R4 和 C1 在作用域 none 下成立。菜单内输入框的删除键仍会漏过（P2-3）。Windows 仍没有实测，§3.5 写明了这一点 |
| P2-2 stopPropagation | 已解决 | 除 markdown 外都移到捕获阶段。TSB-05 覆盖了 `ChatPanel.tsx:1964` |
| P2-3 body 补位、禁用框 | 已解决 | 改为取选区起点所在元素；禁用框的情况写入限制 |
| P2-4 测试区分度 | 基本解决 | CDP 不带 `commands`（已验证有效），已有断言的变化已列出。漏了 K03/K07，见 P3-4 |
| P2-5 真实目标覆盖 | 部分解决 | E6 改为真实的已存储对话，新增 E7–E9。世界线搜索框、只读 Monaco、`type=number`、API Key 遮罩框（K01）、录制中、Monaco 查找框仍然没有真实应用用例；E1、E3 没有 Cmd+Shift+V / Cmd+Shift+Z |
| P3-1 sanitize | 部分解决 | §3.5 说“单独记录”，没有写记录在哪里（台账条目或问题编号） |
| P3-2 世界线例外 | 已解决 | 表格第 193 行写明了 |
| P3-3 组合键 | 已解决（作用域 none） | markdown 作用域下改绑同样无效，见 P2-1 |

### P1

#### P1-A 未标记的可选文字：复制被拦截且什么都不做，Windows 上是回归

- §3.3 第 180 行：先 `preventDefault(); stopImmediatePropagation()`，第 182 行“有来源且允许才执行，否则不执行”。来源只认 `textContextSourceAt`，也就是 `[data-text-preview],[data-text-input]`、输入框和 contenteditable（`text-context-selection.ts:5-13`）。
- 实际覆盖范围：`src/components/content/*.tsx` 46 个文件里只有 12 个有 `data-text-preview`，`SidebarTree.tsx` 一个也没有。面板标题、表格单元格、表单说明、侧栏文字等都没有来源。
  - 跨两条对话消息的选区：每条消息是各自的 `data-text-preview` 根（`ChatPanel.tsx:333`），两端不在同一个根里，也没有来源。
- 结果：
  - macOS 上这些选区按 Cmd+C 仍然复制不了，R1“所有可框选的文本都能复制”没有满足。方案没有把这一点列为限制，也没有请用户确认范围。
  - Windows 上现在 Blink 会在 keydown 默认动作里复制任意选区（`setMenu(null)`，`index.ts:960`）。修订 1 改成先 `preventDefault` 再找不到来源，Ctrl+C 从“能复制”变成“没有反应”。这是已有功能的回归，而 §3.5 只说“Windows 真实目标未验证”。
- 建议二选一，写进方案：
  1. 作用域 none 且没有来源、没有对话框、选区非空时，对 `text.copy` 在 keydown 里同步调用 `document.execCommand("copy")`（有用户激活，`native-text-edits.ts:106-107` 已经这样用）。复制的是用户看到的选区，只复制、不改内容，不违反 R4。有对话框时仍要求来源在对话框内。
  2. 不做兜底，就把 R1 的范围改为“有文本来源标记的文字”，在 §3.5 和台账里写明，并请用户确认。同时没有来源时不要 `preventDefault`，保留 Windows 现有行为。
- 测试补充：面板里无标记的文字、跨两条消息的选区、侧栏文字，按 Cmd+C 各自的期望。

### P2

#### P2-1 Markdown（Monaco）里改绑复制、剪切、粘贴后，新键不生效（C1）

- markdown 冒泡路径只处理“Monaco 未消费的默认键”（§3.3 第 194 行）。用户把 `text.copy` 改成 Cmd+Alt+C 后，按键流程如下：
  - 捕获阶段 `customized` 为真，进入 dispatcher。
  - dispatcher 的 `enabled` 走 `desktopCommandTargets.enabled`（`DesktopCommandController.tsx:102`）。浏览器版 Monaco 的剪贴板命令没有目录行，也就没有处理函数（§3.1 的实测：菜单路径返回“此命令在当前视图不可用”）。
  - 于是 `exact` 为空、`matched` 非空，结果是 `blocked`（`shortcut-dispatch.ts:34-45`），新键被拦截，什么都不执行。
- 作用域 none 下 CTRL598-06 覆盖了改绑，markdown 作用域没有覆盖。§3.5 只说“组合键在 none 作用域不生效”，没写到这一条。
- 建议：
  - markdown 作用域下，`text.copy/cut/paste/pastePlain` 无论是默认键还是改绑键，都交给 `captureRegisteredTextContext` 执行。
  - 或者让 dispatcher 在 markdown 作用域下对这四个命令改用 Monaco 文本适配器判断可用性。
  - 补用例：Monaco 中 `text.copy:["Cmd+Alt+C"]` 后，Cmd+Alt+C 能复制，Cmd+C 不复制。
- 另外第 198 行说 Monaco 目标“会被当作 disabled 拒绝”。按 `createMonacoCommandTarget` 的实现，没有对应行时 `commands[id]` 不存在，`resolve` 不会选中它，`owner()` 返回的是 none，不是 disabled。结论一样（markdown 不经过步骤 2），理由要改正。

#### P2-2 Monaco 粘贴用 `type` 处理器：撤销会和前面的输入合并

- `monaco-text-context.ts:41` 的粘贴是 `editor.trigger(..., 'type', {text})`，走 `typeWithoutInterceptors`。它的操作类型是 `TypingOther`（`cursorTypeEditOperations.js:869-877`）。前一个操作也是普通输入时，`shouldPushStackElementBetween` 返回 false（`:878-890`），不插入撤销点。
- 结果：先输入几个字，再 Cmd+V，再 Cmd+Z，粘贴和前面输入的字会一起撤销。多光标时每个光标插入整段文本，Monaco 原生粘贴是按行分配给各光标。右键菜单使用频率低，这个问题不明显；快捷键粘贴很常用，会直接被用户感觉到。
- 建议：键盘粘贴改用 `editor.trigger(src,'paste',{text,pasteOnNewLine:false,multicursorText:null})`（`codeEditorWidget.js` 中 `Handler.Paste` 分支），或者在前后各调用一次 `pushUndoStop()`。
- TSM-01 补：输入“ab”，粘贴“XY”，Cmd+Z 后只剩“ab”。
- 这一处改动会同时影响右键菜单，要回归 `tests/browser/monaco-text-context.test.ts`。

#### P2-3 菜单内输入框：被删除的默认键仍会漏过

- §3.3 第 191 行：菜单内输入框的文本路径要求“没有其他命令匹配（含 customized）”。用户删除 `text.copy` 的 Cmd+C 后，Cmd+C 正好是 `customized`。于是文本路径不处理，后面又在 `DesktopCommandController.tsx:62` 的 `[role="menu"]` 处早退，不会 `preventDefault`。
- macOS 上碰巧什么都不发生；Windows 上 Blink 仍会复制。C1 在菜单内输入框不成立。§3.3 第 185 行“`removed` 只 preventDefault”和第 191 行的条件相互矛盾。
- 建议：
  - `textShortcutFor` 返回 `removed` 时，任何作用域（包括菜单内输入框）都直接 `preventDefault`，不受 customized 条件限制。
  - 菜单内输入框的改绑新键也要能执行：dispatcher 在 `:62` 之后，菜单内的输入框到不了 dispatcher。
  - CTRL598-07 增加删除和改绑两组。
- 实现上，第 191 行的位置要在 `:62` 之前就算出 `active/globalMatch/customized` 等值，等于把 `:73-92` 提前。建议只写一个文本路径的入口，不要在 `:62` 前和 `:95` 前各写一份。

#### P2-4 浏览器用例的观测点不对：普通输入框和 Monaco 的复制不经过内存剪贴板

- §3.6 第 236 行“剪贴板为内存桥”，TSB-01“Meta+c 写入选中文本”，TSM-01“Meta+c 写入”。实际路径：
  - 普通 `Input` 的复制和剪切走 `installInputCommands` → `nativeTextEdits.run`。非消息输入框的 copy/cut 是 `document.execCommand("copy"/"cut")`（`native-text-edits.ts:104-107`），写的是 Chromium 的系统剪贴板，不调用 `writeClipboardText`。
  - Monaco 的复制、剪切是 `clipboardCopyAction/CutAction` → `execCommand('copy')`（`clipboard.js:171-178`），同样不经过桥。
  - 只有 DOM 来源（预览段落、`type=number/email`、消息输入框）走 `writeText` 桥。
- 按现在的写法，TSB-01 和 TSM-01 的复制断言实现后也会失败，或者被迫改成别的断言。
- 建议：
  - 这两类改为断言 `copy`/`cut` 事件发生，以及 `clipboardData` 里的内容（在 window 冒泡阶段读 `event.clipboardData.getData('text/plain')`）。
  - 或者读 headless 的系统剪贴板。
  - 每条用例写明它属于哪条路径。
  - 已有 K03/K07 的“Plaintext copy falls through to Chromium”断言（`api-key-clipboard.test.ts`，`copyEvents===1`）也属于 execCommand 这一类，见 P3-4。

#### P2-5 多个注册同时接受时，`owner()` 返回 none 会回退到另一条执行路径

- TS-04：“两个注册都接受 → none（与 resolve 的唯一性一致）”。按 §3.3 步骤 3，none 会进入 `captureTextShortcut` 并执行 DOM 来源。
- `command-targets.ts:3-4` 的约定是“exactly one visible owner may accept… Never fall back to a different editor”。多个注册同时接受说明归属不清，应当拒绝，不应换一条路径执行。
- 建议：多个注册都接受时返回 disabled（不执行，`preventDefault`），TS-04 的期望改为 disabled。

#### P2-6 TSB-03 的期望和同一来源根规则冲突

- §3.2 第 168 行：选区两端必须在同一个来源根内。TSB-03：“选区跨段落与按钮 UI 时，写入的文字与右键菜单复制一致”。
- 右键菜单不要求两端在同一个根内：它在 `readTextContextRange`（`text-context-selection.ts:17-31`）里把选区裁剪到点击处的那个根，再复制裁剪后的部分。
- 所以选区一端落在根外的界面上时：按方案，键盘没有来源，什么都不复制；右键菜单复制裁剪后的那部分。两者不一致。
- 要选一种规则写清楚：
  - 和右键一致：以选区起点所在的根为来源，允许裁剪。注意 `readTextContextRange` 在未包含的选区上会临时改写再恢复选区（`:27`），会触发 `selectionchange`。
  - 或者保留同一根规则，把 TSB-03 改成“跨出根时不复制”，并和 P1-A 一起考虑。

### P3

- **P3-1 复制完成后再校验，会误报失败。** DOM 来源的 copy 先写剪贴板，再调用一次 `assertCurrent()`（`text-context-selection.ts:69`）。快捷键的 `assertCurrent` 包含 `isCurrent()`（innerHTML 和选区）和 `hasFocus()`。用户按完 Cmd+C 马上点别处，或者消息还在流式更新时，剪贴板已经写入，却仍会弹“文本操作未完成”。建议键盘复制在写入后不再校验，或者只在写入前校验。
- **P3-2 `type=number/email` 的粘贴只有快照校验。** 走 DOM 来源时，`execute` 读剪贴板后只检查 `isCurrent()`（`:80`）。它没有右键菜单那样的 epoch 和 MutationObserver，值经过 A→B→A 变化时，迟到的粘贴仍会写入。影响小，在方案里注明即可。
- **P3-3 按住重复的键（`event.repeat`）没有定义。** 例如按住 Cmd+Z 连续撤销，按住 Cmd+V 时可能有多次异步读取排队。方案要写明 `text.undo/redo` 是否允许重复，`paste` 是否只执行一次。
- **P3-4 已有断言漏列。** `api-key-clipboard.test.ts` K03/K07 的 `page.keyboard.press(nativeCopy)` 后断言 `copyEvents===1`，信息是“Plaintext copy falls through to Chromium”。改动后它经过 `installInputCommands` 再调用 execCommand，值不变，但含义变了，应列入 §3.4。`desktop-command-controller.test.ts:116`（无修饰键的 x）不受影响。
- **P3-5 CTRL598-04 在 Node 夹具里分不出阶段。** Node 的 `EventTarget` 在 window 上按注册顺序调用监听，捕获和冒泡监听都在目标阶段执行。事件派发前就调用 `preventDefault` 时，两个监听同样看到已取消，分不出“捕获阶段不处理”。阶段顺序要靠 TSM-01 这类浏览器用例证明，CTRL598-04 只断言执行次数。
- **P3-6 合并目录取决于是否已加载 Monaco。** TS-01 的 win32 Ctrl+Shift+Z 来自 Monaco 合并进来的默认键（`command-runtime.ts:22-41`），只有 Monaco 目录发布之后才有。没有打开编辑器时，输入框里的 Ctrl+Shift+Z 是否算重做，要写明。用例要分“已发布 / 未发布”两种。
- **P3-7 真实应用用例的可行性。**
  - E6 可行：驱动目录里 `conv2.mjs` 已经在隔离根里打开名为“复制测试对话”的已存储对话，并拖选了消息。要写明写入方式：`Conversation`/`Message` 表，`prisma/schema.prisma:984`、`:1027`；`userId` 用本地账户；assistant 消息的 `parts` 结构要和真实生成的一致。复制隔离根后要按已知做法移走 `inbox/.shakeink-lease-recovery.json`，否则启动时报 AUDIT_CHANGED。
  - E8 可行：设置里的删除按钮 `aria-label="删除 复制 的 Cmd+C"`（`ShortcutSettings.tsx:118`），“恢复默认”会清除当前系统的全部自定义（`:153`），删除后立即保存。建议加一组改绑：录制 Cmd+Alt+C 后执行复制。
  - E5 写的是“侧栏的 data-text-preview 文字”，但 `SidebarTree.tsx` 里没有这个标记，只有悬停卡（`SidebarHoverCard.tsx:102`）有。要写明具体元素。
- **P3-8 证据和台账。**
  - §3.1 引用了 `probe-r1.mjs` 的结果，但没有给出证据文件路径。AGENTS.md 要求结论有命令结果作证据。
  - 方案没写 598 在 `requirements-traceability.json` 里的条目（R1–R4、C1–C3 对应哪些测试 ID）。
  - Windows 的“未在真实目标验证”和 P3-1 的 sanitize 记录，都应落到台账。

### 第 2–3 项的可行性核对

- **keydown 里能否同步调用取源函数。** `captureRegisteredTextContext`、`textContextSourceAt`、`captureDOMTextContext` 都是同步的，可以在 keydown 里调用。副作用如下：
  - `readTextContextRange` 在选区未被来源完全包含时，会临时 `removeAllRanges/addRange` 再 `setBaseAndExtent` 恢复，会排入 `selectionchange`。目前只有 `text-context-menu.ts` 监听它，没有别的副作用。按同一根规则，这种情况不会发生。
  - MutationObserver 是 `installTextContextMenu` 自己创建的，`captureDOMTextContext` 不创建，快捷键路径不需要 `dispose`。
- **执行前要不要先 `restore()`。** 不需要：焦点已经在来源上，copy 不需要恢复；`cut`、`paste`、`undo` 在 `execute` 内部会自己调用 `restore()`（`:69`、`:75`）。Monaco 的 copy/cut 用 `trigger` → `_triggerCommand` 同步执行 `execCommand('copy'/'cut')`，在 keydown 内有用户激活。
- **`stopImmediatePropagation` 是必需的。** `nativeTextEdits` 在 document 捕获阶段对 keydown 做 `epoch++`（`native-text-edits.ts:42-43`）。window 捕获阶段的执行会同步记下 `revision`，如果不阻止传播，同一个 keydown 随后让 epoch 加一，粘贴会以“输入目标已变化”失败。现有的 K05 改绑粘贴能通过，靠的就是 `:104` 的 `stopImmediatePropagation`。方案步骤 1 保留了它，实现时不能去掉。
- **对菜单和列表框的影响。** 只对“可编辑文本控件并命中文本键”提前处理，不影响菜单项、列表框的方向键和类型搜索。Base UI 的类型搜索遇到 Ctrl/Meta 本来就会跳过。
- **Monaco 查找框。** 它的作用域是 input，由 `installInputCommands` 接手（它不在 `input-commands.ts:18` 的排除列表里）。Cmd+Z/A 改由我们执行 execCommand undo 和 setSelectionRange，和 Monaco 原来在输入框上的实现等价。TSM-03 合理。
- **`owner()` 在 IME 和 API Key 上返回 disabled，会不会破坏 K01–K07。**
  - 遮罩框的 copy/cut/paste 由 `keyClipboardMatch` 先交给 dispatcher：copy 被拒绝后结果是 `blocked`，paste 照常执行。
  - undo/redo 由文本路径交给 `installInputCommands`，同步执行 `execCommand`。
  - K05 改绑走 `customized`。K06 是菜单路径，不受影响。
  - 消息输入框在 IME 组合中，keydown 已经因为 `isComposing` 早退。
  - 结论：K01–K07 不受影响。

### 第 6 项：与 AGENTS.md、implementation-boundaries.md 的一致性

- 复用真实组件，不新增 HTTP 或 IPC，没有模拟界面进入产品，这几点符合要求。
- 不符合或要补的地方：
  - P1-A 收窄了 R1，没有请用户确认。
  - Windows 没有原生验收（implementation-boundaries 要求两个平台各自做原生验收），已写为限制，台账要据实记为未验收。
  - P3-8 的证据路径和台账条目缺失。

修完 P1-A 和 P2-1 至 P2-6 后，可以进入测试用例定稿和 TDD。
