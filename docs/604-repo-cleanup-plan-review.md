# 604 仓库冗余清理方案独立审核

审核对象：`docs/603-repo-cleanup-research.md`、`docs/604-repo-cleanup-plan.md`、`docs/605-repo-cleanup-test-plan.md`，以及 `.tmp-cleanup/drop-code.txt`、`drop-retired.txt`、`drop-docs-design.txt`。HEAD `beb4f9a`。审核人只写本文件，没有修改、删除或暂存其他文件。

审核方法：自写扫描脚本，没有复用 `.tmp-cleanup/` 里的 closure/relclose/samedir。扫描覆盖 4 类引用：保留文件中的完整路径，相对路径（分别以所在目录和仓库根为基准），glob 模式，以及按文件名或审核编号的引用。另外人工核对了构建、打包、Tailwind 扫描、依赖树和台账。下面每一条都附有源文件和行号。

## 阻断

### B1 按“审核编号”和裸文件名引用的审核记录被删除，其中包括 00–05 根文档引用的记录

闭包只识别 `docs/…` 路径和 `docs/NNN` 前缀，识别不了根文档里“审核 NN”这种编号写法，也识别不了不带目录的文件名。`drop-docs-design.txt` 中的 69 个 `docs/reviews/NN-*.md`，至少 30 个在根文档中按编号被引用（逐行核对见下）。举例：

- `docs/05-test-cases.md:8` 写“正式用例已通过独立审核25/26”。对应的 `docs/reviews/25-test-cases-review.md` 和 `26-ui-test-cases-review.md` 都在删除清单中。这两份是 531 条正式测试方案的批准审核，`25-test-cases-review.md:5` 原文为“最终结论：PASS，正式测试方案通过”。
- `docs/00-delivery-status.md` 按编号引用了以下审核：`:39` 审核37/38，`:49` 审核43、44、45，`:51` 审核46、47、49，`:63` 审核52，`:85` 65/66，`:93/:95` 71/72/73，`:101` 76，`:107` 80/79，`:110` 78/81，`:127` 83，`:131` 82，`:143` 84/87/88，`:148` 89/90，`:152` 91/92/93/95，`:157` 94，`:159` 96，`:164` 97，`:166` 98，`:170` 99。这些审核文件全部在删除清单中。
- `design/preview-verification.md` 是顶层设计文件，由 `docs/03-ui-design.md:86` 引用，内容是 UI v0.4–v0.13 的检查记录。它的 `:43`、`:58`、`:74`、`:94` 用裸文件名引用 `18-ui-settings-layout-review.md`、`16-ui-settings-bindings-review.md`、`14-ui-menu-editor-review.md`、`12-ui-logo-appearance-review.md`，这 4 份都在删除清单中。同一文件的 `:78`、`:98`、`:116`、`:132`、`:151` 写明证据为 `evidence/v0.8/source-hashes.json` … `evidence/v0.4/source-hashes.json`，`:171` 引用 `evidence/revision-checks.json` 和 `evidence/*.jpg`（33 个文件），`:173` 引用 `archive/check-preview-v0.1.cjs`。这些文件都在 `drop-docs-design.txt` 中。原因是闭包没有把相对路径的基准设为 `design/`。

**修复**：在闭包规则中加入两类引用：根文档中的“审核 N”编号映射到 `docs/reviews/NN-*.md`，以及保留文档中出现的裸文件名映射到同名文件（不限同目录）。另外以 `design/` 为基准解析 `design/preview-verification.md` 中的相对路径。重算之后，至少把上面列出的文件移出删除清单。

### B2 方案第 1 节“顶层文件保持原样”与删除清单矛盾，CL-11 必然失败

`604:6` 写“`docs/` 和 `design/` 的全部顶层文件都保持原样”，`603` §3.3 结尾也写“顶层文件也全部保留”。但 `drop-docs-design.txt` 中有 141 个 `docs/NNN-*.md` 是顶层文件（`603` §3.3 表中的“`docs/NNN-*.md` 147 个”）。另外 `605` CL-11 使用 `git diff --stat beb4f9a -- docs/*.md docs/*.json design/*.* …`。git pathspec 中的 `*` 默认能匹配 `/`，所以这个命令也会列出 `docs/reviews/**`、`docs/novel-import-real-books/**` 等子目录里的全部删除，“只有新增 603–606”这一条件不可能满足。

