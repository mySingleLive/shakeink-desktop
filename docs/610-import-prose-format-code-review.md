# 610 · 导入正文格式修复 代码审核

审核范围：`desktop/core/novel-import-prose.ts`（新）、`desktop/service/novel-import-publish.ts`（diff）、`tests/unit/novel-import-prose.test.ts`（新）、`tests/helpers/import-stored-prose.ts`（新）、`tests/integration/novel-import-{publish,semantic-publish,pdf-publish,verify-publish}.test.ts`（diff）、`scripts/verify-import-prose-format.mjs`（新，未运行）。未修改任何源文件，未构建，未启动 Electron。

## 已执行的检查

| 命令 | 结果 |
|---|---|
| `node --import tsx --test tests/unit/novel-import-prose.test.ts` | 19/19 通过 |
| `node --import tsx /tmp/ipf-check.ts`（第一卷 213 章） | `headStart:0, mismatch:0, bad:0`，总耗时约 0.12 s |
| 用 GB18030 原文全书 `detectImportChapterCuts` 切章后格式化第 213 章 | 切片延续到「第二部 无面人」前，含「（第一部完）」「第一部总结」及作者感言 |
| `node --check scripts/verify-import-prose-format.mjs` | **SyntaxError: Identifier 'current' has already been declared** |
| 6 个导入集成测试文件（publish / semantic-publish / pdf-publish / verify-publish / wizard-publish / world-repair） | 57 项中 56 项通过；`NIW-S06/S07/S08/S09/S15` 失败，报错在发布之前的 `detect-scene`（见 H3） |
| 反例脚本 `/tmp/ipf-review*.ts`（格式化后再用 `renderMarkdown` 渲染） | 结果见下文各条 |

## 高

**H1. 真实目标驱动脚本无法运行。** `scripts/verify-import-prose-format.mjs:27` 声明了 `const current=()=>…`，`:55` 又在同一 `try` 块中 `let current`，模块解析阶段即报 SyntaxError，IPF-R0..R6 一条都不会执行。把 `:55-56` 的变量改名（如 `chapter`）。

**H2. IPF-R5 必然误判失败。** `CommentablePreview` 按空行分块，每块渲染为一个 `<div data-text-preview data-block>`（`src/components/comments/CommentablePreview.tsx:144`、`:161`）。脚本 `:72-73` 取 `locator('[data-text-preview]').first()`，只统计第一块里的 `<p>`，结果恒为 1；`:75` 要求 `shown.paragraphs>=counts[0].want`（第一章远多于 1 段），所以 R5 会失败。应统计 `[data-text-preview]` 的块数，或在外层容器上 `querySelectorAll('[data-text-preview] p')`。同处 `:69` 用 `page.keyboard.press('Escape')` 作关闭对话框的后备，按记忆记录，渲染进程的快捷键分发会拦截 Esc，这个后备大概率无效，应改为点击真实关闭按钮或断言对话框已关闭。

**H3. 向导发布集成测试没有按方案更新，当前被一个更早的失败掩盖。** `tests/integration/novel-import-wizard-publish.test.ts:49` 仍断言 `c.content===w.session.chapters[k].content`。夹具 `tests/helpers/novel-import-wizard-fixture.ts:18` 的每章都以「第一部 甲卷 / 第一章 起」开头，排版后必然不相等。这个测试目前在 `:36` 的 `toStep(f,'verify')` 处就失败（`卡在 detect-scene 模型返回的场景清单与完整提及资料不一致`），还没走到发布。我没能确认这个 detect-scene 失败在 HEAD 上是否已经存在：在 worktree 里跑会报 `DATABASE_SEED_RUNTIME_OUTSIDE_APP`。方案 §5 把 wizard-publish 列为需要修改的测试，而它的 `:58-59` 是唯一一条通过真实向导流水线验证 `CHAPTER_CONTENT` 锚点重映射后能被 `resolveReferenceAnchor` 命中的断言。需要：把 `:49` 改为 `storedChapterProse(w.session)[k]`，并查明 detect-scene 失败是不是本次改动引入的；在这条测试通过之前，不能把集成验证记为通过。

## 中

**M1. `CHAPTER_HEADING` 会删掉以「第N节/回/章」开头的真实正文。** `novel-import-prose.ts:16` 只排除句末的 `。！？!?`，以及末字为 `，,；;` 的情况，行中间的逗号不限制。另外 `:44` 会连续删除所有满足条件的行，删除数量没有上限。实测：
- `第一章 起\n第一节课下课后，他走出教室\n　　下一段。` 得到 `下一段。`，正文首行被删。
- `第一章 起\n第三回合开始的时候，他已经\n累得说不出话。` 得到 `累得说不出话。`，硬换行的上半句被删。

建议：在章/节/回后要求空白或冒号，或者在 58 字以内不允许出现 `，,、`；并且最多只删一行章标题（加一行卷标题）。

**M2. `OTHER_HEADING` 会删掉以 Part/Volume/Chapter 开头的英文正文。** `:18` 中 `(?:chapter|part|volume)[\t ]+[^\r\n]{1,80}` 可以匹配任意英文句子。实测 `Chapter 1\nPart of me wanted to leave.\nShe smiled.` 得到 `She smiled.`；`Chapter 1\nVolume control was broken that night, he said` 得到空串（整章正文丢失）。应把后缀限制为编号形式，例如 `\d+|[ivxlc]+|one|two…`，可再带一个短标题。

