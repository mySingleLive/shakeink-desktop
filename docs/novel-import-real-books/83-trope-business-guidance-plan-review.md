# 爽点/泪点业务指导：独立技术与限定用例审核

日期：2026-10-26。审核者：独立子代理 `cross_platform_picker_design`。

**结论：82技术/业务含义方案PASS，限定用例方案PASS，无P1/P2必修项。** 允许依既定顺序进行限定TDD；不是实现代码审核结论，也不证明真实模型已纠正trope遗漏。既有文学FAIL仍待真实整书复核及独立审读。

## 审核身份与范围

82方案SHA-256为 `c686bebc3df0063acfe49aea251ea982171e58be32298ee35da762c0c1ceb5aa`。只读方案、现payload、共享IMPORT_LABELS、service/schema与原semantic validator接点、A07/A08模板及J限定接点，并对照73/76/79/80的范围。没有编码、执行测试/模型、访问应用、实际journal或数据库；未重新读取实际run。

本次静态参照：payload SHA `953d4a39701748dead1ee1e52e4a37306bc87f3d77fd012a0e0b58c499335298`，shared SHA `4b13236a2e14a0c55454fce4115784f8cb3145e6acd7a8b8fc193515b7754ef1`，semantics SHA `e33fe475457e8829ed321fc428c108145ec441934db6017e83313d4aacab1874`，A测试 SHA `800a96245c22473cc83699711cbac74f173656308ab28eae903a28fce0e8eff8`。79的service/main/J修改由另一实施与81审核负责，本报告不把所见静态接点当成其独立实现PASS。

## 业务含义与作用范围

共享标签明确trope为“爽点/泪点”；目前sem1固定native合同主要提供SATISFACTION/TEAR枚举，validator也只据枚举和既有知识/证据规则判断结构。新合同解释两类阅读情绪、分别核对，并要求具体原文及叙事作用，与已有业务一致。TEAR不必要求角色真的流泪、直接描写读者反应或满足商业模板；同时不能把任何悲伤词、宏观主题或任意场景自动当泪点。阅读效果属于解释判断，须与人物感受、所知及客观事件分开，原知识归属合同保持。

这不等于判明实际模型为何notFound。新增固定段不含书名、人名、原句、基线或人工正例，属于通用业务定义；82文档记录失败依据不代表该依据可进入生产固定段或payload夹带答案。

限定触发条件可按现有请求字段直接表达，无需新schema或状态：

- sem1普通analyze仅本次kind为trope时加入；不能因全局selectedTargets含trope而扩至其它普通kind。
- sem1 reconcile必须以reconcile.targetIds对应的实际artifact.kind确认明确trope修订目标；不能扫描全部上下文、目录、自由指令或仅凭旁带trope文字触发。
- sem1 review仅selectedTargets包含trope时加入，仍以已核验reviewProjection及已有实体三元组判定遗漏，不把片外/未展示资料当全书缺失。

“两类均无足够依据才notFound”仅定义普通trope分析在本次可核验来源范围内的原notFound含义，不新造全书缺失证明，也不允许review/reconcile返回notFound。现有阶段合同、validateSemanticStage和晚门继续约束：review仍返回conflicts/missingTargets，reconcile仍为稀疏artifactEdits/conflicts、限targetIds和字段、不改锁定值/来源/正文。此为82原范围的实施口径，不是放宽输出权限。

其它普通目标、无trope的review/reconcile、classify、patch及legacy逐字不变；73归属指导、76唯一kind绑定及原序列化均原样保留。不得回填清除旧notFound信用、强造TEAR实体、改预算/重试或手工宣称旧产物已修。方案满足这些边界。

## 限定用例判断

A09经真实runImportAi依赖接点截获实际prompt，而非只测独立字符串helper，能够检验固定段在不可信封套外、role/model/signal和原payload/source不变。普通trope、明确目标的reconcile、含trope的review三条正路径，以及notFound、正常合成artifact、空修订等原结果均有计划覆盖。

其“无相关目标”和“其它目标字节保持”应落实为定向负例：普通非trope即使selectedTargets含trope也不触发；reconcile仅有上下文trope而targetIds指向其它kind不触发；review上下文含trope但selectedTargets不含也不触发。原文或自由指令提到两个枚举不能成为触发依据。原投影/锁门与真实输出权限仍由原晚门验证，不能以合同词面存在替代。

修改前独立保存真正基线literal/hash、修改后逐字比较未改分支，避免当前输出自证。A07/A08既有断言不删减，73指导指纹及76绑定保护保留；新增长/非BMP/转义输入验证原固定提示与JSON wrapper预留，不提高常量。原J01–04继续覆盖生产generateJSON原一次纠正、严格目标/证据/知识/native门和安全反馈；82本身不修改这些接点。计划没有扩大测试范围。

只允许待79冻结且81完成后顺序实施，避免同一测试文件读写竞争。本审核未执行以下命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234]:' tests/unit/novel-import-request-schema.test.ts
```

先在真实生产基线取得新A09的行为RED，再最小实现GREEN并独立代码审核；新增fixture若误触早门，应保留失败并修夹具，不能假称生产RED。必要类型/build另记，不跑全量。合同检查只证明接线和范围，不证明真实情绪识别效果；旧文学遗漏、实际失败、原文/14章及已有产物信用均保留，最终模型复核、独立文学审读和业务落库/重开仍另验。
