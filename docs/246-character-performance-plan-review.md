# 全书角色导入五分钟方案独立审核

日期：2026-10-30。审核者：独立子代理 `character_review`。审核 `246-character-performance-plan.md`，对照 `runEntities`、服务层 `defaults.generate` / `importRosterModel`、`src/lib/long-task.ts`、`generateText`、运行时证据容量及服务关闭路径。只读源码审核，未读取真实书稿、模型配置、密钥或私有 journal；r4 的耗时和完成数采用主代理报告，未在本审核独立认证。

## 结论

**方案通过，可进入性能用例及独审。** 独立 15 路与取消继承 high 思考是有源码依据的首轮吞吐改进，不改变正文、目标、逐角色任务及严格数据接受门。方案明确以整批真实计时判定，不把估算视为性能达标。此审核不保证当前模型/供应商一定能在 300 秒内完成。

## 边界与风险判断

1. **15 路处于既有协议范围内。** controller 的文本 runtime tracker 默认最多 16 个在途调用；角色单独 15 路保留一席余量，不扩大 maxTokens、暂停 proof 数组上限或 runtime 文件容量。角色图片由独立 imageOperations 管理，不进入该文本 tracker；图片仍按原 2 路，其他实体仍按原 4 路。测试须实测 15 个在途记录与暂停 proof 的字节容量，不能只断言常量等于 15。
2. **绕过共享队列必须只有精确受控阶段。** `generateText` 默认经 `withLongTask/acquireLongTask`，共享队列缺省为 2；`runInsideLongTask` 的 AsyncLocalStorage 上下文可让嵌套生成直接使用既有阶段的调度。仅 semanticVersion=1、phase=analyze、intent=entity、kind=character 增加该行为，原 roster 路径保持；普通 character analyze、review、reconcile、patch、scene/item/world 不受影响。不得仅按自由 action/instruction 或 kind=character 判断。并发上限由 controller 保证，不改全局 queue.limit。
3. **关闭与数据库生命周期仍须实测。** 队列 bypass 也会跳过 acquireLongTask 内的额外 retainDatabaseTask；当前导入 RPC 整体由 `ImportAiJobs` 与 `works.runWithGlobal('inbox', …)` 包围，service close 先 stop/drain importJobs 再关 works，不是脱离生命周期的后台调用。复用 roster 路径具有现有依据，但 15 路暂停/退出要证明所有模型调用及 runtime 写盘均排空，无迟到提交。
4. **轻量策略不应修改模型快照。** 复用已有供应商兼容逻辑，只改变本次实例的 providerOptions；provider/modelRecord、endpoint、authRevision、输出 schema、单位、目录、生成预算、abortSignal 和每次授权复核保持。DeepSeek 的兼容协议分支与其他供应商原策略一致，不能将 Anthropic 协议当成 DeepSeek OpenAI 协议发送不支持的开关。用户保存的 high 配置不能被持久化改写。
5. **吞吐可行性需要完整实测。** 假设识别约 40 秒，556 个角色要在剩余 260 秒完成，平均吞吐约 2.14 角色/秒，15 路平均每角色占用时间约需低于 7 秒且尾部无长阻塞。roster 的短输出 15 路成功不能证明完整角色资料也有同样延迟或供应商限额。长输出、429/5xx、有限结构纠错、透明网络重试、CPU 扫描、journal 写盘和最后校验均可能成为瓶颈；这些耗时必须进入同一 300 秒总表，不能在重试后重置计时。
6. **输入和质量保持。** 第一轮不缩减正文、已选目录和字段是正确边界。关闭思考不等于结构校验可证明全部内容质量；真实验证除 ID/任务/引用/证据门外，还须据原文抽查重要角色资料和有据关系，不能用字段全空或只剩名称的占位结果达标。没有依据的字段继续空缺，不因性能目标强填。

## 性能用例须落实

