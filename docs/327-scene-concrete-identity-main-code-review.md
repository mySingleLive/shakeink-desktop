# 具体地点身份：主进程接线独立代码审核

本轮审核限于323/324的主进程、详情/source helper与共享正常action接线。审核者未修改这些产品文件；自己实现的renderer UI/bridge不在本报告审核范围，其独立审核见328。CodeGraph工具未暴露，按已定位源码阅读。未启动App、构建或调用真实模型，也未读取小说、Key或配置。

结论：**本范围产品代码无阻塞，通过。**初次独立定向组合57/57通过，后续测试可空类型守卫修正后，独立完整类型检查exit0。末尾记录最终两个窄修复及closure 6/6复验；该次完整类型检查另有验收verifier测试诊断，其后已在334阶段独立完整类型检查exit0关闭，历史结果不倒填。下面的结论限于机械合同，不作为真实小说验收结论。

## 核验边界

- `desktop/main/novel-import.ts:274` 的`commitSceneResult`在串行保存内重验来源、当前session/epoch、原grant对象与冻结hash/text/review pins，再取当前models比较；只修改clone，通过原`commitCandidate`后才采用。成功恢复原wizard引用和grant对象，避免后台闭包持有旧wizard。初始roster、links wave、父级修订及新scene遗漏注册均接同一门（608、634、649、875）。后置rename失败仍走原candidateBlocked语义，不宣称磁盘已提交后可以普通回滚。
- 新scene roster公共字段与完整记录双门在`desktop/main/novel-import-scene-identity.ts:10`复验；最早证据按真实request unit顺序和literal坐标选择，与service canonical一致，不要求模型按回复数组顺序排列mentions，也不改sidecar。主`ai`对两个新sidecar按own-key拒绝越阶段返回，empty/undefined也不能借用其它阶段。
- `desktop/main/novel-import.ts:334`的作者操作保持正常strict action、当前revision/hash、detect-scene waiting及无活动任务/后置结果门。有效改动在候选内完成，成功才增版本与广播；noop不写。partition按实际参与成员继承原选中集合，不让最早未选代表吞掉另一已选身份。后置任务、图像grant与复核credit失效，来源/正文/卷章和早期角色资料保留。
- `desktop/main/novel-import-scene-identity.ts:18`只返回本页成员/上下文、真实peer可读关系摘要及总关系数；最多50成员、32关系摘要、32768序列化字符，必要时减少本页成员，不能容纳单项则明确失败。完整ledger不广播。source按真实working unit或SourceBlock读取，±1仅用于body，最多32768字符；不容纳完整Unicode/CRLF单元的小页明确失败，不能返回不前进空页。
- `desktop/main/novel-import-scene-identity.ts:47`用可信完整原值汇合相同ID的owned slices，实际ownership仍由原块范围计算。便利证据选项只取owned范围内唯一、Unicode/CRLF安全且不超过512字符的真实窗口，最多8项；搜索为有界候选，找不到则走raw quote。便利编码不裁改原units、来源成员或长锚点。
- `desktop/main/novel-import-scene-identity.ts:71`按各自完整block解析facts；作者显式合并多SourceMember时保留每块全文、非冲突字段及原source来源，冲突字段明确拒绝，不复制整文件最后字段到所有块。无模型模式用完整等值copy证明；需AI模式在`desktop/main/novel-import.ts:316`由当前hash的完整真实facts投影coverage并集证明，不把本地copy称为AI审核。
- ownership失效由`sceneOwnershipPendingUnits`接回原body planner；新artifact hash的缺credit单位会真实重新派发，即使原body coverage已满。最终预期key集合精确比较，并在发布入口再次检查。mixed targets包含scene时正常携带ownership，但UR索引/专用review lane仍保持exact-scene范围，非scene与旧versionless路径不增加新身份协议fallback。
- 新scene遗漏先通过真实roster注册ledger、再核links/候选并创建实体任务；注册改变旧身份或产生unresolved时保留结果并要求正常返回确认，不以旧“清单外drop”假装完成。

