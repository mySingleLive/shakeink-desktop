# 610 · 导入正文格式修复 技术方案独立审核

审核对象：`docs/610-import-prose-format-plan.md`
行号说明：审核期间工作区 `desktop/service/novel-import-publish.ts` 已被并行修改（`git status` 显示 M，且新增未跟踪的 `desktop/core/novel-import-prose.ts`）。下文 publish 文件行号均按 `HEAD` 版本引用，其余文件按当前工作区。

## 结论：有条件通过

方案的总体路线正确：会话、导入记录和第 21 步校验继续保留原文，只在写入 `chapter` 表时排版（选项 A）。这条路线改动最小，代码核对后也成立。不过启发式规则、Markdown 转义、测试清单和验收口径还有缺口，需按下列「高/中」项修订方案后再进入测试用例阶段。

## 已核实成立的部分

- 原因判断正确。`src/lib/markdown.ts:10` 设置 `breaks:false`，单个 `\n` 不分段；`src/app/globals.css:469-471` 的 `.markdown-body.novel p` 已有 `text-indent:2em`。`HEAD` 版 publish `:151` 把 `c.content` 原样写入 `content`，`wordCount` 用 `Array.from(c.content).length`。
- 源文件实测（`/tmp/lotm-v1.txt`，18 886 行，无 `\r`）：非空行 18 458 行，其中 214 行无缩进，恰好是 `第一部 小丑` 加 213 个 `第N章 标题`。所有正文行都以 `　　` 开头。没有行中「句末标点 + 两个全角空格」的情况。行首块级 Markdown 语法出现 0 次。卷/章标题后都是 `\n\n\n`。
- 用 `detectImportChapterCuts(全文,{volumes:true})` 实测：第一卷 213 章，章首依次为卷标题（仅第 1 章）和章标题，与方案步骤 2 的跳过规则一致。按方案规则模拟后，除「正文序言」外，没有一章跳过的标题行数异常。
- 发布后其他读 `chapter.content` 的路径不依赖原文：
  - `verify`（`HEAD` publish `:88-91`）只核对回执和 `contentVersion` 快照哈希，不读章节。
  - 幂等重试在 `:103-104` 发现已有回执就直接返回，不会重写章节。
  - 世界设定修复 `desktop/service/novel-import-world-repair.ts:19,28` 把 `chapters` 行纳入保护哈希，但比较对象是修复前后数据库的当前行，不是原文，所以新格式不影响它。已导入的旧作品不迁移，也不受影响。
  - 导入记录 `body-original` 读的是 `snapshot.originalProse`（`HEAD` publish `:208`），保持原文。
  - `importPlanHash`（`desktop/core/novel-import.ts:389`）基于会话 `chapters`，不受影响。
  - 前置校验 `:76-77`、`assertWizardSessionChapters`（`desktop/core/novel-import-wizard.ts:62-65`）只检查会话，不受影响。
- 伏笔偏移基准正确：`t.content.start/end` 是相对会话章节 `content` 的偏移（`desktop/core/novel-import-foreshadow.ts:39-40`，`desktop/main/novel-import.ts:1519` 用 `c.start+t.content.start` 还原全文位置）。因此「原文章内偏移 → 排版后偏移」的映射是正确的接入点。

## 问题清单

### 高

**H1. 测试与真实目标脚本的改动清单不完整，验收口径会自证。**
方案 §5 只列了集成测试。下列位置都断言「库内章节正文 == 原文/会话正文」，必须同步修改：
- `tests/integration/novel-import-wizard-publish.test.ts:49`：`c.content` 等于 `w.session.chapters[k].content`。`:59` 用 `resolveReferenceAnchor(chapter.content,…)` 断言 `start===startOffset`。
- `tests/integration/novel-import-verify-publish.test.ts:45`
- `tests/integration/novel-import-publish.test.ts:38,86,92,98`
- `tests/integration/novel-import-pdf-publish.test.ts:53`
- `tests/integration/novel-import-semantic-publish.test.ts:46,59,61,65`
- `scripts/verify-novel-import-native.mjs:56-58`：逐章 GET 拼接后 `assert.equal(prose,body)`。
- `scripts/verify-lotm-scenes-persistence.mjs:57-58`：逐章 `c.content===s.chapters[i].content`，并比较 `sha(join)===sha(workingProse)`。

