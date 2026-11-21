# 512 React 提示框实现 · 独立代码审核

日期：2026-11-05。对象：工作树中 510 方案（修订版）的实现，即 `git diff` 加上新增文件 `desktop/shared/prompt.ts`、`desktop/main/renderer-prompts.ts`、`src/components/desktop/DesktopPromptHost.tsx`、`tests/unit/renderer-prompts.test.ts`、`tests/browser/desktop-prompt-host.test.ts`、`scripts/verify-desktop-prompts.mjs`。本审核只读源码，未修改任何源文件或测试文件。行号以工作树为准，原始代码注明 `HEAD:`。

实际执行（Node v24.18.0）：`renderer-prompts`、`root-relocation-window`、`root-maintenance-main-review`、`work-lease-main(-review)`、`root-migration-ipc-review`、`novel-import-integration`、`file-export-main`、`recovery-export-review`、`desktop-prompt-host`（浏览器）共 82 项，80 项通过，2 项失败（见第4条）。另在临时 worktree 里按 HEAD 跑过同样两项，HEAD 上也失败。

## 结论：需修订

主体实现正确。逐一对照 `HEAD:desktop/main/index.ts:241/433/461/462/530/534/558/981` 和 `HEAD:root-relocation-window.ts:69/118`，每个调用处的返回映射、默认值和取消值都与原 `defaultId`/`cancelId` 一致。破坏性操作（清空配置、两处锁修复、停止任务、使用原目录）的默认值和取消值都指向非破坏项。作品锁确认仍把 `signal` 传进来，并保留 `!signal.aborted&&…` 判断（`index.ts:535-536`）。`RendererPrompts` 的几种竞态都能正确收敛：`finish` 先检查 `pending.includes`，之后再 resolve 和 broadcast；`cancelAll` 之后的 reply 会返回 false；reply 之后再 abort 是空操作；`release` 会移除 abort 监听。两个 IPC 都先做 `trusted()`，用 `promptReplySchema` 严格解析，不经过 `businessGate`。`appPrompts` 只在 handler 函数体内引用。定位窗口在崩溃、导航和 `closed` 时都会 `cancelAll({force:true})`，`ownerAlive` 也参与 publish 判断。降级工作台用 `realpathSync` 修正临时根目录，修复正确。

需要修订的有四处：渲染器崩溃后新发出的提示会让关闭和退出永久挂起；正在录制快捷键时，提示收不到键盘输入；回复失败后提示会永久隐藏；每个调用处的映射和 IPC 安全用例没有落实，台账也没有如实列出。

## 发现

1. **（高）渲染器崩溃后，新发出的提示仍会“发布成功”，关闭和退出会永久挂起。** `appPrompts` 的 publish 只检查 `!window||window.isDestroyed()`（`index.ts:145`）。`render-process-gone` 只会通过 `releaseOwner` 结束当时已有的提示（`index.ts:937,947`），之后再调用 `ask` 时，publish 仍把事件发给已经崩溃的 webContents，并返回 true。典型路径：AI 任务或导入在主进程/worker 里继续运行，渲染器崩溃，用户点窗口关闭，进入 `beginClose`，`busy()` 为 true，`confirmStop` 发出一个无人能答的提示（`close-coordinator.ts:37`）。之后的关闭和 `before-quit` 都会复用同一个 flight（`close-coordinator.ts:24`），应用只能强制结束。HEAD 在这里弹的是原生框，可以应答（`HEAD:index.ts:433`）。用户接受的取舍是“渲染器卡住画不出来”（510 §3.1），而崩溃是可以检测到的状态，不属于这个取舍。要求：publish 在 `window.webContents.isCrashed()` 时返回 false，或者在 `releaseOwner` 后、新文档挂载前用一个“无主”标志返回 false。也可以在 `ask` 时检查当前是否有 `draftSession`；降级工作台的 persistent 提示除外，它依赖重新拉取。补一条单测：崩溃后 `confirmStop` 立即得到 `cancel`。

