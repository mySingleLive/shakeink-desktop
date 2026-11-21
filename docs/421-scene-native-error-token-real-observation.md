# R54 当前成功控制与安全错误词序观察

本次诊断完成，仍未准入产品修复。新两例仅合成数据、各1final fetch，共2次，无重试。旧内部ID由casePurposes明确映射用途，不能把known-good控制误称tuple schema成功。

当前known-good控制与R48 enum-positive的prompt/schema SHA逐字一致（850B），实际HTTP200、stop、直接JSON及原schema校验通过。当前接口仍能接受已知原生格式，不能把此前所有400泛称额度或通用接口故障。

R52 B′原candidate（4866B、schemaSHA273cd07b…）再次HTTP400，安全词序完整且未截断：`invalid json schema field anyOf missing field type other`。它来自161词闭合词表，未知整词为other，未保存开放message/Key/header/url；此词序是受限投影，不是原错误正文逐字引用。HTTP失败的模型JSON校验为not-run。

源码给出具体待验差异：旧native first/repair工厂的anyOf各分支均有type；当前B′的items.anyOf内含一个仅anyOf键的record分支，自身没有type，其内部三个对象才带type。此结构与投影吻合，但不能据此直接认定所有400的唯一根因。下一步应验证补冗余object type或纯anyOf关联律展开、精确叶去重这些等价编码；不能裁replacement/0/ranges或放松本地逐位置/来源/保留/owner门。

App正常退出0、无quit timeout/page error，103输入与368产品/renderer文件前后同，状态及全部旧产物未变，writeFailures0/metadata0/close成功。控制与420独审18/18、类型/构建通过仅说明诊断有效。静态候选真正被接口接受且原tuple/witness独立通过、条件方案独审后才可产品TDD；全文导入/复核/发布/重开仍未通过。

证据：[安全标量](scene-import-verification/r54-native-error-token-observation.json)、[独立审核](420-scene-native-error-token-probe-code-review.md)。
