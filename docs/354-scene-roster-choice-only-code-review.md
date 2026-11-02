# 修正轮choiceRef：独立增量代码审核

结论：**限定范围通过，无阻塞，可对当前冻结构建继续真实全书验收。**352/353已由另一审核者按序通过。本轮只核350后的CF-only增量、实际第二prompt及对应测试适配；不重新扩展协议。审核者未改产品/测试、构建或启动App、调用模型、读取小说/真实回复/配置/Key。当前模型单包结果由主代理另验，本文件不将其当作独立验收或全文通过。

## 最小源码增量

`desktop/service/novel-import-ai.ts:122–134`仅在active修复轮将mentions/context/links的evidence统一改成strict `{choiceRef}`，resolver直接使用当前私Map，无raw/ef/halfopen回退。还原Anchor后仍进入原record、整份wire/编译/canonical/whole及retention门。第一答原raw/ef/halfopen和公共canonical只接受raw的集合保持不变。

第562行第二prompt明确sourceRef只供阅读，禁止回传旧格式；replace/reject分别给出独立合法JSON，replacement为完整对象、mentions非空，context/link也示范choiceRef。示例明确不是本包事实，实际须用目录值；unknown context/link用空数组。原stable slot、显式reject资格及保留完整窗口指导仍在。新增说明和全部目录进入原实际第二prompt预算，无资料裁剪、额度或次数豁免。

独立从R34冻结编译bundle取回旧末prompt，在内存仅逆向上述三处（repairReference、resolver、末prompt）后，**完整service SHA256精确恢复350的`fb08db64d2bf3db389e72a008c3382fed98aa8913c7a952d208e23e972eb044f`**。core、targeted/choices/retention helpers、generate及payload的六项hash也仍与350一致。这验证其它源码逐字未变，包括首答、完整来源/双唯一、所有保留门、实际role、65536/16384及v1+6000/16000、两代和final门。

## 实际独立验证

使用`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`：

```sh
node --import tsx --test tests/unit/novel-import-scene-roster-choice-only.test.ts tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-scene-roster-correction.test.ts tests/unit/novel-import-scene-roster-fragments.test.ts tests/unit/novel-import-scene-roster-opaque-reference.test.ts
node --import tsx --test tests/unit/novel-import-scene-roster-targeted-repair.test.ts tests/unit/novel-import-scene-roster-targeted-budget.test.ts tests/unit/novel-import-scene-roster-repair-retention.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

两组分别**123/123、76/76，exit0**，即本轮不重叠8文件199节点；CO最终11已包含，不再把先跑10或单独预算19重复相加。日志`/private/tmp/scene-roster-choice-only-old-independent.txt`、`/private/tmp/scene-roster-choice-only-fixtures-independent.txt`。完整类型检查exit0，`/private/tmp/scene-roster-choice-only-independent-typecheck-final.txt`为空；diff exit0。

覆盖原合法raw/ef/halfopen只在第二答严格拒绝、首答原义、未知/混键cf、错误literal、合法但缩短原窗口的cf仍拒绝、完整保留positive和实际完整二prompt示例。新prompt预算N/N+1、实际text/review角色v1 UTF8+6000、0/未知16000及unsupported首1/次0均实际通过；transport/abort、generic两代/length合同继续通过。TR05短合成prompt仅用于触达16000边界，完整payload/prior/choices仍保留，不冒充产品长prompt。

另执行私有合成协议探针**6/6、exit0**：实际prompt两例均可JSON.parse且三类evidence仅choiceRef；第二答context/link的原合法raw也各两代拒绝；公共canonical拒ef/span/cf。脚本`/private/tmp/scene-roster-choice-only-protocol-independent.mts`，日志同名前缀`.txt`，0provider/0App，不与框架计数相加。

CO真实RED10为6pass/4fail，含父节点，收紧前合法旧编码本来允许；这是已批准的新修正合同，不是旧来源门接受无据资料的漏洞。旧实际R34不含literal的ef本来已被来源门正确拒绝。新增CO04在实现后首跑GREEN，不倒填为RED或供应商行为。

## 夹具与冻结

test-only exact helper按预定Anchor的**unit及完整quote**匹配唯一cf，原raw/ref/span先严格恢复和验证；未知/不支持窗口用固定`TEST_FIXTURE_UNSUPPORTED_EXACT_CHOICE`失败，不选首项或换窗。TR01完整长窗口及canonical深等保留。任意非目录窄窗明确为修正协议不支持；RR原12个“原whole合法→真实pure retention拒绝”反例保留，CO03另通过可表达的cf在实际桥验证缩窗拒绝，不用非法协议假绿。

negative wrapper仅对明确persistentBad且该固定unsupported错误，把原非法字段放入closed repairs作负控，仍必须拒绝；正控不得走此分支，无整份roster产品fallback。CI01两坏row正控的64K为合成夹具，resolver按该request实际role/pin解析；真实16K门继续由TR05覆盖，产品profile未变。静态隐私断言只排明确prior/choices资料块，未删除资料求绿。

最终冻结SHA256：

| 文件 | SHA256 |
| --- | --- |
| desktop/service/novel-import-ai.ts | 4dd9c49dc79b2ff066da4b352b96e61e12248afae6319c44362c87dae6a702e7 |
| tests/helpers/novel-import-targeted-repair-fixture.ts | 68891f48c446efd16874d94521517cd46e1a2c6be34c68622dfbe53a8b7e174e |
| tests/helpers/novel-import-negative-targeted-reply.ts | 9815ef03819168d2b394f83d26218ea85928c5bb5f5b514daf6e7de84989bb23 |
| tests/unit/novel-import-scene-roster-choice-only.test.ts | 613d59fc2047abb361c02ffd1924010b83bae2c8303a3a0857f8f23f8f63e4c5 |

主代理另行组合、构建、实际单包及fresh全书结果不与本轮合成199相加。所有场景、作者确认、完整复核、发布和重开仍须真实完成后才能总结全任务通过。
