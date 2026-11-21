# 导入中断即删除草稿 验证（237）

日期：2026-10-30。方案 `docs/235-import-abandon-plan.md`，用例 `docs/236-import-abandon-cases.md`。Node v24.18.0。工作树基于 `3162a4f`（含本次之前已存在的未提交改动，未提交）。

## 结果总览

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| 主进程新增用例 IA-01～IA-30、IA-S02 | `node --import tsx --test tests/unit/novel-import-abandon.test.ts` | 28/28 通过 |
| 导入相关浏览器用例（新增 IA-B01～B10 及改写的既有用例） | `node --import tsx --test --test-concurrency=1 tests/browser/novel-import-abandon.test.ts tests/browser/novel-import.test.ts tests/browser/novel-import-wizard.test.ts tests/browser/novel-import-pdf-pages.test.ts tests/browser/novel-import-theme.test.ts` | 72/72 通过 |
| 真实 Electron IA-R01～R03 | `node scripts/verify-import-abandon.mjs`（隔离 `SHAKEINK_TEST_ROOT`，合成 .txt，零模型，替换原生打开对话框） | 3/3 通过，见 `docs/evidence/237-import-abandon-real.txt` |
| 全量 `npm test` | `npm test` | 3018 项：2962 通过，56 失败。失败集合是基线 57 项的严格子集，无新增失败；名单 `docs/evidence/237-full-fails.txt`，基线 `docs/evidence/236-baseline-fails.txt`。基线中的 NIW-C29（并发上限计时用例）本次通过，判为时序波动，不计为修复 |
| 类型检查 | `npx tsc --noEmit` | 0 错误 |
| 构建 | `npm run build` | 通过 |

## 独立审核

- 技术方案：子代理审核"有条件通过"，7 项发现全部处理，见方案文末。
- 测试用例：子代理审核"有条件通过"，补充 IA-14b、IA-20～IA-26、IA-B04b/c 等，见用例文末。
- 代码审查：子代理审查"有条件通过"，处理如下：

| # | 发现 | 处理 | 回归用例 |
| --- | --- | --- | --- |
| 1 | 删除前已排队的命令可能在停止后启动任务 | `abandonDraft` 先等待 `serial` 队尾，再循环停止直至无任务 | IA-27 |
| 2 | candidateBlocked 时不取消在途 AI | 该分支直接对全部 operation 调 `cancelAi` | IA-28 |
| 3 | 用户取消进行中再调用 `close()` 会提前返回 | 记录进行中的删除，`close()` 等待它 | IA-29 |
| 4 | 文案仍称可收起/保留草稿 | 改为说明关闭或取消会删除 | IA-B02、IA-B02b |
| 5 | 替换询问屏 Esc/关闭会删除当前导入 | 关闭询问等同"返回当前导入" | IA-B04d |
| 6 | 旧格式未保存草稿启动时被跳过而非删除 | 先做最小形状检查，未保存即删除，再做完整校验 | IA-30 |
| 7 | 删除后 PDF 准入在服务断开时也会重开 | 与既有暂停路径一致，非本次回归，未改 | — |

改写既有用例的子代理还发现一处本次引入的回归：已开始保存的草稿，其章节版本/预算策略损坏时启动应报错，被改成了静默跳过。已恢复为在 `validJournal` 之前执行致命校验（NI-LB05、LOTM-V05 恢复通过）。

## 既有用例改写

依赖"重启恢复未保存草稿"的用例已逐条改写，改写记录：

- `docs/evidence/237-rewrite-session.md`（`novel-import-session.test.ts`）
- `docs/evidence/237-rewrite-semantic.md`（语义、分类、证据批次、运行时证明）
- `docs/evidence/237-rewrite-wizard.md`（向导、来源选择、卷章、PDF、目录迁移；`reopenWith` 改为 `injectJournalEdit`）

删除的断言只涉及已移除的"重启恢复未保存草稿"行为（LOTM-L-STR06 两条、NIW-C19 一条），理由见上述记录。

## 未做项与限制

- Windows 未执行。真实模型供应商未参与（零模型，合成来源）。
- 原生打开对话框在真实 Electron 中被替换为返回合成文件，未经人工点选。
- 未提交、未打包安装包。
- 现有数据目录：新版首次启动会删除其中未开始保存的草稿。本机 `~/.shakeink` 有 1 个暂停草稿、LOTM 隔离根有 1 个暂停草稿，本次验证未以新版启动这两个目录。
