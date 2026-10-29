# S02 D1：独立预AI冻结核对

2026-10-27。**结论：本run冻结输入及新来源快照身份PASS，无新增oracle答案或期望放宽。** 仅核对指定外部不可覆盖文件、原S02来源/独立全文及原事前勘误；未操作应用、模型、数据库或privatejournal，未执行产品测试，也未改冻结文件。

D1为重新正式重测：`S02-20261027-D1`。freeze时间为`2026-10-26T17:10:50.229418Z`（本地10月27日）；原oracle及erratum没有重写。旧C1 privatejournal缺失的原因未建立，absence及旧失败证据由主代理保留；不能凭历史checkpoint称旧C1可继续或通过，本次不恢复旧产物信用。

## 输入逐字核对

- 原合法完整MD、原`S02-complete-independent-text.txt`完全同字节，SHA `1448c3029e798e667b629044e603dff0d842869a4e2214624e64dcba9789fd7d`，全文6294字符。没有采用原不完整TXT。
- oracle-frozen逐字等于原`语义基线/S02.json`，SHA `fb3a57cf7427da54522c2784559c98872634fe9baee0fbff366dd49913f147aa`；保留文言引子及13则日记共14单元的原完整覆盖及全部原期望。
- expected-body严格等于原UTF-8解码来源的零基、半开区间`[14,5324)`，5310字符、15340 UTF-8字节，SHA `1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697`。未规范化或更改文字/换行。
- errata-frozen逐字等于原预AI sidecar，SHA `39f0bb8a23530ee6ede5799527f94c3064e06af5481d5917dbdf597ce1603d2d`。原记录时间`2026-10-26T10:41:22.758538Z`早于D1冻结；其不可变输入hash均仍匹配。本次重新实切核对原JSON pointer `/requiredFacts/4/evidence/1`与旧证据记录一致，替换full范围`[615,634)`、body-relative范围`[601,620)`的连续quote及第二则所属均正确。仅纠正正文外注释定位，不删除或弱化原事实，未把注释当叙事证据；本报告不复制引文或添加文学答案。

## 新来源快照

新session `3666f5dc-a7b8-4584-a633-cb9dbc0b9742`，rev1、phase source、createdAt `2026-10-26T17:12:31.379Z`，严格晚于freeze，且不在run冻结的existingJournalIds中。未改该列表来制造新会话身份。

105个来源unit按start/end连续覆盖`[0,6294)`，各text逐字等于原来源同区间切片，直接concat等于完整原MD/hash1448c3；单一included文件hash也相同。冻结body范围重新核对仍为5310/hash1df1。selected、steps、decisions、artifacts、conflicts、patches均空，coverage为空，analysisCheckpointHash为null，originalProse/workingProse均空；外部assertions记录runtimeAiCall为null、rawSessionInjected/restoredOldArtifacts为false。该快照时点无已分析/恢复产物信用。

pre-ui-preparation记录指定空目标`导入作品/run-S02-20261027-D1`的device/inode和modelCallsSoFar=0。空目录/0AI的现场依据是主代理准备记录及上述预AI安全投影，本人未另读实时journal或用户库。run记录沿用当前配置；所记main/service构建0624ce9/437b9df、AI service20b80、payload87b9均为既有身份，不修改模型、提示或开关。

105是原文件读取片段数；原oracle的14文学单元仍为后续边界/章节核验依据。本次不预记正文范围已在UI确认、14章节设置完成、模型分类/12目标分析、语义质量、LIFE或发布通过。后续须绑定同一D1实际新session逐项留证，不能将旧C1结果移入D1。

## 本次核对文件SHA-256

| 文件 | SHA-256 |
| --- | --- |
| run.json | `fa81c2fabf15a5814cf4c34d653bc23976f7d8b642d840e438047ada462d1c90` |
| oracle-frozen.json | `fb3a57cf7427da54522c2784559c98872634fe9baee0fbff366dd49913f147aa` |
| expected-body.txt | `1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697` |
| oracle-errata-frozen.json | `39f0bb8a23530ee6ede5799527f94c3064e06af5481d5917dbdf597ce1603d2d` |
| pre-ui-preparation.json | `85a851121349c9a5127b9077da6f8cb5c361d237f6e62945d768ab51cd55d639` |
| pre-ai-source-checkpoint-rev1.json | `f4cd0022eea8e73aed73b949c926fc3a5647153d8b83622de0578617b5f9eac6` |
| pre-ai-source-assertions.json | `97b52fe829de5e76c65eca941aa77818a5ec6e747ee64d2ce2bc3c439d950fa1` |

上述七个外部文件核对后hash保持；本报告仅保存短定位与元数据，原小说/基线/勘误/冻结证据均未写入或覆盖。
