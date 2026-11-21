# 新场景清单两阶段原生结构化输出方案

## 证据与目标

R36正常全文测试的安全观察记录18次AI调用、16成功、2失败；两项失败均为既有固定“场景清单无法定位定点修复记录”分支。只证明首代输出不能经原`parseJsonOutput`及严格`{roster:array}`取得草稿，不证明供应商返回了哪一种语法或根类型，也不追认R35未知原因。487成员/331记录已通过的事实不代表全文通过。

本增量只用原生JSON Schema约束新场景清单的生成形状，不改变原文、地点身份、证据、保留义务或最终接受门。先独审本方案，再独审361用例，TDD后独立code review；无准入前不改产品。

## 范围与模型

仅`semanticVersion=1 / analyze / intent=roster / kind=scene / sceneIdentity.mode=roster`且无`sceneParentTargets`，并满足原单场景native能力白名单：DeepSeek、OpenAI协议、既有精确官方endpoint、TEXT、原两个modelId；使用原冻结模型授权快照。将原能力和Responses模型构造的共同部分等价复用；原`supportsStructuredScene`/entity合同的范围和行为不扩大。新roster有自己的窄谓词，snapshot不一致仍拒绝。不新增供应商、URL改写、HTTP监听、平台后备或native失败后的文本重试。

保持roster原thinking-off及Responses原`reasoningEffort:none / store:false / strictJsonSchema:true`，保留其它providerOptions与网关/超时/取消。输出上限沿原roster值（原未传则仍未传），不借用entity的32768 headroom设置；最多原两代，网络策略不变。

## 两阶段形状与本地权威

首代preferred JSON Schema唯一根`roster`，记录仅`{mentions,context,links}`；mentions非空，`literal`及label沿原字符串界限，引用采用原三编码的严格`anyOf`：`{ref:string}`（原ef格式）、`{unitId,quote}`、`{unitIndex,fromFragment,toFragment}`，各分支required及禁止额外键；prompt仍首选ef，不改变raw/span含义。不能用ef-only让“literal跨片”或“单片quote重复但跨片唯一”的合法来源无法首代完整表达，更不能故意先失败再靠修正轮覆盖；context/link仍原数组、关系枚举与targetIndex。所有object显式required及`additionalProperties:false`，数组沿原上限。Schema不枚举、复制源文字或整份ref目录。原第一代generation wire的full/primary/first三记录分支、raw/ef/halfopen三个anchor分支仍完整接受；preferred schema不是新的本地合法集合，也不认为合法ef自动有据。

次代只在原定点repair准备及预算成功后使用另一JSON Schema：唯一根`repairs`；元素为原严格replace/reject两分支，replace包含完整的first-record形状，所有mention/context/link evidence仅`{choiceRef:string}`，沿原`cf`格式；不新增null、可选占位或raw/ef/span fallback。Schema只是形状，原repairRef闭集、canReject、稳定slot、choice resolver、完整组合、原whole/source/canonical、retention/owner及main最终授权/epoch/ledger门逐一不变。不能因原生schema失败而采首答、降级或增加第三代。

`generateJSON`的可选repair回调兼容原字符串返回；另外允许可信服务返回`{correction:string,jsonOutputSchema:JSONSchema7}`。旧string保持原语义/参数，object只替换实际第二次调用的schema及纠错文本，不修改验证schema、cap、role或其它options。repair回调仍从SDK rest剥离，callback仅首个结构失败一次；传输/用量/取消不触发。原native `Output.object`及partial parse no-op复用，最终完整text、finishReason、本地JSON/Zod校验不能省略。

## 实际Schema预算与规划

新增小型纯core helper提供确定性的首/次JSON Schema及其实际`JSON.stringify`文本；不依赖服务/凭证，不增加request字段或改变原payload。eligibility的纯模型判定可在该helper复用，服务只负责已有Responses工厂。Schema不用业务文本description，按实际UTF8字节计入预算，不以估计或固定小常量代替。

首schema必须同时进入main原`stageRequests`的完整fits及worker前门：对eligible新roster，以原payload加实际首schema字节计原payload限额，并以实际prompt加schema计原fixed reserve；所有单位/目录/来源不裁。为避免worker比planner多扣一次才拒绝，允许main仅在相关`requestFits/stageRequests`及调用前检查接入同一纯helper，模型取冻结grant；其他scope结果不变。若一个单位连完整metadata/schema也不能fits，维持原固定拒绝，不强塞。

次schema不在初轮预占完整repair数据；在原回调中对完整实际二prompt（prior、choices、反馈、JSON包装均保留）加实际次schema重验原完整payload预算及fixed reserve；v1额外保持实际输入UTF8+原6000<=有效contextWindow（0/未知16000）。首、次schema分别计对应实际调用，不把两份都当实际单次输入，不偷占已保留的wrapper16KiB或改变65KiB fixed上限。超限首1/次0，不截prior、目录或schema；首代有效仍可正常接受。

## 预计实现边界

- `src/lib/ai/generate.ts`：兼容的repair返回对象及逐次schema传递。
- `desktop/service/novel-import-ai.ts`与原`novel-import-structured-scene.ts`：窄native roster选择、同一Responses工厂等价复用、两代schema及原门接线；可新增最小service helper，原entity合同逐值保真。
- 新纯core schema/budget helper；`desktop/main/novel-import.ts`只做上述预算规划/调用前接线，不改worker数量、流程、UI、ledger或动作。
- 新合成定向测试；仅必要显式新preferred-schema期望适配，普通scope黄金保持。

共同纯helper冻结为`sceneRosterNativeSchema(request, model, phase:'first'|'repair'):JSONSchema7|undefined`及`assertSceneRosterNativeBudget(request, model, budget:ImportExecutionBudget, payload:string, prompt:string, phase:'first'|'repair'):void`；request取原完整或planner snapshot的相关字段，model取原冻结grant/worker实际role。非eligible返回undefined且预算函数无新增操作；eligible按相同schema文本执行上述原门。main stageRequests给requestFits传冻结textModel以调用该helper，worker及实际二prompt使用同函数，不各造schema或常量。模型创建留在service，不反向引入core。

真实Mock SDK/HTTP夹具仅证明代码边界；随后root用当前配置只读包及新鲜全文验证，不能把schema有效等同于地点语义正确或全文验收。
