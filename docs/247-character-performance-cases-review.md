# 五分钟角色导入用例独立审核

日期：2026-10-30。审核者：独立子代理 `character_review`。审核 `247-character-performance-cases.md`，对照已审 246 方案、当前实体调度/暂停边界、共享 LongTaskQueue 与运行时证据上限。只审核用例设计，未读取真实书稿、模型配置、密钥或 journal，未执行尚未实现的性能测试。

## 结论

**通过，可进入 RED/GREEN。** CP-01/04 的实际挂起门、CP-03 的真实饱和队列和 CP-REAL 的含识别整批总计时能够分别验证调度、实际旁路、取消恢复与真实性能目标。未发现需要改变方案的用例阻塞项。测试通过仍不能代替真实全选角色在 300 秒内完成。

## 实现时的明确断言

1. **CP-01 的两个上限分开。** handler 的角色实际峰值须 `===15`，且整个运行始终 `<=15`；runtime 协议上限另外保持 16。不能把“峰值不超过 16”当作角色调度上限正确。runtime.json 同时存在 15 个不同 operationId 的 pending 记录，全部任务候选对应关系不丢。scene 用自己的 ≥8 项清单和挂起门，实际峰值恰好 4；图片不开启时不影响角色计数，图片的原 2 路由既有定向回归保持。
2. **CP-02 测生产范围判定及供应商选项。** 语义版本、phase、intent、kind 四个条件分别有反例；普通 character analyze 不得因 kind 同名获得轻量策略。输入 resolvedModel/modelRecord/providerOptions 深度快照不被改写，保留 store:false、其他供应商选项、abortSignal 和授权快照；自由 instruction 不影响判定。roster 的原有适用范围不应被本轮意外缩小。
3. **CP-03 必须让普通分支真实阻塞。** 用真实 acquireLongTask(signal,2) 先占满两席，通过 defaults.generate 实际调用的同一 lane helper 执行 acquireLongTask：角色旁路可在两席仍占用时完成，普通请求的 work 尚未取得名额、真实 waiting 增加，释放后才完成。不能把“Promise 已创建”误判为普通请求已执行。独立启动的普通请求不能继承角色 AsyncLocalStorage 上下文。所有 release 幂等清理、恢复原 limit；阻塞/取消都有短超时，RED 不挂住队列。
4. **CP-04 用可识别的确定性集合。** 先允许恰好 8 个角色完成且在 journal 落盘，再等待其余请求补满为恰好 15 个在途；记录候选和 operationId 两种集合。pause 前冻结 pending ID，cancelAi 必须逐个使真实 Promise settle，最终 cancelled 集合与冻结集合相等。proof.calls 的 ID 集合也应相等且 length=15，state=drained，所有 remaining 计数为零，字节/结构解析有效。不能只断言 cancelled>=某个数。
5. **暂停后的无写入与恢复分开。** pause 完成后验证 artifacts 和已完成任务恰好保留那 8 个，等迟到返回 settle 后仍相同；恢复再核对 8 个 candidateId 的请求次数不增加，未完成项最终全部 done、无 skipped/dropped，候选/task/artifact ID 集合相等。被取消任务恢复重新请求是允许行为，不应误判为重复完成项。
6. **CP-05 不删除旧约束。** 旧“实体4路”断言要拆成角色15/场景等4路；来源检查中途失败、运行时写盘失败、暂停、内部最多2请求/4生成、未知单元/虚构引文与错误目标等继续拒绝或按既有有限规则处理，不能因性能改动缩减覆盖。

## 真实总计时

CP-REAL 的总表从“允许分析并导入”按钮动作之前开始，到全部角色完成且关系解析完成后的下一步骤观察结束，包含识别、自动全选确认等待、所有内部纠错/网络重试和观察延迟。使用单调时钟计算 duration，ISO 时间仅作人类可读绑定；第 10 步时间单独记录，不覆盖总表。全部起止必须来自同一个新建完整会话，暂停、重启、重试都不清零。

≤1 秒轮询将观测结束作为保守上界；不要扣减估算的模型/识别/写盘时间。超 300000ms 仍保存真实结果：全部完成可记正确性通过、性能失败；未全部完成则两者都不能记全书通过。最终验证所有默认全选候选、task candidateId、artifact ID 一一对应、最终状态全 done、failed/skipped/dropped=0、引用可解析、源件/正文 hash 不变及零页面错误。

