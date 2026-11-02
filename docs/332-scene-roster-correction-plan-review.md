# 332 独立技术方案审核

结论：通过，无方案阻塞。审核版本 SHA-256：`8a625ba26af9eb23a6c9c961468d741561031603f87c1bffa0787796a691ad31`。

已对照新 scene roster 的 payload prompt、sceneIdentityWireSchema、sceneRosterCanonicalSchema、validateSceneRosterRecords，以及 generateJSON/parseJsonOutput 的两次生成、六条反馈和 250 UTF-16 code unit 截断。方案限定新 v1 scene roster 生成分支，原 wire/完整原文校验和 canonical/main 门不变；补足根对象、五个必需字段、literal/name/alias、每条 context 原样包含和本包 links 指导，与当前接受门一致。

失败专用诊断必须在原 strict shape/完整 validator 已拒绝后工作，不得用诊断输出参与接受、补值、改引文、重绑定或过滤条目。shape 不合法时不进入要求合法结构的语义遍历；仅将已知字段 token 与当前数组的合法安全索引组成路径，未知键/原 Zod message/名称/ID/quote/值均不得拼入反馈。无法证明具体原因时使用固定 fallback。最多六项、每条 250 UTF-16 code units，与实际纠错截断保持一致。

scope 外反馈、模型/role/thinking、两次生成、output cap、完整 payload/新增 prompt 预算和 wrapper reserve 均保持。实际 R28 历史 raw 未保存，331 当前单包诊断不能冒充已重现历史唯一根因；本方案也不能保证供应商下一代一定纠正。

可进入 333 用例独审；其通过后先 RED 再实现。此处没有修改产品/测试、启动 App、读取真实小说/私有响应或调用接口。
