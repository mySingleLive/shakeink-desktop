# 536 用例独立审核：导入伏笔提速

审核对象：`docs/536-foreshadow-import-performance-cases.md`。依据：`docs/535-foreshadow-import-performance-plan.md`（以 3R 为准）、`docs/535-foreshadow-import-performance-plan-review.md`、当前工作树源码与测试（只读）。未运行测试。

## 已确认成立

- 3R 映射：3R-1→FP-02，3R-2/3→FP-REAL、FP-13，3R-4→FP-08，3R-5→FP-05/06/09，3R-6→FP-10，3R-7→FP-11/15，3R-8→FP-04/14，3R-9→FP-07，3R-10→FP-12，3R-11→FP-13/16。**3R-12（台账 NI-16）没有对应项**，第3节第2条保留的 `requestFits` 对半也没有对应项（见中7）。
- FP-01 可以照 LP-01 的写法直接做（`tests/unit/novel-import-lines-performance.test.ts:44-58`）。`lightImportGeneration` 一处同时决定模型降档和车道（`desktop/service/novel-import-ai.ts:1067-1072`），`defaults.generate` 的分派也走这一处（`:1057`）。LP-02 对 touches 的断言不受影响。
- FP-06 用的错误文案 `模型配置或授权已变化，未采用返回结果` 与源码一致（`desktop/main/novel-import.ts:1869`），以“模型”开头，`safeError` 会原样保留（`:1708` 起的前缀白名单）。重试走 `wizard-redetect`，foreshadow 步骤已经放行（`:541`）。
- FP-05 的 3 次上限与 `ROSTER_UNIT_ATTEMPTS=3`、`tries<ROSTER_UNIT_ATTEMPTS` 的判断一致（`:179,708`），可重试错误的正则只认三种前缀（`:181`）。
- FP-11 的规范化口径：`normalizeWizardName` 用 NFKC 并去掉空白（`desktop/shared/novel-import-wizard.ts:7`），`"铜 钥匙"`/`"铜钥匙"` 计为 1 个成立。`wizardView` 会剥掉 `touchStash`（`desktop/core/novel-import.ts:422`）。
- FP-14：`index` 的定义是 `z.number().int().nonnegative()`（`desktop/core/novel-import-wizard-state.ts:42`），`-1` 和 `1.5` 都会被拒。

## 高

1. **没写要改哪些 fixture，FP-03/04/05/06/07/11 照现状跑不起来或测不到东西。**
   - `gate()` 的 `isLine` 只认 worldline/narrative（`lines-performance.test.ts:16,19-31`），touches 请求不会被拦住，峰值也不计数。
   - `toLines` 的 targets 里没有 `foreshadow`（`:37`），而且一到 worldline 就返回。
   - `touchesAi` 只给含“青铜钥匙”的单元返回触点（`tests/helpers/novel-import-wizard-fixture.ts:184-196`）。64 章合成正文里没有这个词（`lines-performance.test.ts:14`），每批都返回 `touches:[]`。这样 FP-04 的跨批同 key、FP-11 的计数递增都没有数据，FP-03 只剩 coverage 可断言。
   - 建议：536 写明三处改动。(a) `gate` 加入 `r.intent==='touches'`，peaks 加 `touches`，同时支持按 operationId 单独 release/reject。(b) 新增 `toForeshadow`：targets 含 `character, worldline, narrative, foreshadow`。要带 narrative，FP-03 的讲述卡目录才不是空的。(c) 新增 `multiTouchesAi`：每批对批内第一章返回一个 PLANT，quote 用 `合成渡口${i}旁` 这种章内唯一的文字，key 可以由用例配置，以便造出跨批同 key。

