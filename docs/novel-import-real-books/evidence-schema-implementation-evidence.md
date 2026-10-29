# 70/71 原文证据前置校验实施证据

2026-10-26。仅修改 `desktop/service/novel-import-ai.ts` 与既有 `tests/unit/novel-import-request-schema.test.ts`。独立代码审核由72执行；本记录不宣称真实S02或真实模型通过。未访问应用、实际来源、journal、用户库、模型/Key，也未构建。

真实基线只读副本位于 `/private/tmp/evidence-schema-70-baseline/`，分别为 service `312fe64bf374168f6ec33267006a5c64d7e8b934093a33f4ef57398cf9271cd6`、J测试 `29fa63a1a0b9746ebaa0dcc02a6a27e8acbcefd9193daade4880a6c5daf73868`。先增加J03和批准的J02证据断言适配，再执行原精确命令：[真实实施前RED](evidence/evidence-schema-j01-j03-red.txt) exit1，J01通过，J02及J03四子场景失败。实际生产生成桥直接接受不可定位引句，持续坏引句也未拒绝。这是原冻结生产上的行为失败，没有事后变异或补造时间顺序。

随后仅在 semanticVersion1 普通 analyze、非 reconcile 的请求绑定 schema，为每个 evidence entry 调用原 `anchorEvidence([entry], request.units)`。丢弃返回值；catch只产生固定安全 issue，路径为 `artifacts.N.evidence.N`，提示使用本次unitId的连续原文片段，禁止概述、拼接、补字。无原错误、原文、引句或ID回显。原helper、晚门、defaults共用桥、generateJSON一次纠正上限和其它phase/legacy逐字未变。最终 schema 仍只检查；排版引句由原晚门恢复精确原文。

J03经实际生产桥、真实generateJSON及既有generateText DI检查首坏后好2次、持续坏2次停止、首好1次；保护signal、模型/role/action、wrapper预留、请求和raw不可变。合成literal正反例逐项与原legacy晚门比较：精确短/重复引用保留，Han排版及含补充平面汉字的UTF-16回映射保留，不匹配、未知unit、短排版、歧义排版、Latin/digit词界、跨unit和非连续拼接继续拒绝。每个entry位置和并发kind/source错误分别报告。J02只分离批准的坏证据旧前提；native/link仍是schema通过、晚门拒绝，其余旧断言保持。

最后一次源码/测试修改后仅执行批准的两条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
```

| 证据 | 结果 |
| --- | --- |
| [J01–03 GREEN](evidence/evidence-schema-j01-j03-green.txt) | 7/7（3个顶层用例及J03的4个子场景），exit0，0 skipped |
| [A03/A05/A06 GREEN](evidence/evidence-schema-a03-a05-a06-green.txt) | 3/3，exit0，0 skipped |
| [必要类型诊断](evidence/evidence-schema-typecheck.txt) | 当前tsconfig，noEmit、incremental:false；仅报告两个owned文件，diagnostics0 |
| [完整真实基线delta](evidence/evidence-schema-baseline-delta.diff) | SHA-256 `705038529cf24c7835f4b904a08dc0dfd14520ab21bd4144437a8d0aeb00e838` |
| [反向逐字节核对](evidence/evidence-schema-delta-verification.txt) | 移除唯一生产增量、还原唯一批准J02适配并移除新增J03后，与两份真实基线完全相等 |

冻结文件：

```text
c88cf7f8941edcb4ab97449d244687f254db22aad5d1348404ef25a6d16d29c6  desktop/service/novel-import-ai.ts
e0ca570790a02f6f791f8e2fa2cc2fce72459e5e7d3e70f13121706747c87f88  tests/unit/novel-import-request-schema.test.ts
```

实际rev26失败保留。后续同S02恢复、来源/正文/14章/预算信用核对、真实大纲及全目标质量由主代理在独立代码审核与组合构建后验收，本轮合成DI不追加真实成功信用。
