# 606 仓库冗余清理验证结果

分支 `chore/repo-cleanup`，基于 `beb4f9a`。提交：`a2be915`（.ignore 与 603–605）、`20e3699`（退役测试与 pyc）、`bba22c5`（死代码与依赖）。原始日志和失败清单在 `docs/evidence/repo-cleanup-606/`（已被 gitignore）。

## 结果

| ID | 结果 | 说明 |
| --- | --- | --- |
| CL-01 | 通过 | tsc 0 错误 |
| CL-02 | 通过 | 只有基线已有的 1 条错误（`novel-import-files.ts(9,27)` TS7016） |
| CL-03 | 通过 | 5187 条，42 条失败，与基线逐条相同，无新增 |
| CL-04 | 通过 | 1125 条，76 条失败，与基线逐条相同，无新增 |
| CL-05 | 通过 | 51 条，11 条失败，与基线逐条相同（均需现成安装包或 DMG） |
| CL-06 | 通过 | `npm run build` 退出码 0 |
| CL-07 | 通过 | 352 个产物文件；`dist/` 逐字节相同；JS 全部相同。主 CSS 164,129 → 162,407 字节，只少了 21 个类，没有新增；这 21 个类只出现在被删的 `ui/table.tsx`、`ui/form.tsx` 等文件中，剩余代码不再使用。HTML 和路由文件去掉构建 ID 与 CSS 文件名后相同 |
| CL-08 | **未通过（基线同样失败，与本次清理无关）** | 见下节 |
| CL-09 | 通过 | 不可达项恰好剩 8 个：7 个 `.d.ts`/CSS，加 `resource-observation.ts` |
| CL-10 | 通过 | 5 个新增、4 个修改、168 个删除，全部在计划之内 |
| CL-11 | 通过 | traceability、migration-map、imported-source 逐字节不变；reuse-manifest 中 190 条不变，6 条标为 `removed-unused` 并写明原因 |
| CL-12 | 通过 | `npm ls --depth=0` 退出码 0；lock 中共移除 37 个包（3 个直接依赖和它们的传递依赖），`dist/` 中没有对这些包的引用 |
| CL-13 | 通过 | 在两个提交的干净导出上运行 ripgrep：可见文件 5,889 → 2,176，可见文本 955,351 → 324,406 行（−66%） |
| CL-14 | 通过 | src、desktop、scripts、prisma、public、tests 的可见文件数等于 git 文件数；治理文档、21 个台账点名的批准设计文件、19 个 `design/*/index.html` 全部可见 |
| CL-15 | 通过 | 除 603–606 外，`docs/` 和 `design/` 只有 reuse-manifest 的 6 条标注变化 |
| CL-16 | 通过 | 没有意外的已跟踪修改。浏览器测试新写入的 44 个 `docs/novel-import/evidence/theme-*-{dc67516cf937,6fe4e7a9f01d}.png` 未提交；新的样式哈希来自 CSS 减少的 21 个类 |

## CL-08 真实启动

`scripts/smoke-electron.mjs` 在用全新隔离根目录启动时，主进程报 `ROOT_STARTUP_FAILED`（`desktop/service/root-startup.ts`），界面弹出“配置数据无法自动修复”对话框，遮住了账号菜单，脚本因此超时。`smoke-appearance.mjs` 也停在同一个对话框。

证明与清理无关：

- **换回基线产物仍失败**：保持 `dist/` 不变（与基线逐字节相同），把 `out/` 换回基线构建产物，同一对话框仍然出现。
- **补回依赖仍失败**：临时安装被移除的 3 个依赖（使用基线版本）后，同一对话框仍然出现。

因此这是本机环境中已有的启动问题，本次没有修复。本机另有一个非隔离的开发版 Electron 进程（PID 76700，2026-11-25 12:38 启动，使用 `~/Library/Application Support/ShakeInk`），是否与此有关尚未确认，没有终止它。`verify-content-tabs.mjs` 只能在 Windows 上运行，本机无法替代执行。

结论：所有能对比基线的检查都与基线一致。真实 Electron 启动验证因为一个已有的问题无法完成，不能标记为通过。

## 未处理的本地产物（不在 git 中，需要用户决定）

| 路径 | 体积 | 状态 |
| --- | --- | --- |
| `.claude/worktrees/{close-discard-button,master-base,worldline-chronology,worldline-ui-redesign}` | 各约 2.1 GB | HEAD 已并入 master，无未提交修改 |
| `.claude/worktrees/pr-12` | 433 MB | HEAD 已并入 master；有未跟踪生成物 |
| `/private/tmp/shakeink-599-base` | — | 已并入当前分支 |
| `release/.staging/novel-pdf-*`（8 个） | 约 4.2 GB | `verify-novel-import-pdf-package.mjs` 留下的临时副本 |
| `.next/` | 796 MB | 构建缓存，可重建 |
