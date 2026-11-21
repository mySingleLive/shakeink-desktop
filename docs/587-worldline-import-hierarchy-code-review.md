# 587 · 导入世界线层次 代码审核（独立子代理）

审核对象：`docs/587-worldline-import-hierarchy-plan.md`（修订 3）对应的未提交实现。`docs/requirements-traceability.json` 未审。

已执行（只读）：
- `node --import tsx --test tests/unit/novel-import-worldline-grouping.test.ts tests/unit/novel-import-worldline-timeline.test.ts`：67/67 通过。
- `node --import tsx --test tests/unit/novel-import-lines-performance.test.ts`：44/44 通过（含 LP-*、WT-*、WG-30～38）。
- `node --import tsx scripts/capture-novel-import-prompt-golden.ts --check`：`prompt golden unchanged 26 groups 38 requests`；`git diff tests/fixtures` 只有新增行，没有删除行。旧键逐字节不变。
- `git diff tests` 没有删除行，已有断言没有被放宽或删除。
- 没有运行集成测试、全量测试和应用。

## 必须修改

### M1 归组各段用 `Promise.all`：一段失败或被暂停时，其它段的请求仍在运行，步骤已经返回

`desktop/main/novel-import.ts:1251-1263`。某段两次失败后抛错，`Promise.all` 立即 reject，`runLine` 随即把第 17 步写成 failed（`:1202`）。这时其它段的 `this.ai` 还没结束：
- 违反本文件已有约定：`runLineParallel` 注释写明“every batch in flight settles before this returns or throws”（`:1277`、`:1422`），LP-20 也按这个约定测试。
- 暂停时：先结束的那一段抛 AbortError，`wizardRun` 结束，`stopAction` 的 `await Promise.allSettled(jobs)`（`:2864`）就不再等其它段。其它段这时可能还没 settle，运行时暂停证明里的 `operations`/`pendingCalls` 会不为 0，与 LP-20/WT-33 验证过的“暂停时全部排空”不一致。
- 失败后作者立即点“重试”（`wizard-redetect` 不增加 epoch，`:600`）：旧请求仍占聊天长任务名额（默认 2），新一轮归组只能排队，并且多算一次费用。

第 1 卷预计只有 1～2 段，所以单段时没有影响，多段时才会出现。改法：每段的结果收集为 settled 结果（`Promise.allSettled`，或者用一个 halt 标志让其它段不再开始第 2 次尝试），全部 settle 后再按第一个错误抛出；AbortError 优先抛。建议补一个两段用例：第 1 段两次失败，断言抛出时第 2 段的请求已经结束（WG-33 本来就没有实现，见 S5）。

### M2 父事件由模型文本构造，写入前没有做结构校验

`desktop/core/novel-import-wizard-grouping.ts:57,72`。`name`/`summary` 只经过 `cut`（`trim` 加按码点截断）。服务端 schema（`desktop/service/novel-import-ai.ts:393`）只限长度，不检查 `isWellFormed`，也不检查控制字符。批次结果在合并前都要过 `validateImportSemanticArtifact(...,'strict')`（`novel-import.ts` runLineParallel 内 `:1317` 附近），归组父事件没有这一步：
- `summary` 里有孤立代理项时，父事件 `text` 不满足 `novel-import-semantics.ts:187` 的 `isWellFormed`。后续任何校验 artifact 的地方都会在第 18～21 步或发布时报错，而且报错位置与原因不对应。
- `checkpoint` 先执行 `fn` 修改内存，再 `save()`（`novel-import.ts:2192`）。如果是保存时的校验失败，内存中已经写入了父事件。

改法：在 `applyWorldGrouping` 中对 `name`/`summary` 去掉控制字符，并且要求 `isWellFormed`，不满足的组按丢弃计数；或者对生成的父事件调用 `validateImportSemanticArtifact(parent,'strict')`，失败就丢弃这个组。WG-02 已经证明正常父事件能通过 strict 校验，再补一个含孤立代理项或换行的名字/摘要的用例。