这两个脚本都没有出现在方案里，按 AGENTS.md「全量用例/真实目标系统验证」的要求，它们会直接失败。另外，如果断言改为「== formatImportChapterProse(原文)」，等于用被测函数生成期望值，测不出排版错误。集成测试应使用独立写死的期望字符串，至少覆盖去标题和分段两项。真实目标验收里「全文去空白后一致」这一条是独立检查，应保留。

### 中

**M1. 「通用标题行」规则可能删掉第一段真实正文。**
方案步骤 2 会跳过 `第N[卷部册编篇]…（≤150 字）`、`第N[章节回]…`、`序章…`、`楔子…`、`Chapter …` 开头的行，只要它位于章首。中文正文首句常见「第一部手机……」「第三回合开始了。」「第二节课下课后，……」，英文有「Chapter one of his life…」，这些都会被当成标题删除。现有切章代码的卷标题识别会排除带句读的行（`desktop/core/novel-import-chapters.ts:138-139`，`/[。！？!?，,；;]/`），方案没有采用同样的限制。全书实测中，作者感言里有 8 个缩进行以「第一部…」「第二部…」开头（如「第二部，我还没想好主角和切入，……」）。这些行虽不在章首，但说明这类句式在真实文本中存在。建议：
- (a) 通用规则只处理无行首缩进的行；
- (b) 排除含句读的行，与 `chapters.ts:139` 一致；
- (c) 跳过的通用标题行数设上限（如本章标题之前最多 1 个卷标题加 1 个章标题）；
- (d) 优先依靠「等于本章 `title`」和「等于本章 `volume`」两条精确规则，通用正则只作兜底。

单元测试需加上述反例。

**M2. 第一卷最后一章含「第一部总结」标题和作者感言，方案没有说明处理方式。**
实测第一卷第 213 章（`第二百一十三章 再看一眼`）的切片一直延续到 `第二部 无面人` 之前，包括 `　　（第一部完）`、两个空行、无缩进的 `第一部总结`，以及其后的作者感言（原文第 18 894-18 904 行附近）。方案只说保留「（第一部完）」，没有提到 `第一部总结`。这一行在章中间，不会被去除，会以独立段落显示。用户要求「正文中不能出现卷名和章节名」，所以方案需要明确：这一行是保留（它不是卷名或章名），还是作为章中标题处理（例如渲染为小标题）。真实目标的「段落数 = 原文非空行数」检查也应写明这一章的预期值。整本导入时第 2、3、4、7 部末尾也有同样的结构。

**M3. Markdown 防误解析只覆盖部分块级语法，遗漏的语法会吞掉整章或删掉文字。**
用项目内 `marked`（`package.json:52`，^18，gfm）实测：
- 行首的 ```` ``` ```` 或 `~~~` 会开启代码块，之后整章变成 `<pre>`。方案的转义列表里没有这两种。
- `[注]: 说明` 会被当作引用链接定义，整行消失。
- 行首 `<div>`、`<span>` 等会作为 HTML 原样输出。`renderMarkdown` 注明不做 sanitize（`src/lib/markdown.ts:22`），`<img src=x onerror=…>` 原样出现在 HTML 中。这个问题在本方案之前就存在，但本方案正是导入文本进入 Markdown 的唯一入口，适合一并处理。
- 行内 `~文字~`、`*文字*`、`_文字_`、`` ` `` 会被解析成删除线、强调或代码。实测「毕业生~嗯，你~好」渲染为 `<del>`。《诡秘之主》第一卷有 7 处 `~`，且每段最多 1 处，所以分段后不会触发。但旧的整章单段渲染下它们会两两配对成删除线，其他来源也很容易触发。

