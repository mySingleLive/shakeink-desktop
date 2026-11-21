# 598 · 文本复制粘贴快捷键 技术方案与测试用例

来源：用户 2026-11-21 修复要求“文本复制粘贴的快捷键失效”。基于 `64255ae`。范围经用户确认为“剪贴板 + 全选 + 撤销/重做”。

## 需求

| # | 内容 |
|---|---|
| R1 | 所有可框选的文本（输入框、不可编辑但可框选的文本、AI 对话消息）都能用 Cmd+C（macOS）/ Ctrl+C（Windows）复制 |
| R2 | 输入框（input、textarea、消息输入框、Markdown 编辑器）还能用 Cmd/Ctrl+V 粘贴、Cmd/Ctrl+X 剪切、Cmd/Ctrl+Shift+V 粘贴为纯文本 |
| R3 | 输入框内 Cmd/Ctrl+A 全选、Cmd/Ctrl+Z 撤销、Cmd+Shift+Z / Ctrl+Y 重做 |
| R4 | 不可编辑文本只复制：粘贴、剪切、撤销、全选在不可编辑文本上不做任何事 |
| C1 | 用户在“设置 → 快捷键”改绑或删除的绑定照旧生效：删除默认键后该键不再执行；改绑后新键执行 |
| C2 | API Key 密码框遮罩时不能复制、剪切（K01–K07 不变）；录制快捷键时不执行 |
| C3 | 不新增 HTTP 监听；主进程只接受受信主窗口、聚焦时的请求 |

## 根因（真实应用复现）

驱动 `~/shakeink-test-roots/copy-paste-598/drivers/`，隔离根，用 `webContents.sendInputEvent` 发送真实按键（Playwright `keyboard.press` 走的是 CDP 编辑命令，会绕过问题）。改动前：

| 位置 | Cmd+C | Cmd+V | Cmd+A | Cmd+Z |
|---|---|---|---|---|
| 引导对话框笔名输入框 | 不复制 | 不粘贴 | — | — |
| 消息输入框 | 不复制 | 不粘贴 | 不全选 | 不撤销 |
| 正文预览选中文字 | 不复制 | — | — | — |
| Markdown 编辑器（Monaco） | 不复制 | 不粘贴 | 正常 | 正常 |
| `[data-text-preview]` 静态文字 | 不复制 | — | — | — |

keydown 事件到达渲染进程，`defaultPrevented` 为假，没有 copy/paste 事件产生。

1. `desktop/main/index.ts:930` 调用 `setIgnoreMenuShortcuts(true)`，且菜单项 `text.*` 没有 `role`。macOS 上 Chromium 的复制粘贴、全选、撤销来自应用菜单（NSResponder），所以默认按键什么都不做。Windows 上 Chromium 在渲染进程自己处理 Ctrl+C，但同样走不到我们的命令目标。
2. `src/components/desktop/DesktopCommandController.tsx:95`：作用域为 input、composer、markdown 且绑定未改动时直接 `return`，交给“原生”处理；作用域为 none（静态文字、对话消息）时 `text` 作用域的命令不启用（`shortcutScopeEnables`），也交给原生。原生不存在，于是失效。
3. Monaco 在非 Node 渲染进程（`isNative` 为假）不注册 Cmd+C/V/X 键位，依赖浏览器原生；撤销和全选由 Monaco 自己的键位处理，所以正常。

已验证可行的执行方式：主进程 `webContents.copy()/cut()/paste()` 在消息输入框、Monaco、静态文字上都能正确复制粘贴（消息输入框的 onCopy/onPaste 照常接管序列化）；`webContents.selectAll()` 在消息输入框不生效，`webContents.undo()` 在 Monaco 不生效。已注册的命令目标（输入框 `installInputCommands`、消息输入框 `installComposerTextCommands`、预览 `installPreviewTextCommands`）通过菜单路径执行时都正常。

## 1 方案：冒泡阶段的文本快捷键兜底

