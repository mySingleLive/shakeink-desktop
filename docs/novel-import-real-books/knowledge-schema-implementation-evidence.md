# 54/55 知识字段前置校验实施证据

日期：2026-10-26。仅修改 service AI、main controller 和既有 J01/J02 文件；独立代码审核由 56 执行。没有操作应用 9809、C1、模型/Key、用户库、journal、来源、UI或构建。真实 theme 失败的原始原因未知，未排除网络，旧 FAIL 保留。

## 最小实现

仅 semanticVersion1 普通 analyze、非 reconcile 的请求绑定 schema 增加 facts 字段校验，复用现有 core 四值：客观事实、角色有限事实、人物推测、可能不可靠。普通 kind 可省略 reliability；提供的空值/未知值拒绝；worldline/narrative 必须明确提供；有效非客观值的 attribution.trim() 必须非空。trim 仅用于判断，不更改 attribution、temporalScope 或其它合法事实，不添加默认客观事实。issues 仅使用固定 facts 字段路径和四值说明，不回显输入。kind/source 并发错误仍全部拒绝。

defaults 共用桥→真实 generateJSON、最多一次格式纠正、最终同 schema 解析以及原 native/evidence/link/授权/取消晚门保持。legacy、其它阶段、reconcile、source-copy、prompt、预算、hash、工作单元和发布均未改。main.safeError 仅为三个完整静态知识错误添加精确安全映射，原前缀和长度规则逐字保留；近似值、秘密后缀、非 Error 对象无新增信用。

## 真实 RED → GREEN

先保留三个 53 冻结原文的只读副本于 `/private/tmp/novel-import-knowledge-54-baseline/`，再仅添加 J01/J02 反例。生产未修改时实际执行 [RED](evidence/knowledge-schema-j01-j02-red.txt)：0/2、exit 1。J01 的实际生产桥接受未知 reliability，未进入纠正；J02 隔离调用实际 controller 原型 safeError，精确知识错误仍为通用失败。这是实施前行为失败，没有事后变异。

新增子场景仅经真实生产桥、真实 generateJSON 的既有 generateText DI：未知/空可靠性、缺失/空白归属、两线缺可靠性，首坏后好 2 次、二次仍坏 2 次拒绝、首好 1 次；固定反馈无合成秘密、ID、原文或 URL，仍在既有预留内。合法省略、客观无需归属、三非客观以及原空白字符串均逐字保留。raw 绕过、混合 kind/source/knowledge 错误及原晚门断言保留。safeError 用 Object.create(实际 prototype) 调用，无构造、initialize、worker、IO 或产品测试 hook。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

| 原始日志 | 最终结果 |
| --- | --- |
| [J01/J02](evidence/knowledge-schema-j01-j02-green.txt) | 2/2，0 skipped，exit 0 |
| [A03/A05/A06](evidence/knowledge-schema-a03-a05-a06-green.txt) | 3/3，0 skipped，exit 0 |
| [SEM01–04](evidence/knowledge-schema-sem01-sem04-green.txt) | 4/4，0 skipped，exit 0 |
| [必要静态诊断](evidence/knowledge-schema-typecheck.txt) | 当前 tsconfig、noEmit、incremental:false，三个 owned 文件 diagnostics 0，exit 0 |

首次静态检查仅报新增表驱动 fixture 的可选联合字段不满足 Record<string,string>，[原日志](evidence/knowledge-schema-typecheck-fixture-red.txt) 保留；改为显式数组类型后重跑原 J01/J02 与静态检查通过，未放宽产品类型。未执行其它测试或全量测试；所有生成内容均为合成 DI，未调用真实供应商。

## 冻结 SHA-256

```text
816982eca792a4e3a6c2de0e87e1c646ef2442056456cda68285cd04b79de446  desktop/service/novel-import-ai.ts
05a4d5d59484a4b46e09b3a66317ea1e1c623080673b2a161e8d471272b453a0  desktop/main/novel-import.ts
29fa63a1a0b9746ebaa0dcc02a6a27e8acbcefd9193daade4880a6c5daf73868  tests/unit/novel-import-request-schema.test.ts
```

真实 C1 的 14 个成功产物、既有覆盖与正文/来源身份由主代理后续在组合构建及正常 UI 恢复时核对；本轮没有读取它们或给真实主题、全目标、发布/重开验收追加成功信用。
