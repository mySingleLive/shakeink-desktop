# 叙事线native与引用预检：技术方案及限定用例

2026-10-26。仅方案，待独立技术/用例审核；未编码、未执行测试，未访问实际run、应用、模型、journal或用户数据库。

## 实际失败与范围

主代理报告：90构建后世界线成功7项、coverage6；rev286叙事线0/6收到确切“导入结果引用的角色不存在或同名不明确，请核对角色资料后重试”。服务调用rejected，50项产物、5310字正文/manual14章保持；检查点已独占保存，SHA `db20b34f60f4d9cc530eeda13339470e8937d1a49f654119d5a27ca306b8b18f`。应用正常退出，未随机重试。本轮未读取检查点；无raw仍不知具体角色，不回溯认定129/164/203原因。

未来实施仅两个文件：`desktop/service/novel-import-ai.ts`（当前SHA `f29c2c6003c6aa513471ff3fa5acfa132ae9cade1ce7ed9baf1860950aeb1d68`）与`tests/unit/novel-import-request-schema.test.ts`（`5e44faf4e835a8a9102c5ab6492cfc2b468f4b9d22146af67e2c296a62690471`）。main fee、payload239、AI测试663及core原helper冻结不动。不改状态/信用、输出字段、模型授权、source、提示、预算、重试或发布。

## 唯一生产变化

仅在semanticVersion1、普通analyze、kind narrative、非reconcile的请求schema新增独立分支：

1. requestedArtifact非变换调用原`validateImportSemanticArtifact(item)`，丢弃返回值，提前核对native字段及refs JSON。已有kind/origin/source/evidence/knowledge错误继续原反馈，不因新预检追加无关图错误。
2. 对通过前序校验的非空artifacts响应，非变换调用原`validateSemanticLinks(request, items)`，使用完整本地catalog、完整chapters和本批候选。不能拿provider过滤目录/章节重新编号或替代验证目录。空数组/notFound不调用新图预检，仍走原后续late检查，不能吞掉本地目录错误。

保留现有worldline分支及反馈原文，优先新增独立narrative分支，避免合并重写。原两个helper及所有late调用逐字保持；生成桥和最终runImportAi仍使用同一schema，只有原generateJSON一次格式纠正，无新增重试。

必须严格复用原规则：chapterIndex/order是非负安全整数字符串；refs为严格JSON数组，eventId非空，kind仅happen/mention/recall或省略；每个ref明确原四值reliability，非客观ref有非空attribution，保留原temporalScope。narrator只用角色ID或唯一name；refs.character只允许角色ID，不能以唯一姓名替代；refs.eventId只指可信worldline事件。chapterIndex按全书索引与完整章节长度校验；身份/类型不得混用。缺省可选字段、原允许的前导零、JSON排版、归属/时间字符串保持原值，不新增默认、trim、别名回退或推断人物。

两个catch只加固定安全issue，native路径`artifacts.N.facts`、图路径`artifacts`；每条静态指导完整不超过原250字符反馈限额，无catch/raw/ID/姓名/未知键或动态目录回显。native指导说明章节/顺序/refs结构、枚举和知识归属；图指导说明全书索引、narrator与refs.character不同引用规则及已有事件。无法链接的框架叙述者保留原称谓、讲述/转述关系于text/attribution，不冒用角色、不造外键、不丢叙事点、不改正文。原允许的未填narrator/空refs继续允许，但不证明叙事、角色或两线完整，必须由后续完整性审核及独立审读核对。

## 事前批准的旧前提适配与真实late路径

所有夹具均在既有`tests/unit/novel-import-request-schema.test.ts`内合成，不使用实际人物/原句/oracle。新J07先在原生产取得干净RED，生产改变后才适配以下旧前提；历史日志保留。

- **J04**：其“formatted unknown worldline…”子场景中，`knowledgeRequest('narrative')`配仅有reliability的`badNarrative`，由原schema通过/late拒绝改为明确native非法、schema早拒、真实run拒绝。其它native/worldline/legacy断言及既有spaced-name局部目录保持。
- **J05**：已有两worldline早拒夹具不动；现普通narrative narrator未知/非角色ID两例保留为native合法、schema早拒。两个确切角色Error和main.prototype.safeError的真实通路迁到下面的reconcile夹具，不手造Error、不删安全映射/零结果/immutability/角色/signal断言。
- **J06**：其最后子场景中普通narrative未知narrator由schema通过/late拒绝改为schema早拒，native格式仍合法；原worldline empty/notFound坏catalog晚拒断言不动，并以同样的reconcile路径保留真实角色late回归。