**修复**：二选一。要么保留全部顶层文件，把 141 个顶层 `docs/NNN-*.md` 移出清单；要么改写第 1 节的原则，明确只保护台账、`00`–`05`、`implementation-boundaries.md` 等具名文件。CL-11 改为对具名文件列表执行 `git diff --exit-code`，或者使用 `':(top,glob)docs/*.md'` 只匹配顶层。

### B3 `src/lib/services/resource-observation.ts` 是活动验收用例的实施对象

`603:66` 写“没有测试 ID 被引用”，与事实不符：

- `docs/migration-map.json:4430-4434` 中，`services` 项的 `local` 为 `src/lib/services/resource-observation.ts`，`testIds` 为 `SERVICE-resource-observation`。
- `docs/acceptance-active-scope.json` 的 `activeCases` 包含 `{"id":"SERVICE-resource-observation","disposition":"active","executionStatus":"not-run"}`。
- `docs/test-cases-business.json` 中有该用例，`docs/05-business-test-cases.md:7927` 定义了“resource-observation 服务领域边界”的完整步骤。

`implementation-boundaries.md:45` 规定 `migration-map.json` 覆盖“65 服务”。删除这个文件后，一条未执行的活动验收用例会指向不存在的实施文件，而方案又规定不改台账。这与 AGENTS.md 中“台账为实施/验收台账”的要求冲突。

**修复**：把 `resource-observation.ts` 从 `drop-code.txt` 移出。如果确实要删，必须先由用户决定是否退役这条活动用例，这不在本次“只删可证明无用的文件”的范围内。

## 重要

### I1 批准设计稿目录中被模板字符串或 glob 引用的资源被删除

- `design/dialog-style/viewer.js:12` 中有 `` const filename=simulated?`${theme}-workspace.png`:… ``，`index.html:78` 加载这个 viewer。`capture-preview.mjs:80` 负责生成这两张图。删除清单包含 `design/dialog-style/ink-workspace.png` 和 `paper-workspace.png`。删除后，已批准（`README.md:3`）设计稿的 planning、drawer、scenario 三个场景会显示破图。
- `design/content-tabs/README.md:13` 写“`preview-observations.json` 及 `preview-*.png` 为设计预览的…检查”。保留的 `preview-observations.json` 记录了 `preview-paper/ink/narrow/last-tab/small-viewer` 这 5 个场景，`capture-preview.mjs:60` 生成 `name + '.png'`。这 5 张图都在删除清单中。
- `design/onboarding`：`capture-preview.mjs:30` 生成 `${name}.png`，`README.md:9` 说明它“生成本目录截图”，保留的 `preview-checks.json` 列出了 11 个场景名。这 11 张根目录 `preview-*.png` 都在删除清单中。
- `design/startup-recovery`：`preview-checks.json` 中 `"name": "preview-…"` 对应的 9 张 png 全部在删除清单中。
- `design/chat-empty-state/product-design.md:81`（在批准文档集合内）写“正式接入方案与验证记录位于 `docs/reviews/2026-10-12-chat-empty-state-*`”。删除清单包含其中 5 个文件（`-browser-results.md`、`-regression-audit.md` 和 3 个 tap 文件）。
- `design/chat-empty-state/verification.md:70` 写“`layout-review-v3/` 保留独立布局目视材料”，删除清单删掉了该目录 21 个文件中的 17 个。

**修复**：闭包需要解析 JS/MJS 中的模板字符串，规则是 `${…}` 加上保留 JSON 中的场景名，还要解析 md 中的 glob 和目录引用。至少把上面列出的文件移出删除清单。

### I2 `docs/NNN` 中以 `docs/` 为基准的相对路径没有解析

- `docs/257-scene-import-revalidation.md:20` 引用 `scene-import-verification/revalidation-publication-tests.txt`。
- `docs/375-…-real-verification.md:3` 引用 `scene-import-verification/build-identity-r41.json`。
- `docs/383-…-real-verification.md:3` 引用 `scene-import-verification/build-identity-r43.json`。
- `docs/268-…-plan-review.md:15` 引用 `structured-probe.json`。
- `docs/320-…-plan-review.md:27` 引用 `r27-review-validation-gap-safe-error-scalars.json`。

