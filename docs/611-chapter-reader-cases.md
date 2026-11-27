# 611 · 作品正文阅读排版 测试用例

依据 `docs/611-chapter-reader-plan.md`（含 §8 第二版修订）与已批准设计 `design/chapter-reader/index.html` v4。

## 0. 夹具

### 0.1 单元 `tests/unit/chapter-reader.test.ts`

纯函数与 store，`node --import tsx --test`。store 用例前设置内存 `localStorage` 桩（`globalThis.localStorage`），每例前 `clear()` 并调用 `useChapterReaderStore.persist.rehydrate()`。

### 0.2 浏览器 `tests/browser/chapter-reader.test.ts`

- 先例：`tests/browser/file-export.test.ts`（真实 `ChapterContentPanel` + fetch 桩）、`tests/browser/text-shortcuts.test.ts`（真实 `DesktopCommandController` + `initializeStartupCommandCatalog('darwin')`）。
- 样式：真实 `src/app/globals.css` 经 postcss/tailwind 编译 + 真实 `src/app/desktop.css`。
- 挂载：`ThemeProvider attribute="class" themes={["paper","ink"]}`（与 `src/app/providers.tsx` 一致）+ `QueryClientProvider` + `DesktopCommandController` + `Toaster`。暴露 `setTheme(t)`。
- 布局：`mode=wide` 宽 1200px；`mode=narrow` 宽 560px；`mode=outline` 挂真实 `ChapterOutlinePanel`（或同等 `MarkdownEditor` 大纲调用方）。高度 760px。
- `useDesktopStore.setState({bootstrap})`：`platform:'darwin'`，`settings.appearance` 为默认值（`bodyFont:'serif'`），`shortcuts:{darwin:{},win32:{},linux:{}}`。
- fetch 桩：`GET /api/novels/n1/chapters/c1` → 可配置的章节（默认：卷 `{index:1,title:'第一部 小丑'}`，章 `{index:1,title:'第一章 绯红'}`，正文为 4 段夹具文字「甲段……」「乙段……」「丙段……」「丁段……」，状态 `WRITTEN`）；`/candidates` → `[]`；`/comments?` → `{threads:[]}`（可配置一条 thread）；`/score-report?` → 空报告；`/foreshadows`、`/references` → 空。所有 `PUT`/`POST` 记录到 `requests`。
- `window.desktop`：照 text-shortcuts 的桩（`command`、`onEvent`、`showTextContextMenu`、`readClipboardText`、`writeClipboardText` 记录写入值）。
- 每个场景新建页面；`pageerror` 为空才通过。每例前 `localStorage.clear()`。

### 0.3 真实目标 `scripts/verify-chapter-reader.mjs`

隔离数据根（复制 `~/shakeink-test-roots/worldline-ui-599` 中已导入作品，按 [isolated-root lease receipt] 规则移走 inbox 租约回执），真实 Electron + `npm run build` 产物，Playwright `_electron` 驱动。证据写入 `docs/611-chapter-reader-evidence/`。

## 1. 单元

| 编号 | 场景 | 期望 |
|---|---|---|
| CRU-01 | `chineseNumeral` | 1→一，9→九，10→十，11→十一，19→十九，20→二十，21→二十一，99→九十九，100→一百，101→一百零一，105→一百零五，110→一百一十，213→二百一十三，1000→一千，1001→一千零一，1010→一千零一十，10010→一万零一十，0→"0"，-1→"-1"，1.5→"1.5"，100000000→"100000000" |
| CRU-02 | 卷标签 | `{index:1,title:'第一部 小丑'}`→`volumeLabel='第一部 小丑'`；`{index:2,title:'青石巷'}`→`'第二卷 · 青石巷'`；`{index:3,title:''}`→`'第三卷'`；`{index:1,title:'第1卷：开端'}`→`'第1卷：开端'` |
| CRU-03 | 章标签（章名自带序号） | `'第一章 绯红'`→`number='第一章'`,`title='绯红'`；`'第1章：开端'`→`'第1章'`,`'开端'`；`'第十二回·夜'`→`'第十二回'`,`'夜'`；`'第三章'`→`number=''`（不单独显示）,`title='第三章'` |
| CRU-04 | 章标签（章名无序号） | `{index:3,title:'灯下来客'}`→`number='第三章'`,`title='灯下来客'`；`{index:3,title:'  '}`→`number=''`,`title='第三章'`；`{index:3,title:'第三者'}`→`number='第三章'`,`title='第三者'`（“第三者”不是章序号） |
| CRU-05 | 面包屑 | CRU-02/03/04 各组合：`crumbVolume` 把「 · 」换成空格（`'第二卷 青石巷'`）；`crumbChapter` 为 `'第一章 绯红'`、`'第三章 灯下来客'`、`'第三章'`（不重复） |
| CRU-06 | store 默认值 | 空 localStorage：`{align:'center',showVolume:true,showNumber:true,showWords:true,size:18,paperBackground:'default',inkBackground:'default'}` |
| CRU-07 | store 写入与读回 | `setReader({size:20,inkBackground:'blue'})` 后 localStorage `chapter-reader-v1` 的 `state` 含这两项；`rehydrate()` 后读回相同；其他字段不变 |
| CRU-08 | 坏数据回落 | localStorage 写入 `{state:{align:'right',size:17,showWords:'yes',paperBackground:'blue',inkBackground:'green'},version:0}` → rehydrate 后 `align:'center',size:18,showWords:true,paperBackground:'default',inkBackground:'green'`；写入非 JSON 字符串 → 全部默认，不抛错 |
| CRU-09 | `preview-selection` 界面选择器 | jsdom 不可用时用浏览器 CR-31 覆盖；单元只断言 `ui` 选择器字符串包含 `[data-preview-chrome]`（读源码） |

