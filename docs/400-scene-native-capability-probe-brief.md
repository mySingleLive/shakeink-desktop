# R48 静态结构化输出能力诊断（仅私有）

R47 六个正常失败已忠实回放；当前 SDK→合成最终 transport 证实传出 `text.format={type:json_schema,strict:true,schema}`，但旧 R47 body 未保存，且这不证明接口执行子约束。R48 只诊断当前接口对小型静态 schema 的单次表现，不发送小说/原稿，不改 R47 产品，不把探针当全文验收或普遍能力保证。

只在 `/private/tmp/shakeink-scene-import-20261031` 新建 PRIVATE helper/runner/tests/builder 和独立 `dist/review/scene-native-capability-probe.cjs`。先 400→401 独审、合成 TDD、402 独立 code review，随后由 root 实际执行一次。复用隔离 R3 的 ModelRepository/ModelGateway/ModelService、当前已授权 DeepSeek、生产 nativeSceneRoster factory/真实 SDK/主进程出口，主 bundle、原 Worker、v5/text observer、用户配置和 metadata 不改。凭据仅原 main vault/gateway 内部使用，诊断代码不取得、不检查、不记录真实 Key/headers/URL 或开放 error。

固定四例按顺序串行，每例恰一次 `generateText`（不走 generateJSON 纠错，SDK 网络重试为 0），不重跑失败项、无隐藏 fallback。每例除 generateText 次数外还对实际 fetch 设硬上限 1，第二次调用在发网前固定拒绝；所有 schema 先用预定完整合法对象本地证明可满足。①正控：很小的 request-bound repair/claim/CF 单值 enum schema，提示与 schema 一致。②同 schema 的反指令：明确要求换成另一个固定合成 rr/pc/cf。③原 `sceneRosterNativeSchema(...,'repair')` 完整 3015-byte schema，不裁 anyOf/字段，提示固定返回 patch 的空 claims，观察其 minItems=1；若回合法 replace/reject 只记该合法结构，不能冒称已单独验证了 patch 子门。④仍是 repairs→patch→claims 数组形状，每个 item 为两个**全部字段值固定**的 claim 分支（pcA/cfA 或 pcB/cfB），min/maxItems=2、uniqueItems=true，反指令要求重复 A。因每分支只允许一个完整值，这里的整体 item 唯一在本例等价于两个不同 claim；不把任意自由对象的 claimRef 唯一或跨 claim 语义当作 native 能表达的约束。全部 IDs/文本都是固定合成常量，不含业务内容。

helper 在一轮正常隔离 App 中共用 broker，逐例显式授权/快照校验；正常 readonlyUsage（可用量观测，不写 UsageRecord、模型 metadata 或设置），thinking-off/endpoint/model/transport 使用生产选择，不另改输出上限。原正常 timeout/取消/授权门保留；每例安全记录终止状态，HTTP/外部失败仅固定类别，schema 校验标为 not-run，不能把 HTTP 拒绝当作约束服从/不服从；不复制 error.message/stack/cause/response body/headers，不为了得到期望结果补试。所有例结束或外层失败后统一 close broker，再正常 app.quit；runner 保留初始 quit timeout，cleanup exit0 不能抹掉失败。

只在新 0700 目录写 `wx`/0600：每例固定合成 prompt/schema SHA、实际 transport body 的 format.type/strict/schema SHA 及 schema 字节、finish 闭合枚举、直接 JSON 是否成功、原 parser 候选是否成功、完整 schema/单值 enums/minItems/本例 distinctness 的验证布尔、固定错误码，以及**仅生成的合成回复**私有文本。记录实际 wire schema 与该例预定 schema 哈希是否一致；不存 input/body/Key/headers/真实配置。delta 与 final 若不同分别保留，不能伪造 SDK 输入。校验须针对整份直接 JSON，并另列原 parser 容错接受情况，不能靠过滤/修正文本文字制造通过。

控制使用注入 generate/transport/writer，全合成、0 App/API，覆盖一例一次/串行/失败不补试/授权与 readonly/资源关闭/目录与泄漏边界。独立构建只写新诊断 CJS/私有 manifest，含 entry/output/source/保护 bundle hashes；真实产品/R47 source/bundle/renderer hash 不变。实际报告只陈述四次观察，不能由一次符合或违背判定所有 JSON Schema/strict 均支持或不支持。若证据支持，再独立设计 request-bound repair schema，并继续保留本地全部原门；本方案不实施该产品改动。
