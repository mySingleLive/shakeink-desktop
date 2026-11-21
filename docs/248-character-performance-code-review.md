# 角色导入性能实现独立代码审核

日期：2026-10-30。审核者：独立子代理 `character_review`。范围：character 独立池、服务端轻量生成与 lane helper、性能测试及原 NIW-C29/49 调整、定向真实驱动计时/关闭处理。未读取真实书稿、模型配置、密钥或私有 journal，未运行真实模型。

## 结论

**通过，可继续当前构建的完整真实计时验证。** 未发现本轮产品实现的阻塞性问题。定向测试证明 15 路调度、场景保留 4 路、真实共享队列旁路、暂停排空与已完成项保留；不能据此宣称全书已经在 300 秒内成功。

## 独立执行

Node v24.18.0：

`node --import tsx --test tests/unit/novel-import-character-performance.test.ts tests/unit/novel-import-roster-ai.test.ts tests/unit/novel-import-request-schema.test.ts`

**68/68 通过**，约 1.7 秒，包含全部四个 CP 测试、供应商兼容选项、请求绑定 schema 与严格证据/类型/身份校验。另运行 `node --check scripts/run-lotm-wizard-import.mjs`：通过。

## 调度和生成边界

- `runEntities` 仅 character 使用 `WIZARD_CHARACTER_CONCURRENCY=15`；通用实体仍 4、图片仍 2。runtime 在途上限仍 16、证据协议与字节容量未扩张。
- `lightImportGeneration` 精确要求 semanticVersion=1、phase=analyze，再限定 roster 或 entity+character。自由 instruction 不参与判定；普通 character analyze、其他实体、review/reconcile/patch 和 legacy 保持原路径。
- defaults.generate 实际调用 `importGenerationModel` 与 `runImportGenerationLane`，不是未接线测试 helper。轻量路径通过原 `runInsideLongTask` 上下文跳过共享聊天名额，普通路径最后仍直接返回 `generateImportAiJson`，NI-J01 通过。helper 未修改全局 queue.limit，也未改变信号或授权检查。
- DeepSeek OpenAI 协议只在本次模型实例的 providerOptions 关闭思考；DeepSeek Anthropic 明确返回原实例选项，避免误发 deepseek 开关。其他供应商仍复用原最低档策略；原 model 对象、modelRecord、store:false 和其余选项保留，用户保存的模型配置未被写改。
- 严格 response schema、证据定位、确认类型、引用与完整集合门、本轮已有最多两个 controller 请求/四次结构生成的纠错上限均未被性能实现改写。不缩减单位、字段或关系，不制造成功占位。

## 测试观察

- CP-01 用 40 个角色阻塞初始请求，实际 pending 与 runtime 同时达到 15，放行后记录峰值恰好 15；随后 8 个 scene 实体实际峰值恰好 4。全选角色 artifact ID 与候选对应，无 dropped，任务全部 done。
- CP-04 先提交 8 个，再实际挂起 15 个请求。正式 pause 后 cancelled operationId 集合精确等于在途集合，artifact 与暂停前一致，controller.active=0，proof drained/calls=15/remaining 全零；恢复后已完成 8 个请求次数仍各为 1，其余完成，总调用 40+15 与取消重做次数相符。新并发未超暂停证据容量。
- CP-03 占满真实 LongTaskQueue 两席后，生产角色 lane 内的 acquireLongTask 仍完成且队列 active 保持 2、waiting=0；普通路径实际等待，释放一席才进入 work。finally 取消并恢复原 limit，没有修改共享队列策略。
- NIW-C29 调整为角色池实际上限，保留多次完成进度观察、任务数量及 schema2 artifact 断言；NIW-C49 保留 runtime settled、journal 合并保存上界与并发可见性，只将角色上限改为独立常量。场景 4 路由 CP-01 新增实测覆盖。

## 真实计时与证据边界

驱动在“允许分析并导入”点击之前设置单调时钟起点，角色按钮点击前另记第 10 步起点，进入 detect-scene 时取结束 tick；识别、自动列表确认等待、内部纠错与重试均在总表中，未在重试后重置。角色模式 running 轮询 500ms、步骤间等待 250ms，较原 15 秒观察延迟明显收紧。

只有全选角色 tasks/artifacts/ID 一一对应、最终全部 done、failed/skipped/dropped=0、映射与关系有效、原件和工作正文 hash 不变、1402 章及零页面错误后才保存 `characters-completed.json`；其中明确记录总时长、第 10 步时长、deadline 与 performancePassed。若正确性完成但超时，仍保留完整结果并 exitCode=4。真实性能应以该定向结果对象为准，不能只看通用驱动的进程退出码或第 10 步时间。

受控关闭确认只在 charactersOnly 且 bootstrap.dataRoot 与隔离 appRoot 精确相等之后启用；只匹配“停止正在执行的任务后关闭？”及“停止任务并继续”，其他原生对话框仍走原函数。launch 标注选择器和关闭提示受控，不能据此宣称原生对话框验收。该逻辑只用于隔离验证，不进入产品。

