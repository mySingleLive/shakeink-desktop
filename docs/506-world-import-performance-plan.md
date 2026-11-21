# 506 · 导入世界观提速与设定类型标识方案

日期：2026-11-04。用户要求：①导入世界观提速，《诡秘之主》第一卷全部世界观（含全部设定）导入 ≤1 分钟，参考角色/场景/物品提速方案；②第16步“导入世界观”每张卡片标明设定类型（世界本身、势力、等级体系、力量体系、概念等），每种类型不同图标。用户截图：243 项，4 路并行，全部为地球图标、无类型。

## 1. 计时口径

从第15步“识别世界观”点击“导入 N 项世界观”开始，到第16步全部任务 done、向导离开 import-world 为止，单调时钟，≤60000 ms。包含主题/文风/金手指/爽点泪点四项其它设定任务（同一步）。第15步识别不计入，另行记录。每轮新 session，默认全选。数量取本轮真实识别结果（503 第6轮为 240 项）。

## 2. 已证原因（与 493 物品相同的四处）

| 位置 | 事实 |
| --- | --- |
| `desktop/main/novel-import.ts:824` | world 用 `WIZARD_ENTITY_CONCURRENCY=4`；角色/场景/物品为 31。 |
| `desktop/service/novel-import-ai.ts:998` | `lightImportGeneration` 不含 world entity：走聊天共用长任务队列（默认 2 路）并继承模型默认 thinking。 |
| `desktop/main/novel-import.ts:1523` | 运行时 scopeHash 缓存不含 world entity，每次请求重算整书散列。 |
| `desktop/main/novel-import.ts:762` | `coalesced` 不含 world，每个结果可能触发一次完整 journal 写入。 |
| `desktop/main/novel-import.ts:1045-1047` | world 的 instruction 目录携带全部已选世界与设定（240 项）；物品/角色只带目标及本材料出现的名称。 |

另：设定任务 `dependsOn` 所属世界（`:1018`）。主世界只有一个，其 200+ 设定须等主世界导入完成才开始；这是必要的顺序（设定的 worldId 外键），保持不变，但主世界须最先领取。

## 3. 修改

1. `WIZARD_WORLD_CONCURRENCY=IMPORT_RUNTIME_MAX_CALLS-1`，`runEntities(kind='world')` 使用。主题/文风等 settings 任务同池。
2. `lightImportGeneration` 包含 semantic v1 / analyze / entity / world：同一轻量模型策略与导入调度通道。普通 world analyze、review/reconcile 不变。
3. 运行时 scopeHash 缓存扩展到 verified 的 world entity。
4. `coalesced` 包含 world。world 结果仍经 `mergeImportArtifacts` 合并。
5. world instruction 目录裁剪：只保留目标、目标的所属世界/上级世界，及当前 units 出现其名称/别名的已选项。`request.entities` 仍为完整已选目录。
6. 任务领取顺序：可领取任务中，WORLD 节点优先于 SETTING（`next()` 中按 kind 排序），使主世界首批发出。

不改：world 提示与字段契约、证据规则、units 选取、依赖、暂停/取消/重试语义；不给 world 加 evidenceOptions。

## 4. 设定类型标识（UI）

- 第15步识别清单树与第16步导入卡片：每项显示类型标签与类型图标。世界节点标签“世界”、`Globe` 图标；设定按 `settingType` 取标签（沿用 `SETTING_LABELS`）与图标。
- 图标复用 Web 工作台 `src/stores/tabs.ts` 的 `SETTING_TYPE_ICONS`（LEVEL_SYSTEM Layers、POWER_SYSTEM Zap、CONCEPT Brain、MAP Map、FACTION Flag、SOCIETY Landmark、CULTURE ScrollText、GEOGRAPHY Mountain、WORLD_HISTORY History），导出为具名常量供向导使用，保证与工作台一致；不改其取值。
- 主题/文风等其它设定任务卡片保持 `Sparkles`。
- 不改布局、分组与文案以外的样式。

## 3R. 独立审核后的修订（以本节为准）

审核见 `506-world-import-performance-plan-review.md`，全部采纳。用户 2026-11-04 选择：四项其它设定“并行且保留思考”，计入 1 分钟。

