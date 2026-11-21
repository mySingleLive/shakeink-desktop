# docs/598 文本复制粘贴快捷键：代码审核

审核范围：工作区未提交的 docs/598 改动，包括 `DesktopCommandController.tsx` 的 `textKey` / `textShortcut`，新文件 `text-shortcuts.ts`、`text-shortcut-source.ts`，`command-targets.ts` 的 `owner()`，`monaco-text-context.ts` 的粘贴，`tests/unit/text-shortcuts.test.ts`，`desktop-command-controller.test.ts` 的 CTRL598-*，其他控制器单元夹具的桩，`monaco-command-controller-review.test.ts` 的 MONACOCTRL48-06/07，以及 `tests/browser/text-shortcuts.test.ts`。依据是方案 §3（修订 1）和 §4（修订 2），§1/§2 已被替代。行号按审核时的工作区文件。本次只读，没有改源码和测试。临时探测文件都放在 `tests/` 下，运行后已删除。

## 结论

有两个 P1。

第一个：真实应用的命令目录里，Cmd+C（Windows 为 Ctrl+C）同时属于 `text.copy` 和 Monaco 的 `monaco.suggestWidgetCopy`。`textShortcutFor` 看到两个所有者就返回 null，所以复制在应用里完全不走新路径。R1 是这次修复的主要需求，在真实目录下仍然没有修好（P1-1）。现有用例都通过，是因为单元和浏览器夹具用的是 `platformCommands`，没有加载安装版 Monaco 目录。

第二个：Monaco 的两键组合 Cmd+K Cmd+X（`md.trimWhitespace`）和 Cmd+K Cmd+C（`addCommentLine`）被截断，第二键被当作剪切或复制处理（P1-2）。这正是“非文本命令的按键行为改变”。

其他：按住 Cmd+V 会重复粘贴，与 §4 “按键重复”一行相反（P2-1）。对话框打开、背景有选区时按 Cmd+C 会弹出失败提示，TSB-04 没有断言提示（P2-2）。控制器单元测试把取源整体打桩，真实应用驱动还没有写（P2-3）。

`owner()`、API Key 跳过、markdown 的撤销/重做/全选让给 Monaco、删除默认键的拦截、对话框屏障、`assertCurrent` 只检查一次、Monaco 粘贴的撤销粒度，这几项都符合方案。

## 运行结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 通过 |
| `node --import tsx --test` 跑 text-shortcuts、desktop-command-controller、monaco-command-controller-review、composer-command-review、input-command-integration-review、native-command-priority 六个单元文件 | 41/41 通过 |
| `node --import tsx --test tests/browser/text-shortcuts.test.ts` | 10/10 通过 |
| 探测 1：`initializeStartupCommandCatalog(platform)` 后对 `desktopCommandCatalog` 调 `textShortcutFor` | darwin `Cmd+C` → `null`，`Cmd+V` → `text.paste`；win32 `Ctrl+C` → `null`，`Ctrl+V` → `text.paste` |
| 探测 2：浏览器用例副本，只在夹具开头加 `initializeStartupCommandCatalog('darwin')` | 6 条失败：TSB-01、03、05、07 与 TSM-01、02，都是复制 `actual: []` 或 `undefined` |
| 探测 3：Monaco 中 `"Line one   "` 行，光标在第 2 行，发 Meta+K、Meta+X | 改动后的控制器：内容不变；没有控制器：尾随空格被删除；HEAD 控制器：尾随空格被删除 |
| 探测 4：TSB-04 副本打印 `errors` | `["文本操作未完成，请重新选择后重试"]` |

## P1

### P1-1 真实目录中 Cmd/Ctrl+C 有两个所有者，复制不进入文本路径

- `desktop/shared/command-catalogs.generated.json:7081-7095`：`monaco.suggestWidgetCopy` 的 `scope` 是 markdown，`defaults` 是 `["Cmd+C"]`，只在 `suggestWidgetDetailsFocused` 时生效。win32 的同一行是 `["Ctrl+Insert","Ctrl+C"]`。`DesktopApp.tsx:90` 在启动时把这份目录发布进 `desktopCommandCatalog`。
- `text-shortcuts.ts:15-18` 在所有作用域里统计所有者，不看作用域，也不看 Monaco 的 when 条件：`owners.length===1&&text?…:null`。真实目录里 Cmd+C 有两个所有者，结果是 null，`textKey` 在 `DesktopCommandController.tsx:72` 返回 false，后面走旧路径，旧路径正是失效的那条。输入框、消息输入框、静态文字、对话消息、Monaco 的 Cmd+C 都不复制。V、X、A、Z 不受影响。
- 测试没有发现这个问题：`tests/unit/text-shortcuts.test.ts:8-11` 注释写“Bindings come from the merged catalog shape”，实际用 `platformCommands` 再手工补 win32 的 `Ctrl+Shift+Z`。控制器夹具的 `desktopCommandCatalog` 也是 `platformCommands(platform)`。浏览器夹具没有调用 `initializeStartupCommandCatalog`。探测 2 说明，只要目录真实，6 条浏览器用例就失败。
- 处理：所有者只计算当前作用域内生效的命令（`shortcutScopeEnables(currentScope, command.scope, modal)`），并且明确处理 Monaco 自己按 when 条件解析的行。例如带 `monacoBindings` 且 when 不是无条件的 `monaco.*` 行，不算作 `text.*` 的冲突所有者。代价是在 markdown 作用域、建议详情获得焦点时，Cmd+C 由我们复制编辑器选区，不复制建议详情。这一点要在方案里写明。用户自己改绑造成的冲突仍然要让出（TS-02 第 27 行的情况）。测试方面：TS-01 改用 `initializeStartupCommandCatalog` 之后的 `desktopCommandCatalog`，同时检查 darwin 和 win32；浏览器夹具开头调用 `initializeStartupCommandCatalog('darwin')`。