保留现有捕获阶段的分派（自定义绑定、API Key、预览、Markdown 等逻辑不动）。在 window 冒泡阶段新增兜底，只处理 7 个文本命令：`text.copy`、`text.cut`、`text.paste`、`text.pastePlain`、`text.selectAll`、`text.undo`、`text.redo`。

冒泡阶段在所有组件之后执行：Monaco 已处理的撤销、全选，或捕获阶段已执行/拦截的键，`defaultPrevented` 为真，兜底跳过。

### 1.1 纯函数 `src/lib/desktop/text-shortcut-fallback.ts`

```ts
export type TextShortcutId = "text.copy"|"text.cut"|"text.paste"|"text.pastePlain"|"text.selectAll"|"text.undo"|"text.redo"
export type NativeEditOp = "copy"|"cut"|"paste"|"pasteAndMatchStyle"|"selectAll"|"undo"|"redo"
export type TextSurface = "editable"|"readonly"|"static"|"none"
/** 焦点/选区所属的文本表面：
 * editable：可编辑的 input/textarea、contenteditable、Monaco 文本区（.native-edit-context/.inputarea）
 * readonly：只读或禁用的文本 input/textarea
 * static：其他元素，且文档有非折叠选区
 * none：其余（按钮、无选区） */
export function textSurface(target: HTMLElement|null, document: Document): TextSurface
/** surface 允许的命令：editable 全部 7 个；readonly、static 只有 text.copy；none 无。 */
export function allowedOn(surface: TextSurface, id: TextShortcutId): boolean
/** 按当前平台的绑定（含用户改绑）匹配单键；不处理多键组合（文本命令没有默认组合键）。 */
export function matchTextShortcut(stroke: string, commands: ShortcutCommand[], overrides: Record<string,string[]>): TextShortcutId|null
export const nativeEditOps: Record<TextShortcutId, NativeEditOp>
```

### 1.2 控制器接入（`DesktopCommandController.tsx` 的 `bubble`）

```
bubble(event):
  if nativeFirst.delete(event): keydown(event, true)        // 现有逻辑
  if event.defaultPrevented / isComposing / keyCode 229 / 录制中 / 无 bootstrap: return
  id = matchTextShortcut(capturedKey(event), catalog, overrides); 无则 return
  target = event.target 是 HTMLElement 且不是 body/html ? event.target : document.activeElement
  surface = textSurface(target, document); 不允许则 return（不 preventDefault，不影响其他行为）
  event.preventDefault()
  若 desktopCommandTargets.enabled(id, target)：执行目标（输入框、消息输入框、预览的现有实现）
  否则：window.desktop.nativeEdit(nativeEditOps[id])
  失败：toast.error("文本操作未完成，请重新选择后重试")
```

- 先用已注册目标：输入框的剪切板走 `nativeTextEdits`（读剪贴板经 IPC、`insertText` 保留撤销栈）；消息输入框的全选用 `selectAllChildren`（`webContents.selectAll` 对它无效）；预览复制只取正文（不含批注界面）。
- 没有目标接手时走主进程原生编辑：Monaco 的复制/剪切/粘贴、静态文字与对话消息的复制、`type=number/email` 等不在 `installInputCommands` 白名单的输入框。
- API Key 遮罩框：捕获阶段 `keyClipboardMatch` 已经拦截（`preventDefault`），冒泡兜底不会再执行；另外 `textSurface` 对 `type=password` 的 copy/cut 返回不允许，双重保证。
- 删除的默认键：捕获阶段 `removedDefault` → `blocked` → `preventDefault`，兜底跳过（C1）。改绑后的新键：作用域 none 时捕获阶段不处理，由兜底按 `overrides` 匹配执行。
- 对话框：焦点被对话框锁住，原生编辑只作用于焦点元素；不额外判断。

### 1.3 IPC `desktop:native-edit`

