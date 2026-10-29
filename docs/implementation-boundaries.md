# UI 批准与实施边界

<!-- USER-2026-10-25-NOVEL-IMPORT BEGIN -->
> **2026-10-25 用户“UI 设计审核通过，可以继续”，批准导入作品 v4。** 来源为 `docs/novel-import/02-product.md`、`04-ui-design.md` 和 `design/novel-import/approval-v4.json` 绑定的 HTML：普通来源复选框、补全卡片始终展开、真实设定分类与文件图标、AI 识别等待、三类冲突与正文逐处批准。继续技术方案及独立审核 → 本任务定向用例及独立审核 → TDD/代码审核 → 本任务定向验证。**用户明确禁止全量测试，本任务不运行全仓测试。** 仍复用真实工作台/业务面板，批准不代表实现或真实平台验证通过。
<!-- USER-2026-10-25-NOVEL-IMPORT END -->

<!-- USER-2026-10-13-CONTENT-DRAWER BEGIN -->
> **2026-10-13 用户“UI 交互审核通过，可以继续”，批准右侧内容抽屉设计。** 来源为 `design/content-drawer/product-design.md` 和对应 HTML：收放期间完整宽度及布局固定、向右平移与裁切，沿用左侧曲线和时长；快速换向、状态保活、焦点、窄窗口及 resize 边界按设计落实。本范围覆盖原总体显隐动画不得修改的限制，继续复用真实 DashboardShell、Group/Panel、ContentTabs、29 类面板和 MarkdownEditor。按技术方案及独立审核、用例及独立审核、TDD、code review、回归和实际目标验证自动推进；批准不代表实现或测试通过。
<!-- USER-2026-10-13-CONTENT-DRAWER END -->

<!-- USER-2026-10-13-SIDEBAR-NAVIGATION BEGIN -->
> **2026-10-13 用户“UI 设计审核通过，可以继续”，批准左侧导航 v8。** 实施来源为 `design/sidebar-navigation/product-design.md`、对应 HTML 与正式技术方案：五分类 Tabs、真实作品分组折叠、品牌、入口及图标/身份色、条件渐隐、场景/试验场单行入口与固定形态抽屉。此范围覆盖下表导航原排版和收放动画的限制；仍复用真实 SidebarTree、DashboardShell、Group/Panel，保留真实业务查询、操作与右侧面板。ChatPanel/ContentTabs 仅允许 caption 恢复入口联动，不改业务渲染。按独立方案审核、用例审核、TDD、code review、回归和实际目标验证继续，无须重复 UI 批准；批准不代表测试通过。
<!-- USER-2026-10-13-SIDEBAR-NAVIGATION END -->

<!-- USER-2026-10-13-TEXT-CONTEXT-MENU BEGIN -->
> **2026-10-13 用户“UI 设计审核通过，可以继续”，批准文本右键菜单修订稿。** 依据 `design/text-context-menu/product-design.md` 与对应HTML：覆盖已有可选文本，引用追加现有草稿不发送；非输入框/非编辑文字无撤销重做；用户聊天消息部分/整段选区可复制。真实产品复用Web组件并使用Electron原生菜单。按独立方案审核、用例审核、TDD、code review和实际验收继续；此批准不代表已完成实现或测试。
<!-- USER-2026-10-13-TEXT-CONTEXT-MENU END -->

<!-- USER-2026-10-12-CHAT-EMPTY-STATE BEGIN -->
> **最新批准（2026-10-12）：用户“UI 审核通过，可以继续”，批准 AI 对话首屏 v3.4。** 对纯净空态允许采用 `design/chat-empty-state/product-design.md` 与对应 HTML 的中央 Logo/标题/七卡、底部输入框、双主题和悬停动画；四功能卡同尺寸、左图标固定，宣纸右图暖黄灰，题材入口预选原创作向导，三功能入口填入提示词。此范围覆盖下表对话行“保留原排版”的空态限制；消息/业务状态仍保留原真实 React、同一 composer 及原向导，不将 HTML 或模拟数据导入产品。无模型可准备草稿但发送禁用。方案、用例、代码审核和真实目标验证仍按 AGENTS.md 顺序执行。实施记录见 `docs/reviews/2026-10-12-chat-empty-state-plan.md`，此批准不代表实现或验收已完成。
<!-- USER-2026-10-12-CHAT-EMPTY-STATE END -->

