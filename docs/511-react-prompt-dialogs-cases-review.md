# 511 修订方案与测试用例 · 独立审核

日期：2026-11-05。对象：`docs/510-react-prompt-dialogs-plan.md`（修订版）、`docs/511-react-prompt-dialogs-cases.md`。依据：`feat/novel-import-roster-speed` 当前工作树。工作树里已有未提交的实现（`desktop/main/renderer-prompts.ts`、`desktop/shared/prompt.ts`、`DesktopPromptHost.tsx`，以及 `index.ts`/`DesktopApp.tsx` 的改动）。下文行号以工作树为准，原始代码注明 `HEAD:`。未修改任何源文件。

## 结论：需修订

修订方案已逐条回应首轮 1–12 条。“全部 HTML，不留原生”的决定在第5行和 §3.1 表述准确，包括“渲染器卡住只能强制结束、数据保留”这一后果，本审核不再讨论。稳定按钮值、persistent 提示、捕获阶段处理 Esc、在 handler 函数体内引用 `appPrompts`、notice 事件、台账，都已写入方案，实现方向也一致。

还有三类问题需要修订：
- 用例 RPE-01 的注入方式不可行（已实测验证）；
- 配置重置降级工作台没有任何真实 E2E，现有演示脚本还会被这次改动破坏；
- 单测更新清单漏了 3 个提取 `releaseOwner` 的测试文件，而且这些文件在 HEAD 上就已经失败。

另有一处方案表格写错了定位确认的默认值。

## A. 首轮发现的处理情况

| 首轮 | 状态 | 说明 |
| --- | --- | --- |
| 1 原生回退 | 已按用户决定关闭 | §3.1 表述准确。 |
| 2 Esc / 遮罩 | 基本解决 | 见 A-3。 |
| 3 aria/焦点 | 部分解决 | 见 A-2、A-4。 |
| 4 降级工作台 | 方案已解决，缺验证 | 见 B-2。 |
| 5 按钮值 | 已解决，表格有一处错误 | 见 A-1。 |
| 6 安全 | 已在 §3.2 如实说明 | 方案写“id 必须在待答表中”，没有要求“必须是当前显示项”。由于主框架本来就受信，可以接受。 |
| 7 测试清单 | 部分解决 | 见 A-5。 |
| 8 交接 | 方案已解决，缺用例 | 见 B-5。 |
| 9 无窗口 | 已接受并写明 | 菜单 notice 也有同样问题，见 A-6。 |
| 10 定位通道 | 已解决 | 通道已改名；`render-process-gone`、导航、`closed` 都会 `cancelAll({force:true})`（`root-relocation-window.ts` 工作树 diff）。 |
| 11 关于/菜单 | 已解决 | 见 A-6。 |
| 12 台账 | 已列入 | §4 最后一行。 |

1. **（中）§2.6 表格中定位确认的 default 写错。** 表格写的是“`use` / `cancel`（与原 defaultId=0 一致）”。但原代码是 `buttons:['使用原目录并重新打开','取消'],defaultId:1,cancelId:1`（`HEAD:desktop/main/root-relocation-window.ts:69`），原默认项是“取消”。工作树实现用的是 `defaultValue:'cancel'`，这是对的；错在方案文本。如果 RPM-11 照着表格断言 default=use，就会把 Enter 指向“使用原目录并重新打开”这个不可逆操作。要求：表格改为 `cancel / cancel`，RPM-11 断言 default=cancel。其余各行与 HEAD 的 defaultId/cancelId 已逐一核对，均一致：confirmStop 0、交接 1、关闭 2、迁移 0、导入锁 0、配置重置 0。

