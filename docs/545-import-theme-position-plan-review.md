# 545 方案独立审核：导入主题定位

审核对象：`docs/545-import-theme-position-plan.md`。基线是 542 未提交的工作区代码。本次只读审核，没有运行构建、测试或应用。

## 已核实

- 契约现状（`desktop/core/novel-import-ai-payload.ts:193`）：channel 允许“不限”（“无法判断时用不限”），genre 允许“全部”，synopsis 规则是“讲清主角、处境、核心冲突与看点，不剧透结局”，上限取 `IMPORT_THEME_PROFILE_LIMITS.synopsis=500`（`desktop/core/novel-import-semantics.ts:64`）。方案第 1 节的描述与代码一致。
- 修复现状（`desktop/service/novel-import-ai.ts:1325-1345`）：频道不合法时清除 channel/genre/tags（:1333）；题材不属于频道时清除 genre/tags；最后按 tags → genre → channel 的顺序逐级清除，直到解码通过（:1343）。清除后条目仍算有效，不会触发纠错。卖点、受众、简介可以缺省。与方案描述一致。
- 定位样本（`desktop/main/novel-import.ts:1073-1077`）只取主题引文所在单元，按书序排列；只有在没有引文单元时才退回 `units.slice(0,1)`。“不保证包含开篇”的判断成立。
- 重跑（`desktop/main/novel-import.ts:1086-1091`）：失败后只重跑 1 次，且只对 `worldEntryRerunnable` 匹配的错误重跑。IQ-38 断言共 2 次请求（`tests/unit/novel-import-result-quality.test.ts:125`）。
- 发布（`desktop/service/novel-import-publish.ts:124-133`）：有定位简介时写定位简介，否则把推断主题正文拼接后截到 `THEME_SYNOPSIS_LIMIT=5000`（:45）；channel 只在定位有频道时写入。与方案描述一致。
- 分类表（`src/lib/creation-wizard/taxonomy.ts:33-36`）：男频、女频都有“现实”“轻小说”，其余题材只属于一个频道。“题材只属一个频道时由题材推出频道”在数据上可行。`genresForChannel('不限')` 返回两个频道的并集（`filter.ts:31-33`），因此 channel 为“不限”的值今天可以通过 `positionError` 校验。
- 纠错机制：设置通道调用 `generateJSON` 时没有传 `repair`，所以 `maxGenerations` 取默认值 2（`src/lib/ai/generate.ts:205`），即每次尝试只有一轮纠错。每轮生成都会先经过 `repairSettingsReply`（`novel-import-ai.ts:731`），再交给严格 schema。纠错反馈每条最多 250 字、最多 6 条（`generate.ts:278`）。
- 发布测试夹具（`tests/integration/novel-import-result-quality-publish.test.ts:27-32`）构造的会话没有 `wizardVersion`，所以 IQ-41/42/43 走的是“非向导旧会话”分支。
- `tests/fixtures/novel-import-prompt-golden.json` 不含 `theme-profile-contract`，修改契约不影响提示词金样。

## 问题清单

### 高

**H1. 必填检查放进 superRefine 后能触发纠错，但纠错依据的是未修复的原始回复，而且现有的逐级清除会和必填检查冲突。**
证据：`repairSettingsReply` 用 `single=importAiResponseSchema(request)` 判定每个条目（`novel-import-ai.ts:1275,1280`），这个 schema 就是带定位 superRefine 的同一个 schema（:560-564）。新的必填检查不通过时，条目会被 `settingsItemValid` 丢弃，`kept` 为空，函数返回 `undefined`（:1289），随后严格 schema 校验的是模型的原始文本，而不是修复后的文本。由此产生三个后果：
1. 纠错反馈混入原始回复的其它错误，例如无法定位的引文（`no-match`）、超长、非字符串的 facts。这些问题本来已经被机械修复，现在又被当作错误报回去。542 真实运行中出现的 `模型证据无法定位（no-match）` 和 `artifacts.0.facts` 很可能就是这样被掩盖的：其它字段不合法导致条目被丢弃，严格 schema 再报出它碰到的第一个错误。
2. `repairThemePosition` 最后的逐级清除（:1343）会删掉 channel 和 genre，删完后的条目一定过不了新的必填检查，所以这个修复从“降级保留”变成了“丢弃整个条目”。tags 不合法这种可以纯机械修复的情况，也会因为清掉 genre 而失败。
3. 修复计数（`clearedPosition`）随条目一起丢失。