1. **四项其它设定（高1、中3）。** `importSettings` 的各批不再逐批串行：每批成为同一步任务池中的一个独立工作项，与世界任务共用 31 路名额（总在途 ≤31，低于运行时证据上限 32）。各批经导入调度通道发出（不占聊天长任务名额），但**不**使用轻量模型策略：保留模型默认思考档位，分析质量不变。批次之间无依赖（`contextArtifacts` 只读 `s.artifacts`），全部批次完成后该类任务才 done，结果合并顺序按批次原顺序。`stageRequests` 分批在每次尝试开始时计算一次（不在规划时缓存，因批次内容取决于当时的 `s.artifacts` 与预算；507 审核 6）。
2. **world 纠错（高2、中1）。** world entity 单次纠错增加两类：模型证据 no-match 等四类定位错误，与“JSON 不可解析/输出未完整结束”。条件为独立的 `worldRetry=kind==='world'`，不复用 `indexed`：world 请求不含 evidenceOptions，重试提示保留“sourceUnitIds 与 evidence.unitId 逐字复制”文本。
3. **目录裁剪（中1）。** 独立条件 `trimmed=indexed||kind==='world'`；world 目录保留目标、目标 `parentId` 链上的世界、及当前 units 出现其名称/别名的已选项（候选不含设定之间的上级关系；507 审核 7）。
4. **领取顺序（中2）。** 第6项保留（无害），不作为提速依据。E2E 单独记录主世界请求的单元数、字数和耗时，以及每个请求的耗时分布、重试次数和失败类别（驱动自行采集，不依赖 runtime.json 的 64 条窗口）。
5. **旧测试（低1）。** CP-02、SP-01、item-performance `:70` 中 `{kind:'world'}` 的断言改为 world entity 走轻量策略；item-performance `:38` 改为断言 world 并发；`WIZARD_ENTITY_CONCURRENCY` 无使用者后删除；`novel-import-ai.ts` 轻量策略注释同步写明含世界观。
6. **图标（低2）。** 复用已导出的 `getTabIcon`（世界 `{type:'world'}`，设定 `{type:'setting',settingType}`），不修改 `src/stores/tabs.ts`。标签沿用向导 `SETTING_LABELS`（势力、概念、地图、地理等短标签，与用户举例一致），世界节点标签为“世界”。第15步识别树：类型标签前加对应图标；第16步卡片：左侧图标改为类型图标，名称后加类型标签（`ni-w-tag`），条件为 `candidate.kind==='world'` 或 `'world-setting'`；四项其它设定保持 `Sparkles` 与原标签。
7. 行号更正：设定依赖在 `novel-import.ts:1025-1028`。

## 3R2. 用例审核后的修订（507 审核）

1. 共享名额优先给世界条目；四项其它设定的批次最多同时占 `WIZARD_SETTINGS_BATCH_LANES=8` 路，其余 23 路留给世界条目（审核 1）。
2. 出现全局错误后，所有等待名额者立即被拒绝，拿到名额后也先检查停止，停止后不再发出请求（审核 2）。
3. 某项设定一批失败或作者跳过该项后，其排队批次不再发出（审核 3、5）。
4. 一个设定任务的全部结果在副本上合并、整体采用；合并失败时恢复原状并标记失败，不会部分保存或被后续结果改回 done（审核 4）。
5. 运行中跳过、结果为空的设定任务保持 skipped，不写入 notFound（审核 5）。

## 3R3. 主世界请求裁剪（E2E world-r7…r9 后）

主世界节点只需简介，导入请求最多读取其引用正文的 `WIZARD_WORLD_NODE_CHARACTERS=6000` 字，不再占满一整批；设定仍用完整批次（WP-16）。

## 3R4. 设定不再等待所属世界（用户选择）

1. 设定的 worldId 来自清单，导入前已确定，因此设定任务不再 `dependsOn` 所属世界，与主世界同时开始；子世界仍等待上级世界。所属世界失败时步骤停在等待作者（失败项未处理不能继续）：重试世界即可；跳过世界时，连同其子世界及全部设定一并跳过，已导入的设定结果移除，因此不会产生指向未导入世界的设定（否则步骤结束时引用校验报“导入实体引用类型或归属无效”）。取代 §2 末段“设定须等主世界导入完成”与 WP-02 的原表述（NIW-C26、NIW-C27 已改）。
2. world-r10（238 项）中主世界单次请求 27.7 s，其余设定 2–7 s。依赖去除后主世界不再是串行前缀。
3. 四项其它设定任务在可领取任务中最先领取，其批次立即开始（仍受 8 路上限），不再排在全部世界条目之后。批次在世界资料提交前规划，其上下文因此不含世界设定（509 审核 3）。
4. world-r10 的失败 `模型返回结构不完整（artifacts）`（无字段后缀）也进入 world 单次纠错，与 `artifacts.0.facts` 等同样附带结构提示（WP-07c）。

## 3R5. 世界设定内容结构（E2E world-r13…r16 诊断）