调用样本继续注明 `observed`，不把 runtime 最近 64 条采样宣称为无遗漏的 provider 生成/网络重试总数。真实内容的有据字段与关系不能为压缩耗时而清空，未知字段继续空缺；结构门只证明结构和引用，不替代对原文内容的核对。受控选择器限制与真实模型/真实 Electron 运行分别如实记录。

## r5 补充用例审核：CP-06/07/08

日期：2026-10-30。在 246 的 r5 补充方案审核通过后，接续审核 247 新增“r5 引用复制与重复目录补充”。未读取真实运行资料，未执行尚未完成的新增测试。

**补充用例通过，可进入 RED/GREEN。** CP-06 区分自由目录与完整可信目录，CP-07 约束选项本身的生成前真实性，CP-08 验证真实生成链重新产生合法引用而非本地替换坏引文，能够覆盖本次优化的正确性边界。原 RB 拒绝门不应修改。

实现测试时明确：

1. CP-06 的“不同正文单元”须在实际 workingUnits 合并后仍不同；很短的 30 段可能被 adjacent coalescing 合成少数单元，从而每个请求仍包含几乎全部名字，无法证明筛选有效。夹具应使请求包含目标/相关别名，同时确实存在不在该请求材料内的无关候选；直接断言该前提。
2. 比较 request.units 的完整对象/ID 与本轮前既有选择行为，比较 request.entities 与全部已选候选；只在 instruction 中解析并检查相关目录，不要把 serializer 本来就会过滤的 provider entities 数量误当成服务端完整目录丢失。保留目标、别名命中的关系对象及固定候选顺序。
3. CP-07 的首尾分布指**多个独立选项分布在首尾单元**，不是一个 quote 跨单元拼接。每个选项逐条用所属 unit.text.includes(quote) 及 Unicode 完整性验证；加入 astral 字符/换行夹具、无匹配省略、最多8项与单项长度上限。没有选项也不能制造一个默认引文。
4. 非法 unitId、伪造/空白 quote、容量越界及断开的 surrogate 分别验证 `runImportAi`、直接 schema 工厂/生成桥的前置拒绝，模型 resolve/generate/generateText 次数为零；错误文字不回显合成秘密哨兵。对非 character entity 或其它阶段添加 evidenceOptions 也须按方案拒绝或完全不影响原请求；不把新结构默默用于普通阶段。
5. “非白化”正例应给出一个不在 evidenceOptions 中、但真实存在于本次 unit 的合法 quote，经过实际服务层后原样保留，证明选项不是唯一许可列表；负例给不在任何 request unit 的长引文，最终仍经原定位器拒绝。不能在结果层将其替换为选项后宣称通过。
6. CP-08 的前两次 no-match 由真实请求绑定 schema/生成桥产生，非 fixture 直接抛同名异常；第三次模型输出复制真实选项并保持预期资料/关系，断言两个 controller 请求、三次 generateText，持续非法恰好四次后失败且无 artifact。合成坏引文应不存在于任何请求单元，避免意外触发现有合法 rebind。
7. unknown-unit、too-short、ambiguous 的固定原因仍仅多一次外层机会，未知 reason、额外后缀及括号任意文本不重试、不进入新提示。exact 短引用的原合法性仍保留；不能为让测试方便而修改原 anchor/rebind 接受集或改写 RB03/RB04 的预期。

普通阶段 hash、15路及scene4路、暂停恢复、字段纠错和权限/预算/持久化排除测试继续定向通过后，再做原件全书真实计时。全部角色默认全选、零失败/跳过/丢弃与总时长 ≤300000ms 仍为共同条件；此前 r5 的局部完成不能计为通过。

## CP-09 角色业务 schema2 完整性用例审核

日期：2026-10-30。在 246 schema2 补充方案审核通过后，单独审核 247 新增 CP-09。此时该部分尚未实现，未运行新增测试或读取真实资料。

**用例通过，可进入 RED/GREEN。** 经真实服务生成链进入 controller，并比较最终 facts 原值及原生 profile，能覆盖 NIW-C41 绕过服务层遗漏的版本差异；非法 V2 结构纠错与普通阶段不升级的负例是必要边界。

实现时必须具体断言：