上面这些目标都在删除清单中，而同目录下 `docs/270` 链接的 r15 系列文件被正确保留了，说明问题出在路径基准。

**修复**：除文件所在目录外，再以 `docs/` 和仓库根为基准解析一次。

### I3 删除 `OutlinePanel.tsx` 等文件后，台账留下无效的源码路径，测试方案也不会发现

- `docs/requirements-traceability.json` 中 `uiTextSelection.implementation[19]` 为 `src/components/content/OutlinePanel.tsx`，状态是 `implemented-scoped-validated`。
- `docs/reuse-manifest.json:597/774/783/1502/1574/1646` 把 6 个待删文件标为 `"disposition":"reuse","status":"imported-unmodified"`。
- `docs/imported-source.json` 列出了全部 12 个待删文件。

方案选择不改台账，理由可以接受。但 CL-10 只扫描 `docs/…` 和 `design/…` 路径，不检查台账中的 `src/…` 路径，因此清理后台账与源码的不一致不会出现在任何验证结果里。

**修复**：在 606 中列出这些“台账指向已删除源码”的条目，并说明处理方式。或者在 CL-10 中加入台账 `src/`、`desktop/` 路径的存在性检查，把基线差异写入结果。

### I4 CL-10 用的是和闭包相同的算法，不能独立发现遗漏

CL-10 只检查 `docs/…`、`design/…` 路径和相对链接，与 `603` §2 的闭包规则相同。B1、I1、I2 中的遗漏在 CL-10 下都会显示“0 个引用指向已删除文件”。

**修复**：CL-10 增加以下检查：裸文件名匹配；根文档“审核 N”编号匹配；JS 模板字符串加 JSON 场景名；md 中的 glob 和目录引用。再增加 CL-15：用离线 Chrome 打开每个保留的 `design/**/index.html`，切换全部场景，断言没有失败的图片或脚本请求（`design/onboarding` 和 `startup-recovery` 已有同类检查项“No script errors, failed assets or HTTP requests”）。

## 建议

### S1 §3 中“只有 ripgrep 读取 `.ignore`”的说法不准确

Tailwind v4 的 oxide 扫描器内置 `ignore` crate（`node_modules/@tailwindcss/oxide-darwin-arm64/*.node` 中含 `crates/ignore/src/dir.rs` 和 `.ignore` 字符串），自动检测模式下会遵守 `.ignore`。我在临时目录中实测：自动模式 `**/*` 跳过了 `.ignore` 中列出的文件，显式 `@source` 模式仍然扫描它们。本仓库 `src/app/globals.css:1` 使用 `source(none)`，`:8` 使用显式的 `@source "../**/*.{ts,tsx,js,jsx,html}"`，所以目前不受影响。git、tsc、esbuild、next、electron-builder 和 `tests/` 中没有发现读取 `.ignore` 的代码。

**修复**：把 §3 的说法改为“Tailwind oxide 也读取，但本项目使用显式 `@source`，不受影响”，并在 CL-07 中比较加入 `.ignore` 前后的 CSS 产物。

### S2 CL-07 应预期 CSS 变小

删除 12 个源码文件后，Tailwind 扫描到的候选类从 11,567 个减少到 11,456 个。少掉的类只出现在被删文件中，例如 `rounded-2xl`、`size-14`、`caption-bottom`、`xl:inline`、`data-[state=selected]:bg-muted`。我在 `tests/`、`scripts/`、`desktop/` 中没有找到这些类的其他使用。“去哈希后比较体积”会看到 CSS 变小，这是预期结果，但 CL-07 的通过条件应写明“CSS 只减少这些类”，否则执行人可能误判为失败。

### S3 移除 3 个依赖：未发现破坏，但 lock 同步需要固定 npm 版本

