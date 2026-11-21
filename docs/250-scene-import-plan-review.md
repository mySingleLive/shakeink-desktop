# 场景识别修复：独立方案审核

日期：2026-10-31。审核者：独立子代理 `scene_review`。仅阅读方案及相关产品源码；未读取真实小说、配置、Key 或真实 journal，未修改产品代码。

## 结论

**场景专属 roster 提示、安全诊断及整书定向验收方向通过；实现前须删除或证实第3项“交叉别名导致场景吞并”的假设。** 当前源码不支持把角色 ID 修复直接扩展到场景，不能仅为预防问题扩大修改范围。

## 源码核对

1. `desktop/core/novel-import-ai-payload.ts:86` 的普通 semantic 返回串确实在 roster 名称清单合同后拼接所有类别 `semantic-native-contract`，其中场景使用 entityType、parentId；roster schema 在 `desktop/service/novel-import-ai.ts:31,45` 严格接受名称清单的 name/aliases/parent/evidence。限定在 semantic/analyze/roster/scene 返回专用提示合理；应在测试中冻结其它阶段提示，且继续允许服务既有合法可选 evidence，不必为提示收敛而缩小服务可接受结构。
2. `src/lib/ai/generate.ts:246` 的根路径为 `''`，构造函数 `:211` 用数组长度决定添加括号，所以确能产生“模型返回结构不完整（）”。空路径只能证明错误位于响应根级，不能据此认定具体模型字段或具体错误值；提示混杂是明确的源码问题，但截图所涉具体返回形状仍应表述为待真实验证。场景 roster 的静态标签应只在服务层该阶段转换，不修改全局生成器，不回显未知字段和值；取消、网络、授权、JSON无法解析、输出未结束等原异常类别继续原样传播。
3. **需修订：场景当前没有按别名重新合并。** `desktop/core/novel-import.ts:240` 对 semanticVersion=1 的 scene/world 直接比较 `importSemanticIdentity`；该函数在 `desktop/core/novel-import-semantics.ts:235` 使用场景 name、PLACE 类型和 parentId（无别名）。角色别名分支仅在 character 生效。候选清单又先按规范名称/可信别名聚合，普通场景导入请求还绑定候选 ID/name/kind，并由 `validateSemanticLinks` 约束 parent 身份。计划的“两个已选场景交叉别名吞并”不能作为已证根因。建议本轮不改 scene 提交路径；增加完成 ID 集合断言用于真实验收。若能先产生真实可达的 RED 反例，再以该反例补充最小方案和独立审核。

## 用例及真实验收补充要求

- 固定 schema 的根对象多余字段、数组根、缺 roster、非法条目/parent/null/空名、合法省略 parent 均有测试；首轮错误第二轮修正成功、持续错误恰好两轮且返回静态诊断。消息净化使用合成敏感标记，未知键、模型值和反馈不得外泄。
- roster 恢复行为须覆盖失败前成功批次保留、失败批次不计 coverage、重新识别只补未覆盖单元、最终清单合并与单位覆盖完整。不要通过清空 stash 或把失败计为 done 来通过。
- 正常 UI 只推断 scene、全章选择、默认全选场景适合本轮范围；记录其它类别未执行。整书识别 coverage 和 candidates/tasks/artifacts ID 集合相等是必需的结构完整性证据，但不能自动证明所有文学地点均已被模型发现，结论应区分二者。
- 发布和重开后核对数据库场景数量、ID/名字对应、父级结构与四个业务资料字段（exteriorDescription/interiorDescription/backstory/entryMethod）保留，不以 journal 非空替代已落库证据。实际缺失或模型错误保留现场、修复后再验收；不能以取消/跳过场景获得通过。
- 建议额外用隔离副本保留的失败检查点验证“重新识别”恢复入口，因为用户报告的是既有导入的第11步失败；不在真实用户目录注入 journal、不擅自修改原任务状态。

本审核未运行模型或宣称真实导入通过。

## 修订复审