- ≥30 个角色、确定性生成挂起门，实际观察峰值 15、从不超过 15、runtime 同时记录全部在途操作；其他类型/图片峰值保持原值。原 CI-01 的中途前向引用提交仍须通过，在更大并发下不能退回错误。
- 服务真实生成路径测试：占满共享队列 2 席后，受控 character entity 仍可开始；普通 analyze/review 等继续排队。不能只测一个 predicate 或只检查源码中出现 `runInsideLongTask`。队列上下文不应泄漏到同时运行的无关请求。
- 15 路中暂停/取消、授权变更、结构纠错与最终 retry 的交错：全部在途取消、迟到结果无提交、完成项不重做、持续非法仍仅 2 controller 请求/4 次结构生成、runtime 证据有限且完整。保留 CI/RB 正确性负例及原类型检查。
- 时间用单调时钟测量，授权开始记录在点击之前，角色导入开始记录在确认全选导入按钮之前，完成观察误差 ≤1 秒；总时长包括识别、自动全选确认等待、所有重试、最后关系解析与下一步骤观察。不得仅报告第 10 步耗时。新建完整会话，避免恢复旧会话后缺少起始时间。
- 真实超时必须失败；即使总耗时超 300 秒后最终全部完成，也分别报告“正确性通过、性能失败”，继续优化。300 秒时未完成不能算全部成功。

## 调用记录表述

方案末尾“记录全部实际模型调用”需在用例中明确口径：runtime.json 只保留最近 64 条，轮询得到的 `observedEntityCalls` 仍只是观测记录，不能自动当作完整 controller 请求总数，更不能当作含内部两轮纠错/网络重试的供应商调用总数。可以实现有界事件元数据台账确保全程不漏，或继续使用观测记录并据实标注覆盖范围；性能主验收仍以完整角色任务集合、严格结果与单调总计时为准。不得扩大日志为正文、完整 payload 或 Key。

无需为本方案再请求用户 UI 批准；完成实现、独审和指定原件真实运行后，才有依据宣称五分钟目标是否实现。

## r5 反馈补充审核：真实引用选项与相关目录

日期：2026-10-30。审核 246 新增“r5 真实反馈：引用复制与重复目录”，对照当前 `importEntity`、`entitySchemaFeedback`、服务请求 schema 与原 anchor/rebind 接受规则。未读取 r5 私有现场、原文或模型配置；551 全选/8 完成/证据 no-match 的运行情况仅采用主代理报告，不在本审核独立认证。

**补充方案通过，可进入定向用例及独审。** 为模型提供来自既有输入的可复制连续引用，能减少 unitId/quote 配对错误而不改变返回值接受规则；在原先有限纠错中增加四种固定证据原因，也不等于接受非法证据。过滤自由 instruction 的重复全目录是在减少无关元数据，正文 units 与服务端完整可信目录保持不变，属于已审范围内的改进。此判断不保证生成速度或全书结果达标。

实现与用例须保持以下边界：

1. `evidenceOptions` 可选，仅 character entity 使用，最多 8 项；每项非空且有明确短长度上限，unitId 必须属于**本次 request.units**，quote 必须是该单元原样连续内容、Unicode 完整，不跨单元、不拼接、不借其他文件或旧请求。验证必须在 model resolve/generate 前完成，直接 schema 工厂/生成桥同样执行。错误消息仅为固定说明，不回显实际引用或伪造值。
2. 选项由不变的 units 和目标 canonical name/aliases 生成，没有真实匹配时省略；不要为了有八项而重复填充或制造引用。按输入顺序/固定位置取样，避免并发结果顺序改变选项。选项大小计入原 payload 预算；不得以新增选项为由挤掉已选正文单元或有据字段。
3. 选项应保留为结构化资料，固定提示说明“可复制但不是唯一允许来源”。不能把模型的错误引文替换成某个选项，也不能只校验证据在选项列表中就绕过原定位器。正确模型输出仍来自真实分析，原 evidence/引用/身份/确认类型门全部执行。
4. 原 anchor/rebind 的接受集不变：exact 短引文仍允许；错误单元、非精确过短、歧义、no-match 仍拒绝，只有重新生成出合法值才成功。四种反馈使用精确完整错误字符串和固定中文说明；未知 reason、大小写/后缀变体或任意括号文本不进入重试、不拼入新提示。
5. 外层仍最多两 controller 请求、每次最多两轮结构生成；第二次不能再回到同一 catch 增加第三请求。授权、预算、网络、取消、运行时写盘等排除条件保持。恢复样例须经过真实 controller→runImportAi→generateImportAiJson 链，前两轮 no-match，第三轮真实复制合法选项；持续错误恰好四轮后失败且无 artifact 提交。
6. 角色 instruction 相关目录以已选候选的固定顺序筛选，保留当前目标，以及当前单位中任何 canonical name/alias 实际出现的候选，不受返回顺序影响；关系的已知 ID 不得被局部目录当成外部引用。服务端 request.entities 必须保持完整已选清单，serializer 的关联/祖先保留规则不改，scene/item/world 与普通阶段的 instruction 和 payload 字节不变。建议相关性也保留已有 `evidenceUnitIds` 与本次单位交集的候选，以兼容有定位依据但名称被排版分隔的情况。
7. 新测试须比较新增前后的 units 及完整服务目录，明确只减无关自由目录冗余；断言目标和相关别名条目仍可用，最终有据关系与全部资料未清空。已有普通阶段 hash、RB03/RB04 等严格负例与 15 路暂停/容量测试继续通过。

