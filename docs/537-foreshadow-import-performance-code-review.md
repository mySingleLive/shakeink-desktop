# 537 · 导入伏笔提速代码审核

日期：2026-11-08。审核对象：未提交 diff（`desktop/main/novel-import.ts`、`desktop/service/novel-import-ai.ts`、`desktop/core/novel-import-ai-payload.ts`、`desktop/core/novel-import-wizard-state.ts`、`desktop/core/novel-import.ts`、`desktop/shared/novel-import.ts`、`src/components/desktop/NovelImportWizard.tsx`、`tests/helpers/*`、`tests/browser/novel-import-wizard.test.ts`）及新文件 `tests/unit/novel-import-foreshadow-performance.test.ts`。依据：`docs/535` 3R、`docs/536` 3R。

## 结论

实现没有高级别问题。并发调度、停止/暂停、预算计数与 `runLineParallel` 一致。测试有 1 个高级问题：FP-08b 不稳定，3 次单跑失败 2 次。另有 3 个中级问题，都是断言过弱，测不出它要测的缺陷。

## 已运行的验证

| 命令 | 结果 |
| --- | --- |
| `node --import tsx --test tests/unit/novel-import-foreshadow-performance.test.ts` | 16/17，FP-08b 失败（`a check after 30 s`，1 !== 2），135 s |
| 同文件 `--test-name-pattern=FP-08b` 连跑 3 次 | 失败 2 次，通过 1 次 |
| 临时副本把 :224 的 `sleep(60)` 改为 `sleep(1500)`，连跑 3 次 | 3/3 通过（副本已删除）。说明是测试等待不足，实现本身正确 |
| `npx tsc --noEmit` | 通过 |
| `node --import tsx --test --test-name-pattern=FP-15 tests/browser/novel-import-wizard.test.ts` | 1/1 通过 |
| `scripts/capture-novel-import-prompt-golden.ts --check` | `prompt golden unchanged 24 groups 37 requests` |
| `scripts/capture-novel-import-request-trace.ts --check` | `traceOk:true, hashOk:true` |
| `git diff tests/fixtures/novel-import-prompt-golden.json` | 只有 `legacy-scene:analyze/touches////` 的 prompt 哈希变了，payload 不变 |

未运行：全量 `npm test`、回归文件（wizard-session、lines、roster-ai、wizard-prompt）、真实 E2E（FP-REAL）。

## 已确认成立

- **worker 结束条件**（main:1279）：与 `runLineParallel`（main:1214）写法相同。队列空且 `active===0` 时返回。每个 worker 结束时 `finally` 先 `active--` 再 `wake()`，等待中的 worker 不会挂住。
- **halt 与拆分**（main:1270–1272）：`retry` 先判断 `!halt`，到 `jobs.unshift` 之间没有 await，所以 halt 之后不会再压入两半。halt 之前已压入、尚未派发的两半，会被各 worker 开头的 `if(halt)return` 挡住。
- **额外预算与 attempts**：`extra=jobs.length` 取自预算对半之后的计划；拆分扣 2，单单元重跑扣 1。`attempts` 只记单单元（键为单个 unit id）。同一时刻一个单元只属于一个 job，键不会互相干扰。第 3 次失败时 `tries=3`，不再重跑，与 3R-5 一致。
- **verify 并发与 30 s 窗口**（main:1253）：同一时间只有一次（共用 `verifying`）；首批前一次，之后间隔 ≥30 s；`runForeshadow` 在 apply 前无条件再复核一次（main:1229）。verify 抛错时 runJob 在 try 之外抛出，进入 halt。
- **暂停与停止**：`AbortError` 不重试（`error.name!=='AbortError'`，Node 中 DOMException 是 Error 的实例），进入 halt。等 `allSettled` 结束后再抛出，`runForeshadow` 把 AbortError 原样抛出，步骤不标 failed。暂停后才返回的结果会被 `ai()` 内的 `current()` 和 `checkpoint` 内的 `current()` 拦下，不会写入。
- **排序确定性**（main:1287）：`order` 取批首单元的书内位置。`wizardLinePlan` 和 `wizardTouchHalves` 都保持书内顺序，批首就是批内最靠前的单元，不同批的批首不同，不会并列。`refreshForeshadowPlan`（main:1359）重建的 stash 不带 `order`，全部是 -1，退化为原顺序，与旧行为相同。
- **schema 修整**：`touchSchema` 只在 `importAiResponseSchema`（service:481）里使用，没有转成 JSON schema（native JSON schema 只用于场景清单和结构化场景）。`.default('').transform(...)` 在 zod v4 下对缺失值同样生效。
- **轻量策略范围**：`intent:'touches'` 只有向导第20步发出（main:1247）。`lightImportGeneration` 只被 `importGenerationModel` 和 generate 车道分流（service:1059/1071/1073）引用，其它路径不受影响。
- **视图计数**：`foreshadowFound` 只在 `step==='foreshadow'` 且 stepState 为 running 时给出。暂停时仍显示，失败或进入 verify 后不显示，符合 3R-7。
- **章节修正不会越出选择范围**：`located` 的 k 取自 `s.chapters`，即所选章节的工作稿章节，与单元使用同一套坐标（`wizardLineProgress` 和 fixture 用的是同一种比较）。

## 高

