# S02 D1：最终持久化限定独审

2026-10-27。**结论：本次既有导出的机械保存与身份绑定PASS；实际机械断言为63/63。文学FAIL保持，两者不相互替代。** 只读本run的publication-01-audit、最终rev83、原freeze及主代理UI记录，未连接已重开的数据库、读取global/其它作品、操作app/model或修改冻结文件。没有重跑审计CLI或产品测试。

## 身份、正文与章节

run `S02-20261027-D1`，session/request `3666f5dc-a7b8-4584-a633-cb9dbc0b9742`，最终revision83、completed。workId `0d65bf25-d653-4e61-99d2-6f9638dd146a`，novelId `cmvpjn2uh000jvb6v4nks6hnn`。断言与业务导出的identity完全一致，并与冻结run、最终checkpoint、publication回执逐项绑定；importHash为`5e526f4a6aeeda1c25fbab2dbeebd9ff8864d91962e322aa6fdf8762f6d9357d`。

独立核算：单一卷下14章index为1–14，标题为文言引子、日记一至十三；每章content逐字等最终manual章的content及expected-body同区间切片，status均WRITTEN，wordCount等UTF-16长度。逐章长度为`278,101,368,824,701,300,57,414,476,133,1139,299,150,70`，合计5310。直接拼接原生Chapter.content，无额外分隔符，严格等ordered-body.txt、expected-body.txt及checkpoint/导入审计的originalProse与workingProse，UTF-8 SHA均`1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697`。

原源SHA1448c3、oracle fb3a57及run metadata fa81c2与导出身份记录及真实冻结文件一致；完整源6294字符中选择的`[14,5324)`仍为这5310字符。事前erratum沿用39f0bb，不修改正文、原oracle或既有负证据。

## 59份产物的原生保存

59个material ID唯一，审计materials除额外派生characters计数外，与最终59 artifacts的id/kind/name/text/facts/evidence/sourceUnitIds/origin逐项相等，characters也按UTF-16独立重算一致；没有丢掉原facts或只保文字。全59均inferred/projectable，无source-copy fallback或mapping warning。原生行不要求与产物一比一：部分按既定业务聚合，具体核算如下。

| 最终产物 | 真实业务导出与独立交叉核算 |
| --- | --- |
| character 12 | 12角色，通过extra.importArtifactId逐一绑定；name/roleType/bio/aliases及明确profile值匹配，关系characterId换为实际同作品ID，描述保留。 |
| scene 3 / item 7 | 对应3地点、7物品；完整名称及知识限定后的正常文本多重集合精确相等。 |
| world 1 | 对应1个“未命名世界”根，parentId=null、description空，无额外世界。 |
| theme 5 / style 6 / outline 1 | 5主题完整聚合于Theme.synopsis；6文风完整聚合于一个STYLE Setting.content.style；大纲完整保存于卷summary，顺序及分隔/文字一致。 |
| foreshadow 6 / trope 2 | 对应6伏笔、2情绪点，名称、完整文本及SATISFACTION/TEAR枚举与产物精确对应。 |
| worldline 2 / narrative 14 | 保存于真实PlanningDocument结构，见下节；未另造伪原生行。 |

上述文本逐项独立按当前facts拼出可靠性、信息来源和适用时间范围限定，再与导出字段精确比较，未调用生产formatter自证。**数据库Setting总数1只是作品级STYLE，worldId/parentId均null；世界级SETTING仍0。** 不能拿STYLE抵消社会/文化世界设置的文学缺口，也不能把机械断言名称含“九类设置”解释为本样本九类都实际生成或落库。

## 两线、引用与审计回执

PlanningDocument实际含2个世界线容器、2个事件、1条阅读线、14张叙事卡，另有实际卷与14章对应结构。逐一核对原worldline ID→import-event/line ID、完整qualified fact、people的实际角色ID、timeKind和父引用；两个timeKind仍是unknown，不把原生默认数值解读为作品确定时刻。