## 2. 浏览器：章首与布局（宽面板，宣纸）

| 编号 | 场景 | 期望 |
|---|---|---|
| CR-01 | 默认章首 | `header[aria-label="章节信息"]` 存在，位于第一个 `[data-block]` 之前；文本依次为「第一部 小丑」「第一章」「绯红」「N 字 · 已生成」，N 等于工具条「字数 N」（`countChineseWords(content)`）；`text-align` 为 `center` |
| CR-02 | 章首字号 | `h1` 计算字号 = 18×1.6=28.8px；章节号 `span` 颜色为 `--reader-seal`（宣纸 `rgb(176, 53, 36)`） |
| CR-03 | 顶栏面包屑 | 顶栏 `h2` 文本为「第一部 小丑 › 第一章 绯红」，`title` 属性同文本；状态徽标「已生成」、保存状态、「正文功能菜单」按钮仍在；页面上不再出现「第 1 卷 · 第 1 章《」 |
| CR-04 | 书页尺寸与底色 | `.chapter-reader-page` 宽 760px，水平居中（左右留白差 ≤ 1px），`box-shadow` 非 `none`；书页背景 `rgb(251, 246, 233)`，外层背景 `rgb(239, 231, 210)`；正文颜色 `rgb(51, 41, 28)` |
| CR-05 | 正文排版 | 第一个 `[data-block] p`：字号 18px，行高 35.1px（1.95），`text-indent` 36px，`margin-bottom` 13.5px，`text-align: justify`，`letter-spacing` 0.36px，`font-family` 含 `Noto Serif SC` |
| CR-06 | 章首不受段落规则影响（审核中 1） | 章首内所有元素 `text-indent` 为 0px；章末元素 `text-indent` 为 0px |
| CR-07 | 章末 | 最后一个 `[data-block]` 之后有「本章完」与「N 字」；`aria-hidden` 的装饰不含文字 |
| CR-08 | 章首 h1 重置 | 章首 `h1` 的 `::after` `content` 为 `none`，`border-left-width` 为 0px |
| CR-09 | 玄墨默认 | `setTheme('ink')` 后书页 `rgb(26, 23, 22)`，正文 `rgb(214, 206, 196)`，外层 `rgb(15, 13, 12)`，章节号 `rgb(224, 122, 95)`，正文字体仍含 `Noto Serif SC` |
| CR-10 | 窄面板（审核中 3、中 4） | `mode=narrow`：书页宽度 = 滚动容器内宽，`box-shadow` 为 `none`，`padding-left` 40px；书页高度 ≥ 滚动容器高度；外层底色不可见（在书页下方 10px 采样 `elementFromPoint` 命中书页） |
| CR-11 | 窄面板评论钮不压正文 | `mode=narrow`，悬停第一段，`[data-testid="text-comment-block-add"]` 的右边界 ≤ 第一段文本左边界 |
| CR-12 | 空章名 / 无序号章名 | 章节 `{index:3,title:'灯下来客'}`、卷 `{index:2,title:'青石巷'}` → 章首「第二卷 · 青石巷」「第三章」「灯下来客」；面包屑「第二卷 青石巷 › 第三章 灯下来客」 |
| CR-13 | 章名即序号 | 章节 `{title:'第三章'}` → 章首只有一个「第三章」（`h1` 内无章节号 `span`） |
| CR-14 | 阿拉伯数字章名 | `{title:'第1章：开端'}` → 章节号「第1章」，章名「开端」 |

