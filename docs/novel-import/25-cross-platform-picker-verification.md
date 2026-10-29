# 统一导入来源选择器定向验证

日期：2026-10-26。仅本次来源选择流程；独立代码复审通过、34项定向测试通过，最终构建与本机启动/原生入口核对完成。未运行全仓、完整导入或打包测试。

## 流程与实现

17产品独审 → 18 HTML稿与用户明确批准 → 19静态UI复审 → 20/21技术方案及复审 → 22/23定向用例及审核 → TDD → 24独立代码审核 → 本报告。用户后来要求所有平台统一，14–16中的Windows双入口仅作为过渡态历史，不代表最终范围。

- 侧栏、菜单与“添加来源”统一，无文件/文件夹模式下拉。保留旧命令ID的快捷键兼容分派，但界面语义都是导入作品。
- macOS 维持同一原生多选框；Windows 使用获批的真实React选择框，支持文件与文件夹同列表勾选、跨目录选择、当前目录、自然排序、筛选、移除与取消。
- 目录浏览只读取元数据，opaque ID受当前窗口/会话约束；来源proof及祖先身份一直验证到scanner实际读取，不以确认后新建的proof替代用户所选对象。
- 取消在前后端队列之外立即执行，关闭/迁移/失联先解除选择再排空controller/gate；未结束IO仍占跨会话预算，迟到目录句柄关闭。
- 空文件夹确认后给出无可导入文本的可见反馈；快速重复触发共享正在等待的选择，不在取消后排队重开。

## 定向命令与证据

使用 Node 24.18.0。命令中的文件均显式列举，不使用测试通配符或 `npm test`。

```sh
node --import tsx --test --test-name-pattern='CP-|UP-|NI-L01|NI-L04: publication' tests/unit/novel-import-source-picker.test.ts tests/unit/novel-import-integration.test.ts tests/unit/novel-import-picker.test.ts
node --import tsx --test --test-name-pattern='CP-U|CP-L01|NI-U08' tests/browser/novel-import-source-picker.test.ts tests/browser/novel-import.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run generate:commands
npm run build
```

| 层 | 结果 | 证据 |
| --- | --- | --- |
| 文件系统/授权/取消/真实controller与gate/入口接线 | 28/28通过 | [unit](evidence/cross-picker-unit-final.txt) |
| 真实React+受控bridge、短窗口/键盘/迟到回执/同一入口 | 6/6通过 | [browser](evidence/cross-picker-browser-final.txt) |
| 类型检查 | 通过 | [typecheck](evidence/cross-picker-typecheck.txt) |
| 命令目录 | 已生成，darwin422/win32406 | [commands](evidence/cross-picker-commands.txt) |
| UI与桌面生产编译 | 通过（含最后授权捕获/预算/去重修订） | [build](evidence/cross-picker-build.txt) |
| macOS真实原生选择框 | 多文件、目录递归与取消已实测 | [UP-06](evidence/unified-picker-native.json) |

失败阶段证据保留：backend/ui首次缺模块RED、[接线断言RED](evidence/cross-picker-wiring-red.txt)、[空文件夹RED](evidence/cross-picker-empty-red.txt)、[快速重复点击RED](evidence/cross-picker-duplicate-ui-red.txt)；不将首次浏览器沙箱启动失败当产品断言失败。后端的读取边界/IO预算用实际临时文件系统和可控在途点验证。

## 必须保留的验证边界

- Windows实际设备、安装包未运行。main分支测试、React bridge与fs测试均不冒充真实Windows验收；Linux不是当前完整桌面发行目标，不因共享选择器逻辑就声称支持完整Linux应用。
- 新HTML稿的file:预览被应用内浏览器策略拦截，未使用其他浏览器/HTTP绕过。用户已明确批准；静态复审及后续真实React受控组件测试与被拦截的HTML预览分别记录。
- UP-06初始自动driver在人工阶段等待上有错误，未把该次脚本记为整段成功。多文件与取消的实际断言已执行；目录分支通过同一隔离副本的CUA实际选择和私有合成journal逐字断言补验，详见JSON中的driverLimit。没有读用户正文、调用真实模型或发布作品。
- 本轮所有source picker新测试均是本次22用例范围；原完整小说导入58项报告保留为先前时点快照，没有借本次修改重跑全量。

最终真实运行：本机正常用户配置的新进程已启动，工作台显示单个“导入作品”按钮；直接点击弹出“选择小说文本文件或文件夹”原生框，取消后返回同一工作台并恢复焦点，无模式下拉。本次未选择真实用户来源或创建真实作品。启动证据见 [cross-picker-verification.json](evidence/cross-picker-verification.json)。
