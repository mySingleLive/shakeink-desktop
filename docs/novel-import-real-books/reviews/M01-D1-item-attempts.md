# M01-D1：两次物品阶段失败与资料保留审核

**机械保留PASS；本次两次真实物品阶段均FAIL；后续类别、最终QA与发布未执行。** 仅核对指定冻结公开快照和断言，未读取latest/私有journal、操作app、连接DB或调用模型，没有重跑代码/测试或重读整本小说。原生UI/未再点击重试由主代理观察，本审核独立比对数据。

同session `439f1633-9d21-40f5-9d8b-7f165cc66265`的rev62→63→81，断言列出的22个实际字段全部逐项深等（非以不存在键代替），包括files/units、正文/工作单元、manual章、预算、模型、成功产物/覆盖、analysisCheckpointHash和作者决定。22项规范JSON SHA均`4ff5ef1b…2034`；semanticState与notFound也不变。当前375源单元拼接仍为源SHA `03d44b6d…09267`，25工作单元/原正文/工作正文及manual9章拼接仍为23257字符、SHA `b06de8a2…87c397`。375是此时手动边界后的实际单元数，不沿用早期rev7的373。

28个既有产物始终为outline1/character18/scene9，各coverage25，未提交任何item产物或item coverage；原角色/场景文学缺口没有因保留成功而消失，见`M01-D1-partial-characters-scenes.md`。

| 实际调用（应用层Promise） | pending→失败 | UTC开始→rejected观察时间 |
| --- | --- | --- |
| `073296d6-0d3a-4e9a-9bbd-7d0af525a24a`，epoch15 | rev62→63 | 19:49:51.272→19:52:30.787，159.515秒 |
| `4c7c35bc-bfaa-4bcc-9bb9-cdd8809ffe19`，epoch18 | 冻结rev80→81 | 20:09:55.640→20:12:07.445，131.805秒 |

日期均2026-10-26。各对runtime的session/processRun/operation/epoch/workingRevision/scope/payload/start完全对应，随后state settled/outcome rejected；不是只凭spinner判断调用。两调用的scopeHash/payloadHash相同，正文和资料范围保持，但payloadHash只绑定JSON数据，不能证明反馈/代码/prompt相同。该证据不提供供应商内部重试、请求数、tokens或费用，也不构成在途暂停/恢复LIFE通过。

rev63安全错误列四个evidence路径；新反馈实现后的rev81仍为结构失败，列`artifacts.8.evidence.0`。没有被拒raw响应，不能知道哪个引文/单元或四reason中的哪种原因，不因四路径变一路径推断改善、原答案数量或根因已修。主代理断言`actualInvalidReason: unknown`与这一限制一致；原51+2隔离测试通过只证明代码合同，不改变两次实际FAIL。

rev81 scene-item步骤failed，world、settings、worldline、narrative、review、publish均pending；不能把item0说成notFound，也没有落库/重开验收信用。模型快照在22项内等值；本审核未改或查询全局配置，不代表已获准切换备选模型。后续决策及重测另记，不能覆盖这两次负证据。

| 冻结输入 | SHA-256 |
| --- | --- |
| characters-scenes-checkpoint-rev62.json | `345201a0feb9bc2bd9a4af0c119232429efb78db0b9d693a3fdc7587cc98daa9` |
| item-evidence-failure-rev63.json | `afd45c3de96b8afbec865429a157fa84df41d1e769463c3d2027fd8ff6a36374` |
| item-evidence-feedback-failure-rev81.json | `aebd3b024863b42830dda1b3b0daab6606d9e9c33fa9382d4c8c020ccec21d9f` |

rev80及全部对应断言SHA、22字段名/共同hash、runtime配对和归属限制见`../evidence/M01-D1-item-attempts-review.json`。资料保留通过与真实物品FAIL、文学待补、后续未执行分别记录。
