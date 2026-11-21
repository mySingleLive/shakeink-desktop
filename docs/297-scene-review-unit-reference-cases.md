# 场景复核全文索引引用定向用例

2026-10-31，依据296。本文仅提交最小用例设计，待方案和用例均独立审核通过后再编写测试、取得RED；当前未实现或执行下列新用例。不读取真实书稿、私有checkpoint或模型返回原文，不调用provider。

## UR01：真实JSON桥、精确全文还原与当前包绑定

使用实际 `generateImportAiJson → generateJSON → runImportAi`，仅在既有generateText依赖中提供预定合成响应序列，不根据提示词是否包含某文字决定成功。

- 请求采用semanticVersion=1、phase=review、selectedTargets恰为`['scene']`，省略kind、conflict及intent。分别覆盖conflicts与missingTargets的证据数组，含索引0和末项；canonical结果逐项等于当前请求 `units[unitIndex].id/text`，不trim、不删换行、不截断、不重排或丢证据。至少一个完整单位超过512字符，含CRLF、前后空白、非BMP字符及首尾哨兵。
- 以同一份显式 `{unitId,quote:完整unit.text}` 通过原流程的结果为基线，比较所有冲突/遗漏字段及完整证据；允许原末端冲突hash/id计算，不把索引规范化误认为自动确认冲突。missingTargets.unitIds仍须按原门完整覆盖其证据单位，不由索引擅自改写。
- 两个相同全文、不同ID的单位按索引选择对应ID，不能按quote反查首项。另用两个独立请求包分别返回`{unitIndex:0}`，但包内首单位不同，证明索引只绑定当前完整请求，不查全书或其它包。原请求及输入响应对象不被原地修改；返回canonical及其后续保存表示不残留unitIndex编码。
- 首生成使用一个声明单位中的明确错误raw quote，第二生成改为合法unitIndex，必须观察第一轮真实拒绝、原有第二次生成恢复，且次数恰为2。实际纠错段给出固定的当前包索引/严格形式指导，不能回显坏quote、单位/实体ID、未知键、输入值或原始cause。

## UR02：严格联合、范围隔离及原有限纠错

- 一张小型反例表覆盖负数、越界、非整数、字符串索引，以及混合unitIndex与unitId/quote/optionIndex、多余键。未知自身键值为undefined用纯schema入口验证，不能经JSON.stringify丢掉后再声称拒绝。每项必须整项失败，不strip后接受；两项合法证据后夹一项坏引用时，conflicts和missingTargets两种数组都不能丢坏项或只取首项。
- 显式错误的原 `{unitId,quote}` 仍然失败，即使某其它单位有匹配文本；不能自动降级为声明单位全文或使用analyze的跨单位rebind。原精确短引文、原排版恢复与全部旧raw形式接受集合继续由既有RA38组验证，不复制整套矩阵。
- 持续非法索引通过实际JSON桥只能生成2次并最终拒绝，不增加controller外层review重试，不产生可提交成功结果；固定反馈不泄漏合成秘密。首个完整合法结果只需1次生成。
- scope仅上述普通场景复核包。其它目标、混合目标、缺selectedTargets、非semantic协议、其它阶段、含conflict的作者解释复核均不启用unitIndex，原payload/prompt黄金及raw证据行为保留。对含intent的请求断言共享scope谓词为false；不得把本来就非法的review+intent组合当作合法service隔离正例。

## UR03：完整材料、预算和原末端门

- 对合成包冻结原序列化数据基线：仅完整units副本新增与数组位置一致的unitIndex。原units及其全部字段、资料全文/facts、reviewProjection、章节、目录身份、semanticLocks和instruction中的已确认决定逐值保留，不因编码额外裁材料；目录沿用原有相关性规则。原请求不变。专用固定prompt明确reviewProjection及知识归属、时序/回忆/传闻/实体歧义和互斥事实要求，只允许本阶段conflicts/missingTargets，不夹带其它类别的生成契约或授予analyze/patch权限。
- 一组预算边界先证明原输入预算可用，再加入完整索引元数据验证实际review角色预算仍完整计数；超过既有字符/单位/payload门时零模型调用，不能靠删除单位或重新分片通过。固定prompt与完整payload仍通过原UTF8固定说明及JSON wrapper预留检查；不借用更大text模型容量、不修改输出额度或模型设置。
- 合法索引引用不能代替内容/权限校验：选一个packet外artifact引用与一个缺失/不完整审核投影或作者锁定字段的遗漏反例，确认先完成精确证据规范化，再由原范围/投影门拒绝；原wrong-kind和unitIds完整覆盖门由代表性断言及既有组共同覆盖。末端撤权和中途取消分别通过实际生产桥拒绝，没有返回可落盘结果、没有新增模型重试；所有原终末授权与取消门保留。

不添加并发复核用例；该性能方案独立审核。以上合成用例和既有RA38回归只证明新编码与原门的组合，不证明模型报告的冲突在语义上成立，也不代替同包真实只读复测及全新整书所有场景、完整复核、正常发布/重开验收。R22仍保留为场景阶段通过、完整流程未通过，既有待处理冲突不清除或跳过。
