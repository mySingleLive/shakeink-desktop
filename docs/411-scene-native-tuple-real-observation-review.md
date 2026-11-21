# R50 两例真实观察独立复核

结论：本次私有诊断完整执行，A/B 均 HTTP400；412/413 的条件未成立，不准进入产品 TDD。完整小说导入、发布及重开仍未通过。

独立复核安全回执：两例各一次生成、一次 final fetch，同 prompt SHA；响应正文仅闭合投影，均 parsed/complete、code=invalid_request_error。A 为219字节、提及 schema/ref；B 为206字节、仅提及 schema。两例输出校验均未运行，不能称 B 满足原位置规则。关键词不等于根因。正常 App exit0、无 timeout/page error、metadata 写尝试0、状态不变；逐项重算368个产品/renderer及101个 helper 输入、entry/CJS hash，全部相符。

实际执行原 `verify-r50-tuple-condition.mts`，在 B HTTP 2xx 断言失败，条件通过文件不存在。该失败是预期的实施阻断，不能用诊断 `ok=true` 覆盖。

只读源码核对：`desktop/service/novel-import-scene-roster-bound-decisions.ts:63–65` 的新 bound schema 使用根 definitions 和10个 `$ref`；`desktop/service/novel-import-ai.ts:622、626` 将其交给 repair SDK。R50 B 仍保留全部 definitions/ref，错误投影 ref=false 不表示 schema 无引用。当前 native core 仅逆回本轮新增预算参数/override 后，整文件 SHA 精确等于 R47 冻结值 `93bfb88c704c65a6cda030777e7541c264f6aab1112f7afe2a7ee8f76f380940`；该原 generic repair 工厂为3015字节、0引用/0definitions，schema SHA `24bab9493e4fbf3707b5a2bfe20312a92c4f5c4885cd5cd048ca38f2abd83cfc`。R47 manifest 不含新增 bound 模块；R48公开真实 wire 的 generic-min-items 正是该3015字节 schema，并完成 stop，但子约束校验失败。这支持把引用编码作为下一独立诊断变量，不证明唯一原因，也不追认未捕获的 R47 历史 wire。

命令：Node24 执行原条件核验（预期 exit1/B2xx）；只读 Node hash/旧 core 逆构断言（exit0）；源文件及公开 R48/R50 标量读取。未启动 App/API，未读取小说、真实模型文本、Key 或任意 HTTP 错误正文，未修改产品。