建议转义范围至少加入行首 ```` ``` ````、`~~~`、`|`、`[…]:`、`<`，并对行内的 `~ * _ ` < [` 做最小转义。另一种做法是把转义规则限定为「整段按纯文本输出」（逐字符转义 Markdown 元字符）。两种做法都要写进偏移映射，转义插入的 `\` 属于新增字符，应映射到其后的原文字符。§3.1 的映射说明目前只描述了「删除字符」，需补上「插入字符」（`\`、`\n\n`、ASCII 连接空格）的规则。

**M4. `wordCount` 口径会与应用其他地方不一致。**
方案沿用 `Array.from(text).length`。排版后去掉了行首缩进和单换行，但仍会计入 `\n\n`、转义 `\` 和 ASCII 连接空格。应用其他地方统一使用 `countChineseWords`（`src/lib/text.ts:2`，去掉全部空白），例如 `src/lib/services/chapter-draw.ts:109`、`chapter-history.ts:28`、`content-policy.ts:27`。导入后一编辑，字数就会跳变。建议改用 `countChineseWords(formatted.text)`。如果采用 M3 的逐字符转义，还应按未转义文本计数。`HEAD` publish `:151` 的 `wordBudget` 由 `row.wordCount` 推导，会随之变化，这一点也应写进方案。

### 低

**L1. 硬换行合并规则对其他来源的边界情况。**
「上一行少于 20 字即新段」：窄栏 PDF（每行少于 20 字）的每一行都会成为独立段落。「上一行不以句末标点结尾且本行无缩进即合并」：无缩进、单 `\n` 的网文 TXT 中，以逗号结尾的诗句或歌词行（第一卷有「一事是真啊，其余皆谎，」）会被合并。该行在《诡秘之主》中有缩进，不受影响。建议单元测试覆盖无缩进 TXT 和 PDF 两种样本，并在方案中写明这些已知取舍。

**L2. 引文被部分截掉时的处理。**
如果引文一部分落在被去掉的标题里，映射后的引文会变短，`identityKey`（`HEAD` publish `:226`）随之变化。这不影响唯一性，但应在单元测试中覆盖「引文跨越标题与正文」的情况。另外，排版后一段引文可能跨越 `\n\n` 段界。`src/components/foreshadow/preview-references.tsx:30-46` 按块逐段高亮，跨块引文仍能显示，建议在 wizard-publish 测试中加入一个跨段引文。

**L3. 空结果回退是多余逻辑。**
§3.1 第 5 步说「结果为空时退回原文去掉标题后的 `trim()`」。去掉标题后只剩空白时，`trim()` 必然也为空，这个分支没有作用。建议删去这句话，直接写空串。

**L4. 真实目标检查的口径。**
「段落数等于原文非空行数」应改为「非空行数减去去除的标题行数」：第 1 章减 2，其余章减 1。第 213 章另按 M2 的处理结论计算。

**L5. 台账与证据。**
方案没有提到 `docs/requirements-traceability.json` 的新条目和证据目录。按 AGENTS.md，台账需要登记，真实目标的截图和逐章读回结果也需要存档。

**L6. 转义字符对其他使用方可见。**
转义后的 `\` 会出现在编辑器源码模式、AI 上下文（`src/lib/ai/context.ts`、`src/lib/services/chapter-boundaries.ts:14`）和导出文本中。《诡秘之主》中实际不会出现转义，但方案应把这一点记为已知取舍。

## 需要在方案中补充或修改的内容

1. §5 补上 H1 列出的全部测试和脚本，期望值使用独立写死的字符串。
2. 收紧通用标题规则（M1），并加入反例测试。
3. 明确卷尾「第N部总结」和作者感言的处理方式（M2）。
4. 补全 Markdown 转义范围，并给出插入字符的偏移映射规则（M3）。
5. `wordCount` 改用 `countChineseWords`（M4）。
6. 修正真实目标检查口径（L4），并登记台账（L5）。