补充实现和代码审核后，再从指定原件新建完整会话，全部角色默认全选、同一总表 ≤300 秒且零失败/跳过/丢弃才可判本轮目标通过。局部八项成功或引用选项本身合法不等于整批角色正确，也不等于全部字段语义已核实。

## 角色业务 schema2 完整性补充方案审核

日期：2026-10-30。单独审核 246 新增“完整性补强：绑定当前角色业务字段”，对照 controller 的 schema:2 赋值、`IMPORT_SEMANTIC_V2_FIELDS` / `importFactFields` / 原生 profile JSON schema、服务层两条语义校验路径及固定提示。此部分尚未实现；未读取真实数据。

**方案通过，可接续 CP-09 用例审核。** 缺口由源码直接成立：controller 接受后赋 schema:2，但模型结果在服务层未带 schema，默认字段表排除 abilities/backstory/motivations/arcStages 等17个现有角色扩展字段。固定 `character-facts-encoding-contract` 及通用 native 允许字段表也只列 base；现有 NIW-C41 注入 controller 响应绕过服务层，不能证明完整写入链成立。

仅对 semanticVersion=1、phase=analyze、intent=entity、kind=character 的新角色结果使用 `{...artifact,schema:2}` 私有验证副本，能够统一现有角色业务版本，又不允许模型决定 schema。复用真实原生验证器与字段集合比重新维护宽松副本更正确；普通 analyze 等保持原行为，范围合理。

实现边界：

1. 生成响应 schema、生成桥的早期身份/原生验证、服务最终链接验证都须使用同一范围判定和同一业务版本；不是只改最后 `validateSemanticLinks`。尤其当前 `validateIdentityLinks` 会将原生错误暂列 deferred，不能仅替换其调用参数就以为非法 V2 JSON 已进入生成纠错；须在请求绑定响应 schema 中显式执行完整 schema2 原生检查，使格式错误触发原 generateJSON 有限反馈。
2. 私有副本仅用于本次新角色结果校验，不应把 request.artifacts 中已有 source/confirmed 或其它类型上下文升级。返回值的 text/facts/evidence/sourceUnitIds 原样保留，不增 schema、不做 JSON 解析后重编码、不删字段。controller 按既有规则给最终存储 artifact 标 schema:2。
3. 固定提示中两个允许字段位置必须一致：character encoding 处与通用 native contract 的 character 表都使用 `importFactFields('character',2)`，仅此精确阶段替换。不能在前段允许 V2、后段仍用 base 字段表否定它们。模型响应仍不得自带未经允许的 schema 字段。
4. personalityTags/motivations/beliefs/bigFive/arcStages 的 JSON 字符串合同复用现有 native profile 的字段与边界，包括 motivations 的组/items/importance 结构，bigFive 的可选0–100整数，arcStages 的既有字段、嵌套 markers/changes、数量/字符串上限。未知省略，不默认制造数字评分、动机权重或占位成长阶段。
5. 所有 V2 facts 仍是外层字符串值，非法数组、额外键、超界数值仍严格拒绝或在现有上限内由模型重新生成；不是把模型坏值转换成合法值。证据、关系、已选目标、作者确认类型及授权门不变，模型返回未知业务键仍拒绝。
6. 普通 character analyze 及其它 entity/phase/legacy 不被升级，原阶段 payload/prompt 指纹保留。新增完整字段提示仍计入原固定提示预算，不增加预留或减少输入。

该修复使正式链能够接收已有有据字段，不能靠移除这些字段提高速度；实现/代码审核后还须以完整真实角色流程重新同时验收正确性与五分钟目标。

## r6 补充方案审核：程序派生来源索引

