# 场景具体身份服务与payload代码独立审核

2026-11-01，审核者 `scene_fix_review`。本轮审核service/payload及新service用例，未参与这些实现；不审核自己的renderer实现。未改产品/测试、构建、运行App/API或读取真实小说/Key。阶段A已由322独审，本文件不重复认领。

## 当前结论

**服务/payload限定代码审核通过，已复现P2关闭，未见其它本范围阻塞。** 最终新service独立44/44、既有native/SDK相关组41/41通过；主流程旧夹具在并行main/core接线期间的失败另列，不能冒称完整回归或具体身份全流程已过。本文不批准未审完的core/main，也不以其未完成免除后续组合回归。

最终审核源SHA256：service `0273f4bd99b1104dc897960d62005659c56e8d15ab838661374decf6ea6c0029`，payload `febe0b89771e087a55e81a59daba5c0af1d2c365b6d8c879ed11f8d87749ed96`。没有修改这些文件。

### 已关闭P2：links的SourceMember没有对应完整材料的生成前门

初审时 `desktop/service/novel-import-ai.ts:85—90`（修复前行号）只对 `origin==='body'` 的成员检查来源范围/hash/literal，SourceMember只过形状，未证明本包包含其完整block材料。两个SourceMember带合法member/record键、任意非本包内容的blockHash，当前units只有无关合法body；对唯一identity任务返回 `unknown/evidence:[]`，经真实 `runImportAi → generateImportAiJson → generateJSON` 得到接受、1代、1条decision，网络调用0。没有注入真实材料或供应商结果。

这违反323要求的“源block有本包完整对应来源单元”，也意味着模型可在缺完整待核组件材料时进入付费请求。不能从unit ID、标题或任意拼接猜补映射；main仍须检查完整账本，但不能代替已承诺的生成前request门。

随后323/324最小增量已分别独审准入：app-only `records[].sourceBlocks?:{memberKey,ranges:SourceRange[]}[]`，SourceMember逐项恰一次；每段按真实当前unit/hash/安全局部范围恢复，显式原序拼接全文hash须等blockHash。无SourceMember允许省略或空数组；缺/错/未知/重复绑定和空/错误范围在生成前静态拒绝、调用0。main/core从可信sources构包，payload保留完整绑定计原预算；模型output wire、UR/native范围不变。

最终 `desktop/service/novel-import-ai.ts:68—91` 的 `validateSceneSourceBlocks` 已实现该门，并在links请求进入生成前调用。全部source member精确映射，每个range核当前unit/hash/局部安全边界及单位几何；所有同file绝对区间先排序拒交叠，再按显式顺序恢复值比完整blockHash，重复文本不能靠重复/部分重叠range凑同hash，且不会先join重叠的大数据。错误只给固定文字。完整映射参与原serializer/预算，不靠ID格式/标题猜来源。

作者新增RED为13叶子加父节点共14失败，每个真实因旧路径进入1代而未满足0gen断言；后置净化/输入保持断言当时尚未达，不补记为RED通过。最终本轮独立44/44通过，包含旧28及来源正负控；并独立重跑最初内联缺mapping探针，现为accepted=false、generations=0、固定“场景来源区块完整映射或范围无效”、network=0，P2关闭。

## 已核实的服务边界

- roster wire唯一根严格解析后，编译公共roster及完整sceneRosterRecords；final另用canonical schema逐项重验对应。合法同名两行和全部mentions/context/links不被locatedRoster首命中回退或丢条目；旧scope仍走旧schema。
- 新协议错误通过静态指导包装，不回显未知键、ID、原文或cause。canonical直接schema反例覆盖own undefined，不借JSON.stringify抹键伪造通过。双唯一锚点、完整Unicode/CRLF/长quote用原pure validator，坏中间行整包纠正或拒绝。
- links结果要求本包每task恰一次、合法任务分支、非unknown有真实唯一证据；unknown不编译为边。当前上述SourceMember材料缺口独立于结果形状门。
- ownership先核当前请求局部range/hash及target证据，生成期与末端均有归属门，context不能变为目标事实凭据；scene entity不走旧排版恢复/跨单位rebind。相同unit ID但切片后hash/offset不同的请求有正负控。完整账本/来源真值仍由main/core负责，服务不能凭自己持有完整账本作假设。
- mixed targets包含scene可附ownership，而UR/SV/index编码仍由原exact-scene helper控制；普通作者解释/其它目标不接新mode。payload保留完整sceneIdentity、units/artifacts，并按身份目录和必要父级/引用closure取scene上下文；新metadata和固定提示受原payload/UTF8 wrapper/实际role预算门，无提高cap、thinking或重试。
- 新canonical后仍经过原stage、native/引用及末端授权/snapshot/取消门。服务测试的预定JSON仅证明机械合同，不证明空间关系语义、作者决定或真实全书结果。

## 本轮实际命令与结果

均使用Node24.18.0，无网络生成。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-timeout=30000 tests/unit/novel-import-scene-identity-service.test.ts
```

exit0，28/28。日志 `/private/tmp/scene-concrete-identity-service-only-independent.txt`。

P2修复后用同命令独立重跑最终service：exit0，44/44，fail/cancelled/skipped均0；最终日志 `/private/tmp/scene-concrete-identity-service-final-independent.txt`。初审28包含在最终44中，不叠加计数。来源补充实际覆盖同标题不同block的当前unit局部范围、显式多unit原序正控、完整metadata预算0gen及13类无效绑定0gen反例。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-timeout=30000 tests/unit/novel-import-scene-review-anchors.test.ts tests/unit/novel-import-scene-review-unit-reference.test.ts tests/unit/novel-import-scene-review-source-reference.test.ts tests/unit/novel-import-wizard-prompt.test.ts
```

exit1，64节点中62通过、2失败（同一个SV01 parent/leaf计数）；失败在原main `confirmRoster`，提示识别失败，尚未进入作者决定版本断言。日志 `/private/tmp/scene-concrete-identity-service-old-scopes-independent.txt`。不改夹具或降低断言把它记绿，组合main/旧fresh合同接线完成后须重跑。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-timeout=30000 tests/unit/novel-import-structured-scene.test.ts tests/unit/novel-import-scene-wire-guidance.test.ts tests/unit/novel-import-scene-profile-guidance.test.ts
```

exit0，41/41。日志 `/private/tmp/scene-concrete-identity-service-native-independent.txt`。

最初还执行包含上述service/RA/UR/SV/prompt与 `novel-import-scene-hierarchy.test.ts` 的六文件组合（未设timeout），exit1，103节点中94通过、8失败、1 cancelled；SH控制器旧roster夹具在main新scope接线期间失败，最终一个pending任务未解决。日志 `/private/tmp/scene-concrete-identity-service-independent.txt`。该组合与后续独跑重叠，不能相加成额外覆盖；不据此推定未完成的其它owner功能已过或仅凭“旧夹具”免除最终回归。

另用 `node --import tsx --input-type=module` 内联全合成请求实际复现上述SourceMember问题：accepted=true、generations=1、decisions=1、network=0。只读源/文档及本文diff检查不属于模型或真实系统验证。
