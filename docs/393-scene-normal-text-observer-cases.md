# 正常 Worker 私有文本观测用例

1. 真实 Node Worker + 原 RpcPeer 合成往返：scene roster 请求→model.start→多次 model.read，当前同 Worker/RPC/payload SHA/transfer UUID 精确关联。完整 input_text 哈希与合成实际字符串相符、原字符串不落盘；delta 与 done/completed 故意不同，JSON 三者分别精确保留；正常原结果、this/参数（含额外参数）、原 throw identity、listener 顺序/数量都不变。先真实控制 RED 再实现。
2. 15 并发、多 Worker、乱序 read 回复、同 UUID 跨 Worker、重复 start/read、同 hash 的两个活跃 operation、非 scene/非 roster、未知/已完成 id、多个 payload 块：不能跨绑或选首；唯一匹配才捕获。计数/文件名只有 UUID/hash/固定字段；不声称传输序号等于 generation。
3. 所有字段边界用 Proxy/getter/toJSON 与 header/url/key 私密哨兵；禁止访问的字段放 getter，触发数必须 0。只允许 output_text 字符串落私有文件；未知 SSE、reasoning、usage、error、提示和输入资料哨兵不得落盘/普通输出，诊断异常不影响原业务。typed bytes 不调用自定义 getter/迭代器、不改原 buffers。
4. UTF8 中文/astral 每字节切分、CRLF 跨帧、SSE 多 data 行/多事件/尾部 flush、无 completed 但有 delta、done:true 附 bytes、无效 UTF8/JSON/未知事件、取消/传输错误；固定完整性状态准确，不存原始坏帧。completed/incomplete/failed/none 及 max_output_tokens/content_filter/other 原因严格区分，仅取闭合枚举，开放 error/未知 reason 私密哨兵不回显；不能以运输 done 猜 stop。单流及总量限额边界、写入失败/关闭失败均仅诊断，部分内容绝不能报完整。
5. start 目录逃逸/符号链接/既存目录/权限错误和部分安装失败原子回滚；0700/0600/wx、不覆盖已有文件。v5→新 wrapper 链，stop 新→v5，恢复原 descriptor；第三方后来 wrapper 不被删除。stop 等排队写入 drain、关闭资源，重入幂等；合成测试/构建不得 App/API，保护 bundle 逐值 hash 不变。

证据只报告命令、计数/哈希、权限与退出码。生成文本仅 0600 私有 JSON，不进入 repo/工具回显。此用例通过只证明观测器旁观控制，不代表全书导入通过，不能拿新请求生成文本伪称 R45 历史失败回复。
