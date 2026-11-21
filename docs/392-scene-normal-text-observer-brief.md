# 正常 Worker 场景生成文本的私有观测

R45 正常全文仍失败；新单包回复不能证明历史失败原因。本任务只给下一次正常运行增加私有旁观证据，不改产品源码、主/service bundle、协议、次数、预算、用量或模型。实现文件仅位于 `/private/tmp/shakeink-scene-import-20261031`，独立构建到 `dist/review/scene-normal-text-observer.cjs`；原 v5 observer 保持原样。先按序独审本方案及 393，再合成 TDD/独立代码审核；本代理不启动 App/API。

API 为 `start({root,destination})` / `async stop()`。root 只允许真实隔离 `app-data-r3` 且与 `SHAKEINK_TEST_ROOT` 相同；destination 只允许该 privateRoot/evidence 下新建、非符号链接的独立 `generated-text-private` 目录，0700，每个 transfer 用 UUID 文件名、`wx`/0600 JSON。拒绝既存目录/逃逸/权限不符，初始化失败前不安装。新 observer 在 v5 后安装、在 v5 前停止；仅恢复仍属于自己的两个 Worker prototype wrapper，stop 先恢复、再 drain 已排队写入、关闭并返回安全计数。

包装 `Worker.prototype.postMessage/emit`，完整原方法先 `Reflect.apply`，保留 this/参数/返回值、原 throw、listener 顺序，不等待观测。之后所有观察异常只计固定失败数，不替换原返回或 throw。拒绝 Proxy、accessor/toJSON 或非普通数据，不调用用户 getter/序列化钩子；只取允许的 own data 字段，**不读取或枚举 headers/url/key**，不记录 error 原文/stack/cause。原 RPC 无 transferlist；意外额外 transferlist 不预读/不改传输，观测失败可如实标记。

只跟踪同 Worker 的 `novel-import-ai` 中 semantic1/analyze/roster/scene/sceneIdentity-v1-roster 请求。原 `serializeImportAiPayload` 只临时计算 SHA256，保存 RPC UUID、operation UUID、payload hash；不保留 request、prompt 或来源。Worker→main 的 `model.start` 仅取传输 UUID 和 body 字符串；仅从已知 Responses `input` 文本结构临时找完整 `<novel-import-data>` 块，精确字符串 SHA 匹配本 Worker 活跃请求。恰一请求/恰一合法块才关联；无匹配、多匹配、同 hash 多 operation、重复 transfer 等固定拒绝观测，不取首、不依时间猜。对唯一匹配的完整 input_text 字符串记录 inputTextSha256（UTF8 SHA256，包含本轮实际纠错文本），只保存哈希；body/文本解析后释放，不落盘。每 transfer 的序号是传输序号，不能冒称模型 generation（网络重试可能另起传输）。

Worker→main `model.read` 的 RPC id/value-transfer UUID 与 main→worker 回复关联；只在原 delegate 成功后复制实际 `done:false` 的 Uint8Array bytes，不改数组/缓冲区，忽略 `done:true` 的 bytes（原 worker 同样不消费）。每 transfer 独立增量 UTF8/SSE 解析，完整处理跨字节/CRLF/事件分片。只取 `response.output_text.delta` 的 delta、`response.output_text.done` 的 text，以及 `response.completed.response.output[].content[]` 中 type=output_text 的 text；未知事件、reasoning、工具、usage、error 原文、原始 SSE/bytes 均不存。**deltaText 仅按收到 delta 拼接，done/completed 另存并保持顺序，绝不能以 final 覆盖 delta 冒充 SDK 实际输入。**

每个 JSON 另含 providerEvent=completed/incomplete/failed/none（仅来自已知 SSE type，取最后一次），以及 incompleteReason=max_output_tokens/content_filter/other（仅 incomplete_details.reason，未知映射 other），不读取或存储开放 error。多种终止事件冲突只计固定冲突数并标记捕获不完整，不能把运输 done 说成 SDK finish=stop。

每个 JSON 只含 `version:1,rpcId,operationId,payloadSha256,transferId,transferOrdinal,deltaText,outputTextDone:[{outputIndex,contentIndex,text}],completedOutputText:[{outputIndex,contentIndex,text}],streamClosed,captureComplete,terminal` 及 bytes/events/parseErrors/utf8Errors 固定计数。final 索引只收非负安全整数；completed 的数组位置为对应索引，忽略其它字段。terminal 为固定枚举 stream-done/cancelled/transport-error/stop/limit/parse-error；captureComplete 仅表示本观测没有缺失，不证明模型 JSON 合法或业务通过。每 transfer SSE 单事件和已捕获生成文本各限 16MiB、全部活动捕获合计 256MiB；超限停止该捕获并标记不完整，不阻断原流、不把部分文本当完整。写入失败仅 writeFailures；不改变业务成功/失败。正常 done/cancel/error、最终 RPC 结束和 stop 均释放关联；stop 对剩余已关联流输出不完整终结并 drain。

builder 仅生成新 CJS 与 private `scene-normal-text-observer-build-manifest.json`，包括 entry/entrySha256/outfile/outputSha256/productSourceHashes/protectedBundles；构建前后复核保护 bundle/hash，不改现有 v5 或正式产物。合成控制不能冒称真实全文；实际运行由 root 执行一次正常 fresh，并将本次捕获与同次 payload/RPC 关联，仍保留 R45 原回复未捕获的限制。