`observedEntityCalls` 仍正确标明观测样本，不能当作包含所有内部生成及网络重试的完整供应商调用数。暂停前现场副本也仍应按“首次观察现场”解释，不将 click 返回当成排空证据。

## 非阻塞补强

CP-03 的饱和队列等待可再加 Promise 层的短超时并确保超时后 abort/release，防止未来 lane 回归时测试永久挂起。精确 300000ms 边界判定可直接使用未取整的单调 duration，取整只用于显示，避免 Math.round 在半毫秒范围将超时向下舍入。当前实现与上述 68 个定向测试均未观察到实际故障；这两项不替代后续完整真实性能验收。

## r5 补充代码复审：引用选项和相关目录

日期：2026-10-30。同一独立审核者仅复看本轮 `characterEvidenceOptions`、instruction 目录过滤、entityTarget/request schema、固定证据原因反馈及新增 CP-06/07/08 与 CI 元数据断言；未读取真实书稿、模型配置、密钥或私有 journal。

**补充实现审核通过，可继续完整真实验证。** 未发现本轮的阻塞性问题；原五分钟与全部角色正确性目标均未被降低。

### 独立执行

Node v24.18.0：

`node --import tsx --test tests/unit/novel-import-character-evidence-options.test.ts tests/unit/novel-import-character-performance.test.ts tests/unit/novel-import-entity-target.test.ts tests/unit/novel-import-evidence-rebind.test.ts tests/unit/novel-import-ai.test.ts`

**52/52 通过**，约 20.4 秒。包含新四项 CP-06/07/08、15路/场景4路/饱和队列/暂停恢复、CI 目标与字段纠错、未知 reason 哨兵、原 RB 定位拒绝及 ordinary payload/prompt 精确 hash。

### 源码与结果确认

- `characterEvidenceOptions` 只读本次已选 units，按目标名称/别名寻找连续内容，每单元最多取一段，超过八项时按固定索引均匀采样，首尾保留。没有命中不制造选项。选项截取前后均使用 `safeImportBoundary` 调整，避免拆开 surrogate pair；未改 unit 字符、单元集合或输入预算。
- 另用合成源专门把两个 astral 字符放在理论切片起止的半个 surrogate 边界，经过正式 controller 生成选项，实际 `bothAstralEdgesPreserved:true`、`wellFormed:true`。此补充探针只在临时合成 fixture 中运行。
- 服务 schema 将选项限制为非空、最多8项、quote最多512个 UTF-16单元、非空白且 Unicode 完整；`selectedEntityTarget` 在生成前验证 unitId 属于当前 units 且 quote 为同单元原样连续内容。其调用同时位于 runImportAi、响应 schema 工厂及生成桥前置路径。
- 另对 foreign unit、伪造引用、空白、断 surrogate、单项513字符及九项容量六种合成非法输入，分别执行这三个入口；结果 `invalidVariants:6`、`resolutions:0`、`generations:0`。错误未先进入模型生成。
- 返回结果的 evidence 仍走原 anchor/rebind 和最终证据校验，没有引用选项替换逻辑或新接受捷径。CP-07 使用选项之外的真实 quote 成功并原样保留，证明选项不是证据唯一许可列表；RB 原非法单位、歧义、不实引文最终仍拒绝。
- 角色 instruction 目录按原候选顺序保留当前目标及当前文本中名称/别名命中的已选候选；request.entities 仍由全部 selected 构造，units 的现有选择和排序算法保持。CP-06 实际 30 个跨单元角色验证有无关目录被过滤、别名目标仍可用、所有服务目录仍30项，材料未缩减。scene/item/world 的目录构造保持原 selected 路径。
- 只有 character 调用 `entitySchemaFeedback(...,true)`，精确完整匹配四个已有证据 reason 后返回固定中文说明；未知 reason 或额外文本不产生反馈。原字段标签 Set 验证、授权/网络/取消/预算/持久化排除、两请求/四生成上限保持。CI-09 新增未知证据 reason 哨兵，未产生额外请求。
- CP-08 真实 controller→runImportAi→generateImportAiJson→generateJSON 前两轮 no-match 后第三轮复制合法选项，2请求/3生成完成，资料与关系仍在；持续 no-match 恰好2请求/4生成后任务失败，错误引用原文未被反射到新提示。未本地清洗不实引文或以清空资料取得成功。
- 固定 character 提示明确选项可供复制、也可引用其它本次真实片段，保留事实与关系；普通阶段精确 hash 继续通过。CI-06 仍核对 id/aliases/确认 roleType 的完整元数据，并单独验证选项存在，没有删除原身份断言。

本轮结果只认证实现与合成定向回归，不认证 r5 私有计数，也不证明指定原件已完整成功或耗时达标；后续必须使用同一完整总表及全部角色零失败/跳过/丢弃判定。

