# 隐藏引用及标准服务错误提示：独立方案审核

日期：2026-10-26。技术方案 **PASS**；限定用例方案 **PASS**。无 P1/P2 必修项。允许按85限定TDD，不代表实际rev203原因已定位或世界线已通过。

## 身份与范围

审阅85方案，SHA-256：`bb924e4630bda76c347383957ad8885542ecc4b1b46a81949cd8037d391017cd`。只读已知main.safeError、service.validateSemanticLinks及既有J/A接点，另只读公开官方错误码页面；未编码、执行测试，未访问实际run、小说、应用、模型API、journal、账户信息或用户数据库。

rev203服务调用rejected、43产物保持和无raw限制来自主代理报告，本审核未读取真实快照。不能由角色遗漏、字典候选或服务描述推断该次失败根因。

## 技术判断

方案列出的9个语义目录/角色/地点/世界/MAP/父级循环/叙事章节错误均为validateSemanticLinks的真实固定Error字面。它们不匹配当前safeError旧允许前缀，可仅在原own-property精确字典增加固定中文映射，不必改服务、校验、输出协议或日志。后缀、近似、空白和换行不命中新键，仍由原fallback给通用提示；不重现80中`未`前缀的冲突。

[DeepSeek官方错误码页](https://api-docs.deepseek.com/quick_start/error_codes/)列有85所列的七个标准英文描述；本轮已只读核对。仅按原大小写/空格exact匹配这些已知字面并输出固定中文可接受，不能据此保证SDK包装后的所有错误均能识别。提示应表达收到的固定字面类别，不将未知错误解释为余额、Key或其它已确证账户状态。

不得为扩大命中率读取responseBody/status/headers/cause或部分匹配，也不添加网络/账户查询。79世界线字面、未知事件时间家族guard、长结构列表/179–180门、三知识映射及其它短fallback保持。未识别继续generic，不能传播自由内容或自动改变模型、付费和重试设置。

## 用例判断

J05通过真实runImportAi、仅合成DI构造格式合法的worldline，分别让people指向未知角色及实际非角色目录ID，捕获真实晚门Error，再调用未初始化prototype上的实际safeError，能直接覆盖本次接线。必须断言捕获的原Error恰为对应两个角色固定字面、没有有效结果，避免schema/native早拒造成假绿；无需实例初始化、worker或IO测试hook。

全部新增固定键采用独立字面期望，逐项验证真实Error正例、近似/前后空白/后缀秘密/URL/换行/非Error反例，无回显或新增属性。原main真基线须先证明实际晚门错误被隐藏，取得干净RED；J01–04及A07–09旧断言逐字保留，尤其原own-property保护和WF-TR01/长列表反例不能被替换。

仅批准85两条精确命令，先真实两文件基线RED、最小GREEN，再独立代码审核；本轮未执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[12345]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

后续真实同草稿恢复仍须原目录/同模型范围授权，并核对43产物、覆盖、正文/14章和预算；旧失败与文学问题保留。若显示外部限制，保持草稿并请求必要用户处置，不由本方案授权换模型、付费或自动额外调用。构建、真实世界线及最终全书/落库/重开验收另记。