**reconcile夹具的具体可行路径（只读源码已核对）**：用原`knowledgeArtifact('narrative', …)`构造独立ID的完整原target，chapterIndex/order为0、refs为`[]`、reliability明确、原narrator为`existing.id`；request.artifacts同时保留existing角色、需要的scene及该target，chapters含第0章。request为analyze、intent reconcile，targetIds仅该target，workingRevision一致，locks为空且无fragment。raw只返回一条artifactEdit：真实`importArtifactSemanticHash(target)`、`setFacts:{narrator: foreignId或scene.id}`、合成reason与精确有效evidence，conflicts空。

原`applyImportArtifactFieldEdits`仅应用字段/证据并核对目标、baseHash、锁；service随后原样调用`validateSemanticLinks(request, revised)`。该helper先执行native检查，再检查narrator：上述修改native格式合法，故实际Error.message必须逐字分别为“角色引用不存在或同名不明确”“角色引用类型无效”，不能由章节/格式/身份早门冒充。要求schema接受修订结构、生成恰1次、无有效返回、原target/raw/request深相等，再把捕获的实际Error交原main.prototype.safeError。另以reconcile `unsetFacts:['order']`验证原native晚门仍拒绝；不修改代码来迁就夹具，不绕过锁/baseHash/证据。

## 新增NI-J07及TDD

新增唯一编号：`NI-J07: narrative native and reference checks reuse bounded correction and preserve real late gates`，同一J文件。实际生产bridge→原generateJSON，只注入既有generateText；不调用真实供应商或用户库。

| 类别 | 必须实际验证 |
| --- | --- |
| native | 缺/负/小数/非安全整数chapterIndex或order；refs缺失、非JSON/非数组、错误字段/枚举/字符、缺可靠性、非客观ref缺/空白归属均拒绝；合法可选kind缺省、JSON排版/前导零/原归属时间值不变。对原纯helper作独立literal接受集核对，区分native合法但图非法。 |
| graph | 未知/同名歧义/非角色narrator；未知或非worldline eventId；ref.character未知/非角色/仅姓名；章节越界及实体ID身份冲突。每个完整坏响应首坏次好2次、持续坏2次停，首好1次；无第三次调用。 |
| 完整上下文 | 合法角色ID/唯一narrator name、合法三种ref.kind及省略、已知eventId/角色ID；完整本地catalog存在但provider过滤的条目仍可引用。全书10章仅发送index9的合成unit，chapterIndex仍为9，不能按本包重新编号。目录实体不变成伪造输出产物。 |
| 未定叙述者 | 不可链接的合成框架称谓仅留text/attribution，narrator省略、refs空仍按原规则接受；完整原材料不被丢弃，也不把结构通过标为完整。 |
| 保护 | native和graph两固定路径/完整静态指导、安全无回显、wrapper和65536/16384常量、signal/role/模型/request/raw不变。空结果仍有原late门；其它kind/phase/legacy/reconcile保持，J04/J05/J06真实late回归继续执行。 |

实施授权后先另存真实两文件基线于`/private/tmp/narrative-schema-91-baseline/`；只新增J07，旧J01–06暂不改，在原生产保存不可覆盖的干净RED。若夹具误触早门，保留失败、修新夹具，再在原生产重得干净RED。之后最小生产增量及上述事前适配，最后源版只跑以下两精准命令，必要owned类型检查另记，不全量：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234567]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

冻结两SHA、全diff、真实RED/GREEN和适配原因后由独立代理代码审核；不删除其它旧断言。通过后主代理另行构建、正常重开同S02并重新授权原目录/模型范围，逐项保持50产物/信用/正文/manual14章/预算，只续叙事线。未知框架人物、旧角色遗漏及trope等文学FAIL仍保留；最终模型完整性、独立文学审读、业务落库/重开、其它书及LIFE另验。
