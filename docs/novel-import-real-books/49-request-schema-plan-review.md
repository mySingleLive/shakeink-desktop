# 请求约束前置方案与限定用例独立审核

日期：2026-10-26。审核者：`remaining_books_oracle`。只读48及已知AI服务／generateJSON接点和旧测试名称，没有编码、执行测试、真实模型、应用、journal或用户DB，没有修改输入、oracle或真实失败证据。

48 SHA-256：`1fd7e51de9af97f08ed43ae2fd3fbc41ecf1832306a88b7f6be4e5087acb4272`。

**技术方案：PASS。限定用例：PASS。** 无方案级必须修订项。允许限定TDD及后续独立代码审核；不证明rev32实际坏字段、不把该小修说成已确认唯一原因或真实C1已通过。

## 技术方案核对

当前AI服务静态schema接受全部目标kind、三种origin和任意／空sourceUnitIds，defaults.generate第110行将其传给generateJSON。第139行随后按本次请求拒绝kind不符、origin非inferred及空／越界来源。因此把这些同义约束前置到**本次生成schema**，才能进入现有本地结构纠正路径；单改事后错误文案不能让该路径得到一次纠正机会。

48限定只有semanticVersion=1、phase=analyze、非reconcile使用base.superRefine；每项artifact须匹配request.kind、origin=inferred、sourceUnitIds非空且逐项属于本次units.id。该集合关系来自已授权请求，不取自模型返回、oracle或全局实体库。只作拒绝，不填字段、改kind／ID、替换来源或推断事实；没有放宽第139行条件，也没有新增去重／猜测／默认值契约。legacy、classify／review／patch／reconcile仍走原schema。

生成桥必须由defaults实际调用，并内部使用同一factory调用**真实generateJSON**；测试只注入generateJSON已有的generateText依赖。这个桥是私有生成边界，不是新IPC／URL／renderer可指定schema入口，真实模型解析、授权和abortSignal继续沿原路径。runImportAi生成后的解析也用相同规则，并保留原第139行以及native／evidence／links／最终授权和取消门。这避免只在默认生成路径拦截、却让注入raw或未来接点绕过。

源码 `src/lib/ai/generate.ts:176–247` 确认schema仅本地safeParse，不序列化到远端response_format；总循环最多两次generateText，只有StructuredGenerationError才触发一次现有纠正。48不修改此函数、不加外层retry；两次仍错必须失败。每次实际生成仍走原配额／取消／用量链，模型配置及未知用量观测口径不变。

新superRefine仅用固定artifact索引／字段路径和固定原因，不把坏值、unit/entity ID、原文、URL或raw error插入issue。现有反馈最多6项、path100／message250字符及固定wrapper预留继续约束追加内容；不枚举动态ID列表，不加源文或修改原prompt／预算。这里审核的是新增约束的反馈，不授权扩大原有通用错误收集或保存模型raw返回。

## 限定用例核对

| 用例 | 审核结论 |
| --- | --- |
| NI-J01 | 经defaults同一生成桥＋真实generateJSON，逐类首坏后好恰2次、首好1次、两次仍坏恰2次拒绝，直接验证前置约束进入既有纠正器。必须实际核对defaults接线，不能在测试中另造factory→generateJSON路径代替生产桥。固定反馈不回显合成哨兵、坏值或ID，不能只检查报错而漏泄漏断言 |
| NI-J02 | 经真实runImportAi的受控raw绕过生成，四类坏结果仍被拒绝；合法结果不被强改，既有artifacts／输入不变；native／精确证据／引用晚门仍拒绝。legacy及其它阶段的原接受／拒绝行为、取消与授权都被明确保护 |

实现时“越界sourceIds”须落实逐项成员关系，包含合法ID与非法ID混合数组的负例，不能错误实现为“至少一个合法即可”。这是48“每项逐字属于”的既定含义，可留在J01／J02内部，不扩大编号。测试生成桥用合成结果只证明机械约束与次数上限，不证明供应商实际内部调用数、文学分类或事实正确。

旧直接保护项实际存在且与改动相关：

- `tests/unit/novel-import-ai.test.ts`：A03缺失ID／非法类别／伪造证据，A05阶段空数组兼容与越权拒绝，A06唯一版式引用恢复及词界／原字符保护。
- `tests/unit/novel-import-semantic.test.ts`：SEM01人物native，SEM02地点／世界结构，SEM03九类Setting内容，SEM04各kind知识限定与阶段权限。它们直接覆盖本次schema涉及的普通analyze，不需要扩跑会话、runtime、分类、PDF、browser或打包suite。

只认可48三个明确命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

本轮未执行这些命令。先保存新反例的实施前真实RED，再在仅service AI／新request-schema测试范围窄实现，GREEN后另独立code review；必要typecheck／构建单记，不改旧测试来放宽契约。

## 真实失败与后续验收边界

rev32通用文案只定位该组请求约束门；没有原始失败返回，不能认定具体kind、origin或哪一个来源ID错误，更不能推测是后续PLACE／父级／quote门失败。保留原快照及正文hash、四项已有产物／覆盖，不为取得诊断另付费重现，不增加raw遥测或无限随机重抽。当前四产物也尚未证明文学语义正确。

独立代码审核和新构建后，仍由主代理在现有C1原生失败恢复UI重新授权原目标，仅补未完成阶段；逐项核对大纲／角色完整对象和已有覆盖、正文／原件hash保持。真实后续若再失败继续留证定位，不能用J01的合成纠正成功代替实际模型结果。完整十二目标、独立语义、正文保真、发布及正常重开仍全部按03验收。
