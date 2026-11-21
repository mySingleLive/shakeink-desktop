# 具体地点识别：R28实际失败及独立诊断

2026-11-01。R28在冻结构建、独立325—330准入后新鲜真实启动当前DeepSeek与隔离Electron。1402章/5589工作单元结构匹配原基线；detect-scene进入约51秒后返回invalid_schema，scene roster coverage、账本records及生成scene artifact均为0。driver exit2、正常app exit0；未发布、未重开，不能宣称全书通过。历史该失败raw及runtime未留，通用“响应结构”不能证明是哪一类或哪个具体包失败。

随后从不可变失败会话，调用原controller.executionBudget/stageRequests，重建原顺序首包（59总包中的第1包；不是已证明的历史失败包）：94units，payload96029字符，SHA256 `30feff579aa3eedb68c41f118c3b95b7319da3baddcf35634a976c4b7ca66c0e`。原role/授权/预算、原两代生成及末端schema保持；只读helper独审准入后单包实际调用，generation返回文本仅写wx/0600私有文件，不保存options/Key/endpoint。DB Proxy与元数据写入门均拒绝，readOnlyImportUsage不写本地用量；正常app exit0、state.json hash不变。

单包实际34.274秒，2gen finish=stop，仍失败：

| 代 | 输入/输出tokens | 实际分类 |
| --- | --- | --- |
| 1 | 60232/4893 | provider wire strict形状通过，24 records；原pure validateSceneRosterRecords判anchor失败 |
| 2 | 60359/5434 | provider wire strict根object形状不通过，invalid_type；不能把它说成canonical sidecar缺失 |

第一代只用于定位的安全计数为：context label未在对应quote中32次、name/alias缺对应mention12次、quote与声明unit不匹配10次、mention.literal不属于name/aliases6次、literal在quote中不唯一1次；24条均至少一处失败。该计数不是放宽验收或部分接受。实际第一代raw SHA `e96fd92519eb9443fb4d2ca74db98076ef302cf4f7e19e68768402e25196c566`；第二代 `e0a930ef3f25ba2971cf784de89d9be2853c6d4cfd5e55ea2bd289a9ad519e0f`。不记录原文值、地名或模型raw。

只读源确认：原校验明确要求context.label逐字在每条context.evidence.quote中，但新prompt/纠错未完整明说；generation wrapper又将所有shape/anchor问题压成相同path=[]和同一指导，无法让第二代定位字段。独立全合成真实generation桥证明旧flat形状、合法shape但context概括label、合法shape但quote不匹配三者均2gen、同一invalidFields/feedback；这证明诊断塌缩，不能倒推R28历史raw原因。

下一步按332/333修输出/纠错合同，保留原strict provider/canonical双门、完整原文、两代上限及预算，不静默删改坏项或原文。仍需新鲜全书、发布与重开实际验收。
