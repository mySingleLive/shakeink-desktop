# 第一阶段语义纯 helper 独立代码审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

## 当前结论

**增量复审通过，SH-CR01/02均已关闭。** 最终helper按真实消费者可见实质内容拒绝空映射，并在strict/confirmed路径要求有效tropeKind；source-copy保留原资料并给未映射警示。最终同一限定五名称独立运行 **5通过、0失败、0跳过**。结论仅为第一阶段纯helper，不代表真实adapter五阶段权限或controller/发布/整书流程已完成。以下保留初审阻断与最终修订记录。

本轮依据已批准21/24，只读审以下新增两文件及必要的已有native消费契约，未改产品/测试、访问模型/用户DB/源小说/真实journal/Key、操作app/UI/CUA。

| 文件 | 初审SHA-256 |
| --- | --- |
| `desktop/core/novel-import-semantics.ts` | `5e5b336e20205a608aca75db35227aa556925c07b9b63f4c4f71fe1a3d209bb1` |
| `tests/unit/novel-import-semantic.test.ts` | `39bd80f902a1f64322f8d89bd4788cd118be1025bbcf1b837a3878bfdd90ebf0` |

## SH-CR01 · P1 · 输入本已空的native内容不能靠normalize相等认证成功

`decodeImportWorldContent` 62–70行严格检查形状后，只比较parsed content和normalizeContent的hash。因此 `SOCIETY:{text:""}`、`CONCEPT:{concepts:[]}`、`FACTION:{factions:[]}` 本身空且规范，仍通过；调用者的 `artifact.text` 可以含完整原资料，但返回native Setting没有可显示实质内容。source-copy模式显式给出这些content时也不报mappingWarning，等同将原资料存在审计材料当成业务映射已经成功。

21要求先验证结构与来源保留，再验证真实消费者实质内容未变空/丢失，且未知结构只保留材料并警示，不存空数组假成功Setting。单纯parsed/normalized相等只能证明normalize未进一步丢失，不能证明一开始传来的空content已承载原内容。

**最小修订：** 增加各类型可见实质内容门。strict空文本/空结构拒绝，不把它记为成功；source-copy不能无损表达则native:null＋mappingWarning、原artifact/text不变。保留合法例外：LEVEL有非空description/rules但没有已证实节点时可空levels/pathways，不虚构层级；空描述的中性WORLD容器仍可。以结构可见内容检查收敛，不引入文学语义判真或固定书名规则。

在NI-SEM03内加入空/全空白文本、空CONCEPT/FACTION及合法LEVEL介绍/WORLD容器正反例，同样保持五个编号。已交主代理，由其单owner修订，本审核没有改源码。

## SH-CR02 · 必需TropeKind不能被差量unset后仍通过typed验证

当前 `validateImportSemanticArtifact` 仅在 `tropeKind !== undefined` 时检查SATISFACTION/TEAR；strict缺该值也可返回。`applyImportArtifactEdits` 的白名单允许该字段unset，最后再次调用本helper及引用校验都不会拒绝，于是可返回不满足现有TropeKind必填枚举的产物。

后续publisher的既有兜底拒绝不等于本阶段typed修订校验成立。21要求所有typed结果在一次原子提交之前验证，不能先接受坏差量再到发布时失败。

**最小修订：** strict要求有效tropeKind；source-copy未知时依明确未映射警示保留材料，不声称已形成正确爽点/泪点。NI-SEM04增加strict缺枚举拒绝，NI-SEM05增加有效TEAR被unset时整包拒绝、原对象与无关事实/证据不变。仍为本两文件、原五个测试身份，无需新增adapter/发布接线。

## 已成立的纯 helper 边界

