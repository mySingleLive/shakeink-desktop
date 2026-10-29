# HTML 设计预览核对

日期：2026-10-25（Asia/Shanghai）。当前版本 v4。对象仅为本目录的合成 HTML；本轮只执行 [UI 设计 D-19](../../docs/novel-import/04-ui-design.md)。不是产品测试、Electron 原生验证、真实文件解析、模型推断或安装包验收。

## v4 本轮定向核对

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node design/novel-import/verify-preview.mjs --selection-layout
```

退出码0，`revision=v4`、`status=pass`；仅1项 D-19 通过。D-01–D-18 本轮未重新执行，不把旧结果累计成本轮19项通过。当前机器结果与12个源码/素材文件 SHA-256 见 [preview-checks.json](preview-checks.json)，均已重算匹配。

- 上方13类普通来源复选框；下方12项补全卡片首次打开即全部显示，无展开/收起控件或状态分支。
- 卡片边角/图标/复选框/Space均仅切换一次，焦点回到同一复选框；普通来源选择与补全选择独立，来源预览和确认返回保留选择。
- 补全总开关关闭仅禁用12项卡片，不折叠、不清除逐项选择；不选正文时仍按原规则只拷贝，重新选入正文恢复既有目标。
- 8组选择页几何：宣纸/玄墨×1280×800、900×640、560×640、390×600；至少16px安全边距、头尾固定、无横向溢出。长页滚动，不靠折叠隐藏选项。
- 4张本轮截图，主代理已实际查看双主题桌面及玄墨窄窗。脚本错误0、HTTP请求0；使用隔离 Chrome `155.0.8059.86`，不访问用户浏览器资料或作品。

未运行产品测试、全量测试、构建、模型调用或真实文件解析。以下 v1–v3 均为历史证据。

## v3 历史运行

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node design/novel-import/verify-preview.mjs
```

实际退出码 0，`revision=v3`、`status=pass`；18 项定向设计核对通过。Chrome `155.0.8059.86`，隔离临时浏览器配置，本地 `file://`，HTTP 全部阻断。

- 40 组几何核对：宣纸/玄墨 × 1280×800、900×640、560×640、390×600 × 选择内容/冲突/结果/核对来源/内容识别中。至少 16px 安全边距、头部和页脚可见、无横向溢出；长页正文可滚动。
- 17 张截图；D-01–D-17 覆盖原有导入设计及前轮五项修订，D-18 覆盖本轮真实设定分类：爽点/泪点、文风及独立金手指，来源/补全/确认计划/运行名称一致。
- 识别等待验证持续动画与减少动态效果、可访问的收起按钮、收起恢复、取消后迟到回执不推进、后台回执保持收起、本地分类直接通过与无模型门控。合成回执由窗口外工具触发，不伪装成真实模型请求。
- 脚本错误 0；HTTP 请求 0。v3机器结果、逐项检查与当时12个源码/素材文件 SHA-256 见 [preview-checks-v3.json](preview-checks-v3.json)；图标源码与许可的 Git blob SHA 另存于 [素材来源](assets/file-icons/provenance.json)。
- 主代理已查看玄墨来源图标、玄墨单栏选择页、玄墨/宣纸识别等待截图。截图只证明合成稿在该浏览器下的表现。

本轮 v3 依据真实 `SidebarTree.tsx` 的文风和爽点/泪点入口、`setting-types.ts` 的 STYLE/GOLD_FINGER、Trope 的 SATISFACTION/TEAR，移除“其他设定”卡片。现为13类来源、12项补全；未识别类别禁用，补充合成资料含爽点/泪点与文风时默认勾选，二者不混入金手指。D-18 验证了来源查看、来源取舍与补全独立、确认摘要及进度名称，并生成双主题截图。第一次断言把整张label的禁用说明一并读入，改为仅读卡片标题后通过；没有将其误报为UI缺陷。v2报告保留于 [preview-checks-v2.json](preview-checks-v2.json)。

