# 阶段输出协议窄修复：方案与用例独立审核

日期：2026-10-26（Asia/Shanghai）。审核者：`real_books_test_review`。审核对象：`06-protocol-fix-plan.md`、03新增`RB-REG01`、当前`desktop/service/novel-import-ai.ts`及既有`tests/unit/novel-import-ai.test.ts`。方案阶段只读，未运行产品、模型或测试；后续代码审核仅执行下方获准的两项协议回归，未修改生产代码。

**方案及新增用例要求审核通过，可进入NI-A05失败用例与TDD实现。** 本结论不代表源码已实现、协议测试已通过，或真实S01阻断已经解决。

当前证据证明S01非分类阶段返回触发`result.classifications`检查；原始返回形态未留存，不能断言初次一定为空数组。现有schema允许可选classifications数组，JavaScript的空数组为真，故允许空数组作为无操作有明确兼容意义。继续拒绝非空越权分类、只在错误中报告条目数，不会授权模型修改已确认来源；不能把正文、证据、引用或实体检查一并放宽。阶段专属输出字段提示应收窄当前统一提示带来的歧义，仍保留不可信资料边界、正文只读、来源定位与各类引用契约。

NI-A05应将03的断言具体化为以下子情形，避免仅证明analyze空数组可用就宣称全部phase覆盖：

| 情形 | 必须断言 |
| --- | --- |
| analyze/review/patch携带`classifications:[]` | 各自其他必要结果合法时接受；空数组没有修改来源分类的含义 |
| 非classify携带非空classifications | 仍拒绝；错误只含说明/实际条目数，不泄露小说片段、模型原回复或Key |
| classify阶段 | 仍要求每个输入unitId恰好一次；不能因“允许空”而允许非空输入得到空分类 |
| 每个phase的提示 | 本阶段输出字段明确，不能仍要求统一返回其他阶段字段；必要正文/证据/引用约束保留 |
| 既有证据/引用反例 | NI-A03仍拒绝伪造quote、外部角色/事件和无效章节引用 |

测试范围限明确名称`NI-A03`及`NI-A05`，不扩为全文件、全浏览器或全仓回归。合成协议结果仅证明边界，不计真实小说导入。授权核验没有拟变更，无须为了本窄改扩大到真实模型或其他作品读取。

要求保留先红证据、窄实现后绿证据、独立code review与构建身份。然后正常退出/重开，沿同S01源hash/目标/session检查点真实继续；记录新构建及后续真实返回，保留原失败。即使两个协议用例通过，十二目标、逐条语义与引用、发布和持久化仍须真实结果独立复审。

## 首轮源码独立审核

**首轮源码暂不通过：CR-RB01需修订（后续复审已关闭，见末节）。** 独立运行限定命令exit0，实际2 tests / 2 pass / 0 fail / 0 skip，仅NI-A03和NI-A05；没有运行整个文件或全仓。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='NI-A0[35]:' tests/unit/novel-import-ai.test.ts
```

空`classifications`数组接受、非空数组带数量拒绝、阶段专属顶层输出字段和现有证据/引用校验符合方案。NI-A05实际覆盖analyze/review/patch空数组接受，各1/2条非空分类拒绝，以及classify的完整覆盖与越权实体拒绝。

**CR-RB01：共用实体ID约束被随两线shape规则一起收窄。** `desktop/service/novel-import-ai.ts:57`的referenceContract除了worldline/narrative专属facts规则，还包含“所有实体id必须全局唯一，已存在的同一实体沿用目录id，不能沿用其他不同实体id”。第59行现在只对worldline/narrative analyze附加整段，导致character、scene、item及其他设定分析失去原有的跨批身份提示；两项测试通过没有覆盖这一点。该通用规则应移回共用分析提示，保留只有两线需要的shape规则定向附加。不能因正在修复协议空字段而退化人物等目标的实体身份约束。

NI-A05应补断言普通analyze完整提示保留共用ID规则、同时不要求worldline/narrative专属shape。classify的提示合同也应实际捕获并核对，目前仅验证了classify返回与覆盖行为，未核对该阶段提示。仍只需在同NI-A05内补齐，修订后复跑明确NI-A03/05并独立复审，不增加其他测试范围。

本轮未运行真实S01，也未据协议单测宣称真实导入通过。

## 修订后最终源码复审

**源码独立审核通过，CR-RB01关闭，可构建并恢复同S01检查点做真实重测。** 共用提示第56行恢复全局唯一/同一实体沿用目录ID/不同实体不可复用ID约束；第57行只保留两线shape与其引用说明，第59行仍仅在相应analyze目标附加。证据逐字、来源单元、实体/章节/事件引用、正文补丁边界及生成前后模型授权核验保持原有要求。没有发现本次窄改的其他阻断问题。

NI-A05已补普通阶段完整提示含共用ID约束、无worldline专属shape的断言，并实际捕获classify合同，只允许该阶段classification字段。独立再次执行同一限定命令：exit0，实际2 tests / 2 pass / 0 fail / 0 skip，仅NI-A03/05，duration 275.610166ms。未执行其他测试。

复审文件SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `8dfc0b12604d4d80b0295f35acdb655ee986f6b63798e120dbba6de116b2f064` |
| `tests/unit/novel-import-ai.test.ts` | `30966241f041f04dda21e6fb1c1151181d2aebc267f05d43032810dbf0b42207` |

本结论允许主代理继续构建、正常关闭/重开并沿原S01源hash/目标/session重测；不代表最初模型返回一定为空数组，也不代表真实S01已经恢复或十二目标通过。新运行须保留失败记录和构建身份，产物另行逐条独立审核。
