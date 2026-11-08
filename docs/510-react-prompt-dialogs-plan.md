# 510 · 以 React 对话框替换原生消息框方案

日期：2026-11-05。用户要求（附截图：关闭时“部分修改尚未确认保存。”原生框）：去掉这种系统对话框，全部改为 React/HTML 渲染、与本项目其他对话框风格一致的对话框。

**2026-11-05 用户决定（审核第1条取舍）：“全部 HTML，不留原生”。** 渲染器卡住时不回退原生框；关闭流程会停在待答提示，只能强制退出，数据与草稿保留。见 §3。

## 1. 范围

替换所有应用窗口之上的 `dialog.showMessageBox` / `showErrorBox`：

| 位置 | 内容 | 宿主 |
| --- | --- | --- |
| `desktop/main/index.ts:433` | 仍有创作任务运行：取消关闭 / 停止任务并继续 | 工作台 |
| `index.ts:461` | 作品锁修复交接尚未完成：重试交接 / 稍后重试 | 工作台 |
| `index.ts:462` | 尚不能关闭：重试 / 导出草稿 / 取消关闭（截图） | 工作台 |
| `index.ts:241` | 修复导入保存目录的异常退出锁 | 工作台 |
| `index.ts:530`、`:534` | 修复异常退出锁确认；作品锁恢复结果 | 工作台 |
| `index.ts:558` | 迁移应用数据 | 工作台 |
| `index.ts:836` | 菜单命令失败 `showErrorBox` → 渲染器 toast | 工作台 |
| `index.ts:981` | 配置无法自动修复：退出 / 清空全部配置并重启 | 降级工作台 |
| `index.ts:884` | Windows 关于窗口“无法打开浏览器” | 关于窗口（静态 HTML，页内提示） |
| `root-relocation-window.ts:69`、`:118` | 确认原数据目录；Windows“关于” | 定位窗口（React） |

保留原生（不存在可承载 HTML 的窗口，或应用随即退出）：
- `inbox-lease-recovery-window.ts:21/27/33`：冷启动修复写入锁，此时没有任何 BrowserWindow。
- `index.ts:955/1037/1042/1044/1047` 启动失败，窗口尚未创建；`index.ts:987` `fatal`：清空失败或降级窗口无法打开后、`app.exit(1)` 之前的最终错误（降级窗口可能已打开，但应用立即退出，不再交互）。
- `showOpenDialog` 是系统文件/目录选择器，不是消息框。

## 2. 设计

### 2.1 共享契约 `desktop/shared/prompt.ts`

```ts
type PromptButton={value:string(1..32,[a-z-]);label:string;variant:'default'|'outline'|'destructive'}
type AppPrompt={id:uuid;tone:'info'|'question'|'warning'|'error';title;message;detail?;buttons:PromptButton[] (1..4，value 唯一);defaultValue;cancelValue}
promptReplySchema=z.strictObject({id:z.uuid(),value:z.string().max(32)})
PromptBridge={prompts():Promise<AppPrompt[]>;replyPrompt(id,value):Promise<boolean>;subscribePrompts(listener):()=>void}
```
按钮带稳定语义值（审核第5条），渲染顺序即数组顺序，与语义分离。破坏性操作的 `defaultValue`、`cancelValue` 都指向非破坏项。

### 2.2 主进程 `desktop/main/renderer-prompts.ts` `RendererPrompts`

- `constructor(publish:(list)=>boolean)`；`ask(input,{signal?,persistent?})→Promise<string>` 返回所选 value。
- 校验输入（同 schema）；加入待答表并 `publish(list())`。`publish` 返回 false（没有可承载窗口）时立即以 `cancelValue` 结束。
- `reply(id,value)`：id 必须在待答表中、value 必须是该提示声明的按钮值，否则 false；同一 id 只接受一次。成功后删除并 publish。
- `signal` 中止 → 以 `cancelValue` 结束并撤下（替代 `showMessageBox({signal})`）。
- `cancelAll()`：非 `persistent` 的全部以 `cancelValue` 结束；`persistent` 保留，供新文档重新拉取（审核第4a条：降级工作台“重新打开工作台”重载时不应静默退出）。窗口真正销毁（`closed`）时 `cancelAll({force:true})`，persistent 也结束。
- `list()`：快照，渲染器挂载后拉取（`loadURL` 完成前发出的事件会丢失）。

### 2.3 工作台通道