- import依赖为已有无React native内容函数及纯类型/哈希/证据逻辑，无模型/DB调用。source-copy只由显式mode选择，且仅允许origin=source；confirmed/inferred不能借它跳过strict。缺roleType原角色保留SUPPORTING兼容位、extra未确认标记和mappingWarnings，原name/text不加解释改字，不计推断成功。该返回值尚未接UI/发布，不能当作整个0AI导入已验。
- 角色支持真实业务列/aliases/relationships，bio取原text，未知可选值为空；未支持traits/duties/actions严格报错，确认不绕过。年龄/来源支持性只由给定事实和后续语义复核保证，合成空age断言不意味着helper可以机械判断“任职起始年龄”文学语义。
- Scene明确PLACE；WORLD与SETTING区分、九种world Setting类型/真实content结构与原生normalize对齐。父引用按真实kind/子类型/同world MAP验证，拒绝外部ID、循环、自指和重复artifact ID；身份包含父节点/所属world/type，不把不同空间同名强合并。
- 严格content在normalize前检查枚举/字段类型，拒绝错误替代键、未知字段及隐形form分支，hash比较挡住trim/dedup等丢失；SH-CR01补足本来已空的内容缺口。未知世界归属/原CONCEPT/FACTION无可映射结构不制造假World/空Setting，完整材料保留。
- 知识契约包含转述/时间范围/因果/未知，所有kind可返回显式knowledge；两线要求reliability，非客观要求attribution；refs自身可靠性/角色/事件ID按类型验证，不默认客观。`qualifyImportKnowledgeText` 保留原text并前置说明，不能证明引用语义支持，真实原文独审仍必须。
- 差量schema不接受id/kind/name等整对象替换；每提案校验目标/baseHash/真实新增证据，textEdits检查精确before/UTF-16与重叠，逆序应用；set/unset缺省不删除其他facts，作者锁定字段及原source禁止改写，旧证据/sourceUnitIds保留并合并。全部目标成功后才返回新数组，任何失败不改原数组/workingProse；SH-CR02补足必填枚举移除的类型漏洞。

## 独立限定运行与分阶段状态

唯一执行命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1-5]:' tests/unit/novel-import-semantic.test.ts
```

初审实际退出0，**5通过、0失败、0取消、0跳过**，约150.7毫秒。尚无SH-CR01/02对应断言，不能据此给最终PASS。作者初0/5缺module红属于实施起点；surrogate原先已正确拒绝而测试错误正则需修只属于断言信息，不夸成生产bug，本审核没有回退重做这些RED。

NI-SEM04本阶段只含纯知识/引用契约。24要求的真实adapter五阶段权限、空数组兼容/零credit测试及controller关联修订/两轮/完整复核、真实native发布均明确后续未完成；不能因这五项绿把整个SEM04或21全流程记为通过，也不将未接线阶段本身计作本轮P1。

待同owner窄修后，复审受影响两文件并仅重跑同一精确五名称，追加最终纯helper结论。

## SH-CR01/02 增量复审与最终结论

最终仅原两个新文件改变：

| 文件 | 最终SHA-256 |
| --- | --- |
| `desktop/core/novel-import-semantics.ts` | `6fc35a41fa6f17cbff3c8c65bf96020728e0778f4d21d6c2b6450159b1a91040` |
| `tests/unit/novel-import-semantic.test.ts` | `3fdbab464551806856ec2102afb9f2159be77c82f391a9108f26101b498c3059` |

**SH-CR01关闭：** strict decode在严格形状/normalize保真之后检查真实编辑字段的非空实质内容，不把ID、enum默认或全空行计为内容。六文本空/全空白、空CONCEPT/FACTION、LEVEL全空节点/路径均拒绝。source-copy显式空content和从空原文构造出的默认content同样走decode门，返回native:null＋warning，原text/facts不改。非空LEVEL description/rules可不造节点，已有真实节点可用，空WORLD中性容器仍是明确例外。此门只防空内容冒充业务映射，不声称判断文学解释正确性。

**SH-CR02关闭：** strict与confirmed的tropeKind缺失/空/UNKNOWN均拒绝，只有SATISFACTION/TEAR接受；source-copy未知不补默认enum，保留原字段/正文并返回未映射警示。NI-SEM05将有效TEAR的unset与另一有效角色edit放入同一包，断言整个函数拒绝且全部原对象deepEqual不变；不会先返回角色半包，再留下无效爽点产物。

上述正反例均加入原NI-SEM03/04/05内，仍五个顶层名称。主代理报告两批RED分别为缺少预期异常，并交付同名最终GREEN；独立没有回退生产重做RED。在最终hash下按本文件原精确命令仅运行一次：**退出0，5通过、0失败、0取消、0跳过，总时长约149.6毫秒**。没有运行其他NI/套件、静态编译或真实模型/DB/app/CUA；作者定向TypeScript零诊断沿其交付记录，本审核未独立执行该编译。

**最终：第一阶段语义纯helper独立代码审核通过，无剩余本范围必须修订项。** source-only全流程/警示展示、真实adapter阶段权限/空数组兼容、差量请求的完整预算、controller关联修订与两轮/全部字段复核、真实native发布均仍是后续接线任务。此次5绿不能关闭完整SEM04或21全部目标，不影响已冻结旧S01的失败/回执与后续真实新run验收。