**M3. 英文句号不算句末，硬换行合并时句子粘连。** `SENTENCE_END`（`:15`）不含半角 `.`；`wordy`（`:35`）只在两侧都是字母或数字时补空格。实测 `He woke up early in the cold morning.\nShe smiled at him from the doorway.` 得到 `morning.She smiled`。应把 `.` 加进句末集合；合并时只要上一行以 ASCII 标点结尾、下一行以 ASCII 字母开头，也补空格。

**M4. 有序列表的转义会显示出反斜杠。** `:73` 在段首插入 `\`，但 Markdown 只转义 ASCII 标点，`\1.` 不是有效转义。实测 `renderMarkdown('\\1. 编号')` 输出 `<p>\1. 编号</p>`，读者会看到 `\`。应在序号后的 `.`/`)` 前插入反斜杠（`1\. 编号` 渲染为 `<p>1. 编号</p>`）。

**M5. 链接引用定义没有转义，整行会消失。** `[注]: http://example.com 注释` 不在 `MARKDOWN_BLOCK`（`:19`）的覆盖范围内，渲染结果为空串，正文文字丢失。建议在 `:19` 增加 `\[[^\]]*\]:`。

## 低

- **L1. 部分常见标题漏删。** `【第一章】绯红`、`卷一 小丑`、`番外一 xxx`，以及 `第一卷小丑`（卷名与编号之间无分隔且未传 `volume`）都会保留为第一段。这些都不影响《诡秘之主》，但与「正文中不能出现卷名和章节名」的要求有差距。
- **L2. 不带标点的长行会被误合并。** 来源每行一段、行首无缩进、行与行之间无空行时，不以句末标点结尾的 ≥20 字行会与下一行合并（实测两句无标点长句被并成一段）。《诡秘之主》每段都有缩进，不受影响（0 处不一致）。这是方案已知的取舍，建议在总结中写明。
- **L3. `MARKDOWN_BLOCK` 中的 `\t` 和四空格分支不会命中。** 这两个分支是死代码：`:60-61` 已经裁掉了段首空白。行内语法（`**`、`_`、`~~`、`<b>`、`[x](y)`、原文中的 `\`）不做转义，会改变显示。《诡秘之主》第一卷里这些字符出现 0 次。
- **L4. `isHeading` 每次调用都 `new RegExp` 两次（`:31`）。** 只作用于每章开头几行，213 章总计约 0.12 s，不需要修改，可以提到模块顶层。
- **L5. 集成测试的期望值由被测函数本身生成。** `tests/helpers/import-stored-prose.ts` 用的是同一个 `formatImportChapterProse`，所以集成断言只证明「发布确实调用了排版」，不检查排版结果是否正确。只有 verify-publish 加了 `doesNotMatch(/^第/)`。建议在 publish 测试里至少写一处具体的期望串。
- **L6. 驱动脚本注释写错。** `:57` 写的是「第二百一十三章之后的那一章含卷尾说明」，实际是第 213 章切片自身的尾部。处理逻辑本身是对的：`importExcludedRanges` 的 `NOTE_HEADING`（`desktop/core/novel-import.ts:91`）把「第一部总结」到「第二部 无面人」之间标为 excluded，`sourceBody` 不含这段，所以期望值截掉 `第一部总结` 及以后的行是正确的。前提是真实运行时该段确实被排除；如果 R3/R4 在第 213 章失败，先检查这一点。
- **L7. 字数计入转义字符。** `wordCount` 按排版后正文计算，插入的 `\` 也被算进去，误差只有个位数。

## 已确认无问题

- **偏移映射。** `kept`/`next`/`prev`（`:69-86`）的边界正确：`start(raw.length)=text.length`，`end(0)=0`。插入的 `\n\n`、空格、`\` 不映射到原文字符。跨硬换行的引文映射为连写文本，跨段的引文包含 `\n\n`，二者都能被 `indexOf` 命中。按 UTF-16 单元映射，代理对两半各自映射到连续位置，不会被拆开（IPF-15）。
- **整章后备锚点。** 只有 `from>=to`（引文全部落在被删的标题里）时才写 `quote:null`。同一章内多个触点都退回整章时，`identityKey` 都是 `…:whole`，但唯一约束是 `@@unique([touchId, identityKey])`（`prisma/schema.prisma:1202`），按触点区分，不会冲突。
- **重试幂等。** `publicationRecord`、`importHash`、第 21 步校验、`readNovelImportRecord(body-original)` 都只读会话，不读排版结果；排版是纯函数，重试得到相同输出。`assertPlan` 中 `c.content!==s.workingProse.slice(...)` 等校验仍然针对会话原文（`novel-import-publish.ts:80`）。
- **性能。** 每章分配 3 个 `Int32Array(raw.length+1)`，约 3500 字的章约占 42 KB；213 章合计约 0.12 s，在发布事务内可以忽略。
- 主题篇幅 `chapterCharacters` 仍按原文统计，与方案一致。

## 结论

**需修改后再验收。** 核心模块对《诡秘之主》第一卷的结果正确（213 章开头没有卷名或章名，段落数和去空白后的全文都与原文一致），偏移映射和发布接线也没有发现错误。但真实目标驱动存在语法错误（H1）和一定失败的 R5 断言（H2），向导发布集成测试没有更新而且当前在发布前就失败（H3），所以真实目标验收和全量用例都还没有完成。M1–M5 会删掉或改变某些格式来源的真实正文，建议一并修复，并补充对应的单元反例。