日期：2026-10-30。审核 246 新增“r6 真实反馈：程序派生来源索引”，对照 sourceUnitIds 的当前 schema 约束、evidence 的严格 anchor/rebind、最终来源集合门与 controller 校验。未读取 r6 私有输出、正文或模型配置；579/25 及来源单元标签仅为主代理报告。单一错误标签不能证明模型其余字段已全部通过，尤其前置 Zod issue 可能跳过后续原生检查；本方案不应依赖“其它字段均正确”的推断。

**方案通过，可接续 CP-10 用例审核。** 将可从已定位证据计算的 sourceUnitIds 明确移交程序，是请求范围内的来源集合派生，不是用模型声明赋予外部来源权限。只要真实证据仍先严格通过，忽略无授权的机械声明不会让未知 evidence.unitId 或不实 quote 获得接受。接受规则变化必须在方案和测试中明示：character entity 的 sourceUnitIds 成为派生元数据，不再把它描述成未经变换的模型输出；facts/text/关系等业务资料的原值保留要求继续有效。

实现边界：

1. 只在 semanticVersion=1/analyze/entity/character 的线格式允许 sourceUnitIds 缺省/空数组或合法字符串数组；非字符串值、非法字符及过容量仍拒绝。其它 entity/ordinary/review 等路径保留原 schema 和提示，不可把全局 artifact 的来源数组统一设为 optional。
2. 派生须发生在每条 evidence 已通过原 strict matcher 之后；集合为“当前输入范围内的全部合法声明 ID”并集“严格定位出的 evidence 所属单元 ID”。缺少证据、未知 evidence 单元、虚构/无法唯一重定位的 quote 仍在派生前拒绝，即使声明数组含合法 ID 也不能成功。选项模板不能代替实际 evidence。
3. 程序只丢弃模型无权声明的外部/实体/不存在的机械索引值，不丢任何当前 units 内的合法声明，包括合法但未逐项摘录者；确定性去重与稳定顺序可用于该集合，不能把这种元数据处理扩展到事实字符串或关系。
4. 本次不新增任何引文“修复”：不得将坏 quote 换成选项、把未知 evidence.unitId 猜成当前 unit。原来已批准的 exact/排版定位与单个真实单元的唯一 rebind 继续原样执行；“evidence 不改”应理解为不新增改写规则，不能据此移除既有合法 rebind。真实重定位目标 ID 必须出现在派生集合中。
5. 生成阶段与最终解析复用同一请求绑定 schema/派生函数，结果在进入原 core/controller 前已是完整标准 ImportArtifact；再次解析必须幂等，不能一轮补 ID、另一轮又删合法 ID，或因 schema transform 次序跳过 V2/身份/证据校验。派生函数不修改 request 或原始模型对象。
6. 固定 character 线格式不再要求 sourceUnitIds，通用 native/source 声明说明在本阶段也要明确它由应用派生；避免一段要求省略、另一段又要求填写。若模型仍提供数组，只有当前 units 中的声明会被保留。证据仍必须由模型提供真实 unitId/quote。
7. 可审计性来自固定派生规则、完整保留合法声明/定位证据、前后集合测试与阶段范围限定；若记录运行统计，只记录过滤项计数/固定原因，不保留外部声明原文或 Key。不能以派生后的合法数组宣称原始机械声明从未有错，也不能据它证明全部业务事实正确。

此方案不放宽真正证据的接受集，不要求放开未知字段或更改 controller/core 的严格门。实现独审与原件完整计时仍是后续步骤，不把 r6 失败重标为通过。

## CP-11 严格 optionIndex 引用方案审核

日期：2026-10-30。审核 246 最新的严格选项索引计划及主代理补充的实现方向；本部分尚未实现，未读取真实资料。

**方案通过，可实施并进入 TDD。** 只在 character entity 且本次已有生成前核验选项时，将严格 `{optionIndex:整数}` 解释为本请求某一真实选项，是显式受限引用形式；它与把错误 unitId/quote 猜成合法证据不同。无论采用显式索引还是原 unitId/quote，最终必须经过同一个原严格定位器并输出标准 ImportArtifact。

以严格 `refSchema.safeParse` 为门的 preprocess 方案可实施：只有**单键、整数、范围内**对象才映射为该请求已核验选项的新 unitId/quote 对象；其它值原样交旧严格 evidence schema 拒绝，保持原 anchor 诊断。不得对失败对象挑取 optionIndex、删其坏 quote/额外键后再接受；不得用数字强转、默认0或最近有效索引。数组中一项非法必须使整批 evidence 校验失败，不能 flatMap 丢坏项，只保留另一好索引。

