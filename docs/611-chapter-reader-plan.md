# 611 · 作品正文阅读排版 技术方案

## 1. 依据

- 调研：`docs/611-chapter-reader-research.md`。
- 已批准设计：`design/chapter-reader/index.html` v4（用户 2026-11-28「UI 设计审核通过，可以继续」）。审核记录见调研文档第 6 节。
- 范围：只改章节内容面板（`chapter-content` 标签，`ChapterContentPanel`）的预览视图与分屏右侧预览。大纲、设定等其他 `MarkdownEditor`，`MarkdownPreview`，候选稿/版本/冲突对比里的 `.novel` 预览都不变。

## 2. 批准设计的要求清单

| 编号 | 要求 |
|---|---|
| R1 | 正文第一段前显示章首：卷信息（第N卷 · 卷名）→ 印章色章节号（第N章）→ 大字章名 → 字数 · 状态 → 装饰线。章首随正文滚动 |
| R2 | 章首不计字数、不进正文选区、不能作评论/伏笔锚点 |
| R3 | 面板顶栏改为面包屑「卷 › 章」；保留状态徽标、保存状态、「⋯」菜单 |
| R4 | 宽面板：正文区为深一档的“桌面”底色，中间 760px 书页带轻阴影；窄面板（< 820px）书页铺满，无阴影 |
| R5 | 正文衬线字体，默认 18px，行高 1.95，段距 0.75em，首行缩进 2em，两端对齐 |
| R6 | 宣纸书页 `#fbf6e9` / 字 `#33291c`；玄墨书页 `#1a1716` / 字 `#d6cec4`（其余色值以设计稿 CSS 为准） |
| R7 | 正文后显示「— 本章完 —」和字数 |
| R8 | 预览工具条「Aa 阅读设置」弹出框：章首对齐（居中/左对齐，默认居中）；章首显示卷名/章节号/字数开关（默认全开，关字数时章首与章末都隐藏）；字号 16/18/20/22（默认 18）；背景按主题各一套 |
| R9 | 宣纸背景：米黄（默认）/护眼绿/纯白；玄墨背景：玄石（默认）/墨绿/夜蓝/纯黑。两套选择分别记忆 |
| R10 | 设置即时保存，作用于所有章节，重启后保留 |
| R11 | 弹出框外任何点击都关闭弹出框，该点击照常生效；框内点击不关；再点按钮关闭；Esc 关闭 |
| R12 | 分屏右侧预览同样排版；编辑模式、评审视图不变 |

## 3. 现状要点

- `ChapterContentPanel.tsx:280-289` 顶栏 `h2`「第 1 卷 · 第 3 章《标题》」。
- `ChapterContentPanel.tsx:396-413` 渲染 `MarkdownEditor novel`，同时传 `commentsTarget`、`foreshadowTarget`，所以预览分支总是走 `CommentablePreview`（`MarkdownEditor.tsx:415-430`），不会走 `MarkdownPreview`。
- `CommentablePreview.tsx:392-399`：外层 `div.markdown-body.novel`（滚动容器，`scrollRef`）→ 内层 `div.relative.mx-auto.max-w-[720px].px-11.pb-24.pt-8`（`innerRef`，浮钮定位基准）→ 每块 `PreviewBlock`（`[data-text-preview][data-block]`）。
- 选区、全选、复制只以 `[data-block]` 为正文根（`preview-selection.ts:previewBodyRoots`），评论高亮与伏笔标记也只遍历 `[data-block]`（`CommentablePreview.tsx:223`、`preview-references.tsx:34`）。所以块以外的节点天然不进正文映射。
- 桌面外观：`desktop.css:178` 用 `--desktop-body-font/size/line-height` 覆盖 `.desktop-markdown-editor .markdown-body`（来自设置「正文字体/字号/行距」，`DesktopApp.tsx:187-189`）。
- `.paper .markdown-body h1` 自带居中、`::after` 渐变线等样式（`globals.css:430-443`），章首若用 `h1` 必须在阅读作用域内重置。
- 桌面 UI 文本默认不可选（`desktop.css:1-5`），只有 `[data-text-preview]` 等边界允许选择。
- Esc：`DesktopCommandController.tsx:116` 在存在 `[role="dialog"]` 时直接放行 Esc，不 `preventDefault`。Base UI 1.8 Popover 弹出层 `role="dialog"`（`node_modules/@base-ui/react/popover/popup/PopoverPopup.js:91`），所以 Popover 自带的 Esc 关闭在真实应用里不会被 `ai.stop` 拦截（docs/599 记录的拦截只发生在无对话框时）。仍需真实应用验证。
- 内容抽屉里的弹出层用 `useContentDrawerPopup`（`ItemLevelPicker.tsx:78`、`:257-275` 先例），抽屉收放期间暂停弹出。