2. **（中）正在录制快捷键时出现提示，提示收不到键盘输入。** 510 §2.5 改为“已打开的设置窗口保持挂载”。`ShortcutSettings` 在录制期间于 `window` 捕获阶段注册监听：每个非 repeat 按键都会被 `preventDefault+stopImmediatePropagation` 并记录为绑定（`ShortcutSettings.tsx:44-51`）。这个监听在提示出现之前就已注册，执行顺序先于 `DesktopPromptHost` 后注册的捕获监听（`DesktopPromptHost.tsx:49`）。所以用户正在录制快捷键时关窗，出现“仍有创作任务运行”，按 Esc 会被录成快捷键而不是取消；Enter/Space 也到不了获得焦点的“取消关闭”按钮。只能用鼠标应答，而且录到的绑定会进入草稿。要求：有提示时，`ShortcutSettings` 的监听直接放行（例如检查 `document.querySelector('.desktop-prompt')`，或由 `DesktopApp` 下发 `promptOpen`）；或者提示打开时结束录制。补一条浏览器用例。同类风险：`SettingsDialog.tsx:36-55` 在 document 捕获阶段按矩形判断外部点击，提示目前位于设置窗口的矩形内，所以没有问题，但这是靠几何位置成立的，建议在 surfaces 列表里加入 `.desktop-prompt`。

3. **（中）回复失败后，提示会永久隐藏，主进程却仍在等待。** `answer` 会先把 id 加入 `sent` 和 `answered`，然后 `replyPrompt(...).catch(()=>false)`，返回值被忽略（`DesktopPromptHost.tsx:29-35`）。`receive` 只会剪掉不在新快照里的 id（`:19`）。如果 IPC 被拒绝（`trusted` 抛错、序列化失败）或返回 false，而主进程快照里这条提示仍然存在，它就会一直留在 `answered` 里，也一直不显示；`sent` 又阻止再次回复，形成和第1条相同的挂起。510 §2.5 写的是“返回 false 时也隐藏，等主进程快照”，但快照里仍有这条提示时，它也不会重新出现。要求：回复返回 false 或被拒绝时，把 id 从 `sent` 和 `answered` 中移除；或者在 then 中重新拉取 `bridge.prompts()`，以主进程的列表为准。`sent` 一直不清理，属于轻微泄漏，可以一并在 receive 中剪掉。

4. **（中）每个调用处的映射和 IPC 安全用例没有实现，台账没有列出这一缺口。** 511 的 RPM-01–RPM-11 要求逐个断言调用处的按钮值、默认值和取消值，以及 IPC 的信任检查。实际情况：
   - 主进程相关单测通过测试内的 `promptsVia` 把提示转回原来的 `showMessageBox` 下标桩（`root-maintenance-main-review.test.ts:13-15` 等四个文件里同一段复制的代码）。这样验证了 value 到语义的映射，但完全没有读取 `defaultValue`/`cancelValue`。只有 `root-relocation-window.test.ts`（定位确认）和 `novel-import-integration.test.ts:153`（只检查 `cancelValue`）断言了这两个值。如果把清空配置、`confirmStop`、迁移、作品锁的 `defaultValue` 改成破坏项，现有测试全部仍会通过。
   - 仓库里没有任何测试引用 `desktop:prompts`/`desktop:prompt-reply`（RPM-07，对 `trusted` 和严格 schema 的反例），也没有测试覆盖 `releaseOwner`/`closed` 调用 `cancelAll`（RPM-08；`main-function.ts` 的默认 `appPrompts.cancelAll(){}` 是空操作）、菜单 notice（RPM-09）、关于窗口的 `#link-error`（RPM-10）。
   - `work-lease-main.test.ts` 的“actual main confirmation cancellation…”用例仍然失败（`:49`，`gate.closed` 为 true）。根因是夹具的 `all` 只补了 `novelImport*`，没有补 `ordinaryWorkerExited`，`release→restoreBusiness` 抛出 `ReferenceError`（在临时副本里打印 catch 后确认）。这正是“拒绝作品锁 HTML 确认”的路径，所以拒绝分支目前没有绿色单测。`root-maintenance-main-review` 的 M71-10 也因为缺 `worker` 失败。两者在 HEAD 上同样失败（报错是另一个 ReferenceError），不是本次引入的，但台账 `RP-01` 的 testIds 里没有 RPM-01–11，verificationLimits 也没有写明这些未实现。
   要求：补一个按调用处断言 `{buttons.map(value), defaultValue, cancelValue}` 的单测，可以直接从 `index.ts` 的 AST 提取 `appPrompts.ask` 的对象字面量；补 RPM-07/08；修好上面两个夹具（补 `ordinaryWorkerExited:false`、`worker`）；或者在台账中如实写明未覆盖。

