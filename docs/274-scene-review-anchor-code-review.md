# 场景复核证据定位独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。依据272/273及其独立审核，检查`desktop/service/novel-import-ai.ts`新增review分支与`tests/unit/novel-import-scene-review-anchors.test.ts`；未参与实现或测试编写，未读取真实小说、配置、Key或私有日志，未调用模型。CodeGraph工具未暴露，直接读取已定位文件。

## 结论

**审核通过，无遗留阻塞。** 这次改动把原末端证据拒绝条件前置到既有JSON纠错入口，不改变最终证据接受集合、资料内容、审核模型或次数上限。主代理完成受影响回归、类型及构建后，可继续实际失败review范围只读复测和新的整书完整流程。

## 源码核对

- 新分支精确限定`semanticVersion===1`、`phase==='review'`、`selectedTargets.length===1`且唯一项为scene；没有要求kind，与生产review请求结构一致。其余类别、混合目标、缺少目标、旧协议和其它阶段继续使用原分支。
- 在原base schema之后，分别遍历conflicts和missingTargets的每个结果及每条evidence。逐条调用原`anchorEvidence([entry], request.units)`，不使用允许特定跨单元移动的analyze专用`rebindEvidence`。返回的定位结果被忽略，因此前置检查不恢复排版、不改quote/unitId、不过滤或缩减证据，也不修改源请求或输入模型对象。
- 失败仅添加固定结构路径与原四原因对应的静态指导；路径只有分支名和数组下标，定位说明不拼接quote、来源/实体ID或任意cause。新代码没有新增真实数据日志。原base的字段及严格结构规则保持不变，本审核不把这次新增说明扩大为对全部历史错误分支的承诺。
- `generateImportAiJson`及generateJSON原接线直接使用该schema，故首轮证据错误进入既有一次纠错；持续错误仍仅两次生成。没有新增controller外层review重试或模型/思考/预算变更。传输、授权及取消错误不在这个纯定位检查中发生，也未被新增分支转换为schema失败。
- 原runImportAi末端的anchorEvidence和validateImportEvidence、遗漏目标范围/投影、冲突artifact/unit引用、阶段权限及末端授权/快照/取消门全部保留。唯一排版恢复仍由原末端执行；合法证据不能绕过其它门。

## 独立执行证据

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-review-anchors.test.ts
git diff --check
```

**38/38通过，0失败、0跳过，退出0，约0.42秒；diff检查退出0。** 未运行全仓测试。

- RA-01经实际generateImportAiJson→generateJSON→runImportAi分别验证冲突和遗漏首轮坏、第二轮好；实际纠错段含固定路径/指导且无合成输出秘密。与完整合法结果基线逐值相等，既有冲突hash/id计算保留；持续坏结果只生成两次且不返回可接受结果。
- RA-02的两分支均覆盖四种原因、精确短引文、重复精确匹配、Han及Latin排版恢复、UTF-16、词界、跨单元/非连续拼接，以及引文只在另一单元唯一存在时拒绝移动。schema正例保留原quote，最终结果才恢复原排版。合法项后夹坏项仍整项拒绝，两分支失败路径同时保留。
- RA-03验证精确范围隔离和其它review仍在原末端拒绝坏引文；网络、供应商授权及Abort身份从真实桥原样传播且只调用一次，初始授权失败零生成。请求与原输出对象均不被修改。
- RA-04证明可通过证据schema的结果仍受阶段、来源/实体范围及遗漏投影门限制；纠错成功之后撤权、快照改变或取消仍拒绝。测试没有把schema通过当成完整接受或持久化证明。

本地测试不证明真实审核模型能在两次内修正引文，也不证明整书已完成。R15场景阶段通过而完整流程未通过的记录应保留；真实只读复测、全量复核、发布、正常退出及重开逐项/逐章核对仍由主代理继续执行。

## 兼容断言与验收记账追加核对

同日复核`tests/unit/novel-import-request-schema.test.ts`的NI-J02及NI-J03兼容断言：scene-only review新增refinement后不再与原base具有同一schema对象身份，因此仅对classify/review之外的patch、reconcile继续断言与无selectedTargets的review共用原base，属于修正已批准变化带来的旧预设。原合法结果完整接受、越权结果拒绝、classify覆盖、其它阶段形状接受等运行时断言仍保留；其它目标的review共享base覆盖未删除。

scene-only review的坏conflict引文现在明确断言early parse失败、最终service拒绝；显式scene/world多目标review仍断言early parse成功，且在原末端以固定no-match拒绝。原有分阶段循环中review的artifacts证据仍不会被本次conflicts/missingTargets检查扩大处理。没有通过删除其它阶段或弱化其末端门来取得绿色。

独立执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-request-schema.test.ts
```

**51/51通过，0失败、0跳过，退出0，约1.01秒。** 无产品或测试修改；此前独跑RA的38项结果仍按上节记录，不累计重复执行。

核对`docs/275-scene-review-anchor-verification.md`与270的公开记录：275首段及末段均明确完整导入尚未通过发布/重开，982场景导入阶段成功与R15后置review失败分别记账。270记录场景阶段245730.637833ms、982 done、后置review no-match、driver exit2/Electron exit0且未发布或重开；275引用该历史，并把只读复测及R16标为待实际完成，没有把旧成绩升级为完整成功。275所列主代理242项回归、类型及构建为主代理记录，本追加不改称由审核者独立执行。

本次仅核对公开文档的状态区分与一致性，未读取真实私有材料，未调用API，未认证仍在进行中的只读复测结果。