同日复审修订后的250方案：已删除未证实的交叉别名场景吞并结论和提交算法变更；改为通过 controller/service 多批测试与真实 ID 集合核对验证现有路径。**修订技术方案通过**，可以继续用例审核和按用例开展 RED；真实失败若需要扩大产品修复，另补充证据与方案。

## R4可选parent:null修订方案审核

同日阅读250新增R4段落。主代理报告真实固定诊断为“上级地点为空值”，来自前次已独审的路径及Zod `received null` 全字符串匹配。本审核未读取真实响应或私有现场，不独立认证该次真实计数。

**方案修订通过。** 在场景名称清单中，parent本身可选，未知上级的JSON null与省略该键表达同一关系缺省状态；仅将这一个已确认wire形式映射为canonical无parent，不改变任何有效父关系、实体身份或事实内容。应保持严格条目/根对象校验，不能用catch/default或宽泛真假判断把空串、数字、对象、数组、过长名称等非法有值关系一概清空；也不扩展world清单、character、scene实体或一般分析。

实现应在相同响应schema的生成解析与最终解析两处一致生效，并输出真正省略的parent键；仅字段preprocess成undefined可能保留自有键 `parent:undefined`，需要用例明确检查 `Object.hasOwn(...) === false`。合法字符串仍沿用既有trim规则，name/aliases/evidence和其它严格规则保持。`mergeWizardRoster` 的 `g.parent ??= e.parent` 不会用缺省parent清除已有有效父级；不得为兼容null改变该行为。提示可以继续优先要求未知上级省略，服务提供有限兼容。

这项批准只覆盖有真实类型证据的null兼容，不覆盖此前未证实的空白值兼容或任何无界重试。R3/R4原失败结论保留；实现后需RED/GREEN、代码复审及新会话全文真实重测。

## R5执行调度修订方案审核

主代理报告R5已识别全书场景、进入千项导入长批，当前场景生成受默认聊天长任务槽限制。只审核250新增执行调度方案及相关现有源码，未读取该真实现场。

**有界调度修订方案通过，以下边界作为实施与用例要求。** 复用既有导入调度和角色慢写合批机制可以改善长批执行，且不改变候选、材料、提示、生成能力或数据接受规则；用户没有本次时间目标，不应新增时间阈值或用吞吐代替完整性验收。

- `lightImportGeneration` 目前同时用于模型轻量策略与导入lane选择；新增scene lane必须使用独立predicate，`importGenerationModel(scene entity)`仍返回原resolved对象、providerOptions和model引用，不把场景带入降低thinking路径。
- `runInsideLongTask` 是标记已有受控调度上下文、绕过共享聊天槽的机制，实际并发上界由controller保证；不能表述成新增了独立全局队列或服务端信号量。场景worker上限从 `IMPORT_RUNTIME_MAX_CALLS - 1` 派生，保持现有32项/32KiB runtime proof总容量，不修改全局聊天限额、图片池或其它实体池。
- 慢写合批、current/epoch检查、写失败停止可以扩展到scene；角色按已确认ID直接替换artifact的独立分支**不得**扩展到scene，scene继续原 `mergeImportArtifacts` 身份/冲突/容量语义。场景父级前向引用、阶段末循环与原生映射门保留。
- 高并发的重点风险是取消排空、失效缓冲结果落盘、持久化失败后继续产生新请求、证明容量遗漏。需以实际在途调用及真实journal保存barrier验证，不能只看常量、保存次数或内存task状态。
- 不改变网络/授权/结构纠错策略；实际供应商如因并发出现频率限制等错误，应保留现场并据此调整，不能新增无限重试或把模型失败吞为成功。真实全批仍要求全部候选/任务/资料ID相等、父级/字段/正文与发布重开逐项通过。

## R5资料结构与SI-08专用提示方案审核