## CP-09 业务 schema2 完整性代码复审

日期：2026-10-30。仅审核 characterEntityRequest / semanticResultArtifact、响应 schema 原生检查、早期及最终语义验证绑定、两处固定字段表和 CP-09 新增测试。未读取真实书稿、模型配置、密钥或私有 journal。

Node v24.18.0 独立执行：

`node --import tsx --test tests/unit/novel-import-character-profile-ai.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-request-schema.test.ts tests/unit/novel-import-character-evidence-options.test.ts tests/unit/novel-import-evidence-rebind.test.ts`

**95/95 通过**，约 9.6 秒。包括全部17字段的真实生成/服务/controller链、非法 V2 原生字段的有限纠错/拒绝、ordinary 阶段 hash 与原严格证据门。

### 已确认

- `characterEntityRequest` 精确限制 semanticVersion=1/analyze/entity/character；`semanticResultArtifact` 只对本次新 character item 产生 schema:2 的私有浅副本，原结果对象未被写入 schema，fact 字符串未被解析后重编码。其它请求与类型仍返回原对象进行原版本验证。
- `profileArtifact` 在请求绑定响应 schema 中显式执行 schema2 原生验证，因此错形不是到 controller 或服务末尾才失败；`validateIdentityLinks` 与 `validateSemanticLinks` 采用相同私有版本，未升级上下文 source/confirmed 资料。ID/name/kind、作者确认类型、关系和证据门保持。
- character entity 的 encoding 表与 native contract 的 character 表都使用 `importFactFields('character',2)`；独立 profile 合同列出五类 JSON 字符串的实际结构、数量/数值边界与未知不猜默认。普通阶段继续用原表，精确 hash 通过。没有新增 provider schema 字段或坏值转换。
- CP-09a 的合成 profile 键集合与全部17个 V2 字段相等，公开 action 经真实生成桥及服务接受后，controller 全部 facts 与原值相等、schema=2，原生 profile 可读；CP-09b 的 motivations/bigFive/arcStages 首轮坏值、第二轮合法值实际两次生成，持续非法两次生成后失败；ordinary analyze 仍拒绝未授权 V2 字段。

### 新增字段反馈映射初审发现（已修正）

`profileArtifact` 当前选择专属反馈只匹配 `field+'结构无效'`。原生 `json()` 对 JSON 语法错使用这条消息，但 `parsed()` 对合法 JSON 的错误类型/越界使用 `field+'结构、字符或字段类型无效'`。因此 CP-09b 当前三个典型错形都会降为通用 facts 说明，新增 motivations/bigFive/arcStages 的具体结构反馈没有用于这些输入。

建议同时精确匹配这两种由原生验证器产生的固定消息，保持不回显任意原文；CP-09b 收集第二次提示，断言包含对应 facts 字段路径及具体结构说明，不包含坏值。核心版本绑定和严格接受行为正确，此处影响有限纠错的可操作性与新增专属反馈的实际覆盖，补强后微复核即可继续真实验证。

### CP-09 最终复审

修正后仅将反馈匹配扩为 `field+'结构无效'` 与 `field+'结构、字符或字段类型无效'` 两种完整固定字串，不接受任意前后缀，不改变结果接受集。CP-09b 新增断言第二次生成的**追加反馈**含对应 `artifacts.0.facts.motivations/bigFive/arcStages` 路径、importance/openness/chapterIndex 结构要求，并且不含首轮非法值。

独立再运行 `node --import tsx --test tests/unit/novel-import-character-profile-ai.test.ts`：**3/3 通过**，约 2.5 秒。结合此前本节 **95/95** 定向结果，初审反馈映射问题关闭，CP-09 schema2 业务字段完整性实现最终审核通过，可继续完整真实角色计时。仍不得把此合成完整字段结果等同于真实全书内容或五分钟目标已经通过。

## CP-10 程序派生来源索引代码审核

日期：2026-10-30。仅审核 `novel-import-ai.ts` 中 character 线格式和来源派生、固定提示及 `novel-import-character-source-index.test.ts`。未读取真实原书、模型配置、密钥或 journal；CP-11 此时仅通过方案/用例审核，不包含在本节代码结论中。

**CP-10 实现审核通过。** 接受集变化限定为已审角色线格式的机械来源声明，不影响 evidence 的真实定位或业务事实接受门，未发现阻塞性问题。

独立使用 Node v24.18.0 执行：

`node --import tsx --test tests/unit/novel-import-character-source-index.test.ts tests/unit/novel-import-evidence-rebind.test.ts tests/unit/novel-import-character-profile-ai.test.ts tests/unit/novel-import-ai.test.ts`

**43/43 通过**，约 2.7 秒，包含新三项 CP-10、全17字段保留、普通阶段精确 hash 及原 RB 接受/拒绝规则。

已确认：

