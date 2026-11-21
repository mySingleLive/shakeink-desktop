# 527 共享原文前缀用例 · 独立审核

审核对象：`docs/527-import-shared-source-prefix-cases.md`（下称 527）。依据：`docs/526-import-shared-source-prefix-plan.md` 修订 1 与 §3A（下称 526）、`docs/526-import-shared-source-prefix-plan-review.md` 及其“修订 1 复审”。对照代码：`desktop/core/novel-import-ai-payload.ts`（:18-45 序列化与分派、:61-158 各构造器的 `'<novel-import-data>'+payload+'</novel-import-data>'` 结尾、:163-166 固定预留）；`desktop/main/novel-import.ts`（:136-145 `characterEvidenceOptions`、:148 `ROSTER_OUTPUT_RETRYABLE`、:436-438 启动时删除未保存草稿、:452-455 `validJournal`、:620-669 `runRoster`、:1270-1317 `importEntity`、:1509 会话创建、:1700-1726 `requestFits`/`stageRequests`、:1767-1783 `ai`）；`desktop/service/novel-import-ai.ts`（:628-640 `import-usage`、:875-895 `validateSemanticRequest`、:977 证据锚点错误、:1077-1095 `runImportAi`）；`desktop/core/novel-import-budget-policy.ts`；`tests/helpers/novel-import-wizard-fixture.ts`；`src/lib/ai/generate.ts:200-232`。另只读核对了 base-r1 私有数据：`~/shakeink-test-roots/cache-522/novel-imports/e01821dd-…/session.json`、`/private/tmp/shakeink-cache-522/evidence/base-r1/app-stderr.log`、`/private/tmp/shakeink-cache-522/fail-*.txt`。没有运行测试或模型。

结论：**修改后通过**。527 覆盖了 526 的大部分要求，金样思路正确。但有 3 项高风险须先补齐：base-r1 数据可能在下一次启动时被删除；SS-REAL 的一项质量门在现有数据中无法计算，其余几项口径不明确；复审明确要求的几条用例没有写入。

## 高

**高1 · base-r1 会话是未保存草稿，在同一隔离根上再次启动应用就会被删除；SS-SIM 与 SS-REAL 都依赖这份数据（527:27-28）。**
base-r1 的 `session.json` 当前状态是 `phase:'running'`，没有 `publication` 字段。`initialize` 遇到没有 `publication` 的日志会直接 `removeDraftDirectory`（main:437-438，注释“An unsaved draft is never resumed”）。只要在 `~/shakeink-test-roots/cache-522` 上再启动一次（例如为 SS-REAL 复用该根），离线模拟要用的 base-r1 会话（884 个 artifact、884 个任务、`workingUnits`）就会消失，§3.3 的基线也就无从对比。另外，`/private/tmp/shakeink-cache-522/` 下的 `app-stderr.log`（1,368 行，含全部 `import-usage`）与 `fail-*.txt` 位于 `/private/tmp`，525 已经记录过一次被系统清理的事件。
须补一条前置用例 SS-00：实现开始前，把 base-r1 的 `session.json`、`runtime.json`、`app-stderr.log` 和失败基线清单复制到 `/private/tmp` 以外的私有证据目录（不入库），记录 sha256；SS-SIM 只读这份副本；SS-REAL 的新布局首跑与旧布局冷基线都用新的隔离根，不复用 cache-522。

