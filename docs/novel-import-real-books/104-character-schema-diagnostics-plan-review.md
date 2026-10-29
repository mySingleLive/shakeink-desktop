# 角色结构失败安全诊断：独立方案审核

2026-10-27。**技术方案PASS；限定用例PASS，无P1/P2。** 绑定103最终SHA-256 `70278a6311365464cc25bcd45e9f2a5bc67af37f453f03c7c5d2c03ed81a0278`（含固定中文业务标签补充）。只是实施前方案门，不是实现/测试或M01角色生成通过。

已读现有service桥/schema/defaults/runImportAi、generic generateJSON/parseJsonOutput、main.safeError与相关旧J用例。generateImportAiJson确为defaults共用桥；generateJSON最多两次生成，只有一次原结构纠正，Zod失败路径最多6条/各100字符。main可显示以“模型”起首且<180字符的提示，故无需扩大主进程安全规则或修改UI。

新映射只包围现桥最终拒绝，严格限定普通semanticVersion1/analyze/character、非reconcile及实际StructuredGenerationError.invalid_schema。完整锚定路径和固定character字段白名单只用于选择静态中文标签，索引丢弃；前6条/各100字符、标签去重最多6、最终<180。未知/截断/非法路径给固定概括。不得输出路径、原message/feedback/issue.message、模型值/名称/ID/引文或cause；不靠未知字段前缀猜标签。该边界能补充安全定位信息，同时保持原接受集、原一次纠正、成功数据、预算/授权/取消及全部晚门不变。其它阶段、kind、legacy和错误类型原身份透传。

NI-J08须先在真实service20b80基线留干净RED，再走实际生产桥→真实generateJSON与既有generateText DI→实际Zod失败；经runImportAi及真实controller prototype.safeError验最终固定中文提示。首坏后好2次、两次仍坏即停、首好1次，保持完整输入/成功值与signal/role；真实未知路径和secret不泄漏。手造typed异常只可作为单列恶意元数据/边界反例，不替代主要通路。旧J01–07完整字节前缀保留，不做未审核适配；main、generic generate与payload等控制SHA须保持。

唯一批准执行命令：

```sh
node --import tsx --test --test-name-pattern='^NI-J0[1-8]:' tests/unit/novel-import-request-schema.test.ts
```

本审核只读，没有实现或执行命令/测试，没有操作app、模型、DB或真实journal。已读基线：service `20b80cc2…c1ea`；main `92ed3a9d…491c`；generic generate `51612305…fe22`；旧J测试 `4485611f…bfa6`。CodeGraph工具不可用，依授权读取已知文件。

rev29实际坏字段、来源和根因仍未知；本方案只让后续真实typed失败可安全定位，不证明数组/别名/关系或截断就是实际原因。105独立代码审核通过后，主代理才按103保留同草稿/原正文/九章/预算/大纲及25覆盖，正常重开并授权一次诊断恢复；不能连续随机重抽。来源重选既有PASS与文学审核待产物状态分别保留。
