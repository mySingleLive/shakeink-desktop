# 场景原生结构化输出用例独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。只审核269及最终268方案/审核和提出的模块API，未参与实现、读取真实数据/配置/Key或调用模型。

## 结论

**SO-01—05及SO-REAL设计通过，可以先取得RED再实施。** 真实SDK参数、专用wire到canonical、严格拒绝、模型/授权出口、预算和完整实际验收均已纳入。编写测试时应落实以下细化，避免只核对调用方意图或被其它错误提前拒绝。

- **SO-01**：经真实SDK捕获doStream的JSON responseFormat及同一服务器schema，不仅检查generateText入参。未显式提供时应验证未新增JSON/schema模式并保持SDK原默认text行为，不预设doStream.responseFormat一定为undefined。JSON Schema必须来自contract.jsonSchema，不能把带canonical transform的wireSchema转换成服务器schema。两次生成均携带相同格式合同，原配额、用量、取消和finishReason行为继续覆盖。
- **SO-02**：八facts字符串及三个恢复后的关联共同覆盖原11个非控制业务字段，保留完整text、四原生资料字段、归属、时段、确认父级和全部有效证据。reliability空串及references的-1是新wire明确的未知表示，只有这些选择值可规范省略；其它字符串含空串逐值保留。
- 同一不可变类型目录快照必须同时用于schema范围、可见副本referenceIndex和返回值恢复，覆盖完整entities及合法context artifacts；顺序、去重和同ID冲突规则应与原严格目录一致。构造相同整数在三张类型表各自有效的正例，不能把各表index0错误地视为跨类型负例。索引越界、错误值类型或错误catalog必须明确拒绝。
- 别名相关项和context-only artifact应在**实际prompt/payload**中有可用的referenceIndex，不仅存在于隐藏helper映射。当前通用serializer可能按规范名裁剪，而main自由instruction虽列别名相关目录却没有index；仅给既有payload.entities条目附index不足以证明别名可见性。该断言应使用真实别名夹具，且原request/units/artifacts/选项均不被原地改写。
- **SO-03**：未知键undefined须直接送schema/raw适配器，不能先JSON.stringify将其删除。root、facts、references和引文对象分别构造控制键/未知键、缺项、非法容器和值的独立反例；每例其它条件合法，不能让无关目标或引文错误先行拒绝。坏additional位于合法primary之后仍须整项失败，不能取第一项或过滤。新wire -1/空串表示不能扩散到普通canonical非法空引用。
- **SO-04**：检查实际Responses SDK出站的json_schema strict、reasoning none、store:false、相同模型ID及原授权origin/路径。forceReasoning须实际起效。合成Key只在主网关注入，worker仅有占位值；不输出请求中的凭证。排除其它provider/ID、非根路径、query/凭证、错阶段及无选项；非eligible的structuredSceneModel保持原resolved对象和既有行为。失败不得换模型、端点或降级。
- **SO-05**：wire合法不等于最终合法。用可通过wire形状但会触发原Unicode、知识或其它canonical门的独立反例，证明转换后仍经过原门与最终授权/取消检查。恢复和持续失败分别核对请求、generateText次数，最多2请求/4生成；网络/授权/取消/格式不支持不增加外层恢复。SDK原始错误及cause不能进入公开诊断或纠错反馈。
- schema和实际新增index元数据成本须进入预算。大catalog测试证明schema不随ID列表线性膨胀；预算反例在生成前拒绝，同时逐值核对units及选项未被裁减。不要仅比较声称的预算数字而漏掉实际发出的schema/元数据。

模块API分工合理：supportsStructuredScene限定能力范围；createStructuredSceneContract绑定输入快照、严格wire及canonical适配；structuredSceneModel仅改变eligible的协议适配，保留原记录和授权出口。构造contract时的目标、目录及引文合法性仍须独立检查，不能仅信任能力布尔值。

SO-REAL顺序合理：独立代码审核和本地定向检查后先做完整wire纯合成实际探针，再做失败目标只读复测及新session全文全场景。单字段探针、局部目标成功、模型返回schema合规或计数非空都不能代替最终全部任务/资料/父级/正文、正常保存退出及数据库重开核对。不运行全仓测试，不累计重复验证或历史部分进度为整书成功。

本审核仅通过测试设计，未执行新增用例或认证实际API/整书结果。