## 建议

### S1 window 祖先下跨度超过一天的 exact 家族仍可能差 1 ulp

`novel-import-wizard-grouping.ts:130-131`。只读探针（临时脚本，已删除）构造 `A=window[lo-1,hi]→B=exact lo→C=exact hi`，其中 `hi-lo>24`，6 位小数，量级 1e4/1e7，共 20 万组。其中 22577 组 `lo+(hi-lo)>hi`，`validatePlanning` 全部报“B 超出祖先 A 允许范围”。原因：`d` 只能让 `lo+d>=hi`，有时不存在使 `lo+d===hi` 的 `d`，而 window 祖先的终点固定为 `timeEnd`。HEAD 上这种输入本来就发布不了（B 的 duration 0 只覆盖 24 小时），所以不是回归，方案 §6 也写了这一点。不过 WG-22 的 window 分支跨度 ≤48，抽样没有覆盖到。第 17 步的输出全部是 exact（`applyWorldTimeline` 删除了 `timeEnd`），只有第 21 步作者改成 window 才会遇到。建议在方案或代码注释中写明这个已知边界；如果要支持，可以把 window 祖先的 `timeEnd` 作为 `hi` 的上限并下调 `d`，同时允许叶子等于上限。

### S2 `worldGrouped.parents` 与 `precisions` 的 5000 上限

`novel-import-wizard-state.ts:86` 限制 `parents ≤5000`，`worldTimeline.precisions ≤5000`（同文件 `:88`）。gregorian 时父事件 id 也写进 precisions（`grouping.ts:84`），所以事件数加父事件数超过 5000 时，状态校验在 `save()` 失败，第 17 步在最后一个 checkpoint 失败。第 1 卷约 1000 个事件，不受影响；全书导入时这个阈值比 HEAD 更早触及（HEAD 只算事件数）。建议在归组前判断，超出时少建组，或者给出明确报错，并补一个用例。

### S3 发布范围对全部世界线生效，包括 source 事件和非主线

`desktop/service/novel-import-publish.ts:159`。`worldlineFamilyRanges` 处理全部 exact/window 事件，包括 `origin==='source'` 和其它 `lineId` 的事件。符合 HEAD 规则的家族保持 duration 0，发布字节不变；只有 HEAD 发布不了的家族（子事件早于父，或超出一天）才会改变。这样做是放宽，没有破坏已有行为，但超出了方案 §6 只针对主线/归组的描述。建议在方案中注明，或者补一个 source 家族的发布用例。

### S4 静默过滤的成员不计入 dropped

`grouping.ts:60-61`。成员中的未知 key、重复 key、已入组、锁定、已有父、已是父的事件被跳过，只要剩下的成员不少于 2，这个组仍然有效，被跳过的成员都不计数。方案 §3.1 写的是“丢弃并计数：未知或重复 key……”。另外，“与成员同名”只与过滤后的成员比较（`:62`）。建议成员级丢弃也计入 `dropped`，或者在方案中写明只按组计数。

### S5 测试覆盖缺口（没有发现被放宽的断言）

- WG-33（多段合并）没有实现。目前所有控制器用例都只有 1 段，M1 的问题因此没有暴露。
- WG-24（`-part-N` 片段的 parent）没有测试。代码 `publish.ts:172` 中 `part` 片段不写 duration，value 为 0，kind 为 unknown，逻辑上正确，但没有用例覆盖。
- WG-16 只断言 catalog 为空（`tests/unit/novel-import-worldline-grouping.test.ts:81`），没有在控制器层断言“不发请求且写入空的 `worldGrouped`”。WT-34 在没有事件时不会生成 `worldTimeline`，所以根本走不到 `runWorldGrouping` 的空分支（`novel-import.ts:1243`）。这个分支现在只有在“有时间线但没有主线 exact 推断事件”时才会执行，没有测试。
- WG-03 方案要求“丢弃写入 `w.dropped`”，目前没有用例断言 `w.dropped` 中有 `世界线归组` 这一项（`novel-import.ts:1268-1269`）。
- WG-22 方案写的是 fixed 与 gregorian 量级“各 5000 组”，实现是每个量级 2500 组（`grouping.test.ts:134`），合计 5000。按方案应改为 5000，或者修改方案的措辞。
- WG-25 中“HEAD 能发布的输入，新算法 duration 与 HEAD 相同”只有一个固定样例（`:128-129`），模糊测试中没有断言这一点。建议在 WG-22 中加入：凡是 HEAD 规则可发布的样例，都断言 `duration===0` 且 `value===timeValue`。
- WG-05 第 72 行的条件表达式 `list[0].facts.parentId?...` 恒为假，可以直接写出期望值，读起来更清楚。