2. **（中）用 `promptOpen` 压住其他对话框时漏了几个，也没考虑焦点归还。**
   - 漏压 `RecoveryDialog`：它的 open 条件是 `recoveryOpen&&!closing&&!migrationPending&&!leasePending`（`DesktopApp.tsx:205`），不含 `promptOpen`。`confirmStop` 发生在 `prepare-close` 之前，此时 `closing` 还是 false（`close-coordinator.ts:37` 先于 flush）。所以在恢复窗口打开时关窗，提示会叠在恢复窗口上，这正是首轮第3条描述的情形。`NovelImportRecord`（`NovelImportDialog.tsx:217`，`recordOpen` 不受 `suspended` 控制）也一样。
   - 焦点归还：提示打开后才调用 `onOpenChange(true)`。下一次渲染时设置/导入窗口才因被压住而关闭，base-ui 会在关闭时把焦点还给它自己的 `finalFocus`（例如 `NovelImportDialog.tsx:217` 的 `novelImportFinalFocus() ?? true`、设置窗口的触发按钮）。这一步可能把焦点从提示的默认按钮上拿走，Enter 就落到工作台。是否会被提示自身的 FocusManager 拉回，本审核没有验证。要求在用例中断言：下层窗口被压住后，`document.activeElement` 仍在 `.desktop-prompt` 内（见 B-3）。
   - 已核对：压住 `NovelImportDialog` **不会破坏**导入锁修复流程。修复在主进程 `repairNovelImportTarget` 中进行（`index.ts:220` 起），渲染器只在等待 `mutateNovelImport({type:'repair-target'})`（`NovelImportDialog.tsx:116`）。`suspended` 只是隐藏窗口，store 里的 `view/busy` 不变；`:165` 只重置导入关闭确认，这是期望的行为。`NovelImportSourcePickerDialog` 在 `suspended` 时会取消选择器（`NovelImportSourcePickerDialog.tsx:23`），而修复流程本身也会先调用 `novelImportSourcePicker.cancel()`（`index.ts:229`），两者一致。修复入口只出现在 failed 阶段，所以不会有 `PdfPageReview` 被卸载的问题。提示应答后导入窗口重新出现，显示修复结果。仍需一条用例证明这一点（B-3）。
   - 低：压住设置窗口会卸载 `ProfileSettings`/`ModelSettings`（`SettingsDialog.tsx:67,69` 中的 `open &&`）。用户正在编辑资料（需手动保存）时关窗遇到 `confirmStop`，选“取消关闭”后，未保存的资料编辑会丢失。方案应写明这一点，或者改为只把设置窗口设为 `inert`/隐藏，不卸载。

3. **（低）Esc 捕获的实现正确，但有两处细节。** `DesktopPromptHost` 在打开后才在 `window` 捕获阶段注册监听。比它更早注册的同阶段监听器有 `DesktopCommandController.tsx:103` 和 `ShortcutSettings.tsx:51`，它们会先执行。前者遇到 Escape 且有对话框时只执行 `dispatcher.reset()`（`:66`），无副作用；后者所在的设置窗口已被压住并卸载。其余监听器（document 捕获、冒泡）都会被 `stopImmediatePropagation` 挡住，所以结论成立。细节：(a) 没有忽略 `event.repeat`。按住 Esc 时，连续的 repeat 事件会在“导出草稿”失败后把重新出现的提示也一并取消。(b) 没有判断 `isComposing`。建议两者都忽略，只 `preventDefault`。

4. **（低）提示宿主实现的是“只显示最后一项”，方案没有说明 persistent 提示与关闭提示叠加时的情况。** 降级工作台里，配置重置提示还在待答时，用户点窗口关闭，又会出现 `failed`/`confirmStop`。后者显示在上层，应答后再露出重置提示。行为合理，但需要一条单测或浏览器用例（RP-07 只覆盖了普通并发）。

5. **（中）单测更新清单漏了提取 `releaseOwner` 的测试，而且基线已经是红的。** `releaseOwner` 现在调用了 `appPrompts.cancelAll()`（`index.ts:937`）。以下测试会从源码提取 `releaseOwner` 并只注入固定依赖：`configuration-files-review.test.ts:278`（CF61-17）、`file-export-main.test.ts:34`、`recovery-export-review.test.ts:49`（RE86-05）。它们需要注入 `appPrompts`，§4 没有列出。另外，这 4 个用例（含 CF61-15）**在 HEAD 上已经因为 `ReferenceError: novelImport/novelImportOwner is not defined` 失败**。我用临时 worktree 跑 HEAD 得到 pass 25 / fail 4，当前工作树结果相同。“全量用例通过”之前必须先修好这些夹具，或者把它们作为既有失败如实记入台账，不能算作这次通过。