边界要求：

1. 适用条件须精确为 semanticVersion=1/analyze/entity/character，且 `selectedEntityTarget` 已核验本请求 evidenceOptions；无选项、空/非法选项、其它阶段不安装索引解码分支。响应模型不能修改该选项表、引用旧请求索引或额外提供选项数据作为可信来源。
2. 索引只接受 JSON number 的0基非负整数，且小于当前数组长度；拒绝字符串、负数、小数、越界及任何额外键。`{optionIndex:0,quote:'坏值'}`、`{optionIndex:0,unitId:'foreign'}` 即使索引正确也必须拒绝。合法原形 `{unitId,quote}` 仍允许引用选项外的当前真实材料。
3. 模型看到的显式 optionIndex 在序列化副本中按本次数组位置生成；原 request 对象及其严格选项结构不改。固定提示须明确两种**互斥单项形状**，不要让模型复制整条带 optionIndex/unitId/quote 的目录对象当作响应。
4. 索引展开后继续原 evidence 定位、CP-10 来源派生、schema2/身份/关系/确认类型与 controller 门；生成桥和最后解析必须一致且幂等。业务 text/facts/关系原值不变，不能把该分支扩成通用 quote 修复器。
5. 原阶段 payload/prompt 指纹与 RB 诊断保持，不通过证据的值仍按既有有限两请求/四生成停止。未知索引或混合坏字段不能被 canonicalization 接受。

通过仅允许实施这个严格线格式，不意味着真实引文错误已消除或五分钟验收通过；合入及独审后再从完整原件重新构建验证。

## r7 补充方案审核：角色专属提示与32项运行时容量

日期：2026-10-30。审核 246 新增 r7 方案，阅读当前提示/anchor反馈与运行时 proof 的 schema、limits、tracker 及保存路径；未读取 r7 私有资料，549/38/no-match仅为主代理报告。

**方案通过，可实施并进入 CP-12/13 的 TDD。** 精确限定角色 entity 的专属固定提示，能移除无关类别指令而不删本次材料或已有业务字段；31路与32项/32KiB证据容量是为五分钟目标作出的明确方案修订，可覆盖先前15路/16项的实施选择。它不自动证明吞吐或供应商限流可满足目标，也不允许损失取消证明。

必须保持：

1. 专属提示仅适用 semanticVersion=1/analyze/entity/character，动态名字/原文仍在不可信结构化数据中，不能进入固定授权指令。保留目标身份与作者确认类型、全部17个扩展字段及base、五类JSON结构、关系/可靠性/归属/时间、未知不猜默认、不改正文、不执行资料指令。units、完整可信目录、来源派生与返回校验不减少；其它阶段固定字节不变。
2. 有已核验选项时**生成指导**要求只写严格 optionIndex；无选项仍用原直接引用。标准解析仍保留合法直接引用的兼容，不可为了提示更简单而拒绝原来合法的真实 quote，更不能替换坏 quote 或丢失有据事实。
3. 四种 anchor 反馈的编号说明使用请求范围内的静态映射，schema产生的消息与 generateImportAiJson 中两处 reason识别/诊断位置必须共用同一映射；不能只改 schema 字串而让 reason 不再匹配。无选项、其它阶段的消息保持；未知后缀、混合结构错误和下一轮新错误不得继承旧 reason。反馈只含固定操作说明，不回显模型引文。
4. worker31须与导出的硬上限32保持余量；roster15/其它实体4/图片2不变。所有 parser、pause schema、默认/自定义 limits 校验、tracker在途预检及整体字节预检统一引用常量，不漏掉 encode/恢复入口，不截断calls，不扩大单项1024字节。
5. 32KiB是**含runtimeAiCall、全部pauseProof、remaining等封装**的整体预算，不是只对calls数组计费。32个正常合法调用应能保留完整proof；仍按真实序列化UTF-8字节检查，不能为凑32项放松身份/时间/未知键/非零remaining条件。自定义更小预算继续先验拒绝，超32项/32KiB/1024配置或数据按原规则失败。
6. 新读取器兼容旧16项version1记录；保持proof字段、session/process/operation/epoch/hash/时序语义不变，不能以容量变更重置业务hash或隐藏错误。容量扩张不是向旧二进制承诺读取32项的降级兼容。
7. 31在途暂停必须全部取消并实际settle，证明全量calls与取消ID集合相同且零剩余。保存/恢复测试不得改变原未保存向导关闭即删除的生命周期；可在原本允许保留的已开始保存/发布恢复夹具中验证，或验证完整journal codec/恢复检查路径。