- preload：`nativeEdit: op => ipcRenderer.invoke("desktop:native-edit", op)`；`DesktopBridge` 增加 `nativeEdit(op: NativeEditOp): Promise<void>`。
- 主进程：`trusted(event)`；`window?.isFocused()` 否则抛“应用窗口未聚焦”；`z.enum([...7 个])` 校验；`closingFlow` 时忽略；调用 `window.webContents[op]()`（`pasteAndMatchStyle` 对应 Electron 同名方法）。
- 不改 `executeCommand` 对 `text.*` 的拒绝（那条路径是菜单命令 ID，语义不同）。

### 1.4 不做的事

- 不给菜单加 `role`、不关闭 `setIgnoreMenuShortcuts`：快捷键由渲染进程统一解析（多绑定、录制、冲突转移）是已批准的设计。
- 不改 Monaco 的撤销/全选（已正常）；不改右键菜单。
- 静态文字的 Cmd+A 不做全选（R4）。

## 2 测试用例

单元（`tests/unit/text-shortcut-fallback.test.ts`，假 DOM）：

| ID | 内容 |
|---|---|
| TS-01 | `textSurface`：可编辑 input(text/number/email/search)、textarea、contenteditable、`.native-edit-context` → editable；readOnly/disabled input → readonly；div 有选区 → static，无选区 → none；button → none；type=password → editable 但 copy/cut 不允许 |
| TS-02 | `allowedOn`：editable 7 个都允许；readonly、static 只允许 text.copy；none 都不允许 |
| TS-03 | `matchTextShortcut`：darwin 默认 Cmd+C/V/X/A/Z、Cmd+Shift+Z、Cmd+Shift+V；win32 Ctrl+C/V/X/A/Z/Y、Ctrl+Shift+V；改绑 `text.copy:["Cmd+Alt+C"]` 后 Cmd+C 不匹配、Cmd+Alt+C 匹配；`text.copy:[]` 后 Cmd+C 不匹配；非文本命令键（Cmd+K）不匹配 |

控制器（`tests/unit/desktop-command-controller.test.ts` 追加，真实控制器 + 假依赖）：

| ID | 内容 |
|---|---|
| CTRL598-01 | 作用域 none、静态选区、Cmd+C 未被前面处理：冒泡后 `defaultPrevented`，调用 `nativeEdit("copy")` 一次 |
| CTRL598-02 | 输入框 Cmd+V：已注册目标 enabled → 执行目标，不调用 `nativeEdit` |
| CTRL598-03 | 输入框无目标（type=number）Cmd+V → `nativeEdit("paste")` |
| CTRL598-04 | 捕获阶段或组件已 `preventDefault`（模拟 Monaco 撤销）→ 兜底不执行 |
| CTRL598-05 | 静态文字 Cmd+V / Cmd+A / Cmd+Z → 不执行、不 `preventDefault` |
| CTRL598-06 | 录制中、`isComposing`、keyCode 229 → 不执行 |
| CTRL598-07 | `text.copy` 删除默认键后 Cmd+C 不执行；改绑 Cmd+Alt+C 在作用域 none 执行 `nativeEdit("copy")` |

IPC（`tests/unit/clipboard-ipc.test.ts` 追加）：

| ID | 内容 |
|---|---|
| IPC598-01 | 受信、聚焦：7 个 op 各调用一次对应 `webContents` 方法 |
| IPC598-02 | 未聚焦、非主框架、其他 sender、未知 op（`"delete"`、对象、null）→ 拒绝，不调用 |

浏览器（`tests/browser/text-shortcut-fallback.test.ts`，真实控制器 + React 组件 + Chromium，`window.desktop.nativeEdit` 用内存实现记录调用）：

| ID | 内容 |
|---|---|
| TSB-01 | `Input` 选中 → Meta+c：内存剪贴板写入选中文本；Meta+v：插入；Meta+z 撤销恢复；Meta+a 全选 |
| TSB-02 | `data-text-preview` 段落选中 → Meta+c：`nativeEdit("copy")` 调用一次；Meta+v 不调用 |
| TSB-03 | API Key 遮罩框 Meta+c：不写剪贴板、不调用 `nativeEdit`（与 K01 一致） |