### S6 其它小问题

- `validImportance` 接受字符串 `'1'..'3'`（`grouping.ts:31`），但 schema 已经限定为 int，这是多余的宽容，不影响结果。
- 每段的“可用性”检查（`novel-import.ts:1257`）会对整个 artifacts 做一次复制。事件数为千级时可以接受。

## 已核对、没有问题的点

- 先应用分级再建组（`grouping.ts:44-55`）：父事件的重要度取的是成员的最终值。锁定的 `category`/`importance` 不会被分级改写。锁定 `parentId` 的成员不入组，它自己的分级照常应用，不冲突。
- 同值分级不写入 facts（`:52-53`），所以 fixture 回写有效值后第 18～21 步的字节不变。golden `--check` 通过可以佐证。
- 父事件插在列表中第一个成员之前（`:78,82`）。各组成员互不重叠，所以两组不会共用同一个锚点，不存在同锚排序问题。发布时排序按 `timeValue`，父事件取成员最小值，相等时按下标，父事件仍然排在最早的成员之前。
- id 冲突时加计数重算，同样输入得到同样的 id（WG-07、WG-34）。
- 发布：`parentId` 指向非 exact 的父事件时，`worldlineFamilyRanges` 不为它计算范围，子事件按原逻辑发布。`-part-N` 片段的 parent 指向本事件，不写 duration。
- epoch 与暂停：失败分支调用 `this.current(s,epoch)`，AbortError 直接抛出，与 `runWorldTimeline`（`:1224-1226`）一致。全部段返回后才在 checkpoint 中写入，暂停时不写入任何归组结果（WG-37 通过）。
- 三处清理都 `delete worldGrouped`（`:1751,1879,1903`），WT-35b/587 测试会锁定这一点。
- 阶段白名单：服务端 `validateSemanticStage` 与控制器 `ai()` 都加入了 `grouping:['groups','grades']`，越权字段循环加入了 `groups`/`grades`，grouping 阶段返回 notFound 会被拒（WG-12、WG-13）。请求约束 `novel-import-ai.ts:949` 要求 units/artifacts/entities 为空。runtime-proof 的 intent 与 USAGE_ENUMS 都已加入。
- 不可信输出按数据处理：提示词声明目录不是指令；回复经过 strict schema 校验，并有数量与长度上限（groups ≤2000，members ≤500，grades ≤5000，name ≤200，summary ≤2000）；key 只通过本段映射回 id，未知 key 丢弃。M2 的字符校验除外。
- `reviewMaterials` 跳过归组父事件（`:1554-1555`，WG-35）。`fixStructure` 的清理在引用修复之前执行，并同步从 `events`/`ids` 中删除，所以讲述卡对被删父事件的引用也会被修复。

## 结论

实现与修订 3 方案基本一致。已有用例、prompt golden 与已验证行为没有被破坏，测试断言也没有被放宽。有两处需要修改后再进入全量和真实目标验证：
1. **M1**：归组各段请求要等全部 settle 后再抛错，保持“返回或抛错前所有在途请求都已结束”的现有约定。
2. **M2**：模型给出的父事件名和摘要在写入前要做字符和结构校验。

S1～S6 可以在本轮一并处理，或者在方案中写明。其中建议补上 WG-33 多段用例，它同时能覆盖 M1。