## 迭代记录与限制

最初在沙箱中启动 Chrome 失败（SIGABRT），没有计为通过。随后获执行环境授权，仅运行此本地合成预览脚本；没有访问用户 Chrome 配置、真实作品或 Key。

首次可执行核对发现 Tab 在边界可离开模态；增加显式焦点循环、稳定单选框/展开按钮标识后重新核对通过。另修复模态祖先可滚动导致的窄窗头部裁切：模态改用 `overflow:clip`，仅正文滚动，并增加头部几何断言。截图时等待字体完成与两次绘制，避免捕获切页的未绘制画面；最终390px冲突截图已实际查看，标题和关闭按钮完整。最后再次执行相同 D-01–D-12，生成最终截图与哈希。

独立复审随后发现来源核对的另一条入口可绕过待归类门控，以及完成页关闭又生成待办任务。已修复为统一 `sourceReady` 门控（来源、选择、确认、开始均检查）、未归类返回来源，以及独立完成状态；D-09 补从选择页回看范围，D-08 补实际推进完成后关闭并重新导入。修订后相同脚本再次退出 0，仍为上述12项/24组布局/11张截图，最终结果覆盖这两条操作路径。

上两段为 v1 历史，机器报告保留于 [preview-checks-v1.json](preview-checks-v1.json)。v2 按用户修订扩展设计核对；独立审核发现的识别中 X 可访问名称已修为“收起导入窗口”，并补后台识别完成不自动弹窗。新增后台核对最初未等待异步合成回执，断言早于消息处理；修正为等待回执后的状态后，相同17项全部通过。最终哈希与截图均对应当前 v2 文件。

未执行：产品单元/集成/浏览器测试、全量测试、构建、真实模型调用、DOC/DOCX/PDF 等真实解析、磁盘作品发布、macOS/Windows 原生文件选择器或安装包验收。本任务尚待用户批准 HTML；这些验证应在后续获批技术方案和定向用例中落实，不以本记录替代。

## 关键截图

| 交互 | 图 |
| --- | --- |
| v4 来源复选框/补全卡片 · 玄墨 | [preview-choices-v4-ink-1280x800.png](preview-choices-v4-ink-1280x800.png) |
| v4 来源复选框/补全卡片 · 宣纸 | [preview-choices-v4-paper-1280x800.png](preview-choices-v4-paper-1280x800.png) |
| v4 窄窗 · 玄墨 | [preview-choices-v4-ink-390x600.png](preview-choices-v4-ink-390x600.png) |
| v4 窄窗 · 宣纸 | [preview-choices-v4-paper-390x600.png](preview-choices-v4-paper-390x600.png) |
| 内容选择 · 玄墨 | [preview-selection-ink.png](preview-selection-ink.png) |
| 内容选择 · 宣纸 | [preview-select-paper-1280x800.png](preview-select-paper-1280x800.png) |
| v3真实设定分类 · 玄墨 | [preview-selection-settings-v3-ink.png](preview-selection-settings-v3-ink.png) |
| v3真实设定分类 · 宣纸 | [preview-selection-settings-v3-paper.png](preview-selection-settings-v3-paper.png) |
| 核对来源 · 真实文件类型图标 | [preview-source-ink.png](preview-source-ink.png) |
| 内容识别中 · 玄墨 | [preview-recognizing-ink.png](preview-recognizing-ink.png) |
| 内容识别中 · 宣纸 | [preview-recognizing-paper.png](preview-recognizing-paper.png) |
| 分类前授权 | [preview-recognition-consent.png](preview-recognition-consent.png) |
| 冲突决策 | [preview-conflict-ink.png](preview-conflict-ink.png) |
| 正文修改批准 | [preview-body-diff.png](preview-body-diff.png) |
| 无正文冲突 | [preview-settings-conflict.png](preview-settings-conflict.png) |
| 未发现与完成摘要 | [preview-body-result.png](preview-body-result.png) |