- 仅 `characterEntityRequest` 分支将 sourceUnitIds 线格式变为可选字符串数组，输入最多600项、每项最多512字符；非字符串及超容量仍拒绝。其它普通/实体阶段沿用原 mandatory/min1/当前单位成员要求。
- `indexedArtifact` 的 transform 在同一 requestedEvidence 严格检查后执行，再用原 rebindEvidence 求真实所属 ID，返回“全部当前范围内合法声明 ID + 已定位证据 ID”的稳定去重集合。未将 foreign/实体 ID 当作授权，也没有改变原 quote 或给未知 evidence.unitId 猜目标。
- 生成桥及最终解析共用此 schema；产物在进入原 core/controller 前已有标准非空来源集合。该集合只可能由本次 units 中的 ID 构成，实际请求的原单位预算继续约束输出范围；未放宽输入/生成预算。重复解析确定性且幂等。
- CP-10a 实际覆盖缺省、空数组、纯foreign/实体 ID和合法/非法混合；合法但未摘录的 c/b ID 均保留，重复去重；唯一合法 rebind 的目标 b 加入来源集合，未删合法 c。facts/text/原合法 evidence 与模型对象快照保持不变。
- CP-10b 的合法索引不能挽救空证据、foreign evidence.unitId、虚构引用或两个候选导致无法唯一重定位的引用；坏数组类型/601项仍拒绝，错误角色关系也拒绝。普通 character analyze 与 scene entity 的缺失/foreign 来源仍拒绝，原 RB01–19 结果通过。
- CP-10c 通过 controller→runImportAi→generateImportAiJson→generateJSON，在模型不输出机械来源索引时一次生成完成；最终 artifact 的事实仍等于原值，全部实际 evidence 单元都在标准来源集合中。CP-09 继续证明全17个字段的完整链路保留。
- 固定 character 阶段形状不再列 sourceUnitIds 必填，相关固定说明统一为应用派生；其它阶段字符串保持原样，普通指纹回归通过。没有在 controller/core 添加豁免或通过替换证据降低原严格门。

应继续将 sourceUnitIds 报告为应用派生元数据，而不是声称原始模型声明从未有错。真实业务事实是否有据、全书是否全部完成及≤300秒仍须独立真实结果证明。本节不认证 r6 的私有错误原因或完成计数。

## CP-11 严格 optionIndex 引用代码审核

日期：2026-10-30。仅审核服务层 `wireEvidence`、选项显式索引的序列化副本、character 固定/纠错提示及 CP-11 测试。未读取真实原书、模型配置、密钥或私有 journal。

**CP-11 实现审核通过，可继续全部定向回归、构建及原件全书真实时限验收。** 未发现阻塞性问题；严格引用新线格式未将混合坏引文清洗为合法证据。

### 独立运行

Node v24.18.0：

`node --import tsx --test tests/unit/novel-import-character-source-index.test.ts tests/unit/novel-import-character-profile-ai.test.ts tests/unit/novel-import-character-evidence-options.test.ts tests/unit/novel-import-evidence-rebind.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-character-performance.test.ts`

**54/54 通过**，约 9.8 秒。包括 CP-01–04、06–11，17字段保留、来源派生、原严格 RB 门及普通阶段精确 payload/prompt 指纹。

### 已确认的边界

- `importAiResponseSchema` 先执行 selectedEntityTarget 的原选项前置核验；只有精确 characterEntityRequest 且选项非空才建立 reference schema。其余路径仍使用原 requestedEvidence，不开放索引形式。
- reference schema 是 `.strict()` 单键 `{optionIndex:number.int.min(0).max(length-1)}`，无 coercion。preprocess 仅在 reference.safeParse 完全成功时复制本请求选项；失败时完整保留原输入交旧严格证据 schema，未挑取合法索引、未删额外键或坏 quote。单项混合字段和同数组坏项均能使整体失败。
- 选项展开后的 unitId/quote 仍进入 requestedEvidence 的原 rebindEvidence 检查，再进入 CP-10 派生、schema2/身份/关系及 controller/core 严格门。最终仍是标准 evidence 对象，没有向下游传播 wire optionIndex，也没有任意搜索未提供材料。
- 序列化只在 character entity 的 provider 数据副本中附加每项 optionIndex，原 request 的选项对象仍保持严格二元组形状；CP-11a 比较原 request/模型对象快照、显式索引位置、响应及再次 parse 结果，均一致。规范结果重复解析幂等。
- 固定 character 提示明确优先用索引，或严格 unitId/quote，单项不混用；无选项时 phase-output-contract 仍列 unitId/quote。旧其它阶段精确指纹通过。controller 的单次纠错提示同样使用新形状及应用派生来源说明，仍保持最多两请求/四生成边界。
- CP-11a 选择不同单元的首/末索引，服务与schema还原同一真实引用及来源集合；直接引用选项外真实单元仍成功，text/facts/关系原样保持。
- CP-11b 实际拒绝负数、length边界、小数、字符串、额外键、optionIndex混合坏quote/unitId及空对象；每个坏项与一个好索引同数组时也拒绝。无选项、ordinary及scene路径拒绝索引；持续非法在实际生成桥两轮后失败。原 RB 的不实/未知/歧义引用继续拒绝。
- CP-11c 公开 controller action 经真实 runImportAi→generateImportAiJson→generateJSON，模型只回 `{optionIndex:0}` 时一次生成完成；最终 facts/text/evidence 与预期一致，来源包含真实单元，所有角色任务完成。CP-09 仍覆盖完整17字段。

