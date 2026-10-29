# 《诡秘之主》整书向导导入：调研与测试用例独立审核

日期：2026-10-29。审核对象：`01-research.md`、`02-test-cases.md`。依据：当前源码（`desktop/main/novel-import.ts`、`desktop/core/novel-import.ts`、`desktop/core/novel-import-wizard*.ts`、`desktop/shared/novel-import-wizard.ts`）、上一轮 `docs/lotm-local-import/01/03/05`、冻结基线文件，以及对原件按 `splitImportUnits` 与 `classifyLocalUnits` 规则的只读重算（未调用模型、未改源码）。

## 结论：不接受

调研的源码描述基本准确，D1 真实存在且描述正确。但测试用例存在以下阻断问题：正文逐字基线在向导现有界面下结构上无法达成，却没有对应处理；向导特有的丢弃路径没有任何用例检查；多项通过条件只要求“存在/非空”。按当前用例执行，会出现“必然 FAIL 却无自愈方案”和“缺内容仍可判 PASS”两种情况。

## 事实核对

- 行号均正确：`index.ts:393` `wizard:true`；`novel-import-wizard.ts:3` 22 步；`novel-import.ts:331/337/350/375/608/1130`；`WIZARD_ENTITY_CONCURRENCY=4`（`novel-import.ts:39`）。
- 等待作者的步骤 2/3/4/6/9/11/13/15/21 正确：roster 结束后进入 waiting（`novel-import.ts:388`），实体任务未全部 done/skipped 时进入 waiting（`:452`），verify 永远停在 waiting（`:557`）。
- 第 6 步“只能缩小”正确（`:328`）。实体输入只取第一批（`:617` `[0]`）正确，而且命中单元按名称出现次数排序，所以截断时优先丢失的是提及较少的单元，不一定是后期单元。
- **D1 属实，描述正确。** 重算结果：5620 个单元，其中 4090 个从行中间开始；首个非空行命中 `labelKind` 的单元只有 4 个，起点分别为 1798308、3161252、3207204（“物品…”）和 3570264（“场景…”）。由于 `current` 会延续到下一个标题（`core/novel-import.ts:56`），实际受影响的是 9 个单元，6 个 item（索引 2091–2092、3694–3696、3748）、3 个 scene（4176–4178）。另有 3 个 unknown，与探针一致。补充两点：(a) 判断依据是“第一个非空行”（`:54`），不是第一行；(b) 修复必须同时阻止延续，否则后续单元仍会沿用错误标签。“第 4 步显示识别到 1 处”这一点本审核未复现界面，无法确认。
- AI 识别会把全部非 excluded 单元重新发送分类（`novel-import.ts:1106`），所以本轮确实会掩盖 D1。调研的判断正确。

## 阻断问题

1. **正文逐字基线在向导分类粒度下无法达成，调研风险 4 的处理方式也不成立。** 冻结的 8 段非叙事区间中，有 7 段的起点或终点落在单元内部。例如：区间 `0–293` 对应的单元 `292–301` 内容是 `"\n第一部 小丑\n\n"`，前面的换行属于非叙事，“第一部 小丑”属于第 1 章（基线 `sourcePrefixRange [293,302]`）；末段区间 `4803194–4803440`（番外后的 PS1）与番外正文同在单元 `4802899–4803440` 内；各卷末区间都错开 1 个字符（如 `741309–741774`）。不论 AI 把这些单元分成 body 还是 excluded，拼接结果都不等于 `expected-body.txt`。另外，第 6 步只能按章取舍（`novel-import.ts:325-329`），并入卷末章的作者说明无法靠取消章节去掉。上一轮正是通过 `set-range` 拆分边界才对齐（`lotm-local-import/05-test-execution.md:56`），而向导第 4 步界面没有范围编辑（`NovelImportWizard.tsx:70-76`），驱动规则又是“只点正式向导界面按钮”（`01-research.md:56`）。需要在执行前明确选一条路：(a) 把它作为已知产品缺口，按自愈流程补上向导范围编辑；(b) 经独审后允许驱动调用正式 `set-range` IPC，并在证据中注明；(c) 不改基线，接受 LW-BODY01 判 FAIL。不能等长跑结束后再临时决定。
2. **向导的静默丢弃路径没有用例检查。** 以下内容被丢弃后，8 项结构检查仍然全部 ok，`wizardNext('verify')` 也只看 checks 和冲突（`novel-import.ts:293`）：
   - 复核模型提出的遗漏一律标为 done，并记成 `missingTarget` 丢弃（`:552`）；
   - 伏笔触点经 `planForeshadowTouches` 后的 `plan.dropped`，以及没有可用证据的整条伏笔（`:536` `if(!evidence.length)continue`、`:539`）；
   - 关系目标或上级未导入时，只保留名字或改为顶层（`:463,:465`）；
   - 物品清单在展示前按 `keepWizardItem` 过滤，不重要且出现章数不足的物品不进入清单（`core/novel-import-wizard-roster.ts:22`、`core/novel-import-wizard.ts:113`）。
   
   需要新增用例：导出 `w.dropped` 和 `w.skipped` 全量，逐条判定。属于所选 11 类的真实内容被丢弃，判 FAIL 或进入自愈；伏笔触点要报告“提出数 / 保留数”；`missingTarget` 不能为空就放过。
