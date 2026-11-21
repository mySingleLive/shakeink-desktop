# 494 物品导入提速用例 · 独立审核

日期：2026-11-03。对象：`docs/494-item-import-performance-cases.md`、`tests/unit/novel-import-item-performance.test.ts`，依据 493 第3R节。未修改任何源文件或测试文件。

本轮在 Node v24.18.0 下重跑：`node --import tsx --test tests/unit/novel-import-item-performance.test.ts`，5 项全部 RED。失败点如下：IP-01 `:43` 4≠31；IP-02 `:58` 4≠8；IP-03 `:71` thinking 仍为 enabled；IP-04 `:79` 被聊天名额阻塞；IP-05/06 `:100` resolves 0≠65。失败原因都对应未实现的改动。IP-05/06 的 `:96-99`（重试两次、无 evidenceOptions、非 indexed 提示）在改动前已经通过，是守卫断言，这样设计可以接受。

## 一、问题（按严重程度）

### 高1：IP-06 目录解析会在纠错重试请求上抛 SyntaxError，实现后仍会失败

`tests/unit/novel-import-item-performance.test.ts:102-105` 遍历全部 entity 请求，并用 `JSON.parse(r.instruction.slice(r.instruction.indexOf('[')))` 解析目录。`:94` 有意让 names[5] 触发一次纠错，生产代码在重试时把提示拼到目录后面：`instruction:request.instruction+'\n'+hint`（`desktop/main/novel-import.ts:1065`）。这条重试请求的 slice 结果是“目录 JSON + 换行 + 中文提示”，`JSON.parse` 必然抛 `Unexpected non-whitespace character after JSON`（已用 node 复现）。改动前 `:100` 先失败，所以这个缺陷还没暴露；正确实现后 IP-06 会因为测试自身的错误失败。
修订：先截掉 `'\n上一次结果'` 之后的部分再解析，或者解析前跳过带提示的请求，并单独断言重试请求的目录前缀与首次请求相同。

### 中1：3R 第3条“unverified 与普通分析不走缓存”在用例文档中写了，测试没有实现

494 IP-05（`docs/494-item-import-performance-cases.md:9`）写明“unverified 调用与普通分析不走缓存”，`:86-108` 却没有对应断言。实现时如果把条件写成 `request.kind==='item'`，漏掉 `intent==='entity'&&verified`，测试仍会通过。参照 CP-15a（`tests/unit/novel-import-character-scope-cache.test.ts:23`），完成后直接调用 `c.ai(c.session,epoch,itemRequest,false)` 以及 `{...itemRequest,intent:undefined,entityTarget:undefined}`，断言 `computes` 每次各加 1，或者 resolve 调用次数不变。注意：`:90` 的 resolves 只在 `step==='import-item'` 时计数，完成后 step 已经不是 import-item，这个负例必须用不带步骤过滤的计数，否则恒为真。CP-15a 用 `startsWith('import-')` 过滤，有同样的弱点。

### 中2：3R/第3节第4条“coalesced 含 item、写失败即停止”没有任何用例

494 文档没有合批提交的用例，测试文件也没有。现有 CP-16a/b/c（`tests/unit/novel-import-character-commit.test.ts:19-35`）只对 `['character','scene']` 参数化。改动前的行为：`desktop/main/novel-import.ts:752` 的 `coalesced` 为假，`:788` 不设置 `committing`，每个返回结果各自排一次 serial 写。实现时漏改 `:752`，现有用例检测不到。
修订：新增 IP-08，把 CP-16a/b/c 扩展为对 item 参数化（文档与测试同步）。CP-16a 的写入次数（=2）能在改动前区分出差异。CP-16c（写失败后停止调度，不报全部成功）在改动前可能已经通过，因为 worker 有 `.catch(stop)`（`:814`），仍应保留作为回归守卫，文档要如实写明它不是 RED。

### 中3：world 不变缺少负例，实现时直接改全局常量也能通过

IP-01 只证明 item 是 31 路。实现时如果直接把 `WIZARD_ENTITY_CONCURRENCY`（`desktop/main/novel-import.ts:47`）改为 31，world 也会变成 31 路，所有 IP 用例仍然通过，违反 3R“world、图片池不变”。IP-03 只覆盖了 world 的模型策略，没有覆盖并发数。
修订：补一个 world（或 settings）任务的在途峰值断言（=4），或者对常量做源码断言 `WIZARD_ENTITY_CONCURRENCY===4`，再加一个独立的 `WIZARD_ITEM_CONCURRENCY`。