- 事件 `{type:'prompts';prompts:AppPrompt[]}` 加入 `DesktopEvent`，走 `send()`。
- `ipcMain.handle('desktop:prompts')`、`('desktop:prompt-reply')`：先 `trusted(event)`，回复用 `promptReplySchema` 严格解析。不经 `businessGate`（关闭流程中 gate 已关闭，仍须应答）。
- `appPrompts` 只在 handler 函数体内引用，不在 `registerIpc()` 求值时引用（审核第7条：`profile-ipc` 等测试以固定标识符执行 `registerIpc`）。
- `releaseOwner`（`render-process-gone`/`destroyed`/新文档导航）调用 `appPrompts.cancelAll()`；`closed` 调用 `cancelAll({force:true})`。
- preload `index.ts` 增加 `prompts`、`replyPrompt`；渲染器通过既有 `subscribe` 接收事件，`DesktopBridge` 继承 `PromptBridge` 的前两项。

### 2.4 定位窗口通道

`openRestrictedWindow` 内独立 `RendererPrompts`，publish 发 `desktop:relocation-prompt-event`；handle `desktop:relocation-prompts`、`desktop:relocation-prompt-reply`，沿用该窗口 `trusted`（`root-relocation-window.ts:79-81`）。`render-process-gone`、新文档导航、`closed` 时 `cancelAll({force:true})`。preload `root-relocation.ts` 增加 `prompts`、`replyPrompt`、`subscribePrompts`。

### 2.5 渲染器 `src/components/desktop/DesktopPromptHost.tsx`

- props `bridge:{prompts,replyPrompt,subscribe}`。挂载时订阅并拉取；显示队列最后一项。
- 结构复用 `@/components/ui/dialog`：`Dialog(disablePointerDismissal)` / `DialogContent(showCloseButton=false, className="desktop-prompt")` / `DialogHeader` / `DialogTitle`=title / `DialogDescription`=message / detail 段落（`whitespace-pre-line break-words`）/ `DialogFooter` 内 `Button`（variant 取自按钮）。`initialFocus` 指向 `defaultValue` 按钮。风格与导入关闭确认 `ni-close-confirm` 一致。
- Esc：在 `window` 捕获阶段监听，存在提示时 `preventDefault + stopImmediatePropagation` 并回复 `cancelValue`；`repeat` 与 `isComposing` 只拦截不回复（511 A-3）；`onOpenChange` 不再处理 Esc（审核第2条，防止同时关闭设置/导入窗口）。点击遮罩不作回复（`disablePointerDismissal`）。
- 回复后本地立即隐藏该 id，防止重复点击；回复返回 false 时也隐藏，等主进程快照。
- 层级：`.desktop-prompt` z-index 70，其遮罩 69（`desktop.css`），高于“正在保存并关闭”(50)、导入窗(51)、导入关闭确认(60)。
- 焦点/aria（审核第3条，511 审核 A-2 修订）：`DesktopApp` 维护 `promptOpen`/`promptRef`。有待答提示时：(1) 所有事件触发的打开（菜单命令、设置事件、恢复、model-required、引导启动）被拒绝；(2) 自动打开的引导 `suspended`；(3) “正在保存并关闭/迁移取消”与 `WorkLeasePendingDialog` 隐藏，避免压在提示之上。**已打开的设置、导入、恢复等窗口保持挂载**，不卸载未保存的编辑（511 A-2 低项），提示叠在其上（z 70）并持有焦点。
- 挂载位置：`DesktopApp` 每个返回分支都在最外层第一个子元素放同一个 `<DesktopPromptHost key="desktop-prompts">`，位于 `inert={leasePending}` 区域之外。`RootRelocationScreen` 挂载其桥。

### 2.6 调用处

| 调用 | buttons（显示顺序） | default / cancel |
| --- | --- | --- |
| confirmStop | 取消关闭(outline,`cancel`)、停止任务并继续(destructive,`stop`) | cancel / cancel |
| failed（交接） | 稍后重试(outline,`cancel`)、重试交接(default,`retry`) | cancel / cancel |
| failed（关闭） | 取消关闭(outline,`cancel`)、导出草稿(outline,`export`)、重试(default,`retry`) | cancel / cancel |
| 导入目录锁 | 取消(outline)、修复并继续(destructive,`repair`) | cancel / cancel |
| 作品锁 | 取消、修复并重新启动(destructive,`repair`)，带 signal | cancel / cancel |
| 锁结果 notice | 重新启动(default,`ok`) | ok / ok |
| 迁移 | 取消、迁移并重新启动(default,`migrate`) | cancel / cancel |
| 配置重置 | 退出(outline,`quit`)、清空全部配置并重启(destructive,`wipe`)，persistent | quit / quit |
| 定位确认 | 取消、使用原目录并重新打开(default,`use`) | cancel / cancel（与原 defaultId=1 一致） |
| 定位“关于”(Win) | 关闭(default,`ok`) | ok / ok |

