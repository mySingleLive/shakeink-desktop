# 引用定位分类反馈：独立代码审核

2026-10-27。**PASS，无P1/P2。** 绑定109最终`48ed7a65…b1013`及110限定门；只审冻结两文件/真实基线，独立运行批准的两命令，没有改实现/测试或访问实际app、模型、原小说、私有journal、DB。

| 交付（执行前后匹配） | SHA-256 |
| --- | --- |
| desktop/service/novel-import-ai.ts | `10c0f32e4107c338a0d132ab2692711a2c97f7f2e721e24e813f3f404f97ee13` |
| tests/unit/novel-import-request-schema.test.ts | `5374a2364388ac87c335f132a487ca0c76f8a9d1874f6432ca6dfc4672b5b74e` |

完整逆变换严格恢复实际service基线`c1bc6dc6…09c4d`。仅新增私有闭合reason类型/Error、四静态文案，requestedEvidence识别内部类型及原fail构造抛新子类；原Error.message仍逐字相同。anchor/evidenceLayout全部判断顺序、精确包含短引文、8字符阈值、唯一搜索、Latin/数字边界与UTF-16原quote恢复不变。其余service字节包括105 mapper、106字符串error、所有schema/helper/晚门/defaults桥未变；payload/main/generic/core/semantics/shared/UI及A测试控制SHA保持。

四反馈长度依次为unknown-unit 77、too-short 86、ambiguous 80、no-match 85字符，均≤160；只用代码内固定reason，不解析异常message/输入，不附真实ID或raw值。其它异常仍固定泛化拒绝，未增加匹配fallback、跨单元搜索、单位重定向、生成或预算。精确短/重复引文不受排版恢复阈值影响。

旧J03仅两处message严格数组及预批固定映射变化；独立逆除后旧J01–09的95061字节恢复原`2dc40c44…a32fa`前缀。原feedback.includes(guidance)、路径、接受集、晚门和安全断言均保留，未出现其它旧夹具适配。

唯一独立执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J(?:0[1-9]|10):' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[36]:' tests/unit/novel-import-ai.test.ts
```

**J01–10 51/51；A03/A06 2/2；全部exit0、fail0、skip0、cancel0。** 独占日志`evidence/evidence-feedback-independent-j01-j10.txt` SHA `754247c5…ec86a`，`evidence/evidence-feedback-independent-a03-a06.txt` SHA `0761b37d…fa06d`。完整命令、控制/基线和日志SHA见`evidence/evidence-feedback-independent-review.json`。未重复构建/类型或扩suite。

J10实际生产桥→generateJSON/Zod+既有generateText DI分别触发四reason，首坏后好2次、持续失败2次停止，并经runImportAi晚门输出精确短原文；原输入/raw不改，signal/role/Abort与预留保持。12目标只证明该证据字段反馈及原schema范围，不冒称其它阶段业务通过；另证引文在其它已提供单元存在也不能修复错误声明。原J03和A06继续保护精确短引文、CRLF/Han/Latin/非BMP、唯一排版恢复与拒绝边界。

TDD历史如实保留：首RED预先适配了旧J03，41/51通过，不能当作仅新J10的干净RED；随后完整旧J01–09+新增J10在原service留44通过/7失败，旧九个父组均绿。作者最终51/51与本次独立结果分开记录，没有删旧断言或覆盖原日志。

本结论只批准反馈细化与兼容性，不确认rev63四路径属于哪reason或实际根因已修；当前角色/场景文学缺口保持。主代理后续同稿一次item授权恢复及最终新快照需另验，机械成功不等于文学PASS。
