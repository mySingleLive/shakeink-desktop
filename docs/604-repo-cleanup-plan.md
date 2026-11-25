# 604 仓库冗余清理方案（v2）

依据：`docs/603-repo-cleanup-research.md`；独立审核 `docs/604-repo-cleanup-plan-review.md`（v1 不通过）。

## 0. v1 → v2 修订

v1 打算按文本引用闭包删除 1,179 个 `docs/`、`design/` 文件。审核证实，这种闭包识别不出按审核编号写的引用（如 `05-test-cases.md:8`“审核25/26”）、不带目录的文件名、模板字符串（`design/dialog-style/viewer.js:12`）和 glob。结果是批准记录和已批准设计稿要加载的资源被列入了删除清单（阻断 B1、I1、I2）。用户选择 **“只隐藏、不删除”**：历史文档和设计稿全部保留在 git 中，用 `.ignore` 让 AI 默认搜索跳过它们。这个办法不会丢失任何文件，隐藏掉的文本（约 63 万行）也远多于 v1 删除能减少的（4.9 万行）。

审核 B3 属实：`resource-observation.ts` 是用例 `SERVICE-resource-observation`（`acceptance-active-scope.json:5431`，active）的实施文件，**保留**。用户选择 **“删除并在台账标记”** 处理其余 11 个死代码文件。

## 1. 原则

- 代码只删除通过 TypeScript 模块解析认定不可达、并经全仓文本复核的文件。
- 文档和设计稿一律不删除。
- 台账只追加处置说明，不删除条目，不改历史记录：`reuse-manifest.json` 中对应条目的 `status` 改为 `removed-unused`，并加上 `reason`。`requirements-traceability.json`、`migration-map.json`、`imported-source.json` 不修改，它们记录的是当时导入和实施的事实。
- 所有改动在分支 `chore/repo-cleanup` 上，每类一个提交，可以用 `git revert` 单独回滚。只按路径暂存，不用 `git add -A`，避免把测试写入的 `docs/novel-import/evidence/*.png` 混入提交。

## 2. 步骤

| 步骤 | 内容 | 提交 |
| --- | --- | --- |
| P0 | 从 `feat/novel-import-roster-speed@beb4f9a` 创建 `chore/repo-cleanup`。基线见 605 | — |
| P1 | 新增 `.ignore`（第 3 节） | `chore(cleanup): AI 搜索忽略历史过程文档与生成数据` |
| P2 | 删除 `tests/retired/`（156 个文件）和误提交的 `scripts/__pycache__/*.pyc`；`.gitignore` 增加 `__pycache__/` | `chore(cleanup): 删除退役备份测试与误提交字节码` |
| P3 | 删除 11 个死代码文件（第 4 节）；从 `package.json` 移除 `react-hook-form`、`@hookform/resolvers`、`recharts`，用 Node 24 自带的 npm 11.16 执行 `npm install --package-lock-only --ignore-scripts` 同步 lock 文件，再执行 `npm prune` 同步 node_modules；`reuse-manifest.json` 中 6 个条目标记为 `removed-unused` | `chore(cleanup): 删除不可达源码与未用依赖` |
| P4 | 执行 605 全部用例，结果写入 `docs/606-repo-cleanup-verification.md` | `docs(cleanup): 清理验证结果` |

`tests/retired/` 的删除说明：`backup-scope-retirement.md` 记载用户在 2026-10-08 撤销了备份功能，退役用例的原文、片段和来源散列已登记在 `backup-scope-retirement.json`。retired 目录只是源码副本：tsconfig 排除它，`test-core.mjs` 和 `npm test` 都不加载它。`docs/reviews/139-pane-drag-browser-harness-repair.md` 中提到的 3 个 retired 路径属于历史说明，可以从 git 历史（`beb4f9a`）找回。`packaging-config.test.ts:47` 只断言打包规则排除该路径字符串，不读取文件。

## 3. `.ignore`

