# 场景原生结构化输出独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。依据268/269及其独立审核，仅检查本次结构化输出实现及定向测试；未参与产品或测试实现，未读取真实小说、模型配置、Key或私有导入日志，未调用真实模型。CodeGraph工具在本会话未暴露，直接读取已指定文件。

## 结论

**代码审核通过；本轮发现的两处问题均已修复并复核，无遗留阻塞。** 可在主代理完成受影响回归、类型及构建后，按268/269先执行完整wire纯合成真实探针，再执行失败目标只读复测与新会话全文场景验收。本结论不表示实际API或整书导入已经通过。

## 发现与闭环

1. 新模块初稿合并完整目录时只比较同ID的kind/name，非目标的parentId等身份元数据可能被context artifact或重复entities静默覆盖。独立纯合成反例证实：原目录关联场景指向`s-first`，同ID上下文指向`s-second`，contract仍成立且payload采用后者。已由实现者修复：同ID的kind/name及entityType、parentId、worldId、settingType均须逐值一致，否则固定错误拒绝。source-copy仍先继承原目录定义；合法context-only实体首次插入和稳定索引保留。SO-02已覆盖上下文父级、重复目录父级及类型冲突，且原请求不变。
2. 主代理指出显式`role:'review'`时新桥接仍用text模型做能力判断和追加schema预算。我独立确认这会造成模型不一致或漏检实际较小审核模型的额外开销。已修复为生成、能力判断和预算共用同一role及`request.models[role]`；缺少pin明确失败。新增SO-09验证小窗口审核模型预算超限零生成，以及text模型不eligible、review模型eligible时正常生成并传递review角色。

## 最终实现核对

- `desktop/service/novel-import-structured-scene.ts`：仅限定semantic/analyze/entity/scene、合法引文选项、官方DeepSeek根端点、明确模型ID及openai协议；非eligible模型保留原resolved对象。完整目录从entities及context artifacts构造独立快照，先拒绝身份冲突、悬空父级及完整场景循环，再稳定按类型编号。schema范围、可见referenceIndex和恢复使用同一快照；输入后续改变不影响已建合同。
- 可见目录保留原serializer相关项、已知且别名命中原文的目录项、全部上下文实体及父级闭包。自由instruction只用于关联已存在的可信ID，不能创建实体或修改身份；原units、artifacts及全部引文选项保留。SO-02实际检查payload/prompt里的别名项、context-only项、各类型索引0及1500项目录下的schema大小。
- wire根五键、八个facts字符串、三个整数引用及每个证据选项对象严格拒绝额外字段、缺项、错误类型与非record容器；控制元数据不能由wire覆盖。仅reliability空串和引用-1按专用合同规范省略，其它业务字符串含空串逐值保留。primary及所有additional证据完整恢复，坏项导致整项失败，不筛选或取首项。
- `desktop/service/novel-import-ai.ts`：wire适配后通过`wireSchema.pipe(schema)`进入原canonical严格响应校验、目标身份与父级校验；随后`runImportAi`继续执行完整typed引用、知识归属、Unicode、真实证据及公共末端授权/快照/取消检查。controller集成测试证明最终schema2资料、四原生字段和确认父级保留。预算同时计入实际追加索引的payload及JSON Schema，并检查固定提示预留；不裁units或选项。
- `structuredSceneModel`保留原modelRecord，使用其授权快照、相同模型ID及原端点，经既有bindModelFetch/localModelFetch和主进程ModelService/ModelGateway出站。SO-04使用真实Responses SDK及合成主网关验证`/responses`、json_schema strict、reasoning.effort=none、store=false；合成Key只在主网关注入，worker仅有占位值，原providerOptions不被修改。
- `src/lib/ai/generate.ts`：只有显式jsonOutputSchema才添加`Output.object`，其它生成保持默认文本模式、既有配额/用量及取消流程。SDK实际doStream参数有对应测试。结构/知识等错误使用固定反馈，未知键和值不进入纠错说明；HTTP及其它供应商错误净化，不改成schema重试。最大两请求、三次恢复或四次持续失败均已由controller实际计数覆盖，无自由文本或其它模型降级。scene轻量策略及独立长任务通道是本次之前既有实现。

## 独立执行证据

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-structured-scene.test.ts
git diff --check
```

最终冻结代码：**10/10通过，0失败、0跳过，退出0，约7.63秒**；diff检查退出0。SO-08分别验证wire成功后末端撤权、快照改变及取消仍拒绝结果。仅运行上述定向用例，未运行全仓测试；主代理的更宽回归、类型和构建应以其实际最终命令结果另行记录。

完整wire真实DeepSeek兼容性、失败目标和全书全部场景、正常保存退出及重开逐项/逐章一致性仍须后续实际验收；本地合成通过和早前单字段探针均不替代这些结果。
