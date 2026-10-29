# 原文证据定位schema前置：独立代码审核

日期：2026-10-26。结论：**PASS，无 P1/P2**。仅覆盖70/71批准的两文件及两条定向命令；不代表实际S02大纲、全目标语义或完整导入通过。

## 冻结与差异

| 文件 | 最终 SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `c88cf7f8941edcb4ab97449d244687f254db22aad5d1348404ef25a6d16d29c6` |
| `tests/unit/novel-import-request-schema.test.ts` | `e0ca570790a02f6f791f8e2fa2cc2fce72459e5e7d3e70f13121706747c87f88` |

对真实基线 `/private/tmp/evidence-schema-70-baseline/` 独立重建完整差异，与 `evidence/evidence-schema-baseline-delta.diff` 逐字相等，SHA-256：`705038529cf24c7835f4b904a08dc0dfd14520ab21bd4144437a8d0aeb00e838`。移除唯一新增requestedEvidence refine及requestedArtifact的该字段覆盖，service整文件恢复基线；evidenceLayout和anchorEvidence逐字未变。测试除预批J02证据项分离及新增J03外逐字保持，native/link原schema通过、晚门拒绝断言未减少。

## 代码与测试判断

新refine仅位于原semanticVersion1、普通analyze、非reconcile分支，每entry调用原anchorEvidence singleton并丢弃返回值，不transform quote、request或raw。任何定位异常只添加固定安全message；Zod嵌套自动给出artifacts.N.evidence.N路径，不传播caught错误、原值或来源ID。其它phase及legacy仍返回原schema对象；原晚anchor、知识/native/引用与main校验、生产bridge、prompt、预算及重试上限均未改动。

J03调用实际生产generateImportAiJson和真实generateJSON，仅注入既有generateText DI。验证首坏后好恰好2次、持续坏2次后invalid_schema、首好1次；同signal/模型/user/role/action、反馈安全与wrapper预算均有断言。J01仍验证defaults实际调用该bridge及factory接线。

锚定用例有独立字面期望，并以未修改的legacy晚门对照：精确短/重复引句、Han排版与补充平面字符UTF-16恢复、Latin空白可接受情形；unknown-unit、no-match、too-short、ambiguous、Latin/digit词界及跨unit/非连续拼接反例。schema保持原quote，late门才恢复精确源片段。还覆盖非首artifact/entry的路径、坏kind和来源同时出现时证据字段独立报告、review原晚门及其它phase原schema身份，无另一前置错误造成的假绿。

## 独立执行与历史

只执行70批准的两条命令；日志独占创建，未覆盖作者证据：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
```

| 独立日志（`evidence/`下） | 结果 | SHA-256 |
| --- | --- | --- |
| `evidence-schema-independent-j01-j03.txt` | 7/7（含4子例），exit0，0skip | `d96300d6bdb015544a2985396f51f1c15d94d862f1a08426935e35e8299cc7ea` |
| `evidence-schema-independent-a03-a05-a06.txt` | 3/3，exit0，0skip | `2b5ce0b53fea8ba050d85dd28b24f7cbd36512276c3fc2888aac3713736829d2` |

作者真实实施前 `evidence/evidence-schema-j01-j03-red.txt` 保留：J01通过，已批准适配后的J02和J03四子例失败（含父测试共6 fail）；实际bridge当时直接接受坏引句，未进入格式纠正。本审核读取该历史，未回滚冻结生产重跑RED。

独立基线/最终hash、差异核验、精确argv与日志hash见 `evidence/evidence-schema-independent-review.json`，SHA-256：`838dcf6d6014a1e935ebeeef715f7009752dc443beb7d94b86ffba3007cafb45`。

本轮未改生产或测试、未扩大suite，未访问实际run、源小说、应用、模型、journal或用户数据库；未自行构建或另跑类型。主代理构建及真实同S02重测须另记，原rev26失败与原因未知边界保留。
