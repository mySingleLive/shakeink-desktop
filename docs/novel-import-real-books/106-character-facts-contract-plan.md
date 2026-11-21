# 角色facts字符串编码：通用合同澄清与限定用例

2026-10-27。待107独立技术/用例审核；不改代码、不再次重试模型。

## 依据与边界

M01诊断恢复rev41仍failed，显示105保守“模型返回的角色结构无效，请核对后重试”；原25单元大纲/正文23257/manual9及18组来源/预算信用与rev29全等。真实调用15f524b7…于19:14:15.277Z开始/19:18:49.765Z rejected，唯一诊断恢复1次，没有继续点击重试。新消息证明走到普通角色typed invalid_schema的安全兜底，但不证明具体字段/模型值；不能猜是aliases、未知字段、数组或token截断。

静态可确认：通用native契约说facts是字符串字典、数组以JSON字符串表达，但随后角色aliases/relationships又用“字符串数组/对象数组”叙述；所有kind原生形状混在同一提示，普通角色没有更近的数据编码约束。当前Zod字符串类型纠正默认只说expected string/received array等，未解释外层JSON和字段值内JSON的编码区别。澄清这一已知表述问题，而非认定实际rev41根因。

生产仅desktop/core/novel-import-ai-payload.ts与desktop/service/novel-import-ai.ts；测试仅追加tests/unit/novel-import-ai.test.ts的NI-A11及tests/unit/novel-import-request-schema.test.ts的NI-J09。主进程92ed3、generic generate516123、已有helpers/全部晚门、shared/core/源/proof/UI/发布/预算/模型/重试上限冻结。

## 实现

1. 固定character-facts-encoding-contract仅对semanticVersion1普通analyze.kind=character且非reconcile拼接，不因artifacts偶含character而触发，不影响classify/review/patch/reconcile/其它kind/legacy。原prompt其它段原字节保持。紧邻阶段合同/原生合同说明：只输出指定character结构；facts键使用已有character字段白名单，不能自行翻译/增加人物信息字段名；每个value必须是JSON string，数组/对象须先编码为JSON文本再作为外层字符串并正确转义内部引号；数字/boolean/null也不能作facts值，未知可选项按原规则省略，不造值。aliases和relationships是JSON字符串，既有角色类型/关系引用合同不变。不得通过删人物、清空有据别名/关系、把无依据信息填入可选值来规避。只给编码示范（如"aliases":"[]"），明确空数组只是编码示范，不是建议清空真实信息；不提供本书人物/事实/答案，不变正文。
2. importAiResponseSchema的同一普通character分支，只覆盖该分支artifacts元素facts的z.record string值schema，给z.string固定中文error：“角色facts每个值必须是字符串；数组/对象先编码为JSON字符串并转义引号，不能直接返回数组、对象、数字、布尔或null；保留有据内容，不以删除人物或清空资料通过”。key schema、所有字段strict/optional、semantic text空字符串兼容及其它响应字段完全保留；不transform/trim/coerce，不把未知字段放进native模型。既有知识/证据/kind/origin/来源superRefine和全部late native/link门原字节保持。
3. 新固定error进入既有generateJSON唯一一次纠正；105诊断mapper逐字不变，未知路径仍保守且不回显。没有新生成/第三次尝试，不改变事实或接受集；仅允许字符串的旧集合原样保留，原Zod对__proto__等行为也保持。不能从新合成错误断言真实rev41对应原因。成功输出/输入完全不变。

## 定向TDD与安全验证

先在payload87b9/service3dba02/AItest401630/Jteste0ce2d的真实当前基线新增用例并取得干净RED，分别最小实现。

- NI-A11：唯一正触发组合（sem1/analyze/character/ordinary）与所有无关阶段/kind、reconcile、legacy及偶含character上下文反触发；固定键名单/双层字符串编码/不删真实内容要求准确。旧A07–10整个测试字节前缀保持；至少对9个不相关prompt分支hash固定，原指导/原生/JSON契约及固定预算保留。含多字节/emoji大输入仍过原payload/fixed-prompt reserve；不增加预算来适配文案。
- NI-J09：真实生产bridge→generateJSON→Zod→runImportAi，实际错误facts数组/对象/number/boolean/null时，原一次纠正必须带上述固定中文编码要求、不带模型值/ID/姓名/quote/endpoint/secret；首坏后好2次、首好1次、两次仍坏2次停止，不改signal/role/原输入或成功结果。与旧基线做string值（空串/空白/emoji/JSON文本/可选缺省）和非string接受集对照；所有其它artifact/顶层字段与旧响应shape相同。未知keys、__proto__的旧行为、其它phase/kind/legacy和knowledge/source/native/外键晚门不能放宽。105mapper应逐字保持，包括未知字段保守提示，不自动转数组或替换人物字段。

唯一两条精准命令：

```
node --import tsx --test --test-name-pattern='^NI-A(?:07|08|09|10|11):' tests/unit/novel-import-ai.test.ts
node --import tsx --test --test-name-pattern='^NI-J0[1-9]:' tests/unit/novel-import-request-schema.test.ts
```

禁止全量，不自行适配旧测试；原A07–10/J01–08全部字节前缀保持。必要global/audit类型及desktop构建另记；UI不改不重跑Next。

## 真实重测

107和108独立代码审核及限定检查通过后，正常退出当前failed应用，保留rev29/41两次失败及所有成功信用；重开同M01、原目录/当前模型重新授权。核对正文/9章/全部source/预算/大纲1/coverage25不变。仅恢复首个未完成character，使用通用澄清后的新固定prompt，不加入oracle答案，不重做大纲，不手改journal。固定prompt变化与runtime payloadHash（只覆盖JSON资料）的相等不得混为同prompt。此为格式合同澄清后一次新重测，不连续随机重抽；仍失败则保留新证据再决定模型或流程限制，不宣称已修真实根因。后续必须全目标完成/独立文学审核/落库和重开才可能通过；102入口专项PASS保持。