2. **FP-08 两项断言证伪不了 3R-4。**
   - scopeHash：“运行时记录中的 scopeHash 都相同”在不走缓存时同样成立。不缓存的路径每次都调 `importScopeHash(s,'analyze')`，得到的值相同（`novel-import.ts:1866`）。应该沿用 IP-05/CP-15a 的写法，替换 `runtimeScopeCache.resolve` 来计数（`tests/unit/novel-import-item-performance.test.ts:89,102`；`tests/unit/novel-import-character-scope-cache.test.ts:18-24`）。第20步内 `resolve` 次数应等于 touches 请求数，`compute` ≤1。同一 epoch、同一 workingRevision 下，lines 车道可能已经填好缓存（`desktop/core/novel-import-runtime-proof.ts:31`），所以 compute 可能是 0，期望应写成 `≤1`，不要写 `=1`。另补两项：`verified=false` 的 touches 调用不走缓存（CP-15a `:24` 的反例写法）；workingRevision 变化后拒绝，报 `请重新允许发送本次导入范围`（`runtime-proof.ts:34`）。
   - verify 计数：`≤请求数/4+2` 没有依据，而且太松。31 路同时起步，加上 30 s 窗口，测试里能确定的值是：步骤内 `verifySources` 恰好 2 次（首批前 1 次、apply 前 1 次）。计数要包装 `f.options.verifySources`（`fixture.ts:39`），并且只统计 step==='foreshadow' 的窗口，因为其它步骤也会复核。“同一时间只有一次”要用一个阻塞的 `verifySources` 来断言并发峰值为 1。“至多每 30 s 一次”要 stub `Date.now`，推进 >30 s 后断言计数 +1。另外要断言 `ai` 收到的 `verified` 为 true（用 spy 包装 `c.ai`）。
   - 来源变化：要写清在哪个时点注入（首批前，或 apply 前那次复核）。期望 stepError 为确切文案，并且 journal 中没有 schema 2 的 foreshadow 产物，也就是 apply 没有执行。

3. **FP-09 的修整会产生不合法的 UTF-16，会话随后无法加载。**
   - 先说兼容性：schema 内截断本身没问题。touches 没有 `repair`，`generateJSON` 用 `parseJsonOutput` 跑一遍 schema（`src/lib/ai/generate.ts:222,274`），`runImportAi` 再对已解析的结果 `safeParse` 一次（`desktop/service/novel-import-ai.ts:1108`）。截断是幂等的，两遍都能通过，而且截断后不会触发 correction 那一轮生成（`generate.ts:226-233`）。
   - 问题在长度单位。`z.string().max(200)` 按 UTF-16 码元计数。如果用 `slice(0,200)` 截断，第 200 个码元恰好是代理对的前半时，会留下孤立代理项。journal 的 `text()` 带 `isWellFormed` 校验（`novel-import-wizard-state.ts:39,67`），重启加载时会被 `validJournal` 拒掉。
   - 建议：FP-09 增加一项，第 199–200 码元放一个代理对字符（如 `𠀀`）。期望截断后 `length≤200` 且 `isWellFormed()`，也就是按码点截到不超过 200 码元。另补两项：用 `generateImportAiJson` 加 `deps.generateText` 的路径断言只生成 1 次；controller 层的 `f.setAi` 绕过 service schema，所以 FP-09 必须在 service 层测，用例要写明这一点（对照 `tests/unit/novel-import-roster-ai.test.ts:13`）。

4. **FP-06/FP-07 在 64 章夹具下是空测。** `wizardLinePlan(...,31)` 最多得到 31 批（`novel-import.ts:59,63-75`），31 路并发时第一波就全部发出。“不再派发新批”没有可派发的对象。FP-07 如果暂停时一批都还没提交，“恢复后只请求未覆盖的单元”就等于全部重发，任何实现都能通过。
   - 建议：FP-06 先让一批抛可重试错误，产生排队的两半，并把这两半挂在 gate 上，再让另一批抛不可重试错误。断言排队的两半没有发出，其余在途批 release 后 coverage 已写入，失败批没有 stash。FP-07 先 release k 批（例如 5 批），等提交完成后再暂停。断言恢复后的请求单元并集等于“全部单元减去这 k 批”，且与这 k 批不相交。

