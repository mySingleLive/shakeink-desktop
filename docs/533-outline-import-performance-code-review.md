# 533 · 补充细纲导入提速代码审核

日期：2026-11-08。审核对象：未提交 diff 中第19步相关部分（`desktop/main/novel-import.ts`、`desktop/service/novel-import-ai.ts`、`desktop/core/novel-import-wizard-state.ts`、`desktop/core/novel-import-ai-payload.ts`、`desktop/shared/novel-import.ts`、`tests/helpers/novel-import-wizard-fixture.ts`、`tests/unit/novel-import-lines-performance.test.ts`、`tests/unit/novel-import-outline-performance.test.ts`、`tests/fixtures/novel-import-prompt-golden.json`）。依据：`docs/531` 3R、3R2，`docs/532` R 节。

## 结论

未发现高级别问题。按章分批、目标章过滤、拆分不切章、恢复范围、计数写入时机都与 3R/3R2 一致。下面列出 1 个中级问题（沿用 517 的逻辑，细纲上更容易触发）和若干低级问题。

## 已运行的验证

| 命令 | 结果 |
| --- | --- |
| `node --import tsx --test tests/unit/novel-import-outline-performance.test.ts` | 17/17 通过（217 s） |
| `node --import tsx --test tests/unit/novel-import-lines-performance.test.ts` | 30/30 通过（129 s） |
| `node --import tsx scripts/capture-novel-import-prompt-golden.ts --check` | `prompt golden unchanged 24 groups 37 requests` |
| `node --import tsx scripts/capture-novel-import-request-trace.ts --check` | `traceOk:true, hashOk:true` |
| 对比 `/private/tmp/golden-old.json` 与当前 golden | 删除键 `legacy-scene:analyze//outline///`，新增键 `legacy-scene:analyze//outline//wizard-lines-v1/`；另有 `legacy-scene:review/////` 两条哈希变化，其余逐项相同 |

未运行全量 `npm test`（按要求，另一进程在跑），也未做真实 E2E。

## 逐项核对（无问题）

- **相邻章合并后超预算**：`wizardOutlinePlan`（main:82–95）在 `pack` 里用目标章相交单元的并集 `size(union(next))>cap` 判断，cap 不超过 `budget.characters`；单章超预算在 :88 直接报错。合并后不会超出 profile。带元数据仍超时由 `fitOutline`（:1096）按章对半，单章时报预算错误，不会按单元切。
- **单元对半的后备分支对细纲不可达**：`splittable` 对细纲要求 `targets.length>1`（:1102）；此时 `halvesOf`（:1101）一定返回两份带 targets 的计划。`wizardOutlinePlan(...,2)` 只得一批（短章整章落在共享单元里）时，按 mid 对半，再各自用 `lanes=1` 取 `[0]`。子集的并集不大于原批，原批不超过 `characters`，所以 `[0]` 不会丢章。:1194 的 `job.units.slice` 后备只有非细纲计划能走到。
- **提前拆分**：:1164 用 `splittable(job)`，单章批不启动计时器，符合 3R-3。
- **`commit` 与 adopt/group**：目标检查在检查点外（:1113–1117）。`result={...result,artifacts:kept}` 先生成新对象，`delete result.notFound` 只改这份副本，不影响调用方或其它组路径。检查点内先 `adopt.may()`，再 id、合并、`validateDetailedOutlineAssignments`，最后赋值；任何一步抛错都不会改 `s`。
- **strays 只在采用时计数**：`strays` 在检查点内、`may()` 之后、合并成功之后才累加到 `w.lineRepairs`（:1127–1128）。被丢弃的组路径和抛错的批次都不计数。
- **恢复范围**：细纲传全部工作单元（:1068），待处理范围由 `missing()`（:1103）按"没有带 chapterIndex 的细纲"计算，来源复制的章级细纲也算已有。OP-09b 覆盖了 coverage 已满但缺章的情况。
- **非细纲路径**：`fit` 与 `wizardLinePlan` 的行为和批数没有变，只包了一层 `{units}`；`halvesOf` 对非细纲在 `wizardLinePlan` 只得一份时返回 `[]`，失败分支仍走原来的按单元对半。
- **`normalizeLinesReply`**（service:1282–1288）：数字转字符串只认非负安全整数；缺失时按 `unit.start+indexOf(quote)` 定位章，`request.chapters` 是全书章节（`requestSnapshot` 默认带 `s.chapters`），索引是全书索引；`""`、`"05"`、负数、小数都不改。facts 是 `record<string,string>`，其它数字字段仍由严格 schema 拒绝。空列表补 `notFound:true` 后，提交检查因缺目标章报结构不完整，符合 OP-06。
- **instruction 大小**：每批最多 6 章，标题在 `set-chapters` 限 300 字，`JSON.stringify` 会转义换行和引号，加上 anchorHint 约 2 KB。service 对 instruction 没有单独上限；instruction 计入 `serializeImportAiPayload`，所以 `requestFits` 已经算上了它。重跑时 hint 接在目标章之后（:1091），不会覆盖目标章。
- **prompt golden**：键的变化只有预期的那一个。`review` 组的变化可以用数据解释：复核请求的 artifacts 里带章级细纲，而本次细纲的 id（`ol-`+hash）、name（`标题（第N章细纲）`）和夹具里的 evidence quote 都变了；复核的提示模板不依赖 `executionLane` 或 kind=outline 的契约。这一点是从代码推断的，没有逐字节对比 payload 明文。

