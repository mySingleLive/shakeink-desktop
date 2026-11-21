# 393 独立用例审核

前置：392 最终补稿已先审通过。结论：通过，可执行 PRIVATE 合成 TDD。

真实 Node Worker/RpcPeer 往返及 this/参数/原 throw/返回/listener 顺序覆盖业务透传；多 Worker/乱序/同 hash/重复和未完成关联覆盖不得跨绑的主要边界。输入完整字符串只核 SHA，生成 delta 与不同 done/completed 分存，证明未用最终文本伪造 SDK 所见。

禁读字段 getter/Proxy/toJSON 哨兵、逐字节 Unicode/CRLF/SSE 分片、未知/坏帧、终止冲突/闭合 reason、取消/限额/写失败及不完整标记均有必要负控。目录/权限/wx/安装回滚、v5 链式恢复与 stop 幂等排空充分；代码审核还需核全部解析和写入异常不能越过原委托边界，待写数据不逃总量限制。

合成与 builder 不启动 App/API，不读真实回复或原文。通过仅证明旁观控制，真实运行捕获须与同次 payload/input 哈希关联；不能替代完整场景、资料复核、发布或重开验收。
