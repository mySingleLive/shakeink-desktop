# 73/74 证据与叙述归属指导实施证据

2026-10-26。仅修改 `desktop/core/novel-import-ai-payload.ts` 与既有 `tests/unit/novel-import-ai.test.ts`；独立代码审核由75执行。本轮没有访问实际小说、应用、journal、用户库、模型/Key，也没有构建。不将词面合同和合成DI通过记作真实文学质量通过。

真实只读基线保存在 `/private/tmp/evidence-attribution-73-baseline/`：payload `8edd5629d1f5153d00a5b4c0bfd90dd0bddcad29b7409f5b9546869ed6cb2d98`、AI测试 `12e208f117202d6cfade828e5cabb65f2f65fe8df256491c15564eea89cf34e6`。生产修改前还独立记录了 [8组旧阶段prompt/payload哈希](evidence/evidence-attribution-baseline-goldens.json)，将其literal写入A07，未用修改后的producer自验expected。

先新增A07并执行批准命令。[首轮混合RED](evidence/evidence-attribution-a03-a07-red.txt) 包含真实指导缺失及新增fixture空patch撞原晚门两项；后者只改为断言既有拒绝，不能记为生产缺陷。[修fixture后RED](evidence/evidence-attribution-a03-a07-red-fixture-corrected.txt) 保留；按主代理要求另以wx保存 [干净基线RED](evidence/evidence-attribution-baseline-red.txt)，生产仍为原8edd SHA，只有实际runImportAi发送的固定指导缺失导致失败。所有RED均为实施前真实执行，没有变异回放或补造历史。

最小生产增量只有semantic analyze（含reconcile）和review的固定指导字符串及串接：同一unit内较短连续引文、优先10–30而非硬门、逐条自核与换行转义；叙述层、说话者/观察者/被描述者及时间/信息归属；有实质作用的框架人物/转述者/关键被提及者、未定结尾与未到访地点原则。reviewProjection范围和定向修订/锁定限制继续保留。新增段无具体书名、人物、源句或oracle答案，位于不可信数据封套之外。

A07通过实际runImportAi依赖接点捕获prompt，用合成资料覆盖普通分析、reconcile、review的小输入与长非BMP/引号/反斜杠/控制字符输入。验证完整payload的独立字面结构、原文/units/自由指令、响应、signal和text/review角色不变；3字符精确短证据仍通过。8组legacy及semantic classify/patch提示和序列化逐字哈希保持；空patch仍由原晚门拒绝。真实投影缺损、错误遗漏哈希、改作者锁定正文及非目标修订继续拒绝。65536固定预留、16384 JSON wrapper常量和全部预算门保持。

最后一次源码/测试修改后只执行批准的三条精准命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[3567]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J03:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

| 证据 | 最终结果 |
| --- | --- |
| [A03/A05/A06/A07](evidence/evidence-attribution-a03-a07-green.txt) | 7/7（4顶层及A07的3子场景），exit0，0 skipped |
| [J03](evidence/evidence-attribution-j03-green.txt) | 5/5（1顶层及4子场景），exit0，0 skipped |
| [SEM04](evidence/evidence-attribution-sem04-green.txt) | 1/1，exit0，0 skipped |
| [必要类型诊断](evidence/evidence-attribution-typecheck.txt) | 当前tsconfig，noEmit、incremental:false；仅报告两个owned文件，diagnostics0 |
| [完整delta](evidence/evidence-attribution-baseline-delta.diff) | SHA-256 `cb704651d54322ce955718a4acad8dbb06b08938f6aed3b6beb0302e97b8a10c` |
| [反向逐字节核对](evidence/evidence-attribution-delta-verification.txt) | 删除唯一条件指导和串接后生产完全等于真实基线；旧测试是当前文件的完整不变前缀，仅追加A07 |

冻结文件：

```text
49482e28232c89c8eb1276ed7c2b755e496d9b26607329cac9d5f34a07a5bb21  desktop/core/novel-import-ai-payload.ts
9dd2d4c3f4304f64bbf275304cf7704915e575826053d3009e87a25a7a3e2ec0  tests/unit/novel-import-ai.test.ts
```

原证据schema、anchor/layout helper、全部晚门、main、模型权限、重试及网关未改。提示调整不修改已成功产物或清除检查点；真实物品、后续目标、文学问题及同S02恢复后的信用/正文/14章核对由主代理后续实际验收，原rev58失败仍保留。