4a. **FP-16 的回归期望不成立：NIW-C64a 和 prompt golden 在并行版本下必然变化。**
   - `bodyF` 的每一章都含“拾起青铜钥匙”（`tests/helpers/novel-import-wizard-fixture.ts:18`）。`touchesAi` 对每个 touches 请求都返回一个 PLANT（第一个含该词的单元）和一个无法定位的 MENTION（`:184-196`）。
   - 现在 `stageRequests` 按 profile 装满，这个小夹具只发 1 批。改成 `wizardLinePlan(...,31)` 以后，按章分成约 11 批，得到约 11 个同 key 的 PLANT，以及约 11 条 dropped。
   - 后果：NIW-C64a 断言 `touches.length===1`（`tests/unit/novel-import-wizard-session.test.ts:325`）会失败。golden 的 `legacy-scene:analyze/touches////` 一组会从 1 条变成多条。NIW-C61 等用到 `fullAi` 的检查计数也会变。
   - 建议：二选一，并写进 536。(a) `touchesAi` 只在包含第0章的批里返回触点，其余批返回 `touches:[]`，这样 NIW-C64a 不用改；但 golden 的 touches 组条数仍会变，FP-13 要允许条数变化。(b) 保留 mock，改 NIW-C64a 的期望，比如 1 个伏笔、11 个 PLANT 触点、status 不变，并逐条列出修改。不论选哪个，FP-16 的“现有用例全部通过”都要改成“列出的用例在列出的修改后通过”。

## 中

5. **FP-04 的期望与 3R-8 的口径不一致。** 3R-8 按 `(order=批首单元序号, 原位置)` 排序，同一批内保留模型顺序。所以首条是“批首单元最靠前的那一批里、模型顺序第一条”，不是“按书中位置先出现的那条”。同一批内模型先报后文、再报前文时，两种说法给出不同结果。
   - 建议：改写期望。夹具里同 key 只出现在不同批中，各批一条。补一项：同一批内同 key 两条，content 取模型顺序第一条非空。再补一项：结果等于 `lanes=1` 串行（或旧 `stageRequests` 顺序）时的结果。两种完成顺序要用 gate 按 operationId 逐个 release，每次 release 后等 checkpoint 落盘再放下一个，否则提交顺序仍可能相同。

6. **FP-12 的“完成后 done===total”无法观察。** 步骤 done 后 `advance` 会把 step 改到 verify，而 `wizardLineProgress` 只在 step 为 foreshadow 时给数（`desktop/core/novel-import.ts:405-409`，并且要求 `workingProse` 存在）。
   - 建议：改成两项。(a) 用 gate 逐批 release，断言 done 单调不减，total=64。(b) 用 `injectJournalEdit` 把 `coverage.touches` 设为全部单元、step 设为 foreshadow，再看 `toImportView`，断言 done===total。另补一项：其它步骤和 failed 时不带 `touches` 映射的进度。

7. **漏了第3节第2条中 3R 没有取代的部分：`requestFits` 对半、单章超过 profile 按单元切。** 3R-1 只改了 lanes。
   - 建议：新增 FP-02b。用纯函数夹具或小 profile，让一批加上事件目录和讲述卡后放不下，断言按 `wizardLinePlan(batch,…,2)` 对半；单单元仍放不下时报原有的预算错误（确切文案）。单章字数超过 profile 时，断言这一章按单元切开，其余批都是整章。

8. **FP-05 不够精确。**
   - “被拆成两半”要分两种情况。多章批应在章界处切开（两半各自按章对齐）。单章多单元批按单元从中间切（3R-5）。
   - 要写出得到单单元批的确切路径：64 章约每章 2 单元，需要先后拆分两次。
   - “整步额外请求不超过计划批数”需要一个真正碰到上限的用例：所有请求都抛可重试错误，断言步骤 failed，且请求总数 ≤ 2×计划批数。不碰到上限时这条断言是空的。
   - 3R-5 列了三种可重试错误，现在只测了“结构不完整”。补上 `模型输出未完整结束` 和 `模型未返回可解析的 JSON`。
   - 不可重试一侧补一种传输错误，例如 `模型接口请求失败（HTTP 500）`。

