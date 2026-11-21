# 521 剧情线慢批提前拆分（docs/517 §3R5 + review-3 修订）代码审核

范围：`desktop/main/novel-import.ts` `runLineParallel`（约 1030–1121 行）、`revise` 中 `delete w.lineRepairs`（1236、1379 行）；`tests/unit/novel-import-lines-performance.test.ts` LP-27/28/08c/15c/16d。
验证：`node --import tsx --test tests/unit/novel-import-lines-performance.test.ts`，29/29 通过（LP-27 6.0 s、LP-28 6.0 s）。

## 已确认正确

- 不会双写：`may`（1075）是检查点回调第一步，原批次只在 `open` 时可写，半只在非 `original` 时可写；`won` 在合并成功后才改组状态，合并抛错不改状态（1061–1069）。后代、重跑经 1110/1112 继承 group/role，原批次带组后不再拆分或重跑（1105）。
- 被放弃的一路在 catch 第一步按组状态静默返回（1102），不调用 debug、不扣预算、不 halt。
- 真实暂停不会被吞：组为 `open` 时，半的 AbortError 不可重跑，会抛出并设置 halt（1106）；原批次在 1105 静默返回，但尚在队列中的半会在 `call→current` 抛出 stopped。另外 `runLine` 之后的 `checkpoint→current`（1016）会在 epoch 变化时抛错，步骤不会被误标完成。
- 计时器：成功和失败分支都 `clearTimeout`（1100），触发后也清除（1096）；回调先检查 halt、session、epoch（1092）。
- 预算：`early=floor(n/2)`，每次拆分从 `extra`、`early` 各扣 2，满足“最多用额外预算的一半”。阈值 `max(earlyMs, 2×中位ms/字×本批字数)`，成功样本少于 3 个时不触发，与中D 一致。
- `revise` 的两处都清空了 `w.lineRepairs` 和 `kind:'lines'` 的 dropped（高1），LP-15c 覆盖了这一点。

## 中

1. **两半都失败、原批次随后成功时，步骤仍然失败，与 3R5-3“两半失败而原批次成功：采用原批次”不符。** 组为 `open` 时，半遇到不可重跑错误（如 HTTP 500、合并抛错）或预算耗尽，会直接 throw 并 halt（1106/1109/1111）。之后原批次仍会在检查点提交（`commit` 不检查 halt），但 `runLineParallel` 最后还是抛出 halt.error（1121）。结果是原批次已写入、coverage 已完整，步骤却标为失败。修复：在 Group 里记录原批次的结算 Promise；半（含后代）终态失败且 `group.state==='open'` 时，先等待这个 Promise。原批次被采用就静默返回，否则再抛出原错误。暂停/AbortError 仍立即抛出。需补单元用例。
2. **3R5-6 列出的单元用例缺失：** 预算不足不触发、单章不触发、每批只触发一次、成功样本少于 3 不触发、按字数归一化的阈值。现在只有 LP-27/28 覆盖了“触发并采用”。建议加一个用例：`SHAKEINK_LINES_EARLY_MS='100'`，设 2 个成功样本加 1 个慢批，断言没有发出半；再加一个 queue≤3（`early<2`）的用例。
3. **LP-28 的先后顺序有竞态。** 原批次在 `halvesOut===2` 时返回，半最多在 5 ms 轮询后也返回，然后两者经过同样的 `ai` 后置检查（`models()` 等 await），再竞争串行检查点（测试文件约 297–301 行）。如果半先提交，“the original result is adopted”这条断言就会失败。修复：半等到原批次的**提交**完成后再返回（例如等待 `journal` 中出现 `'事件'+slow.units[0].start`），不要只等 `inner` 返回。

## 低

4. LP-27 fixture 在 20 s 时只 `clearInterval`，不 reject。取消一直没到时，请求会永远挂起，测试会卡住，不会报失败。修复：超时时 reject。
5. `succeeded.push` 在 `await commit` 之后（1100），样本包含了串行检查点排队和 `save()` 的时间，中位数会偏高。修复：在 `call` 返回后、commit 之前记下耗时。
6. 触发条件 `active>=WIZARD_LINE_CONCURRENCY`（1092）检查的是名额上限，没有检查是否有空闲 worker（worker 数是 `min(31, 初始批数)`）。所有 worker 都忙时，两半要排队等待，预算却已扣掉。正确性不受影响。可以改为与实际 worker 数比较，或者在注释里说明。
7. 结果已到达、但 `ai` 还在做后置 await 时，计时器仍可能触发，白白花掉 2 个预算。影响小，可以接受。
8. `SHAKEINK_LINES_EARLY_MS`（1070）：作为测试钩子，可以与 `SHAKEINK_IMPORT_DEBUG`/`SHAKEINK_TEST_ROOT` 同等接受，因为默认 30000，又有中位数和样本数门槛兜底。但它没有校验负数和过小值，建议改为 `Math.max(50, …)`，或者只在设置了 `SHAKEINK_TEST_ROOT` 时读取。另外，原批次被拒（`adopted=false`）时没有输出 `lines-timing`，E2E 统计会少一条。

## 结论

有条件通过。双写防护、取消路径静默返回、暂停传播、计时器清理和预算计算都正确。合入前需要修复中1（行为与已批准方案不一致），并补上中2 的用例；中3 的 LP-28 竞态应同时修掉，避免 CI 偶发失败。

## 处理记录（主代理，2026-11-07）

- 中1 已修：一半永久失败且组仍未定时，先等待原批次结算；原批次被采用则该半静默结束，否则原错误照旧抛出；中止或 epoch 变化不等待、立即抛出。LP-29 覆盖（去掉该等待时 LP-29 失败，恢复后通过）。
- 中2：补 LP-30（成功样本不足三个时不提前拆分）。“预算不足不触发”“单章不触发”“每批至多一次”由代码条件保证，未单列用例，记为已知缺口。
- 中3 已修：LP-28 的两半等待原批次的单元真正写入 coverage 后才返回。
- 低：LP-27/28/29 夹具 20 s 后明确失败而非挂起；`SHAKEINK_LINES_EARLY_MS` 只在测试环境读取并下限 50 ms。样本含检查点排队时间、按 31 名额判断空闲、失败原批次无 `lines-timing` 三项保留为已知限制。
- 验证：lines 用例 31/31；与世界观/设定/向导/AI/语义/合并套件 8 路并发同跑 266/266。
