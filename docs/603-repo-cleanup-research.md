# 603 仓库冗余清理调研

日期：2026-11-25，分支 `feat/novel-import-roster-speed`，HEAD `beb4f9a`，工作区干净。

## 1. 现状

| 范围 | 受管文件 | 体积 | 文本行 |
| --- | --- | --- | --- |
| 全仓（git） | 5894 | — | — |
| `docs/` | 2637 | 198 MB | docs+design 合计 689,860 |
| `design/` | 1306 | 208 MB | （同上） |
| `src/` + `desktop/` | 850 | 8.7 MB | 144,407 |
| `tests/`（含 retired） | 782 | 11 MB | — |
| `scripts/` | 154 | 1.6 MB | — |

文档和设计稿的文本行数约是产品源码的 4.8 倍。AI 做全文搜索时，大部分命中来自这些历史文档，这是理解和处理变慢的主要原因。

未受管（已被 gitignore / `.git/info/exclude` 忽略）的本地产物：

| 路径 | 体积 | 说明 |
| --- | --- | --- |
| `.claude/worktrees/`（5 个） | 8.7 GB | 其中 4 个 HEAD 已并入 master；`pr-12` 有未跟踪生成物 |
| `/private/tmp/shakeink-599-base` | — | 已并入当前分支的 599 基线工作树 |
| `release/.staging/novel-pdf-*`（8 个） | 4.2 GB | `scripts/verify-novel-import-pdf-package.mjs` 每次运行留下的临时副本 |
| `.next/` `dist/` `out/` | 1.0 GB | 构建产物，`npm run build` 可重建 |
| `docs/evidence/` | 195 MB | 已忽略，测试和脚本运行时写入 |

这些文件不进入 git，ripgrep 默认跳过；它们占磁盘，但不拖慢 AI 搜索。

## 2. 调研方法

1. **代码可达性**：`.tmp-cleanup/reach-ts.mjs` 用 TypeScript 模块解析器，从全部入口出发（`src/app/**`、`desktop/{main,service,preload}/*.ts`、`tests/**`（不含 retired）、`scripts/**`），沿静态 import、动态 import、require 和纯类型 import 遍历，把 `src/`、`desktop/` 中没有被遍历到的文件列为候选。esbuild 打包会丢弃纯类型 import，先用它跑出的 24 个候选里有 5 个是误报，因此改用 TS 解析器。
2. **文档引用闭包**：`.tmp-cleanup/closure.mjs` → `relclose.mjs` → `samedir.mjs`。根集合包括全部代码、测试、脚本、`AGENTS.md`、`README.md`、`docs/` 顶层台账（`requirements-traceability.json`、`implementation-boundaries.md`、`00`–`05` 设计文档等），以及记忆目录。从根集合出发，按以下四类引用保留文件：
   - `docs/…`、`design/…` 路径；
   - `docs/NNN` 编号前缀；
   - 被保留的 HTML/MD/JS/CSS 内的相对链接、资源引用和目录引用；
   - 同一功能目录内被保留文档提到的文件名。
   没有被任何一类引用覆盖的文件进入删除候选。
3. **依赖**：在不含死代码的源码中查找 `package.json` 各依赖的导入。
4. **基线**：在 HEAD 上执行 `tsc --noEmit`、全部单元/集成测试、全部浏览器测试，作为清理后对比的依据。

## 3. 发现

### 3.1 死代码（`src/`，12 个文件，1,221 行）

工具认定不可达，并经全仓文本检索复核，除各自文件本身外没有其他引用：

| 文件 | 行 | 来源 |
| --- | --- | --- |
| `src/components/content/ChapterOutlinePanel.tsx` | 262 | Web 快照导入；`registry.tsx:73-74` 已把 `outline`/`chapter-outline` 指向 `OutlineProjectionPanel` |
| `src/components/content/OutlinePanel.tsx` | 370 | 同上；仅在 `requirements-traceability.json` `uiTextSelection.implementation[19]` 和 `migration-map.json` 同名列表中作为历史记录 |
| `src/components/content/PlaceholderPanel.tsx` | 22 | Web 快照 |
| `src/components/theme/ThemeSwitcher.tsx` | 65 | Web 快照；桌面主题在设置里实现 |
| `src/components/ui/form.tsx` | 182 | shadcn 模板，没有使用者 |
| `src/components/ui/table.tsx` | 116 | shadcn 模板，没有使用者 |
| `src/lib/ai/auto-model.ts` | 27 | 仅被 `tests/unit/chat-model-selection.test.ts:25` 的模块桩按名字模拟，真实代码不导入 |
| `src/lib/ai/model-availability.ts` | 20 | 仅导入 openrouter.ts |
| `src/lib/ai/openrouter.ts` | 90 | 仅被上一行导入 |
| `src/lib/ai/model-request-lane.ts` | 50 | Web 快照 |
| `src/lib/prompts/scene-migration.ts` | 4 | Web 快照 |
| `src/lib/services/resource-observation.ts` | 13 | `migration-map.json services[33]` 记录了它，但没有测试 ID 被引用 |