**高2 · SS-REAL 的质量门有一项在 base-r1 数据中无法计算，其余几项口径不明确（527:28，526:72）。**
- “证据拒绝率”：base-r1 日志里没有 `模型证据无法定位（…）` 这一行（grep 结果为 0）。这个错误（service:977）由 `generateJSON` 内部的纠错吸收（generate.ts:216-232），日志里只表现为 `generation>1`，和结构失败、`finish≠stop` 无法区分。base-r1 无法提供该基线值。须二选一写清：(a) 去掉该项，并入“纠错代次率”；(b) 改前先加一条调试计数行（白名单原因码，不含正文），只拿旧布局冷基线和新布局首跑比较，并写明 base-r1 不参与这一项。
- “纠错代次率”：可以从 `import-usage` 计算（base-r1 共 92 行 `generation:2`，其中角色 entity 9、物品 entity 9、世界观 entity 36、世界观 roster 7）。须写明分子和分母（`generation>1` 行数 ÷ 不同 `op` 数），按 `intent:kind` 分别计算，不能合并后再比；roster 改为逐窗后 `op` 数大约翻倍，按合并口径比较会把比率稀释一半。
- “facts 字段数均值 / evidence 条数均值 / text 长度中位 / 条目数 ±5%”：可以从 `session.json` 的 `artifacts` 计算（base-r1：角色 129、场景 429、物品 114、世界观 212）。须写明按 `kind` 分别比较（世界观再分 `entityType`）；“已填 facts 字段”指值非空字符串、`"[]"`、`"{}"`；比较对象是“base-r1 与旧布局冷基线两者中较差的一个”，还是分别比较、各自达标。
- 场景阶段在 2.4 中保持不变，可以拿它的上述指标作为两次运行之间的噪声对照，建议写进用例。
- “失败/重试不增加”：base-r1 的任务 `attempts` 全为 0，驱动记录的重试为 0。须写明从 `wizard.tasks[].attempts` 与驱动日志读取。

**高3 · 复审要求的几条用例没有写入。**
- R-M1 ②“整窗 `requestFits` 为 false 时回退旧逻辑”没有用例（SS-10/11/12 都不覆盖）。在 81,920 字的门下，普通正文很难让整窗超出 `payload≤characters*3`（main:1705）。但新布局把 `<`、`>` 转义为 6 个字符的 `<`/`>`，控制字符经 `JSON.stringify` 也会变成 6 个字符，所以一个充满 `<` 的 40,960 字窗口会超限。须加 SS-10b：构造这样的窗口，期望该窗按旧 `importStageBatches` 分批，请求不带 `sharedSource`，其它窗口仍按规范窗口发送，不抛“单个导入任务…超过模型预算”。这条也能证明 `requestFits` 计算的是新布局下的 payload。
- 2.1“主进程在 `requestSnapshot` 中计算并校验规范窗口”没有用例（SS-06 只测服务端）。须加：伪造 `sharedSource`（窗口序号错位、窗口单元与规范窗口不同、entity 主窗不是规范窗口）经 `ai()` 发出，期望在 `options.ai` 被调用之前就抛错，`requests` 为空。
- R-L4 ② 和 ③ 不完整：没有“会话创建后才设置 `SHAKEINK_PROMPT_LAYOUT=legacy`，已有会话的布局不变”；没有“在 `SHAKEINK_TEST_ROOT`/测试上下文以外设置该变量无效”（526:72）；没有“有 `promptLayout` 但没有 `budgetPolicy` 的日志加载失败”。SS-08 写的是“带字段会话但无 `budgetPolicy`”，按 R-L4 ③ 这种日志根本无法加载，这一项应移到 SS-07，改为“加载失败”；运行门的这个分支改用门函数的纯单元测试覆盖。
- H1“主进程预检与服务端构造逐字节一致”没有用例。须加：同一请求在主进程 `ai()` 中算出的 `importAiPrompt` 与服务端 `deps.generate` 收到的 `prompt` 逐字节相同；`runtime.json` 中的 `payloadHash` 等于服务端 payload 的 sha256；`sharedSource` 经 RPC（`desktop/service/index.ts:125-126`）原样到达。

## 中

