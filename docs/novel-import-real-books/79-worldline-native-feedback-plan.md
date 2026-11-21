# 世界线格式预检及安全诊断：窄修方案与用例

日期：2026-10-26。待独立审核，未编码。

## 实际失败与证据限制

S02世界线rev129、一次有记录手工重试后rev164均通用失败；worldline-generic-failure-rev129.json SHA7cb6b895d70d2afa45b879f96530431fb62a500a571d3d1e537ad2cad7f6006c、worldline-generic-retry-failure-rev164.json SHA0ed18adb472a50486411064b0134a4ff777d2ca752a20fcdd0af62665863b358独占保存。21项数据/43产物/十类覆盖/正文5310及14章严格保持。没有raw或原Error消息，不能认定实际原因是native结构、长schema提示或网络；不再随机重试。

静态存在两个可验证缺口：世界线的lineId/lineName/timeKind/people JSON/eventId/时间数值规则只在原validateImportSemanticArtifact晚门检查，schema阶段无法利用原一次格式纠正；原safeError按前缀/180字符过滤，固定“世界事件…”/“事件时间…”错误及过长结构字段列表会被折为通用错误。

## 限定生产范围

仅`desktop/service/novel-import-ai.ts`、`desktop/main/novel-import.ts`与`tests/unit/novel-import-request-schema.test.ts`新增NI-J04。

1. 仅semanticVersion1、普通analyze、kind worldline的requestedArtifact，在既有kind/origin/source/evidence/knowledge schema之后，非变换调用原`validateImportSemanticArtifact(item)`。不新造另一份native校验、不改原helper、解析规则或默认值。固定安全issue表达原世界线合同（lineId/lineName/timeKind、people JSON字符串数组、eventId、unknown/exact/window时间规则），不回显catch错误raw、原文、ID、字段值或未知键。只预检查，不transform；原所有晚门及全图引用门保留。
2. safeError增加原世界线validator已知固定字符串的精确映射，例如世界事件缺少类型/时间/角色结构、角色引用JSON结构、eventId、时间类型/数值/范围及exact窗口冲突等。映射值均固定可理解文案。80初审WF-TR01指出：原前缀规则含`未`，所以“未知事件时间不得制造数值”附加秘密值/换行当前会被回显，原来不是通用拒绝。明确批准一个窄例外：精确固定字面先映射；其余以固定“未知事件时间”开头的非exact消息，在旧fallback前直接给通用提示，不回显。该家族的截断/近似反例以保留此前缀为边界，不宣称任意字符串编辑均能被辨认成这个家族。其它新映射字面目前不匹配旧允许前缀，其后缀/换行/近似仍通用。非Error对象、知识三条旧映射保持；不能删安全反例或假称旧fallback已安全。
3. 对原`模型返回结构不完整（…）`长字段列表（>=180字符）可只映射为固定“模型返回结构不完整，请核对后重试”，绝不回显括号内自由内容；要求原固定前缀及结尾匹配。原短提示处理除上述单一字面家族例外外不变、其它未知错误、provider重试设置不动。该分支只区分格式类失败，不宣称具体字段或根因。

不改legacy/其它kind/classify/review/patch/reconcile的schema/结果、payload或提示、scope/预算、授权/保存/工作流、源文件或schema版本，不加重试。两线后续任何问题仍须新真实证据，不能顺便扩大到叙事线未执行规则。

## 限定用例

新增J04覆盖：

- 原纯helper与新世界线schema在完整合成artifact上的合法/非法结构接受集一致：必需字段、people JSON类型/字符、eventId、unknown不带时间值、exact/window数值和范围；有效原始字符串/空白/原文无变换。原引用完整性仍晚拒（合法格式却未知角色/父引用等），其它kind和阶段/legacy保持旧schema行为。
- 实际生产bridge+原generateJSON DI，世界线native错误首坏次好恰好2次，持续坏2次停止、首好1次；固定issue路径与安全合同可用于原纠正，无动态值/IDs/源文/catch消息泄漏，signal/role/模型/prompt wrapper预算保持。没有真实模型调用，不能据此认定原通用失败根因。
- safeError固定世界线映射的直接真实Error、近似/后缀/换行/非Error拒绝（“未知事件时间”家族按上述窄例外）、未知与旧知识映射保持；长结构列表只出固定文案，不回显其中合成秘密值，短列表仍原行为，不新增日志或私有诊断自由字段。先在真实原main基线证明该家族附加字符串会回显的RED，再验证新guard；原不安全行为必须写入证据而非通过改预期掩盖。
- 旧J01–03/A07–08原断言不减；如新J04夹具误触早门，必须先修新增fixture再在真实生产基线取得干净RED。

仅两精确命令，先真实基线RED→最小GREEN→独立代码审核，不全量：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[78]:' tests/unit/novel-import-ai.test.ts
```

必要类型/desktop build另记，UI与worker不变不全量构建。通过后同S02正常退出/新构建重开、原目录与同模型范围重新授权，核对43产物/信用/源/正文/14章/预算保留，只恢复世界线。真实结果若仍失败据新安全提示定位；所有旧通用失败、trope误判及文学待修保留，整书通过仍需最终模型复核、独立文学及业务落库/重开验收。