已有浏览器用例（api-key-clipboard、text-context-menu、text-selection、chat-empty-state、composer-clipboard）全部重跑，不允许回归。

真实应用（`~/shakeink-test-roots/copy-paste-598/drivers/e2e-598.mjs`，隔离根，`npm run build` 后，`sendInputEvent` 真实按键）：

| ID | 内容 |
|---|---|
| E1 | 引导/设置对话框文本输入框：Cmd+C、Cmd+V、Cmd+X、Cmd+A、Cmd+Z |
| E2 | 消息输入框：Cmd+C、Cmd+V、Cmd+X、Cmd+A、Cmd+Z |
| E3 | Markdown 编辑器：Cmd+C、Cmd+V、Cmd+X、Cmd+Z、Cmd+A |
| E4 | 正文预览选中：Cmd+C 只复制正文 |
| E5 | 静态可选文本（侧栏/面板中 `data-text-preview`）：Cmd+C；Cmd+V 不改变任何内容 |
| E6 | AI 对话消息：测试作品没有对话且默认无模型，真实对话消息无法生成。以同一 `data-text-preview` 机制的面板文字代替，并记录为限制 |

限制：真实应用驱动无法让窗口成为系统前台（无桌面会话），用 `BrowserWindow.prototype.isFocused` 与 CDP 焦点模拟代替；Windows 只做单元与浏览器夹具验证，不算真实目标通过。

## 3 修订 1（按 `docs/598-text-clipboard-shortcuts-plan-review.md`）

本节替代 §1 与 §2。

### 3.1 根因表更正

- 正文预览：补测真实鼠标拖选（`probe-r1.mjs`），焦点落在预览容器，Cmd+C 复制成功（`第一章 绯红\n　　痛！…`），捕获阶段的 `previewMatch` 已生效。原表一行是用脚本造选区、焦点不在预览内导致的，删去。预览不改。
- Monaco 的 `text.copy/cut/paste` 菜单路径提示“此命令在当前视图不可用”：浏览器版 Monaco 不注册剪贴板键位，`createMonacoCommandTarget` 没有可用的剪贴板行。Monaco 的撤销、全选由它自己处理，正常。

### 3.2 方案：键盘复用右键菜单的取源与执行

不新增 IPC（P1-1）。新模块 `src/lib/desktop/text-shortcuts.ts`：

```ts
export const textShortcutIds = ["text.copy","text.cut","text.paste","text.pastePlain","text.selectAll","text.undo","text.redo"] as const
export type TextShortcutId = typeof textShortcutIds[number]
/** 单键匹配合并目录（desktopCommandCatalog，含 Monaco 合并的默认值）中 text 命令的当前绑定。
 * removed：该键是某个 text 命令被用户删除/改走的默认键，且没有命令占用它。 */
export function textShortcutFor(stroke: string, commands: ShortcutCommand[], overrides: Record<string,string[]>): { id: TextShortcutId } | { removed: true } | null
/** 键盘取源：先用 event.target；target 不是文本来源（body、按钮等）时，用选区起点所在元素。
 * 规则与右键菜单相同：registered adapter（Monaco）→ textContextSourceAt；有对话框时来源必须在 activeTextDialogs 内；
 * 选区起止都必须在同一来源根内（静态来源）。 */
export function captureTextShortcut(target: HTMLElement|null, document: Document, options: DOMTextOptions): TextContextCapture|null
/** 非输入来源（kind = preview）只允许 text.copy；输入与编辑器按 capture.commands。 */
export function textShortcutAllowed(capture: TextContextCapture, id: TextShortcutId): boolean
```

`DOMTextOptions` 与右键菜单相同（`writeText`/`readText` 走已有剪贴板 IPC，`nativeEdit` 走 `nativeTextEdits.run`，带快照校验）。

### 3.3 控制器接入

执行函数 `textShortcut(event, id, target)`：

