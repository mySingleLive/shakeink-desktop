# 76/77 唯一kind固定合同实施证据

2026-10-26。仅修改 `desktop/core/novel-import-ai-payload.ts` 与既有 `tests/unit/novel-import-ai.test.ts`；独立代码审核由78执行。没有访问实际S02、应用、来源、journal、模型/Key或用户库，没有构建。rev76实际坏值未知，不能据此猜测模型返回了中文或子类型；原真实失败仍保留。

两份真实只读基线位于 `/private/tmp/requested-kind-76-baseline/`：payload `49482e28232c89c8eb1276ed7c2b755e496d9b26607329cac9d5f34a07a5bb21`、AI测试 `9dd2d4c3f4304f64bbf275304cf7704915e575826053d3009e87a25a7a3e2ec0`。生产修改前独立记录 [8组旧分支prompt/payload及73指导哈希](evidence/requested-kind-baseline-goldens.json)，其literal作为A08期望，不由修改后的producer生成expected。

新增A08后，原生产精确命令取得 [干净真实RED](evidence/requested-kind-baseline-red.txt)：A07及A08的非法/缺省目标、旧分支保护均通过；实际runImportAi的outline固定输出合同缺少唯一JSON kind绑定而失败。该RED先于生产修改，没有事后变异回放或补造历史。

生产只新增IMPORT_TARGETS运行时导入、普通semantic1 analyze且非reconcile的白名单精确查找，以及固定phase-output-contract后缀。后缀以JSON字符串写出唯一artifact.kind和origin inferred，禁止翻译、缩写、改成子类型或复用上下文kind。原notFound空数组合同逐字保留。未知/缺省目标不拼接后缀、不默认、不新抛错，实际runImportAi仍在解析模型及生成前由原factory拒绝。

A08经真实runImportAi的DI生成接点，使用独立12目标列表，分别遍历短输入和长非BMP/转义输入。验证合同仅绑定本次kind，native说明仍可描述其它类别；完整source/payload、上下文、notFound响应、signal、text角色和请求原值保持，原65536固定预留及16384 wrapper常量未变。其它phase和legacy的实际prompt/payload与真实基线哈希相等，73指导哈希原样保持。非法/缺省值的独立helper合同不变，实际调用0resolve/0generate。合成notFound及词面合同通过不代表真实模型已服从或文学质量已通过。

最后一次源码/测试修改后仅执行批准的两条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[78]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123]:' tests/unit/novel-import-request-schema.test.ts
```

| 证据 | 最终结果 |
| --- | --- |
| [A07/A08](evidence/requested-kind-a07-a08-green.txt) | 8/8（2顶层、6子场景），exit0，0 skipped |
| [J01–03](evidence/requested-kind-j01-j03-green.txt) | 7/7（3顶层及J03的4子场景），exit0，0 skipped |
| [必要类型诊断](evidence/requested-kind-typecheck.txt) | 当前tsconfig，noEmit、incremental:false；仅报告两个owned文件，diagnostics0 |
| [完整delta](evidence/requested-kind-baseline-delta.diff) | SHA-256 `8b05e03a208d627bf1ebc6be5e11be3411d0cf1a739a091d4a27d9ae5879bc4a` |
| [反向逐字节核对](evidence/requested-kind-delta-verification.txt) | 移除唯一生产增量后完全恢复真实基线；旧AI测试含A07为完整不变前缀，仅追加A08 |

冻结文件：

```text
953d4a39701748dead1ee1e52e4a37306bc87f3d77fd012a0e0b58c499335298  desktop/core/novel-import-ai-payload.ts
800a96245c22473cc83699711cbac74f173656308ab28eae903a28fce0e8eff8  tests/unit/novel-import-ai.test.ts
```

serialization、73指导、预算、schema、anchor、晚门、重试、授权及main未改，已成功信用不清除。真实同草稿恢复、12产物/覆盖/正文/14章/预算保持、未完成物品及整书文学问题由主代理后续实际验收。