6. **（低）notice 和关于窗口。** 菜单失败改为 `send({type:'notice'})`（`desktop/shared/ipc.ts:42`，`DesktopApp.tsx` 的 subscribe 中调用 `toast.error`），处理正确。但 `send` 在没有窗口时会静默丢弃（`index.ts:138-140`）；原来的 `showErrorBox` 在 macOS 无窗口时也能显示。这与首轮第9条同类，应在方案中一起写明“接受”。关于窗口方面：页面 CSP 是 `default-src 'none'`（`project-about.ts:7`），`executeJavaScript` 由主进程注入，不受页面 CSP 限制，方案可行。但它只在 Windows 上走这条路径，macOS 上的真实 Electron 验证要另行设计（B-6）。

## B. 测试用例

1. **（高）RPE-01 的“渲染器端测试钩子”不可行，并且违反 AGENTS.md。** 实测 Electron 44.6.0：`contextBridge.exposeInMainWorld` 暴露的对象 `Object.isFrozen===true`，对属性赋值会被静默忽略，调用的仍是原函数（临时最小 Electron 程序验证，已删除）。另外 `DesktopApp.tsx:95` 在挂载时就拿到了 `window.desktop`，`DraftSession` 通过它调用 `replyClose`（`draft-session.ts:91,93`），preload 在 `desktop/preload/index.ts:46` 暴露。所以 `page.evaluate` 改写 `window.desktop.replyClose` 无效；在产品里加钩子又违反“不得有模拟/调试代码”的规定。**可行的替代方案**，只在测试脚本里、通过 `app.evaluate` 改写主进程：
   ```js
   await app.evaluate(({ipcMain})=>{
     globalThis.closeFail=1
     const handler=ipcMain._invokeHandlers.get('desktop:close-reply')
     ipcMain.removeHandler('desktop:close-reply')
     ipcMain.handle('desktop:close-reply',(event,sessionId,id,reply)=>
       handler(event,sessionId,id,globalThis.closeFail>0&&reply?.status!=='export'?(globalThis.closeFail--,{status:'failed'}):reply))
   })
   ```
   仓库已有同样的做法（`scripts/verify-text-context-menu.mjs:46`）。`closeChannel.reply` 接受 `failed`（`renderer-close-channel.ts:19`），之后 `flushDraftForClose` 抛错，进入 `failed()`，走的是真实路径。必须放行 `export` 回复，否则 RPE-03 的“导出草稿”无法验证。`showSaveDialog` 的替换可参照 `smoke-recovery-export.mjs:24`。还有一种真实故障注入：把隔离根下 `drafts.json` 所在目录设为只读，让 `draftJournal.confirm` 失败。两种可以选一种，建议在 RPE-01 中写清楚。RPE-03“重试”前把 `closeFail` 置为 0。

2. **（高）配置重置降级工作台没有真实 E2E，现有演示脚本会被破坏且没有列出。** 审核第4条的核心风险，是 `persistent` 能否在新文档导航后保留、不会静默 `app.exit(0)`（`config-reset-offer.ts:21`）。目前只有单测 RPM-06 覆盖。`scripts/demo-config-deletion.mjs:93,164,194` 通过 PowerShell `BM_CLICK` 点击原生 TaskDialog 按钮，台账 `docs/requirements-traceability.json:5202` 依据它记为“13/13 真实演示通过”。改造后这个脚本必然失败，但方案 §4 和 511 都没有提到。要求：
   - 新增 RPE（macOS，隔离根，写入双品牌冲突文件，构造方法参照该脚本 `:155`）：出现 HTML“配置数据无法自动修复”框，默认焦点在“退出”；执行 `page.reload()` 后（模拟“重新打开工作台”触发的新文档导航，`index.ts:944` 一带），提示仍在、进程仍在；点“退出”后进程退出，原文件不变；另起一轮点“清空全部配置并重启”，验证重建完成。
   - `demo-config-deletion.mjs` 的 D4/D5 改为通过 playwright 点击 HTML 按钮。如果不能在 Windows 上重跑，台账对应条目必须改为“未执行”，不能保留 13/13。