world-r14/r16 的调试诊断（只记已知字段名、校验代码与值类型，不含模型输出）显示，world 设定 `facts` 校验失败主要两类：FACTION 的 `relations` 返回数组（r16 60 次），POWER_SYSTEM 等文本类型的 content 用了 `text` 以外的键（r16 36 次）。单次纠错多数能修好，但每轮仍有 1–2 项二次失败，世界观步骤停住。

1. 仅 world entity 请求的提示增加 `<world-setting-content-contract>`，逐类型写明 content 解码后的键与字符串类型。其它阶段与类型的提示字节不变（IC-04/05 只更新 world 基线）。
2. 服务层纠错反馈先写具体失败（如“content.factions.[].relations须为字符串，收到array”），再附原结构说明；原说明 337 字超过 250 字截断。
3. 调试开关下记录 `world-facts-reject` 诊断行。
4. world-r17/r18：契约加入后 `facts` 拒绝由每轮约 110 次降到 2–4 次，剩余是文本类型（POWER_SYSTEM、MAP 等）缺 content 或用了 text 以外的键。文本类型缺 content 而 artifact.text 非空时，服务层按来源复制已有的映射补 `content={text:artifact.text}`；FACTION/CONCEPT/LEVEL_SYSTEM 及其它形状仍走严格校验与纠错（WC-01…04）。world-r22 中 17 项 POWER_SYSTEM 返回 LEVEL_SYSTEM 结构（scope/form/levels/pathways），契约补一句：POWER_SYSTEM 的分级或分支写成文字放入 text（措辞不含具体作品用语，WR-P03）。多余键的纠错反馈列出已知键名，并说明文本类型只有 text 一个键。
5. world-r19：WORLD_HISTORY 返回 `content={"text":""}`（“缺少原生可见实质内容”）两次。文本类型 content 恰为只含空白 text 的单键对象、且 artifact.text 非空时，同样以 artifact.text 补全（WC-01b）；其它形状不动。

6. world-only-r1：一项 FACTION 首次与重跑均报 `artifacts.0.facts` 且无内容诊断，即 facts 记录类型失败（值非字符串）。content 为对象或数组时按原值无损 `JSON.stringify` 后再严格校验；其它非字符串 facts 不转换（WC-05）。调试开关下记录 `world-facts-types`（已知字段名与值类型）。
7. world-only-r2/r3：`world-facts-shape` 诊断显示 world 回复中 `facts` 本身常以 JSON 文本返回（r3 中 326 次，几乎全部经纠错后通过；唯一失败项属此类）。与 b7d4e33 对工具入参的处理相同：`facts` 为字符串且能解码为普通对象时还原一次，再严格校验；解码失败或非对象仍走纠错（WC-06）。
8. world-only-r4/r5：r4 唯一失败为证据 no-match（纠错与重跑后仍失败，未改证据校验）；r5 中 238/241 完成，唯一失败为 LEVEL_SYSTEM（form 与 levels/pathways 不符 20 次、scope/form 取值无效 14 次）。world 内容契约补 LEVEL_SYSTEM 的六键、取值与 SINGLE/MULTI_PATHWAY 的填写规则；纠错反馈对这两类给出对应说明。

## 3R6. 世界条目自动重跑一次（用户选择，2026-11-04）

world-r13…r20 每轮约 220 项中仍有 1–2 项在单次纠错后再次失败，且每轮形状不同（FACTION relations、文本类型多余键、WORLD_HISTORY 空内容、证据定位等），世界观步骤因此停住。用户选择：世界条目在纠错后仍失败时，自动从头重跑一次（同一名额，含其自身的一次纠错）；仍失败才停下等作者。只对模型输出类失败（结构不完整、JSON 不可解析或未完整结束、证据无法定位、归属或上级与清单不一致）重跑；授权、网络、取消、存储等错误及全局停止后不重跑。验收仍为零 failed/skipped（WP-07b、WP-19）。

## 5. 验证

- 单元/控制器：world 31 路实际在途并全部完成；轻量策略只覆盖 world entity；world 走导入通道不被聊天名额阻塞；scope 只算一次；instruction 目录裁剪但完整 entities 保留；既有 NIW-C26/C27/C10 不变。
- 浏览器：导入卡片与识别树显示类型标签与对应图标（每种类型图标不同）。
- 全量 `npm test`（与基线对比）、typecheck、`build:desktop`。
- 真实 E2E：第一卷，角色→场景→物品→世界观默认全选。通过：物品导入 ≤30 s 零失败（回归）；世界观导入 ≤60 s，全部任务 done、零 failed/skipped；截图核对卡片类型与图标。
