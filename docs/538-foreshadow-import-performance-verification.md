# 538 · 导入伏笔提速验证

日期：2026-11-08。依据：方案 `535`（以 3R 为准）、用例 `536`（以 3R 为准）、代码审核 `537`。

## 结论

第20步“导入伏笔”在《诡秘之主》第一卷（小丑，213 章，760 个工作单元）上 ≤2 分钟。导入界面显示“已处理 N 个伏笔”和“已完成 x / 213 章”。最终构建的首次运行 fs-r4 用时 94.5 s，时长和全部质量硬指标达标。

## 真实运行（`/private/tmp/shakeink-foreshadow-535/evidence/`，私有，不进仓库）

| 运行 | 构建 | 时长 | 请求（失败） | 伏笔 | 触点 P/M/PAYOFF | RESOLVED | 多触点 | 跨≥4章 | 丢弃率 | length | 输出 p50/max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fs-r1 基线 | HEAD 22b1b10 | 1528108 ms | 10（0） | 130 | 115/30/28 | 28 | 39 | 20 | 3.9% | 0 | 思考开启，1.5–2.6 万 |
| fs-r2 | 初版实现 | 41680 ms | 33（1） | 423 | 343/128/68 | 67 | 75 | 14 | 1.5% | 0 | 3431 / 6152 |
| fs-r4 | 最终（含 537 修订） | 94501 ms | 39（4） | 438 | 353/123/72 | 72 | 83 | 12 | 1.1% | 1 | 3167 / 8192 |
| fs-r5 | 最终 | 66462 ms | 33（1） | 392 | — | 58 | 106 | 17 | 1.9% | 0 | 3286 / 6094 |

- 判定以最终构建的首次运行 fs-r4 为准（536 3R FP-REAL）。fs-r2 构建较早；fs-r5 是复跑，结果受跨轮 DeepSeek 前缀缓存影响，仅作参考。fs-r3 与重新构建同时启动，已作废（目录 `fs-r3-invalid-concurrent-build`）。
- 三次运行 `coverage.touches` 均为 760/760，步骤 done，页面无错误。
- 硬指标（3R-2：RESOLVED ≥20，多触点 ≥28，跨 ≥4 章 ≥10，伏笔 ≥100，丢弃 ≤10%）三次都达标。
- 界面文案（`uiSamples` 每 5 s 采样 `.ni-progress-hero`，截图 `fs-r2/007-foreshadow-progress.png`）：“已完成 6 / 213 章”“已处理 7 个伏笔”，随提交递增。离开步骤前最后一次采样：fs-r2 为“已处理 369 个伏笔”，fs-r4 为“已完成 208 / 213 章”“已处理 432 个伏笔”。
- fs-r4 较慢的原因：4 个批次因输出结构问题被拆分重跑，其中 1 次 `finishReason:length`（8192），最慢一批 67 s；最后 5 章的拆分批在 67 s 才发出。时长仍有约 25 s 余量。
- 隔离根 `~/shakeink-test-roots/cache-522/state.json` 的修改时间（08:42）早于全部运行，模型记录未被改动。

## 自动化测试

- `tests/unit/novel-import-foreshadow-performance.test.ts`：17/17 通过，连续 2 次；FP-08b 单独运行 5/5 通过。
- 回归 `novel-import-wizard-session`、`lines-performance`、`roster-ai`、`wizard-prompt`、`outline-performance`、`novel-import-session`：195/195。
- 浏览器 `FP-15`、`RB-01..03`：2/2。
- `capture-novel-import-prompt-golden.ts --check`：只有 `legacy-scene:analyze/touches////` 一组变化，已重生成。`capture-novel-import-request-trace.ts --check`：通过。
- `npx tsc --noEmit`：通过。`npm run build`：通过。
- 全量 `npm test`（537 修订前）：4638 项中 43 项失败。其中 42 项在改动前的全量运行（`/private/tmp/shakeink-outline-531/full-2.txt`）中已经失败，与本改动无关。另 1 项 NI-LB07 是超时（排空等待），不发出 touches 请求；单独运行 2 次都通过（35 s、29 s），以前的全量运行中它也要 47–50 s。修订后没有重新跑全量。

## 限制

- 伏笔请求关闭思考（用户 2026-11-08 选择）。伏笔数比基线多约 3 倍，其中可能有同一伏笔因跨批命名不同而被拆成多条；跨 ≥4 章的伏笔从 20 降到 12–17。没有逐条人工核对。
- 时长受模型尾部延迟和拆分重跑影响，波动范围 42–95 s。没有做慢批提前拆分（535 第4节）。
- 输出上限 8192 在 fs-r4 中被触到 1 次，已按可重试错误拆分处理。
