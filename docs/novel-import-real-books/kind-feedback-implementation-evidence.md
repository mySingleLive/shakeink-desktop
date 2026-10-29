# 51/52 唯一类别反馈实施证据

日期：2026-10-26。仅修改 `desktop/service/novel-import-ai.ts` 与既有 J01/02 文件。53 独立审核另行执行；没有操作应用 32557、C1、原件/journal、模型/Key/用户库、其它生产文件或测试。rev57 原始坏值未知，原 FAIL 保持，不把合成纠正当实际 world 质量通过。

## 最小变化

- 只在 semanticVersion1 普通 analyze、非 reconcile 范围，以 IMPORT_TARGETS 白名单取得唯一 request.kind；缺失/非法值固定报“当前分析目标类别无效”，不回显输入、不默认 world。runImportAi 在模型解析/生成前构造该请求 schema，最终用同一对象 parse；无效目标生成与模型解析计数均为 0。
- kind 改为字段级 literal，固定反馈为“kind必须为本次唯一目标 <白名单kind>，子类型不能放到kind”；origin 为 inferred literal。sourceUnitIds 在字段级保持非空和逐项成员约束，合法/非法混合仍拒绝。kind enum 外错误不再阻断其它字段自己的检查。
- 合法请求接受集合保持，不填值、强改 kind、规范化、去重或改 ID；中性 WORLD 空 text 仍可接受。legacy、其它阶段和 reconcile 返回原 schema 对象；原联合门、native/evidence/link/授权/取消晚门全保留。
- defaults 共用桥→真实 generateJSON 保持，schema 不序列化到远端；仍最多两次受控 generateText/一次既有纠正，无外层重试、prompt/预算/缓存/hash/工作单元变化。实际供应商内部次数和费用仍未知。

## 真实 TDD

在 50 冻结 service `3329c8c5…1dc05` 上仅新增原 J01/J02 内反例，实际 [RED](evidence/kind-feedback-tdd-red.txt) 0/2、873 ms：enum 外 kind 未得到唯一 world 反馈，缺省 request.kind 实际生成 1 次而要求 0。它是实施前真实执行，没有事后变异回放。

新增 world 反例经过生产实际共用桥、真实 generateJSON 和既有 generateText DI：enum 外合成秘密 kind、enum 内 scene、origin enum 外值、kind 与混合来源错误并发。首坏后好恰两次、首好一次、二次仍坏恰两次拒绝。纠正后缀要求准确字段路径和唯一 world/inferred，不包含 raw 坏值/单位或实体 ID/原文/URL/全类别 enum；反馈仍在既有 wrapper 预留内。组合坏字段也不获得通过信用。

J02 另验缺省、秘密值、body、大写目标、null、对象目标固定失败且零生成/解析；raw 绕过仍拒绝，合法重复 ID 不额外去重，输入/已有产物保持；全部既有晚门与兼容断言保留。本轮没有修改其它旧测试来适配结果。

## 最终限定执行

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

| 原始日志 | 结果 |
| --- | --- |
| [J01/02](evidence/kind-feedback-tdd-green.txt) | 2/2，0 skipped，exit 0，713 ms |
| [A03/A05/A06](evidence/kind-feedback-a03-a05-a06-green.txt) | 3/3，0 skipped，exit 0，210 ms |
| [SEM01–04](evidence/kind-feedback-sem01-04-green.txt) | 4/4，0 skipped，exit 0，238 ms |
| [必要类型检查](evidence/kind-feedback-typecheck.txt) | 当前 tsconfig/noEmit/incremental:false，两个 owned 文件 diagnostics 0 |

没有执行其它 suite、全文件/全仓、模型、DB、应用或构建。所有坏值/返回都是合成控制值，不保存真实 raw。

## 冻结 SHA-256

```text
f5a40da9ff693a1dd7e06b49d42375e6e509a8c0aa475c52885c223d54b90f4f  desktop/service/novel-import-ai.ts
ae6df2ab4089965fad4004127d5395ae402da61a33dc48f08f4d48a0d80bd9d8  tests/unit/novel-import-request-schema.test.ts
```

后续同 C1 正常关闭/新构建/重开/授权并从 world 恢复由主代理执行；先核对 12 个已成功产物、四类 coverage、正文/源 hash 保持，再做全十二目标与独立语义/发布/重开验收。此处不推断 rev57 实际坏值或唯一原因，不宣称真实修复成功。