- 这 3 个依赖只被 `src/components/ui/form.tsx:12` 导入。按 lock 计算，移除后会连带去掉 31 个只被它们依赖的包，包括 d3-*、victory-vendor、redux、@reduxjs/toolkit、immer、es-toolkit、eventemitter3、decimal.js-light、@standard-schema/utils。`src`、`desktop`、`tests`、`scripts` 中都没有直接导入这些包。
- 打包时运行时依赖来自 esbuild metafile 中的 externals（`scripts/runtime-dependencies.mjs:159-180`）。`runtime-licenses/bundled` 只包含 `next`，`THIRD_PARTY_NOTICES.md` 也没有这些包，所以许可证生成和打包清单不受影响。
- 当前 PATH 上的 npm 是 10.8.2，Node 24 自带的是 11.16.0。P2 必须使用 Node 24 的 npm 执行 `npm install --package-lock-only`，并检查 lock 的 diff 只包含删除的条目，没有 `resolved` 源或格式的变化。

### S4 CL-05 不能证明打包没有受影响

`tests/packaging/packaged-resources.test.ts:11` 读取的是已有的 `release/mac-arm64/玄印写作.app`。清理不会重建这个包，所以 CL-05 只能证明“结果与基线相同”，不代表打包验证。建议在 606 中如实写明这一点。

### S5 工作区并不干净

`603:3` 写“工作区干净”，但目前有未跟踪文件 `docs/novel-import/evidence/theme-ink-*-dc67516cf937.png`（6 个）。P1–P4 提交时应逐个 `git rm` 或按路径暂存，不要用 `git add -A`。CL-14 也应把这些文件列为基线中已存在的未跟踪项。

## 已核对、未发现问题

- `tests/retired/**` 和 `.pyc`：`tsconfig.json:45` 与 `tsconfig.foundation.json:15` 都排除了该目录，`scripts/test-core.mjs:8` 和 `scripts/verify-content-drawer-regression.mjs:8` 遍历时跳过 `retired`。`tests/unit/packaging-config.test.ts:47` 只做路径匹配，不读取文件。台账和 `backup-scope-retirement.json` 中都没有 `tests/retired` 引用。
- 12 个源码文件：除自身和 `tests/unit/chat-model-selection.test.ts:25` 的按名桩以外，`src`、`desktop`、`tests`、`scripts` 中没有导入。`src/components/content/registry.tsx:73-74` 已指向 `OutlineProjectionPanel`。`scripts/import-web-baseline.py` 是一次性导入脚本，不参与构建。`scripts/test-core.mjs:22-23` 只记录源文件哈希，不与固定值比较。
- `tests/unit/brand-product-identity.test.ts:52` 中的 `readdirSync('design/assets')` 读取的目录不在删除清单内。代码、测试、脚本中出现的 `docs/…`、`design/…` 路径，在删除清单中没有命中（只命中了 `docs/evidence/` 下运行时生成的文件，这些文件不在清单内）。用户记忆中的路径也没有命中删除清单。
- electron-builder 的 `files` 是正向清单（`electron-builder.config.cjs:12-33`），不包含 `docs/` 或 `design/`。

## 结论

**不通过。**

阻断问题：B1 至少 30 份被根文档按编号引用的审核记录，以及 `design/preview-verification.md` 引用的证据，进入了删除清单。B2 方案原则与清单矛盾，并且 CL-11 必然失败。B3 删除了活动验收用例 `SERVICE-resource-observation` 的实施文件。

修复 B1–B3 和 I1–I4 后（修正闭包规则、重算清单、加强 CL-10 并增加 CL-15），需要重新提交审核。代码清单其余 11 个文件、3 个依赖的移除和 `tests/retired/` 的删除本身没有发现问题，可以在修订后先行执行。

## v2 复审

审核对象：`docs/604-repo-cleanup-plan.md` v2、`docs/605-repo-cleanup-test-plan.md` v2、`.tmp-cleanup/ignore.draft`、`.tmp-cleanup/drop-code.txt`（11 行）。v1 的 B1、B2、I1、I2 已不再适用，因为 v2 不删除任何 `docs/`、`design/` 文件。B3 已修复，`resource-observation.ts` 不在 `drop-code.txt` 中。

验证方法：用 `git archive HEAD` 导出一份干净副本，把 `ignore.draft` 复制成副本根目录的 `.ignore`，再用 ripgrep 15.0.0 执行 `rg --files`，与 `git ls-files` 逐个比对。结果是 5,894 个受管文件中 2,158 个可见、3,736 个被隐藏。v2 §3 写的 2,162 个，差的 4 个应来自工作区里的未跟踪文件。