**中1 · SS-01 金样只冻结了构造器，没有冻结门关闭时的控制器请求序列（527:7、:14）。**
本次改动重写了 `runRoster` 的分批（main:628 → 逐窗）和 `importEntity` 的取文（main:1283-1285）。门关闭（256K、`legacy` 开关、旧会话）时，这两处必须仍走原路径，构造器金样证明不了这一点。SS-08 写的“其余请求与旧布局相同”没有比较对象。须在改前另外冻结一份“请求轨迹金样”：用 1M 模型、`legacy` 开关新建的会话，再加一个超过 81,920 字的合成正文，记录角色、物品、世界观 roster 与 entity 的全部 `ImportAiRequest`（单元 id 序列、`instruction`、`entityTarget.evidenceOptions`）和提示词 sha256；改后逐项相等。256K 模型同样冻结一份。
构造器金样本身另需补齐以下内容：
- 列表缺 2.4 所列的“非向导导入”（`semanticVersion` 缺省，payload.ts:61 路径）、`reconcile`、带 `evidenceOptions` 与不带 `evidenceOptions` 的角色 entity、场景 roster 碎片（`sceneRosterFragmentRequest`）、场景 review 单元引用（`sceneReviewUnitReferenceRequest`）、带 `IMPORT_SCENE_OWNERSHIP_CONTRACT` 前缀的 ownership。
- 请求须按 `requestSnapshot` 之后的真实形状构造（`semanticVersion`、`selectedTargets`、`chapters`、`entities`），否则会漏掉 `relevant` 过滤和 `optionIndex` 映射这些分支。
- 合成正文须包含 `<`、`>`、`"`、换行、代理对和 `</novel-import-data>`，证明旧布局不转义（R-L1）。
- 金样须在改前提交上用脚本生成并单独提交，记录生成提交号；R-L2 的构造器拆分要以此为准。

**中2 · SS-SIM 要求“真实构造函数”，但 entity 取文目前写在控制器私有方法里（527:27）。**
主窗口选择和补充单元优先级会实现在 `importEntity`（私有方法）内。离线脚本调用不到它，就只能另写一份，这样就不是“真实构造”了。须写明：把取文抽成导出的纯函数（输入工作单元、规范窗口、候选、资料切片、`profile`），`importEntity` 和模拟脚本都调用它，再由单元测试 SS-13/14 覆盖。
另外，“命中率”须写明口径：
- 按 token 还是按字符计；字符换算 token 的方法。
- DeepSeek 前缀缓存的粒度（按块对齐）。
- 缓存可见性：只计开始时间早于本请求的已完成请求，roster 并发 15、entity 并发 31 按波次模拟。
- 分母只含角色、物品、世界观的 roster 与 entity，不含场景。

“证据覆盖”须定义为：base-r1 中该实体 artifact 的 `evidence[].unitId` 有多少比例落在新 `request.units` 中。两侧都基于同一份 `workingUnits`（`sentence-1000-v3` 是确定性的），可以计算。

**中3 · SS-07 的“与改前相同”无法照写执行，也缺少几种情形（527:13）。**
- “旧日志 resume”须用 NIW-C17 的做法给日志加上 `publication`（`tests/unit/novel-import-wizard-session.test.ts:91-93`），否则重启时草稿会被删除，测不到 resume。
- “hash 与改前相同”须对一份冻结的旧日志夹具，预先记录改前代码算出的 `importScopeHash`/`importPlanHash` 常量，再在改后断言。只在改后代码里前后比较一次，证明不了“改前”。
- 缺“新会话写入字段后 scope hash 确实变化”（证明字段计入了哈希）。
- 缺“新会话重启续跑后字段和哈希都不变”。
- 缺“`append` 追加来源不写入”（main:1509 的 `if(!append)`）。
- 缺“非向导会话（`options.wizard` 为假）不写入”。526 2.3 没有写明非向导是否写入，用例应固定为不写入，并回写方案。

**中4 · SS-08 和 SS-09 的边界与可行性（527:14-15）。**
- 运行门的取值对应：`characters=⌊(ctx−65536)/12⌋`。16,384 对应 262,144，40,960 对应 557,056，81,920 对应 1,048,576。须补 81,919（ctx=1,048,564，门关闭）和复审点名的约 600K（44,538，门关闭）。
- “非向导会话”无法到达 `runRoster`/`importEntity`，作为运行门用例没有意义；应改为门函数的纯单元测试，或并入中3（不写字段）。
- SS-09 的“单元 > 窗口一半”在真实工作单元中不会出现（`sentence-1000-v3` 每单元 ≤1000）。可以保留作为纯函数测试，但须补以下几种：总字数恰好等于 40,960 的窗口（包含边界）；300 个短单元被 `maxUnits` 截断；最后一窗不满；空单元列表。
- 补“主窗口已有 `maxUnits` 个单元”：此时 extra 为空，首次提及单元会丢失。用例须固定这种情况下的行为（接受，还是回退旧取文），并在 SS-SIM 中统计出现次数。

