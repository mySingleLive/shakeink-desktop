# 引用定位分类反馈：独立方案审核

2026-10-27。**最终技术PASS；限定用例PASS，无剩余P1/P2。** 绑定109最终SHA `48ed7a65ad9c856e5a49b3d3f3a2d3b13b37e1cec6b0a9894c543c9b726b1013`。只读方案及既有service/generate/J/A接点，未实现、执行测试或访问app、模型、原小说、私有journal、DB。

## 首轮历史与关闭

初审109 `2f41053a…aa7b`为**NOT PASS，EF-TR01（P2）**：原J03有两处`issues.message`严格数组断言等于泛化guidance，不能和四类新反馈同时字节不变。原`feedback.includes(guidance)`不是需修改的数组断言。另要求too-short说清非精确引文非空白不足8的前置阈值，不能声称已搜索证明不唯一。

最终109已明确只预批这两处消息断言及固定测试映射常量，所有新消息沿用旧guidance共同前缀，原feedback.includes、case、路径、接受/拒绝、晚门、次数、安全与不变性断言保持；其它J字节保持，不引入测试特判。too-short阈值说明也已准确。**EF-TR01关闭**，首轮结论保留而不覆盖。

## 技术与用例结论

现anchorEvidence顺序为unknown-unit→精确包含即返回→非空白不足8→排版多解→无解。内部闭合四reason类型/Error子类可保持原中文message、判断顺序、匹配和quote返回，仅让requestedEvidence选择四条固定中文信息；不用输入或Error.message解析reason。所有意外异常仍给原固定拒绝文案，不回显raw内容。精确短引文与精确重复引文继续走原包含分支，8字符阈值及唯一性只用于非精确排版恢复；不改Latin/数字边界、UTF-16范围、跨单元规则或接受集。

每条固定信息≤160字符，低于原250裁剪上限；不包含实际ID列表、引用/名称/endpoint/未知key/异常内容。限定普通sem1/analyze的原证据schema范围，legacy及其它阶段只保留原晚门/中文message。原generateJSON两次/一次纠正、最终产品提示、payload/main/generic/预算与所有晚门不改，没有新增生成或外部接口。

J10须先在真实c1bc6服务上仅新增反例留干净RED，再最小实施及已预批J03前提适配。主要通路真实生产桥→generateJSON/Zod+原generateText DI，四reason均实际触发；2次纠正/2次停/1次好、精确短引文、Han/CRLF/Latin/非BMP、输入/输出与原文恢复保持。12目标、旧阶段、secret/换行/未知ID不泄漏、预算与Abort、旧A03/A06晚门足够覆盖此窄反馈变更，不代表所有阶段完整业务通过。

只批准以下两命令（本审核未执行）：

```sh
node --import tsx --test --test-name-pattern='^NI-J(?:0[1-9]|10):' tests/unit/novel-import-request-schema.test.ts
node --import tsx --test --test-name-pattern='^NI-A0[36]:' tests/unit/novel-import-ai.test.ts
```

rev63四失败路径究竟是哪reason仍未知，不能据此宣布实际根因已修。111独立代码审核通过后才按109保留同原稿/正文/manual9/成功信用，授权一次item恢复；已知文学缺口仍待最终新快照另验，不把机械完成计文学PASS。
