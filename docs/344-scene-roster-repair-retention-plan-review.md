# 344 信息保留纠错独立技术方案审核

初审版本 SHA-256：`856970308415f3c6428e42f36d340b8e86994ecbce7ed19efbadfaaa4ec56874`。

初审结论：有一处来源归属合同阻塞，暂不进入实现。其余完整 prior 数据、两次上限、失败专用保留门、原严格验证及固定安全反馈方向成立。

当前文本以“第二代当前 row 包含原绑定全部 grounded member 键”保护 context/link，不能阻止把另一旧地点一起并入该 row。已用现有 validateSceneRosterRecords 与 appendSceneRosterBatch 独立纯合成实证：首代东/西两书房分别有完整唯一 quote 和 context；次代合一 row 并完整保留全部 mentions、contexts、Anchors。两份均过原门，每旧 owner 都是新 owner 子集，但 ledger identities 从 2 变成 1，限定被扩给另一旧地点。

最小修正无需 whole-row 字节锁：对保护 context/link 的 owner/端点，当前 row 的 member 集合在首代全部 grounded member universe 上的投影须恰等原绑定集合，不能只做包含检查。可允许真正新加入的 grounded member，同时不能混入另一既有 owner；用例应增加上述合并反例。

另须准确处理原角色预算：源码 v2 大窗口 profile 预扣 65536 fixed reserve，而 legacy v1 公式只扣 6000；单过 65536 固定门不能声称所有小窗口容量已证明。当前实际 1M/v2 可明确限定，或为 v1 规定相容的保守拒绝条件，不能扩模型额度或更改旧全局预算政策。已即时反馈主代理与作者。

本次没有读取小说、真实回复、配置或 Key，没有调用 App/API、改源/测试或接受任何首代结果。独立反例仅合成内存数据。345 待此方案阻塞关闭后按序正式审核。

## 修订复核与最终结论

最终版本 SHA-256：`287dadd9aac7b2018ce9b7a3f5187546d85abc58cfe2773922627a3bcc264cca`。结论：通过，以上阻塞关闭，可进入 345 用例独审。

- 旧 grounded occurrence universe 与每个非空 owner 的双向精确投影，既要求旧 owner 有对应当前 row，也拒绝当前额外跨旧 owner bridge；包含无 context/link 的 row。保留原 overlap，允许真正新 member，不锁整行字节/旧顺序/targetIndex，解决已证 2→1 折叠漏洞。
- 稳定 occurrence key 与完整 Anchor/evidenceRange 分离比较，不能缩窗口再称“新 member”。context/link 保留真实 owner/端点、全部已证证据，未证关联不硬造；完全无来源绑定的幻觉只留在完整 prior 供重核，不成为保留义务。原 full metadata 的 literal 归属也不能通过派生洗白。
- 原实际 JSON 候选提取（含 fence）参与保护提取，不能仅因非纯 JSON 清空保护集。先完整原门，再保留集合门；首代从未被拼入或直接采纳为 accepted 结果。
- 可选 hook 仅首个结构失败一次，从 generateText rest 明确剥离；默认 scope/两代/原 cap 保持。完整 prior 作为明确不可信数据安全编码，静态 error/feedback/日志仍禁止回显值；不得为了隐私哨兵断言删 prior。
- 实际第二 prompt 重过原完整 payload/fixed 门；v1 另受当前 role 的实际第二 prompt UTF8+6000 容量门，0/未知沿原16000。v2 原冻结 profile、65536 fixed 与16384 wrapper 常量均保持。超限是首代1次/第二代0次，不能截断、升额度或再生成。

批准的是这个已验证来源信息保留合同；它不能机械保证首代所有未验证 claim 的真伪，也不能代替完整身份/资料复核及实际全书验收。