审核期间指出 CP-11b 向必填 prompt 参数传 undefined 的测试问题；主代理已改为 `importAiPrompt(r)`，上述独立运行包含该修正，不修改生产生成桥签名。

本节只证明实现与合成回归正确，不声明真实全书角色已全部成功或总时长≤300秒。后续必须从完整新会话使用实际构建、真实模型及指定原件，按全部角色、零失败/跳过/丢弃和同一完整总表共同判定。

## WP-04 无选项提示微复核

日期：2026-10-30。主代理报告260项定向中仅 WP-04 失败；此处只微复核固定提示末尾的条件修正，不重复执行四分钟业务向导套件，也不独立认证主代理的全套计数。

修正后 optionIndex 的优先说明仅在 `characterEntity && request.entityTarget?.evidenceOptions?.length` 为真时使用；无选项的 character entity 恢复原“每项evidence引用真实输入unitId”直接引文句。roster 仍不索取引文，其它阶段保持原分支。此修正符合 CP-11 已审“没有已核验选项就不开放索引形式”，未修改测试来迁就输出，也未改变服务证据接受规则。

独立 Node v24.18.0 定向运行 WP-04、CP-11a、CP-11b、CP-09c：**4/4 通过**，约0.5秒。无选项 phase-output-contract、严格索引/混合字段拒绝、profile 提示及原 roster 无引文合同均保持。微复核通过，可继续主代理受影响子集复验、重新构建和新完整原件真实运行。

## CP-12/13 专属提示与31路容量代码审核

日期：2026-10-30。仅审核本轮专属角色提示、固定证据反馈映射、runtime 32项/32KiB容量及31路调度、相应合成测试；未读取私有原书、模型配置、密钥或真实 journal。本节为最新容量结论，取代前文15路/16项/16KiB的实现描述。

**本轮代码审核通过，未发现必须修改的阻塞项。** 可继续受影响定向回归、构建和新的完整真实时限验收。31路合成峰值与暂停证据完整性不等于全书已零错误或已达到≤300秒。

### 独立执行

Node v24.18.0：

`node --import tsx --test tests/unit/novel-import-character-prompt.test.ts tests/unit/novel-import-character-runtime-capacity.test.ts tests/unit/novel-import-character-performance.test.ts tests/unit/novel-import-character-references.test.ts tests/unit/novel-import-runtime-proof.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-evidence-rebind.test.ts`

**59/59 通过**，约7.4秒，包含 CP-12/13、新32项 proof 的真实保存/恢复、CI-01后续快照、普通阶段精确指纹及原严格证据负例。结果为独立执行所得；不将主代理报告的其它子集计数合并为本次审核运行。

### 提示与证据边界

- `semanticPrompt` 的新返回分支仍精确限定 semanticVersion=1 下的 analyze/entity/character。两处角色字段表均来自 `importFactFields('character',2)`，保留原基础字段、17个V2字段及关系/可靠性/归属/时间字段；完整保留5类原生JSON结构与字符串编码要求，不再附加场景/世界等原生输出表。目标ID/name/kind、确认roleType、单项非空目标、原文证据和不制造占位的合同仍在。
- 专属提示要求提取身份、外观、心理、能力、经历、动机、弧线、对白与人物关系；关系ID只引用本次已知角色，不因引用形式删减有据资料。四种可靠性、非客观信息的attribution及temporalScope，以及原 `IMPORT_KNOWLEDGE_CONTRACT` 均保留。小说、自由指令和作者解释仍明确为不可信资料，要求不执行其中指令、不改正文。原 request/units/完整服务端 entities 并未在本轮缩减或修改。
- 只有非空已核验 options 的角色提示要求生成每项仅用optionIndex；无选项仍列真实unitId/quote。此要求只约束生成提示，未改 CP-11 严格解析器，合法直接引文的兼容性与混合坏字段的整体拒绝继续由原测试通过。CP-12a同时比较请求快照、两类提示及全部V2字段。
- `importEvidenceFeedback` 仅为上述有选项角色的四种固定anchor原因附加索引说明。早期 requestedEvidence schema、生成桥reason识别及诊断候选查找均使用同一映射，精确匹配各自固定消息；普通/无选项反馈保持原消息。没有将模型坏引文或异常正文拼入纠错提示，未知reason和结构混合问题仍不能借anchor原因进入额外请求。
- CP-12b通过实际 controller→runImportAi→generateImportAiJson→generateJSON：前两次no-match后第三次用索引恢复，持续错误在第四次后拒绝；纠错含optionIndex且无坏quote哨兵，恢复时abilities/backstory原样保留。原 RB 子集继续拒绝虚构、未知、歧义和不可安全重定位引用；未将引用选项用作语义事实真实性的自动证明。

