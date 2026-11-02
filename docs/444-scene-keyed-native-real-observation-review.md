# R63 静态实际结果独立审核

结论：444 主文及安全记录准确，441 的产品条件未满足，产品 TDD 未准入。本轮是两例合成静态兼容观察，不发送小说，不是全文导入、发布或重开验证。

独立核实际私有 summary SHA 为 `c971585ae79508d4fddc731dff027b8bf3cf15afb10f474de2327ad6d19f0131`，与公开记录相同；逐例 id/schema字节数/schemaSHA/promptSHA/HTTP状态/category/validation/闭合词序列/wire匹配/fetch次数投影完全一致。实际每例 generationCalls1、networkStarts1、fetchAttempts1，总最终 fetch2、maxNetworkRetries0，没有补试。

A 的 schema18946B、SHA `a8306b69104c704a9cd783106972c8c7c2d4de1c26a06035702df11a0566e8b8`，HTTP200、stop、直接 JSON。独立零接口解析其合成输出，再调用冻结 case 的 Ajv、原 tuple、production bound decoder 及共同见证检查，全部通过，delta与SDK文本一致。B 的 schema3481B、SHA `0b9c691c55ca53f36cb998da5960f17c7393ce9a2cd04e0697cf9a0a93204855`，HTTP400、私有输出text=null；Native/tuple/decoder没有可验输出，不能标为 schema校验失败或通过。两例实际wire strict=true、same prompt SHA `81381c865de3fa1cb8547355e9893cddf3afc9da5b59742fe228377d09d1e2e2`，schema/input匹配均真。

B 错误观察为完整解析的194B错误体，knownCode=invalid_request_error，只保存闭合 object/properties 相关词及其它静态投影。它不能单独证明 ref、definitions、type sibling 中哪项是唯一原因，也不能推广为所有引用编码不支持。诊断 harness ok=true仅说明观察完成，不代表B成功。私有失败条件记录明确 A200/B400、productTDDCondition441Satisfied=false，成功条件文件不存在；author同轮独立安全收据亦为productTddAuthorized=false。

实际状态及保护：readonlyUsage=true、metadataWriteAttempts0、writeFailures0、closeFailed=false、pageErrors0、stateUnchanged=true；App原退出code0/signal=null、quitTimedOut=false，root记录runner实际exit0。独立复核107依赖、368项R62产品保护及7项author冻结SHA均保持，helper/CJS/运行时SHA一致，未修改产品。台账最新正常全文仍是R62失败，所有全文、七分钟、发布、重开标记均false，activeRun=null；没有把R63静态A成功覆盖正常验收失败。

本次直接核对[DeepSeek Tool Calls 文档](https://api-docs.deepseek.com/guides/tool_calls/)的复用示例，确为单数 `$def` 容器与纯 `$ref`；它与R63 B的definitions/type sibling编码不同。[Responses文档](https://api-docs.deepseek.com/api/create-response/)的text.format段声明json_schema，但该声明不构成上述引用编码的实际兼容证据。444及预读446/447将其限定为新假说、需独立静态对照且失败不实施，边界正确；本审核不代替446/447的按序独审或后续448代码审核。

独立实际命令为Python只读summary/公开投影/冻结manifest/runtime/台账SHA断言，以及Node24加载冻结case、只读合成A输出做原校验、断言B为null且not-run，最终exit0；另执行本文件diff检查。仅访问上述官方文档，未App、未调用模型API、未读取小说或Key、未输出开放错误正文，未编辑产品和测试。后续仍须新诊断按序审核、真实条件通过、产品TDD与完整新提示预算后，再独立启动正常全文验收。
