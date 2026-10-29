# 世界线格式预检与安全诊断：独立方案审核

**当前结论：增量技术方案PASS、限定用例PASS，WF-TR01已关闭，无剩余P1/P2。** 对应79修订SHA与关闭依据见文末；首轮暂不通过历史保留。

日期：2026-10-26。首轮结论：**暂不通过（P2：WF-TR01）**。世界线原helper预检与既有一次纠正机制本身可接受；安全诊断方案及对应反例仍需下述最小澄清，不应据此启动未审定实现。

## 身份与范围

审阅79方案，SHA-256：`8000aceb0cc1c768aecf8613c9c53149f107c27c03816a62008d9140c837b7fa`。只读已知service schema/bridge、core单产物世界线及全图引用校验、main.safeError、J/A直接接点。未编码、执行测试或访问实际run、小说、应用、模型、journal或用户数据库。

rev129/164通用失败及43产物保持来自主代理报告，本审核未读取实际快照。无raw或原Error消息，不认定原失败是native结构、长schema反馈或网络，不把方案认可当真实原因证实。

## WF-TR01：短错误fallback与“非exact拒绝”合同冲突（P2）

现main.safeError的旧前缀正则包含`未`，且小于180的消息可原样返回。因此，例如已知世界线错误“未知事件时间不得制造数值”加秘密后缀或换行，未命中新exact映射后仍会被旧fallback原样返回；它原来并非固定generic。

79同时要求只增加exact映射、旧短提示行为不动，以及J04对已知错误近似/后缀/换行拒绝。这三项对上述错误不能同时满足。只增加exact表会使安全反例失败；不能删减反例或声称旧行为本来安全。

最小修订是明确：仅该已知世界线固定字面家族的非exact变体，在旧前缀fallback之前返回既有generic，作为“旧短行为不变”的窄例外；具体家族边界须由方案固定，不能扩大为所有`未`或所有未知错误。其它已知字面如也采用家族拒绝，应同样明确窄边界。J04保留真实Error、相似/后缀/换行/非Error与短长边界反例，输出不含合成秘密。若选择另一更窄策略，也须先把预期行为写清。

## 其余技术与用例判断

semanticVersion1普通analyze/worldline的完整requestedArtifact非变换调用原validateImportSemanticArtifact、丢弃返回值，可前置原strict单对象规则，不改最终接受集合。原helper无artifact写入；lineId/lineName、people JSON及字符串字符、eventId和时间值规则应直接复用，不按概述另写转换、默认值或更严格新规则。全图角色/父引用、循环与所有晚门仍须保留；合法格式但未知引用应schema通过、晚门拒绝。legacy、其它kind及reconcile等原schema行为保持，不扩大到narrative。

固定schema issue不得传播catch内容、动态字段、ID或原文。生产bridge仍调用原generateJSON，首坏后好2次、持续坏2次停止、首好1次及signal/模型/角色/wrapper预算验证合理；不得新增重试。

长结构列表只在真实Error且原固定前缀/结尾、沿用message.length的>=180边界下输出固定文案，不能回显括号内容；近似边界/尾部附加值不能误命中，短列表仍按原行为。此分类不能被描述为已定位实际根因。原三条知识映射及未知错误策略保持。

仅79列出的两条精确命令待方案补正后用于真基线RED、最小GREEN和独立代码审核，本轮未执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[78]:' tests/unit/novel-import-ai.test.ts
```

旧断言不减；新增fixture若误触早门，修好fixture后须在真实生产基线取得干净行为RED。主代理后续构建、真实同草稿授权恢复、43产物与原文/14章/预算保持，以及整书语义、发布和重开均另验。

## 修订增量复审：WF-TR01关闭

79修订SHA-256：`0a4060e56cb6055f55b11ff238013901078273834a441f3cbc96329571ea0b43`。技术方案 **PASS**，限定用例方案 **PASS**；无剩余必修项。该结论允许限定TDD，不代表实现或实际世界线生成已通过。

修订明确承认旧fallback的实际回显行为，批准唯一窄例外：已知固定字面先exact映射，其余以完整固定前缀“未知事件时间”开头的非exact消息在旧fallback之前返回既有generic。近似/截断反例只在保留此前缀的范围内要求识别，不承诺识别任意首部编辑；未扩大成全部`未`开头消息。其它新exact字面的后缀不匹配原允许前缀，旧短结构提示、知识映射及其余fallback保持。

J04须在真实原main基线保留该家族后缀回显的RED，再验证新guard与不回显秘密；未删除或降低安全反例。原单产物helper复用、全图引用晚门、原一次纠正及两条限定命令不变。此次只重读79增量并更新本报告，仍未编码、执行测试或读取实际数据。