- 正例通过公开 controller action → runImportAi → generateImportAiJson → generateJSON，仅 generateText 受控。返回覆盖全部17个 `IMPORT_SEMANTIC_V2_FIELDS.character`（至少逐字段列出并与集合比对，不能只测 abilities/backstory 两个文本），同时有 base 字段、关系和真实定位证据；服务层返回原始对象不含 schema，facts 的字符串、JSON 空白/换行/Unicode 逐字不变；最终 controller artifact.schema=2，全部字段仍在，native profile 的17个字段可读且值符合既有投影语义。
- 各自用 motivations 错误嵌套、bigFive 越界/非整数、arcStages 非法嵌套或额外键作为首次响应，第二轮合法。断言实际 generateText 恰好两次、反馈由真实响应 schema 原生检查产生、最终对象等于合法样例；不能在 fixture 手动抛错误模拟早期纠错。
- 持续非法保持单个生成桥两轮拒绝；经 controller 的全链最多两请求/四生成后 task 失败且该角色无 artifact，不能削掉坏字段后成功。未知业务键和模型自带 schema 字段仍拒绝。
- 单独检查直接响应 schema 工厂和 runImportAi 均接受合法 V2/拒绝非法 V2；普通 character analyze 及其它阶段保持原未授权 V2 接受边界，原有指纹不改。固定 entity encoding 表和 native 表都包含真实 schema2 全集，不保留相互矛盾的 base-only 限制；五类 JSON 结构合同与原生验证器一致，并通过固定提示预算检查。
- 原始输入 request、受控合法输出对象深度快照在服务校验前后不被改写；新验证副本不能污染后续哈希、目录身份、锁字段和证据。保留 CI-01–09、CP-01–08、RB 与授权/取消/预算/持久化排除的定向回归。

真实大书字段有据性不能由合成正例证明；未知字段应省略或按原合同留空，不能为了“完整字段”填造数值或占位内容。此处用例“全套”仅指合成资料明确提供了所有合法业务字段时，全链应完整保留它们。

## CP-10 程序派生来源索引用例审核

日期：2026-10-30。在 246 的 r6 来源派生方案审核通过后，接续审核新增 CP-10。该部分尚未实现，本审核未读取真实资料或执行新增用例。

**用例通过，可进入 RED/GREEN。** 缺省/空数组/错误机械 ID 与合法 evidence 的组合正例，以及合法声明无法挽救坏 evidence 的负例，能区分“来源集合由程序派生”与“掩盖真正证据错误”。ordinary/其它 entity 不获得该兼容是必要范围门。

必须具体断言：

- 分别输入缺省、[]、仅 foreign、仅实体 ID、合法+foreign 混合、合法未摘录单位、重复合法 ID；期望标准来源集合由当前 units 的全部合法声明与真实定位证据组成，确定性排序/去重不影响合法成员。至少一例包含合法未摘录来源，确保不是只保留 evidence IDs 而丢弃原溯源。
- 同一正例经过直接响应 schema 工厂、实际 generateImportAiJson 与 runImportAi，结果集合一致且再次解析幂等；公开 controller action 链最终仍完整标准 artifact，严格 core 门照常通过。原 request 和原模型对象不被原地修改；text/facts/全部17个V2字段/关系逐值保持。
- 直接证据引用、既有排版恢复和唯一真实单元 rebind 各有一例；真正定位目标 ID 在集合中，合法声明仍保留，原 RB 的允许/拒绝集与规范输出不变。只对既有定位规则允许的情况比较规范 evidence；本轮不添加新的证据转换。
- 反例交叉组合“合法 sourceUnitIds + 缺失/空 evidence、foreign evidence.unitId、伪造 quote、两个真实候选导致无法唯一 rebind 的 quote”，必须失败，不能先派生一个合法数组就绕过证据门。持续非法证据仍按既有最多两请求/四生成失败，不能提交 artifact。
- 字符串数组之外的对象/数字/混合类型、数组超上限等仍拒绝；sourceUnitIds 的容量边界要有明确数字，并检查派生后结果也满足当前请求范围/容量，而不是只限制输入数组。外部声明不写入新提示或日志。
- 普通 character analyze、scene/item/world entity 及旧阶段缺失/foreign 来源声明仍拒绝；固定 character 输出契约不再要求模型填写索引，其他阶段固定提示 hash 不改变。新增派生不得全局修改 artifact schema。