## 4. 方案

### 4.1 新增 `src/lib/chapter-reader.ts`（纯函数）

- `chineseNumeral(n)`：正整数 → 中文小写数字（1→一，10→十，11→十一，20→二十，105→一百零五，213→二百一十三，1000→一千，10010→一万零一十）。非正整数或 ≥ 1 亿时返回阿拉伯数字字符串。
- `chapterHeading(chapter)` → `{ volumeLabel, numberLabel, titleLabel, crumbVolume, crumbChapter }`：
  - 卷：卷名已以 `第N卷/部/册/篇` 开头时 `volumeLabel = 卷名`，否则 `第{中文}卷 · 卷名`；卷名为空时只用 `第{中文}卷`。
  - 章：章名以 `第N章/节/回` 开头（复用 `manuscriptTitle` 里的数字字符集）时，把这段前缀作为 `numberLabel`，其余（去首尾空白及 `：:·、` 分隔）作为 `titleLabel`；剩余为空时 `titleLabel = numberLabel` 且不再单独显示章节号。其他情况 `numberLabel = 第{中文}章`，`titleLabel = 章名`（为空时为 `numberLabel`）。
  - 面包屑：`crumbVolume = volumeLabel` 去掉「 · 」写成空格；`crumbChapter = numberLabel + " " + titleLabel`（重复时只写一次）。
- 不含 React，便于单元测试。

### 4.2 新增 `src/stores/chapter-reader.ts`（阅读设置）

- zustand `persist`，key `chapter-reader-v1`，和 `scene-ui.ts` 同一写法（renderer 的 `localStorage`，`shakeink://app` 源固定，重启后保留）。
- 状态：`{ align: "center"|"left", showVolume, showNumber, showWords: boolean, size: 16|18|20|22, paperBackground: "default"|"green"|"white", inkBackground: "default"|"green"|"blue"|"black" }`，默认 `center / true / true / true / 18 / default / default`。
- `merge` 对读回的值逐项校验，不在枚举内的值回落到默认值（防止手改或旧版本数据让界面崩溃）。
- 动作 `setReader(patch)`。

**为什么不放进 `state.json` 的 `settings.appearance`**：`appearanceSchema` 是 `.strict()`（`desktop/core/settings.ts:3-8`），新增字段要同时改主进程校验、默认值、配置导入导出标签（`ConfigurationTransfer.tsx:17`）、引导流程和大量构造完整 appearance 的测试夹具；这些设置只影响本机预览排版，不影响作品数据。代价：不随「导出配置」迁移。在交付说明中写明；若审核认为必须进配置导出，改为方案 B（扩展 `appearanceSchema` + `.default()`），工作量另计。

### 4.3 `CommentablePreview`（最小增量，其他调用方行为不变）

新增可选 props：`header?: ReactNode`、`footer?: ReactNode`、`contentClassName?: string`。

- `header` 渲染在 `innerRef` 容器内、第一个块之前；`footer` 渲染在最后一个块、孤儿气泡、末尾 composer 之后，浮钮之前。
- `contentClassName` 与内层默认类合并（`cn`），阅读视图用它替换宽度和内边距。
- 未传这些 props 时 DOM 与现在逐字相同。