**中5 · SS-13 和 SS-14 没有固定“提及数”与截断语义（527:19-20）。**
- “提及数”是名称加别名出现的次数（现有代码用 `split(x).length` 计数，main:1283），还是命中的单元数？须写明。还须补：并列时取序号小者；别名互相包含（如“克莱恩”与“克莱恩·莫雷蒂”）时会重复计数；只靠 `evidenceUnitIds` 命中、正文中没有名称的单元是否计入。
- “首次提及单元”在代码中是 `hits[0]`。`hits` 包含 `cited` 单元（main:1276），所以 `hits[0]` 可能是一个只被引用、正文里没有名称的单元。须写明用例按 `hits[0]` 断言。
- 截断须断言 526 2.6.2 的“到首个溢出即停”：在第②类放一个会溢出的大单元，期望其后能放下的第③、④类小单元也不进入。还须断言一个单元同属多类时只按最高优先级出现一次。

**中6 · SS-16 的期望“与旧布局相同的结果”不成立（527:22）。**
新布局的 `units` 不排序，`characterEvidenceOptions` 按 units 顺序均匀取 8 项（main:136-145），取到的选项一般和旧布局不同，`optionIndex` 的含义也随之改变。期望应改为：给定同一模型回复（相对本次选项的编号或直接 quote），`accept` 与 `validateImportEvidence` 的通过或拒绝和旧布局规则一致；并按 R-L3 的要求，在固定输入下断言 8 个选项的确切 unitId 序列（先主窗口、后 extra 的顺序）。

**中7 · SS-20 的“44 项失败基线”无法追溯（527:26）。**
没有文档记录过 44 这个数。现有私有清单 `/private/tmp/shakeink-cache-522/fail-mod.txt` 与 `fail-2.txt` 各有 45 行 `✖`，`fail-base.txt` 有 150 行，而且都在易被清理的 `/private/tmp`。须改为：改前在当前分支上用 Node 24 跑全量 `npm test`，把失败用例的名称清单保存到私有证据目录（并入高1 的 SS-00）；改后按名称比较，不按数量比较。R-M4 要求的“逐个核对 37 个 wizard 夹具测试中断言提示词或 units 顺序的用例”也须列出核对清单作为证据。

**中8 · SS-REAL 的冷缓存前提须写成可检查的条件（527:28）。**
- 新布局首跑之前，任何对 DeepSeek 的新布局调用（包括调试）都会预热缓存。须写明首跑是新布局在 DeepSeek 上的第一次调用，并记录开始和结束时间供后台对账。
- 旧布局“冷基线”的提示词与 base-r1 相同。如果离 base-r1 时间较近，DeepSeek 缓存可能仍有效，所以这一次只能用于质量噪声估计，不能作为 token 冷基线。须在用例中写明。

## 低

**低1 · SS-02 应断言完整等式（527:8）。** 断言 `prompt === SHARED_HEAD+'<novel-import-data>'+payload+'</novel-import-data>'+说明`，其中“说明”= 旧提示去掉结尾 `'<novel-import-data>'+旧payload+'</novel-import-data>'` 后的部分（各构造器都以此结尾，payload.ts:61-158）。分隔符（是否有 `\n`）须写死。roster 的 `extra` 应断言为 `[]`。窗口单元序列化须断言只有 `id,start,end,kind,text` 五个键且顺序固定，不带 `fileId`/`part`。

**低2 · SS-03 应注明 entity 与 roster 的分叉点（527:9）。** roster 的序列化在窗口之后是 `],"extra":[]`，entity 是 `],"extra":[{`，所以“公共前缀 ≥ HEAD+窗口”成立。世界观 entity 须用 `world-setting` 候选（世界观节点不启用新布局）。另补一条：同一窗口在 `workingRevision` 变化前后是否逐字节相同，应以 SS-09 的重算为准。

