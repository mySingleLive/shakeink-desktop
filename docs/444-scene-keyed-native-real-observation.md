# R63 逐任务键 Native 实际兼容观察

本轮是两次合成静态调用，不发送小说，不是完整导入。内联 A 返回 HTTP200/stop/直接完整 JSON，Native、独立原 tuple、原 bound decoder 和五任务见证均通过；带 type sibling 的共享 definitions/ref 编码 B 返回 HTTP400，没有模型输出可验。441 的条件产品前提未满足，未实施产品修改，也没有补试。

A schema 18946B，B 3481B；同一输入 SHA、同一见证、strict=true、同模型和其它参数，wire 精确匹配。B 闭合错误投影只记录 object/properties 相关词，不能从中单独认定 `$ref`、definitions 名称或 type sibling 哪一项是全部故障的唯一原因。

实际 fetch 恰好两次，每例一次，重试0；metadata writes0、只读usage、pageerrors0、App正常退出0/signalnull、runner退出0、quitTimedOut=false。57源、8bundle、303renderer共368保护项、107依赖、helper/CJS及隔离配置均保持。之前11项私有/quit控制及类型通过不代表此次B兼容或全文通过。

随后查阅[DeepSeek官方工具调用文档](https://api-docs.deepseek.com/guides/tool_calls/)，其复用示例采用单数 `$def` 容器与纯 `$ref`，没有附加 type sibling；它与本次B编码不同。[Responses接口文档](https://api-docs.deepseek.com/api/create-response/)说明支持 json_schema，但未在该页明确上述引用细节。因此官方示例是下一次编码假说的依据，不能直接当作当前 Responses 接口的实测支持。后续另行审查，不回写本轮失败。

证据：[安全标量记录](scene-import-verification/r63-keyed-native-observation.json)、[限定代码独审](443-scene-keyed-bound-native-probe-code-review.md)。原始合成回包与严格出站绑定仅保留私有目录。完整场景导入、发布、重开仍未通过。