审核通过允许按新契约派生此元数据，不允许将非法事实、引文或关系清洗成成功。后续真实验收仍须全书、默认全选、零失败/跳过/丢弃且同一总表≤300000ms。

## CP-11 严格 optionIndex 引用用例审核

日期：2026-10-30。在 246 严格索引方案通过后接续审核 CP-11；尚未实现，未运行新增测试或读取真实数据。

**用例通过，可实施并进入 RED/GREEN。** 请求选项前置核验、严格单项响应表单、最终展开和幂等性的覆盖方向正确。重点防止仅因某项有合法 optionIndex 就忽略同项/同数组中的坏引文。

测试实现应包括：

- 两个以上不同 unit 的已核验选项，分别选首项、末项和重复合法索引；直接响应工厂、真实生成桥、runImportAi 与 controller 最终均输出预期同一真实 unitId/quote，来源集合含对应 unit，全部事实/关系原样保留，规范结果再次解析幂等。
- 精确反例：index=length、负数、小数、字符串数字、null、空对象、额外键、optionIndex与坏quote/foreign unitId混合、optionIndex与**合法**unitId/quote混合（也违反严格单项形状）。同数组一项好索引加一项坏原始 quote 必须整体拒绝，不能删坏项后成功。
- 无选项、其它 phase/intent/kind/legacy 均拒绝索引形式；非法请求选项仍在 model resolve/generate 前拒绝。原合法显式 unitId/quote 可以位于选项之外，原 unknown-unit/no-match/歧义拒绝及诊断不变。
- 序列化输出中每项 optionIndex恰等于数组位置，且 request 深度快照不改；模型输入选项表可包含索引用于选择，响应单项只允许 `{optionIndex}` 或原严格二元组，不允许模型带回并覆盖选项表。
- 真正经过 generateJSON 的首次非法索引/混合项、第二次合法索引才可成功；持续非法单次生成桥两轮拒绝，controller全链仍最多两请求/四生成失败。必须由真实 schema 产生拒绝，不在 fixture 手抛同名错误替代验证。

此设计与 CP-10 共同改变的是 character 的受控线格式与机械来源集合职责，不放宽内容事实或原文证据的真实性；普通阶段 hash、RB 和完整资料保留回归继续通过后才能进入真实整书计时。

## CP-12/13 角色专属提示与32项容量用例审核

日期：2026-10-30。在246的r7补充方案通过后审核 CP-12/13a/b/c；尚未实现，未执行新增用例或读取私有资料。

**用例通过，可实施并进入 RED/GREEN。** 专属提示、请求范围内静态证据反馈、真实31路与完整取消集合、32/33及字节边界分别覆盖了新方案的主要职责。

实现时注意：

- CP-12 通过真实生成入口取得专属完整提示，断言目标/确认类型、base+17扩展字段、全部结构/证据/关系/归属/未知规则、不改正文及资料不授权均在；world/scene/worldline/narrative的无关输出契约不应混入。units与完整服务目录快照相等，普通阶段沿用原精确hash，不能重写旧golden。
- 有选项与无选项分别断言固定输出形状；合法直接引用仍走旧严格规则成功。有选项时四类anchor的实际 schema反馈与 reason识别均能精确对应且含固定编号说明；其它阶段消息原样。加入“第一轮anchor错、第二轮结构错”或未知reason反例，确认没有陈旧reason继承。
- 正式 controller→runImportAi→generateImportAiJson 链前两轮真实坏quote、第三轮索引恢复为2请求/3生成；持续坏值2请求/4生成后失败且无该artifact。不能由fixture直接抛同名异常替代schema触发。业务事实及关系不清空。
- CP-13a 使用≥64候选和确定性有界同步门，handler与runtime都实际31个不同操作在途，整个角色峰值恰31；恢复放行后候选/task/artifact及关系完整。场景仍实测4，roster15的独立断言保留；不要只改常量或删旧并发回归。
- CP-13b 先真实落盘8项，再补满31在途；冻结operationId集合，正式pause后 cancelled与proof.calls的集合都精确等于它，calls=31、drained、所有remaining=0，迟到settle后业务快照不变。resume已完成8项请求次数不增加，取消项可重做，最终全量一致。
- CP-13c 用32个**不同且身份/时间合法**的tracker调用证明容量，33拒绝且不会调用被拒绝的执行器；settle后可重新使用容量。构造完整32项有效proof通过parse、encode与允许保留的恢复路径；旧16项同样通过。不能拿重复ID导致拒绝冒充第33项容量边界。
- 字节边界测完整diagnostics封装的准确UTF-8 bytes：等于预算通过，预算减一拒绝；整体32769/配置超32KiB、单项配置1025、maxTokens33拒绝，自定义较小预算仍有效。未知键、错session/process/epoch、时间逆序、非零remaining各自独立拒绝。原身份/hash与业务状态/计划hash不因容量变更改变。
- 31项journal保存/恢复不能为测试方便撤销“未保存草稿关闭即删除”；沿用原可恢复会话边界或codec路径，明确测试证明了哪种恢复。所有挂起门和队列等待带短超时且finally取消/释放，RED不能挂住。

