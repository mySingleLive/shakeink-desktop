# 唯一目标类别反馈方案与限定用例独立审核

日期：2026-10-26。审核者：`remaining_books_oracle`。只审51及当前已知factory／生成桥／generateJSON接点，没有编码、执行测试、模型、用户库、应用或journal，没有修改原件、oracle和失败结果。

51 SHA-256：`378946bf4838368398e9dc2857a2a9cf3e369eda784d15ad7877df1f7601bb04`。

**技术方案：PASS。限定用例：PASS。** 无方案级必须修订项。允许在既定两文件、原J01/J02内部进入真实RED→窄实现GREEN及独立code review，不代表真实world阶段已纠正或rev57的实际坏值已确定。

## 机制及范围核对

当前factory在宽泛base上使用对象级superRefine。锁定Zod实现对enum外值产生不可继续的invalid_value，父对象检查在aborted时跳过普通superRefine；所以它不能稳定给enum外kind提供本次唯一合法目标。enum内但非目标值虽进入现有refine，反馈仍只有“匹配本次分析目标”。这个可静态确认的反馈缺口与rev57字段路径错误相容，但不是实际raw值或唯一因果证明。

51在newsem1普通analyze范围先验证IMPORT_TARGETS白名单，再构造artifact.kind的literal。固定反馈中的目标只来自白名单，因而能对两类bad kind都在字段层明确本次目标，如world；不需要枚举所有目标或把坏值／ID回显。origin改为inferred literal同样保持原接受条件。未认可的request.kind或缺失目标固定安全失败，不将原输入带入literal／消息，不默认world，并在生成前构schema以保证0次生成。

sourceUnitIds非空及每项属于当前request.units.id也转为字段级同义约束；合法／非法混合数组仍拒绝、重复合法ID不被额外去重。字段层可以在kind错误时收集其它字段自己的问题，但不能把未出现某条issue等同该字段已通过；最终全部schema和晚门都必须满足。没有填默认值、规范化类型／大小写、替换来源或强转模型结果。

新约束接受集合对合法请求保持与50相同；非法请求提前失败是明确的输入门，不是给模型制造新可用目标。legacy、其它phase、reconcile继续原schema行为，未授权扩为普遍重试策略。固定说明即使举WORLD／SETTING／PLACE作字段层级例子，也只是固定契约解释，不是认定rev57实际出现这些值。

defaults共用桥、真实generateJSON和既有generateText DI保持；schema只本地校验，不进入远端response_format。生成后继续同schema解析，原联合门和native／evidence／links／授权／取消全部保留。prompt/main/core/分类缓存／网关／预算／scope／plan／语义hash／工作单元均不改，也不新增raw遥测或外层retry。

generateJSON仍最多两次generateText／一次既有纠正，现有6项反馈、path100／message250与wrapper预留不变。字段级反馈只含固定字段／数字索引、固定文字和白名单目标，不能追加raw坏值、动态ID列表、原文、URL或凭证。失败组合即使不能在一轮全部修好，也必须按原上限拒绝，不能为此自动加轮数。

## 用例核对

沿用J01/J02内部增量，范围与生产变化直接对应：

- world请求分别以enum外合成秘密kind、enum内合法但非目标scene为首个坏结果，经生产同一生成桥＋真实generateJSON／既有generateText DI，检验纠正反馈给出唯一world及准确字段路径；第二次合法结果才成功，次数恰2。不能只测其中一类或仅调用factory静态解析。
- origin枚举外值反馈唯一inferred，首好1次、两次仍坏恰2次拒绝；来源空／越界／混合和并发坏字段均不能获得通过信用。反馈检查必须区分原payload中合法存在的源文与后追加纠正段，后者不得回显合成秘密／坏值／ID或全枚举。
- 无效／缺失request.kind由入口构schema固定失败，生成计数0、无回显且不默认world；注入raw绕过生成仍拒绝，输入／已有产物不改。保留late门、legacy／其它phase、合法值不重写和既有取消／授权保护。

这是对50已有J用例的针对性补足，不新增编号或suite。其它保护项仍为A03／A05／A06和SEM01–04；不因新反馈扩大为SEM会话、runtime、分类、PDF、browser或打包回归。

仅认可原49的三个精确命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

本审核没有执行任何这些命令。实施前须保留针对50冻结版的真实反馈反例RED，随后最小实现、GREEN和独立code review；必要types／构建另记，旧其它测试不因本批准获得修改授权。

## 真实恢复及失败局限

rev57只保存字段路径错误，没有raw值，不能猜测实际kind、把WORLD／SETTING等示例写成实测事实，或宣称这就是唯一失败原因。原FAIL和不可覆盖检查点继续保留，内部纠正次数／费用不可观测仍未知，不随机重复重试。

独立代码审核和新构建后，由主代理同C1现有UI重新授权，从world恢复；先对12个成功artifact完整对象、四类coverage、2723字符正文及源hash逐项比较不变。真实world结果、其余十二目标、完整复核、独立语义、发布／查表／重开仍需实际执行，本方案PASS与合成纠正GREEN不能代替。
