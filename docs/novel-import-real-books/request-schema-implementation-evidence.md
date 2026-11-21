# 48/49 请求级响应 schema 实施证据

日期：2026-10-26。本轮只修改 AI service、新 J01/02 文件，以及主代理随后明确批准的 SEM04 classify 旧测试适配。50 独立代码审核另行执行。没有操作应用 47175、C1、原件/journal、模型/Key/用户配置/DB、main/core/prompt/gateway/UI；没有保存真实模型 raw 或增加遥测。

## 最小实现

`importAiResponseSchema(request)` 以既有 base 为基础，只在 semanticVersion1 普通 analyze、非 reconcile 时 superRefine 四项同义约束：artifact.kind 等于 request.kind，origin 为 inferred，sourceUnitIds 非空且每项均严格属于本次 units.id。混合合法+非法 ID 仍拒绝；不填字段、改 kind/ID、不去重、不推断替代来源。

新增 issue 只有 artifact 索引与固定字段路径及固定原因：`artifacts.<index>.kind/origin/sourceUnitIds`。消息不包含实际值、原文、URL、ID、异常或凭证；不构造动态 ID enum/list，不更改 prompt/预算。

生产 `defaults.generate` 的终态直接返回共用 `generateImportAiJson`；仍先按原逻辑解析实际模型、作者及授权上下文。桥内部用该请求 factory 调用真实 `src/lib/ai/generate.ts` 的 generateJSON，并返回 data。测试直接经过此共用桥，只注入 generateJSON 既有 generateText 依赖；同时 AST 检查实际 defaults.generate 的直接返回及桥内真实 generateJSON/factory 接线，未另造生产不用的 factory→generateJSON 路径。

没有修改 generateJSON；沿用最多两次 generateText、至多一次既有格式纠正。schema 只在本地 safeParse，不进入远端 response_format 或序列化载荷。生产配额/取消/用量路径保持；合成调用次数不代表供应商内部请求次数或费用。

runImportAi 在生成后同样使用该 factory 再 parse，随后仍保留原联合请求门，以及 native、证据锚定、typed 引用、阶段白名单、晚授权和取消门。legacy、classify/review/patch/reconcile 返回原 schema 对象和既有行为。

## 真实 TDD 及兼容适配

- [初始 RED](evidence/request-schema-tdd-initial-red.txt)：生产仍为 `803de671…2599`，0/2；共用桥/factory 尚不存在。
- 先作行为等价的桥抽取并实际接入 defaults/final parse，仍返回原静态 base，没有四项请求约束。[桥接后、约束实现前 RED](evidence/request-schema-bridge-base-tdd-red.txt) 0/2：真实 generateJSON 接受首个错误 kind，不进入既有纠正；纯 factory 也未拒绝。该记录是新增行为前的真实执行，不是实现后变异回放。
- 加 superRefine 后 [J01/02 GREEN](evidence/request-schema-tdd-green.txt)：2/2、0 skipped、exit 0，733 ms。覆盖 kind、origin、空来源、全越界和混合来源；首坏后好恰两次、首好一次、两次仍坏恰两次拒绝。纠正后缀含固定路径，不回显合成秘密/原值/单位或实体 ID/原文，且在既有 wrapper 预留内。合法 ID/text 保原，包括不新增去重；raw 绕过生成仍拒绝，native/evidence/link 晚门继续拒绝，取消和晚授权仍阻断。
- 首次 SEM01–04 [3/4 失败原始输出](evidence/request-schema-sem01-04-pre-adaptation-red.txt) 是旧循环对 classify 也要求 roleType/PLACE/WORLD/SETTING 与知识两线规则，和已通过 45/47 的独立来源用途分类契约矛盾，**不是本次 schema 新缺陷**。主代理明确批准后，只将该 classify 分支改验来源用途/完整单元/unknown/无 native；非 classify 两条原 native/知识断言逐字保留，全部阶段越权与其它断言保留。不往产品 classify 塞 native 规则。

## 最终限定命令

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

| 原始日志 | 结果 |
| --- | --- |
| [J01/02](evidence/request-schema-tdd-green.txt) | 2/2，0 skipped，exit 0，733 ms |
| [A03/A05/A06](evidence/request-schema-a03-a05-a06-green.txt) | 3/3，0 skipped，exit 0，257 ms |
| [SEM01–04](evidence/request-schema-sem01-04-green.txt) | 4/4，0 skipped，exit 0，423 ms |
| [必要静态检查](evidence/request-schema-typecheck.txt) | 当前 tsconfig、noEmit/incremental:false，三个 owned 文件 diagnostics 0 |

未执行全文件/全仓、SEM session、RT、分类、PDF、browser、打包或其它 suite，没有构建/真实模型/数据库操作。全部响应是合成控制值，真实 generateJSON 的 generateText 被依赖注入，未调用真实生成。

## 最终冻结 SHA-256

```text
3329c8c51d5a017c7eef184e1ab5c0b3d34d1fe5ad4f326359d4da94d8d1dc05  desktop/service/novel-import-ai.ts
dff93ef7aad8d61b3cddc339f591c8f666303d913e1f59af4fbbb0cfc1a4a644  tests/unit/novel-import-request-schema.test.ts
96a4d55ada73949086511752ffd2645dcaa990b144be218e0e251a6d3cb1adc8  tests/unit/novel-import-semantic.test.ts
```

rev32 原始失败响应未保存，仍不能认定坏字段或唯一原因；原失败记录不改变。本轮不宣称已有四项产物语义正确、真实场景修复、全十二目标或整本验收通过。独审/新构建及同 C1 原目标恢复由主代理执行，并另行核对已有大纲/角色完整对象、覆盖与正文/原件 hash 不变。