## 3. 浏览器：阅读设置

| 编号 | 场景 | 期望 |
|---|---|---|
| CR-20 | 入口 | 预览模式工具条在模式切换之前有按钮「Aa 阅读设置」（`aria-label="阅读设置"`）；点击后出现 `role="dialog"` 弹出框，含「章首对齐」「章首显示」「字号」「背景（宣纸）」 |
| CR-21 | 默认选中 | 「居中」`aria-pressed=true`；三个开关 `aria-checked=true`；「18」`aria-pressed=true`；「米黄（默认）」`aria-pressed=true`；宣纸色板恰为「米黄（默认）」「护眼绿」「纯白」 |
| CR-22 | 对齐 | 点「左对齐」→ 章首 `text-align:left`，装饰线为单条 48px 宽、高 2px、背景为印章色，无菱形；弹出框仍打开 |
| CR-23 | 隐藏卷名 | 关「卷名」→ 章首无「第一部 小丑」；其他项仍在 |
| CR-24 | 隐藏章节号 | 关「章节号」→ `h1` 只含「绯红」 |
| CR-25 | 隐藏字数 | 关「字数」→ 章首元信息只有「已生成」，章末只有「本章完」，二者都不含「字」 |
| CR-26 | 字号 | 依次点 16/20/22 → 正文段落字号 16/20/22px，章首 `h1` 为字号×1.6；工具条字数不变 |
| CR-27 | 宣纸背景 | 点「护眼绿」→ 书页 `rgb(227, 238, 219)`、正文 `rgb(38, 51, 31)`；点「纯白」→ `rgb(255, 255, 255)`、`rgb(34, 34, 34)` |
| CR-28 | 玄墨色板 | `setTheme('ink')`，打开弹出框 → 标题「背景（玄墨）」，色板恰为「玄石（默认）」「墨绿」「夜蓝」「纯黑」，默认「玄石（默认）」选中；依次点 → 书页 `rgb(21, 32, 27)` / `rgb(22, 27, 37)` / `rgb(5, 5, 5)` |
| CR-29 | 两套分别记忆 | 宣纸选「护眼绿」，玄墨选「夜蓝」；切回宣纸书页为护眼绿，切回玄墨为夜蓝；弹出框里对应色块 `aria-pressed=true` |
| CR-30 | 持久化 | 设置 左对齐/关字数/20/护眼绿 后重新加载页面（同一 localStorage）→ 章首左对齐、无字数、正文 20px、书页护眼绿；对齐与开关在新章节（换 refId 的第二个章节）同样生效 |
| CR-31 | 设置不写作品 | CR-20–CR-30 期间 `requests` 中无任何 `PUT`/`POST`/`PATCH`；正文 `content` 未变 |

## 4. 浏览器：弹出框关闭（R11）

每例先打开弹出框，断言 `role="dialog"` 可见后执行动作。

| 编号 | 动作 | 期望 |
|---|---|---|
| CR-40 | 点弹出框内开关、字号、色块、对齐 | 弹出框仍打开，设置生效 |
| CR-41 | 点正文第一段 | 弹出框关闭 |
| CR-42 | 点章首 `h1` | 关闭 |
| CR-43 | 点书页两侧桌面底色 | 关闭 |
| CR-44 | 点顶栏面包屑 | 关闭 |
| CR-45 | 点工具条字数文字 | 关闭 |
| CR-46 | 点工具条「编辑」 | 弹出框关闭，且编辑器切到编辑模式（点击本身生效） |
| CR-47 | 再点「Aa 阅读设置」 | 关闭 |
| CR-48 | 按 Esc（`page.keyboard.press` 与 CDP `Input.dispatchKeyEvent` 各一次，见 memory text-shortcut-598） | 关闭，焦点回到「Aa 阅读设置」按钮；`window.desktop.command` 未被调用 `ai.stop` |
| CR-49 | 打开期间按 Cmd+S（`file.save`） | 弹出框打开时按模态处理，不抛错、无 `pageerror`；关闭后再按 Cmd+S 正常分发（审核中 5，认定可接受） |