ripgrep 15 已验证：规则从仓库根目录生效。git、tsc、esbuild、Next、electron-builder 和测试代码都不读取它。Tailwind v4 的 oxide 扫描器会读取 `.ignore`，但本项目在 `src/app/globals.css:1,8` 使用 `source(none)` 加显式 `@source`，审核已实测不受影响；CL-07 的构建对比会再次确认。

规则草稿在 `.tmp-cleanup/ignore.draft`，P1 时原样复制为仓库根目录的 `.ignore`。隐藏的范围：

- 编号 000–499 的过程文档；
- `docs/reviews/`；
- 各类导入、打包的运行记录；
- 全部证据目录；
- 机器生成的用例和清单 JSON；
- `design/` 下除 `*.md` 以外的全部文件、`archive-v*` 旧版本和 `design/evidence/`；
- `tests/retired/`（P2 前过渡用）；
- `*.log`、`*.tap`、`*.diff`、`*.jsonl`。

**始终可检索**：

- 全部代码、测试、脚本、`prisma/`、`public/`；
- `AGENTS.md`、`README.md`；
- `docs/` 顶层台账（`requirements-traceability`、`migration-map`、`reuse-manifest`、`acceptance-active-scope`）、`implementation-boundaries.md`、`00`–`05` 设计和用例文档；
- 编号 500 以后的近期文档，以及各功能目录的产品设计和方案文档；
- `design/**/*.md`。

被隐藏的文件仍可按路径直接打开。需要全文检索历史时，使用 `rg --no-ignore`。

按 v2 复审 V2-I1 修订：增加 `!design/*/index.html`、`!design/**/approval*.json`、`!design/desktop-preview.*` 三条放行规则。原因是批准边界、AGENTS.md、`03-ui-design.md` 和台账都点名引用了批准稿。`desktop-preview.*` 是 `03-ui-design.md` 引用的批准交互稿；AGENTS.md 只禁止把它当作安装版工作台，并不禁止阅读，因此放行。

实测（ripgrep 15.0.0，`rg --files`）：可见文件 5,915 → 2,188，可见文本 955,666 → 326,111 行（降 66%）。台账点名的 21 个批准设计文件全部可见，`archive-v*` 全部隐藏。

## 4. 死代码与台账

| 删除文件 | `reuse-manifest.json` |
| --- | --- |
| `src/components/content/ChapterOutlinePanel.tsx` | 标记 `removed-unused`，原因：outline 和 chapter-outline 已由 `OutlineProjectionPanel` 渲染（`registry.tsx:73-74`） |
| `src/components/content/OutlinePanel.tsx` | 同上 |
| `src/components/content/PlaceholderPanel.tsx` | 标记，原因：桌面注册表不使用占位面板 |
| `src/components/theme/ThemeSwitcher.tsx` | 标记，原因：桌面主题切换在设置中实现 |
| `src/components/ui/form.tsx` | 标记，原因：没有任何组件使用 |
| `src/components/ui/table.tsx` | 同上 |
| `src/lib/ai/{auto-model,model-availability,model-request-lane,openrouter}.ts` | 不在 manifest 中（属于 lib 批量导入） |
| `src/lib/prompts/scene-migration.ts` | 同上 |

`tests/unit/chat-model-selection.test.ts:25` 按名字模拟了 `@/lib/ai/auto-model`。被测组件实际上不导入它，这个模拟分支不会被走到，删除文件不影响该测试。`requirements-traceability.json` 中 `uiTextSelection.implementation[19]` 记录了 `OutlinePanel.tsx`，这是 2026-10-13 实施时的事实，保留不动。

## 5. 不做的事

- 不删除任何 `docs/`、`design/` 文件，也不合并或改写历史文档。
- 不删除 `scripts/*` 中的验收驱动：其中 28 个被台账引用，其余被记忆中的真实目标验证依赖。
- 不改写 git 历史。
- 不自动删除未受管的本地产物：5 个 worktree（8.7 GB）、`release/.staging` 中的 8 个副本（4.2 GB）、`/private/tmp/shakeink-599-base`、构建缓存。这些只在 606 中列出，由用户决定。

## 6. 回滚

`git revert` 对应提交即可。若撤销 P3，需要再执行一次 `npm install` 恢复依赖。