修改建议：
- 定位请求不再走“丢弃条目”这条路。对于 themeProfile，即使必填检查失败，`repairSettingsReply` 也返回修复后的文本，让严格 schema 针对修复后的条目报出准确的缺失字段。
- 逐级清除只保留“清 tags”（`tagAllowed` 过滤之后仍不合法时清空 tags）。不再清 genre 和 channel；genre、channel 不合法时交给纠错轮处理。
- 加单元测试：(a) 修复后缺卖点，纠错反馈只提卖点，不提引文；(b) tags 不合法但 channel/genre 合法时，条目保留，不进入纠错。

**H2. 纠错反馈和契约以外的说明仍然允许“不限/全部/省略”。**
证据：`IMPORT_THEME_PROFILE_GUIDANCE`（`novel-import-ai.ts:384`）写的是“channel只能为男频/女频/不限，genre只能取该频道题材候选或全部……synopsis不超过500字；不确定的定位字段省略”。superRefine 解码失败时把它作为反馈发给模型（:563）。方案 3.2 只说“反馈文案指出缺哪个字段”，没有改这段文字。
修改建议：把这段说明改成与新契约一致：频道只能是男频/女频，题材必须具体，三个文字字段必填，简介不超过 300 字、15 行。必填检查各自给出单独的 issue（path 指向 `facts.channel` 等），并把具体缺失放在消息开头，因为每条反馈会被截到 250 字。

**H3. 失败路径仍然不满足用户的要求 3 和 4；本地兜底的位置和依据也有问题。**
证据：
- 方案 3.4 明确写了兜底“genre 保持全部，tags 为空”，卖点、受众也保持为空。也就是说，三次尝试都失败时，用户截图中的问题（题材为“全部”、卖点和受众为空）仍会出现。只修好了频道。
- 只导入主题时，`byKind('character')` 为空，兜底第 1 步（主角性别）永远没有数据。只有第 2 步（代词比例）起作用。
- 统计“他”和“她”时会把“其他”“他们”“她们”“他人”这类词也算进去。方案没有定义要统计哪些词。
- 兜底在发布时现算，结果不进入会话和 `importPlanHash`，导入记录快照里也没有“频道由本地规则推断”的标记。`scripts/audit-real-novel-import.ts` 和 `scripts/audit-lotm-local-import.ts` 只能把这条规则再实现一遍才能核对。
- `recordSettingsRepairs` 的提示文字“频道、题材、标签、卖点与受众已留空”（`desktop/main/novel-import.ts:1103`）在写入兜底频道后就不准确了；改成简介留空以后，这段提示也没有提到简介。

修改建议：
- 兜底放在主进程 `importThemeProfile` 失败之后执行，生成一个只含 channel 的定位产物（schema 2，固定 id）。这样它进入会话和计划哈希，审核脚本直接读产物即可，发布不需要知道这条规则。
- 代词统计排除“其他、其它、他们、她们、他人、她人”等，并写成单元测试。
- 方案应明确：失败路径不满足题材、卖点、受众的要求。可以选一种做法：(a) 失败后再发一次精简请求，只要 channel/genre/sellingPoints/targetAudience，不要引文和简介，降低失败率；或 (b) 在向导结果页把主题任务标成“部分完成”，请作者处理。不论选哪种，dropped 提示都要准确列出哪些字段为空。
- 验收要统计真实运行中定位失败的次数。成功率本身就是验收指标，“至少跑 2 次”不足以说明稳定性。

