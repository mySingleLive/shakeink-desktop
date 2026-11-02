# 345 信息保留纠错独立用例审核

前置：344 修订已按序复核通过，原 owner subset 阻塞已关闭。审核 SHA-256：`90946d11a06c63c290ca75b0ade704a1cb36dc8eb3ba3a29db7fd11139a783cd`。

结论：通过，无用例阻塞，可开始合成 TDD。

- RR01 通过真实 JSON generation 桥验证完整 prior、坏 row 内好事实、有效 link 的真实双端、全部长 Unicode/CRLF 证据；含 fence 和重排/等价编码正控，不允许首代或局部拼接直接提交。
- RR02 的第二代须先能过原完整门，再因真实信息损失被拒绝。涵盖删 row/坏 row 内好 mention、同数换位置、同坐标缩完整窗口、context 证据/owner、link relation/双端/证据。东/西同名合并及“旧 rows 都在但另加 bridge”反例对应独立已证漏洞；原 overlap 和真正新 member 正控避免无意扩大为字节锁。
- RR03 以实际完整第二 prompt 的 UTF8 与真实反馈计 N/N+1，另测 v1 小窗及原有效窗口 fallback；首代产生 prior 后超限应为已调用1次、第二次0次。原材料初始超限才是总0次。验证 generic 默认不变、hook 不进入 SDK、网络/abort/length 仍不能伪成功。
- RR04 将有意完整发送的 untrusted prior 数据与固定诊断分开：前者逐值保真，后者不含秘密值、未知键或 source/ref/hash。不同 unit/窗口不能互换，未证 endpoint/claim 不硬造，最终原门仍必须通过。

先以旧真实入口证明“缩减第二代仍被接受”和“未携带完整 prior”的 RED；缺新 API 仅单列未达，不充作功能 RED。记录实际节点、失败路径、未达断言，必要 new-roster/generic 回归与 tsc/diff 后冻结交独立代码审核。

本审核只读文档和现有源码，并运行一项纯内存归属反例；没有读取 R32 实际原文/回复、调用 provider/App、修改源/测试。合成保护门不能作为 R32、fresh 全文、发布或重开的通过证明。