### 并发与容量边界

- `IMPORT_RUNTIME_MAX_CALLS=32`、`IMPORT_RUNTIME_MAX_BYTES=32768` 由runtime模块导出，schema、limits、parser和tracker使用同一上限；main的角色池取maxCalls−1，即31。其它实体仍4、图片仍2，roster保持原池。单调用1024字节上限未改变，自定义更小字节/项数预算继续有效。
- tracker在实际invoke前仍检查全体未来settled记录及完整diagnostics包装字节；parser仍检查每项、整个包装、ID/session/process/epoch/时间/唯一操作及remaining条件。没有截断calls、取消集合或序列化proof来凑容量，旧16项version1记录仍可读。
- CP-13a以64个真实合成角色请求阻塞并观测pending/runtime同时31，释放后角色任务/候选/artifact ID完整一致，场景实测峰值仍4。CI-01扩为64项后，8项中间提交含未完成前向关系，并确实继续组装新请求；完整64项结束通过原native映射且无跳过/丢弃。
- CP-13b在先提交8项后重新挂起31项，pause的取消operationId集合精确等于31项在途集合；artifact保留、active=0、drained proof全31项且remaining全零。恢复后8个已完成项各只请求一次，总请求64+31，取消重做计数一致。
- CP-13c向tracker注册32个真实未决Promise，第33项在executor前拒绝；完整32项proof通过encodeImportJournal及实际controller.initialize恢复后逐值相等。恢复使用合成publication会话，以遵守未保存草稿的既有关闭删除政策。32KiB以内完整对象可接受、16KiB自定义预算拒绝；旧runtime测试仍验证精确字节边界、单项边界、33项/32769字节非法预算及各资源remaining、持久化失败、身份/epoch负例。原16项小预算测试现显式设置maxTokens:16，保留原预算覆盖目的。

尚待真实验收：使用重新构建版本，从新完整会话运行指定原件；全部默认角色任务与产物逐ID对应，零失败/跳过/丢弃、严格证据/关系/资料完整性通过，且同一总表含识别和内部纠错≤300秒。r7的38项后no-match不构成成功结果，本节不认证其私有计数或原因。

## CP-14/15 确认身份保存与范围指纹复用代码审核

日期：2026-10-30。审核本轮main角色提交/阶段末身份预检、`ImportRuntimeScopeCache` 与生产ai接线、新identity/scope-cache测试及performance暂停计数、真实驱动失败保存补充。未读取r8私有快照、真实书稿、模型配置、密钥或真实journal，未调用真实模型。

**本轮代码审核通过，未发现必须修改的阻塞项。** 已确认别名不会再授权合并两个向导已选ID，缺失done角色会在删关系前拒绝；缓存仅复用同一有效授权阶段的已完整计算scopeHash。可继续受影响定向回归、构建与完整真实验收。

### 独立执行

Node v24.18.0：

`node --import tsx --test tests/unit/novel-import-character-identity.test.ts tests/unit/novel-import-character-scope-cache.test.ts tests/unit/novel-import-character-performance.test.ts tests/unit/novel-import-character-references.test.ts tests/unit/novel-import-character-runtime-capacity.test.ts tests/unit/novel-import-runtime-proof.test.ts`

**25/25通过**，约6.8秒，包含CP14/15全部新增项、真实31在途暂停/恢复、完整32项proof恢复及原runtime持久化/取消负例。另 `node --check scripts/run-lotm-wizard-import.mjs` 通过。此处不合并主代理的其它回归或类型检查计数。

### CP-14 已确认身份

- `runEntities` 仅kind=character且task.kind=entity时，以旧数组去除同ID后追加当前规范artifact的深副本。新数组先通过原 `validateImportArtifactCapacity` 才赋给session，再置task.done。不同ID间不会因name/aliases匹配而搬移facts、保留先到ID或生成无关字段冲突；普通merge、其它entity/settings路径仍保留原实现。
- 原目标/证据/schema2/native/确认roleType校验保持，来源复制仍经过原目标拷贝路径；按ID保存未添加服务或controller接受非法数据的豁免。计算容量失败不写入新数组，任务按原失败路径处理，保存失败仍使用原持久化边界。
- `resolveWizardReferences(character)` 先收集done的entity任务，再完整遍历已选角色候选，检查该ID恰好一条记录、kind为character且name等于确认值。所有预检完成后才进入原关系修改循环；不存在发现后一个缺失身份之前先删除前一条关系的路径。图片任务不参与done角色身份义务。
- CP-14a通过真实controller→runImportAi验证三个不同确认ID的交叉别名、不同能力/背景及显式关系，最终候选/task/artifact ID集合一致，逐IDfacts/text/evidence相等且无dropped/skipped。另直接验证通用merge仍将原别名对归并，未全局改sameEntity。
- CP-14b分别删除done记录、改kind、改name、加入重复ID；在该错误目标之前放置一条本可因主动skip删除的关系。调用实际resolve后抛错，整个session深度快照不变。单独正常skip场景仍只去外键、保留名字/描述并追加一条准确dropped。