### 低1：IP-03 缺少非 DeepSeek 分支和 patch 阶段

CP-02（`tests/unit/novel-import-character-performance.test.ts:65-68`）还覆盖了 `phase:'patch'` 和 `protocol:'anthropic'`（不注入 deepseek 键）。IP-03（`:72`）没有这两项。3R 写明“其它供应商沿用最轻合法档位规则”，建议补齐。

### 低2：IP-06 只测了名称命中，没测别名命中

方案要求目录按“名称/别名”裁剪。夹具中物品的 `aliases:[]`（`:18`），`want` 虽然按别名计算（`:104`），但不会出现只靠别名命中的情况。实现时如果只匹配 name，测试也能通过。参照 SP-02 的 aliasOnlyKept（`tests/unit/novel-import-scene-performance.test.ts:47`），给一个物品配别名，并让某章只出现别名。

### 低3：“无图片任务”和“进入 detect-world 或其后”没有断言

3R 第4条要求“驱动断言没有图片任务”。IP-01 `:47` 只筛选 entity 任务，建议补 `assert.ok(s.wizard!.tasks.every(t=>t.kind!=='image'))`。文档写“进入 detect-world 或其后”，测试 `:46` 只断言 `notEqual('import-item')`，两者应统一，按实际的下一步写死。

### 低4：CP-02/SP-01 的更新和 IP-07 的范围

CP-02 `:65-67`、SP-01 `:15` 目前仍断言 item 返回原对象，实现后会变 RED，这一点符合预期。IP-07 应列出具体文件，至少包括 character-performance、scene-performance、scene-scheduling、character-scope-cache、character-commit、item-category，并写明更新后 world 仍是负例。还需在 `docs/requirements-traceability.json` 中登记 IP 编号（目前未登记）。

## 二、专项结论

- **IP-05 的重试设置是否有效：有效。** 首次返回 `{artifacts:[]}` 后，`accept` 抛出“模型未返回该项内容”（`:1044`），此时 `received=true`。`entitySchemaFeedback(error,false,false)` 返回 undefined，但 `:1063` 只在 `!received&&!feedback` 时直接抛出，所以会进入一次重试，提示走非 indexed 分支（`:1064`）。65 次请求、65 个不同 payloadHash 的计算正确，因为重试的 instruction 不同。
- **能否检出误开 `indexed`：能。** 一旦开启，`characterEvidenceOptions` 会因为 units 含有名称而生成选项，`:99` 失败；重试提示会变成“由应用计算”，`:98` 也会失败。
- **IP-02 计数：** 39 个初始请求加恢复后的 56 个，合计 95 = 64+31，正确。

## 三、IP-REAL 验收与计时

口径基本合理：失败会让向导停在 import-item，加上零 failed/skipped 和 ID 集合相等，所以不能靠跳过来压低时长。仍有以下可被操纵的口子，需要补充：
1. **N 的下限。** 计时依赖本轮识别出的数量。识别结果偏少时，时长会自然变短。应记录 N，并与 490 验证轮（99）和截图轮（104）对照。如果 N 明显偏少（例如 <90），本轮只记录、不作验收，并说明原因。同时确认没有取消任何默认勾选。
2. **轮次选择。** 应事先写明“首个完整轮次即验收轮”，或者“报告全部轮次”，不能多跑几轮后挑最快的一轮。
3. **计时点与采样。** 写明起点是点击事件派发时的 `performance.now()`，终点是首次观察到 step≠import-item，并给出轮询间隔（≤50 ms）和计时脚本的位置。
4. **证明提速机制真实生效。** 从 runtime.json 或日志记录 item 请求的在途峰值（应接近 31）、thinking 已关闭的证据（请求选项，不含 Key），以及当时的 `maxConcurrentTasks` 值。只看时长达标不足以说明三项改动都生效。
5. 隔离目录与运行方式遵循既有约定：LotmVerification.app、只选第一卷、隔离根目录的租约回执。证据中不得出现原文和 Key。

## 四、结论

**需修订。** 必须修改的是高1（实现后测试自身会失败）、中1、中2、中3，以及 IP-REAL 的第1-4点。低级别问题建议一并处理。修订后可进入 TDD。