14个narrative各对应唯一卡与telling，完整qualified intent、reliability、narrator原值与实际角色ID、chapterIndex→真实章节ID、order均一致；planning卷章ID/标题与实际表一致。**源14条narrative的refs本来全为空，实际也保存0条**：这是忠实保存已生成结果，不能证明叙事与事件的文学关联完整或两条宏观事件足够。

只有一个NOVEL_IMPORT ContentVersion(version1)和一个同novel的ContentMutation。snapshot的session、importHash、原/工作全文、全部59材料、证据与来源文件hash保留；回执operationId为`novel-import:`加本session，requestHash/afterHash同publication importHash，beforeVersion0/afterVersion1，beforeHash等SHA256(JSON null)，result绑定同novel/request/hash。没有用别的作品或旧C1回执充数。

semanticAudit stage为ready，projectableIds精确覆盖59；decisionHash/workingRevision0/round0/verifiedHash与checkpoint一致，locks/repairTasks/omissions/persistentConflicts为空，manual chapterDetection保留。coverage/targets/notFound/decisions一致：12目标已覆盖，goldenFinger无产物且列notFound。预算policy及6个working-unit身份/范围/JSON字符串编码textHash也独立重算匹配；textHash不是原始UTF-8 text直接SHA，二者未混用。

审计assertions数组实际恰63项、名称唯一、全部passed=true；导出counts与各组实际行数一致。独立复核据原行与最终材料核算上述关键内容，没有只凭passed标签接受，也未把保存的可靠性标签当作文学判断必然正确。本报告不重新连接数据库证明现场读取方式，审计脚本执行/事务边界依据已审脚本身份及本次固定导出。

## UI证据归属与结果边界

`publication-01-ui-shutdown.json`是**主代理原生UI观察**：打开导入作品，见14章、首章文言引子278字及框架文本、一个中性世界按钮；未编辑业务。记录正常菜单退出0、pendingAiCall=false，并明确不算正式LIFE。本人仅核对该文件的run/session及数字与导出一致，未冒认自己执行UI或核验全部面板可编辑。应用随后已重开，本审核没有为复核再次关闭或打开DB。

机械结果说明“已生成的这些内容被完整保存”；它不能补出缺失材料或验证叙述归属正确。[物品/世界观最终文学复核](S02-D1-partial-items-world.md)的不通过结论保留，全文质量、世界级设置缺口、叙事事件关联及其它独立文学结论不升级。也不外推PDF/OCR、Windows/Linux UI、供应商内部次数/费用或正式在途暂停恢复通过。

## 固定证据SHA-256

| 文件 | SHA-256 |
| --- | --- |
| run.json | `fa81c2fabf15a5814cf4c34d653bc23976f7d8b642d840e438047ada462d1c90` |
| oracle-frozen.json | `fb3a57cf7427da54522c2784559c98872634fe9baee0fbff366dd49913f147aa` |
| oracle-errata-frozen.json | `39f0bb8a23530ee6ede5799527f94c3064e06af5481d5917dbdf597ce1603d2d` |
| expected-body.txt | `1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697` |
| completed-checkpoint-rev83.json | `2835a1d1366ad9e7797c479dd68e2316f26f37d0b9abe96e54dd449a31551abc` |
| publication-01-audit/assertions.json | `0399aa696498d4cd7146e82d7bf53549cc8a63cd97a7aa2addfbc5d020b9813b` |
| publication-01-audit/business-records.json | `c64afb019edce4ae07cfbfb09aeef64944a96254f9c7c1b5e72547f1d74b6d13` |
| publication-01-audit/ordered-body.txt | `1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697` |
| publication-01-ui-shutdown.json | `7ac5c790d764d3b5e06d92b1a3cd53386b0b128b57a8bcf0c0cb508db4f089ef` |

审计导出记录script SHA `becc7ddb3fb4b615b77a87c11b778d375e9f4a2530c256c19053e3ef6afe8472`；迁移资源身份为其记录的63项集合（与63条业务断言是不同计数），本轮未重跑迁移或重开数据库。报告只含元数据与核算结论，未将原小说、完整产物或业务导出复制进repo。
