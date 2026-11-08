# 532 用例独立审核：补充细纲导入提速

审核对象：`docs/532-outline-import-performance-cases.md`。依据：`docs/531-outline-import-performance-plan.md`（以 3R 为准）、`docs/531-outline-import-performance-plan-review.md`、当前工作树源码与测试（只读）。未运行测试。

## 已确认成立

- OP-01～OP-15 和 3R-1～3R-11 都有对应，编号与 3R 条目能对上；OP-REAL 与方案第1节口径一致。
- 车道判定的错误文案“导入调度通道无效”与源码一致（`desktop/service/novel-import-ai.ts:885`）；`linesRepairs` 越权检查有两处，分别在 `novel-import-ai.ts:1171` 和 `desktop/main/novel-import.ts:1824`。
- 并行、暂停、慢批、预算这几类场景都能沿用现有写法：`gate()`（`tests/unit/novel-import-lines-performance.test.ts:19`）、LP-20（`:380`）、LP-27（`:307`）、LP-10（`:269`）、LP-15b（`:280`）、LP-15c（`:347`）。

## 高

1. **mock 不改，OP-04/06/07/15 都跑不起来或测不到东西。** `linesAi` 的 outline 分支按“相交”为每个相交章各返回一项（`tests/helpers/novel-import-wizard-fixture.ts:166`）。所以批里只要有边界单元，回复里就会带上相邻的非目标章。controller 层的 `f.setAi` 绕过了 service 的 `normalizeLinesReply`，按 3R-6 这批会被拒，拆分、重跑以后还是拒，步骤最终失败。提示词 golden 的 `legacy-scene` 流程用的是同一个 `fullAi`，也会在第19步卡住。另外 `gate()`、`isLine` 只认 worldline/narrative（`lines-performance.test.ts:16,22`），`toLines` 的 targets 也不含 outline（`:37`），所以 OP-04 统计不到 outline 的在途峰值。
   - 修复：532 写明要改的 fixture。`linesAi` 的 outline 分支改成对 `outlineTargetChapters(r.units,r.chapters)` 每章返回恰好一项（text 用 `第i章细纲`，不带相交章）；`isLine`/`gate` 的 peaks 加 `outline`；新增一个 `toOutline`，targets 加 `outline`。

2. **待补章不连续时，3R-2 的口径会把已有细纲的章算成目标章。** OP-02 要求“每批章连续且只含待补章”，`outlineTargetChapters` 又按 `units[0].start..units.at(-1).end` 的范围取章（531 3R-2）。恢复时待补章可能是 {3,7}。如果两章装进同一批，第4～6章（已有细纲）也落在范围里，会被当成目标章：模型必须为它们返回细纲，返回后得到同一个 `ol-` id，合并时 text 被拼接（`desktop/core/novel-import.ts:351`），不返回又判结构不完整。现有用例里没有一条能发现这个问题。
   - 修复：OP-02/OP-09 增加两条断言：待补章为 {3,7} 时，两章分在不同批次（批次在已有细纲的章处断开）；任何请求的目标章都不含已有细纲的章。方案 3R-1 的“章连续”要写清楚是全书相邻，不是待补章序列中的相邻。

3. **OP-09 区分不了“按章恢复”和“按 coverage 差集恢复”。** 批次持续失败以后，这批的单元全都没有 coverage，按差集重发和按缺细纲的章重发，请求的单元基本相同。如果实现退回到 `pending=units.filter(!covered)`（现状，`desktop/main/novel-import.ts:1042`），OP-09 照样通过。
   - 修复：新增一条用例，用 `injectJournalEdit`（`fixture.ts:189`）把 `coverage.outline` 设成全部单元，同时删掉第 k 章的章级细纲，再用 `verifyAgain` 恢复。断言：恰好发出目标章为 {k} 的请求，最终每章恰一项。反过来，coverage 为空但各章都有细纲时，不发 outline 请求。