本轮把原CP04/相关上限从15/16更新到31/32时，应保留精确ID集合与原失败负例，不以删除断言迁就实现。真实≤300000ms仍只由后续完整原件、新会话、全部全选成功共同证明。

## CP-14 已确认ID保存与缺失done拒绝用例审核

日期：2026-10-30。在246的r8补充方案通过后审核新增CP-14/14b；只读取源码及合成设计，未读取真实快照或执行尚未实现的用例。

**用例通过，可实施并进入 RED/GREEN。** 跨候选别名重叠的正式服务链正例能暴露原通用merge吞ID；阶段末缺失/错身份负例能区分已完成数据损坏与作者主动skip。测试需保留如下具体断言：

- 至少三个已确认不同ID，aliases有据包含另一已选角色名，模型返回逐ID不同的text、全部所测facts（含V2）和显式characterId关系链。通过实际controller→runImportAi返回后，任务candidateId集合、确认候选ID和artifact ID精确对应，各ID的text/facts/aliases/证据与原返回逐值相等，关系外键原样不丢，无dropped/skipped；不能只断言done数量或对全部artifact做无ID的值比较。
- 应固定返回顺序复现旧实现后到ID消失的RED；新实现至少覆盖相反先后顺序也保持各自ID与资料。原通用merge单独仍按别名归并，证明没有全局修改sameEntity。来源复制及其它entity/settings沿用原定向回归。
- CP-14b独立构造删除done记录、同ID重复记录、kind错配、name错配；确认目标仍selected、对应entity task仍done。每种都在阶段末关系处理前拒绝，比较整个artifact事实/关系和dropped深度快照不变。不能由测试预先调用native门抛错代替实际resolve入口。
- 原子性夹具应先放一条本来可因主动skip而删除的关系，再放缺失/错身份的done目标；失败后前一条外键与dropped也不变，以捕捉“先删前项、后发现缺失”的不完整预检。正常完整会话必须成功且关系全保留。
- 主动skipped目标以正式动作或符合原状态机的夹具实现，继续保留名字/描述、仅移除未导入外键并记录准确dropped；没有缺失done时才允许这一步。图片task的done不应被误当成独立角色实体保存义务。
- 容量门须在新数组提交/置done之前执行；可复用既有累计容量失败用例确认不留下新增角色或假done。原严格证据、确认身份/类型、关系外键、暂停迟到和保存失败回归不能删除。

本节只批准测试设计，不认证r8私有计数。新真实运行仍须把全部默认已选候选逐ID映射到唯一角色记录，事实/关系/来源与正文完整，零失败/跳过/丢弃，且含识别的总时长≤300000ms；若只done数相等而记录缺失，必须判失败。

## CP-15 范围指纹缓存用例审核

日期：2026-10-30。在246缓存方案通过后审核CP-15及恢复/失效用例；尚未实现或运行新增测试，未读取私有性能输入。

**用例通过，可实施并进入 RED/GREEN。** 实际controller计数与runtime hash比对、逐个缓存键失效及首次授权不等拒绝能够检验本次优化，不能只测一个未接入ai的缓存helper。

测试实现应包括：

