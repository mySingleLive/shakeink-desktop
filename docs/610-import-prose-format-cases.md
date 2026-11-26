# 610 · 导入正文格式修复 测试用例

方案：`docs/610-import-prose-format-plan.md`。

## 单元（`tests/unit/novel-import-prose.test.ts`，`formatImportChapterProse`）

| ID | 输入 | 期望 |
|---|---|---|
| IPF-01 | `第一部 小丑\n\n\n第一章 绯红\n　　痛！\n　　好痛！\n` ，title=`第一章 绯红`，volume=`小丑` | `痛！\n\n好痛！` |
| IPF-02 | 只有章标题行，无卷标题；`\r\n` 换行 | 去掉标题，段落以 `\n\n` 分隔，不含 `\r` |
| IPF-03 | Markdown 标题 `## 第三章 梅丽莎`、`**第三章 梅丽莎**` | 去掉 |
| IPF-04 | 正文中间出现独立行 `第一章` 或句子“他翻到第一章” | 保留原样 |
| IPF-05 | 开头是正文、不是标题（`正文序言` 章） | 原文第一段保留 |
| IPF-06 | 固定宽度硬换行：`他走进房间，看见桌上\n放着一本书。\n　　下一段。` | `他走进房间，看见桌上放着一本书。\n\n下一段。` |
| IPF-07 | 英文/数字续行 `He said\nhello.` | `He said hello.` |
| IPF-08 | 上一行以 `。！？…”：；` 等结尾，下一行无缩进 | 分成两段 |
| IPF-09 | 上一行少于 20 字（`“嗯。”` 之外的短行，如 `呜！`、`然后`） | 分成两段 |
| IPF-10 | 行内 `……想。　　他转身` | 在 `。` 后拆成两段 |
| IPF-11 | 行首 `# `、`> `、`- `、`1. `、`---` | 行首加 `\`，`renderMarkdown` 输出不含 `<h1>`/`<blockquote>`/`<li>`/`<hr>` |
| IPF-12 | 多个空行、行尾空白 | 只产生一个段落分隔，段内首尾无空白 |
| IPF-13 | 整章只有标题 | 返回空串，不抛错 |
| IPF-14 | 偏移映射：原文中引文 `[a,b)` | `text.slice(start(a),end(b))` 等于引文去掉换行/缩进后的文本；落在标题里的范围 `start>=end` |
| IPF-15 | 代理对字符（emoji）与 `🖋️` | 不拆分，输出 `isWellFormed()` |
| IPF-16 | 渲染：`renderMarkdown(text)` 段落数 | 等于原文非空正文行数 |

## 集成

| ID | 位置 | 期望 |
|---|---|---|
| IPF-I1 | `tests/integration/novel-import-publish.test.ts` 现有正文断言 | 改为每章 `content === formatImportChapterProse(会话章节原文)`；导入记录 `body-original` 仍等于原文 |
| IPF-I2 | `novel-import-wizard-publish.test.ts` 伏笔触点 | `CHAPTER_CONTENT` 引用的 `quote` 能在已存章节正文中按偏移命中（`resolveReferenceAnchor` 返回同一 `startOffset`） |
| IPF-I3 | 其余发布测试（verify / pdf / semantic） | 同 IPF-I1 |
| IPF-I4 | 重复发布（幂等重试） | 第二次发布返回同一回执，不重复写章节 |

## 真实目标（`scripts/verify-import-prose-format.mjs`）

构建后的 Electron，隔离 `SHAKEINK_TEST_ROOT`，只复制正文、不配置模型、不联网。来源为《诡秘之主》原始文本（GB18030），树步骤只选第一卷「小丑」。

| ID | 期望 |
|---|---|
| IPF-R1 | 导入完成，作品有 1 卷「小丑」、213 章 |
| IPF-R2 | 逐章读回 `/api/novels/:id/chapters/:id`：没有一章正文以 `第…章`/`第…部`/本章标题/卷名开头 |
| IPF-R3 | 每章段落数（`\n\n` 分隔）等于该章原文去掉标题后的非空行数 |
| IPF-R4 | 全书正文去掉所有空白后，等于原文各章去掉标题行和空白后的拼接 |
| IPF-R5 | 打开第一章，预览中第一段是“痛！”，有多个 `<p>`；截图 `ipf-r5-chapter1.png` |
| IPF-R6 | 导入记录 `body-original` 第一页与原文开头一致（原文保留） |

证据：`docs/610-import-prose-format-evidence/`，报告不含源文件路径以外的个人数据，不含小说全文。