### P1-2 Monaco 的 Cmd+K 组合键第二键被文本路径抢走

- `DesktopCommandController.tsx:76` 用 `dispatcher.waitingFor(...)` 判断是否有组合键前缀。可是 Monaco 原生处理的、未改动的组合键，在 `:133` 早退，从不经过 `dispatcher.key`，分派器没有记录前缀。所以 Monaco 收到 Cmd+K 后等待第二键时，第二键 Cmd+X / Cmd+C 先被 `textKey` 在捕获阶段 `preventDefault` 和 `stopImmediatePropagation`（`:77`），Monaco 收不到。
- 生成目录中第二键是文本键的组合只有两个：`md.trimWhitespace`（`Cmd+K Cmd+X` / `Ctrl+K Ctrl+X`）和 `monaco.editor.action.addCommentLine`（`Cmd+K Cmd+C` / `Ctrl+K Ctrl+C`）。探测 3 证实了截断，而且是这次改动引入的（HEAD 正常）。更糟的情况：有选区时按 Cmd+K Cmd+X，会剪切掉选区，而不是删除行尾空格。
- 方案 §3.3 说“`pending` 组合键前缀时不进入文本路径”，但没有考虑 Monaco 自己持有的前缀。
- 处理：markdown 作用域下，在文本路径之前判断这一键是否可能是 Monaco 组合键的第二键。可行的做法是控制器记录上一键：如果上一键是目录中某个 markdown 组合的第一键（`canonicalKey(binding).split(" ")[0]`），并且间隔在分派器的超时内，第二键不进入文本路径。另一种做法是 markdown 作用域的剪贴板键改在冒泡阶段、`!event.defaultPrevented` 时执行（这是 §3 的原设计，§4 P2-1 因为改绑问题取消了它，需要重新权衡）。补一条浏览器用例，内容就是探测 3。

## P2

### P2-1 按住 Cmd+V 会重复粘贴，与 §4 相反

§4 “P3 按键重复”一行写的是“`capturedKey` 对 repeat 返回 null，按住 Cmd+V 不重复粘贴，保持现状”。`DesktopCommandController.tsx:68` 传给 `capturedKey` 的是 `repeat:false`，所以每个自动重复的 keydown 都会执行一次粘贴或剪切。处理：传入 `repeat:event.repeat`，或者遇到 repeat 只 `preventDefault` 不执行。补一条 CTRL598 用例：`repeat: true` 的 Cmd+V，`defaultPrevented` 为真且不执行。

### P2-2 对话框屏障拦住背景选区时弹出失败提示

`DesktopCommandController.tsx:59`：没有来源、`copySpanningSelection` 返回 false、并且选区不是折叠的，就弹出“文本操作未完成，请重新选择后重试”。对话框打开、背景还留着选区时（TSB-04 的场景，E9 也是），用户按 Cmd+C 会看到这个错误提示（探测 4），但这是有意的拦截，不是失败。焦点在 body 上、选区在 Monaco 正文内时，也会出现同样的提示。TSB-04（`tests/browser/text-shortcuts.test.ts:127-132`）只断言没有写入，没有检查 `errors`。处理：被对话框屏障拦住时不提示，只对确实尝试执行却失败的情况提示。TSB-04 加上 `assert.deepEqual(result.errors, [])`。

### P2-3 证据不足以支撑“已修复”

- 控制器单元测试（`desktop-command-controller.test.ts:36`、`:55`）把 `text-shortcut-source` 整体打桩，也就是说 CTRL598 只验证分支选择。这一点注释已经说明，可以接受，但真实的取源只由浏览器用例覆盖，而浏览器用例的目录不真实（见 P1-1）。
- 方案要求的真实应用驱动 `~/shakeink-test-roots/copy-paste-598/drivers/e2e-598.mjs` 还不存在，`drivers/` 下只有改动前的探测脚本。E1–E13 都没有执行。按 AGENTS.md 的顺序，这一步在审核之后，本身不算违规。但如果有真实驱动，P1-1 会被 E1–E6 直接发现，所以合并前必须执行 E1–E13，并在台账里如实记录。`docs/requirements-traceability.json` 里还没有 598 条目。
- 消息输入框（composer）没有浏览器用例。`owner()` 对 `installComposerTextCommands` 的复制和剪切要求选区在输入框内，否则返回 disabled，这一点代码上看是对的（`composer-text-commands.ts:13-16`）。但 Cmd+A、Cmd+Z 真正执行到 `nativeTextEdits` 只有 E2 能证明。