阅读250新增R5资料结构反馈段落，仅据源码审核，不读取真实失败值。**场景entity专用提示与静态结构诊断方案通过。** 现有通用entity输出串无条件要求角色roleType且拼接其它类别native合同，属于明确提示混杂；独立scene契约限定已选目标ID/name/kind、PLACE及可信目录既有parentId，与现有身份/引用校验一致。

实施边界：

- 父级是该目标 `entities` 项里的完整可信ID；有则逐字保留，无则省略，不能把地点名当ID、借其它目标的parent、用null/空串或新增父级。保留有效父级不代表要求所有地点都有父级。
- schema、原文单位、全目录验证、直接引文/sourceUnitIds、模型thinking和两轮生成上限保持。专用提示必须含原有来源归属/可靠性语义，不借删除非客观信息或将其默认改为客观事实减少结构问题。
- 字段只列**当前服务实际接受的**scene字段。当前 `semanticResultArtifact` 仅character entity加schema2，scene服务校验仍按v1；因此本次不能在提示暗中要求四个v2业务字段。现有text中完整有据场景说明仍须保留。若要另启用scene v2模型资料，需要单独说明schema/最终校验变化并先审核用例。
- `artifacts`根路径可能对应单目标数量、身份/父级、其它字段多种错误，诊断只根据已知完整path及固定反馈识别，不武断推断真实非法值。未知键/模型值/原始feedback不得外泄；证据anchor原分类及网络/取消/授权错误继续原有处理。
- 其它阶段提示保持原字节；仅scene entity提示hash允许按新合同更新，不能为了通过测试批量更新无关快照。

R5的真实结构错误内容未记录，方案只能确认提示混杂修复，不得宣称已证明该次模型返回了某个具体非法字段。

## R6与SI-09传输/原生资料合同扩展方案审核

阅读250新增SI-09，主代理报告R6固定“场景字段格式”失败，但该标签不足以确定具体坏字段。本审核未读取私有返回值。**明确的SI-09扩展方案通过**：将已有角色机械引文协议有界复用于scene entity，并把服务的场景schema2原生接受/校验与controller及编辑器已有四文本字段对齐，是明确的合同修订；不将它描述为已证实R6具体因某一个字段失败。

实施边界：

- 机械协议需独立于轻量模型策略：可以共享character/scene entity的选项恢复与sourceUnitIds派生谓词，不能因此把scene并入 `lightImportGeneration` 或改变thinking、模型对象、单位选择、目录、31路池及材料范围。
- evidenceOptions只能来自本次已授权units内经核验的连续原文，序列化为模型数据时提供显式0-based optionIndex。仅严格 `{optionIndex:整数}` 可恢复本请求对应unitId/quote，再走原定位器；仍接受严格直接引文。不能对带坏quote或混合键的对象挑选索引部分、静默换成好引文，也不能扩大未知单元/歧义/外部引文的接受集合。
- sourceUnitIds是机械来源索引：缺省或不属于本次units的字符串声明可按既有角色协议归一，合法已声明单位与已核验证据单位保留。不得把evidence中的外部unitId或坏quote同样过滤掉；sourceUnitIds的数字/null等非法类型依旧拒绝。
- scene entity在生成schema和最终严格校验中均按schema2验证现有四文本字段，未知native键/非法类型仍失败，合法四字段、text、目标、PLACE与可信parent逐值保持。不能用本地默认内容、改父级、清空事实或删除未知失败目标制造成功。其它类别/阶段的wire与字段合同保持。
- controller只对已净化三类scene结构错误及固定四类anchor错误开放原有一次外层字段纠错，精确匹配固定消息。每目标最多2个请求、每请求最多2次生成；第二请求的错误不能被同一catch循环再次捕获。原epoch/授权检查仍先执行，网络、权限、取消、预算与持久化失败不重试；其它类别不能因新增scene白名单而获得额外重试。
- 诊断只用固定白名单字段标签及静态原因，不插入原错误值、未知键或模型反馈。实际千项长批仍以新会话全部数据/父级/发布重开验收为准；更多协议容错不等于已经达到真实成功。