### `.ignore` 对 git、构建、测试和 Tailwind 的影响：未发现问题

- **Tailwind**：在同一份副本上，用 `globals.css:1,8-13` 的实际 `@source` 和 `@source not` 规则调用 `@tailwindcss/oxide` 的 `Scanner`。有 `.ignore` 和没有 `.ignore` 时，扫描到的候选类都是 11,567 个，两边各自独有的类都是 0。
- **git、tsc、esbuild、Next、electron-builder、测试**：在 `scripts/`、`tests/`（不含 retired）和 `desktop/` 中都没有找到读取 `.ignore` 的代码。tsc 只看 `tsconfig.json:34-40` 的 `include`，electron-builder 只打包 `electron-builder.config.cjs:12-33` 的正向清单。
- **代码目录不受影响**：`src`、`desktop`、`scripts`、`prisma`、`public` 的可见文件数等于 git 文件数，分别是 518、332、154、67、80。`tests` 可见 626 个，等于 782 减去 retired 的 156 个。
- `docs/[0-4][0-9][0-9]-*` 只匹配三位编号，不会误伤 `00`–`05` 这类两位编号的文件。实测 `docs/` 顶层的台账、`implementation-boundaries.md` 和 `00`–`05` 全部可见。

### 重要

**V2-I1：已批准 UI 的权威文件被隐藏了。**

规则 `design/**/*.*` 加 `!design/**/*.md` 只放出 `.md`，于是以下文件全部被隐藏：

- 19 个 `design/*/index.html` 批准稿；
- 4 个批准绑定文件：`design/novel-import/approval-v4.json`、`onboarding/approval-v3.json`、`startup-recovery/approval-v1.json`、`novel-import-wizard/approval.json`；
- `design/desktop-preview.*`。

这些文件被以下治理文档点名引用：

- `docs/implementation-boundaries.md:4`：批准来源是“`design/novel-import/approval-v4.json` 绑定的 HTML”；
- `implementation-boundaries.md:20`：“`design/chat-empty-state/product-design.md` 与对应 HTML”；
- `AGENTS.md:6`：禁止把 `design/desktop-preview.*` 用作安装版工作台；
- `docs/03-ui-design.md:14`：交互稿是 `design/desktop-preview.html`；
- `docs/requirements-traceability.json:5375,5481,5809,6111`：分别把 `design/worldline-rail-modes/index.html`、`worldline-card-zoom/index.html`、`worldline-table-card-scale/index.html`、`startup-recovery/approval-v1.json` 记为设计依据。

另外，11 个 `design/` 子目录一个可见文件都没有，其中包括最近批准的 `worldline-rail-modes`、`worldline-card-zoom`、`worldline-table-card-scale`、`worldline-card-edit` 和 `faulted-work-node`。AI 实施 UI 时要拿批准 HTML 来对照（AGENTS.md 要求“照批准设计实现”），这些文件不应默认被隐藏。

**修复**：在 `design/**/*.*` 之后追加下面两行。我已在副本上实测：追加后 23 个文件（19 个 index.html 和 4 个 approval）重新可见，`archive-v*/` 下的旧版本仍然被隐藏。

```
!design/*/index.html
!design/**/approval*.json
```

`design/desktop-preview.html` 是否也放出，请由用户决定。AGENTS.md 要求不得把它当作实现来源，隐藏它反而能降低误用的可能，但它同时又是 `03-ui-design.md:14` 引用的批准交互稿。

**V2-I2：CL-09 照现在的写法必然失败。**

- **预期数量算错了。** 基线不可达项实际是 19 个：7 个“由 include 或 CSS 加载”的文件（`desktop/shared/word-extractor.d.ts`、`src/types/` 下 5 个 `.d.ts`、`src/components/chat/chat-empty-dock.css`）、11 个待删文件和 `resource-observation.ts`。删除后应剩 8 个，即 7 个加 `resource-observation.ts`。605 写的是“8 个 … 再加 resource-observation”，也就是 9 个。
- **脚本输入不会更新。** `.tmp-cleanup/reach-ts.mjs:5` 读的是固定清单 `.tmp-cleanup/files.txt`，里面仍含 11 个待删路径（逐个核对过，11 个都在）。`cand` 来自这份清单，所以删除后这 11 个文件会继续被报告为“不可达”。

