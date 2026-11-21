# 角色结构失败：安全字段诊断方案与定向用例

2026-10-27。待104独立审核。只增加失败定位信息，不推断M01实际坏字段，不改模型输出或重试次数。

## 已证事实

M01原session439f1633-9d21-40f5-9d8b-7f165cc66265已通过新重新选择入口，正文23257/9章、全部12目标正常开始。rev29在character阶段被“模型返回结构不完整，请核对后重试”阻断；大纲1/覆盖25、正文精确，角色0/后续未执行。runtime明确e78ef09d-9d00-408f-a76b-88b9f7d6de02于18:41:32.194Z开始、18:46:29.643Z rejected。失败完整快照及断言独占保存，未重试。

已读源码：generateJSON仅允许原一次结构纠正，parseJsonOutput的Zod路径最多6条/各100字符；StructuredGenerationError.kind区分invalid_schema/invalid_json/incomplete。main现有安全过滤会将长结构路径族折成上述固定提示。不能据此认定别名、关系、某人物或token截断是实际原因。没有可归属的安全详细日志，未查询全局Usage、模型账户或回显完整模型结果。

## 仅两个文件的最小变化

生产只改desktop/service/novel-import-ai.ts，测试只追加tests/unit/novel-import-request-schema.test.ts。main92ed3、payload87b9、generic generate.ts、所有原schema/helper/晚门/预算/模型/正文/发布与UI不改。UI继续复用已有失败提示，无新设计。

在现有实际generateImportAiJson桥中，dynamic import同时取generateJSON和StructuredGenerationError，在generateJSON最终拒绝后做严格门：只有semanticVersion1、phase analyze、kind character、非reconcile、实际instanceof StructuredGenerationError且kind invalid_schema才转换。不截获/转换Abort、provider/network/Error或同形普通对象；其它phase/kind、legacy及其它typed kind按原异常透传。

只检查该typed Error已有invalidFields前6项、各<=100字符串。仅以全串锚定语法识别known静态schema路径，数组索引仅十进制安全长度且丢弃，不输出索引：artifacts或artifacts.<index>；artifacts.<index>.(id|kind|name|text|facts|evidence|sourceUnitIds|origin)；facts.<field>只允许现有IMPORT_SEMANTIC_FACT_FIELDS.character白名单；evidence.<index>.(unitId|quote)；sourceUnitIds.<index>。输出标签由固定中文业务字典生成（例如aliases→别名、relationships→人物关系、roleType→角色类型、occupation→职业、clothing→服饰、catchphrase→口头禅、growthArc→成长轨迹），只对已知字段给静态文案；不把facts.*内部路径直接塞入产品提示。未有固定中文标签时保守用角色资料。不得复制raw path、issue.message、feedback、模型值/名称/ID/quote或原Error.message，不用前缀匹配未知字段。

映射结果去重最多6标签，用固定“模型返回的角色字段结构无效（...），请核对后重试”短通知，必须<180字符，让现有main安全门直接显示。全未知/截断/非法路径使用固定“模型返回的角色结构无效，请核对后重试”，不假报已定位。空路径只保守概括，不展开模型未知key。不要用Error.cause附原错误，不输出raw细节。

此转换发生在原generateJSON已完成或失败之后，不增加第三次生成，不改已有纠正反馈或schema接受集，不把数组facts自动转字符串，不更换模型或降低校验标准。成功结果逐对象原样返回；没有新的业务写或测试接口，defaults.generate仍调用同桥。

## 限定TDD

新增NI-J08，先在service20b80真实基线RED（main保持92ed3），再最小实现：

- 真实生产桥→真实generateJSON+generateText DI，合成character多个aliases/relationships等原生数组误放facts，必须实际触发原Zod路径/原一次纠正，第二次仍坏；经过runImportAi及真实main.safeError后只显示已知静态字段，长度<180，不带人物ID/源ID/名称/引文/endpoint/secret。不能手造Error替代主要通路。
- 首坏后好仍恰2次、首好恰1次，输出及输入完整对象字节/值不变，原finish/cancel/授权/预算保持。通过same bridge最后错误检查，无第三次生成。
- 真generateJSON构造未知facts键、类似前缀/超长/换行/Unicode/secrets等实际路径均不回显；多个已知重复路径静态去重，最多6且边界<180。可以另用typed实例覆盖不可由Zod自然生成的异常元数据，但须单列合成安全反例，不当主要通路。
- invalid_json/incomplete、Abort/provider普通Error、结构同形对象、legacy、world/scene/narrative/worldline/review/classify/patch/reconcile不进入新映射，原错误身份/消息与旧接受集不变。真实Zod生成错误与未知消息不得因安全提示变成成功。
- defaults仍连接生产桥，generic generate.ts/main/payload等控制hash不变，旧J01–07完整测试字节前缀保持，不做夹具适配删原安全断言。若出现旧用例前提变化，先报告并审核，不能自行改旧测试。

唯一命令：`node --import tsx --test --test-name-pattern='^NI-J0[1-8]:' tests/unit/novel-import-request-schema.test.ts`。仅这些与当前失败相关的结构/桥/安全用例，不跑全量。必要全项目/audit类型与desktop构建另记；UI源未改不重建Next。

## 真实诊断恢复

104及105独立代码审核/限定测试通过后，正常菜单退出当前失败应用、构建重开原M01。授权前后核对原件/正文23257/manual9/全部units/预算/已完成大纲和25覆盖逐对象保留，原目标重新授权，当前模型重新确认，不弃草稿/不注入journal。只对首个未完成character执行一次带新安全诊断的恢复，不能声称已修复实际结构原因；旧rev29失败保持。若仍失败，依据新显示的安全字段再定位具体通用合同，禁止随机连续重抽；若成功，仍保留旧失败根因未知，继续全目标及独立文学审核。102来源入口修复的PASS不因此回退或冒认整书通过。
