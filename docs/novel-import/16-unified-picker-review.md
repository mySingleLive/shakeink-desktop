# 统一来源选择框独立代码审核

日期：2026-10-26。审核者：独立子代理 `unified_picker_review`。

结论：**本轮窄修改代码审核通过，未发现阻止进入本机原生验证的问题。** 本结论不代替 UP-06、构建或用户待答复的其他平台统一界面验收。

## 范围和方法

只读检查以下本次变更接点，没有将之前尚未提交的完整导入功能当作本轮改动，没有运行测试或启动应用：

- `desktop/main/index.ts` 的 `chooseNovelSources`。
- `desktop/main/novel-import.ts` 的 `Options.choose`、动作分派及私有 `choose` 调用。
- `desktop/shared/novel-import.ts` 的 `choose` schema。
- `desktop/shared/command-registry.ts` 的原生菜单过滤。
- `src/lib/desktop/novel-import.ts` 的入口/追加动作、`SidebarTree.tsx` 的按钮/命令、`NovelImportDialog.tsx` 的 SourceScreen。
- `design/novel-import/flow.html` 与 `preview.js` 的入口、追加和选择示意。
- 本轮 `novel-import-picker.test.ts`、NI-L01、NI-U08 及 React fixture；只读核对已执行的 `evidence/unified-picker-green.txt`，日志记载 7 项通过。

## 核对结果

| 接点 | 审核结果 |
| --- | --- |
| 无模式动作链路 | 单个侧栏按钮和 `file.import` 均调用 `requestNovelImport()`，store 不额外注入 mode，strict schema 仅将旧 mode 改为可选，controller 原样传至 main；没有放开 renderer 自传路径权限 |
| macOS 原生选择 | main 对默认及旧显式模式均使用 `openFile`、`openDirectory`、`multiSelections`，保持支持扩展名过滤与选择前后窗口归属检查；真实目录可选性及多文件行为仍由 UP-06 验证 |
| 来源类型与取消 | 本次不改变既有逐项实际类型扫描；main 取消返回 null，controller 在扫描/建立任务/保存之前返回，所以首次取消无新任务，追加取消不改变来源及 revision |
| Windows 可达性 | 无 mode 默认仍选文件；`file.import-folder` 仍注册、分派并展示于 Windows 菜单，SourceScreen 在 win32 保留“添加文件夹”；未使用会退化成仅目录的组合属性 |
| macOS 菜单及快捷键 | 仅 `desktopMenu` 跳过冗余目录菜单项，`platformCommands` 和 renderer 命令监听仍保留旧 ID；旧快捷键仍能打开统一选择框 |
| 核对来源追加 | macOS 展示单一“添加来源”，追加动作无 mode、带 append；Windows 展示原两类追加入口，符合当前明确的兼容范围 |
| HTML 示例 | 入口与追加不要求先选类型，旧下拉节点和对应脚本直接引用均已移除，不存在因删除菜单导致的空节点访问；示意说明包含多文件或文件夹以及实际类型判断 |
| 定向测试 | 协议、真实 controller/扫描器、平台选择器参数、侧栏/菜单、真实 React 操作有对应测试；受控 bridge 与模拟平台没有被用来声称真实 OS 验收 |

## 验收边界

继续按 15 文档执行 NI-U08、必要构建及 UP-06 的真实 macOS 原生选择，不需扩展到推断/冲突/发布和全量测试。

本审核后用户已明确回复：“其他平台也必须统一，需要另做文件选择界面”。该回复替代 14 方案中其他平台保留旧入口作为终态的范围。本文件的通过结论仅适用于已经审核的 macOS 补丁及过渡态兼容代码，**不能据此声称跨平台统一选择目标完成**。非 macOS 统一文件浏览选择界面须新增产品/UI 产物，按独立设计审核及用户批准后，再进入技术方案、定向用例与代码实施。

## UP-06 原生验证脚本独立静态复核

日期：2026-10-26。同一独立审核者只读检查 `scripts/verify-novel-import-picker-native.mjs` 及其 `tests/helpers/novel-import-native-seed.ts`，未运行脚本或操作 OS 选择框。**未发现阻断其执行的问题。**

脚本强制真实 darwin，创建并规范化独立临时根、合成正文/设定和独立 Electron bundle ID，启动时指定 `SHAKEINK_TEST_ROOT`，随后断言启动 PID、dataRoot、userData bootstrap 及无模型状态；seed helper 验证专属临时目录名称与非符号链接后仅初始化该目录。未连接用户作品，未调用分类、AI 或发布。

脚本只等待操作者通过 CUA 使用实际侧栏和 OS 选择框，不覆盖 `dialog.showOpenDialog`，不伪造原生结果。只读 IPC 用于核对来源清单及原文，检查两文件、取消追加 revision/清单不变、丢弃合成草稿后同一入口选择目录及其子目录；实际菜单去重、无下拉也在范围内。网络拦截并计数，最后要求零远程请求及无 renderer 错误。测试实例清理由脚本自行管理，合成目录保留供复核。

本结论只确认隔离和 UP-06 范围设计；脚本正在执行时尚不能记录原生通过，应以实际完成后的 JSON 证据及 CUA 操作记录为准。它也不验证尚待 UI 获批的 Windows 应用内选择界面。
