# S02-C1 · 来源用途分类与正文边界独立复审

日期：2026-10-26。审核者：独立测试子代理 `cross_platform_picker_design`。

**分开结论：核心叙述识别PASS；首次自动精确正文边界FAIL，永久保留；人工按事前冻结范围核对后的rev11选区PASS。** 作者署写日期被判unknown属于边界/保留策略的人工核对项，不把它夸大为文言引子或十三则核心叙述识别失败。人工结果不能倒算首次模型全自动通过，也不证明设定生成、两线、发布或整书质量通过。

## 只读证据与阶段

只读外部 `执行证据/S02-20261026-C1/` 的已归档文件，对照事前冻结oracle和erratum；没有读取当前用户journal、修改原件/基线/生产prompt或操作app。下述人工UI动作由主代理执行，本审核只独立核对其归档结果，没有重放UI或运行tests/模型。

| 文件 | SHA-256 |
| --- | --- |
| oracle-frozen.json | `fb3a57cf7427da54522c2784559c98872634fe9baee0fbff366dd49913f147aa` |
| oracle-errata-frozen.json | `39f0bb8a23530ee6ede5799527f94c3064e06af5481d5917dbdf597ce1603d2d` |
| expected-body.txt | `1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697` |
| pre-ai-checkpoint-rev4.json | `f60ee79dbcb36714adcefe7d247ef0c56ebdd6485f6a2f5aa0227662a22e4b67` |
| classification-checkpoint-rev8.json | `dc51d48fcbcdb52e47e1a3069d3bed5b991a58c13f831bcf7955474fe87f0545` |
| boundary-checkpoint-rev11.json | `d6446a968d9bc394917cfcd1938076b0114a3750a723d62d946228c5990713b6` |
| boundary-assertions.json（主代理记录） | `0686f7d4d8cf760511306742f0013c42091c84862b25ccaaef1074f5d04a6b79` |

session为 `4aea2d40-2fb9-4506-85aa-4d409b3e7399`，MD文件ID为 `3d3a4ee7-b354-4fb9-a3ac-da08ef7a849b`。rev4/8/11均处于source阶段、workingRevision0，originalProse/workingProse均尚为空、artifacts为0，publication为空。分类AI已实际执行；截至本证据阶段还没有开始生成大纲/角色等设定，不将“尚无设定生成”误写成从未有AI分类调用。

事前所选范围仍为全文Unicode codepoint半开区间 `[14,5324)`，LF及全角缩进原样保留：5310字符、15340 UTF-8字节、SHA如上。范围含文言引子、十三则日记及原署写日期；头部题名/围栏与尾部现代注释/围栏在范围外。erratum只纠正一条古久簿子引文定位，没有改变正文边界或事实要求。

## 首次分类：没有改写来源几何，但没有自动得到精确选区

rev4的105个unit全为unknown；rev8为body91、unknown14。逐对象去除kind后，id/fileId/start/end/text/part等全部相等。units连续覆盖 `[0,6294)`，每个text都等于该全文slice，拼接6294字符的SHA为 `1448c3029e798e667b629044e603dff0d842869a4e2214624e64dcba9789fd7d`，与冻结来源身份一致。

非kind单位对象的本次规范JSON比较SHA为 `0d51510ac1b169b912afe02e96aeb06a0b4edd0717d326decef088f38ae0fa4d`（Python sort_keys/紧凑分隔符/UTF-8），仅为只读几何比较指纹，不是产品importHash。

| 全文区间 | 首次标签与字符数 | 来源用途判断 |
| --- | --- | --- |
| `[0,14)` | body · 14 | 围栏/题名及分隔，不在事前所选正文；自动误纳入 |
| `[14,5288)` | body · 5274 | 文言引子及十三则核心叙述，直到末尾呼救及其换行，全部识别为正文；核心识别PASS |
| `[5288,5324)` | unknown · 36 | 全角缩进及作者署写日期；按事前政策需保留在导入正文，但不是故事发生日期，须人工核对 |
| `[5324,6294)` | unknown · 970 | 边界外空行、现代注释及尾围栏，未被标body；unknown仍是待核对，不冒称已自动完成excluded |

首次合并标签为body `[0,5288)`、unknown `[5288,6294)`。冻结正文内部是5274 body + 36 unknown，不是“14个正文段落漏识”；105为解析分块数，也不是文言引子+十三则的14个阅读单元。

若当时直接按body标签抽取，候选为5288字符/15260字节，SHA `aaa1fd507e2101a5fa843aaaa316a56a8132c8916bb89c274a30d934491f5fac`，不等于冻结5310字符/hash。该候选是本审核只读拼接计算，**不是声称rev8已经保存了这份错误正文**；rev8的original/working正文仍空。自动精确边界因此FAIL，不能通过改期望范围来消除。

日期原unit是 `[5288,5326)`，含署写日期后两个边界外LF。只把整unit改body也会多保留2字符；头界14又落在原 `[13,291)` unit内部。精确人工核对必须按冻结区间处理，不能靠整段标签数量认定精确完成。

## 人工核对后的独立事后验证

主代理记录的三处UI处理是排除 `[0,14)`、排除 `[5324,6294)`、仅将 `[5288,5324)`保为body。本审核重新读取rev11单位自行拼接/比较，没有仅采信boundary-assertions的true值：

- 107单位，body91/excluded16/unknown0；两处边界被分割，不再有跨14或5324的unit。
- 全部unit的text依旧逐字等于来源slice、几何连续，拼接与rev8全文完全相同，仍6294字符/hash1448。
- 每个body unit都落在 `[14,5324)`；两侧均excluded。选出的body逐字节等于expected-body，5310字符/15340字节/hash1df1。
- 日期单元变为 `[5288,5324)`并保留原文字/缩进； `[5324,5326)`两个LF另为excluded，没有把原38字符日期unit整块纳入。

据此，**人工核对后选区PASS**，原文没有因裁选被改写。署写日期作为所选原文保留，不转成日记叙事内的具体发生日期；现代注释未因此进入正文。人工步骤及原分类快照均应保留，不以rev11覆盖rev8或回填“自动分类完全正确”。

## 不在本结论内

主代理另说明实际自动章界UI仍为未分章正文，正在按事前14阅读单元手工核对，之后才启动十二目标分析；本报告没有该后续章界归档，**不判自动章界或人工章界已通过**。也未审S02设定、人物、妄想/转述知识范围、两线或发布。后续需以实际产物与原冻结事实另做文学审读，不能以本次来源用途/边界核对替代。