## P3

### P3-1 MONACOCTRL48-06/07 的改动

- 06（`monaco-command-controller-review.test.ts:116`）：只读预览上的 Cmd+V 从“不拦截”改为“拦截但不执行”。这符合 R4 和 §3.3 预览一行（“未命中时同上”），也与 CTRL598-03 一致，改动有依据。
- 07（`:122-133`）：注册改为只接受 preview 作用域，这是 §3.4 明确写的，与 `installPreviewTextCommands` 一致。但第二段断言 `defaultPrevented === true` 时，取源被打桩成 null，所以这条只证明了“按键被吞掉、预览所有者没有执行”，没有证明内嵌输入框能复制。断言消息“a nested ordinary input is not a preview body command”也只说明了一半。建议把消息改成“consumed, preview owner does not run”，输入框的复制由浏览器用例负责。

### P3-2 TSB-08 没有记录

方案说 TSB-08 只在实现前运行一次并记录。`docs/` 里除方案外找不到 TSB-08 的运行记录（8/10 失败、TSB-04/06 为反向守护）。建议把命令和结果写进台账 598 条目或方案附注。

### P3-3 下拉列表（listbox / select）中的文本键

`textKey` 在 `[role="listbox"]` 早退之前执行（`:99`）。焦点在选项上时，取源返回 null。如果页面背景有选区，Cmd+C 会走 `copySpanningSelection`，复制背景文字。这与 Chromium 在普通网页上的行为一致，但不符合“下拉打开时它拥有键盘”的直觉。Cmd+A 在选项上只被吞掉，没有其他影响。代码中没有组件自己处理 Cmd+A/C/V/X/Z（用 grep 查过 `key === "a"` 等写法），所以 `stopImmediatePropagation` 不会抢走组件功能。Combobox 的搜索输入框是普通输入框，走输入框所有者，TSB-05 覆盖。可以不改，但建议在 §3.5 写明。

### P3-4 Windows 上 none 作用域的 Ctrl+A

改动前 Windows 上 Blink 自己处理 Ctrl+A（全选页面）。现在 none 作用域没有来源时，按键被吞掉，什么都不做。页面大部分是 `user-select:none`，影响很小，但这是一处行为变化，台账的 Windows 限制里应该写上。

### P3-5 `copySpanningSelection` 只检查 anchor

`text-shortcut-source.ts:44` 只检查 anchor 是否在可编辑区或 Monaco 内，focus 端在输入框里时仍会执行 `execCommand('copy')`。只是复制，没有危害，可以把 focus 端也纳入检查，使规则对称。

## 逐项核对

| 项目 | 结论 |
|---|---|
| §3.3 / §4 表：输入类作用域在 `[role="menu"]` 早退前处理 | 符合（`:99`），CTRL598-07、TSB-05 覆盖 |
| 删除的默认键被拦截 | 符合（`text-shortcuts.ts:20-21`、`:77`），TS-02、CTRL598-06、TSB-07 覆盖。注意 TS-02 第 29 行：改绑为组合键时旧单键记为 removed，与 §3.5 一致 |
| markdown 的 undo/redo/selectAll 让给 Monaco | 符合（`:75`），包括 removed 的情况，交给原路径的 `customized` |
| 用户把 Cmd+C 转给全局命令 | `textShortcutFor` 返回 null（TS-02 第 27 行），走原路径，不会被遮蔽。但同一个“多所有者返回 null”的规则不区分作用域，导致了 P1-1 |
| `owner()` 多个注册时返回 disabled | 符合 §4 P2-5，TS-04 覆盖 |
| API Key K01–K07 | `isAPIKeyControl` 时 `textKey` 直接返回（`:67`），完全走原路径。TSB-06 是反向守护 |
| `assertCurrent` 只检查一次 | 只对 copy 生效。DOM 来源写入剪贴板后的第二次检查被跳过，cut 和粘贴每次都检查，符合注释 |
| 组合键前缀与 `dispatcher.reset()` | 分派器持有前缀时让出，正确；Monaco 持有前缀时不让出，见 P1-2 |
| 取源：对话框屏障、文本节点 anchor、跨根选区 | `elementOf` 处理文本节点；anchor 或 focus 在对话框外即返回 null；跨根时返回 null，再由 `copySpanningSelection` 处理。都正确。焦点在 body、选区在 Monaco view-lines 内时：`textContextSourceAt` 返回 null，`copySpanningSelection` 因为 `.monaco-editor` 返回 false，最后弹出提示（P2-2） |
| Monaco 粘贴撤销粒度 | `pushUndoStop` + `'paste'`（`monaco-text-context.ts:43`），TSM-01 的“一步撤销”覆盖 |
| AGENTS.md | 浏览器用例的头注释写明剪贴板是内存桥、不是原生验收，单元夹具注明取源为桩，没有冒充真实验证。真实目标验证尚未执行，见 P2-3 |