## 中

### 中1 · 早拆组里多章 rerun 失败时不等原批（main:1187）

```ts
const lasting=halt||!worldEntryRerunnable(failed)||extra<=0||job.rerun&&!splittable(job)
```

触发过程：
1. 慢批提前拆成两半（depth 1，组为 open）。
2. 一半失败，按章拆到 depth 2。
3. depth 2 的部分（例如 6→3→2 章，仍有多个目标章）再失败，进入 rerun。
4. rerun 也失败。此时 `job.rerun&&!splittable(job)` 为假，`lasting` 为假，于是跳过 :1189 的"等原批结算"。随后在 :1195 `if(job.rerun)throw failed`，整步 halt。

原批这时可能马上就要成功；按 3R5-3 和 521 中1 的规定，应当等原批结算后再定。这段逻辑沿用自 517，叙事线的多单元批也有同样问题。细纲的 depth 2 部分通常还有 2–3 个目标章，触发面更大。

修复：把 rerun 失败一律视为 lasting，即 `...||extra<=0||!!job.rerun`。另外，`depth>=2` 且未 rerun 的批会走 rerun，不属于 lasting，这部分保持不变。建议在 OP-08c 的基础上加一个用例：一半在 depth 2 连续失败，原批随后成功，断言步骤 done。

## 低

### 低1 · `notFound:true` 与完整细纲同时返回时被静默接受（main:1117）

3R-6 规定"`notFound` 或空数组即报结构不完整"。现在的实现是：目标章齐全时 `delete result.notFound`，批次被接受。只有严格 schema 本身拒绝 artifacts 与 `notFound:true` 并存时，这样才没有影响。修复：在过滤之前加 `if(result.notFound)throw Error('模型返回结构不完整（chapterIndex）')`。如果有意接受这种回复，就在 531 里写明。

### 低2 · 内部 name 可能超过 300 字（main:98）

name 是 `${c.title}（第${i+1}章细纲）`，标题最长 300 字，拼接后可超过 artifact schema 的 `name.max(300)`（service:34）。现在提交路径不会再用这个 schema 校验，但以后任何重新校验（复核投影、日志校验）都可能拒绝。修复：截断标题，如 `c.title.slice(0,300-label.length-2)`。

### 低3 · 没有相交单元的章会产生空单元批（main:83/88）

如果 `missing()` 返回的章与工作单元都不相交，`own(i)` 为空，`wizardOutlinePlan` 会生成 `units:[]` 的批。这样的批给不出证据，要么被请求校验拒绝，要么反复失败，最终报出的错误与原因无关。正常的章节快照里很可能不会出现这种章。修复：在 :88 对 `own(i).length===0` 直接报一个明确的错误（例如"第N章没有可分析的正文"）。

### 低4 · `linesRepairs.droppedEntries` 不分 kind（service:1167）

service 对三种车道 kind 都接受 `droppedEntries`，但 `w.lineRepairs` 的 worldline/narrative schema 是不含该字段的 strict 对象（wizard-state 的 `lineRepair`）。现在 service 从不生成 `droppedEntries`，main 也只在 outline 上写入，所以没有实际影响。如果 worker 返回了带该字段的 worldline 结果，日志编码会失败。修复：`takeLinesRepairs` 在 `request.kind!=='outline'` 且带 `droppedEntries` 时拒绝。

### 低5 · 共享边界单元会让相邻短章提前显示为完成（core/novel-import.ts:405–408）

coverage 写入的是请求的全部单元，包括与相邻章共享的边界单元。一个整章落在共享单元里的短章，可能在自己的批次还没提交时就被 `wizardLineProgress` 计为完成。这只影响进度显示：结束判断和恢复都按 `missing()`，不受影响。可以接受；如果要精确，进度可改为按"有章级细纲"计数。

### 低6 · 测试补充建议

- OP-07 的 `if(single)` 分支可能不执行：夹具时序没有保证会出现单章批。建议用 `lanes` 或章长构造必然出现的单章批，并断言 `single` 已出现。
- OP-11 有两条断言分支（`anchored` 或回退检查），只要其中一条成立就通过。建议固定到首个失败批的重跑请求上断言。

## 不在本次范围

没有执行 OP-REAL（真实 E2E、≤120 s、213 章）和全量 `npm test`，验收仍需要这两项的结果。