1. `event.preventDefault(); event.stopImmediatePropagation()`。
2. `CommandTargets` 新增 `owner(id, target): "enabled"|"disabled"|"none"`（唯一接受的注册 + enabled）。enabled → 现有 `run(id, target)`（输入框、消息输入框、预览、API Key 的现有目标）；disabled → 不执行（P1-3，目标拒绝即拒绝）。
3. none → `captureTextShortcut`；有来源且 `textShortcutAllowed` → `source.execute(id, assertCurrent)`，`assertCurrent` 检查来源 `isCurrent()` 与 `document.hasFocus()`；否则不执行。
4. 失败 toast“文本操作未完成，请重新选择后重试”。

`textShortcutFor` 返回 `removed` 时只 `preventDefault`，不执行（C1 在 none 作用域与 Windows 上也成立，P2-1）。

接入位置（P2-2：除 markdown 外都在捕获阶段，不受 React `stopPropagation` 影响）：

| 作用域 | 位置 |
|---|---|
| input、composer、worldline-search（含菜单内的输入框） | 捕获阶段：在 `[role="menu"]…` 早退之前，若 target 是可编辑文本控件且 `textShortcutFor` 命中、且没有其他命令匹配（global、customized、keyClipboardMatch、composerMatch、worldlineMatch）→ `textShortcut`。原 `:95` 早退之前同样处理 |
| preview | 现有 `previewMatch` 不变；未命中时同上 |
| none、worldline | 捕获阶段 dispatcher 结果为 none 时，`textShortcutFor` 命中 → `textShortcut`；世界线画布上只在选区属于 `[data-text-preview]` 时有来源（P3-2，有意的例外：只复制） |
| markdown（Monaco 文本区） | 冒泡阶段：`!event.defaultPrevented`（Monaco 未处理，即复制、剪切、粘贴、粘贴为纯文本）→ `textShortcut`；Monaco 已处理的撤销、全选跳过。只读编辑器由 Monaco 适配器 `commands['text.cut'/'text.paste']=false` 拒绝 |

录制中、`isComposing`、keyCode 229、无 bootstrap、`pending` 组合键前缀时都不进入文本路径（与现有一致）。

markdown 冒泡路径不查 `CommandTargets`：真实应用里 Monaco 目标的 `text.copy/paste` 菜单路径返回“此命令在当前视图不可用”（浏览器版 Monaco 的剪贴板命令没有可用的目标行），按步骤 2 会被当作 disabled 拒绝。markdown 直接走 `captureRegisteredTextContext`（Monaco 适配器，`monaco-text-context.ts`），它自己按只读、选区判断能力。

### 3.4 已有断言的含义变化（P2-4）

- `tests/unit/monaco-command-controller-review.test.ts:126`：预览内嵌普通输入框 Cmd+C 原断言 `defaultPrevented === false`。改为：由输入框所有者处理（`defaultPrevented === true`），预览所有者不执行。夹具的注册改为只接受 preview 作用域，与真实 `installPreviewTextCommands` 一致。
- `tests/browser/api-key-clipboard.test.ts` K01/K04“undo/redo stay native”：改动后经 `installInputCommands` 执行 `execCommand("undo")`，断言的值不变，标题注释更新。
- 其他浏览器用例里的 `nativeUndo/nativeSelectAll` 断言（text-context-menu、text-selection、chat-empty-state、text-selection-cards）结果值不变，全部重跑。

### 3.5 限制

- 用户把 text 命令改绑成多键组合时，在 none 作用域（静态文字、对话消息）不生效；输入类作用域由现有分派器处理，正常（P3-3）。
- 禁用的输入框不能获得焦点，其中的选区不支持快捷键复制（右键菜单可以），P2-3。
- Windows：捕获阶段 `preventDefault` 后由我们的路径执行，取代 Blink 原生路径。只有单元与浏览器夹具验证，真实目标未验证，台账写明。
- markdown 渲染不做 sanitize（`src/lib/markdown.ts:22`）属已有风险，本方案不新增 IPC，不扩大；单独记录，不在本次处理（P3-1）。

### 3.6 测试用例（替代 §2）

单元 `tests/unit/text-shortcuts.test.ts`：