1. ≥64合成角色、真实31项在途与至少一次中间提交，包装生产ai路径实际调用的compute，统计完整importScopeHash计算仅一次。用未包装的原函数独立求基准值，逐条runtime调用的scopeHash完全相等；每条payloadHash仍等于该条实际序列化payload的hash，不用“一次scope计算”推导全部runtime正确。
2. 在相同session对象/id+epoch+workingRevision+grant对象/hash下多次命中，session.revision/updatedAt或artifact进度变化不必失效。分别更换session对象、id、epoch、workingRevision、grant对象及原对象的hash，每种均重新执行compute，不能由同时改多个键冒充逐键覆盖。
3. 首次计算与grant.hash不等时，实际AI执行器、runtime invoke及成功记录均未发生；修正授权后重试须重新计算成功，证明失败结果未缓存。命中后使某个键失效并得到不等结果也应同样拒绝，而非回用旧缓存。
4. verified=false、非wizard/semantic版本、普通角色analyze、roster、scene/item/world entity、review/reconcile/patch保持原计算；不要把测试mock当成生产允许传入任意hash的接口。缓存不进入journal、payload或共享全局持久状态。
5. 正式pause→resume产生新epoch后重新计算，已完成项次数不变；模型/撤权仍在真实ai入口拒绝。来源变化仍通过原批次verify中止所有在途，不因缓存scope而略过来源检查。patch经workingRevision与grant更新失效，实际新controller/重开对象不复用旧cache。
6. 保留NI-RT、CP13的身份/时序、取消完整proof与持久化负例；保留请求材料、字段、关系及完整ID集合断言。性能测试只证明少做等价计算，不能用合成CPU计数或343502ms减估算值代替新完整原件≤300000ms实测。

上述失效用例以生产状态机允许的授权scope变更为边界；若实现中发现任何合法路径能在所有缓存键不变时改变scope，须先修正失效设计并补反例，不能删掉hash正确性断言。

## CP-16 慢写合并与完成证据先保存用例审核

日期：2026-10-30。在246的CP-16方案通过后审核新增CP-16a/b及CP-REAL完成顺序；尚未实现/执行，未读取真实现场。

**用例通过，可实施并进入 RED/GREEN。** 用实际慢首写及超过2秒的时钟条件复现旧实现逐项排队，能证明问题来自批次取得时机；真实pause/保存失败负例则防止“少写”改变持久化与取消语义。

实施要求：

- CP-16a使用≥64角色并真实达到31在途；只放行8项，实际生产save已进入且被IO门阻塞，确认其它23项尚未提交。推进Date.now使lastSave超过2秒后放行这23个模型返回，后续新请求继续阻塞，确保没有额外结果混入计数。释放首写后，实际保存done=31应恰为8+23两次角色提交；明确计数范围，排除初始规划/最后阶段推进等无关checkpoint保存。
- RED必须经过原commit/serial路径出现实际写放大，不能用mock直接返回“24次”。save门应包装而非替换原保存，最终继续真实encode/文件IO；比较持久journal中的done及artifact数，不能把内存task.done当成落盘。再次放行全部64项，逐ID事实/关系/来源完整且零跳过/丢弃；尾批不足8项最终仍实际保存。
- 计时注入只用于触发原2秒阈值，不更改payload/proof时间身份或真实timer实现。轮询/门应有实际有界超时，finally恢复Date.now并释放全部AI、IO门，RED不能因冻结时钟而永久等待。
- CP-16b在同样慢首写窗口发起正式pause，验证pause在IO未释放时未完成；随后释放IO，实际取消全部当时在途AI并等待其Promise settle，proof完整、零remaining、无迟到业务写入。按最终已落盘ID记录resume次数；未持久化缓冲不得伪装成已完成，已持久化8项不重做。
- 保存拒绝必须从实际commit等待链传播，停止新调度、不推进到成功阶段；所有等待该commit的worker都能退出并清理。原runtime/session持久化失败、来源变化及epoch拒绝回归保留，scene/item/world/settings的原保存策略不受新角色gate影响。
- CP-REAL先执行原全部角色ID/native/关系/来源/正文与页面错误断言，保存固定起止时刻、含识别总时长、performancePassed及私有完整结果，再独立处理下一阶段pause/关闭。覆盖下一阶段已waiting与仍running两种状态，后置按钮竞态只产生独立收尾错误，不能导致角色结果文件缺失、时钟重置或超时被翻为通过。

本轮合成测试证明提交合并与保存边界，不能据“旧24次/新2次”的节省估算宣布真实五分钟通过；仍按新完整原件同一总表验收。