5. **（低）“已打开的窗口保持挂载”还剩几个入口没有拦住。** 草稿恢复 toast 的“查看草稿”按钮直接调用 `setRecoveryOpen(true)`，没有检查 `promptRef`（`DesktopApp.tsx:115`）。sonner 的 Toaster 渲染在 body 下，层级可能高于提示遮罩，本审核没有验证它在模态提示下能否点到。`RecoveryDialog` 的 open 条件不含 `promptOpen`（`:206`），`NovelImportDialog` 的 `suspended` 也不含 `promptOpen`（`:203`）。按 510 §2.5，已打开的窗口留在下层是有意设计；但通过 toast 新打开的恢复窗口会在提示之后挂载，焦点可能被抢走。建议在 toast action 中加上 `promptRef.current` 检查。

6. **（低）测试夹具改动可能掩盖回归。**
   - `scripts/seed-electron-fixture.ts:21-22` 把引导设为已完成。这个种子被约 10 个 smoke 脚本共用（`smoke-commands`、`smoke-configuration`、`smoke-root-startup` 等），这些脚本今后都不会再经过首启引导。这次改动只需要它用于 relocation 和 migration 两个脚本，而这两个脚本按台账记录仍然跑不通。建议改为在那两个脚本里单独设置，或者在台账中说明这是全局行为变化。
   - `tests/helpers/main-function.ts:16` 把 `appPrompts` 默认设为 `ask→cancelValue`。普通夹具里任何意外出现的提示都会被静默取消。建议默认改为 `ask:async()=>{throw Error('unexpected prompt')}`，需要应答的测试再显式注入。
   - `smoke-work-lease.mjs`、`run-lotm-wizard-import.mjs`、`verify-works-loading.mjs` 改用后台 `click(...).catch(()=>undefined)` 来应答提示，失败时会被吞掉，只能靠后续断言超时间接发现。台账已写明这三个脚本未执行，可以接受。

7. **（低）定位窗口主题与 AGENTS.md 合规性：通过。** `RootRelocationScreen` 把 `state.theme` 作为 `themeClass` 放在 portal 出去的 `DialogContent` 上，并通过 `subscribePrompts` 订阅独立通道（`desktop/preload/root-relocation.ts`），没有问题。state 到达之前默认 paper，影响可以忽略。产品代码中没有模拟或调试代码。`verify-desktop-prompts.mjs` 的 `DEBUG_PROMPTS` 输出只存在于脚本中，测试用的 `apiKey:'isolated-test-key'` 是虚构值，本地 HTTP 服务只在脚本中监听 127.0.0.1。`docs/evidence/rpe-real-desktop-prompts.txt` 和 `config-deletion/report-macos-d4-d5-prompts.json` 中没有 Key 或真实路径。关于窗口用 `executeJavaScript` 显示固定段落，不受页面 CSP 影响，也不注入外部数据。
