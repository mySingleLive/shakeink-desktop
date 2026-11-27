# 605 仓库冗余清理测试方案（v2）

判定原则：与基线（HEAD `beb4f9a`，Node v24.18.0，本机 Chrome）对比。基线中已失败的用例必须保持为同一组失败，基线中通过的用例必须仍然通过。基线失败与本次清理无关，不在这里修复。基线日志和失败清单在 `.tmp-cleanup/baseline-*`，结果会抄录进 606。

| ID | 检查 | 命令 / 方法 | 基线 | 通过条件 |
| --- | --- | --- | --- | --- |
| CL-01 | 类型检查 | `npx tsc --noEmit` | 0 错误 | 0 错误 |
| CL-02 | foundation 类型检查 | `npm run typecheck:foundation` | 1 错误：`desktop/main/novel-import-files.ts(9,27)` TS7016 | 错误集合相同 |
| CL-03 | 单元 + 集成 | `node --import tsx --test $(find tests/unit tests/integration -name '*.test.ts')` | 5187 条，42 失败 | 总数相同，失败集合相同 |
| CL-04 | 浏览器 | `node --import tsx --test --test-concurrency=4 tests/browser/*.test.ts` | 1125 条，76 失败 | 总数相同，失败集合相同 |
| CL-05 | 打包相关 | `npm run test:package` | 51 条，11 失败（需要现成安装包或 DMG） | 失败集合相同。注意：该组检查的是已有的旧安装包，不能证明新构建可以打包；打包输入由 CL-07 证明 |
| CL-06 | 完整构建 | `npm run build` | 清理前在同一工作区先构建一次，并保存 `out/`、`dist/` 清单 | 退出码 0 |
| CL-07 | 产物对比 | 比较清理前后 `out/`、`dist/` 的文件列表、体积和内容（去掉哈希名；基线副本在 `.tmp-cleanup/baseline-build/`） | 352 个文件 | 文件集合相同；`dist/**` 和 JS 内容相同（11 个文件不进入任何 bundle）。CSS 体积允许略降，只允许减少只在被删文件中出现的类（审核实测为 11,567 → 11,456 个候选类） |
| CL-08 | 真实启动 | `node scripts/smoke-electron.mjs`（隔离测试根目录，零模型，离线） | — | 窗口打开；`/api/novels` 返回 `[]`；菜单为 玄印/文件/编辑/视图/窗口/帮助；sandbox 为 true；设置切换主题、录制快捷键通过；退出码 0 |
| CL-09 | 不可达复核 | 先用 `git ls-files src desktop tests scripts > .tmp-cleanup/files.txt` 重新生成输入，再运行 `.tmp-cleanup/reach-ts.mjs` | 19 项 | 恰好剩 8 项：7 个由 include 或 CSS 加载的 `.d.ts`/CSS，加 `resource-observation.ts` |
| CL-10 | 删除影响面 | `git diff --name-status beb4f9a..HEAD` | — | 只有：A `.ignore`、`docs/603`–`606` 和审核文件；M `.gitignore`、`package.json`、`package-lock.json`、`docs/reuse-manifest.json`；D 是 11 个源码文件、`tests/retired/**` 和 1 个 pyc。没有其他 `docs/`、`design/` 文件变化 |
| CL-11 | 台账一致 | 解析 `reuse-manifest.json` | — | JSON 有效；6 个条目 `status=removed-unused` 且带 `reason`；其余条目与基线逐字节相同。`requirements-traceability.json`、`migration-map.json`、`imported-source.json` 与基线逐字节相同 |
| CL-12 | 依赖 | `npm ls --depth=0` | — | 无 missing、无 invalid；lock 中不含 `react-hook-form`、`@hookform/resolvers`、`recharts` |
| CL-13 | 搜索降噪 | `rg --files` 计数并统计行数 | 5,915 个文件 / 955,666 行 | 文件数和行数都下降，数值写入 606 |
| CL-14 | 必须可检索 | 用 `rg --files` 检查治理文件、批准设计稿和代码目录 | — | 第 604 §3 列出的治理文件全部可见。`AGENTS.md`、`implementation-boundaries.md`、`03-ui-design.md`、`00-delivery-status.md` 以及台账 approval/ui 字段点名的 `design/**/index.html`、`approval*.json`、`product-design.md`、`desktop-preview.*` 全部可见（当前 21 个）。`src`、`desktop`、`scripts`、`prisma`、`public`、`tests` 的可见文件数等于 git 文件数（tests 不含 retired） |
| CL-15 | 设计稿未受损 | `git diff --stat beb4f9a -- design docs ':!docs/60[3-6]*'` | — | 输出为空，没有任何设计稿或历史文档改动 |
| CL-16 | 工作区卫生 | `git status --short` | 测试运行前已有 22 个未跟踪的 `docs/novel-import/evidence/*-dc67516cf937.png` | 不出现任何意外的已跟踪修改；测试新写入的证据图片不提交 |

CL-08 是“真实目标系统验证”。它证明开发版 Electron 能用隔离数据启动，并能完成基本设置交互，但不代表安装包已在各平台通过验收。本次没有改动 `electron-builder` 的文件清单；若 CL-07 证明构建产物与基线等价，就不重新打安装包。