### 4.4 `MarkdownEditor`

新增可选 prop `reader?: { header: ReactNode; footer: ReactNode; toolbar: ReactNode; className: string; contentClassName: string; attributes?: Record<string,string> }`：

- 只在 `CommentablePreview` 分支使用：`className` 给外层滚动容器，`contentClassName` 给内层，`header/footer` 透传；`attributes` 作为 `data-*` 写到外层（背景、对齐、字号）。
- `toolbar` 渲染在工具条右侧模式切换之前，仅 `effectiveMode` 为 `preview` 或 `split` 时显示。
- 未传 `reader` 时渲染与现在相同。`MarkdownPreview` 分支不改。

### 4.5 新增 `src/components/content/ChapterReader.tsx`

- `ChapterReaderHeader({ chapter, words })`：`<header class="chapter-reader-head" aria-label="章节信息">`，内含卷信息 `p`、`h1`（章节号 `span` + 章名）、元信息 `p`（字数 · 状态）、装饰 `div aria-hidden`。按设置隐藏卷名/章节号/字数。不加 `data-text-preview`，所以按桌面默认不可选，也不在正文根内（满足 R2）。
- `ChapterReaderFooter({ words })`：「本章完」+ 字数（受 `showWords` 控制）。正文为空时不渲染。
- `ChapterReaderSettings()`：「Aa 阅读设置」按钮 + Base UI `Popover`，经 `useContentDrawerPopup` 控制开合，`Positioner side="bottom" align="end"`。内容：章首对齐两个按钮（`aria-pressed`）、三个 `Switch`（`aria-label` 显示卷名/章节号/字数）、字号四个按钮、背景色块（`aria-label` 为名称、`aria-pressed`；按当前主题 `useTheme().resolvedTheme` 显示对应一套，写对应字段）。
- 外部点击关闭、Esc 关闭、焦点回到按钮由 Popover 提供（R11）。框内点击不关闭。
- `useChapterReader(chapter, words)` 返回传给 `MarkdownEditor` 的 `reader` 对象（`useMemo`）。

### 4.6 `ChapterContentPanel`

- 顶栏 `h2` 改为面包屑：`<h2 class="chapter-crumb" title=完整文本>`，卷段 `text-muted-foreground`，分隔 `›`，章段 `text-foreground font-medium`，单行省略。徽标、保存状态、菜单原样保留（R3）。
- 计算 `words = countChineseWords(content)`（与工具条字数同一函数），给 `MarkdownEditor` 传 `reader={useChapterReader(chapter, words)}`。

### 4.7 样式（`src/app/desktop.css`，全部在 `.chapter-reader` 作用域内）

- 外层 `.chapter-reader`：`container-type: inline-size`，背景 `var(--reader-desk)`；内层 `.chapter-reader-page`：`max-width: 760px; margin: 28px auto 40px; padding: 56px 64px 48px; background: var(--reader-page); box-shadow: var(--reader-shadow); border-radius: 4px; color: var(--reader-ink)`。
- `@container (max-width: 819px)`：书页 `margin:0; max-width:none; padding:36px 26px 40px; box-shadow:none; border-radius:0`，外层背景同书页（R4）。
- 字体：`font-family: var(--desktop-body-font, var(--font-serif))`（跟随设置「正文字体」，默认宋体系）；`font-size: var(--reader-size)`；`line-height: 1.95`；`.markdown-body p` 段距 `0 0 .75em`、缩进 `2em`、`text-align: justify`（R5）。选择器写成 `.desktop-markdown-editor .chapter-reader.markdown-body`，优先级高于 `desktop.css:178`。设置里的「正文字号/行距」对阅读视图不生效，由阅读设置字号取代（见 §7 问题 1）。
- 颜色变量：`.paper .chapter-reader` 与 `.ink .chapter-reader` 各定义默认值，`[data-reader-paper-bg=green|white]`、`[data-reader-ink-bg=green|blue|black]` 覆盖，值照设计稿（R6、R9）。
- 字号：`[data-reader-size="16|18|20|22"]` 设 `--reader-size`。
- 章首、章末、装饰线照设计稿；`[data-reader-align="left"]` 切换左对齐。章首 `h1` 重置 `.markdown-body h1` 和 `.paper .markdown-body h1::after`（`content:none`）、`border`、`padding`、`letter-spacing`、`font-family: inherit`。
- 评论浮钮 `left:10px` 相对内层，内边距加宽后仍在左侧留白内，不改。

