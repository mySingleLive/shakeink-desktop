# 610 · 导入正文格式修复 测试用例 · 独立审核

审核对象：`docs/610-import-prose-format-cases.md`（下称“用例”）。对照：`docs/610-import-prose-format-plan.md`（下称“方案”）、`AGENTS.md`、`docs/implementation-boundaries.md`。只读审核，除本文件外未改任何文件。

工作区里已有未提交的实现与测试（`desktop/core/novel-import-prose.ts`、`tests/unit/novel-import-prose.test.ts`、`tests/helpers/import-stored-prose.ts`、`scripts/verify-import-prose-format.mjs`，以及 `novel-import-publish.ts` 和 4 个集成测试的改动）。下文引用它们只为核对用例是否可执行，不代表对实现做 code review。

## 一、核对方法与命令结果

全部在 Node v24.18.0 下执行。

| 检查 | 结果 |
|---|---|
| 真实源文件结构（`/tmp/lotm-v1.txt`，与 GB18030 原文中 `第一部 小丑` 起的同长切片逐字相等） | 18886 行，无 `\r`；标题行只有 `第一部 小丑` 和 213 个 `第X章 名`，均为单个半角空格；除标题外**所有非空行都以 `　　` 开头**；卷内唯一的空行在第 2–3 行和文末 |
| 正文行末字符分布 | `。`9181、`”`4640、`：`2784、`！`814、`…`601、`？`182、`；`22、`）`13、`》`4、`，`2（第 2596、4008 行诗句“一事是真啊，其余皆谎，”）、无标点 1（第 18848 行“……他留在了账”这类被截断的长行） |
| 行内“句末标点+两个全角空格” | 0 处 |
| 行首块级 Markdown（`#`、`>`、`- `、`1. `、分隔线） | 0 处；`*`、`_`、`` ` ``、`<`、`\` 均为 0；`~` 出现 7 次 |
| 正文首段以本章标题名开头 | 第一百三十七章 白银之城 → 首段“白银之城，停尸大厅。” |
| 标题带引号或数字 | 第三十三章 “开关”、第六十章 第二块“亵渎石板”、第一百三十九章 研究“3-0782” 等 10 个 |
| 卷尾 | `　　（第一部完）` 后是 `第一部总结` 及 5 段作者感言（`importExcludedRanges` 的 `NOTE_HEADING` 会排除） |
| 用当前 `formatImportChapterProse` 离线跑 213 章（按 `第X章` 行切片，第 1 章带卷标题） | R3 段落数 213/213 相等；`renderMarkdown` 的 `<p>` 数 213/213 相等；R4 去空白后全书相等；无 `<del>`；无一章以 `第…章/部` 开头 |
| `node --test tests/unit/novel-import-prose.test.ts` | 18 通过 |
| 修改后的 `novel-import-publish` / `pdf-publish` / `semantic-publish` / `verify-publish` / `result-quality-publish` / `discard` 集成测试 | 全部通过 |
| `tests/integration/novel-import-wizard-publish.test.ts` | NIW-S06/…/S15 失败：`卡在 detect-scene 模型返回的场景清单与完整提及资料不一致`。在 `git archive HEAD` 的干净副本中同样失败，属已有失败 |
| `tests/unit/lotm-import-audit.test.ts` | 11 项失败：`仍有章节缺少细纲`。HEAD 干净副本同样失败，属已有失败 |
| `tests/unit/lotm-local-import-audit.test.ts` | 1 项失败 `FROZEN_CHAPTER_ORACLE_MISMATCH`。该文件不调用 `publishNovelImport`，未确认与本改动有关 |

结论：R3、R4 在真实文件上可以计算，并且按现在的实现离线计算已经相等。但真实文件**没有**触发硬换行合并、行内拆分、Markdown 转义这三条规则，这三条只能由单元用例证明。

## 二、问题

### 高1：IPF-I2（伏笔锚点映射）实际不会被执行

- 证据：IPF-I2 依赖 `novel-import-wizard-publish.test.ts` 的 NIW-S06 用例，锚点断言在第 58–59 行。这条用例在 HEAD 和当前工作区都在第 36 行 `publishedWork` 处抛出 detect-scene 错误，根本走不到伏笔断言。方案里唯一需要重新计算的数据（`startOffset/endOffset/quote/prefix/suffix`）因此没有任何会运行的测试覆盖。真实目标是只复制正文、不用模型，也不会产生伏笔，所以 R 组同样覆盖不到。
- 同一用例第 49 行仍是 `assert.equal(c.content,w.session.chapters[k].content)`（原文比较），没有按 IPF-I1 修改。夹具 `bodyF()` 的每章都以 `第N部 卷\n\n`/`标题\n\n` 开头，一旦这条用例能运行，第 49 行就会失败。
- 修复：
  1. 用例写明 IPF-I2 的前置条件：先修好 NIW-S06 的 detect-scene 夹具问题，或者另写一条不经过向导场景识别的集成用例，直接构造带 `facts.touches` 的会话调用 `publishNovelImport`。
  2. 断言写精确值：`quote==='拾起青铜钥匙'`；`startOffset` 等于在**已存正文**中 `indexOf('拾起青铜钥匙')` 的值，且与原文偏移不同（证明发生了映射）；`prefix/suffix` 等于 `anchorContext(已存正文,…)`。
  3. 补一条“引文完全落在被删标题里”的用例：期望 `quote/prefix/suffix/startOffset/endOffset` 全为 `null`，触点仍然创建（方案 §3.2）。
  4. 第 49 行改成与 IPF-I1 相同的比较。

### 高2：漏列了会断言“已存正文 == 原文”的真实目标脚本和审计

用例只列了 5 个集成测试。下列脚本和测试同样拿数据库章节正文和原文逐字比较，改动后在真实运行里会失败或者给出错误结论，用例应逐个写明“改为排版后比较”或“退役”。

| 位置 | 断言 |
|---|---|
| `scripts/verify-novel-import-native.mjs:57-58` | 逐章读回 `/api/novels/:id/chapters/:id`，`assert.equal(prose,body)` |
| `scripts/audit-lotm-import.ts:122-124` | `c.content===p.body.slice(e.start,e.end)`、`sha(c.content)===expectedUtf8Sha256`、`wordCount===[...c.content].length`、`native-prepared-body-byte-equality` |
| `tests/unit/lotm-import-audit.test.ts` | 通过真实 `publishNovelImport` 发布后调用上面的审计（目前因“缺少细纲”已有失败，修复后会再因正文失败） |
| `scripts/audit-real-novel-import.ts:146` | `ordered-chapter-utf8-equals-independent-body` |
| `scripts/audit-lotm-local-import.ts:207-209` | `NATIVE_CHAPTER_CONTENT_MISMATCH`、`NATIVE_CHAPTER_WORD_COUNT_MISMATCH`；对应 `tests/unit/lotm-local-import-audit.test.ts:103-104` 直接把原文写进合成行，测试会继续通过，但已和真实发布结果不符 |
| `scripts/real-novel-semantic-assertions.ts:163` | `chapter.content===session.chapters[index].content` |
| `scripts/verify-lotm-scenes-persistence.mjs` | `c.content===s.chapters[i].content` |

`scripts/finish-lotm-local-volumes.mjs` 比较的是会话 journal，不受影响。

### 中1：IPF-14 的期望写错了

- 用例写“`text.slice(start(a),end(b))` 等于引文去掉换行/缩进后的文本”。引文跨段时，输出里的段落分隔是 `\n\n`，并没有被去掉。实测：`第一章 绯红\n　　痛！\n　　好痛！\n` 中 `[indexOf('痛！'), indexOf('好痛！')+3)` 映射后是 `"痛！\n\n好痛！"`。
- 修复：分三种情况写精确值：段内引文（与原文相同）；跨硬换行引文（换行被删）；跨段引文（中间是 `\n\n`）。再写清边界值：`start(raw.length)===text.length`、`end(0)===0`，标题内 `[a,b)` 满足 `start(a)>=end(b)`。单元测试已有其中几条，用例文档应与之一致。

### 中2：没有断言 `wordCount` 和主题篇幅

方案 §3.2 改了两个数字：`chapter.wordCount` 改按排版后正文计算，主题 `chapterCharacters` 仍按原文计算。用例没有任何一条覆盖。应补：集成用例断言 `wordCount===Array.from(已存正文).length`，并且小于原文长度；主题篇幅档位与改动前相同。R 组补：213 章 `wordCount` 之和等于各章 `Array.from(content).length` 之和。

### 中3：集成断言是同一函数自证

`tests/helpers/import-stored-prose.ts` 的 `storedChapterProse` 就是调用 `formatImportChapterProse`，IPF-I1/I3 写成 `content === formatImportChapterProse(原文)` 只能证明“发布时调用了这个函数”，排版结果本身错了也会通过。`novel-import-publish.test.ts` 已有一处字面值（`'陆青十七岁。  他…'`），用例应要求 pdf / semantic / verify 每个文件至少写一个字面期望值，并逐条列出被修改的断言行：`novel-import-publish.test.ts` 第 33、39、93 行，`novel-import-pdf-publish.test.ts:53`，`novel-import-semantic-publish.test.ts:46`，`novel-import-verify-publish.test.ts:45`，`novel-import-wizard-publish.test.ts:49`。

### 中4：多条单元用例的期望不精确

用例文档是验收依据，“期望”列应能直接写成断言：

- IPF-02、IPF-03、IPF-12、IPF-13 只写了“去掉 / 只产生一个分隔”，应给出完整输入和输出字符串（单元测试里有，文档没有）。
- IPF-09 的“`“嗯。”` 之外的短行”含义不清，也没有测 20 字边界。实测：19 字无标点行 + 无缩进下一行 → 分段；20 字 → 合并。应补 19/20 两条，并写清“字”按码点计算、不含行首缩进。
- IPF-08 只列 `。！？…”：；`，方案的集合还有 `!?;:"）)】》~～—」』’`。至少补半角 `!?;:"` 和 `】》’~`。
- IPF-10 写“在 `。` 后拆成两段”，单元测试实际也在 `！”` 后拆。文档应与测试一致。
- IPF-16 应注明只适用于“每行一段”的输入，否则与 IPF-06 矛盾。

### 中5：缺少以真实文件形态为依据的单元用例

真实文件里有下面这些情况，现在的单元用例都没有直接覆盖（离线跑真实文件时它们都正确，但只要规则被改动，单元测试不会报警）：

1. 上一行以 `，` 结尾或没有标点、下一行有缩进 → 必须分段（第 2596、4008、18848 行）。现有 IPF-08/09 只测下一行无缩进的情况。
2. 连续以 `；` 结尾的有缩进行（第 1483–1485 行）→ 各自成段。
3. 正文首段以本章标题名开头：`第一百三十七章 白银之城\n　　白银之城，停尸大厅。` → 首段保留为 `白银之城，停尸大厅。`。
4. 标题带引号或数字：`第三十三章 “开关”`、`第一百三十九章 研究“3-0782”` → 被去掉。
5. 首行以 `第N部` 开头、含 `，`、但不以句末标点结尾的正文行。现在的 `VOLUME_HEADING` 允许 `，`，会把它当卷标题去掉；而 `novel-import-structure.ts:69` 认为含 `，；` 的行不是卷名。用例应写明期望并和切章规则保持一致。

### 中6：R 组的定义需要写精确，R5/R6 的脚本断言偏松

- R2：实现脚本只检查每章第一行。建议补一条正向断言：第 137 章首段等于 `白银之城，停尸大厅。`（证明没有多删）。
- R3：“原文去掉标题后的非空行数”应写清：按 `\n` 分行、`trim()` 后非空；第 1 章还要去掉 `第一部 小丑`；第 213 章到 `第一部总结` 之前为止（该段被导入排除），`（第一部完）` 计入。脚本已这样计算，文档没有写。
- R4：用例写“全书拼接”，脚本是逐章比较，逐章更好，文档应改为逐章。脚本的 `squash` 同时去掉了 `\`，会掩盖转义错误。真实文件没有 `\`，影响不大，但应注明。
- R5：脚本断言是 `shown.paragraphs>=counts[0].want`。应改为相等：第 1 章 69 段，第一个 `<p>` 文本为 `痛！`，且不以 `　` 开头（方案 §2 指出的双重缩进）。
- R6：“第一页与原文开头一致”应改为精确比较：`page.text` 等于 GB18030 解码原文从 `第一部 小丑` 起、长度为 `page.text.length` 的切片。脚本目前只截 4000 字，并且只检查开头和 `\n　　痛！`。
- 补 R：第 213 章最后一段等于 `（第一部完）`，全书正文不含 `第一部总结`。
- 用例应明确写出：真实目标不覆盖硬换行合并、行内拆分、Markdown 转义和伏笔锚点映射，这几项的状态只能由单元/集成用例给出，台账中不能标为真实通过（AGENTS.md）。

### 低1：行内 Markdown 没有覆盖

方案只转义块级语法。实测 `啊~好~` 渲染为 `<p>啊<del>好</del></p>`，`他说*这*不对` 渲染为 `<em>`。第一卷的 7 个 `~` 都不在同一段内成对出现，离线检查没有 `<del>`。建议补一条用例写明期望：要么转义，要么作为已知行为记录。注意改动前整章是一个 `<p>`，成对的 `~` 更容易跨行配对，所以这不是本次引入的问题。

### 低2：缺空章集成用例

IPF-13 只测函数返回空串。应补一条集成用例：整章只有标题的会话发布成功，章节 `content===''`、`wordCount===0`，规划数据的 `wordBudget` 为 1（`Math.max(1,…)`）。

### 低3：台账

用例没有写 `docs/requirements-traceability.json` 对应条目和 ID 绑定（AGENTS.md 要求）。该文件经常有未提交的条目，更新时只能追加，不能 checkout。

### 低4：IPF-I4 断言可以更具体

除“同一回执、不重复写章节”外，再断言重试后章节正文与第一次逐字相同，确认重试不会对已排版正文再排版一次。

## 三、结论

**有条件通过。**

单元用例的方向正确，R3、R4 在真实文件上可以计算，并且按当前实现离线计算已经相等。进入验收前必须解决高1（伏笔映射没有会运行的测试；向导发布测试第 49 行仍按原文比较）和高2（7 处真实目标/审计脚本仍按原文比较，用例未列出）。中1–中6 应在同一轮补进用例文档；低级问题可以记入台账后续处理。