**H4. 向导会话“无定位时简介留空”会让推断出的主题正文从产品中消失。**
证据：推断出的主题在发布时只有一个去处，即 `synopsis`（`novel-import-publish.ts:125,129`）。主题面板没有其它字段承接它们（`src/components/content/ThemePanel.tsx` 只有 synopsis、referenceCases 等字段）。方案 3.4 改动后，定位失败时作者在作品里看不到任何推断主题，只能在导入记录快照的 materials 里找到。用户的要求是“简介精简”，不是“删掉主题资料”。
修改建议：二选一，并在方案中写明理由。(a) 失败时简介取推断主题的开头部分，截到 15 行、300 字，并在 dropped 中说明；(b) 保留现在的拼接行为，只把截断上限从 5000 降到 300 字、15 行。不建议直接留空。

### 中

**M1. 审核脚本与改动不一致（`scripts/audit-lotm-local-import.ts` 在 542 时就已经不一致）。**
证据：
- `scripts/audit-real-novel-import.ts:161-162` 要求“无定位时简介等于拼接主题（截到 5000 字）”。向导会话改为留空后，这项检查会失败。
- `scripts/audit-lotm-local-import.ts:185-192` 把 `channel/genre/tags/sellingPoints/targetAudience` 写死为空，`synopsis=joined('theme')`。而它的 `projectSession`（:36）不保留 `wizardVersion`，脚本因此分不清是不是向导会话。542 引入定位以后，一次成功的真实 LOTM 本地导入就会触发 `NATIVE_THEME_ROW_MISMATCH`；545 会把这个问题扩大。
- `tests/unit/lotm-local-import-audit.test.ts:105` 的期望值也写死为空。

修改建议：方案第 4 节列出这三个文件，并给出新的期望规则：有定位产物时取产物的字段；无定位产物时，向导会话按 H4 选定的规则，旧会话保持拼接。

**M2. 样本调整的预算顺序和 IQ-37 的不变量需要写清楚。**
证据：现在的循环（`novel-import.ts:1075`）在第一个放不下的主题处停止，并要求每个上下文主题保留的那条引文所在单元都在样本中（IQ-37 断言，`tests/unit/novel-import-result-quality.test.ts:116`）。开头单元先占预算以后，能放进去的主题会变少。方案说“预算不够时先减主题，再减开头单元（至少保留 1 个）”，但没有说明：减掉开头单元时，只被开头单元引用的主题要不要一起删；`requestFits` 不通过时是逐个减还是按某个顺序减；最多 6 个单元是否还受 `budget.maxUnits` 约束。
修改建议：写成确定的算法：先放开头 k 个单元（k 从 6 往下减），再按书序加主题，每加一个主题都用 `fits(sampleUnion, artifacts)` 检查；保持“每个主题的引文单元都在样本中”。补测试：(a) 样本以 `units[0]` 开头；(b) 预算很小时只保留 1 个开头单元，主题全部去掉，请求仍然发出。另外，“开头”应理解为已选章节正文的开头（`workingImportUnits` 的第一个单元），方案里应写明。

**M3. 简介超过 300 字时按字符截断会产生半句话；15 行的含义不清楚。**
证据：方案 3.2 沿用了 q-r8 的截断方式（`novel-import-ai.ts:1340`）。对 2000 字的卖点，截断可以接受；但简介是给作者看的成品文字，截在半句会很难看。“15 行”可以理解为换行符分隔的行数，也可以理解为面板中显示的行数（Textarea `rows={4}`，可以自动换行）。300 字的上限通常比 15 行更早起作用。
修改建议：简介超过 300 字或超过 15 行时，放进必填检查，由纠错轮处理。只有最后一次尝试才在句末标点处截断。在方案中明确“行”指换行符分隔的非空行，并说明 300 字是主要约束。

