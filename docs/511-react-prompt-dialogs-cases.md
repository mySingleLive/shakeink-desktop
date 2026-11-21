# 511 · React 提示对话框测试用例

依据：`510-react-prompt-dialogs-plan.md`（修订版）。合成数据，不含真实 Key。

## 单元 `tests/unit/renderer-prompts.test.ts`

| ID | 内容 |
| --- | --- |
| RP-01 | `ask` 发布含该提示的快照；`reply(id,声明值)` 结束 ask 返回该值，并发布空快照。 |
| RP-02 | `reply` 拒绝未知 id、未声明 value、重复回复（第二次 false，ask 只结束一次）。 |
| RP-03 | `publish` 返回 false 时 ask 立即返回 `cancelValue`，待答表为空。 |
| RP-04 | `signal` 中止：返回 `cancelValue` 并撤下；已中止的 signal 直接返回 cancel，不发布。 |
| RP-05 | `cancelAll()` 结束非 persistent 提示，保留 persistent 且 `list()` 仍含它；`cancelAll({force:true})` 结束全部。 |
| RP-06 | 输入校验：按钮 0 或 >4、value 重复、default/cancel 不在按钮中 → 抛错，不发布。 |
| RP-07 | 多个并发提示：`list()` 按提问顺序；分别回复互不影响。 |

## 主进程调用处（审阅测试执行真实 `index.ts` / `root-relocation-window.ts` 代码）

| ID | 内容 |
| --- | --- |
| RPM-01 | confirmStop：按钮值 `cancel`/`stop`，default=cancel；回复 `stop` → 继续停止任务；`cancel` → 关闭取消。不调用 `dialog.showMessageBox`。 |
| RPM-02 | 关闭失败 failed：标题“尚不能关闭”、正文原文案；`retry`/`export`/`cancel` 分别映射到协调器原语义（`root-maintenance-main-review` closeRig）。 |
| RPM-03 | 交接未完成 failed：`retry`/`cancel`。 |
| RPM-04 | 作品锁确认带 signal：回复 `repair` → true；signal 中止 → false 且提示撤下（`work-lease-main`/`-review` 事件顺序保持）。 |
| RPM-05 | 锁结果 notice 单按钮；迁移确认 `migrate`/`cancel`；导入目录锁 `repair`/`cancel`（`root-migration-ipc-review`、`novel-import-integration`）。 |
| RPM-06 | 配置重置 persistent：`wipe` → true；`quit` → false；新文档导航后提示仍在 `list()`；窗口 closed 后返回 false。 |
| RPM-07 | `desktop:prompts`/`desktop:prompt-reply` 拒绝非主窗口、子框架、非 `shakeink://app` 来源；回复参数非严格结构被拒。 |
| RPM-08 | `releaseOwner` 结束非 persistent 提示为 cancel。 |
| RPM-09 | 菜单命令失败发送 `{type:'notice',tone:'error'}`，不调用 `showErrorBox`（`repository-license-commands`）。 |
| RPM-10 | Windows 关于窗口 HTML 含隐藏 `#link-error`；onError 执行脚本显示它，不调用 `showMessageBox`。 |
| RPM-11 | 定位窗口：handler 列表与 preload 键含新增项；确认 `use` → true、`cancel` → false；渲染进程退出/导航时提示结束为 cancel；Windows“关于”走提示（`root-relocation-*`、`startup-recovery-window`）。 |
| RPM-12 | `desktop/` 源码中 `showMessageBox`/`showErrorBox` 只出现在 §1 保留清单的位置（静态扫描）。 |

## 浏览器 `tests/browser/desktop-prompt-host.test.ts`（真实 `DesktopPromptHost` + 受控桥）

| ID | 内容 |
| --- | --- |
| RPB-01 | 挂载即拉取已有提示并显示：标题、正文、detail 换行保留、按钮顺序与 variant；`data-slot="dialog-content"` 且类名 `desktop-prompt`。 |
| RPB-02 | 默认焦点在 defaultValue 按钮；Tab 循环在提示内。 |
| RPB-03 | 点按钮 → `replyPrompt(id,value)` 一次；双击只回复一次，提示立即隐藏。 |
| RPB-04 | Esc → 回复 cancelValue；同时打开的下层普通 Dialog 不触发 `onOpenChange`。 |
| RPB-05 | 点遮罩不回复，提示仍在。 |
| RPB-06 | 订阅推送新快照：替换/移除提示；多个提示只显示最后一项，回复后显示前一项。 |
| RPB-07 | 层级：提示在 `ni-dialog` 与 `ni-close-confirm` 之上（elementFromPoint 命中提示）。 |
| RPB-08 | paper/ink 两个主题下截图，背景、边框、按钮样式取自主题变量（与 `ni-close-confirm` 同一组 token）。 |
| RPB-09 | `DesktopApp` 集成（已有 desktop-app 浏览器夹具若可用；否则在 Electron E2E 中覆盖）：提示打开时设置/引导/导入对话框被压住，关闭提示后恢复。 |

## 真实 Electron E2E `scripts/verify-desktop-prompts.mjs`

隔离 `SHAKEINK_TEST_ROOT`，统计主进程 `dialog.showMessageBox`/`showErrorBox` 调用次数（应为 0）。

| ID | 内容 |
| --- | --- |
| RPE-01 | 运行工作台后关闭窗口，受控令渲染器 flush 回复 failed（通过渲染器端测试钩子：拦截 `replyClose` 改为 failed）：出现 HTML“尚不能关闭”框，含三个按钮；截图存证。 |
| RPE-02 | 点“取消关闭”：提示消失、窗口仍在、可继续使用（打开设置）。 |
| RPE-03 | 再次关闭→失败框→点“导出草稿”：触发恢复草稿导出（受控 `showSaveDialog` 取消也可，验证路由），提示重新出现；点“重试”且不再注入失败 → 窗口正常关闭。 |
| RPE-04 | 有运行任务时关闭（受控长任务：导入识别中）：出现“仍有创作任务运行”HTML 框；“取消关闭”保留；导入关闭确认（NICC）仍为 HTML。 |
| RPE-05 | Esc 在“尚不能关闭”框上等同取消关闭。 |
| RPE-06 | 全程 `showMessageBox`=0、`showErrorBox`=0。 |

既有脚本更新后各跑一次：`verify-novel-import-close-states.mjs`（断言导入关闭期间无应用提示）、`smoke-runtime-migration.mjs`、`smoke-work-lease.mjs`、`smoke-root-relocation.mjs`。`run-lotm-wizard-import.mjs`、`verify-works-loading.mjs` 只改驱动，不重跑完整书导入（耗时长，按用户只用第一卷的约束，另行需要时再跑）。

全量：受影响单元测试文件、相关浏览器测试、typecheck、build:ui、build:desktop。