1. **FP-08b 不稳定，第一条断言没有测到东西**（tests/unit/novel-import-foreshadow-performance.test.ts:221–224）。
   - :221 的 `until(()=>touchRequests(f).length>pending.length||g.pending.size>0)` 一开始就成立：此时还有 30 个请求在 gate 上。所以 :222 的 `checks===1` 可能在 A 的两半还没发出时就断言了，测不到“30 s 内发出的两半不再复核”。
   - :224 失败后只 `sleep(60)`。B 被拒绝后，要经过 `ai()` 的运行时记录和 writeWizardRuntime，才回到 worker 派发两半并调用 verify，负载下超过 60 ms。实测 3 次失败 2 次。
   - 建议：两处都改为条件等待。:221 等到 `touchRequests(f).length===初始批数+2`，且两半都在 `g.pending` 中，再断言 `checks===1`。:224 改为 `until(()=>checks===2)` 加上限，再 `sleep` 一小段，确认没有第 3 次。

## 中

2. **FP-06 的“halt 后不再派发”可能被计入基线**（test:160–162）。`sent` 在 B 失败并 `sleep(30)` 之后才取。如果实现在 halt 之后仍派发了队列中的第二半，它会在这 30 ms 内发出并算进 `sent`，后面的 `touchRequests(f).length===sent` 照样通过。建议：在 `g.fail(b)` 之前记 `const sent=list.length+1`（初始批数加已发出的一半），或者断言 `sent===list.length+1`；并断言 A 的第二半没有出现在 `f.requests` 中。

3. **FP-10 没有覆盖“批内序号且在范围内”这一主要情况，容差也掩盖了计数错误**（test:244–254）。
   - 奇数章用 `k+100`，总是 ≥100，超出 64 章。它和第2章的 999 测的是同一条路径，也就是“超出章数”。3R FP-10 第一条要求的是：模型索引在范围内但指向错误的章（例如 0..6），quote 不在那一章，而在推出的章内唯一。这条没测到。不修正时，越界索引本来会被 `planForeshadowTouches` 以“章节不在所选范围”丢弃，而范围内的错误索引会以“原文引文无法唯一定位”丢弃，两者结果不同。
   - :254 的 `fixed>=wrong-2` 没有依据：夹具是确定的，应得的修正数正好是 33（32 个奇数章加第2章）。
   - 建议：奇数章改用 `k`（批内序号，落在 0..6，且 ≠i），断言 `fixed===wrong`。

4. **FP-04 对触点顺序做了排序再比较，测不出顺序上的不确定**（test:111）。`touches` 被映射成 chapterIndex 后排序，两次运行写入 `facts.touches` 的顺序即使不同也能通过。3R-8 要求同一组回复得到相同的产物。建议：直接比较 `JSON.parse(a.facts.touches)` 的原始顺序。也可以比较整份 `facts`。

## 低

5. **`located` 会改写模型给出的有效索引**（main:1255–1259）。只要推出的章 k 与模型值不同，且 `touch.quote` 在 k 内唯一，就改用 k，不检查模型值本身是否已能唯一定位。另外 `unit.text.indexOf(evidence.quote)` 取的是首次出现：一个跨两章的单元中 quote 出现两次时，首次出现可能不在作者所指的那一章。这与 3R-6 字面一致，风险小。建议：多加一个条件，只在 `touch.quote` 无法在模型给的章内唯一定位时才修正；或者要求 evidence.quote 在单元内唯一。
6. **对半后不再按长度排序**（main:90–92）。`wizardTouchPlan` 先排序再 `flatMap(fit)`，因预算被对半的批留在原位置。`runLineParallel` 在 fit 之后排序（main:1116）。3R-1 写的是“最长优先”。建议：fit 之后按字符数排序。
7. **注释错位或过期**。main:78–81 是 `wizardOutlinePlan` 的文档注释，新函数插在它和 `wizardOutlinePlan` 之间，现在它挂在 `wizardTouchHalves` 上（main:82–83 是两段相邻的 `/** */`）。core `wizardLineProgress` 上方仍写着“Steps 17–19”。
8. **只复制来源、不推断时短暂显示 0**。`wizardInfers` 为假时，`runForeshadow` 在 `copySourceKind` 期间 stepState 仍是 running，视图会给出 `foreshadowFound:0` 和 `lineProgress 0/N`，界面短暂显示“已处理 0 个伏笔”。建议：在 `targets` 不含推断伏笔时不给出。
9. **FP-03 的峰值断言自我参照**（test:88–89）。`batches` 取自实际请求数，再断言 `peak===batches`。controller 是否用 `WIZARD_LINE_CONCURRENCY`（而不是 ×2）只靠 `≤31` 间接约束。536 3R FP-02 要求的是“首轮分组恰好等于 `wizardLinePlan(units,chapters,profile,31)`”，集成测试没有做这个对比。建议：用 journal 中的 workingUnits、chapters 和 profile 算出期望分组再比较。
10. **FP-08 没有 stub `Date.now`**（test:190–204）。`checks===2` 依赖整步在 30 s 内跑完，与 536 3R 的要求不同。负载很高时可能变成 3。建议：按 536 3R 固定 `Date.now`。
11. **FP-11 的 failed 状态在 unit 层没有覆盖**。只有浏览器夹具检查了失败视图不显示该行。建议：在 FP-06 失败后断言 `(await f.view()).wizard!.foreshadowFound===undefined`。
