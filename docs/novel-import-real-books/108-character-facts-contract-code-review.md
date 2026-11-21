# 角色facts字符串编码：独立代码审核

2026-10-27。**PASS，无P1/P2。** 绑定106/107限定范围；未改生产/测试，未操作真实app、M01、模型、DB、原件或journal。

| 最终交付（执行前后均匹配） | SHA-256 |
| --- | --- |
| desktop/core/novel-import-ai-payload.ts | `4cdd2e4e1461c209b7ef60d491584910393c5e11870a92ae685ac1347bf38c59` |
| tests/unit/novel-import-ai.test.ts | `1bb78bd1f79d4f00bf32640f5f223036d464b38b6fc1aa1626aed22219f688e6` |
| desktop/service/novel-import-ai.ts | `c1bc6dc62d7b40180287c98f5ebb940e7499d1812cc59277b286a59a6f109c4d` |
| tests/unit/novel-import-request-schema.test.ts | `2dc40c44b7b539286f8a4cff348aba653928b2f6a39abab94a2382bacfaa32fa` |

完整真实基线比对：payload只新增普通sem1/analyze/character且非reconcile的固定编码段/拼接，独立逆删即整份恢复`87b9c0c1…855d6`。白名单来自原常量，例子不含作品答案，明确不能清空有据资料；不可信正文/指令仍仅在原数据封套。原native/指导及其它段不变，九个无关完整prompt/payload真实事前hash与新增测试字面完全相等。

service相对真实`3dba02c5…f7a94`只有第28行facts value z.string在character下选择固定中文error；其它全部字节严格相同，包括key schema、完整响应shape、strict/optional、知识/证据/kind/origin/source refine、105 mapper、defaults桥、全部helper和晚门。仍是z.string，没有coerce/transform/默认值或模型值stringify；原__proto__ record行为和未知字符串key的晚门保留。main/generic generate/semantics/core四项控制SHA不变。

独立仅执行批准命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A(?:07|08|09|10|11):' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1-9]:' tests/unit/novel-import-request-schema.test.ts
```

最终**A07–11 19/19；J01–09 43/43；均exit0、fail0、skip0、cancel0**。独占日志分别为`evidence/character-facts-contract-independent-a07-a11-final.txt`（SHA `075cc4f7…95687`）和`evidence/character-facts-contract-independent-j01-j09.txt`（SHA `50289c44…64471`）。完整命令、SHA和历史见`evidence/character-facts-contract-independent-review.json`。

A11真实runImportAi捕获新增合同，验证唯一正触发/反上下文、封套和输入保留、旧指导hash、多字节/非BMP大输入及原65536/16384字节预留，没有为文案增预算。J09经生产桥→真实generateJSON/Zod→runImportAi，对数组/对象/数字/布尔/null检查固定反馈，首坏后好2次、两次仍坏即停、首好1次；信号/role和JSON文本内空白/引号/原值完整保留。合法字符串、空串、可选缺省及顶层shape保持，非法knowledge/source/native/外键不能靠编码通过，晚门没有变成早放行。

旧A07–10完整66756字节前缀SHA仍`401630f0…d2d28`，旧J01–08完整85732字节前缀仍`e0ce2d2f…39404`。A11原payload87b9干净RED为17/19，新合同后19/19；J09原service3dba干净RED为37/43，固定error后43/43。后者可能已配新payload，只记service分包RED，不冒称整体旧组合。审中主代理发现新增A11 cases的maxUnits类型推断错误，仅补`ImportAiRequest[]`上下文；逆除注解恢复整a71749测试，原历史保留。本审核因此只重跑短A，J沿用同2dc40独立43/43信用；未扩suite/另跑构建或类型检查。

这只证明通用合同澄清、安全反馈及接受集保持；不证明rev29/41实际坏值或根因，也不代表真实角色/场景或整书通过。后续同稿一次授权新合同重测、全目标、文学QA和持久化仍待主代理后验，失败历史和来源入口PASS保留。