| ID | 内容 |
|---|---|
| TS-01 | `textShortcutFor`（darwin、win32，用合并目录）：Cmd/Ctrl+C/V/X/A/Z、Cmd+Shift+Z / Ctrl+Y / Ctrl+Shift+Z、Cmd/Ctrl+Shift+V 各命中对应 id；Cmd+K → null |
| TS-02 | 改绑 `text.copy:["Cmd+Alt+C"]`：Cmd+Alt+C → copy，Cmd+C → removed；`text.copy:[]` → Cmd+C removed；Cmd+C 转给其他命令（覆盖值里另一命令占用）→ null |
| TS-03 | `textShortcutAllowed`：kind preview 只有 copy；kind input 跟随 capture.commands |
| TS-04 | `CommandTargets.owner`：无注册 none；唯一接受且 enabled → enabled；接受但 enabled() 为假 → disabled；两个注册都接受 → none（与 resolve 的唯一性一致） |

控制器（`tests/unit/desktop-command-controller.test.ts` 追加）：

| ID | 内容 |
|---|---|
| CTRL598-01 | 输入框 Cmd+V，目标 enabled → 执行目标一次，`defaultPrevented` |
| CTRL598-02 | 目标接受但 disabled → 不执行任何路径，`defaultPrevented` |
| CTRL598-03 | 作用域 none，无目标，`captureTextShortcut` 返回只读来源：Cmd+C → `execute("text.copy")`；Cmd+V / Cmd+A / Cmd+Z → 不执行，`defaultPrevented` |
| CTRL598-04 | 作用域 markdown：捕获阶段不处理；冒泡阶段未被消费 → 执行；已 `preventDefault` → 不执行 |
| CTRL598-05 | 录制中、`isComposing`、keyCode 229 → 不执行，`defaultPrevented` 为假 |
| CTRL598-06 | darwin 与 win32：`text.copy:[]` 后 Cmd/Ctrl+C 在 none 作用域 `defaultPrevented`、不执行；改绑 Cmd+Alt+C 在 none 作用域执行 |
| CTRL598-07 | 菜单内输入框（target 在 `[role="menu"]` 内）Cmd+V → 执行输入框目标 |

浏览器 `tests/browser/text-shortcuts.test.ts`（真实控制器 + 真实 React 组件 + Chromium；按键用 CDP `Input.dispatchKeyEvent` 不带 `commands`，修复前不会产生任何编辑，P2-4；剪贴板为内存桥）：

| ID | 内容 |
|---|---|
| TSB-01 | `Input`：选中 → Meta+c 写入选中文本；Meta+v 插入；Meta+x 剪切；Meta+a 全选；Meta+z 撤销、Meta+Shift+z 重做；Meta+Shift+v 插入纯文本 |
| TSB-02 | `type=number` 与 `type=email` 输入框：Meta+v 插入 |
| TSB-03 | `[data-text-preview]` 段落鼠标拖选，焦点在 body：Meta+c 写入段落文字；选区跨段落与按钮 UI 时写入的文字与右键菜单复制一致；Meta+v、Meta+a、Meta+z 不改变 DOM 与选区 |
| TSB-04 | 背景段落有选区，打开 Base UI 对话框（焦点在对话框按钮）：Meta+c 不写剪贴板 |
| TSB-05 | 下拉菜单内输入框（`onKeyDown` 调用 `stopPropagation`，同 `ChatPanel.tsx:1964`）：Meta+v 插入、Meta+c 复制 |
| TSB-06 | API Key 遮罩框：Meta+c、Meta+x 不写剪贴板；Meta+z 撤销仍可用（K01） |
| TSB-07 | 改绑：`text.copy:[]` 后 Meta+c 在段落上不写剪贴板；`text.copy:["Cmd+Alt+C"]` 后 Meta+Alt+c 写入 |
| TSB-08 | 修复前对照：同样的 CDP 按键在去掉文本路径的控制器上不写剪贴板（证明用例能分辨修复前后，只在实现前运行一次并记录） |