## 实际执行

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-identity-actions.test.ts tests/unit/novel-import-scene-identity-session.test.ts tests/unit/novel-import-scene-identity-closure.test.ts
```

实际exit0，**57/57**（actions37、session16、closure4）；日志`/private/tmp/scene-concrete-identity-main-independent.txt`。执行前后上述三产品文件与三测试文件SHA256全部一致，核对记录`/private/tmp/scene-concrete-identity-main-review-before.sha256`。closure的4项已包含在57内，不与此前单独4/4相加。

动作组实际覆盖正常partition/label/parent/defer、noop、旧revision/hash/越界/未知键、保存/来源/owner授权失败的提交前回滚、后置credit失效、50+1详情和完整source分页、source独立字段及filename origin、运行中拒绝修改。受控旧credit前置条件不称作真实恢复或真实作者编辑。

新增closure只使用全合成数据、正常fresh fixture和真实`runImportAi → generateImportAiJson → generateJSON`的预定generateText依赖：

1. 完成两场景全部复核后，test-only在当前完整owner上追加该artifact自身有据原句、清ownership与失效facts keys，同时保留全满body coverage；调用原controller.review，确认实际body请求重新派发、新hash key精确恢复、完整artifact/正文/卷章未裁。这是内部controller再审核正控，不是UI作者操作或journal重开。
2. fresh mixed scene+character、角色空roster；实际review payload无unitIndex/artifactIndex、无专用lane，scene全ownership通过。正常向导假发布完成后，原`importLeaseTarget`准入真实到达workspace接口边界；接口用固定合成异常终止。这不是实际数据库发布/重开。
3. 正常source splitter产生同ID的两块原资料及真实标题gap，正常作者partition合并；无模型及需AI复核各一正控。实际材料和review请求保留两块与gap，owned范围精确只有两个block，不含gap；非冲突facts/完整text/origin保留，AI模式没有额外entity生成。

closure前两个用例首跑直接通过，属于新增正控。source最初夹具含空段，原splitter真实生成不同ID的多个units，而测试误要求某单unit包含整个block；这是夹具预期错误，不记产品RED。改为无空段且明确断真实同ID后，两个source用例直接通过；没有倒填后置断言。

作者所报CI-M09的实际RED是service已接受合法倒序mentions，main晚拒；已在本轮正控复验关闭。CI-M10的实际RED已通过roster/entity/full review，到便利options长度断言才失败；不能描述成已实证零模型调用拒绝。修复后完整长材料和原长owned锚点保持，编码选项通过原512门。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

首次类型检查exit2，仅session测试114行TS18048（`r.sceneIdentity`可能为undefined）；历史日志`/private/tmp/scene-concrete-identity-closure-typecheck.txt`保留。作者仅将该处条件改为optional chain后，独立重跑同一完整类型检查**exit0**，日志`/private/tmp/scene-concrete-identity-main-independent-typecheck.txt`；并独立执行以下控制，实际1/1、exit0，日志`/private/tmp/scene-concrete-identity-main-typeguard-control.txt`：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern=CI-M10 tests/unit/novel-import-scene-identity-session.test.ts
```

该控制是57项中原用例的类型守卫修正复验，不额外计为58项。修正后session测试SHA256为`d3008e6f2687ce52f4dc3ccea952c051a3e0c21b593e11bdcc6a29692a2671fa`；下列三个产品源码hash在该次复验时仍与57组合执行时完全一致，最终两处增量的hash另列于末尾。`git diff --check`实际exit0。

## 本轮审核源码SHA256

| 文件 | SHA256 |
| --- | --- |
| desktop/main/novel-import.ts | 83bfa463fde1d83b3545bdbd4dcf27488eab188f6a94d5816e0d1ec3155cb53f |
| desktop/main/novel-import-scene-identity.ts | efc348c9cf8b616b41c3b9c8e96971e5de1319deea4681240ea55bb765f36a9f |
| desktop/shared/novel-import.ts | e575b17da3f73e2b20d0a79784ebfb76b30a277792f0d3c094237fc8c5300f65 |

