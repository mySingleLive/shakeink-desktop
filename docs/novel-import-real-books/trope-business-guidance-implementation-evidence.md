# 82/83 爽点与泪点业务指导实施证据

2026-10-26。81独立审核结束、79三文件冻结后，顺序修改payload及既有AI测试；独立代码审核由84执行。未访问实际run、应用、小说、journal、模型/Key或用户库，没有构建。旧trope整体notFound与文学FAIL保留，不因提示调整宣称已补出TEAR或修正43个已有产物。

两份真实只读基线位于 `/private/tmp/trope-business-82-baseline/`：payload `953d4a39701748dead1ee1e52e4a37306bc87f3d77fd012a0e0b58c499335298`、AI测试 `800a96245c22473cc83699711cbac74f173656308ab28eae903a28fce0e8eff8`。生产修改前独立保存 [8组无关目标/阶段prompt和payload哈希](evidence/trope-business-baseline-goldens.json)，literal写入新增A09作为期望，不由修改后的producer自证。

新增A09后取得 [干净真实RED](evidence/trope-business-baseline-red.txt)：A07/A08及A09的反向范围、旧字节和原权限门全部通过，只有实际runImportAi发送的独立业务合同缺失而失败。RED先于生产修改，没有fixture故障或事后变异。

生产只增加固定 `emotional-impact-contract` 及以下触发条件：普通semantic1 analyze仅kind trope；reconcile仅targetIds明确指向实际kind trope的artifact；review仅selectedTargets含trope。不因其它上下文、目录、自由指令或枚举词触发，普通非trope即使全选中含trope也不触发。legacy、classify、patch及无相关目标的其它路径逐字保持。

固定合同只解释共享业务“爽点/泪点”、SATISFACTION与TEAR的阅读情绪、两类分别核对、可定位原文和具体叙事作用。泪点不要求实际流泪、明确读者反应或商业类型惯例；阅读解释属于文学判断，保留可靠性和归属。普通分析仅在本次可核验来源内两类都无足够依据时沿用原notFound，不推导全书缺失或强造产物；review/reconcile仍禁止notFound并受投影、三元组、明确目标和锁边界约束。没有书名、人名、原句、审核正例或oracle答案进入固定段。

A09经真实runImportAi的合成DI接点覆盖普通分析、明确trope修订、已选trope审核及空上下文审核；小输入与长非BMP/转义输入下，验证业务段在不可信资料之外，完整source/payload、raw响应、signal和阶段角色不变。合成SATISFACTION/TEAR产物及原普通notFound仍接受，review/reconcile的notFound、错误投影遗漏、非目标或锁定字段修订仍拒绝。8组反向案例保护其它普通kind、非trope修订目标、审核其它/空/缺省目标、classify、patch和legacy真实基线字节。73指导、76唯一kind合同及原65536固定预留/16384 wrapper常量保持。

最后一次源码/测试修改后只执行批准的两条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234]:' tests/unit/novel-import-request-schema.test.ts
```

| 证据 | 最终结果 |
| --- | --- |
| [A07–09](evidence/trope-business-a07-a09-green.txt) | 12/12（3顶层、9子场景），exit0，0 skipped |
| [J01–04](evidence/trope-business-j01-j04-green.txt) | 14/14（4顶层、10子场景），exit0，0 skipped |
| [必要类型诊断](evidence/trope-business-typecheck.txt) | 当前tsconfig，noEmit、incremental:false；仅报告两个owned文件，diagnostics0 |
| [完整delta](evidence/trope-business-baseline-delta.diff) | SHA-256 `83a341798a332c38f97c490152c646dc4cc99246b72b829218d8e33060f5e7a8` |
| [反向逐字节核对及79控制SHA](evidence/trope-business-delta-verification.txt) | 移除唯一情绪合同/条件/串接后恢复payload真基线；旧AI测试含A07/A08为完整不变前缀，仅追加A09；79 main/service/J测试SHA均未动 |

冻结文件：

```text
239cac9bf2f40c7e1004ffb28cfc36ff834f98b549f6ae7326cfafb42187ab55  desktop/core/novel-import-ai-payload.ts
663097fb08265b6467aafc43223724b88287cfcc6c27342c84716206cf9c9903  tests/unit/novel-import-ai.test.ts
```

没有修改validator、schema、late gates、预算、重试、授权、工作流、发布或任何notFound持久信用。词面和合成DI仅证明合同接线与边界，真实整书审核能否纠正旧遗漏、独立文学质量、业务落库和重开仍由主代理另行验收。