完整新会话仍须把识别、所有纠错/网络重试及末尾校验纳入同一≤300000ms总表，全部角色零失败/跳过/丢弃。不能以增加并发或局部38项记录替代真实整批结论。

## r8 补充方案审核：已确认角色ID与提交完整性

日期：2026-10-30。审核246末尾CP-14方案，并读取 `runEntities`、`resolveWizardReferences`、`importEntity`、`mergeImportArtifacts`/`sameEntity` 及原容量/引用检查源码；CodeGraph工具本会话不可用。未读取r8私有快照、原书、模型配置或密钥；真实计数与错误现象仅为主代理报告。

**方案通过，可实施并进入 CP-14 的 TDD。** 源码确认根因成立：角色 `sameEntity` 会把一个候选的aliases与另一个候选的name匹配，通用merge保留先到资料的ID并合并内容；`runEntities` 随后仍把后一个task标done。原阶段末引用处理只看artifact ID是否存在，无法区分主动skip与丢失的done记录，可能先删关系再被native门拒绝。任务done不能证明对应角色实际保存。

本轮固定的是向导已确认身份的保存职责，边界正确：确认列表中的不同ID是本阶段独立目标，模型aliases只作为事实保留，不能再次授予跨ID合并身份的权限。角色entity提交按确切ID保留规范artifact，能够避免事实被移到其它目标、到达顺序改变身份或合法V2字段产生伪冲突；不应全局改动sameEntity或普通批次的别名归并。

实施必须保持：

1. 仅在向导character实体task提交分支启用，复制来源角色与模型生成角色均受同一已确认目标约束；settings、其它entity及普通分析仍走原merge。新数组先构造、深复制并通过原 `validateImportArtifactCapacity` 后再赋给session，随后才能置done。容量/保存失败不能通过先修改session再catch留下一份假成功记录。
2. artifact的ID/kind/确认name、作者确认roleType、证据、原生字段及关系仍走原检查；按ID保存不是绕过这些门或把错误身份强行改成正确身份的许可。不同已选ID即使别名相互重叠，也各自保持完整text/facts/evidence/来源，不跨目标搬运或删减。
3. `resolveWizardReferences(character)` 在任何关系或dropped变更之前，对全部已选且done的**entity**目标完成一轮完整性检查：每个确认ID恰有一个character记录，name等于确认值。缺记录、重复记录、错误kind/name均立即拒绝。不能边遍历边修关系，遇到后面的身份错误时已污染前面的关系。
4. 主动skipped目标继续原“保留关系名称、移除未导入外键并记录dropped”行为；不得把done缺记录降级成skip，也不能用删除关系来使缺失已完成角色的会话通过。正常完整已选集合仍继续原native引用/类型门。
5. 原总容量、源文件校验、暂停/恢复、迟到结果、任务选择和有限纠错边界均不改；不从真实失败快照预写或修补业务数据。合成证明之后仍须新构建、新session、完整指定原件重跑逐ID校验和总时限，不能将r8的done计数追认为成功。

## CP-15 角色授权阶段范围指纹缓存方案审核

日期：2026-10-30。审核246末尾范围指纹复用方案，读取 `ai`、`importScopeHash`/`wizardScope`、grant建立/撤销、invalidate、向导patch与恢复路径。未读取私有journal或执行真实耗时测量；108ms/343502ms及真实字节量为主代理报告，不作为本审核独立实测。

**方案通过，可实施并进入 CP-15 的 TDD。** 当前runtime确实在每个语义AI调用内重新执行包含各来源文本hash与workingProse的完整importScopeHash；角色候选选择、task进度和结果artifact不在该授权范围hash中，候选变化另由wizardSelectionHash绑定。同一授权阶段重复计算相同值可在进程内复用，不能将已有grant.hash直接冒充本次重新验证过的范围指纹。

缓存安全性依赖明确的不变量，实施须同时保持：