3. **（中）RPB-09 没有可依托的夹具，压住其他对话框和焦点的行为实际上没有被测试。** `tests/helpers` 下没有 desktop-app 夹具。`desktop-prompt-host-fixture.tsx` 里的 `Lower` 是一个通用 Dialog，没有经过 `DesktopApp` 的 `promptOpen` 联动。511 写的“否则在 Electron E2E 中覆盖”也没有对应的 RPE 编号。要求把它落实为真实 E2E，可以合并进更新后的 `smoke-runtime-migration.mjs`：打开设置 → 点“迁移”（替换 `showOpenDialog` 返回隔离根内的空目录）→ 断言出现 HTML 提示、设置窗口隐藏、`activeElement` 在 `.desktop-prompt` 内（A-2）→ 按 Esc → 迁移没有开始，设置窗口恢复到原页。另外补一条：恢复窗口打开时关窗（有运行任务），断言恢复窗口被压住，或者把 A-2 的遗漏补上之后再断言。导入锁修复部分，至少要在 `novel-import-integration` 中断言：拒绝修复后导入 `view` 仍然存在，可以再次修复。

4. **（中）“只改驱动、不重跑”的脚本不能算验证。** 511 第61行写明 `run-lotm-wizard-import.mjs:56` 和 `verify-works-loading.mjs:70` 只改不跑。AGENTS.md 规定不能把未执行的标为通过。改过的驱动没有运行，就无法证明它能点中 HTML 提示。至少应用记忆中第一卷（小丑）的 30/60 s 驱动跑一次 `run-lotm-wizard-import` 的停止任务路径，并跑 `verify-works-loading`；否则在台账中注明“驱动已改、未执行”。

5. **（中）缺少的用例：**
   - RPE-04 只覆盖了“取消关闭”，缺“停止任务并继续”之后正常关闭的路径。受控长任务可以复用 `verify-novel-import-close-states.mjs:39-60` 的本地受控模型服务（仅测试夹具）。用例中“NICC 仍为 HTML”与本需求无关，建议删除。
   - 首轮第8条：交接“重试交接/稍后重试”提示与 `WorkLeasePendingDialog` 同时打开时，提示在上层且可以应答。可以放进 `smoke-work-lease.mjs`。
   - 破坏性提示上按 Enter 激活的是 cancel 值，不是 `wipe`/`repair`/`use`（RPB-02 只断言了焦点位置）。
   - 按住 Esc 时的 repeat 事件不会连续取消重新出现的提示（对应 A-3）。
   - RP：`publish` 抛异常时按 cancel 处理（`renderer-prompts.ts` 的 `broadcast` 有 try/catch），以及 persistent 提示与普通提示叠加的显示顺序（A-4）。
   - 可选：渲染器卡住时（`page.evaluate(()=>{for(;;);})`）关窗，断言进程不会静默退出、原生框 0 次，强制结束后草稿还在。这条可以作为 §3.1 后果的证据。

6. **（低）RPM-10 只是单测。** Windows 关于窗口在 macOS 上没有真实路径。可以在 E2E 中用 `app.evaluate` 新建一个 `BrowserWindow` 加载 `projectAboutHtml(...)`，调用 `installProjectAboutLinks` 时让 `open` 返回 reject，然后断言 `#link-error` 可见。这样能证明 `executeJavaScript` 在该 CSP 下真实有效。否则台账中注明“Windows 未执行”。

7. **（低）其余用例可行。** RP-01~07、RPM-01~09/11/12 可以用现有的“提取真实 `index.ts` 片段执行”做法（`tests/helpers/main-function.ts`）。RPB-01~08 可以用 esbuild + playwright 和现有的 `desktop-prompt-host-fixture.tsx`。RPM-11 的 handler/preload 键列表应同步更新 `root-relocation-window.test.ts:61,83`。