9. **FP-10 的反例期望不够精确，也没测计数。**
   - 反例里“交由原规则丢弃”的前提是模型给的章里也找不到这段引文。夹具要写明这一点，期望写确切 reason（`原文引文无法唯一定位`，或 `章节不在所选范围`）。否则引文在模型章内唯一时触点会被保留在错误的章，用例也照样通过。
   - 补一项：chapterIndex 超出 `s.chapters.length`，evidence 能推出正确的章，期望修正为推出的章。
   - 补一项：在 `SHAKEINK_IMPORT_DEBUG=1` 下捕获 stderr，断言 `touches-repairs` 行的 `chapterFixed` 等于修正次数。3R-6 要求了这一行。
   - 现在 stash 不保存 evidence（`novel-import.ts:1218`），修复必须在 push 之前做。用例应断言 stash 里的 `touch.chapterIndex` 已经是修正后的值。

10. **FP-REAL 的判定规则自相矛盾。** “3 次中至少 2 次达标”和“以第一次为准”在“第一次不达标、后两次达标”时给出相反结论。按 memory 的缓存膨胀规则，同一会话的后续运行命中率虚高，不能用来补救第一次。
    - 建议：通过 = 新会话的第一次运行满足时长和全部质量项。第 2、3 次只记录，作参考，不参与判定。第一次不达标即判不通过，带数据交用户。
    - 补记录项：`touches` coverage = 760（方案第1节）；`chapterFixed` 计数；`import-usage` 中 touches 的 reasoning token 为 0，或 lane 为轻量，用来证明真实运行确实关闭了思考；丢弃率的分母写明为（保留触点数+丢弃触点数）。

11. **FP-13/FP-16 的 golden 步骤执行不了，FP-13 的断言证伪力不足。**
    - 脚本用 `flag:'wx'` 写文件（`scripts/capture-novel-import-prompt-golden.ts:32`），要先删除旧文件再重新生成。
    - 期望应写成：`git diff` 只改动 `legacy-scene:analyze/touches////` 一组（`tests/fixtures/novel-import-prompt-golden.json:170`）。
    - 现有 contract 里已经有“全书0-based章节索引”（`desktop/core/novel-import-ai-payload.ts:176`），“chapterIndex 为全书索引”这一项在旧提示词上也能通过。要列出旧提示词中没有的确切子串（例如 `content不超过100字`、`quote不超过60字`、`只在第一条填写content`），并断言旧提示词不含它们。

## 低

12. FP-02：“首轮批数 ≤ 31”太松。应断言首轮请求的单元分组恰好等于 `wizardLinePlan(pending,s.chapters,profile,WIZARD_LINE_CONCURRENCY)` 的结果，包括顺序（最长优先）。FP-03 的峰值同理，改成 `= min(批数,31)`。
13. FP-03：“首个 touches 请求晚于第19步结束”要写明观察方式，例如在 `f.requests` 中 touches 请求的下标大于所有 outline/narrative 请求的下标。outline 不在 targets 时，第19步是 skipped。讲述卡目录要断言等于与本批相交的 narrative 集合，不能只断言“带了”。
14. FP-11：步骤刚开始、还没有批提交时，期望 `foreshadowFound===0`（与 `wizardRosterFound` 一致，`desktop/core/novel-import.ts:412-415`），不应缺省。
15. FP-14：补一个混合 stash 用例：升级前写入的项不带 order，升级后追加的项带 order。按 3R-8 的 `order??-1`，旧项排在前面，期望要写出来。`refreshForeshadowPlan` 重建的 stash 不带 order（`novel-import.ts:1304`），要回归一次第21步的修订。
16. FP-15：要写出 lineProgress 的具体 x/y。fixture 新增 `foreshadowFound`、`lineProgress` 两个选项（`tests/helpers/novel-import-wizard-ui-fixture.tsx:14,31`）应在用例中写明。断言方式对照 `tests/browser/novel-import-wizard.test.ts:277`。
17. 3R-12：新增“台账 NI-16 已写入，并带真实 E2E 证据路径和质量对比”的验收项。这个文件只能做文本插入，不能 checkout。

## 结论

需要修订后再进入实现。先处理高1–4a：NIW-C64a、golden 的处理方式要先定下来；补齐 gate、toForeshadow、多批 touches mock；把 FP-08 改成计数 resolve/compute 和精确的 verify 次数；FP-09 截断要保证 well-formed，并且在 service 层测；FP-06/07 要构造出确有排队批、确有已提交批的场景。FP-REAL 的判定改为只看新会话第一次运行。
