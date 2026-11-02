# 400 独立方案审核

结论：最终补稿通过，可进入 401 用例审核。

仅四个固定合成例、串行且每例一次 generateText，不含小说/稿件，不改 R47 产品、请求业务规则或限额。已核生产 generate 层 SDK maxRetries 为零；本探针另显式关闭外层网络重试并在实际 fetch 前硬限一次，不能因外部失败补试。各 schema 先用完整合法对象证明本地可满足；HTTP/外部失败记录 validation-not-run，不能误报供应商违反 schema。

生产 generic repair schema 全量保持，合法 replace/reject 仅说明该整份输出合法，不能追认 patch minItems 子门。第四例只有两个全字段固定值，uniqueItems 对本例可表达不同 claim，但不可外推自由对象或一般跨 claim 语义。实际 wire schema/hash/strict、直接完整 JSON 与原 parser 候选须分开核验，不能过滤、修复或循环到符合。

真实凭据仅原 gateway/vault 内部使用；诊断不读 headers/URL/Key/error 正文。0700/0600/wx、readonly usage/metadata 零写、授权/取消/关闭与失败退出边界充分。先 PRIVATE 合成 TDD、402 独审，再由 root 实际执行；本审核未调用 App/API，未读真实数据，不代表供应商保证或全文验收。