本轮结果仅证明上述机械合同与main接线，不证明真实DeepSeek的地点判断正确、完整小说导入无问题、七分钟性能或实际保存重开。service/payload审核见325；core另由独立审核负责；UI见328，不能互相替代。

## 最后两个闭环窄修复

主代理提出两个具体疑点后，仅在原closure测试文件增加CI-C04/C05；产品仍由主代理修改。新增控制取得真实2/2 RED，日志`/private/tmp/scene-concrete-identity-final-edges-red.txt`：

- CI-C04先经实际service/JSON bridge取得合法pending conflict，并在已完成两场景复核的owner上构造有pending、缺ownership的受控进度，原`validJournal`接受。原runVerify把`conflicts`改为`select`，在phase断言失败；waiting/deferred/零追加请求等后置断言当时未达。最小修复只在无pending时执行source credit与ownership断言；有pending走原作者冲突等待流程，consistency仍失败，未补造ownership、未清冲突、未发送追加AI。发布入口的ownership严格断言不变。
- CI-C05调用生产所用的原`publicationRecord`函数（经无I/O的导出测试入口），真实记录缺`wizard.sceneIdentityVersion`，首断言失败；strict JSON roundtrip、clone隔离和legacy无键当时未达。323要求sidecar持久化，发布后草稿被删除，不能只依赖临时session留账本。最小修复仅当version1且确有ledger时，把版本与`structuredClone(ledger)`写入原wizard record；旧无账本不新增键，不改业务native字段。

独立复读`desktop/main/novel-import.ts`及`desktop/service/novel-import-publish.ts`对应两个条件分支，并执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-identity-closure.test.ts
```

实际**6/6、exit0**，日志`/private/tmp/scene-concrete-identity-final-edges-independent.txt`，上述后置断言全部实际达到：冲突仍待作者处理且没有新增模型请求；发布记录完整ledger严格JSON roundtrip保持hash/全部依据及归属credit，原owner不与记录共用成员数组；legacy记录没有两个新own-key。6项与初组57中的4项重叠，不相加成63项。前后main/helper/shared/publish/closure五项hash一致，记录`/private/tmp/scene-concrete-identity-final-edges-before.sha256`。

同次独立完整`tsc --noEmit --incremental false`实际exit2，仅`tests/unit/scene-import-persistence-verifier.test.ts:4`隐式any和第9行union无text字段两项，日志`/private/tmp/scene-concrete-identity-final-edges-typecheck.txt`；已交相应作者修复，本轮main/publish/closure无类型诊断。`git diff --check`实际exit0。该测试文件不在本轮改动权限，审核者未修改它；在其修复前不宣称最终组合编译或桌面build通过。

最终两处产品增量及closure SHA256：

| 文件 | SHA256 |
| --- | --- |
| desktop/main/novel-import.ts | 29ab8cbc1b33ac5f58e03b27b65797fa6cf96a346a026e81da0c1a19c220271a |
| desktop/service/novel-import-publish.ts | 0e40dfdd55f2e1ca33bdcc28b8445618e582e4bdb7084713ca64ea229587a6aa |
| tests/unit/novel-import-scene-identity-closure.test.ts | eb59bf9fb722f6553eb579498f4cb60825996f2d59f221098a7cdb0ed4ced8dd |

helper/shared两个源码hash与初组一致。这个增量证明记录结构可持久化及等待作者的状态正确，不是实际数据库保存重开或真实作者决定的验证。

后续组合编译门补记：334阶段独立重跑完整`tsc --noEmit --incremental false`实际exit0，日志`/private/tmp/scene-roster-correction-independent-typecheck.txt`为空，上述另一verifier测试的两项诊断已关闭；见334。这里保留最初exit2记录，不把后来的修复倒写成当时通过。