## 5. 浏览器：正文行为不回归

| 编号 | 场景 | 期望 |
|---|---|---|
| CR-50 | 全选 | 点「正文功能菜单 › 全选」→ 选区文本等于 4 段正文以 `\n\n` 连接，不含「第一部」「绯红」「本章完」 |
| CR-51 | 空正文全选（审核中 2） | 正文为空：章首仍显示，章末不显示；Cmd+A 后 `readPreviewSelection` 结果文本为空，不含章首文字；复制写入剪贴板的内容不含章首 |
| CR-52 | 拖选正文→评论 | 在第二段拖选 4 个字，出现「添加评论」浮钮，提交后 `POST /comments` 请求体 `quote` 为这 4 个字、`startOffset` 与源文一致 |
| CR-53 | 段落行评论钮 | 悬停第三段出现「评论本段」，位置在书页左侧留白内 |
| CR-54 | 评论锚点高亮 | 配置一条 quote 为第二段前 6 字的 thread → `mark.text-comment-anchor` 文本等于这 6 字 |
| CR-55 | 章首不可选 | 从章首 `h1` 中点向下拖到第一段中点 → 选区文本不含「绯红」；章首 `user-select` 计算值为 `none` |
| CR-56 | 分屏 | 切到「分屏」：右侧预览有章首与书页（窄布局，`box-shadow:none`），左侧 Monaco 存在；工具条仍有「Aa 阅读设置」 |
| CR-57 | 编辑与评审 | 切到「编辑」：无章首，工具条无「Aa 阅读设置」；切到「评审」：无章首、无「Aa 阅读设置」 |
| CR-58 | 流式生成 | 生成正文流式期间（fetch 桩挂起 SSE）：章首显示，章末不显示；结束后章末出现 |
| CR-59 | 其他编辑器不变 | `mode=outline`：大纲面板预览内无 `.chapter-reader`、`[data-preview-chrome]`、「Aa 阅读设置」；内层容器 class 仍为 `relative mx-auto max-w-[720px] px-11 pb-24 pt-8`；第一个段落 `text-indent`、字号与改动前基线快照（`git stash` 前采集，存入 `tests/fixtures/611-outline-baseline.json`）一致 |
| CR-60 | 对比预览不变 | 打开「版本历史」或候选稿对比中的 `MarkdownPreview novel`：无章首，段落样式与基线一致 |

## 6. 既有用例回归

- 浏览器：`file-export`、`text-selection`、`text-shortcuts`、`text-context-menu`、`workspace-surfaces`、`content-tabs`、`content-tabs-render`。`file-export` 中 `chapter` 模式依赖「正文功能菜单」，应继续通过。
- 单元：`npm test` 中涉及 `comment-selection`、`preview-text-commands`、`appearance-settings` 的文件。全量 `npm test` 与 `npm run typecheck` 运行一次（AGENTS.md 要求全量用例）。

## 7. 真实目标（`scripts/verify-chapter-reader.mjs`）

| 编号 | 场景 | 期望 / 证据 |
|---|---|---|
| CRR-01 | 打开已导入作品第一章（宣纸、宽窗口 1440×940） | 截图 `crr-01-paper.png`；章首、面包屑、书页、章末存在；`getComputedStyle` 记录 CR-04/05 数值 |
| CRR-02 | 玄墨 | 菜单切换主题后截图 `crr-02-ink.png`，记录 CR-09 数值 |
| CRR-03 | 阅读设置 | 打开弹出框截图；切左对齐、关字数、字号 20、玄墨夜蓝；截图 `crr-03-settings.png` |
| CRR-04 | 外部点击与 Esc | 点正文关闭；重开后真实键盘 Esc（`webContents.sendInputEvent`）关闭 |
| CRR-05 | 重启保留 | 退出应用并重启同一数据根，再打开同一章：CRR-03 的设置仍生效，截图 `crr-05-restart.png` |
| CRR-06 | 窄面板/分屏 | 拖窄内容面板到约 560px 或切分屏，截图 `crr-06-narrow.png`，书页铺满 |
| CRR-07 | 正文未改 | 运行前后读回该章 `content` 与 `version`，完全相同 |

报告 `docs/611-chapter-reader-evidence/real-target-report.json`。目录迁移后设置是否保留不在本次验证范围，交付说明写为未验证。

## 8. 台账映射