**修复**：重跑前先用 `git ls-files > .tmp-cleanup/files.txt` 重新生成清单，并把通过条件改为“恰好剩下这 8 项”。

### 建议

- **V2-S1：其他被隐藏、但仍有人直接引用的文件。** 这些不影响运行，按需放出或接受隐藏：
  - `README.md:167` 链接 `docs/reviews/130-brand-rename-verification.md`；
  - `implementation-boundaries.md:20` 引用 `docs/reviews/2026-10-12-chat-empty-state-plan.md`；
  - 用户记忆 `lotm-settings-import-driver.md:19` 引用 `docs/scene-import-verification/r25-runtime-restoration.json`；
  - `requirements-traceability.json` 中的 981 个 `docs/…` 路径有 634 个被隐藏，大多是 `docs/reviews/` 下的审核记录。

  这些文件都还能按路径直接打开，所以不阻断。但应在 `.ignore` 文件头或 606 中写明：台账列出的路径需要用 `rg --no-ignore` 或直接打开路径来读取。
- **V2-S2：`docs/test-cases-business.json` 是活动台账的数据来源。** `docs/acceptance-active-scope.json` 的每条 `activeCases` 都以 `"source":"docs/test-cases-business.json"` 指向它。隐藏它会让 AI 默认搜索查不到用例定义，只能查到 md 版本的 `05-business-test-cases.md`。如果 md 版本已经足够，可以维持隐藏，但要在 `.ignore` 的注释中写明这个取舍。
- **V2-S3：CL-07 对 JS 可以要求得更严。** 11 个文件从任何入口都不可达，不会进入任何 bundle，所以 JS 应该完全相同，不需要“允许缺少被删模块的代码”这一放宽。同时保留 CSS 允许减少 111 个类（11,567 → 11,456）的条件。
- **V2-S4：其他已核对、无问题的项。**
  - `reuse-manifest.json` 当前的状态值只有 `not-imported`、`imported-unmodified`、`adapted-desktop-boundary` 三种。`tests`、`scripts`、`desktop`、`src` 中没有代码校验状态枚举，只有一次性脚本 `scripts/import-web-baseline.py:30` 会写入状态。新增 `removed-unused` 不会让任何测试失败，CL-11 能够覆盖。
  - `npm ls --depth=0` 目前没有 extraneous、missing 或 invalid，P3 的 `npm prune` 只会删除这 3 个依赖带来的包。
  - CL-16 写的基线 22 个未跟踪 png 与实际一致。

### 605 v2 能否发现这次删除造成的回归

- **能发现：**
  - 有人导入被删文件：CL-01、CL-02 的类型检查和 CL-06 的构建会报错。
  - 运行行为变化：CL-03、CL-04 的全量测试和 CL-08 的真实启动会发现。
  - 产物变化：CL-07 会发现。
  - 台账被误改：CL-11 会发现。
  - 文档或设计稿被误删误改：CL-10、CL-15 会发现。
  - 代码被意外隐藏：CL-14 会发现。
- **会误报：** CL-09，原因见 V2-I2。
- **发现不了的：** V2-I1 这类“治理文件被隐藏”的问题。CL-14 只要求“§3 列出的治理文件可见”，而 §3 自己就没有列入批准 HTML 和 approval JSON。

**修复**：在 CL-14 中增加一条：`implementation-boundaries.md`、`AGENTS.md`、`03-ui-design.md` 和 `requirements-traceability.json` 里 `ui`、`uiApproval`、`approvedUi` 字段点名的 `design/` 路径，全部在 `rg --files` 中可见。

### v2 结论

**修改后通过。**

没有阻断问题。`.ignore` 不影响 git、构建、测试和 Tailwind 的扫描结果，11 个死代码文件的删除、3 个依赖的移除和 `tests/retired/` 的删除也都没有发现问题。

执行前需要修复两项：

1. **V2-I1**：在 `.ignore` 中放出批准 HTML 和 approval JSON，并相应补充 CL-14。
2. **V2-I2**：修正 CL-09 的预期数量，并在重跑前重新生成 `files.txt`。

这两项修复只涉及 `.ignore` 规则和测试方案文字，不需要再次提交独立审核。主代理在 606 中记录修复后的实测结果即可。