4. **3R-5 按“首个证据单元起点”推出章索引，在最常见的边界场景下会失败，OP-05 没测这一点。** 3R 实测每章开头平均 441 字落在上一章的单元里，模型的第一条引文很可能就取自章首。这个单元的起点在上一章，推出来的是非目标章，按规则保持缺失，随后被拒、拆分、重跑，形状修复不起作用。
   - 修复：OP-05 增加一项：引文位于跨界单元中属于目标章的那一段，期望推出目标章。实现应改用“单元起点 + quote 在单元内的偏移”来定位，而不是单元起点。这一项要先回到方案修订，再写进用例。

## 中

5. **OP-02 没定义“≤6 章/批”和“批数 ≤ lanes”冲突时以哪条为准，fixture 也测不到 6 章上限。** 64 章、62 个 lanes 时，每批只有 1～2 章，6 章上限不会生效。待补章多于 6×lanes 时（例如 lanes=4），两条约束不能同时满足。
   - 修复：用 LP-03/LP-24 式的纯函数夹具，比如 64 章、lanes=4，断言每批 ≤6 章、批数 =11（上限优先；方案需要同步改写）。“最小字数上限”用小夹具暴力枚举可行上限来对比，不能只写一句文字描述。

6. **短章整章落在一个单元里时，OP-03 没覆盖。** `coalesceImportWorkingUnits` 合并单元时不看章界（`desktop/core/novel-import-budget-policy.ts:114`）。一章短于约 1000 字时（序言、感言），整章可能和前后两章共处一个单元。这时它会同时落在相邻两批的范围里，目标章就不再“恰为装入的章”，两批的目标章也可能重复。
   - 修复：OP-03 加夹具：第 k 章 200 字，单元从 k-1 跨到 k+1。断言各批目标章互不相交，并集等于全部章。

7. **64 章正文不一定真有跨章单元，OP-02/04 可能什么都没测到。** 合成章约 1525 字（`lines-performance.test.ts:14`），单元能不能跨章，取决于工作单元怎么切。
   - 修复：用例开头先断言：`workingUnits` 中至少有一个单元满足 `u.start<c.start&&u.end>c.start`。纯函数用例直接构造跨界单元。

8. **3R-3 的 `finishReason:length` 没有用例。** OP-07 只注入了结构错误。
   - 修复：OP-07 增加一项：多章批抛 `模型输出未完整结束`，应按章对半拆分；单章批抛同样的错误只重跑一次。
   - OP-07 里“不会只含半章目标”改成可执行的断言：对每个 outline 请求，每个目标章的全部相交单元都在 `r.units` 里，且目标章非空。
   - 单章多单元批失败后，重跑请求的单元集合应与原批完全相同（现有 `:1150` 的按单元切分退路就是靠这一条拦住）。

9. **慢批的两条采用路径只测了一条。** OP-08 只沿用了 LP-27（采用两半）。原批先返回（LP-28，`:319`）、两半都失败后采用原批（LP-29，`:356`）这两条路径没有 outline 版本。对细纲来说，双写的后果是同 id 的 text 被拼接，而且现有断言（按 name 去重）发现不了。
   - 修复：补 OP-08b/OP-08c。所有 outline 用例统一断言：每项 text 恰好等于某一次回复的 text，不含 `\n\n` 拼接。

10. **重跑时 instruction 被覆盖。** `call(job.units,job.hint)` 会把 hint 当成 `instruction`（`novel-import.ts:1072`）。按 3R-9，主进程又要在 `instruction` 里列出目标章，引文定位失败重跑时，两者会互相覆盖。
    - 修复：OP-11 增加一项：引文定位失败后的重跑请求，instruction 同时含目标章列表和 `anchorHint`。

11. **OP-06 漏了两种情况。**
    - controller 层回复带非目标章时（不经过 normalize），提交检查必须拒绝；
    - 检查点内 `validateDetailedOutlineAssignments` 抛错时（例如来源文件已有同章细纲但 id 不同）不改 `s`。
    - 修复：沿用 LP-15b 的写法，断言该批的章没有产物、单元没有 coverage，其他批保留。另补一项：来源文件已复制的章级细纲算“已有细纲”，这一章不再请求。

