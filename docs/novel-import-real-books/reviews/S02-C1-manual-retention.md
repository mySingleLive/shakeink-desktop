# S02-C1 · 手工章界与来源保持独立复核

日期：2026-10-26。审核者：独立测试子代理 `cross_platform_picker_design`。

**限定PASS：重新填写14段手工章界后，rev19的本地确认结果完整保留章界、所选正文和选择配置。** rev15曾退回自动单章的失败永久保留；本结果不表示自动识别章界通过，也不表示暂停前章界无需重填即自动恢复，更不表示设定生成、发布或整书通过。

## 证据范围

仅只读外部 `执行证据/S02-20261026-C1/` 的下列冻结文件及既有oracle、事前erratum、expected-body。未读实时journal、操作应用/模型/数据库、运行tests或修改外部证据。主代理执行UI，本审核独立重算归档内容，没有重放UI。

| 文件 | SHA-256 |
| --- | --- |
| preanalysis-resume-block-rev15.json | `8805622a1ed758d608d5369f59c95d7518f4641d66acb774923316ef46e0f700` |
| chapters-checkpoint-rev12.json | `4e5e6d5ed79608b1844733499532fb4392d5d1997715c95fec6173daf44e8647` |
| manual-retained-after-local-rev19.json | `028ab43c755ce3e04bcb78a614a7613699650e74b736e0855da312ed3ce657de` |
| manual-retention-actual-assertions.json（主代理记录） | `fccbe86237d781e71538cfe877b4e3dda958b9396a9d0099c1e4d07a88065820` |
| oracle-frozen.json | `fb3a57cf7427da54522c2784559c98872634fe9baee0fbff366dd49913f147aa` |
| oracle-errata-frozen.json | `39f0bb8a23530ee6ede5799527f94c3064e06af5481d5917dbdf597ce1603d2d` |
| expected-body.txt | `1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697` |

session始终为 `4aea2d40-2fb9-4506-85aa-4d409b3e7399`。rev12为confirm/manual14；rev15为paused、resumePhase=select，但已变auto/未分章正文一章。该历史失败真实存在，error字段为空不等于没有章界保持失败。主代理记录的新实际操作是重新打开恢复select、重填相同14段，再仅做本地确认；rev19为select/manual14。

## 独立重算结果

- rev19与rev12的14个chapter**整个对象逐一相等**，包括每个 `id/start/title/end/content`，不是仅比较数量或标题。ID唯一，范围连续覆盖正文 `[0,5310)`；各content逐字等于正文对应slice，拼接逐字节等于expected-body。
- 14段为文言引子及十三则日记；所有标题、起止位置均等于冻结oracle的全文坐标减14。正文相对边界依次为 `0/278/379/747/1571/2272/2572/2629/3043/3519/3652/4791/5090/5240/5310`。
- 107个unit与rev12整个对象全等，body91/excluded16/unknown0。全部text与连续来源几何一致；拼接全文6294字符、18174 UTF-8字节，SHA为 `1448c3029e798e667b629044e603dff0d842869a4e2214624e64dcba9789fd7d`。
- 所选body仍严格为全文 `[14,5324)`：5310字符、15340 UTF-8字节，SHA为 `1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697`，与冻结expected-body逐字节相等。署写日期保留在选区内，未因此成为故事发生日期。
- 单个来源文件的全部rev12既有字段均保持相等，包括id、name、format、hash、included、encoding及proof；未在报告公开proof值。**files整体对象并不全等**：rev19新增 `ancestors/bytes/path/requiresEncodingConfirmation/sourceRoot/text` 六键，形状变化的原因不作推断。新增text逐字等于全部unit拼接及冻结来源，bytes=18174，requiresEncodingConfirmation=false；这不是源字节发生变更。
- selected仍仅body；infer=true；十二targets有序保持为 outline/theme/style/world/character/scene/item/foreshadow/goldenFinger/trope/worldline/narrative。rev12、15、19均没有target字段，artifacts为空、coverage为空、没有publication；原始/工作正文字段仍为空，workingRevision=0。因此本次5310字符校验来自来源选区与章内容，不能冒称已经写入workingProse或完成分析。

主代理断言文件的章界、units、正文、选项和无产物记录均得到独立计算支持。本地操作未开始设定生成的时序依据是主代理操作记录与这些快照；首次分类AI此前确已执行，不将本次“没有生成产物”改写为整个run从未调用AI。

## 保留的失败与结论边界

rev15的章界丢失失败及[首次自动精确正文边界FAIL](S02-C1-classification.md)均不撤销。此次只通过“重新填写的手工14段，经本地确认后仍完整保留”这一实际场景；此前人工正文边界核对也仍属于人工结果。未审后续revision、AI产物、文学质量、发布或自动章界准确性。
