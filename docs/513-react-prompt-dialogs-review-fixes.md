# 513 · 512 代码审核修订记录

日期：2026-11-05。逐条对应 `docs/512-react-prompt-dialogs-code-review.md`。

| 审核项 | 处理 | 位置 / 验证 |
| --- | --- | --- |
| 高1 渲染器崩溃后提示仍算发布成功，关闭/退出永久等待 | publish 在 `webContents.isCrashed()` 时返回 false，提问即按取消值结束；定位窗口同样处理 | `desktop/main/index.ts` appPrompts、`root-relocation-window.ts`；RPM-08 |
| 中2 录制快捷键时键盘被录制器吞掉 | 录制监听在存在 `.desktop-prompt` 时让出 | `ShortcutSettings.tsx`；RPB-14 |
| 中3 回复未被接受后提示永久隐藏 | `replyPrompt` 返回 false 或抛错时撤销本地已答标记，提示重新显示 | `DesktopPromptHost.tsx`；RPB-13 |
| 中4 调用处映射与 IPC 安全无直接断言 | 新增 `renderer-prompts-main.test.ts`：从真实 `index.ts` 提取全部 8 处 `appPrompts.ask` 字面量，断言按钮值/样式/默认/取消、signal、persistent；执行真实 `desktop:prompts`/`desktop:prompt-reply` handler 断言 trusted 拒绝与严格解析；断言 releaseOwner/closed 取消、菜单 notice、关于页脚本。把配置重置默认改为 `wipe` 的变异会使其失败（已验证） | RPM-01~10 |
| 中4 拒绝作品锁确认、M71-10 夹具缺依赖 | 补 `ordinaryWorkerExited`、`worker` 桩，两条既有失败转为通过 | `work-lease-main.test.ts` 4/4、`root-maintenance-main-review.test.ts` 11/11 |
| 低 恢复 toast 绕过提示 | “查看草稿”在有待答提示时不打开 | `DesktopApp.tsx` |
| 低 关于窗口无真实验证 | 新增真实 Electron 脚本：真实 `projectAboutHtml` + CSP、外部打开失败 → 页内错误可见 | `scripts/verify-about-link-error.mjs` PASS |
| 低 夹具可能掩盖回归 | 保留并说明：`seed-electron-fixture.ts` 完成引导是为让工作台类冒烟进入工作台（引导有独立测试）；`main-function.ts` 默认提示取消只用于不涉及提示的 IPC 夹具，提示路径由 RPM 系列直接断言；驱动中的后台点击如未命中，后续断言（进程退出/重建）会失败 | — |

修订后复跑（全量 npm test 4473 项，43 项失败均为 HEAD 既有，无新增）：typecheck；单测 RP 11/11、RPM 4/4；浏览器 desktop-prompt-host + novel-import-abandon + novel-import-wizard + dialog-appearance 127/127；真实 Electron `verify-desktop-prompts.mjs` PASS（原生框 0）、`demo-config-deletion.mjs` D4/D5 8/8、`verify-about-link-error.mjs` PASS。