原返回值映射不变（如 failed 仍返回 `retry|export|cancel`；定位确认原代码校验 response 只能为 0/1，改为 value 校验）。
无窗口时（macOS 关窗后从 Dock 退出）：`confirmStop`/`failed` 之前会弹 app-modal 原生框；按用户“全部 HTML”决定，改为 publish 失败即 `cancelValue`。macOS 关窗时业务已关闭并 drain，`busy()` 为 false 且无 owner 不 flush，正常不会走到提示；若走到则取消退出，再次退出可重试（审核第9条，接受）。菜单命令失败的 notice 在无窗口时同样不显示（原 `showErrorBox` 可显示），同样接受（511 A-6）。
菜单命令失败：`send({type:'notice',tone:'error',message:'操作未完成，请检查当前窗口或任务状态后重试。'})`，`DesktopApp` 以 `toast.error` 显示（审核第11条）。
降级工作台临时根取 `realpath`（macOS `tmpdir()` 是符号链接，根目录校验要求路径等于 realpath；改造前 macOS 上降级工作台即无法打开，真实 E2E 中发现）。
关于窗口：`projectAboutHtml` 内置 `<p id="link-error" role="alert" hidden>无法打开浏览器，请稍后重试。</p>`，`onError` 用 `about.webContents.executeJavaScript` 取消 hidden。

## 3. 不变与取舍

关闭协调器状态机、取消/导出/重试语义、作品锁/迁移/配置重置的确认后流程、原文案不变。

1. 渲染器卡住（主线程不响应）时提示画不出来，关闭/退出停在待答提示，需强制结束；已保存内容和草稿保留。用户已于 2026-11-05 明确选择不保留原生回退。
2. 确认强度：原生框不可由渲染器伪造。改为 HTML 后，能在主框架执行脚本的代码可直接回复确认（清空配置、移除锁、迁移）。主框架本就受信（`trusted` 只认主框架 `shakeink://app`，CSP `script-src 'self' 'unsafe-inline'`）；`src/lib/markdown.ts:22` 声明不对用户创作/AI 回复做 sanitize，经 `dangerouslySetInnerHTML` 渲染（`MarkdownPreview.tsx:27` 等）。因此主框架 XSS 的影响面从“工作台内操作”扩大到“确认破坏性维护操作”。本次不改变 Markdown 渲染策略，在结论中如实说明此风险。

## 4. 验证

- 单元：`RendererPrompts`（publish 失败、reply 校验/只一次、signal、cancelAll 与 persistent、list）；每个调用处的按钮值映射。
- 更新测试（审核第7条）：`root-maintenance-main-review`、`work-lease-main`、`work-lease-main-review`、`root-migration-ipc-review`、`novel-import-integration`、`root-relocation-window`（handler/preload 键列表）、`root-relocation-100-review`、`root-relocation-navigation-100-review`、`startup-recovery-window`、`repository-license-commands`。
- 浏览器：`DesktopPromptHost` 渲染/风格、默认焦点、Esc 只回复 cancel 且下层设置/导入窗口不变、遮罩点击无回复、z 层级、提示期间普通对话框被压住。
- 真实 Electron 脚本改为驱动 HTML 提示：`run-lotm-wizard-import.mjs:56`、`smoke-work-lease.mjs:26`、`verify-works-loading.mjs:70`、`smoke-runtime-migration.mjs:29,32`、`smoke-root-relocation.mjs:67`、`verify-novel-import-close-states.mjs`（断言改为“导入关闭期间未出现应用提示”）。`smoke-work-restore`、`smoke-application-restore` 属已退役备份功能（`docs/backup-scope-retirement.json`），不改。
- 新增真实 E2E：隔离根，令关闭保存失败（渲染器回复 failed），断言出现 HTML“尚不能关闭”框、原生 `showMessageBox` 调用 0 次，取消关闭后窗口保留，重试后正常关闭；并用 Electron 运行时截图核对风格。
- typecheck、build:desktop；台账 `docs/requirements-traceability.json` 新增条目。
