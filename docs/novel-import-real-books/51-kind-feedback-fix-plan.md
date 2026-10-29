# 世界观类别纠正反馈的窄修复与限定用例

日期：2026-10-26。状态：待52独立技术/用例审核，未编码，未再次重试世界观。

## 实际失败与机制

C1请求schema修复后，真实scene3项/item5项均覆盖3/3通过，原大纲/角色4项逐项保留。随后rev57世界观普通analyze失败：`模型返回结构不完整（artifacts.0.kind…artifacts.5.kind）`。外部不可覆盖`world-kind-failure-checkpoint-rev57.json` SHA=`e916ab9df0c91e29511edf497f8c13d95de9cac6a8a022b0e4937859f677d4a7`；四类成功覆盖与12产物保留，world0，正文2723/b636不变，未发布。

没有失败raw值，不能推测实际是WORLD/SETTING或其他值。可静态确认：当前base.kind是所有target枚举；枚举外值产生不可继续的Zod issue时，对象级superRefine不会执行；枚举内但非目标值只得到“必须匹配本次分析目标”泛提示。两条路径都未稳定给出本请求的唯一合法类别，现有最多一次纠正对world已实际未成功。此机制是可修缺口，不宣称已证明实际坏值/唯一原因。

## 最小实现

仅修改`desktop/service/novel-import-ai.ts`和既有`tests/unit/novel-import-request-schema.test.ts`，不改prompt/main/core/分类缓存/网关/预算/模型/UI/解析/发布和其他测试。

- 仅newsem1普通analyze先以IMPORT_TARGETS白名单确认request.kind。缺失/非法目标固定安全失败，不插入原输入到literal/消息，不默认world；请求入口在调用生成前构造schema，避免无效目标仍调用模型。其它phase/reconcile/legacy原行为不变。
- 当前四项同义约束改为字段级schema：artifact.kind用白名单结果的z.literal，并给固定模板“kind必须为本次唯一目标 <已知kind>，子类型不能放到kind”；origin为literal inferred及固定提示；sourceUnitIds非空、每个字符串均在本请求units.id集合中（包括合法+非法混合）。它们仍是同一接受集合，不补值、不规范化/去重/改ID、不擅自将结果强转world。字段级检查也能在kind错误时报告其它字段自己的问题；没报告某条错误不等于该条已通过，最终必须全部校验。
- 所有新增issue路径只含固定字段名/数组索引，消息只含固定文字及白名单目标；不回显raw坏值、ID、正文、凭证或全类别enum/动态ID列表。WORLD/SETTING、PLACE等只可作为固定说明的字段层级示例，不假定它们就是rev57的实际返回。
- defaults实际共用桥→真实generateJSON→既有一次格式纠正上限保持；生成后同schema再parse、139以及native/evidence/link/模型授权/取消等晚门全部保留。请求前schema构造无IO/无持久化，不改任何scope/plan/semantic hash或工作单元。
- 通过review后在同C1正常退出/构建/重开、记录新构建、重新授权原目录并从world恢复。先对12成功artifact/覆盖/正文逐项保留做证据，再执行原十二目标及质量/发布/重开。rev57FAIL保留，真实纠正内部次数/费用继续未知；不靠无限重抽通过。

## 限定TDD与直接保护

沿用J01/J02内部增补，不新增suite/编号：

- world请求分别以枚举外合成秘密kind、枚举内合法但非目标scene为首次坏结果，经过生产同桥+真实generateJSON/既有generateText DI，反馈包含唯一world和artifacts.0.kind，且不含原值/ID/全枚举；改好后恰2次成功。
- origin枚举外坏值也明确只接受inferred；首好1次、两次坏恰2次拒绝；source空/越界/混合仍拒绝且不去重合法ID。kind错误与来源错误同现也不能获得任何通过信用。
- 非法/缺失request.kind固定安全失败、无数据回显、不默认world、无生成；raw绕过仍拒绝，全部晚门及legacy/其它phase行为不变。输入/已有产物不改，固定feedback仍符合原预算。

只运行同49批准的三条精确命令，禁止全仓/目录suite：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

先对当前50冻结版增补反例并保留真实RED，再最小实现GREEN、独立code review；必要类型/构建另记。合成提示纠正通过不证明真实world质量，必须完成同原件/当前模型实际恢复后独立审核。