**低3 · SS-04 应覆盖全部字段（527:10）。** 转义作用于整个新布局载荷，用例须让 `<` 同时出现在候选名称、资料目录（`instruction`）、资料切片中，而不仅是单元正文。

**低4 · SS-05 应改为精确等式（527:11）。** “±常数”应改成 `fixed_new = fixed_old + bytes(SHARED_HEAD)`（分隔符按低1 写死）。并取固定说明最长的请求（带 `evidenceOptions` 的角色 entity）断言 `fixed+16384 ≤ 65536` 仍有余量。

**低5 · SS-06 的结构边界（527:12）。** 补以下拒绝项：`version≠1`、多余键（strict）、窗口 `unitIds` 为空、`extraUnitIds` 与窗口重复。526 没有规定 roster 是否允许 `windows.length≠1` 或 `extraUnitIds` 非空，建议服务端拒绝，用例与方案同步。除 `generate` 外，还须断言 `resolve` 也是 0 次（校验发生在 `deps.resolve` 之前，service:1081-1084）。

**低6 · SS-11 和 SS-12 的构造方法（527:17-18）。** SS-12 须写明如何确定性地造出“前半已 coverage”：用 AI 桩控制回复，并在第二个子批开始前 `pause`；或者写入带 `publication` 的日志后重启。须写明相邻两窗都残缺时，剩余单元是逐窗进入 `importStageBatches`，还是合并后再分批。SS-11 补一条：子批再次失败时继续对半拆分，单单元按 `ROSTER_UNIT_ATTEMPTS` 重试，全程不带 `sharedSource`。

**低7 · SS-17 补 entity 二次调用（527:23）。** main:1316 只改 `task.instruction`。须断言二次请求与首次请求的公共前缀覆盖 HEAD 加全部窗口和 extra，一直到 `task` 内的 `instruction` 之前。

**低8 · SS-18 和 SS-19（527:24-25）。** SS-18 补“加入 `layout` 后最长一行仍 ≤768 字节”（service:640，超长会被静默丢弃），以及场景请求记为 `null`。SS-19 除解析器单元测试外，还须实际运行一次 `scripts/verify-novel-import-close-states.mjs`。

**低9 · 台账与保守版本。** 526 §0 要求把 ≥90% 目标的变更写入 `requirements-traceability.json`，527 没有对应检查项。§3.3 的“回退保守版本”一旦触发，需要另一组用例（只有 roster 改布局、entity 金样不变），建议预留编号。2.6.4 要求的“目录项长度变化”应列入 SS-SIM 和 SS-REAL 的报告项。

## 金样方案（SS-01）评价

方向可行：R-L2 要拆分构造器，改前逐字节冻结是验证旧布局不变唯一可靠的办法。只要提示词不含时间或随机量（`importAiPrompt` 不读 `operationId` 和时间），结果就是确定的。不足见中1：还须冻结控制器层的请求轨迹，补齐请求类型，使用真实的请求形状，加入特殊字符，并在改前提交上生成。

## SS-REAL 质量门的可测性

| 指标 | base-r1 能否提供 | 说明 |
|---|---|---|
| 条目数 ±5% | 能 | `session.json` 的 `artifacts`，按 kind 统计 |
| facts 字段数均值 | 能 | 须定义“已填” |
| evidence 条数均值 | 能 | `artifacts[].evidence.length` |
| text 长度中位 | 能 | |
| 纠错代次率 | 能 | `app-stderr.log` 的 `import-usage`，须按 `intent:kind` 和 `op` 统计 |
| 证据拒绝率 | **不能** | 日志中没有该原因，见高2 |
| 失败/重试 | 能 | `tasks[].attempts` 全为 0，另看驱动日志 |
| 新书口径命中 | 仅离线 | 依赖中2 的口径 |

前提是 base-r1 数据先按高1 保存好。

## 判定

**修改后通过。** 高1–高3 补齐后可以进入 TDD 实现：先保存 SS-00 证据，再修正 SS-REAL 的质量门口径，再补写复审要求的用例。中1–中8 须在实现前写入 527；低项可以在实现中一并处理。