### 4.8 台账

- `docs/reuse-manifest.json`：`ChapterContentPanel.tsx`、`CommentablePreview.tsx` 改为 `adapted-desktop-boundary`，`MarkdownEditor.tsx` 更新 `currentSha256`，三条都写 `reason`（已批准的 611 阅读排版，其他调用方行为不变）。
- `docs/requirements-traceability.json`：追加 `CR-611`（只追加，不 checkout；该文件常有未提交条目）。

## 5. 备选方案

| 方案 | 结论 |
|---|---|
| A. 在 `MarkdownEditor`/`CommentablePreview` 加可选插槽，章节面板传入（本方案） | 选区、评论、伏笔、全选、右键菜单逻辑不动；其他调用方不传就不变 |
| B. 把章首写成 Markdown 拼到正文前 | 章首会进字数、选区、评论偏移和保存内容，违反 R2 |
| C. 新写一个阅读组件替换预览 | 违反 AGENTS.md「MarkdownEditor 必须复用 Web 真实组件」，评论/伏笔要重做 |
| D. 用 CSS `::before` 生成章首 | 无法隐藏单项、无法放可访问文本，卷名需塞进属性，难测 |

## 6. 测试与验证计划（细节见 611 用例文档）

1. 单元：`chineseNumeral`、`chapterHeading`（含导入书名「第一章 绯红」、卷名「第一部 小丑」、空标题、大序号）、阅读设置 store 默认值与坏数据回落。
2. 浏览器（真实 `ChapterContentPanel` + 真实 globals.css/desktop.css，Chromium）：章首内容与对齐、开关、字号、两主题背景分别记忆、窄/宽布局、弹出框关闭规则（含 Esc，挂真实 `DesktopCommandController`）、全选/复制不含章首、评论浮钮与锚点仍可用、分屏/编辑/评审模式、其他编辑器（大纲面板）DOM 无阅读类。
3. 真实目标：隔离数据根下用真实 Electron 打开已导入作品的章节，两主题截图，执行点击关闭与 Esc、重启后设置保留。
4. 既有相关用例回归：`file-export`、`text-selection`、`workspace-surfaces`、`content-tabs` 浏览器用例，以及涉及 `CommentablePreview`/`MarkdownEditor` 的单元用例；`npm run typecheck`。

## 7. 待审核确认的问题

1. 设置里的「正文字号」「正文行距」在阅读视图里被阅读设置字号和固定行距 1.95 取代；「正文字体」继续生效。编辑模式（Monaco）仍按设置。
2. 阅读设置存 renderer `localStorage`，不随配置导出（§4.2）。
3. 章首不可选择复制（桌面默认 UI 文本不可选）。设计稿写过“可被选中复制”，但跨章首和正文的选区会让正文选区映射返回 null，影响复制/评论；选择不可选更稳。

## 8. 第二版修订（依据 `docs/611-chapter-reader-plan-review.md`）

以下条目覆盖前文对应内容。

