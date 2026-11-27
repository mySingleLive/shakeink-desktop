# 610 · 导入正文格式修复 技术方案

## 1. 需求（用户 2026-11-27）

导入后打开章节，正文挤成一大段，并且开头带着卷名和章名（截图：「第一部 小丑」「第一章 绯红 痛！ 好痛！ …」连成一片）。

- 正文中不能出现卷名和章节名：识别导入原文中的卷名、章节名并去除。
- 修复没有换行挤在一起的问题：自动识别哪里该断行、成为独立段落。
- 用《诡秘之主》第一卷（小丑，213 章）实测，文件 `/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt`。

## 2. 现状与原因

- 源文件 GB18030，每段一行，行首两个全角空格 `　　`，行间只有单个 `\n`。卷标题和章标题各占一行：`第一部 小丑\n\n\n第一章 绯红\n　　痛！\n　　好痛！…`。
- 向导把整本书切成章（`materializeWizardChapters`），每章 `content` 是原文切片，从卷标题/章标题行开始。`publishNovelImport`（`desktop/service/novel-import-publish.ts:151`）把 `c.content` 原样写入 `chapter.content`。
- 章节面板 `MarkdownEditor novel` 预览走 `renderMarkdown`（`marked`，`breaks:false`）。单个换行在 Markdown 中不分段，于是整章合成一个 `<p>`；标题行也并进了第一段。`.markdown-body.novel p` 已有 `text-indent:2em`，行首 `　　` 又叠加了一层缩进。

## 3. 方案

只改**写入作品章节表的正文**。导入会话（`s.chapters[].content`、`originalProse`、`workingProse`）和导入记录 `body-original` 继续逐字保存原文，所以第 21 步“逐字一致”校验、AI 分析单元、导入记录查看都不变。

### 3.1 新模块 `desktop/core/novel-import-prose.ts`

`formatImportChapterProse(raw, {title, volume?})` 返回 `{text, start(i), end(i)}`：`text` 是排版后的正文，`start`/`end` 把原文偏移映射到排版后的偏移（用于伏笔锚点）。

步骤：

1. **统一换行**：`\r\n`、`\r` 视为 `\n`。
2. **去除开头的标题行**：从开头逐行跳过，直到遇到第一行正文。可跳过的行：空行；去掉 Markdown `#`/`**` 装饰后等于本章 `title` 的行；卷标题行 `第N[卷部册编篇]（空白|：）<本章 volume>`；通用章节/卷标题行，即 `第N[章节回]…`、`第N[卷部册编篇]…`（≤150 字）、`序章…`、`楔子…`、`番外`、`Chapter …`、`Prologue`、`Epilogue`。只处理开头，正文中间引用的“第一章”不动。
3. **分段**：剩余文本按行处理。
   - 行内若有“句末标点 + 两个以上全角空格”，在该处拆开（原文丢了换行、只剩缩进的情况）。
   - 一行开启新段落的条件（满足其一）：上一行是空行；本行行首有缩进（全角空格、半角空格、制表符）；上一行以句末标点或闭引号结尾（`。！？!?…；;：:”」』’"）)】》~～—`）；上一行少于 20 字。
   - 否则视为固定宽度硬换行的续行，接到上一行。两边都是 ASCII 字母或数字时用一个空格连接，否则直接连接。
   - 每段去掉首尾空白（缩进交给 CSS 的 `text-indent`）。
4. **防止 Markdown 误解析**：行首是块级 Markdown 语法时（`#`、`>`、`- `/`+ `/`* `、`1. `/`1) `、只由 `-`/`=`/`*`/`_` 组成的分隔线），在行首加 `\`。对普通中文正文没有影响。
5. 段落之间用 `\n\n` 连接，末尾不加换行。结果为空时（整章只有标题）退回原文去掉标题后的 `trim()`；仍为空则写空串，章节照常创建。

偏移映射：处理时记录每个保留的原文字符在输出中的位置；被删除的字符（标题、缩进、换行）`start` 映射到下一个保留字符的位置，`end` 映射到上一个保留字符之后的位置。

### 3.2 发布时使用

`novel-import-publish.ts`：

- 创建章节时：`content: formatted.text`，`wordCount` 按排版后的正文计算（`Array.from(...).length`，与现在写法一致）。每章只排版一次，结果按章序缓存在 `Map<number, Formatted>` 里，由 `publishWizardLinks` 共用。
- 伏笔触点 `CHAPTER_CONTENT` 引用：`startOffset/endOffset` 用映射后的值，`quote` 取 `text.slice(start,end)`，`prefix/suffix` 用 `anchorContext(text, …)`。映射后为空（引文完全落在被去掉的标题里）时写整章引用（`quote:null`，偏移为空），与大纲引用找不到引文时的写法一致。
- 主题“篇幅”`chapterCharacters` 仍按原文计算（篇幅分档不受排版影响）。

### 3.3 不改的部分

- 会话、导入记录、第 21 步校验、AI 请求负载、PDF/MD 来源解析。
- 已经导入的旧作品不迁移，重新导入即可得到新格式。
- `（第一部完）` 这类卷尾标记不是卷名/章名，保留。

## 4. 备选方案

| 方案 | 结论 |
|---|---|
| A. 发布时排版（本方案） | 原文与会话不变，校验和锚点改动最小；只需映射伏笔偏移 |
| B. 在切章阶段就去标题、改段落 | 会话正文不再等于原文，第 21 步“逐字一致”、导入记录、AI 证据引用都要改，风险大 |
| C. 把 Markdown 渲染改成 `breaks:true` | 影响所有 Markdown 内容（大纲、设定、AI 回复），且不能去标题、不能修复硬换行 |

## 5. 验证

- 单元：`tests/unit/novel-import-prose.test.ts` 覆盖标题去除、分段规则、硬换行合并、Markdown 转义、偏移映射。
- 集成：现有 `novel-import-publish` / `verify-publish` / `pdf-publish` / `semantic-publish` / `wizard-publish` 测试中“章节正文 == 原文”的断言改为“== 排版(原文)”，伏笔锚点断言保留（`resolveReferenceAnchor` 命中映射后的偏移）。
- 真实目标：构建后的 Electron、隔离 `SHAKEINK_TEST_ROOT`，只复制正文、不调用模型，导入《诡秘之主》第一卷 213 章；逐章读回 `/api/novels/:id/chapters/:id`，检查没有一章以卷名/章名开头、段落数等于原文非空行数、全文去掉空白后与原文去掉标题和空白后一致；截图第一章。