3. **通过条件过弱，多数只是非空或“有依据”。**
   - LW-WORLD02 写的是“每类至少一条”，相比上一轮按类别逐项设定的 WORLD02–10（`lotm-local-import/03-test-cases.md:31-39`）是降级。`semantic-minimum.json` 中九类各有 2–4 条锚点，应逐类绑定。另外，子设定类型由第 15 步清单决定，模型返回的类型必须与清单一致（`novel-import.ts:628`），所以应在第 15 步检查点就断言清单覆盖九类，缺类时立即自愈，不要等发布后才发现。
   - LW-CHAR01 的“冻结清单中的重要角色”，以及 LW-SCENE01/ITEM01 的“廷根、贝克兰德等”“重要物品与封印物”，都没有在看模型结果前冻结具体名单，无法判 FAIL。应从 `semantic-minimum.json`（character 34、scene 23、item 17 项）抽出明确的最低名单。
   - 调研风险 2 提到的实体输入截断没有用例覆盖。应对跨全书实体（主角、阿蒙、奥黛丽等）要求证据单元覆盖后期卷，后期状态正确。
   - LW-OUT01 引用“检查项 outlines 显示 1402/1402”，但该文案无论结果如何都会这样输出（`core/novel-import-wizard-checks.ts:24`），只能以 `ok=true` 加独立逐章计数为准。
4. **跳过和缺类没有统一断言。** 只有 CHAR、SCENE、ITEM 三个用例写了“任务全部 done”，WORLD01/02、SET01 没有。主题、文风、爽点/泪点的 settings 任务挂在第 16 步（`novel-import.ts:600`）。依赖的世界任务被跳过时，子设定会级联跳过（`:280`）。roster、两线、伏笔失败后可以“跳过此步骤”，之后会被直接放行（`:356`）。应新增一条全局用例：第 5–21 步 `stepState` 全部为 done（没有 skipped 或 failed）；`w.skipped=[]`；所有 entity 和 settings 任务都是 done；第 4 步后 `wizardSkippedSteps` 的结果与第 5–20 步的交集为空。
5. **主角多身份要求与“清单保持默认、不做人为操作”相互矛盾。** LW-CHAR01 要求克莱恩、夏洛克·莫里亚蒂、格尔曼·斯帕罗、道恩·唐泰斯、愚者正确关联，但 roster 只按名称和别名合并（`core/novel-import-wizard-roster.ts:15-16`）。如果模型把这些身份列成多个角色，就只能靠作者在界面上合并（`wizard-merge-candidates`，`novel-import.ts:252`），而测试规则禁止这类操作（`02-test-cases.md:9`）。需要事先规定：允许经正式界面合并，并记录为作者决定；或者不允许合并，此时清单出现分裂即判 FAIL 并进入自愈。

## 非阻断建议

1. 冻结基线复用总体合理：四个文件只依赖原文，`expected-body.txt` 的 SHA `81d90177…` 与 `semantic-minimum.json` 内记录的一致，卷章数和 8 段区间也与调研相符。建议在用例中写明四个文件的 SHA，并说明使用的是 v2 版本（同目录还有 `baseline-v1/`、`semantic-minimum-v1.json`）。`semantic-review-ledger.json` 含上一轮的判定，不得复用为本轮结论。
2. LW-NARR01 不要只依赖 `lines` 检查。该检查只拦截 `chapterIndex >= 章数` 的情况，NaN 或负数都能通过（`core/novel-import-wizard-checks.ts:23`），应独立校验 chapterIndex 为 0 到 1401 的整数。
3. 用户要求的“大纲”包括卷级或全书大纲。向导第 19 步只产出章级细纲（`novel-import.ts:490-498`）。应在用例中明确：是否要求 `Volume.summary` 或 PlanningDocument 大纲，或者说明章级细纲即满足要求。上一轮 OUT01 有此要求（`lotm-local-import/03-test-cases.md:24`）。
4. LW-CLS01 的通过条件补两条：后续单元不沿用错误标签；“第一部 小丑”这类行首卷标题仍能识别（单元 292 以换行开头，标题从行首开始）。D1 修复会改变构建，按调研顺序先修再冻结构建身份即可，不算越界。
5. LW-FLOW02 中“selected 仅含 body”应写成深度相等，与上一轮一致（`lotm-local-import/03-test-cases.md:9`）。还要断言不存在 GOLD_FINGER 行，并且 `notFound` 中没有出现被取消的 goldenFinger 任务。
6. `notFound` 只是被记录（`novel-import.ts:418,498`），并不会阻止发布。LW-VERIFY01 已经覆盖这一点，建议在总结中把它列为产品层缺口观察项。
7. 关于越界：除 D1 修复外，没有发现超出用户目标的用例。LW-SEC01 和 LW-PERSIST01 属于 AGENTS 约定要求的内容，保留。