**M4. 题材判定规则与引用的对照来源互相矛盾，验收也没有对题材给出期望值。**
证据：方案第 2 节引用维基百科“起点把《诡秘之主》归为玄幻”作为对照，但 3.1 的定义把“西方式魔法或神秘学、蒸汽朋克、克苏鲁式神秘”都划给奇幻，按这条定义 LOTM 会判为奇幻。第 5 节只要求“不是全部”。所以 q-r10（玄幻）和 demo-6（奇幻）两种结果都算通过，“结果漂移”的问题没有可检验的目标。
修改建议：先确定 LOTM 的期望题材（建议核对起点的实际分类后写入方案）。验收要求同一输入多次运行得到同一个题材。如果坚持奇幻，就删掉“起点归为玄幻”这条对照。

**M5. 由题材推出频道的修复要插在现有分支之前。**
证据：channel 缺失但有 genre 时，现在走 `else clear('genre','tags')`（`novel-import-ai.ts:1338`）；channel 为“不限”时，走 `genresForChannel('不限')` 返回并集的分支（:1334-1336），不会被当作不合法。新的“推出频道”修复必须在这两个分支之前执行，否则 genre 会先被清掉。
修改建议：方案写明执行顺序：先规范 channel（不限或缺失时由题材推出），再进入现有分支。补测试：channel 为“不限”加题材“玄幻”得到男频；channel 缺失加题材“纯爱”得到女频；题材为“现实”时不推断，交给纠错。

**M6. 失败重跑次数加到 3 次后，最坏情况的请求数和耗时没有评估。**
证据：每次尝试最多 2 次生成（`maxGenerations=2`），3 次尝试最多 6 次模型调用。定位请求在主题任务中串行执行，并且一直占用设置通道（`lane.acquire(true)`，`novel-import.ts:1084`）。
修改建议：在方案中写明最坏情况下的耗时上限，并在真实运行中记录每次运行的尝试次数（`settings-batch-fail` 的 attempt 字段现在只取 1 或 2，类型 `1|2` 需要扩展）。

### 低

- **L1.** `IMPORT_THEME_PROFILE_LIMITS.synopsis` 保持 500，新常量 `IMPORT_THEME_PROFILE_REQUEST_SYNOPSIS=300` 只用于请求阶段。契约文字和修复截断都要改用新常量，否则提示词仍会写“不超过500字”（`novel-import-ai-payload.ts:193` 当前插入的是 LIMITS 的值）。
- **L2.** 验收用来判断“后段剧情”的关键词“贝克兰德”可能误判：它是该世界的首都，介绍世界观时可能正当提到。建议改用“邓恩牺牲/死亡”“复活”“前往贝克兰德”等事件性词，并由人工复核截图。
- **L3.** 方案没有提到更新 `docs/requirements-traceability.json`，也没有说明测试用例文档和审核步骤（AGENTS.md 规定的顺序）。该台账常有未提交的条目，修改时只追加，不要 checkout。
- **L4.** 新增的向导会话发布测试需要满足 `validateImportWizardState`（`novel-import-publish.ts:54-55`），现有的 `input()` 夹具做不到。建议改用 `tests/helpers/novel-import-wizard-fixture.ts` 跑一次端到端发布，或者为夹具补齐最小的 wizard 状态，并在用例文档中写明。
- **L5.** 方案中 q-r7、q-r8、q-r9、q-r10、demo-4、demo-6 的结论（读回 2898–3193 字、demo-6 简介含邓恩牺牲等）在 542/543/544 文档中没有找到对应记录。请附上证据路径（隔离根下的运行目录或读回文件），符合“新增结论必须有证据”的规定。

## 结论

方向可以采用（方案 C：标签定义、先线索后结论、必填加纠错、本地兜底）。但当前方案有两类问题：

- 机制上不能按预期工作（H1、H2）：必填检查会和现有的丢弃条目、逐级清除逻辑冲突，纠错拿到的是原始回复的混杂错误，反馈说明仍然允许“不限/全部”。
- 失败路径没有覆盖用户的要求（H3、H4）：题材、卖点、受众仍然为空；推断主题正文会从产品中消失。

修订 H1–H4，并补上 M1（审核脚本）、M2（样本算法）、M4（LOTM 题材期望值）之后，再进入测试用例阶段。
