# R40 一次并发只读诊断

370 独审通过后，执行已审脚本一次，17,470ms 正常结束。原 R39 planner 的首 15 个 payload 逐项哈希及顺序相同。本次产生的是新回复，不重现或解释历史原始回复。使用已授权当前接口，单 broker/transport，readonlyUsage，网络重试 0；因此不替代正常用量落盘及全文验收。

15 请求中 12 个通过完整原有门、3 个失败，共 25 次生成，均为 SDK `stop`。原始文本写入新私有 700 目录、600 文件；writeFailures=0、closeFailed=false，输入、state.json 与受保护产品 bundle 哈希不变。应用正常退出码 0、quitTimedOut=false。脚本正常退出不代表 15 项业务全部通过。

两项首答为非空 JSON 语法错误，原解析器全部候选无法解析：请求 3 为 4,520 字符，语法位置 3,427；请求 6 为 2,400 字符，位置 1,968，均涉及括号结构。未将小说或原始回复放入公开证据。另一个请求第二次回复可解析，但未通过原限定资料校验。

对第三项保存的两次回复离线复跑（0 模型调用）得到固定源代码诊断：`context.label必须为原文具体限定词或值，并逐字连续出现在该项每条evidence.quote中；不用类别标签或自造组合词，保留全部有据限定。` 该修复行的 keepContext 为 0，第二次回复新增了 1 项限定。此项仍应拒绝，不能通过删除校验变成成功。

这次证据确认需要处理实际模型格式/资料错误；不能依赖正常结束标志或本地 SDK schema 参数。DeepSeek 当前文档列出 Responses 的 [JSON Schema 格式](https://api-docs.deepseek.com/api/create-response/)；[JSON Output 说明](https://api-docs.deepseek.com/guides/json_mode/) 也要求客户端处理空白等异常。该文档不证明本次回复正确，实际原校验结果优先。

本次没有完成全书场景识别、全部生成、正文与资料复核、发布及重启持久化验收。