`desktop/` 没有死代码。7 个 `.d.ts` 和 `chat-empty-dock.css` 被列为“不可达”，原因是它们由 tsconfig 的 include 或 CSS import 加载，实际在用，保留。

依赖：`react-hook-form` 只被 `ui/form.tsx` 使用；`@hookform/resolvers` 和 `recharts` 在全部代码中没有导入。

### 3.2 退役测试（`tests/retired/`，156 个文件 + 1 个 pyc）

`tsconfig.json` 和 `tsconfig.foundation.json` 都排除了该目录，`scripts/test-core.mjs` 遍历时跳过它，`npm test` 的 glob 也不包含它。全仓唯一引用是 `tests/unit/packaging-config.test.ts:47`，内容是一个字符串 `'tests/retired/backups/source/main.ts'`，用来断言打包规则排除该路径；这个断言只测规则，不读文件。CodeGraph 为它建了 106 个文件节点。台账中没有引用。按 `backup-scope-retirement.md`，备份功能已由用户在 2026-10-08 撤销，原始来源已通过散列登记在 `backup-scope-retirement.json`。

另有 `scripts/__pycache__/observe-real-novel-import.cpython-314.pyc`，是被误提交的 Python 字节码。

### 3.3 文档与设计稿：无引用文件 1,196 个，43.8 MB，文本 49,746 行

（模拟删除后再扫描保留文件，又有 17 个被保留文件引用，已移回保留。最终删除清单为 1,179 个文件，43.8 MB，文本 49,144 行。下表为移回前的分组。）

| 分组 | 文件 | 体积 | 文本行 | 内容 |
| --- | --- | --- | --- | --- |
| `docs/novel-import-real-books/` | 414 | 1.4 MB | 16,828 | 真实书目导入过程中的 TDD 红绿记录、自检 JSON、中间复审 |
| `design/evidence/` v0.4–v0.11 及根目录截图 | 167 | 12.5 MB | 1,007 | 已被 v0.12/v0.13 取代的 UI 原型截图；v0.12、v0.13 被 `03-ui-design.md` 引用，保留 |
| `docs/reviews/` | 153 | 1.1 MB | 7,367 | 未被台账、边界文档或任何保留文档引用的历史审核 |
| `docs/NNN-*.md` | 147 | 0.6 MB | 3,678 | 编号 180–578 中未被代码、测试、记忆或台账引用的过程文档 |
| `docs/scene-import-verification/` | 103 | 0.9 MB | 11,220 | 运行日志、tap、diff |
| `docs/lotm-import/` | 71 | 1.6 MB | 5,617 | 同上 |
| `design/*` 其余功能目录 | 132 | 25 MB | 3,060 | 未被设计说明引用的旧版截图、草稿、archive 中的孤立文件 |
| `docs/macos-*`、`lotm-wizard-import`、`interaction-stale-terminal` | 32 | 0.1 MB | 969 | 未被引用的运行记录 |

保留：凡被代码、测试、脚本、记忆、台账、批准边界、`00`–`05` 设计文档，或被保留文档链接的文件，一律保留。`docs/` 和 `design/` 顶层文件也全部保留。

### 3.4 被引用但体积大的文件（不删）

`design/content-drawer/preview-checks.json`（62,207 行）、`design/sidebar-navigation/**/drawer-frames.json`（约 126k 行）、`design/chat-empty-state/**/preview-checks.json`，以及 `docs/novel-import/evidence/`（90 MB）都被批准设计或测试引用，不能删除。但它们是机器生成的数据，AI 不需要读。在删除之后，`docs/`、`design/`、`tests/` 还有 712,740 行文本；用搜索忽略文件可以让其中 358,376 行（631 个文件）不进入 AI 的默认搜索，同时不影响 git、测试和构建。

## 4. 结论

| 措施 | 降低的 AI 检索文本 | 风险 |
| --- | --- | --- |
| A. 删除死代码 12 个文件和 3 个未使用依赖 | 1,221 行源码；减少 CodeGraph 节点和误导性的同名组件 | 低：可达性分析 + typecheck + 全量测试 |
| B. 删除 `tests/retired/` 和 pyc | 9,272 行 | 低：不被任何运行器加载 |
| C. 删除无引用文档和设计稿 | 49,746 行，43.8 MB | 低：仅历史记录，git 历史可恢复 |
| D. 新增 `.ignore`，让生成数据和证据不进入默认搜索 | 358,376 行 | 无：只影响 rg/AI 搜索，git 和构建不读该文件 |
| E. 本地产物（worktrees、release/.staging、构建缓存） | 0 行；释放约 13 GB 磁盘 | 由用户决定，属于不可逆的删除 |

A–D 合计让 AI 默认检索的仓库文本减少约 42 万行。E 只释放磁盘，不改善 AI 速度，并且涉及用户本地状态，需要用户逐项确认。

调研脚本和清单保存在 `.tmp-cleanup/`（未受管），清理完成后删除。