<!-- USER-2026-10-08-CANCEL-BACKUPS CURRENT-SCOPE BEGIN -->
> **当前范围（2026-10-08）：用户取消全部备份功能。** 最新用户scope覆盖下面“目录/备份/恢复”：仅备份/从备份恢复撤销；正常迁移/重定位、异常草稿恢复/导出、writer lease及其它已批准UI保持。原边界全文保留，旧备份字样不能复活功能。
> 活动清单：[acceptance-active-scope.json](acceptance-active-scope.json)；原文和退役明细：[backup-scope-retirement.json](backup-scope-retirement.json)。此处不声明实现完成或验收通过。
<!-- USER-2026-10-08-CANCEL-BACKUPS CURRENT-SCOPE END -->

批准日期：2026-10-07（Asia/Shanghai）。用户明确批准 UI v0.13，基线提交 `6f79382a86f1cb2f81b3b3936492fa6dc66bb8cb`；Web 基线 `55a62560dc4818143469abb12717a23c752ade8c`。本记录绑定所有前序设计变更，并允许依原顺序推进后续工作。

## 实现的两个来源

| 范围 | 唯一实施来源 | 可修改范围 |
| --- | --- | --- |
| 总体两栏/三栏、比例和显隐动画 | Web `DashboardShell.tsx` | 系统窗控/导航插槽、拖拽区、平台安全间距；不能重写原分栏 |
| 完整左导航及账户菜单 | Web `SidebarTree.tsx` | 本地资料替代在线身份、账户菜单增加设置、顶部桌面控制；保留作品/会话树与全部入口 |
| 对话、全部交互卡片和 AI 输入框 | Web `ChatPanel.tsx`、`components/chat/*` | IPC 通信、本地模型/目录门控及 Logo；保留原排版、引用 chip、问答/抽卡占槽、队列/停止/草稿 |
| 右内容区和全部业务面板 Tab | Web `ContentTabs.tsx`、`components/content/registry.tsx` | 本地数据适配；原 29 类面板及业务操作全部保留 |
| 正文及长文本 | Web `MarkdownEditor`、Monaco、评论/自动保存组件 | 外观配置和命令注册接入，不重挂载丢选区/撤销/草稿 |
| 桌面专属交互 | 已批准 UI v0.13、产品 v0.12、补充契约 v0.5 和本次用户说明 | 原生菜单/窗控/两平台布局、设置全部配置、目录/备份/恢复、模型与用户编辑、快捷键逐项实现 |

设计原型仅为桌面新增区域的审核媒介，禁止把其模拟工作台作为正式实现。禁止把示例作品、对话、作者、Key、精选示例型号、虚构空间大小、模拟成功状态、UI 版本号、调试工具条带入产品。主题图仍使用无文字占位示意；合理字段名、说明、错误及空态不是应删除的演示内容。

## 逐条执行与验证

`requirements-traceability.json` 记录要求、设计依据、实施模块、测试 ID 与状态；`migration-map.json` 覆盖上游 29 面板、98 工具、121 路径、65 服务和54数据模型，逐项记录本地迁移或平台专属排除。列表完整性检查只证明未漏项，业务成功必须由对应测试另证。

每轮实现更新实际路径和结果。正式验证使用真实 Electron，运行真实原组件：鼠标拖拽/点击/滚动，键盘和输入法，关闭重开，离线落盘与目录迁移；macOS/Windows 各自执行原生验收。截图按同样数据/尺寸/主题与 Web 比较，允许差异仅限上表。

本次批准已解除 UI 阶段门。下一阶段依次完成技术方案审核、测试用例审核、TDD 和代码审查；无须重复 UI 批准。未具备真实供应商端点或目标机器的项目据实保留待验收，不能拿 mock 或风格切换冲抵。
