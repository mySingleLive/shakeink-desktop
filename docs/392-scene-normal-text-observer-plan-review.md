# 392 独立方案审核

结论：最终补稿通过，可进入 393 用例审核。

已核 `desktop/service/rpc.ts` 无 transferlist，`models.ts` 的 start/read/cancel 使用独立 RPC/transfer UUID，存在无需改产品的观察点。仅在原 delegate 成功后旁观，不等待观察、吞改原异常或消费原字节；读取使用允许的 own data 字段，Proxy/accessor/序列化钩子和 headers/url/key 均不得触发。观察异常只影响诊断。

同 Worker、唯一活跃请求与唯一完整 payload 块的精确哈希关联充分；歧义不捕获，不靠顺序猜 generation。body、request 和 input_text 仅内存派生哈希后释放，不落盘。仅生成 output_text 的 delta、done、completed 分别保存，不能以 final 替换实际 delta。providerEvent 与闭合 incompleteReason 仅记录 SSE 所见，冲突标不完整，不能把 transport done 当 SDK stop。

独立新目录 0700、UUID/wx/0600、明确完整性及有限捕获、异步写入隔离、stop 恢复自身 wrapper 后排空，均保持原业务门。实现需使待写捕获在释放前仍受总量约束，不能借结束 transport 绕过有限内存。原 v5/正式 bundle 不改，builder 保护哈希复核；不读取或归因 R45 历史原回复。未改产品或运行 App/API，未读取真实资料。