`docs/requirements-traceability.json` 追加 `CR-611`（只追加）：R1→CR-01/02/12–14，R2→CR-50/51/55，R3→CR-03，R4→CR-04/10/11，R5→CR-05/06，R6→CR-04/09，R7→CR-07/58，R8→CR-20–26，R9→CR-27–29，R10→CR-30/CRR-05，R11→CR-40–49/CRR-04，R12→CR-56/57；范围→CR-59/60；`deviations`：章首不可选（CR-55）。

## 9. 第二版修订（依据 `docs/611-chapter-reader-cases-review.md`）

以下覆盖前文。**全部用例编号加前缀 `CR611-`**（台账中 `CR-01`~`CR-04` 已占用），如 `CR611-01`、`CR611-U01`（原 CRU-01）、`CR611-R01`（原 CRR-01）。下文仍用短号。

### 9.1 夹具修订（高 2、高 3、中 4、中 5、低）

- bootstrap：`{...defaultState, platform:'darwin'}`（照 `text-shortcuts.test.ts`），`settings.appearance` 中 `bodyFontSize:16, lineHeight:1.8, bodyFont:'serif'`。挂载前按 `DesktopApp.tsx:187-189` 在根元素写入 `--desktop-body-size:16px`、`--desktop-body-line-height:1.8`、`--desktop-body-font: desktopFontFamily('serif',true)`。暴露 `setBodyFont(f)` 重写该变量。
- 外层包 `<CommentDraftAccount userId="local-author">`。
- Monaco：照 `text-shortcuts.test.ts:21/53` 的 `MonacoEnvironment` 与 `.ttf` loader。
- 探针：组件 `<Probes/>` 用 `useDesktopCommands` 注册 `ai.stop`（enabled 恒真）与 `file.save`（enabled 恒真），记录执行次数 `probes()`。
- fetch 桩补：`GET …/versions` → 一条版本 `{id:'v-1',version:1,content:'旧版正文。',…}`；`GET …/versions/v-1` 返回同内容；`POST …/generate` → 可控 `ReadableStream`（`stream.push(event)`、`stream.end()`）；`POST /comments` 记录请求体并返回 thread；`GET …/foreshadow-references?…` 可配置一条 `CHAPTER_CONTENT` 引用。
- 第二个章节 `c2`：`{index:2,title:'灯下来客'}`、卷 `{index:2,title:'青石巷'}`、正文 ≥ 1000 字（`'戊'.repeat(1236)` 分 4 段），供 CR-12、字数格式与 CR-30 换章。
- 窄/宽与其他调用方模式：`wide`、`narrow`、`candidate`（真实 `CandidatePanel`）、`world`（真实 `WorldPanel` 或 `SettingContentEditor`，取能以桩数据挂起的一个）。
- 每例前 `localStorage.clear()`；按键用 CDP `Input.dispatchKeyEvent`（memory text-shortcut-598）。

### 9.2 用例修订

