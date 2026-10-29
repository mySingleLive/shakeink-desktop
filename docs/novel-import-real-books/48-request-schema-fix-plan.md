# 场景阶段非法返回的请求约束前置方案与限定用例

日期：2026-10-26。状态：待49独立技术/用例审核，未编码、未重试真实模型。

## 真实失败与已知边界

S01-C1 rev32在场景普通analyze阶段失败：`模型结果含无效实体或来源单元`。完整失败检查点独占保留在外部`scene-failure-checkpoint-rev32.json`（SHA`33a49745d9e149d77e1759e4f55f97092efe296d19c083d4db345af566e0dc32`）。已完成大纲1项/角色3项、各3单元覆盖，scene信用0，正文2723字符/b636保持。尚未发布，也未证明四项产物的文学语义正确。

没有保存原始失败模型返回，不能断言实际坏的是哪一字段。已知service第139行联合拒绝目标kind不符、origin非inferred、sourceUnitIds为空/越界等情况；不能把它归因为后续另门的PLACE/父级/证据错误。当前defaults.generate的静态semanticSchema允许多种kind/origin及任意/空来源ID，所以这些请求约束只能在generateJSON之后拒绝，无法进入已存在的一次结构纠正。

## 最小实现

只修改`desktop/service/novel-import-ai.ts`并新增`tests/unit/novel-import-request-schema.test.ts`。无main/core/prompt/预算/分类缓存/解析/发布/UI/网关/模型配置/schema迁移变更；不保存raw响应或扩遥测。

1. 提供本请求的响应schema纯factory：以现有schema为基础，**仅semanticVersion1、phase=analyze、非reconcile**添加同义superRefine。每项artifact必须kind等于当前request.kind、origin=inferred、sourceUnitIds至少1且每项逐字属于本次units.id。只读输入，不填字段、不改ID、不推断正确kind、不接受伪来源、不修改正文。
2. Zod issues只用固定字段路径（artifact索引及固定字段名）和固定原因文字，不回显模型值、unit/entity ID、正文、URL、error或凭证。每条消息遵守现有feedback上限；不引入动态ID enum列表或额外源文prompt。其它新阶段/reconcile和无版本legacy复用原schema行为。
3. defaults.generate必须真正使用此schema调用现有generateJSON；生成后runImportAi仍使用同一规则解析，并保留第139行及native/evidence/links/授权/取消等全部后门。可提取该文件内小型共用生成桥：defaults实际调用它，它内部只把request-bound schema交给真实generateJSON；测试仅通过generateJSON既有generateText依赖参数注入受控文本生成。该桥不是新IPC/网络入口，不接受renderer指定schema/传输，不改变真实模型解析/授权。
4. 不改`src/lib/ai/generate.ts`。沿用现有最多两次generateText（至多一次格式纠正），每次真实运行仍走原配额/取消/用量路径；不新增外层重试，不重复写业务产物。两次仍坏必须失败、不给进度/产物信用；固定prompt预留仍按现有wrapper预算核验。未暴露的供应商次数/费用仍未知。
5. 通过独立review后正常退出/构建/重开同C1，记录新构建身份并重新授权原目标。通过现有失败恢复UI仅补未完成阶段；大纲/角色的已有覆盖与完整artifact对象逐项相等，正文/hash和原件不变。rev32失败永远保留；同源真实重测仍需完整十二目标/质量/发布/重开，不能由合成绿色替代。

## 限定TDD用例

| 名称 | 必须验证 |
| --- | --- |
| `NI-J01: request-bound import schema reuses the bounded JSON correction bridge` | 经defaults实际采用的同一生成桥+真实generateJSON+受控generateText。分别kind错误、origin错误、空sourceIDs、越界sourceIDs首坏后好恰两次；首好一次；二次仍坏恰两次且拒绝。固定反馈有正确字段路径/约束但无合成秘密/模型原值/ID/正文，prompt不扩大不加ID列表。核对defaults真实接线，不可只在测试手工factory→generateJSON并遗漏production bridge；合成次数不宣称真实供应商次数 |
| `NI-J02: request-bound import schema preserves strict validation and compatibility` | runImportAi受控raw绕过生成时四类坏结果仍拒绝，输入/既有artifacts不变；有效结果不重写kind/sourceIds/原文；late native/evidence/link门继续拒绝；legacy与classify/review/patch/reconcile原接受/拒绝行为不变。取消及模型授权守卫仍在；无用户Key/配置/DB/实际模型 |

仅运行新两名及直接保护项（不得全仓/目录suite）：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

先真实RED再最小实现GREEN，必要typecheck/build另记，之后独立code review。SEM01–04直接覆盖此新schema所影响的普通analyze各类native目标/证据；不重跑SEM会话、RT、分类、PDF、browser或其他suite。真实C1后续若再失败须如实保留和定位，不把此改动说成已证明rev32唯一原因或整本通过。