1. **段落规则限定（中 1）**：正文段落样式只写在 `.chapter-reader [data-block] p`。章首、章末元素用 `div`/`span`，并在 `.chapter-reader-head`、`.chapter-reader-end` 内显式重置 `text-indent:0; margin:0; text-align:inherit`。
2. **章首章末不进正文（中 2）**：章首、章末根元素加 `data-preview-chrome`；`preview-selection.ts:5` 的 `ui` 选择器追加 `[data-preview-chrome]`，使 `clean()` 剔除它们、`readPreviewSelection`/`isPreviewBodyTarget` 把它们当界面。新增修改文件 `src/components/editor/preview-selection.ts`（一处选择器，其他调用方无此属性，行为不变）。
3. **窄面板（中 3、中 4）**：`container-type:inline-size` 放在外层滚动容器 `.chapter-reader`；`@container (max-width: 819px)` 只改后代 `.chapter-reader-page`：`margin:0; max-width:none; min-height:100%; padding:36px 40px 40px; box-shadow:none; border-radius:0`。书页铺满即覆盖桌面底色。左右内边距 40px，评论浮钮（10–36px）不压正文。分屏预览列 < 820px 时为窄布局，属预期。
4. **弹出框打开期间的全局命令（中 5）**：与现有 Popover/菜单（如 `ItemLevelPicker`）一致，打开期间按模态处理，全局菜单命令和快捷键不执行；弹出框是短暂的，任何外部点击即关闭。认定可接受，用例覆盖并写入交付说明，不加豁免。
5. **章末**：`readOnly`（流式生成中）或正文为空时不渲染章末。
6. **补齐设计细节**：正文 `letter-spacing:.02em`；元信息与章末小字用 `var(--font-ui)`；左对齐时装饰线为 48px×2px 印章色短线（无菱形）；色块选中环 `box-shadow:0 0 0 2px var(--popover),0 0 0 3.5px var(--primary)`；玄墨色块描边 `rgba(255,248,240,.22)`。
7. **`contentClassName`**：阅读视图内层类为 `relative chapter-reader-page`，并移除默认的 `max-w-[720px] px-11 pb-24 pt-8`：`CommentablePreview` 在传入 `contentClassName` 时用它**替换**默认的宽度与内边距类（保留 `relative mx-auto`），不靠 twMerge 覆盖。
8. **章首可选性（与批准稿的偏离）**：批准稿 `.chapter-head` 写了 `user-select:text`。实现不可选，理由：跨章首与正文的选区会让 `readPreviewSelection` 返回 null，评论与伏笔无法取得锚点。记入台账 `CR-611` 的 `deviations` 和交付说明。
9. **交付说明需写明**：阅读设置存于数据根 `session` 目录的 localStorage，不随「导出配置」迁移，目录迁移后的保留情况以真实验证结果为准；设置里显式选择非衬线正文字体时以设置为准；窗口拖拽区与原生菜单点击不会关闭弹出框。
10. **reuse-manifest**：三条保留原 `sha256`，写入 `currentSha256`、`status:"adapted-desktop-boundary"`；`reason` 说明 611 改动，并注明 `CommentablePreview.tsx`、`ChapterContentPanel.tsx` 在本次之前已有未登记的漂移（c4cf283 等）。`preview-selection.ts` 若在台账中有条目同样处理。
11. **用例补充**：卷名自带「第一卷」/「第一部」、阿拉伯数字「第1章」、空卷名、空章名；分屏窄布局；空正文全选不含章首；大纲面板 DOM 与改动前一致。

## 9. 实现阶段修订（依据 `docs/611-chapter-reader-code-review.md`）

- 章首根元素由 `<header>` 改为 `<div role="group" aria-label="章节信息">`，避免成为 banner 地标。
- `MarkdownEditor` 传入 `reader` 时工具条右侧固定使用包装层，切换模式不重挂载按钮（焦点不丢）；未传 `reader` 时 DOM 不变。
- 阅读设置按钮可见文字「Aa 阅读设置」，「Aa」`aria-hidden`，可访问名称为「阅读设置」；四组选项加 `role="group"` + `aria-labelledby`；开关整行可点击（与设计稿一致）。
- 设置订阅改用 `useShallow` 选择器；字数与标题 `useMemo`。
- `chapterHeading`：「节」「回」后须为分隔符或结尾（「第一节课」「第一回合」保持为章名）；分隔符增加「—」「｜」「|」「，」「,」；面包屑只在自动拼接卷号时把「 · 」换成空格，卷名自带的「·」保留。