### CP-15 范围指纹缓存

- 缓存是controller实例私有的WeakMap。命中比较session对象及id、epoch、workingRevision、grant对象/hash；命中前还要求传入grant就是当前analysisGrant。失配条目先删除，再同步执行原完整compute；结果必须等于捕获grantHash，且compute前后的session键和当前grant仍一致，才保存。compute异常或不等不会保存失败值，也不回退旧entry。
- main仅在semanticVersion=1的runtime分支内，对wizardVersion=1、verified=true、analyze/entity/character调用缓存；其它路径保持原importScopeHash。payloadHash仍直接散列每条实际payload，operationId和startedAt仍独立创建；模型与授权比较、原批次verify、预算/固定提示检查、接受结果时epoch/模型检查均未省略。缓存不进入session/journal或provider payload。
- CP-15a在真实64角色、31项初始在途及后续提交中包装生产缓存compute，并观测实际tracker.invoke元数据，完整scope只计算一次，全部64次调用的scopeHash等于独立原函数的当前完整hash，64个payloadHash不同。runtime.json本来有界，后续自动roster可淘汰最早记录；测试用真实invoke的完整64条观测验证调用，再逐条核对ledger残留ID/hash，未把有界采样冒充完整调用清单。verified=false及普通character分析实际不进入缓存。
- CP-15b逐个更换session对象、id、epoch、workingRevision、grant对象及同对象hash，每项均重新compute；连续错误计算反复拒绝并仍重新执行，之后合法计算恢复，证明失效后没有回用旧值。CP-15c首次或已预热后改epoch/grant为错误hash，正式controller角色路径均零AI请求；resolve在runtime.invoke参数求值时已拒绝，不能产生成功调用记录。
- 生产池CP-13b补充实际compute次数：31在途前只计算1次，8项已提交后pause取消完整集合，resume新epoch再计算1次（总2次），原8项不重做、最终全64项完成。原32/33容量与保存/恢复、来源/模型/epoch/持久化拒绝门继续通过。

### 验收驱动边界

character模式现在也会在import-char出现非重新授权类全局v.error时及时保存摘要、截图、私有session及观测调用样本，运行中经正常暂停后exit2；避免“全部done但阶段末失败”继续空等。driver异常catch在已确认隔离root后尽力保存当前私有session与调用样本，随后保留非零退出，未将异常改成成功或重试非瞬时结构问题。保存是尽力诊断，若读取当前会话本身失败，不能据此承诺每份私有文件必然存在。

完整性与时限仍未真实验收：r8任务done数与实际记录缺口、总时长343502ms仅为主代理报告，本节不读取或认证该现场。后续新构建必须重新以全部默认候选逐ID唯一角色记录、原事实/关系/来源与正文完整、零失败/跳过/丢弃，及含识别的同一总计≤300000ms共同判定。缓存CPU估算或合成25项通过不能替代该结果。

## NIW-C29 确定性进度采样微复核

日期：2026-10-30。仅审核 `tests/unit/novel-import-wizard-session.test.ts` 的C29改动，不改生产源码或构建产物。主代理报告原随机sleep采样在缓存提速后只能观察两态；此处不独立认证其余200/200或22项回归计数。

**微复核通过，无阻塞项。** 新测试为10个角色各设Promise gate，先实际等待请求池达到min(10,角色池上限)，全部仍阻塞时读取真实view中的done=0；仅释放8个目标，等待实际提交后稳定观察done=8；最后释放全部并观察done=10。剩余2个阻塞时无法提前跳过8这一状态，因此进度断言不再依赖机器速度或随机sleep恰好落在提交间隔。

原实际峰值、seen.size>2、10个entity任务全部done和10条schema2角色记录断言均保留。轮询有短上限，finally先释放全部gate再dispose，RED失败不会把AI Promise永久挂起。测试仍通过正式向导和真实view/journal观察进度，没有手改task完成状态或放宽生产保存节奏。

独立Node v24.18.0：`node --import tsx --test --test-name-pattern='NIW-C29:' tests/unit/novel-import-wizard-session.test.ts`，**1/1通过**，测试约2.2秒、进程约2.5秒。只改测试同步无需重新构建生产产物；真实全书完整性与总时限仍按后续实际运行结果判定。

## CP-16 慢写合并与完成证据保存代码审核

日期：2026-10-30。仅审核本轮main共享commit门、`novel-import-character-commit.test.ts` 及角色定向验收驱动完成顺序。未读取私有原书、r9现场、模型配置、密钥或真实journal，也未运行真实模型。