12. **第21步的 `outlines` 检查没有用例。** 方案第1节把它列为质量口径（`desktop/core/novel-import-wizard-checks.ts:24`），532 只在 OP-REAL 里隐含。
    - 修复：OP-04 走完以后 `toVerify`（`fixture.ts:181`），断言 `outlines` 一行通过，文案为 `64 / 64 章`。

13. **golden 的表述不可执行。** 两个脚本都用 `flag:'wx'` 写文件（`scripts/capture-novel-import-prompt-golden.ts:37`），不能“只更新一个键”。request trace 只收 roster/entity 下的 character/item/world 请求（`scripts/capture-novel-import-request-trace.ts:25`），所以它只能证明别的请求没变，覆盖不到 outline。
    - 修复：OP-15 改写为：先改 mock，然后删除 prompt golden 再重新生成。`git diff` 只应出现两处变化：删去 `legacy-scene:analyze//outline///`，加上 `legacy-scene:analyze//outline//wizard-lines-v1/`。worldline/narrative 等其余组逐字节不变。request trace 用 `--check` 时，`traceOk` 和 `hashOk` 都要为 true，且不更新文件。

14. **OP-01 漏了 LP-02 的同步修改。** LP-02 现在断言 `kind:'outline'` 带车道时会被拒（`lines-performance.test.ts:61`），改了以后这一条会失败。
    - 修复：OP-01 写明从 LP-02 的拒绝列表里去掉 outline，并在接受列表里加上 outline。

## 低

15. **OP-05/OP-12 的计数边界没写全。** 需要补齐以下几项：
    - 空串 `""` 和 `"05"` 怎么处理。建议只接受规范十进制，否则“同章两项”的判断可能被绕过。
    - 全部条目都因非目标章被丢弃时，`normalizeLinesReply` 会补上 `notFound:true`（`novel-import-ai.ts:1299`）。期望提交时报结构不完整，不能当成接受。
    - `linesRepairsSchema`（`:1167`）的取值：`{0,0,droppedEntries:1}` 应接受，全 0 和负数应拒绝；不带 droppedEntries 的旧日志仍然通过 `validJournal`（`desktop/core/novel-import-wizard-state.ts:65`）。
    - 两批各丢 1 条时，累计显示“丢弃 2 个”（`novel-import.ts:1084` 的求和）。

16. **OP-10 的 entities 断言不全。** 期望里应写成“仍含角色/场景/物品”（3R-8），并断言 world/theme 仍在 `artifacts` 里（`novel-import.ts:2174`）。

17. **OP-04 的 name 断言需要先确认标题格式。** 如果合成章节标题本身就是“第1章 篇0”，按方案拼出来是“第1章 第1章 篇0 细纲”。期望要写出 fixture 下的确切字符串，方案要定义标题已带序号时怎么处理（未核实标题格式）。

18. **OP-14 没写怎么驱动非向导流程。** 用例应写明用哪个 fixture 走到 `semanticWorkflow`（`novel-import.ts:2121`，例如 `novel-import-session.test.ts` 的现有夹具），以及峰值怎么测。

19. **OP-REAL 漏了几项方案要求的记录。** 补以下几项：
    - `finishReason=length` 的次数和 outline 请求的 prompt 大小（531 review 中5/中6）；
    - 真实会话里第21步的 `outlines` 检查结果；
    - 按 memory 的缓存膨胀规则，以每个新会话的第一轮为准，“三轮”只作参考。

## 结论

需要修订后再进入实现。先处理高1–4：改 mock 和 gate，明确待补章不连续时的口径，加入能区分 coverage 差集的恢复用例，修正边界章索引的推断。高4 和中5 要回到 531 修订方案文字。
