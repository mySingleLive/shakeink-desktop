# 证据失败小批次治愈方案及用例独立审核

日期：2026-10-27（Asia/Shanghai）。审核者：独立子代理 `lotm_test_review`。对象：`17-evidence-batch-healing-plan.md` 与 LOTM-E01–06。仅读取方案、真实流程相关源码和既有生成/验证/IPC边界；未修改生产、未操作UI、未读取运行中数据库/journal或调用真实模型。

## 初审结论

**二分完整来源单元、保持严格证据门的方向可行；明确以下两项识别/传输规则后可进入 RED/TDD。** 当前方案合理地区分小包执行策略与“模型一定成功”，不改正文、单元、冻结预算或同意范围，也不以单元失败放行为治愈。两次真实大纲失败应继续保留；本审核不把合成拆包测试当作本书成功。

## 进入RED前须明确的两项

1. **前6条诊断不能证明全部错误都是证据错误。** `src/lib/ai/generate.ts:241–242`仅保存前6条issues的路径/feedback，`StructuredGenerationError`没有总数或截断标记。若只对这6条做every检查，会把第7条其他字段错误误认为“纯证据失败”。保持17当前两生产文件scope的最小保守规则为：仅接受1–5条，invalidFields与feedback数组长度相等且逐项对应，路径为完整规范的 `artifacts.<安全非负整数>.evidence.<安全非负整数>`，feedback精确等于“该路径 + 固定分隔 + 本地四种message之一”。0条、6条及以上、数组不齐、路径截断/未知、任何其它字段或非白名单反馈均不拆分。若要允许≥6条，应先扩大方案到生成器的无原文完整性/typed provenance诊断，不能凭已有截断数组猜测。E01必须覆盖“前6条证据、第7条其他错误”的实际generateJSON路径。
2. **自定义error类型/属性不会跨真实RPC。** `desktop/service/rpc.ts`只发送error.message并在接收端创建普通Error；服务侧 `reason` 属性或class身份会消失。main应完整且严格匹配保留的四种固定reason消息，或先明确定义受限typed RPC协议（后者会扩大scope）；不能用contains或近似正则，也不能只instanceof服务侧class。E01/E02至少增加一次真实RpcPeer合成往返的诊断识别，包含近似文本/未知reason不触发，避免仅直接函数注入通过而真实UI没有二分。

以上保守拒绝可能让某些真实证据失败仍不能拆分，这是可接受的据实停止；不得为保证本次模型能跑通而放宽判定或引文锚定。

## 其余实现与E01–06必须保留的断言

- **错误来源精确。** schema路径与本地message成对验证；四种reason映射到固定安全文本，不输出quote/unitId/供应商反馈或未知错误正文。已有late anchorEvidence的固定诊断可统一消费，但JSON语法、incomplete、网络/认证/配额、payload/固定预留、native映射/锁校验、其他schema错误均不能触发此回退。取消信号或epoch失效时优先停止，不重新分类错误为可重试。
- **只接普通语义分析。** semanticVersion1、phase=analyze且非reconcile的已选目标才允许二分；legacy、classify、review、patch、reconcile合同原样。`this.ai`已有阶段允许列表规定普通analyze不能返回conflicts；E04应通过合法artifact合并生成真实冲突，不能用测试注入越权conflicts冒充正常分析路径。
- **二分的是确切失败包。** 按失败请求units原顺序在完整单元边界二分，子包非空、严格变小，保留id/fileId/start/end/text/kind/part等所有字段；不拿全部pending重新拼父包，不切文本或改ID。一个单元失败停止；有限二叉树不是无限重试。记录实际失败/成功操作，不把父失败请求算完成。
- **每个叶包独立原子提交。** 响应通过stage、来源ID、精确证据、native、引用和锁等完整验证后，才把该包artifact/冲突及其确切unit-ID覆盖放进同一checkpoint。右包失败保留左包成功检查点；父包不可一次性填充两边coverage。失败或暂停/迟到响应不能增加coverage。冲突出现立即停止兄弟、下一目标和发布。
- **上下文和预算保持新鲜。** 左包提交后重新从当前session构造右包artifacts/entities/locks和chapter上下文，并经stageRequests/requestSnapshot、payload预算、固定提示词预留和this.ai完整门。不重用父请求的过期实体目录，不删字段来塞入。上下文增大导致子包预算失败时按现有预算错误停止，不能再按“证据问题”回退。
- **恢复不重发成功项。** 临时二分队列可不持久化，但恢复必须按原unit覆盖筛出未完成项；同一正文/预算几何下左包已提交ID不能重发。跨进程重新核对来源、模型、保存目录及发送同意，不沿用旧进程grant。E03使用真实controller保存/关闭/重开及重新授权，不能只构造一个新的内存pending数组声称恢复通过。
- **范围与证据。** 定向E测试可用合成模型响应验证协议，但正式B1仍使用同一完整1394章和真实模型；不得向生产模型注入mock或独立oracle答案。生产修复重建后追加真实构建绑定，不改旧run/旧错误以抹平差异。

明确上述两项后，E01–06足以覆盖本次策略与直接必要回归；不得扩展全仓测试。代码完成后仍需独立审核及同一正式全书真实复测，任何合成GREEN都不能代替九项终验。

## 追加复审：完整issues观察与固定消息规则

复审日期：2026-10-27。已阅读17追加的“初审后的识别与执行规则”，并核对既有generateJSON的候选/两轮生成结构及RPC仅传message的实际边界。未实施或运行产品治愈。

**修订后的技术方案及E01–06用例审核通过，允许进入RED/TDD。** 每次schema解析前清空本地状态、最后只读观察完整Zod issues、仅全部匹配证据custom路径及本地固定message才分类，可以避免截断前6项的不充分推断；结构abort时钩子不运行保持undefined，成功清空，且仅最终抛出invalid_schema时消费本次完整分类，均为必要门。若实际公开钩子行为不能证明完整性，仍按原初审1–5条保守方案停止或拒绝拆分，不能把内部私有Zod状态当已批准接口。

E01需实际经generateImportAiJson→generateJSON→schema证明：超过6条纯证据custom问题可被完整观察；第7条非证据、类型abort、unrecognized_keys混合不触发；前候选/前轮证据失败后遇到另一非证据错误不会借用旧reason；成功解析清空；JSON/incomplete/取消不消费旧分类。错误输出仍只有固定reason，不输出观察到的原issues值或原文。

实际RPC往返后精确四消息识别及近似/追加字符拒绝已明确，解决跨进程class/属性丢失问题。合法artifact合并冲突与普通analyze越权conflicts区分已明确，维持阶段合同。

同session/目标/scope的RAM cap可作为本次执行的单调缩小缓存，不扩大授权、不记入coverage、不强求跨进程保留。**它只限制送入stageRequests的unit数组切片长度；stageRequests和this.ai仍必须使用原冻结ImportExecutionBudget。** 不得把cap写成新的maxUnits（例如v2的300改成47），否则违反现有预算合同。E02/E05须同时核对每个子请求的executionBudget逐字段等于原profile，以及所有来源unit对象和全书覆盖不变。

上述通过只针对设计与测试范围；完整issues钩子、逐包原子checkpoint、恢复/取消及实际B1复测结果仍待后续实现、独立代码审核和真实执行。
