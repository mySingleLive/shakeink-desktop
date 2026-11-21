# 精确片段ref与首提及记录：独立增量代码审核

结论：**限定范围通过，无阻塞。**340方案及341用例已由另一审核者按序通过。本轮只审核fragment helper、payload/service接线及OR/FA表示增量；未修改产品或测试，未构建/启动App、调用模型或读取真实小说、模型回复、Key。CodeGraph工具未暴露，读取已定位源码。

## 源码核验

- `desktop/core/novel-import-scene-roster-fragments.ts:28`按固定序列`["scene-roster-fragment-ref-v1",id,fileId,start,end,textHash,localStart,localEnd]`的JSON计算SHA256前16个小写hex并加`ef`。textHash使用完整unit.text的UTF-16LE字节SHA256，局部范围按原UTF-16片段累计，不从业务名称或片段序号猜ref。每单位full hash只计算一次；任何当前整表重复ref静态拒绝，不覆盖、不取首、不改nonce。
- 第42行表捕获当前units副本，完整显示目录递归冻结；私有Map不外露，resolver只精确查当前ref并返回新Anchor副本。无全局按ID缓存，不解析前后缀、不trim/casefold、不拼邻片。调用者修改原输入或返回Anchor不改变表；同来源单位重排可保留相同ref，但当前表/unitIndex重新生成，不能以ref相同误判缓存。
- `desktop/service/novel-import-ai.ts:70`在schema工厂捕获一次单位快照及私有表，原两代复用同一表。整份wire的三种anchor、三种record严格union先解析，成功后才编译副本。形状失败后的分支重解析仅用于安全反馈，并仍返回`z.NEVER`。多键、混键、own undefined不能借其它分支丢掉控制字段。
- 新首提及分支只取mentions[0].literal为name，其余exact distinct literal按原序成为aliases；重复mentions、context和links全部保留。第一条坏不能跳过，原primary=1/len1仍拒绝，原显式name/aliases及raw错值不自动派生/改绑。旧半开范围原义保留；ref仅恢复一片，需要跨片或窄引文须模型显式使用原备选。
- 编译后仍过原canonical record schema和`validateSceneRosterRecords`：quote在完整声明unit唯一、literal在quote恰一次、名称/别名覆盖、每条context、links及完整容量。别名超过20整体拒绝，不截断；不同ref指向重复文字也不能绕过quote唯一。成功canonical不含ref/primary控制字段，原service-final/main/ledger/shared未改。
- 反馈仅固定字段和当前数组安全索引，首条派生name问题映射真实mentions.0.literal，alias问题映射mentions。未知ref和私密业务值不回显，最多6项/每message不超过原250 UTF-16 code units；诊断不决定接受、不删坏项、不修原值。
- `desktop/core/novel-import-ai-payload.ts:33`使用同一目录生成器，所有ref、index、片段文字及其它metadata完整进入原serializer和planner/worker预算；原text不重复发送。原role/thinking/cap/两代/并发/16KiB wrapper reserve保持。非scope单位字节合同及原generic/canonical不扩散；FA仅精确容纳新增ref字段，原index/text、metadata全等和全文concat断言保留。

## 独立执行与RED到达范围

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-roster-opaque-reference.test.ts tests/unit/novel-import-scene-roster-fragments.test.ts tests/unit/novel-import-scene-roster-correction.test.ts tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-scene-identity-session.test.ts
```

实际**128/128、exit0**，日志`/private/tmp/scene-roster-opaque-independent.txt`。其中OR22、FA29、RC17共68已包含在128内，不重复计数。经真实JSON生成桥，旧raw基线与新首提及/ref完整canonical相同；全部引文/mentions/context/links、长Unicode/CRLF和输入clone保持。未知ref首坏→预置完整好第二代可恢复，持续两代坏仍拒绝。

OR02用独立fixture公式验证完整hash/范围、各绑定字段变化、当前顺序、重复表拒绝及精确单片还原；目录深冻结和Anchor副本实际断言。OR03验证三分支混用正控、第一坏项/旧primary/旧raw不fallback、own undefined、重复quote及alias21；显式原半开范围仍能合法解决单片非唯一。OR04验证实际text/review角色完整ref metadata预算N可生成、N+1超界0 generation，原输入不变、不裁材料。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-request-schema.test.ts tests/unit/novel-import-wizard-prompt.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

旧请求/提示组实际**54/54、exit0**，日志`/private/tmp/scene-roster-opaque-old-scope-independent.txt`；完整类型检查exit0，日志`/private/tmp/scene-roster-opaque-independent-typecheck.txt`为空；diff检查exit0。不与作者254或主代理其它组相加为独立覆盖数。

已只读核对`/private/tmp/scene-roster-opaque-reference-red.txt`：旧代码真实18节点、10通过8失败。OR01先通过旧合法raw基线，再由真实generateJSON两代拒绝新首提及/ref，构成功能RED；OR02新table函数缺失单独记录，不冒充整个功能失败。OR01的两个后置子项和OR04的两个预算子项在RED未注册执行，GREEN成为22节点后才实际达到。旧代码对未支持新wire的若干拒绝正控，不称为当时已到达新的ref resolver/首提及目标门。

## 冻结身份与验收限制

下列五项独立执行前后SHA256一致，核对记录`/private/tmp/scene-roster-opaque-independent-before.sha256`：

| 文件 | SHA256 |
| --- | --- |
| desktop/core/novel-import-scene-roster-fragments.ts | 7e830a1cb8f9c673ed6d10efd3c3efac59a80b904b8af63a88e522265ec3e16a |
| desktop/core/novel-import-ai-payload.ts | 28b4f5d9fcf786af698aaf4679ea084669ff6f75d00f60abdd69dbf6616afe94 |
| desktop/service/novel-import-ai.ts | 6815b86c11ba86a126e7df4da35d5a2201075f3dc949cfba183b8915435b6ff3 |
| tests/unit/novel-import-scene-roster-opaque-reference.test.ts | c995c5fdfad3798f095f490b258da10fd3efcac55e6ab67987309e43a3cd0342 |
| tests/unit/novel-import-scene-roster-fragments.test.ts | 628d2fb74e75514785a92a09f359023c4fdaa13e3a3c378f08df9a42af56b979 |

本结果只证明机械编码、校验与预算接线，ref不证明地点语义或模型意图。R30/R31实际诊断失败保留；R32候选须以最新planner重新规划完整metadata，不沿用旧71单位/旧payload身份，也不以手动小包替代正常包。当前接口单包、fresh全文、全部场景、作者处理、发布与重开均由主代理另行真实验收，不能提前记为通过。