Monaco 浏览器用例（复用 `tests/browser/monaco-text-context.test.ts` 的真实 Monaco 夹具）：

| ID | 内容 |
|---|---|
| TSM-01 | 可编辑 Monaco：选中一行 Meta+c 写入；Meta+v 插入剪贴板内容；Meta+x 剪切；Meta+z 由 Monaco 撤销（不经我们的路径，调用计数为 0） |
| TSM-02 | 只读 Monaco：Meta+v、Meta+x 不改内容；Meta+c 仍复制 |
| TSM-03 | Monaco 查找框：Meta+v 插入查找框，正文不变 |

真实应用（`~/shakeink-test-roots/copy-paste-598/drivers/e2e-598.mjs`，`npm run build` 后，隔离根与复制的测试作品，`sendInputEvent` 真实按键）：

| ID | 内容 |
|---|---|
| E1 | 引导对话框笔名输入框：Cmd+C/V/X/A/Z |
| E2 | 消息输入框：Cmd+C/V/X/A/Z、Cmd+Shift+Z、Cmd+Shift+V |
| E3 | Markdown 编辑器：Cmd+C/V/X/Z/A |
| E4 | 正文预览鼠标拖选：Cmd+C 只含正文（回归） |
| E5 | 侧栏/面板静态 `data-text-preview` 文字鼠标拖选：Cmd+C；Cmd+V/A/Z 不改变 |
| E6 | AI 对话消息：在复制的作品数据库写入一条已存储对话（user + assistant 消息，无模型调用），打开该对话，鼠标拖选 assistant 消息 Cmd+C |
| E7 | 消息输入框“选择小说”下拉的搜索框：Cmd+V、Cmd+C |
| E8 | 设置 → 快捷键删除 `text.copy` 的 Cmd+C 后，静态文字 Cmd+C 不复制；恢复默认后复制 |
| E9 | 对话框打开、背景有选区：Cmd+C 不复制背景文字 |

真实应用的窗口聚焦用 `BrowserWindow.prototype.isFocused` 打桩与 CDP 焦点模拟，台账记为“模拟聚焦”。

## 4 修订 2（按复审“修订 1”）

本节修改 §3.2–§3.6，其余不变。

| 条目 | 修改 |
|---|---|
| P1-A 没有单一来源的选区 | 页面上能框选的文字只有 `[data-text-preview]`、`[data-text-input]`、输入框与编辑器（`desktop.css:4-22`，其他文字 `user-select:none`，无法框选）。没有单一来源的情况就是选区跨多个来源（如两条对话消息）。此时 `text.copy` 在 keydown 内同步 `document.execCommand("copy")`，复制浏览器选区（真实应用已验证 `execCommand("copy")` 返回 true 并写入系统剪贴板，`exec.mjs`）。条件：选区非折叠；有对话框时选区两端都在某个 `activeTextDialogs` 内。其他 6 个命令不执行（R4） |
| P2-1 Monaco 改绑的剪贴板键 | 取消 markdown 冒泡路径。markdown 作用域的 `text.copy/cut/paste/pastePlain` 在捕获阶段直接走 Monaco 适配器（浏览器版 Monaco 不绑定这四个键，不冲突）；`text.undo/redo/selectAll` 在 markdown 作用域不进入文本路径，仍由 Monaco 与现有分派器处理（含删除默认键的拦截） |
| P2-2 Monaco 粘贴的撤销粒度 | 适配器粘贴改为 `pushUndoStop(); trigger('keyboard','paste',{text}); pushUndoStop()`，右键菜单同样受益 |
| P2-3 菜单内输入框的删除默认键 | 文本路径整体放在 `[role="menu"]` 早退之前，`removed` 一律 `preventDefault`（markdown 的 undo/redo/selectAll 除外，见上） |
| P2-4 剪贴板断言 | 普通输入框与 Monaco 复制走 `execCommand`，不经内存桥。浏览器用例对复制统一断言 document 上 `copy` 事件触发、且事件发生时 `getSelection()`（输入框为选中值）等于期望文本；或内存桥写入（预览、消息输入框）。粘贴用内存桥 `readClipboardText` |
| P2-5 多个注册同时接受 | `owner()` 在多个注册都接受时返回 `disabled`（不回落到 DOM 路径），TS-04 改 |
| P2-6 跨来源选区 | TSB-03 改：跨两个段落的选区按 P1-A 复制完整浏览器选区；单段落选区与右键菜单结果相同 |
| `removed` 带 id | `textShortcutFor` 返回 `{removed:true,id}`，用于判断 markdown 的 undo/redo/selectAll 例外 |
| API Key 输入框 | 文本路径跳过 `isAPIKeyControl` 目标，K01–K07 完全走原路径 |
| P3 按键重复 | `capturedKey` 对 repeat 返回 null，按住 Cmd+V 不重复粘贴，保持现状 |
| P3-1 sanitize | 记入台账 598 条目的“已知风险”，不在本次处理 |
| E5 | 改为对话消息：单条消息内选区（来源路径）与跨两条消息的选区（P1-A 路径）；E6 不变 |
| P2-5（真实应用补充） | 补 E10：`type=number` 输入框（外观缩放设置）Cmd+V；E11：API Key 遮罩框 Cmd+C 不复制；E12：Monaco 查找框 Cmd+V；E13：录制快捷键时 Cmd+C 被录制而不复制。只读 Monaco、世界线搜索框只在浏览器夹具验证，台账写明 |