- 精确启用条件为verified=true、wizardVersion=1、semanticVersion=1、analyze/entity/character；其它请求使用原完整计算。WeakMap以session对象隔离，命中还必须比较session.id、当前epoch、workingRevision、当前analysisGrant对象身份及hash。仅普通session.revision/updatedAt和artifact提交进度改变可以继续命中；重开或新controller不能继承缓存。
- 首次或任何键失效后都完整调用原importScopeHash；结果严格等于当前捕获且仍有效的analysisGrant.hash才可缓存并发起模型调用。compute异常/不等不缓存，也不写成功runtime或调用AI。不得在失效后回退到旧值，或把新计算值静默覆盖grant。scopeHash保持原64位hash语义。
- 源文件/单位/所选类别/推断目标/正文/章边界与已授权章范围、PDF决策、预算政策等授权输入不能在缓存有效期内无失效地变化。现有include/move/set-range/encoding/章节与PDF变更经invalidate提升epoch并撤grant；patch提升workingRevision并更新grant对象/hash；pause提升epoch、恢复重新授权或沿用有效grant但必须重算。保留这些路径，不能因缓存优化撤销它们。候选仅收窄原授权材料，不将候选目录纳入昂贵全文重算。
- 每请求仍校验当前epoch/session与模型授权，仍执行原批次来源verify、executionBudget/payload及固定提示预算检查；每条payloadHash独立散列实际payload，operationId/时间及runtime记录原样。不能缓存本次材料、模型检查、返回结果、来源外部身份或将verified范围扩大到任意调用。
- 如果未来增加能在同epoch/grant/revision下更改授权scope的路径，必须同时使本缓存失效；仅对象身份不能替代这些状态不变量。测试应记录这种约束，不对任意绕过状态机的私有原地修改承诺自动检测。

首次相等检查还新增了角色路径的保守拒绝门；不等时停止符合授权边界，不能靠跳过比较使测试通过。推算节省约一分钟仅说明优化方向，真实≤300秒仍由CP14正确性修复后完整新会话的总表判定。

## CP-16 慢写期间合并角色提交方案审核

日期：2026-10-30。审核246新增r9反馈/CP-16，读取当前commit、worker、serial/save/checkpoint、pause屏障及真实驱动完成分支。未读取r9私有数据；546项完整和325228ms为主代理报告，不构成本审核独立实测。

**方案通过，可实施并进入 CP-16 的 TDD。** 当前commit在等待serial/save之前已splice取走缓冲，lastSave只在保存结束后更新，因此首写慢于2秒时，其它worker可以各自取一项并排队一次完整journal写入。已有serial只互斥IO，不能重新把这些已取走的小批合并。角色阶段的在途commit Promise能够限制同时取批次的调用者，保留同样的数据与落盘门。

实施边界：

1. 仅character的runEntities阶段启用；其它entity/settings保持原commit行为。等待当前提交完成后，必须重新检查halt、force/8项/2秒阈值与当前缓冲，再取出下一批；不能在等待前先splice或预先认定阈值必然成立。同一时间只有一个角色commit取得批次并排队。
2. gate必须覆盖实际serial/save与lastSave更新，不能在写结束但时标尚未更新时放下一批。等待者须共享失败传播，失败不能catch后当作成功、继续提交或提前置全部done；清理gate须使用可靠finally，不能留下永久等待或未处理拒绝。原serial内candidate/epoch检查继续在修改状态前执行，暂停后的旧epoch不得提交缓冲。
3. 原按确认ID保存/容量门、task skip与依赖、image缓冲、owner检查、完整encode与原子rename/fsync均保留；角色done仍由实际提交路径确定。失败/取消期间未提交的结果不能仅因已在缓冲就获得持久成功信用。终结force继续等待在途提交并处理剩余批次，不丢不足8项尾部；2秒进度触发规则不改变。
4. pause必须遵守原serial与AI/PDF/image屏障，不能跳过已经开始的IO以尽快返回；所有在途调用实际settle、proof完整且remaining零后才暂停完成。resume只复用已保存角色，未提交/取消任务按原策略重做，不能靠少写草稿换取时间。
5. 驱动以首次观察角色阶段完成的同一单调时钟读数计时，先完成全部角色/正文/关系断言并写独立结果及私有现场，再处理自动开始的下一阶段。收尾重新读取当前状态，waiting无需暂停，running才尝试正常暂停；后置竞态失败单独记录，不覆盖已保存角色结果或重置计时。角色断言/记录失败仍必须fail，超300秒仍明确performancePassed=false。

r9已报告的325秒不能因保存次序修正而改为通过。优化仅消除多余完整写盘，最终仍须新构建、新session、全书全部默认角色完整正确且总计≤300000ms。