| 编号 | 修订 |
|---|---|
| CR-01 | 元信息按分项断言：子元素文本依次为「36 字」类（N 字）与「已生成」，不断言分隔符 |
| CR-01b（新） | 打开 `c2`：章首字数为「1,236 字」，与工具条「字数 1,236」一致 |
| CR-02 | 补章节号 `span` 字号 16.128px |
| CR-03 | 先在编辑模式输入一个字并等待自动保存完成，再回预览断言保存状态存在；面包屑 `white-space:nowrap`、`text-overflow:ellipsis` |
| CR-05 | 夹具 `--desktop-body-size:16px`、行距 1.8 下，正文仍为 18px / 35.1px，证明阅读样式覆盖；补 `margin-top:0px`；元信息与章末 `font-family` 等于 `--font-ui` 计算值 |
| CR-05b（新） | `setBodyFont('system')` → 正文 `font-family` 以 `system-ui` 开头（以设置为准，方案 §8.9） |
| CR-09 | 补玄墨书页 `box-shadow` 非 `none` |
| CR-21b（新） | 选中色块 `box-shadow` 含两层（选中环）；玄墨下色块 `border-color` 为 `rgba(255, 248, 240, 0.22)` |
| CR-48 | Esc 后 `probes().aiStop === 0`，弹出框关闭，焦点回按钮 |
| CR-49 | 打开期间 CDP 发 Cmd+S → `probes().fileSave === 0`；派发 `window.dispatchEvent(new CustomEvent('desktop:command',{detail:'file.save'}))`（按 `DesktopCommandController.tsx` 实际 detail 形态）→ 仍为 0。点正文关闭后重复两种方式 → 各执行 1 次 |
| CR-51 | 先点击预览聚焦，CDP 发 Cmd+A，再 Cmd+C → 剪贴板无写入或写入空串，不含章首文字 |
| CR-52 | 依赖夹具 `CommentDraftAccount`；断言 `POST /comments` 体 `quote` 与偏移 |
| CR-55b（新） | 从章首拖到正文：不出现「添加评论」浮钮；工具条「标注伏笔」`disabled` |
| CR-55c（新） | 悬停章首 `h1`：不出现 `text-comment-block-add` |
| CR-55d（新） | 在章首右键：`window.desktop.showTextContextMenu` 未被调用（或请求中无正文选区命令）；在正文右键则被调用 |
| CR-55e（新） | 配一条伏笔引用（quote 为第二段前 4 字）→ `.foreshadow-mark` 存在于第二个 `[data-block]` 内 |
| CR-58 | `POST /generate` 挂起期间：章首显示、章末不显示；推送 `draft-delta` 后推送 `content-committed`（version 2）并结束流，`GET c1` 随后返回 version 2 → 章末出现 |
| CR-59 | 改为：`candidate` 模式（真实 `CandidatePanel`，`novel`+评论）与 `world` 模式下，预览内无 `.chapter-reader`、`[data-preview-chrome]`、`[data-reader-size]`、「阅读设置」按钮；内层容器 class 恰为 `relative mx-auto max-w-[720px] px-11 pb-24 pt-8`；`candidate` 的第一段 `text-indent` 为 2em 对应 px、`margin-top`/`margin-bottom` 为 `.45em` 对应 px、字号等于 `--desktop-body-size`（16px）。不采集 git 基线 |
| CR-60 | 拆成两例：CR-60a 版本历史（菜单「版本历史」→ 选中 `v-1`）预览无章首、段落缩进 2em；CR-60b 候选稿对比（`ChapterHistory` candidates 模式的两栏 `MarkdownPreview`）同样断言 |
| CR-61（新） | `docs/reuse-manifest.json` 中 `ChapterContentPanel.tsx`、`CommentablePreview.tsx`、`MarkdownEditor.tsx` 的 `currentSha256` 等于文件实际 sha256，`status` 为 `adapted-desktop-boundary`（单元，读文件计算） |

### 9.3 真实目标修订（中 11）

- 数据根：复制到 `~/shakeink-test-roots/chapter-reader-611/`，移走 inbox 租约回执。截图与原始读回存 `~/shakeink-test-roots/chapter-reader-611-evidence/`，**不进仓库**。仓库 `docs/611-chapter-reader-evidence/real-target-report.json` 只记：用例结果、计算样式数值、章节 id、正文 sha256、version、截图文件名与 sha256。不得包含 `state.json`、bootstrap、正文原文。
- Node 24 构建一次后运行；运行期间不构建。
- CRR-02：通过设置页「外观 › 主题」点「玄墨」切换。
- CRR-05：`electronApp.evaluate(({app})=>app.quit())` 正常退出后再启动。
- CRR-06 拆成 CRR-06a（拖窄内容面板）与 CRR-06b（分屏），各截一张。
- CRR-07：只比较 sha256 与 version。

### 9.4 台账映射（替换 §8）

`CR611`（只追加）：
- R1→CR611-01/01b/02/12/13/14；R2→CR611-50/51/55/55b/55c/55d/55e；R3→CR611-03；R4→CR611-04/10/11；R5→CR611-05/05b/06/08；R6→CR611-04/09/21b；R7→CR611-07/58；R8→CR611-20–26；R9→CR611-27–29/21b；R10→CR611-30/R05；R11→CR611-40–49/R04；R12→CR611-56/57；范围→CR611-59/60a/60b；设置不写作品→CR611-31/R07；评论/伏笔不回归→CR611-52/53/54/55e；标签与存储→CR611-U01–U09；台账→CR611-61；真实目标→CR611-R01–R07；回归→§6。
- `deviations`：章首不可选（批准稿 `user-select:text`，CR611-55）；阅读视图不使用设置里的正文字号与行距（CR611-05）；弹出框打开期间全局命令按模态拦截（CR611-49）；阅读设置不随导出配置迁移、跟随数据根；窗口拖拽区与原生菜单点击不关闭弹出框（交付说明，未自动化）。