## 5 修订 3：真实应用发现与代码审核（`docs/598-text-clipboard-shortcuts-code-review.md`）

| 条目 | 修改 |
|---|---|
| 真实应用 E2 首轮失败 / 审核 P1-1 | 安装版目录中 `monaco.suggestWidgetCopy`（scope markdown，when `suggestWidgetDetailsFocused`）也绑定 Cmd/Ctrl+C，`textShortcutFor` 见到两个所有者返回 null，复制不走文本路径。修改：只把当前作用域生效的非 text 命令（global，或 `shortcutScopeEnables` 为真）算作竞争者。新增 TS-05；浏览器夹具改为先 `initializeStartupCommandCatalog('darwin')`，与 `DesktopApp.tsx:90` 一致 |
| 审核 P1-2 Monaco 组合键第二键 | markdown 作用域恢复 §3 的冒泡路径：Monaco 先按自己的 when 条件解析（含 `Cmd+K Cmd+X`、`Cmd+K Cmd+C`、建议详情的 Cmd+C），未消费时在冒泡阶段执行文本路径；匹配时按 none 作用域计算竞争者（markdown 内的 `monaco.*` 已由 Monaco 自己判断过）。改绑的剪贴板键：Monaco 不绑定，冒泡阶段照样执行（§4 P2-1 的顾虑不成立）。新增 TSM-04 |
| 审核 P2-1 按键重复 | 重复的 keydown 只 `preventDefault`，不执行。新增 CTRL598-08 |
| 审核 P2-2 对话框屏障提示 | 没有来源时不再弹失败提示（屏障、无选区都是有意的不执行）。TSB-04 断言无提示 |
| 审核 P3-5 | `copySpanningSelection` 对 anchor 与 focus 都检查可编辑区 |
| 审核 P3-1 | MONACOCTRL48-07 断言消息保留；输入框复制由 TSB-01/05 证明 |
| 审核 P3-3 下拉选项 | 焦点在 listbox 选项上、背景有可选文字的选区时，Cmd+C 复制该选区（与浏览器默认一致）；记为限制 |
| 审核 P3-4 Windows Ctrl+A | 无来源时 Ctrl+A 被吞掉（原来 Blink 全选整页）；记入 Windows 限制 |
| TSB-08 | 实现后用 HEAD 控制器运行 `tests/browser/text-shortcuts.test.ts`：TSB-01/02/03/05/07、TSM-01/02/03 失败，TSB-04/06（不复制的守护）通过。证明用例能分辨修复前后 |
