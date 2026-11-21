# 401 独立用例审核

前置：400 最终补稿已先审通过。结论：通过，可执行 PRIVATE 合成 TDD。

四例的合法对象、错 enum、空 claims、重复 A、其它合法 generic 分支足以检验本地完整校验器没有忽略关键字；不得只测请求 options 或局部对象。真实 SDK 经合成 gateway/fake 最终 transport 核 actual format/strict/schema hash，actual fetch 至多一次、严格串行与失败不补试覆盖调用边界。

授权/abort/readonly/用量及写失败不转成功，HTTP 未生成时校验 not-run；目录/权限/哨兵、资源全部 settled 后关闭、quit timeout 不被 cleanup0 抹除均需实测。直接 JSON、原 parser 容错与条件适用的子门分别记录，不把其它合法分支或有限 distinct 误报更强能力。

实际四例仍须 402 独审后由 root 运行，source/bundle/renderer 保护哈希不变；公开仅固定分类、计数和哈希。本次只审文档，未运行 App/API、读取小说/Key 或修改产品。