**本轮代码审核通过，未发现尚待修改的阻塞项。** 审核中发现测试首次保存等待无界，主代理已移除enteredPromise，改为基于performance.now、5秒上限的until(()=>held)；独立复验通过。可继续受影响回归、重新构建及新完整原件时限验收。

### 独立执行

Node v24.18.0：

`node --import tsx --test tests/unit/novel-import-character-commit.test.ts tests/unit/novel-import-character-identity.test.ts tests/unit/novel-import-character-scope-cache.test.ts tests/unit/novel-import-character-performance.test.ts tests/unit/novel-import-character-references.test.ts tests/unit/novel-import-character-runtime-capacity.test.ts tests/unit/novel-import-runtime-proof.test.ts`

**28/28通过**，约7.1秒。无界等待收紧后独立单跑 `novel-import-character-commit.test.ts`，**3/3再次通过**，约4.4秒。另 `node --check scripts/run-lotm-wizard-import.mjs` 通过。两次运行有重叠，不将其相加冒充31项不同测试；主代理报告的旧实现24次写/暂停18项RED未由本审核重新执行。

### 提交与暂停边界

- `committing` 为本次runEntities的局部Promise，只有kind=character才赋值。所有调用先等待它清空，再重新检查halt、当前epoch、force/8项/2秒阈值并splice当前缓冲；等待中的其它角色结果保留在缓冲，没有在等待前各取一小批。其它实体/settings没有新增gate，其原serial保存行为不变。
- 第一调用创建serial write后立即安装gate，先await实际write、更新lastSave，finally才清gate；已注册等待者随后重新循环，因此不会在旧lastSave下再排队下一批。容量、按确认ID保存、原task skip/依赖、image结果缓冲及serial内candidate/epoch检查都保持。终结force仍沿用同一等待门与完整取批，不漏不足8项尾部。
- 保存拒绝时第一等待者即时stop，取消在途AI/image并向外抛错；其它await同一write的worker也收到拒绝，无法继续排队提交或推进成功。finally清理不会吞错误。暂停若已在serial等待，后续批次仍须在serial内通过epoch检查；未提交缓冲不能越过正式pause边界获得done信用。
- 原save仍执行完整编码、owner检查、文件同步与原子rename，没有减少耐久性门、提前标记全部完成或改变journal格式。此优化减少冗余完整写，未省略实际必须保存的结果。

### CP-16测试观察

- CP-16a实际到31个在途请求，只放行首8项；包装生产save在进入首次保存时阻塞，释放后继续执行原真实encode/文件同步/rename。Date.now偏移5秒后只放行初始剩余23项，确认这些operation已退出并经过事件循环后才释放首写；自然补入的7个新请求继续挂起，不把pending总数误当初始23项完成。持久journal done=31时真实角色save恰两次（8+23），最终64个ID及逐ID能力值完整。
- CP-16b同一慢保存窗口中再放行10项，通过正式controller.act(pause)发起暂停，避免fixture预读current先排在serial造成假晚停。IO门未释放时pause未完成；释放后仅首8项落盘，缓冲10项未被提交。取消ID集合精确等于实际proof.calls，calls为自然补入后的20至31项、drained、所有remaining为零、operations=0。resume最终64项完成，原8个已保存目标各只请求一次。
- CP-16c从首个save门拒绝保存后，实际控制器归于failed，AI请求数不继续增加、列表未全部done、pending和operations归零。原runtime保存失败、取消等待、完整32项proof恢复、角色ID与前向关系子集同时通过。
- 所有首次AI/保存等待使用performance.now的短超时；finally恢复Date.now、释放IO/AI门后dispose。日期偏移只触发原批次时间阈值，没有伪造证据、返回值、proof身份或真实验收时钟。

### 角色验收与后置收尾

驱动在detect-scene首次观察处固定completedTick与总时长，先执行全部候选/task/artifact ID、done、零skip/drop、native可映射及新增零mappingWarnings、关系外键、原件/正文hash/章节/页面错误断言，再写独立角色元数据及私有完整session。任一角色断言或保存失败仍进入失败catch；超300秒仍保存performancePassed=false并exit4。

只有上述证据已保存后才重新读后续阶段状态：仍running且暂停按钮可见时短超时点击，已waiting则直接进入既有受控关闭。后置按钮/截图竞态仅记post-character-cleanup，不删除或覆盖先前角色证据、不重置计时，也不把超时改成成功。关闭仍只对已确认隔离root使用已声明的停止提示处理，不能作为原生暂停对话框验收。

r9的325228ms及546项完整仅为主代理报告，仍未达到五分钟；本轮合成测试不能证明真实提速幅度。后续必须新构建、新完整session，以全部默认角色逐ID资料/关系/来源完整、零错误/跳过/丢弃与含识别的同一总时长≤300000ms共同验收。
